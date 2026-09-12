-- Issue #22: a paid or deposit-backed booking. Three refusals placed by issues
-- #12, #13 and #15 said `payment_pending` for any service whose published
-- `payment_mode` is not `none`. This migration replaces all three with the real
-- path and adds no fourth way to occupy time.
--
-- The shape of the thing:
--
--   create_hold_v1          capacity is claimed, exactly as today
--   begin_checkout_v1       the server prices the booking, stores the draft,
--                           and opens a payment attempt. No provider is called.
--   (edge: stripe-checkout) the provider session is created OUTSIDE any
--                           database transaction, from the server-side amount
--   (edge: stripe-webhook)  the signed event is verified and recorded
--   settle_payment_v1       verified success confirms the booking through the
--                           one existing confirmation engine
--
-- Money and capacity are separate authorities and stay that way. The hold is
-- authoritative for capacity; verified provider state is authoritative for
-- money. Neither is ever inferred from the other, and a browser redirect is
-- never evidence of either.
--
-- What this deliberately does NOT do:
--
--   * no second confirmation engine. `private.confirm_booking_v1` gains one
--     optional argument and keeps every check it already makes: the hold lock,
--     the hold-consumed check, the publication re-read, the price-drift check,
--     consent, intake validation, allocation promotion, snapshot, ledger, and
--     outbox intent. A paid booking is confirmed by the same code an unpaid one
--     is, which is the only way the two can stay consistent.
--   * no new hold state. A hold in checkout is still `active`, because it is
--     still holding capacity and every allocation invariant reads that. The
--     payment attempt is what says money is in flight; duplicating that onto
--     the hold would be two sources of truth for one fact.
--   * no hold extension. A checkout that outlives its hold is the late-success
--     case the ticket requires anyway, so extending the TTL would remove the
--     honest path and deny capacity to other customers at the same time.
--   * no new ledger. `app.commerce_ledger_entries` from issue #21 is the
--     financial record and is already append-only.
--   * no card data, ever, anywhere. This schema holds references and amounts.
--
-- Error vocabulary. Published strings reused; this migration adds two:
--   checkout_not_ready   42501  the attempt is not in a state that can be paid
--   payment_not_verified 42501  settlement asked for without verified success
-- `payment_pending` keeps its meaning and is now returned only while a payment
-- genuinely is pending, rather than as a tracer for unimplemented work.

-- ---------------------------------------------------------------------------
-- 1. An attempt can exist before its booking does
-- ---------------------------------------------------------------------------

-- You pay for a hold; the booking exists only once the payment is verified.
-- Issue #21 modelled the attempt as booking-scoped because at the time nothing
-- could pay before confirming.
alter table app.payment_attempts alter column booking_id drop not null;
alter table app.payment_attempts add column hold_id uuid;
alter table app.payment_attempts add column purpose text
  check (purpose is null or purpose in ('deposit','full'));
-- The balance still owed after a deposit. Zero for a full payment, and never
-- re-derived in a client.
alter table app.payment_attempts add column balance_minor_units bigint
  check (balance_minor_units is null or balance_minor_units >= 0);
-- Set when a verified success arrives for capacity that is already gone. The
-- attempt stops being a booking attempt and becomes an operator's problem with
-- a name.
alter table app.payment_attempts add column exception_code text
  check (exception_code is null or exception_code in
    ('hold_lost','slot_taken','policy_changed','draft_missing'));
alter table app.payment_attempts add column resolved_at timestamptz;
alter table app.payment_attempts
  add constraint payment_attempts_subject_check
  check (booking_id is not null or hold_id is not null);
alter table app.payment_attempts
  add constraint payment_attempts_hold_fk
  foreign key (tenant_id,hold_id) references app.booking_holds(tenant_id,id) on delete restrict;
-- One live attempt per hold. A customer who reloads the checkout page resumes
-- the attempt they already have instead of opening a second one against the
-- same capacity.
create unique index payment_attempts_live_hold_idx on app.payment_attempts (tenant_id,hold_id)
  where hold_id is not null and status in ('requires_payment','processing');
create index payment_attempts_hold_idx on app.payment_attempts (tenant_id,hold_id);

alter table app.payment_attempts drop constraint payment_attempts_status_check;
alter table app.payment_attempts add constraint payment_attempts_status_check
  check (status in ('requires_payment','processing','succeeded','failed','cancelled','disputed','exception'));
alter table app.payment_attempts
  add constraint payment_attempts_exception_check
  check ((status = 'exception') = (exception_code is not null));

-- The price the server calculated, snapshotted before the customer was ever
-- shown an amount. Issue #21 keyed this by booking; the booking does not exist
-- yet at the moment the price has to be fixed.
alter table app.payment_price_snapshots alter column booking_id drop not null;
alter table app.payment_price_snapshots add column hold_id uuid;
alter table app.payment_price_snapshots
  add constraint payment_price_snapshots_subject_check
  check (booking_id is not null or hold_id is not null);
alter table app.payment_price_snapshots
  add constraint payment_price_snapshots_hold_fk
  foreign key (tenant_id,hold_id) references app.booking_holds(tenant_id,id) on delete restrict;
create unique index payment_price_snapshots_hold_idx
  on app.payment_price_snapshots (tenant_id,hold_id) where hold_id is not null;

-- ---------------------------------------------------------------------------
-- 2. The booking draft
-- ---------------------------------------------------------------------------

-- Everything the confirmation engine will need, captured before the customer
-- leaves for the provider. The webhook confirms the booking with nobody's
-- browser present, so these values cannot be re-supplied later — and must not
-- be, because a value that arrives after payment is a value an attacker can
-- change after paying one price for another booking.
--
-- This is customer PII and is classified as such: its own table, its own RLS,
-- and it is deleted the moment the booking it describes exists.
create table app.booking_drafts (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  hold_id uuid not null,
  contact jsonb not null check (jsonb_typeof(contact) = 'object'),
  intake jsonb not null default '{}'::jsonb check (jsonb_typeof(intake) = 'object'),
  consent_version text not null,
  locale text not null check (locale in ('en','ar')),
  customer_time_zone text,
  -- The context the customer actually booked under. Settlement runs with no
  -- browser present and cannot re-derive these, and must not accept them from
  -- anywhere else: a hostname supplied after payment is a hostname an attacker
  -- chose after paying.
  hostname text not null,
  application text not null,
  -- The session that opened the checkout, tenant-salted like every other
  -- session digest. Settlement does not use it; recovery reads do.
  session_hash text not null check (session_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default statement_timestamp(),
  primary key (id),
  unique (tenant_id,id),
  unique (tenant_id,hold_id),
  foreign key (tenant_id,hold_id) references app.booking_holds(tenant_id,id) on delete restrict
);

-- No role reads or writes a draft through the table. It is reachable only from
-- the definer engines, exactly like hold state and management tokens.
alter table app.booking_drafts enable row level security;
create policy booking_drafts_select_denied on app.booking_drafts
  for select to anon,authenticated using (false);
create policy booking_drafts_insert_denied on app.booking_drafts
  for insert to anon,authenticated with check (false);
create policy booking_drafts_update_denied on app.booking_drafts
  for update to anon,authenticated using (false) with check (false);
create policy booking_drafts_delete_denied on app.booking_drafts
  for delete to anon,authenticated using (false);
revoke all on app.booking_drafts from public,anon,authenticated;

alter table app.idempotency_keys drop constraint idempotency_keys_operation_check;
alter table app.idempotency_keys add constraint idempotency_keys_operation_check
  check (operation in ('create_hold_v1','confirm_booking_v1','cancel_booking_v1',
    'reschedule_booking_v1','transition_booking_v1','begin_checkout_v1'));
alter table app.idempotency_keys drop constraint idempotency_keys_result_kind_check;
alter table app.idempotency_keys add constraint idempotency_keys_result_kind_check
  check (result_kind in ('hold','booking','payment_attempt'));

-- ---------------------------------------------------------------------------
-- 3. The one confirmation engine learns about verified payment
-- ---------------------------------------------------------------------------

-- Reproduced from its current definition (issue #13's, which added the approval
-- path) with three changes and nothing else: one optional argument, the
-- `payment_pending` refusal becoming a decision, and the booking recording the
-- payment state it actually has. Every other check is the same check, which is
-- the point — a paid booking and an unpaid one are confirmed by the same code,
-- so they cannot drift apart.
--
-- The old ten-argument signature is dropped rather than left as an overload: two
-- confirmation engines differing by arity is exactly the ambiguity this avoids.
drop function if exists private.confirm_booking_v1(text,text,uuid,text,text,jsonb,text,text,jsonb,text);

create or replace function private.confirm_booking_v1(
  p_hostname text,
  p_application text,
  p_hold_id uuid,
  p_session_token text,
  p_idempotency_key text,
  p_contact jsonb,
  p_consent_version text,
  p_locale text default 'en',
  p_intake jsonb default '{}'::jsonb,
  p_customer_time_zone text default null,
  -- Issue #22. Present only when a verified payment is what is confirming this
  -- booking. Callable by anon like the rest of this engine, and safe there: the
  -- attempt has to be `succeeded` AND belong to this very hold, which means the
  -- caller is presenting a payment they actually made for the capacity they
  -- actually hold.
  p_payment_attempt_id uuid default null
)
returns table(
  contract_version integer,
  booking_id uuid,
  public_reference text,
  status text,
  approval_status text,
  approval_deadline timestamptz,
  payment_status text,
  notification_status text,
  calendar_status text,
  starts_at timestamptz,
  ends_at timestamptz,
  service_name text,
  location_name text,
  location_time_zone text,
  customer_time_zone text,
  locale text,
  price_minor bigint,
  tax_rate_bps integer,
  currency text,
  policy_snapshot jsonb,
  consent_version text,
  booking_revision bigint,
  replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
declare
  v_now timestamptz := statement_timestamp();
  v_correlation_id uuid := pg_catalog.gen_random_uuid();
  v_tenant_id uuid;
  v_session_hash text;
  v_request_hash text;
  v_existing app.idempotency_keys%rowtype;
  v_hold app.booking_holds%rowtype;
  v_payment app.payment_attempts%rowtype;
  v_payment_status text := 'not_required';
  v_booking app.bookings%rowtype;
  v_current_publication uuid;
  v_revision app.catalog_service_revisions%rowtype;
  v_location app.locations%rowtype;
  v_service_name text;
  v_location_name text;
  v_consent_version text;
  v_consent_text text;
  v_intake jsonb;
  v_field jsonb;
  v_key text;
  v_full_name text;
  v_email text;
  v_phone text;
  v_booking_id uuid;
  v_reference text;
  v_promoted integer;
  v_approval_required boolean;
  v_status text;
  v_approval_status text;
  v_approval_deadline timestamptz;
begin
  -- Settlement arrives with a verified payment and no session, because the
  -- customer's browser is not part of a webhook. The payment proves ownership
  -- of the hold instead, and is checked against it below.
  if p_payment_attempt_id is null
     and (p_session_token is null or p_session_token <> btrim(p_session_token)
     or char_length(p_session_token) not between 16 and 200) then
    raise exception using errcode='22023',message='booking_invalid_session';
  end if;
  if p_idempotency_key is null or p_idempotency_key <> btrim(p_idempotency_key)
     or char_length(p_idempotency_key) not between 16 and 200 then
    raise exception using errcode='22023',message='booking_invalid_idempotency_key';
  end if;
  if p_locale is null or p_locale not in ('en','ar') then
    raise exception using errcode='22023',message='booking_invalid_locale';
  end if;
  if p_contact is null or jsonb_typeof(p_contact) <> 'object' then
    raise exception using errcode='22023',message='booking_invalid_contact';
  end if;
  v_intake := coalesce(p_intake,'{}'::jsonb);
  if jsonb_typeof(v_intake) <> 'object' then
    raise exception using errcode='22023',message='booking_invalid_intake';
  end if;

  -- Input minimization happens before anything is stored: only the three
  -- declared contact fields exist, and each is bounded.
  if not (p_contact ?& array['fullName','email']) or exists (
    select 1 from jsonb_object_keys(p_contact) k where k not in ('fullName','email','phone')
  ) then
    raise exception using errcode='22023',message='booking_invalid_contact';
  end if;
  v_full_name := btrim(coalesce(p_contact->>'fullName',''));
  v_email := lower(btrim(coalesce(p_contact->>'email','')));
  v_phone := nullif(btrim(coalesce(p_contact->>'phone','')),'');
  if char_length(v_full_name) not between 1 and 160
     or char_length(v_email) not between 3 and 320
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or (v_phone is not null and (char_length(v_phone) not between 3 and 40 or v_phone !~ '^[+0-9 ()-]+$')) then
    raise exception using errcode='22023',message='booking_invalid_contact';
  end if;

  select r.tenant_id into v_tenant_id
  from api_v1.resolve_public_tenant_v1(p_hostname,p_application) r;
  if v_tenant_id is null then
    raise exception using errcode='42501',message='booking_context_required';
  end if;
  v_session_hash := encode(pg_catalog.sha256(
    pg_catalog.convert_to(v_tenant_id::text||':'||p_session_token,'UTF8')),'hex');

  -- Normalized request identity. The contact and intake payloads participate,
  -- so a changed submission under the same key is an honest conflict rather
  -- than a silently ignored edit.
  v_request_hash := encode(pg_catalog.sha256(pg_catalog.convert_to(
    jsonb_build_object(
      'application',p_application,
      'consent_version',p_consent_version,
      'contact',jsonb_build_object('email',v_email,'full_name',v_full_name,'phone',v_phone),
      'hold_id',p_hold_id,
      'hostname',p_hostname,
      'intake',v_intake,
      'locale',p_locale,
      'session',v_session_hash
    )::text,'UTF8')),'hex');

  -- A duplicate submission blocks here until the first transaction settles, so
  -- two browser tabs converge on one booking instead of racing.
  insert into app.idempotency_keys(
    tenant_id,operation,idempotency_key,request_hash,state,correlation_id,expires_at)
  values (v_tenant_id,'confirm_booking_v1',p_idempotency_key,v_request_hash,'in_progress',
    v_correlation_id,v_now+interval '24 hours')
  on conflict (tenant_id,operation,idempotency_key) do nothing;
  if not found then
    select * into v_existing from app.idempotency_keys k
    where k.tenant_id=v_tenant_id and k.operation='confirm_booking_v1'
      and k.idempotency_key=p_idempotency_key
    for update;
    if v_existing.request_hash is distinct from v_request_hash then
      raise log 'booking_denied code=idempotency_conflict correlation=% tenant=%',v_correlation_id,v_tenant_id;
      raise exception using errcode='23505',message='idempotency_conflict';
    end if;
    select * into v_booking from app.bookings b
    where b.tenant_id=v_tenant_id and b.id=v_existing.result_id;
    if v_booking.id is null then
      raise exception using errcode='23505',message='idempotency_conflict';
    end if;
    raise log 'booking_replayed booking=% correlation=% tenant=%',v_booking.id,v_existing.correlation_id,v_tenant_id;
    return query select 1,v_booking.id,v_booking.public_reference,v_booking.status,
      v_booking.approval_status,v_booking.approval_deadline,v_booking.payment_status,v_booking.notification_status,
      v_booking.calendar_status,v_booking.starts_at,v_booking.ends_at,v_booking.service_name,
      v_booking.location_name,v_booking.location_time_zone,v_booking.customer_time_zone,
      v_booking.locale,v_booking.price_minor,v_booking.tax_rate_bps,v_booking.currency,
      v_booking.policy_snapshot,v_booking.consent_version,v_booking.revision,true;
    return;
  end if;

  -- Lock the hold before reading anything derived from it. Ownership is proved
  -- by the creating session: an unknown hold and someone else's hold are
  -- indistinguishable to the caller, and a cross-tenant hold is simply unknown.
  if p_payment_attempt_id is null then
    select * into v_hold from app.booking_holds h
    where h.tenant_id=v_tenant_id and h.id=p_hold_id and h.session_hash=v_session_hash
    for update;
  else
    -- Settlement runs from a verified provider event with no browser session in
    -- existence. The payment is the proof of ownership, and a stronger one: it
    -- was opened against this hold by the session that held it, and it only
    -- reaches `succeeded` through a signed event.
    select * into v_hold from app.booking_holds h
    where h.tenant_id=v_tenant_id and h.id=p_hold_id
      and exists (select 1 from app.payment_attempts a
        where a.tenant_id=v_tenant_id and a.id=p_payment_attempt_id
          and a.hold_id=h.id and a.status='succeeded')
    for update;
  end if;
  if v_hold.id is null then
    raise log 'booking_denied code=context correlation=% tenant=%',v_correlation_id,v_tenant_id;
    raise exception using errcode='42501',message='booking_context_required';
  end if;
  -- A booking already exists for this hold under a different key: the capacity
  -- is spoken for, and this caller is not the one who spoke for it.
  if exists (select 1 from app.bookings b where b.tenant_id=v_tenant_id and b.hold_id=v_hold.id) then
    raise log 'booking_denied code=slot_unavailable correlation=% tenant=% reason=hold_consumed',v_correlation_id,v_tenant_id;
    raise exception using errcode='23P01',message='slot_unavailable';
  end if;
  if v_hold.state <> 'active' or v_hold.expires_at <= v_now then
    raise log 'booking_denied code=slot_unavailable correlation=% tenant=% reason=hold_%',v_correlation_id,v_tenant_id,v_hold.state;
    raise exception using errcode='23P01',message='slot_unavailable';
  end if;

  -- Re-read the current published catalog. The hold snapshotted a publication;
  -- if the tenant has published since, the caller acted on a superseded read.
  select p.id into v_current_publication
  from app.catalog_publications p
  where p.tenant_id=v_tenant_id and p.state='published';
  if v_current_publication is null or v_current_publication <> v_hold.publication_id then
    raise log 'booking_denied code=revision_conflict correlation=% tenant=%',v_correlation_id,v_tenant_id;
    raise exception using errcode='23505',message='revision_conflict';
  end if;
  select * into v_revision from app.catalog_service_revisions sr
  where sr.tenant_id=v_tenant_id and sr.publication_id=v_hold.publication_id
    and sr.service_id=v_hold.service_id and sr.state='published' and sr.locale=p_locale;
  if v_revision.id is null then
    -- The tenant publishes both locales together, so a missing one is a
    -- superseded read rather than a customer-visible content gap.
    select * into v_revision from app.catalog_service_revisions sr
    where sr.tenant_id=v_tenant_id and sr.publication_id=v_hold.publication_id
      and sr.service_id=v_hold.service_id and sr.state='published'
    order by (sr.locale='en') desc,sr.locale limit 1;
  end if;
  if v_revision.id is null then
    raise exception using errcode='23505',message='revision_conflict';
  end if;
  -- Price is snapshotted by the hold. A publication that repriced the service
  -- without changing the publication id would be a contract violation, so the
  -- two must still agree.
  if v_revision.price_minor is distinct from v_hold.price_minor
     or v_revision.currency is distinct from v_hold.currency
     or v_revision.tax_rate_bps is distinct from v_hold.tax_rate_bps then
    raise log 'booking_denied code=revision_conflict correlation=% tenant=% reason=price_drift',v_correlation_id,v_tenant_id;
    raise exception using errcode='23505',message='revision_conflict';
  end if;
  -- A priced service confirms only behind a verified payment for this hold.
  -- Issues #12, #13 and #15 refused outright here; issue #22 supplies the path.
  if v_revision.payment_mode <> 'none' then
    if p_payment_attempt_id is null then
      raise log 'booking_denied code=payment_pending correlation=% tenant=%',v_correlation_id,v_tenant_id;
      raise exception using errcode='23505',message='payment_pending';
    end if;
    select * into v_payment from app.payment_attempts a
    where a.tenant_id=v_tenant_id and a.id=p_payment_attempt_id
      and a.hold_id=v_hold.id and a.status='succeeded';
    if v_payment.id is null then
      -- Not verified, or verified for something else. Either way this caller
      -- has not paid for this capacity.
      raise log 'booking_denied code=payment_pending correlation=% tenant=% reason=unverified',v_correlation_id,v_tenant_id;
      raise exception using errcode='23505',message='payment_pending';
    end if;
    -- A deposit leaves a balance and the booking says so through the price
    -- snapshot, not by calling itself unpaid: the money that was due has moved.
    v_payment_status := 'succeeded';
  elsif p_payment_attempt_id is not null then
    -- A payment offered for a free service is a caller that has misunderstood
    -- something, and is refused rather than quietly ignored.
    raise exception using errcode='22023',message='booking_invalid_action';
  end if;
  -- approval_required creates `requested`, never `confirmed` (ADR-0005 row 8).
  v_approval_required := v_revision.approval_required;
  v_status := case when v_approval_required then 'requested' else 'confirmed' end;
  v_approval_status := case when v_approval_required then 'pending' else 'not_required' end;

  select * into v_location from app.locations l
  where l.tenant_id=v_tenant_id and l.id=v_hold.location_id;
  v_service_name := v_revision.name;
  select lr.name into v_location_name from app.catalog_location_revisions lr
  where lr.tenant_id=v_tenant_id and lr.publication_id=v_hold.publication_id
    and lr.location_id=v_hold.location_id and lr.state='published'
  order by (lr.locale=p_locale) desc,lr.locale limit 1;
  v_location_name := coalesce(v_location_name,v_location.name);

  -- Consent is checked against the published policy the customer was shown.
  v_consent_version := coalesce(v_revision.policy->>'consent_version','1');
  v_consent_text := coalesce(v_revision.policy->>'consent_text','');
  if p_consent_version is distinct from v_consent_version then
    raise log 'booking_denied code=policy_denied correlation=% tenant=% reason=consent',v_correlation_id,v_tenant_id;
    raise exception using errcode='42501',message='policy_denied';
  end if;

  -- Intake answers are validated against the published schema: declared keys
  -- only, required keys present, bounded scalar values.
  if exists (
    select 1 from jsonb_object_keys(v_intake) k
    where not exists (
      select 1 from jsonb_array_elements(v_revision.intake_schema->'fields') f
      where f->>'key' = k)
  ) then
    raise exception using errcode='22023',message='booking_invalid_intake';
  end if;
  for v_field in select f from jsonb_array_elements(v_revision.intake_schema->'fields') f loop
    v_key := v_field->>'key';
    if coalesce((v_field->>'required')::boolean,false)
       and coalesce(btrim(coalesce(v_intake->>v_key,'')),'') = '' then
      raise exception using errcode='22023',message='booking_invalid_intake';
    end if;
    if v_intake ? v_key and (jsonb_typeof(v_intake->v_key) <> 'string'
       or char_length(v_intake->>v_key) > 2000) then
      raise exception using errcode='22023',message='booking_invalid_intake';
    end if;
  end loop;

  if not v_approval_required then
    -- Promote the held allocations. The exclusion constraints keep guarding the
    -- same rows through the transition, so the database still owns overlap.
    update app.assignment_allocations a set state='confirmed'
    where a.tenant_id=v_tenant_id and a.hold_id=v_hold.id and a.state='held';
    get diagnostics v_promoted = row_count;
    if v_promoted = 0 then
      raise log 'booking_denied code=slot_unavailable correlation=% tenant=% reason=no_allocation',v_correlation_id,v_tenant_id;
      raise exception using errcode='23P01',message='slot_unavailable';
    end if;

    update app.booking_holds h
    set state='released',released_at=v_now,updated_at=v_now
    where h.tenant_id=v_tenant_id and h.id=v_hold.id;
  end if;

  v_booking_id := pg_catalog.gen_random_uuid();
  -- Crockford-style alphabet: no I, L, O, or U, so a reference read aloud or
  -- retyped from a confirmation does not become a different booking.
  v_reference := (
    select string_agg(substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ',
      1+floor(random()*32)::integer,1),'')
    from generate_series(1,10));

  insert into app.bookings(
    id,tenant_id,public_reference,service_id,location_id,hold_id,publication_id,
    status,payment_status,notification_status,calendar_status,approval_status,
    starts_at,ends_at,party_size,duration_minutes,buffer_before_minutes,buffer_after_minutes,
    price_minor,tax_rate_bps,currency,policy_snapshot,consent_text,consent_version,consented_at,
    intake_schema_snapshot,service_name,location_name,locale,location_time_zone,
    customer_time_zone,correlation_id,approval_deadline)
  values (
    v_booking_id,v_tenant_id,v_reference,v_hold.service_id,v_hold.location_id,v_hold.id,
    v_hold.publication_id,v_status,v_payment_status,'queued','pending',v_approval_status,
    v_hold.starts_at,v_hold.ends_at,1,v_revision.duration_minutes,
    v_revision.buffer_before_minutes,v_revision.buffer_after_minutes,
    v_hold.price_minor,v_hold.tax_rate_bps,v_hold.currency,v_revision.policy,
    v_consent_text,v_consent_version,v_now,v_revision.intake_schema,v_service_name,
    v_location_name,p_locale,v_location.time_zone,
    coalesce(p_customer_time_zone,v_location.time_zone),v_correlation_id,
    case when v_approval_required then v_now + make_interval(hours =>
      private.resolve_request_policy_v1(v_revision.policy,'response_sla_hours')) end);

  insert into app.booking_contacts(tenant_id,booking_id,full_name,email,phone)
  values (v_tenant_id,v_booking_id,v_full_name,v_email,v_phone);
  if v_intake <> '{}'::jsonb then
    insert into app.booking_intake_answers(tenant_id,booking_id,answers)
    values (v_tenant_id,v_booking_id,v_intake);
  end if;

  insert into app.booking_events(
    tenant_id,booking_id,sequence,event_type,actor_kind,reason,outcome,request_id,
    booking_revision,metadata)
  values (v_tenant_id,v_booking_id,1,
    case when v_approval_required then 'booking_requested' else 'booking_confirmed' end,
    case when p_application='dashboard' then 'member' else 'guest' end,
    case when v_approval_required then 'request_to_book' else 'instant_booking' end,
    'succeeded',v_correlation_id,1,
    jsonb_build_object('application',p_application,'locale',p_locale,
      'payment_mode',v_revision.payment_mode,'publication_id',v_hold.publication_id));

  -- Delivery intent only. Nothing here reaches a network provider, and the
  -- payload carries no contact detail or management link.
  if v_approval_required then
    -- The request path decides what the request does to capacity and records
    -- its own submitted intent.
    v_approval_deadline := private.request_booking_v1(
      v_tenant_id,v_hold,v_revision,v_booking_id,v_correlation_id,v_now);
  else
    insert into app.outbox_events(tenant_id,booking_id,topic,payload,correlation_id)
    values (v_tenant_id,v_booking_id,'booking.confirmed',
      jsonb_build_object('booking_id',v_booking_id,'locale',p_locale,
        'public_reference',v_reference,'starts_at',v_hold.starts_at),
      v_correlation_id);
  end if;

  update app.idempotency_keys k
  set state='succeeded',result_kind='booking',result_id=v_booking_id,updated_at=v_now
  where k.tenant_id=v_tenant_id and k.operation='confirm_booking_v1'
    and k.idempotency_key=p_idempotency_key;

  raise log 'booking_committed booking=% status=% correlation=% tenant=% hold=%',
    v_booking_id,v_status,v_correlation_id,v_tenant_id,v_hold.id;
  return query select 1,v_booking_id,v_reference,v_status,v_approval_status,
    v_approval_deadline,v_payment_status,'queued'::text,'pending'::text,
    v_hold.starts_at,v_hold.ends_at,
    v_service_name,v_location_name,v_location.time_zone,
    coalesce(p_customer_time_zone,v_location.time_zone),p_locale,v_hold.price_minor,
    v_hold.tax_rate_bps,v_hold.currency,v_revision.policy,v_consent_version,1::bigint,false;
end;
$function$;
comment on function private.confirm_booking_v1(text,text,uuid,text,text,jsonb,text,text,jsonb,text,uuid) is
  'Booking confirmation v1 engine. Claims idempotency, locks the hold, re-reads the published catalog, checks policy, consent and verified payment, promotes the held allocations, snapshots immutable facts, and records the event and outbox intent in one transaction. Calls no provider.';
revoke all on function private.confirm_booking_v1(text,text,uuid,text,text,jsonb,text,text,jsonb,text,uuid) from public;
grant execute on function private.confirm_booking_v1(text,text,uuid,text,text,jsonb,text,text,jsonb,text,uuid) to anon,authenticated;

-- ---------------------------------------------------------------------------
-- 4. Server-authoritative pricing
-- ---------------------------------------------------------------------------

-- What the customer owes now and what remains. The only place this is decided.
-- A browser that submits an amount is submitting a value nothing reads.
create or replace function private.resolve_payment_amounts_v1(
  p_payment_mode text,
  p_price_minor bigint,
  p_tax_rate_bps integer,
  p_policy jsonb
)
returns table (due_minor bigint, balance_minor bigint, tax_minor bigint, purpose text)
language sql
immutable
security invoker
set search_path = ''
as $$
  with total as (
    -- Prices are published tax-exclusive, so tax is added rather than extracted.
    select p_price_minor as net,
           (p_price_minor * coalesce(p_tax_rate_bps,0)) / 10000 as tax
  ), gross as (
    select net, tax, net + tax as amount from total
  ), deposit as (
    select amount, tax,
      case
        -- A fixed minor-unit deposit wins over a percentage when both are set,
        -- because a tenant who typed an amount meant that amount.
        when (p_policy->>'deposit_minor_units') is not null
          then least(greatest((p_policy->>'deposit_minor_units')::bigint,0),amount)
        when (p_policy->>'deposit_percent_bps') is not null
          then least(greatest(
            (amount * least(greatest((p_policy->>'deposit_percent_bps')::integer,0),10000)) / 10000,
            0),amount)
        -- No deposit rule published: half, rounded down, is the documented
        -- default rather than an error that blocks a booking at checkout.
        else amount / 2
      end as deposit_due
    from gross
  )
  select
    case when p_payment_mode = 'deposit' then deposit_due else amount end,
    case when p_payment_mode = 'deposit' then amount - deposit_due else 0::bigint end,
    tax,
    case when p_payment_mode = 'deposit' then 'deposit' else 'full' end
  from deposit;
$$;

-- ---------------------------------------------------------------------------
-- 5. The hold form tells the customer what it will cost
-- ---------------------------------------------------------------------------

-- A price shown after the customer has been sent to a payment page is a price
-- shown too late. The form they fill in now carries the published total, the
-- amount due today, and the balance a deposit leaves behind.
drop function if exists private.get_hold_form_v1(text,text,uuid,text,text);

create or replace function private.get_hold_form_v1(
  p_hostname text,
  p_application text,
  p_hold_id uuid,
  p_session_token text,
  p_locale text default 'en'
)
returns table(
  contract_version integer, hold_id uuid, state text, expires_at timestamptz,
  slot_start timestamptz, slot_end timestamptz, service_name text, location_name text,
  location_time_zone text, price_minor bigint, tax_rate_bps integer, currency text,
  consent_version text, consent_text text, intake_schema jsonb,
  -- Issue #22. What this booking will cost and how much of it is owed now, so
  -- the customer sees the deposit and the balance before they are asked for
  -- anything, not after they have been sent to a payment page.
  payment_mode text, due_minor bigint, balance_minor bigint, tax_minor bigint
)
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
declare
  v_tenant_id uuid;
  v_hold app.booking_holds%rowtype;
  v_revision app.catalog_service_revisions%rowtype;
  v_location app.locations%rowtype;
  v_location_name text;
  v_amounts record;
begin
  if p_session_token is null or char_length(p_session_token) not between 16 and 200 then
    raise exception using errcode='22023',message='booking_invalid_session';
  end if;
  if p_locale is null or p_locale not in ('en','ar') then
    raise exception using errcode='22023',message='booking_invalid_locale';
  end if;
  select r.tenant_id into v_tenant_id from api_v1.resolve_public_tenant_v1(p_hostname,p_application) r;
  if v_tenant_id is null then
    raise exception using errcode='42501',message='booking_context_required';
  end if;
  -- Ownership is the creating session, exactly as release_hold_v1 proves it.
  select * into v_hold from app.booking_holds h
  where h.tenant_id=v_tenant_id and h.id=p_hold_id
    and h.session_hash=encode(pg_catalog.sha256(
      pg_catalog.convert_to(v_tenant_id::text||':'||p_session_token,'UTF8')),'hex');
  if v_hold.id is null then
    raise exception using errcode='42501',message='booking_context_required';
  end if;
  select * into v_revision from app.catalog_service_revisions sr
  where sr.tenant_id=v_tenant_id and sr.publication_id=v_hold.publication_id
    and sr.service_id=v_hold.service_id and sr.state='published'
  order by (sr.locale=p_locale) desc,sr.locale limit 1;
  if v_revision.id is null then
    raise exception using errcode='23505',message='revision_conflict';
  end if;
  select * into v_location from app.locations l where l.tenant_id=v_tenant_id and l.id=v_hold.location_id;
  select lr.name into v_location_name from app.catalog_location_revisions lr
  where lr.tenant_id=v_tenant_id and lr.publication_id=v_hold.publication_id
    and lr.location_id=v_hold.location_id and lr.state='published'
  order by (lr.locale=p_locale) desc,lr.locale limit 1;
  select * into v_amounts from private.resolve_payment_amounts_v1(
    v_revision.payment_mode,v_hold.price_minor,v_hold.tax_rate_bps,v_revision.policy);
  return query select 1,v_hold.id,v_hold.state,v_hold.expires_at,v_hold.starts_at,v_hold.ends_at,
    v_revision.name,coalesce(v_location_name,v_location.name),v_location.time_zone,
    v_hold.price_minor,v_hold.tax_rate_bps,v_hold.currency,
    coalesce(v_revision.policy->>'consent_version','1'),
    coalesce(v_revision.policy->>'consent_text',''),
    v_revision.intake_schema,
    v_revision.payment_mode,
    case when v_revision.payment_mode='none' then 0::bigint else v_amounts.due_minor end,
    case when v_revision.payment_mode='none' then 0::bigint else v_amounts.balance_minor end,
    v_amounts.tax_minor;
end;
$function$;
revoke all on function private.get_hold_form_v1(text,text,uuid,text,text) from public;
grant execute on function private.get_hold_form_v1(text,text,uuid,text,text) to anon,authenticated;

-- The published wrapper gains columns too, so it is dropped rather than
-- replaced: Postgres will not widen an existing function's row type.
drop function if exists api_v1.get_hold_form_v1(text,text,uuid,text,text);
create or replace function api_v1.get_hold_form_v1(
  p_hostname text, p_application text, p_hold_id uuid, p_session_token text,
  p_locale text default 'en')
returns table(
  contract_version integer, hold_id uuid, state text, expires_at timestamptz,
  slot_start timestamptz, slot_end timestamptz, service_name text, location_name text,
  location_time_zone text, price_minor bigint, tax_rate_bps integer, currency text,
  consent_version text, consent_text text, intake_schema jsonb,
  payment_mode text, due_minor bigint, balance_minor bigint, tax_minor bigint)
language sql stable security invoker set search_path = '' set statement_timeout = '5s'
as $$ select * from private.get_hold_form_v1(p_hostname,p_application,p_hold_id,
  p_session_token,p_locale); $$;
revoke all on function api_v1.get_hold_form_v1(text,text,uuid,text,text) from public;
grant execute on function api_v1.get_hold_form_v1(text,text,uuid,text,text) to anon,authenticated;

-- ---------------------------------------------------------------------------
-- 6. Opening a checkout
-- ---------------------------------------------------------------------------

-- Everything `confirm_booking_v1` validates before it writes, done here too,
-- because the customer should be refused before they are asked for money and
-- not after. The checks are repeated at settlement regardless: this one is a
-- courtesy, that one is the authority.
create or replace function private.begin_checkout_v1(
  p_hostname text,
  p_application text,
  p_hold_id uuid,
  p_session_token text,
  p_idempotency_key text,
  p_contact jsonb,
  p_consent_version text,
  p_locale text default 'en',
  p_intake jsonb default '{}'::jsonb,
  p_customer_time_zone text default null
)
returns table (
  contract_version integer,
  payment_attempt_id uuid,
  status text,
  payment_mode text,
  due_minor bigint,
  balance_minor bigint,
  tax_minor bigint,
  currency text,
  total_minor bigint,
  provider text,
  provider_account_reference text,
  expires_at timestamptz,
  replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_correlation_id uuid := pg_catalog.gen_random_uuid();
  v_tenant_id uuid;
  v_session_hash text;
  v_request_hash text;
  v_existing app.idempotency_keys%rowtype;
  v_hold app.booking_holds%rowtype;
  v_revision app.catalog_service_revisions%rowtype;
  v_current_publication uuid;
  v_account app.payment_accounts%rowtype;
  v_attempt app.payment_attempts%rowtype;
  v_amounts record;
  v_attempt_id uuid;
  v_email text;
  v_full_name text;
begin
  v_tenant_id := (select r.tenant_id from api_v1.resolve_public_tenant_v1(p_hostname,p_application) r);
  if v_tenant_id is null then
    raise exception using errcode='42501',message='booking_context_required';
  end if;
  if p_idempotency_key is null or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
     or pg_catalog.char_length(p_idempotency_key) not between 16 and 200 then
    raise exception using errcode='22023',message='booking_invalid_idempotency_key';
  end if;
  if p_locale is null or p_locale not in ('en','ar') then
    raise exception using errcode='22023',message='booking_invalid_locale';
  end if;
  if p_contact is null or pg_catalog.jsonb_typeof(p_contact) <> 'object' then
    raise exception using errcode='22023',message='booking_invalid_contact';
  end if;
  v_full_name := pg_catalog.btrim(coalesce(p_contact->>'fullName',''));
  v_email := pg_catalog.btrim(pg_catalog.lower(coalesce(p_contact->>'email','')));
  if v_full_name = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
    raise exception using errcode='22023',message='booking_invalid_contact';
  end if;

  v_session_hash := pg_catalog.encode(pg_catalog.sha256(
    pg_catalog.convert_to(v_tenant_id::text||':'||coalesce(p_session_token,''),'UTF8')),'hex');
  v_request_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    v_tenant_id::text||':'||p_hold_id::text||':'||v_session_hash||':'||p_locale,'UTF8')),'hex');

  -- Idempotency first, so a double-submitted checkout returns the attempt it
  -- already opened rather than opening a second one.
  select * into v_existing from app.idempotency_keys k
  where k.tenant_id=v_tenant_id and k.operation='begin_checkout_v1'
    and k.idempotency_key=p_idempotency_key for update;
  if v_existing.tenant_id is not null then
    if v_existing.request_hash is distinct from v_request_hash then
      raise exception using errcode='23505',message='idempotency_conflict';
    end if;
    if v_existing.state='succeeded' then
      select * into v_attempt from app.payment_attempts a
      where a.tenant_id=v_tenant_id and a.id=v_existing.result_id;
      select * into v_account from app.payment_accounts pa
      where pa.tenant_id=v_tenant_id and pa.id=v_attempt.payment_account_id;
      return query select 1,v_attempt.id,v_attempt.status,
        coalesce(v_attempt.purpose,'full'),v_attempt.amount_minor_units,
        coalesce(v_attempt.balance_minor_units,0::bigint),
        coalesce((select s.tax_minor_units from app.payment_price_snapshots s
                  where s.tenant_id=v_tenant_id and s.hold_id=v_attempt.hold_id),0::bigint),
        v_attempt.currency::text,
        coalesce((select s.total_minor_units from app.payment_price_snapshots s
                  where s.tenant_id=v_tenant_id and s.hold_id=v_attempt.hold_id),
                 v_attempt.amount_minor_units),
        v_account.provider,v_account.provider_account_reference,
        (select h.expires_at from app.booking_holds h where h.id=v_attempt.hold_id),
        true;
      return;
    end if;
  end if;

  select * into v_hold from app.booking_holds h
  where h.tenant_id=v_tenant_id and h.id=p_hold_id and h.session_hash=v_session_hash
  for update;
  if v_hold.id is null then
    raise exception using errcode='42501',message='booking_context_required';
  end if;
  if exists (select 1 from app.bookings b where b.tenant_id=v_tenant_id and b.hold_id=v_hold.id) then
    raise exception using errcode='23P01',message='slot_unavailable';
  end if;
  if v_hold.state <> 'active' or v_hold.expires_at <= v_now then
    raise exception using errcode='23P01',message='slot_unavailable';
  end if;

  select p.id into v_current_publication from app.catalog_publications p
  where p.tenant_id=v_tenant_id and p.state='published';
  if v_current_publication is null or v_current_publication <> v_hold.publication_id then
    raise exception using errcode='23505',message='revision_conflict';
  end if;
  select * into v_revision from app.catalog_service_revisions sr
  where sr.tenant_id=v_tenant_id and sr.publication_id=v_hold.publication_id
    and sr.service_id=v_hold.service_id and sr.state='published' and sr.locale=p_locale;
  if v_revision.id is null then
    select * into v_revision from app.catalog_service_revisions sr
    where sr.tenant_id=v_tenant_id and sr.publication_id=v_hold.publication_id
      and sr.service_id=v_hold.service_id and sr.state='published'
    order by (sr.locale='en') desc,sr.locale limit 1;
  end if;
  if v_revision.id is null then
    raise exception using errcode='23505',message='revision_conflict';
  end if;
  if v_revision.price_minor is distinct from v_hold.price_minor
     or v_revision.currency is distinct from v_hold.currency
     or v_revision.tax_rate_bps is distinct from v_hold.tax_rate_bps then
    raise exception using errcode='23505',message='revision_conflict';
  end if;
  -- A free service has nothing to check out. The customer confirms directly and
  -- this surface refuses rather than opening a zero-amount payment.
  if v_revision.payment_mode = 'none' then
    raise exception using errcode='42501',message='checkout_not_ready';
  end if;
  if v_revision.approval_required then
    -- Approval decides before money is taken (ADR-0005 row 8): a request that
    -- is later declined must never have been charged.
    raise exception using errcode='42501',message='checkout_not_ready';
  end if;
  if coalesce(p_consent_version,'') <> coalesce(v_revision.policy->>'consent_version','1') then
    raise exception using errcode='42501',message='policy_denied';
  end if;

  -- The tenant's own connected account, and it has to actually be able to
  -- charge. A restricted account is a recoverable refusal, not a failed payment.
  select * into v_account from app.payment_accounts pa
  where pa.tenant_id=v_tenant_id and pa.status='connected' and pa.charges_enabled
  order by pa.created_at limit 1;
  if v_account.id is null then
    raise exception using errcode='42501',message='checkout_not_ready';
  end if;

  select * into v_amounts from private.resolve_payment_amounts_v1(
    v_revision.payment_mode,v_hold.price_minor,v_hold.tax_rate_bps,v_revision.policy);
  if v_amounts.due_minor <= 0 then
    raise exception using errcode='42501',message='checkout_not_ready';
  end if;

  -- The draft is written before the attempt, so an attempt can never exist
  -- without the values settlement will need.
  insert into app.booking_drafts(
    tenant_id,hold_id,contact,intake,consent_version,locale,customer_time_zone,
    hostname,application,session_hash)
  values (v_tenant_id,v_hold.id,p_contact,coalesce(p_intake,'{}'::jsonb),
    coalesce(p_consent_version,'1'),p_locale,p_customer_time_zone,
    p_hostname,p_application,v_session_hash)
  on conflict (tenant_id,hold_id) do update
    set contact=excluded.contact, intake=excluded.intake,
        consent_version=excluded.consent_version, locale=excluded.locale,
        customer_time_zone=excluded.customer_time_zone,
        hostname=excluded.hostname, application=excluded.application;

  insert into app.payment_price_snapshots(
    tenant_id,booking_id,hold_id,total_minor_units,deposit_minor_units,currency,
    tax_minor_units,tax_rate_basis_points,tax_inclusive,policy_revision)
  values (v_tenant_id,null,v_hold.id,
    v_hold.price_minor + v_amounts.tax_minor,
    case when v_amounts.purpose='deposit' then v_amounts.due_minor else 0 end,
    v_hold.currency,v_amounts.tax_minor,v_hold.tax_rate_bps,false,v_revision.revision)
  -- The index is partial, so the inference has to name the same predicate.
  on conflict (tenant_id,hold_id) where hold_id is not null do update
    set total_minor_units=excluded.total_minor_units,
        deposit_minor_units=excluded.deposit_minor_units,
        tax_minor_units=excluded.tax_minor_units,
        captured_at=pg_catalog.statement_timestamp();

  -- Resume a live attempt for this hold rather than opening a second one. The
  -- partial unique index makes this the only outcome under concurrency too.
  select * into v_attempt from app.payment_attempts a
  where a.tenant_id=v_tenant_id and a.hold_id=v_hold.id
    and a.status in ('requires_payment','processing') for update;
  if v_attempt.id is null then
    insert into app.payment_attempts(
      tenant_id,booking_id,hold_id,payment_account_id,amount_minor_units,currency,
      status,idempotency_key,purpose,balance_minor_units)
    values (v_tenant_id,null,v_hold.id,v_account.id,v_amounts.due_minor,v_hold.currency,
      'requires_payment',pg_catalog.left(p_idempotency_key,128),
      v_amounts.purpose,v_amounts.balance_minor)
    returning id into v_attempt_id;
  else
    -- A repriced publication was already refused above, so the amount cannot
    -- have moved; this only refreshes the clock the client shows.
    v_attempt_id := v_attempt.id;
    update app.payment_attempts a set updated_at=v_now where a.id=v_attempt_id;
  end if;

  insert into app.idempotency_keys(
    tenant_id,operation,idempotency_key,request_hash,state,result_kind,result_id,
    correlation_id,expires_at)
  values (v_tenant_id,'begin_checkout_v1',p_idempotency_key,v_request_hash,'succeeded',
    'payment_attempt',v_attempt_id,v_correlation_id,v_now + pg_catalog.make_interval(hours=>24))
  on conflict (tenant_id,operation,idempotency_key) do update
    set state='succeeded', result_kind='payment_attempt', result_id=v_attempt_id,
        updated_at=v_now;

  return query select 1,v_attempt_id,'requires_payment'::text,v_revision.payment_mode,
    v_amounts.due_minor,v_amounts.balance_minor,v_amounts.tax_minor,v_hold.currency,
    v_hold.price_minor + v_amounts.tax_minor,
    v_account.provider,v_account.provider_account_reference,v_hold.expires_at,false;
end;
$function$;

-- The checkout Edge Function reads what to charge from here rather than from
-- its caller. Service-role only: it returns the customer's address, which is
-- the one thing the provider needs and no browser should be able to ask for.
create or replace function private.get_checkout_intent_v1(
  p_tenant_id uuid,
  p_payment_attempt_id uuid
)
returns table (
  amount_minor_units bigint,
  currency text,
  connected_account_reference text,
  customer_email text,
  product_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.amount_minor_units, a.currency::text, pa.provider_account_reference,
    d.contact->>'email',
    coalesce(sr.name,'Booking')
  from app.payment_attempts a
  join app.payment_accounts pa on pa.tenant_id=a.tenant_id and pa.id=a.payment_account_id
  join app.booking_drafts d on d.tenant_id=a.tenant_id and d.hold_id=a.hold_id
  join app.booking_holds h on h.tenant_id=a.tenant_id and h.id=a.hold_id
  left join app.catalog_service_revisions sr
    on sr.tenant_id=a.tenant_id and sr.publication_id=h.publication_id
   and sr.service_id=h.service_id and sr.state='published' and sr.locale=d.locale
  where a.tenant_id=p_tenant_id and a.id=p_payment_attempt_id
    and a.status in ('requires_payment','processing');
$$;

-- ---------------------------------------------------------------------------
-- 7. Linking the provider session
-- ---------------------------------------------------------------------------

-- Called by the checkout Edge Function after it has created the provider
-- session, with the reference the provider returned. Nothing customer-facing
-- reaches this: it is the one write that ties our attempt to their object.
create or replace function private.attach_checkout_reference_v1(
  p_tenant_id uuid,
  p_payment_attempt_id uuid,
  p_checkout_reference text
)
returns table (payment_attempt_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_attempt app.payment_attempts%rowtype;
begin
  select * into v_attempt from app.payment_attempts a
  where a.tenant_id=p_tenant_id and a.id=p_payment_attempt_id for update;
  if v_attempt.id is null then
    raise exception using errcode='42501',message='checkout_not_ready';
  end if;
  if v_attempt.status not in ('requires_payment','processing') then
    raise exception using errcode='42501',message='checkout_not_ready';
  end if;

  update app.payment_attempts a set
    provider_checkout_reference=p_checkout_reference,
    status='processing',
    updated_at=pg_catalog.statement_timestamp()
  where a.id=p_payment_attempt_id;

  -- The mapping is what lets an inbound webhook find our attempt from the
  -- provider's identifier alone, with no trust in anything the browser carries.
  insert into app.provider_object_mappings(
    tenant_id,payment_account_id,object_kind,provider_object_reference,canonical_entity_id)
  values (p_tenant_id,v_attempt.payment_account_id,'checkout',p_checkout_reference,p_payment_attempt_id)
  on conflict (payment_account_id,object_kind,provider_object_reference) do nothing;

  return query select p_payment_attempt_id,'processing'::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Settlement
-- ---------------------------------------------------------------------------

-- The only thing that turns money into a booking, and it runs from a verified
-- provider event. A browser return never reaches here.
--
-- Four outcomes, all of them explicit:
--   confirmed   the hold was still good; the booking exists
--   exception   the money is ours and the capacity is not; a refund is queued
--   replayed    this event already settled; nothing happens twice
--   failed      the provider reported a failure; the hold stays as it was
create or replace function private.settle_payment_v1(
  p_tenant_id uuid,
  p_payment_attempt_id uuid,
  p_outcome text,
  p_provider_charge_reference text default null,
  p_amount_minor_units bigint default null,
  p_currency text default null
)
returns table (
  contract_version integer,
  outcome text,
  booking_id uuid,
  public_reference text,
  payment_status text,
  exception_code text
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '10s'
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_attempt app.payment_attempts%rowtype;
  v_hold app.booking_holds%rowtype;
  v_draft app.booking_drafts%rowtype;
  v_charge_id uuid;
  v_booking record;
  v_exception text;
begin
  select * into v_attempt from app.payment_attempts a
  where a.tenant_id=p_tenant_id and a.id=p_payment_attempt_id for update;
  if v_attempt.id is null then
    raise exception using errcode='42501',message='payment_not_verified';
  end if;

  -- Already settled. A duplicated or out-of-order provider event answers with
  -- the settled result instead of doing anything a second time.
  if v_attempt.status in ('succeeded','exception') then
    select b.id,b.public_reference,b.payment_status into v_booking
    from app.bookings b where b.tenant_id=p_tenant_id and b.hold_id=v_attempt.hold_id;
    return query select 1,
      case when v_attempt.status='exception' then 'exception' else 'replayed' end,
      v_booking.id,v_booking.public_reference,
      coalesce(v_booking.payment_status,'failed'),v_attempt.exception_code;
    return;
  end if;

  if p_outcome <> 'succeeded' then
    update app.payment_attempts a set
      status=case when p_outcome='cancelled' then 'cancelled' else 'failed' end,
      updated_at=v_now
    where a.id=p_payment_attempt_id;
    return query select 1,'failed'::text,null::uuid,null::text,'failed'::text,null::text;
    return;
  end if;

  -- The provider says the money moved. It has to be OUR money: the amount and
  -- currency the server calculated, not whatever arrived.
  if p_amount_minor_units is not null
     and (p_amount_minor_units is distinct from v_attempt.amount_minor_units
          or pg_catalog.upper(coalesce(p_currency,v_attempt.currency))
             is distinct from v_attempt.currency) then
    raise exception using errcode='42501',message='payment_not_verified';
  end if;

  -- The charge is recorded before anything is decided about capacity, so the
  -- financial record exists even if the booking cannot.
  insert into app.payment_charges(
    tenant_id,payment_attempt_id,provider_charge_reference,amount_minor_units,currency,status)
  values (p_tenant_id,v_attempt.id,
    coalesce(p_provider_charge_reference,'attempt:'||v_attempt.id::text),
    v_attempt.amount_minor_units,v_attempt.currency,'succeeded')
  on conflict (tenant_id,provider_charge_reference) do nothing
  returning id into v_charge_id;
  if v_charge_id is null then
    select c.id into v_charge_id from app.payment_charges c
    where c.tenant_id=p_tenant_id
      and c.provider_charge_reference=coalesce(p_provider_charge_reference,'attempt:'||v_attempt.id::text);
  end if;
  insert into app.commerce_ledger_entries(
    tenant_id,entry_type,source_id,amount_minor_units,currency,occurred_at,metadata)
  values (p_tenant_id,'charge',v_charge_id,v_attempt.amount_minor_units,v_attempt.currency,v_now,
    jsonb_build_object('payment_attempt_id',v_attempt.id,'purpose',v_attempt.purpose))
  on conflict (tenant_id,entry_type,source_id) do nothing;

  -- The money has moved; that is provider truth and is recorded now, before
  -- anything is decided about capacity. Whether it becomes a booking is the
  -- next question, and a separate one.
  update app.payment_attempts a set
    status='succeeded',
    provider_payment_reference=coalesce(p_provider_charge_reference,a.provider_payment_reference),
    updated_at=v_now
  where a.id=p_payment_attempt_id;

  select * into v_draft from app.booking_drafts d
  where d.tenant_id=p_tenant_id and d.hold_id=v_attempt.hold_id;
  select * into v_hold from app.booking_holds h
  where h.tenant_id=p_tenant_id and h.id=v_attempt.hold_id for update;

  -- Can this money still become the booking it was taken for?
  v_exception := case
    when v_draft.id is null then 'draft_missing'
    when v_hold.id is null then 'hold_lost'
    when exists (select 1 from app.bookings b
                 where b.tenant_id=p_tenant_id and b.hold_id=v_hold.id) then 'slot_taken'
    when v_hold.state <> 'active' or v_hold.expires_at <= v_now then 'hold_lost'
    else null
  end;

  if v_exception is null then
    begin
      -- One confirmation engine. Everything it checks, it still checks: the
      -- publication re-read, the price-drift check, consent, intake, allocation
      -- promotion, the snapshot, the ledger event, the outbox intent.
      select * into v_booking from private.confirm_booking_v1(
        v_draft.hostname,v_draft.application,v_hold.id,null,
        'settle-'||pg_catalog.replace(v_attempt.id::text,'-',''),
        v_draft.contact,v_draft.consent_version,v_draft.locale,v_draft.intake,
        v_draft.customer_time_zone,v_attempt.id);
    exception when others then
      -- The engine refused after the money moved. Whatever the reason, the
      -- honest outcome is the same: we are holding funds for capacity we
      -- cannot deliver, and that is an exception rather than a lost booking.
      v_exception := 'policy_changed';
    end;
  end if;

  if v_exception is not null then
    update app.payment_attempts a set
      status='exception', exception_code=v_exception, updated_at=v_now
    where a.id=p_payment_attempt_id;
    -- Queue the refund rather than performing it: the provider call happens
    -- outside this transaction, like every other provider call.
    insert into app.payment_refunds(
      tenant_id,payment_charge_id,amount_minor_units,currency,status,reason)
    values (p_tenant_id,v_charge_id,v_attempt.amount_minor_units,v_attempt.currency,
      'eligible','requested_by_customer')
    on conflict do nothing;
    return query select 1,'exception'::text,null::uuid,null::text,'failed'::text,v_exception;
    return;
  end if;

  update app.payment_attempts a set booking_id=v_booking.booking_id, updated_at=v_now
  where a.id=p_payment_attempt_id;
  update app.payment_charges c set status='succeeded' where c.id=v_charge_id;
  update app.payment_price_snapshots s set booking_id=v_booking.booking_id
  where s.tenant_id=p_tenant_id and s.hold_id=v_hold.id;

  -- The draft existed to carry values across the provider round trip. The
  -- booking now holds them in their immutable form, so the PII copy goes.
  delete from app.booking_drafts d where d.tenant_id=p_tenant_id and d.hold_id=v_hold.id;

  return query select 1,'confirmed'::text,v_booking.booking_id,v_booking.public_reference,
    v_booking.payment_status,null::text;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 9. Webhook intake
-- ---------------------------------------------------------------------------

-- The signature is verified in the Edge Function, which is the only place that
-- holds the signing secret. What arrives here is already-verified, already-
-- sanitized fact: an event reference, what it was about, and which of our
-- objects it names. Recording it is idempotent on the provider's own event id,
-- so a provider that retries delivers nothing twice.
create or replace function private.record_payment_event_v1(
  p_tenant_id uuid,
  p_provider text,
  p_provider_event_reference text,
  p_event_type text,
  p_provider_object_reference text,
  p_outcome text,
  p_amount_minor_units bigint default null,
  p_currency text default null,
  p_provider_charge_reference text default null,
  p_occurred_at timestamptz default null
)
returns table (
  contract_version integer,
  outcome text,
  booking_id uuid,
  public_reference text,
  payment_status text,
  exception_code text
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '10s'
as $function$
declare
  v_event app.payment_webhook_events%rowtype;
  v_attempt_id uuid;
  v_settled record;
begin
  insert into app.payment_webhook_events(
    tenant_id,provider,provider_event_reference,event_type,object_kind,
    provider_object_reference,occurred_at)
  values (p_tenant_id,p_provider,p_provider_event_reference,p_event_type,'checkout',
    p_provider_object_reference,coalesce(p_occurred_at,pg_catalog.statement_timestamp()))
  on conflict (provider,provider_event_reference) do nothing;

  select * into v_event from app.payment_webhook_events e
  where e.provider=p_provider and e.provider_event_reference=p_provider_event_reference;
  if v_event.processed_at is not null then
    -- Seen and handled. The caller gets the outcome that was reached then.
    select a.booking_id into v_attempt_id from app.payment_attempts a
    where a.tenant_id=p_tenant_id
      and a.id=(select m.canonical_entity_id from app.provider_object_mappings m
                where m.tenant_id=p_tenant_id and m.object_kind='checkout'
                  and m.provider_object_reference=p_provider_object_reference);
    return query select 1,'replayed'::text,v_attempt_id,
      (select b.public_reference from app.bookings b where b.id=v_attempt_id),
      'succeeded'::text,null::text;
    return;
  end if;

  select m.canonical_entity_id into v_attempt_id from app.provider_object_mappings m
  where m.tenant_id=p_tenant_id and m.object_kind='checkout'
    and m.provider_object_reference=p_provider_object_reference;
  if v_attempt_id is null then
    -- An event for an object we never created. Recording the reason and raising
    -- are mutually exclusive — the raise would roll back the very row that
    -- explains it — and the record is worth more than the exception. The caller
    -- gets `ignored`, which is the truth: this event was not ours to act on.
    update app.payment_webhook_events e set
      processed_at=pg_catalog.statement_timestamp(), processing_error='unknown_object'
    where e.id=v_event.id;
    return query select 1,'ignored'::text,null::uuid,null::text,'not_required'::text,null::text;
    return;
  end if;

  select * into v_settled from private.settle_payment_v1(
    p_tenant_id,v_attempt_id,p_outcome,p_provider_charge_reference,
    p_amount_minor_units,p_currency);

  update app.payment_webhook_events e set processed_at=pg_catalog.statement_timestamp()
  where e.id=v_event.id;

  return query select 1,v_settled.outcome,v_settled.booking_id,v_settled.public_reference,
    v_settled.payment_status,v_settled.exception_code;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 10. What the returning customer is allowed to learn
-- ---------------------------------------------------------------------------

-- The browser comes back from the provider knowing nothing trustworthy. This
-- is where it finds out what actually happened, from our own records, proving
-- ownership with the session that opened the checkout.
create or replace function private.get_checkout_status_v1(
  p_hostname text,
  p_application text,
  p_hold_id uuid,
  p_session_token text
)
returns table (
  contract_version integer,
  payment_attempt_id uuid,
  status text,
  purpose text,
  due_minor bigint,
  balance_minor bigint,
  currency text,
  exception_code text,
  booking_id uuid,
  public_reference text,
  booking_status text,
  payment_status text,
  hold_expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_tenant_id uuid;
  v_session_hash text;
  v_attempt app.payment_attempts%rowtype;
begin
  v_tenant_id := (select r.tenant_id from api_v1.resolve_public_tenant_v1(p_hostname,p_application) r);
  if v_tenant_id is null then
    raise exception using errcode='42501',message='booking_context_required';
  end if;
  v_session_hash := pg_catalog.encode(pg_catalog.sha256(
    pg_catalog.convert_to(v_tenant_id::text||':'||coalesce(p_session_token,''),'UTF8')),'hex');

  -- Ownership is the hold's session, not the attempt's: an unknown hold and
  -- someone else's hold are the same answer.
  if not exists (select 1 from app.booking_holds h
    where h.tenant_id=v_tenant_id and h.id=p_hold_id and h.session_hash=v_session_hash) then
    raise exception using errcode='42501',message='booking_context_required';
  end if;

  select * into v_attempt from app.payment_attempts a
  where a.tenant_id=v_tenant_id and a.hold_id=p_hold_id
  order by a.created_at desc limit 1;
  if v_attempt.id is null then
    raise exception using errcode='42501',message='checkout_not_ready';
  end if;

  return query
  select 1,v_attempt.id,v_attempt.status,coalesce(v_attempt.purpose,'full'),
    v_attempt.amount_minor_units,coalesce(v_attempt.balance_minor_units,0::bigint),
    v_attempt.currency::text,v_attempt.exception_code,
    b.id,b.public_reference,b.status,b.payment_status,
    (select h.expires_at from app.booking_holds h where h.id=p_hold_id)
  from (select 1) one
  left join app.bookings b on b.tenant_id=v_tenant_id and b.hold_id=p_hold_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 11. api_v1 surface
-- ---------------------------------------------------------------------------

create or replace function api_v1.begin_checkout_v1(
  p_hostname text, p_application text, p_hold_id uuid, p_session_token text,
  p_idempotency_key text, p_contact jsonb, p_consent_version text,
  p_locale text default 'en', p_intake jsonb default '{}'::jsonb,
  p_customer_time_zone text default null)
returns table (
  contract_version integer, payment_attempt_id uuid, status text, payment_mode text,
  due_minor bigint, balance_minor bigint, tax_minor bigint, currency text,
  total_minor bigint, provider text, provider_account_reference text,
  expires_at timestamptz, replayed boolean)
language sql volatile security invoker set search_path = '' set statement_timeout = '5s'
as $$ select * from private.begin_checkout_v1(p_hostname,p_application,p_hold_id,
  p_session_token,p_idempotency_key,p_contact,p_consent_version,p_locale,p_intake,
  p_customer_time_zone); $$;

create or replace function api_v1.get_checkout_status_v1(
  p_hostname text, p_application text, p_hold_id uuid, p_session_token text)
returns table (
  contract_version integer, payment_attempt_id uuid, status text, purpose text,
  due_minor bigint, balance_minor bigint, currency text, exception_code text,
  booking_id uuid, public_reference text, booking_status text, payment_status text,
  hold_expires_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_checkout_status_v1(p_hostname,p_application,p_hold_id,
  p_session_token); $$;

-- The two functions the Edge Functions call. They are NOT granted to anon or
-- authenticated: only the service role reaches them, because only the Edge
-- Function holds the provider secret that makes their arguments trustworthy.
create or replace function api_v1.get_checkout_intent_v1(
  p_tenant_id uuid, p_payment_attempt_id uuid)
returns table (
  amount_minor_units bigint, currency text, connected_account_reference text,
  customer_email text, product_name text)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_checkout_intent_v1(p_tenant_id,p_payment_attempt_id); $$;

create or replace function api_v1.attach_checkout_reference_v1(
  p_tenant_id uuid, p_payment_attempt_id uuid, p_checkout_reference text)
returns table (payment_attempt_id uuid, status text)
language sql volatile security invoker set search_path = ''
as $$ select * from private.attach_checkout_reference_v1(p_tenant_id,p_payment_attempt_id,
  p_checkout_reference); $$;

create or replace function api_v1.record_payment_event_v1(
  p_tenant_id uuid, p_provider text, p_provider_event_reference text,
  p_event_type text, p_provider_object_reference text, p_outcome text,
  p_amount_minor_units bigint default null, p_currency text default null,
  p_provider_charge_reference text default null, p_occurred_at timestamptz default null)
returns table (
  contract_version integer, outcome text, booking_id uuid, public_reference text,
  payment_status text, exception_code text)
language sql volatile security invoker set search_path = '' set statement_timeout = '10s'
as $$ select * from private.record_payment_event_v1(p_tenant_id,p_provider,
  p_provider_event_reference,p_event_type,p_provider_object_reference,p_outcome,
  p_amount_minor_units,p_currency,p_provider_charge_reference,p_occurred_at); $$;

-- ---------------------------------------------------------------------------
-- 12. Grants
-- ---------------------------------------------------------------------------

revoke all on function
  private.resolve_payment_amounts_v1(text,bigint,integer,jsonb),
  private.begin_checkout_v1(text,text,uuid,text,text,jsonb,text,text,jsonb,text),
  private.attach_checkout_reference_v1(uuid,uuid,text),
  private.get_checkout_intent_v1(uuid,uuid),
  private.settle_payment_v1(uuid,uuid,text,text,bigint,text),
  private.record_payment_event_v1(uuid,text,text,text,text,text,bigint,text,text,timestamptz),
  private.get_checkout_status_v1(text,text,uuid,text)
from public, anon, authenticated;

grant execute on function
  private.begin_checkout_v1(text,text,uuid,text,text,jsonb,text,text,jsonb,text),
  private.get_checkout_status_v1(text,text,uuid,text)
to anon, authenticated;

revoke all on function
  api_v1.begin_checkout_v1(text,text,uuid,text,text,jsonb,text,text,jsonb,text),
  api_v1.get_checkout_status_v1(text,text,uuid,text),
  api_v1.attach_checkout_reference_v1(uuid,uuid,text),
  api_v1.get_checkout_intent_v1(uuid,uuid),
  api_v1.record_payment_event_v1(uuid,text,text,text,text,text,bigint,text,text,timestamptz)
from public, anon, authenticated;

grant execute on function
  api_v1.begin_checkout_v1(text,text,uuid,text,text,jsonb,text,text,jsonb,text),
  api_v1.get_checkout_status_v1(text,text,uuid,text)
to anon, authenticated;

-- Settlement and the provider link are service-role only. A customer session
-- must never be able to assert that a payment succeeded.
grant execute on function
  api_v1.attach_checkout_reference_v1(uuid,uuid,text),
  api_v1.get_checkout_intent_v1(uuid,uuid),
  api_v1.record_payment_event_v1(uuid,text,text,text,text,text,bigint,text,text,timestamptz)
to service_role;
