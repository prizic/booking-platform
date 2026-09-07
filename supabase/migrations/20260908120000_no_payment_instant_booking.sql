-- Issue #12: the first sellable tracer. A hold from issue #11 becomes a
-- committed booking inside one transaction: idempotency claim, hold lock,
-- re-read of the published catalog, policy and consent check, allocation
-- promotion, immutable snapshot, booking event, and outbox intent. No provider
-- is called from this transaction; delivery is an outbox row that issues
-- #19-#20 drain.
--
-- The stable error vocabulary is the one issue #11 published. This migration
-- adds no new public error string:
--   slot_unavailable      23P01  the hold no longer protects a bookable slot
--   policy_denied         42501  policy, consent, approval, or intake denial
--   revision_conflict     23505  the hold read a superseded publication
--   payment_pending       23505  the service needs payment (issue #22)
--   idempotency_conflict  23505  key reused with a different normalized request
-- Malformed input keeps the 22023 convention with a booking_* message.

alter table app.idempotency_keys drop constraint idempotency_keys_operation_check;
alter table app.idempotency_keys add constraint idempotency_keys_operation_check
  check (operation in ('create_hold_v1','confirm_booking_v1'));
alter table app.idempotency_keys drop constraint idempotency_keys_result_kind_check;
alter table app.idempotency_keys add constraint idempotency_keys_result_kind_check
  check (result_kind in ('hold','booking'));

-- Booking, payment, refund, notification, and calendar states stay separate
-- columns. A degraded provider never rewrites the booking state (invariant 9).
create table app.bookings (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  -- Customer-facing handle. Unpredictable, tenant-scoped, and never a counter.
  public_reference text not null
    check (public_reference ~ '^[0-9A-HJ-NP-Z]{10}$'),
  service_id uuid not null,
  location_id uuid not null,
  hold_id uuid not null,
  publication_id uuid not null,
  status text not null check (status in ('confirmed','cancelled','completed','no_show')),
  -- Vocabularies are the api_v1 DTO vocabularies, so no mapping layer can drift.
  payment_status text not null check (payment_status in ('not_required','requires_payment','processing','succeeded','failed','cancelled','disputed')),
  notification_status text not null check (notification_status in ('queued','sending','delivered','bounced','complained','failed')),
  calendar_status text not null check (calendar_status in ('pending','generated','stale')),
  approval_status text not null check (approval_status in ('not_required','pending','approved','declined')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  party_size integer not null default 1 check (party_size = 1),
  -- Immutable snapshot (invariant 5). A later tenant edit never rewrites these.
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  buffer_before_minutes integer not null check (buffer_before_minutes between 0 and 1440),
  buffer_after_minutes integer not null check (buffer_after_minutes between 0 and 1440),
  price_minor bigint not null check (price_minor >= 0),
  tax_rate_bps integer not null check (tax_rate_bps between 0 and 3000),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  policy_snapshot jsonb not null check (jsonb_typeof(policy_snapshot) = 'object'),
  consent_text text not null,
  consent_version text not null check (char_length(consent_version) between 1 and 40),
  consented_at timestamptz not null,
  intake_schema_snapshot jsonb not null
    check (jsonb_typeof(intake_schema_snapshot) = 'object' and intake_schema_snapshot ? 'fields'),
  service_name text not null,
  location_name text not null,
  locale text not null check (locale in ('en','ar')),
  location_time_zone text not null,
  customer_time_zone text not null,
  revision bigint not null default 1 check (revision > 0),
  correlation_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (id), unique (tenant_id,id), unique (tenant_id,public_reference),
  -- One hold produces at most one booking, so a replayed confirmation can never
  -- double-book the capacity the hold protected.
  unique (tenant_id,hold_id),
  check (ends_at > starts_at),
  foreign key (tenant_id,service_id,location_id)
    references app.catalog_service_locations(tenant_id,service_id,location_id) on delete restrict,
  foreign key (tenant_id,hold_id) references app.booking_holds(tenant_id,id) on delete restrict,
  foreign key (tenant_id,publication_id) references app.catalog_publications(tenant_id,id) on delete restrict
);
create index bookings_schedule_idx on app.bookings(tenant_id,location_id,starts_at);

-- Guest contact and intake answers live outside app.bookings so an ordinary
-- calendar read never carries them. Both are minimized to the declared booking
-- purpose and read behind a separate capability.
create table app.booking_contacts (
  tenant_id uuid not null,
  booking_id uuid not null,
  full_name text not null check (full_name = btrim(full_name) and char_length(full_name) between 1 and 160),
  email text not null check (char_length(email) between 3 and 320 and email like '%@%'),
  phone text check (char_length(phone) between 3 and 40),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id,booking_id),
  foreign key (tenant_id,booking_id) references app.bookings(tenant_id,id) on delete restrict
);
create table app.booking_intake_answers (
  tenant_id uuid not null,
  booking_id uuid not null,
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id,booking_id),
  foreign key (tenant_id,booking_id) references app.bookings(tenant_id,id) on delete restrict
);

-- Append-only lineage. Every state change lands here in the same commit as the
-- change itself, with the actor, the request, and redacted metadata.
create table app.booking_events (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  booking_id uuid not null,
  sequence bigint not null check (sequence > 0),
  event_type text not null check (event_type in ('booking_confirmed','booking_cancelled','booking_completed','booking_no_show')),
  actor_kind text not null check (actor_kind in ('guest','member','system')),
  actor_membership_id uuid,
  effective_actor_id uuid,
  reason text,
  outcome text not null check (outcome in ('succeeded','failed')),
  request_id uuid not null,
  booking_revision bigint not null check (booking_revision > 0),
  -- Redacted by construction: the writer never puts contact details, intake
  -- answers, or a management link in here.
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  primary key (id), unique (tenant_id,booking_id,sequence),
  foreign key (tenant_id,booking_id) references app.bookings(tenant_id,id) on delete restrict
);

-- Provider work is an intent recorded in the same commit, never a call made
-- from the booking transaction.
create table app.outbox_events (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  booking_id uuid,
  topic text not null check (topic in ('booking.confirmed')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  state text not null default 'pending' check (state in ('pending','delivered','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default statement_timestamp(),
  correlation_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (id),
  -- One intent per booking and topic, so a duplicate submission that replays
  -- the same booking never enqueues a second confirmation email.
  unique (tenant_id,booking_id,topic),
  foreign key (tenant_id,booking_id) references app.bookings(tenant_id,id) on delete restrict
);
create index outbox_events_pending_idx on app.outbox_events(available_at) where state = 'pending';

-- Snapshot immutability is a database rule, not a convention. Only the separate
-- lifecycle states and the revision may ever move.
create or replace function private.enforce_booking_snapshot_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode='42501',message='booking_immutable';
  end if;
  if (to_jsonb(old) - 'status' - 'payment_status' - 'notification_status'
        - 'calendar_status' - 'approval_status' - 'revision' - 'updated_at')
     is distinct from
     (to_jsonb(new) - 'status' - 'payment_status' - 'notification_status'
        - 'calendar_status' - 'approval_status' - 'revision' - 'updated_at') then
    raise exception using errcode='42501',message='booking_immutable';
  end if;
  return new;
end;
$$;
create trigger bookings_snapshot_immutable
  before update or delete on app.bookings
  for each row execute function private.enforce_booking_snapshot_immutability();

create or replace function private.enforce_append_only()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using errcode='42501',message='booking_immutable';
end;
$$;
create trigger booking_events_append_only
  before update or delete on app.booking_events
  for each row execute function private.enforce_append_only();
create trigger booking_contacts_append_only
  before update or delete on app.booking_contacts
  for each row execute function private.enforce_append_only();
create trigger booking_intake_answers_append_only
  before update or delete on app.booking_intake_answers
  for each row execute function private.enforce_append_only();

-- RLS. Bookings and their lineage are readable by scoped members; contact and
-- intake data additionally require the PII capability. Nothing is writable
-- directly: every mutation goes through a booking RPC.
alter table app.bookings enable row level security;
create policy bookings_select_scoped on app.bookings for select to authenticated
using ((select private.is_active_tenant_member(tenant_id))
  and (select private.can_access_location(tenant_id,location_id)));
create policy bookings_insert_denied on app.bookings for insert to anon,authenticated with check (false);
create policy bookings_update_denied on app.bookings for update to anon,authenticated using (false) with check (false);
create policy bookings_delete_denied on app.bookings for delete to anon,authenticated using (false);

alter table app.booking_events enable row level security;
create policy booking_events_select_scoped on app.booking_events for select to authenticated
using (exists (
  select 1 from app.bookings b
  where b.tenant_id = booking_events.tenant_id and b.id = booking_events.booking_id
    and (select private.is_active_tenant_member(b.tenant_id))
    and (select private.can_access_location(b.tenant_id,b.location_id))));
create policy booking_events_insert_denied on app.booking_events for insert to anon,authenticated with check (false);
create policy booking_events_update_denied on app.booking_events for update to anon,authenticated using (false) with check (false);
create policy booking_events_delete_denied on app.booking_events for delete to anon,authenticated using (false);

do $rls$
declare t text;
begin
  foreach t in array array['booking_contacts','booking_intake_answers'] loop
    execute format('alter table app.%I enable row level security',t);
    execute format($p$create policy %I on app.%I for select to authenticated using (
      exists (select 1 from app.bookings b
        where b.tenant_id = app.%I.tenant_id and b.id = app.%I.booking_id
          and (select private.is_active_tenant_member(b.tenant_id))
          and (select private.can_access_location(b.tenant_id,b.location_id))
          and (select private.has_direct_capability(b.tenant_id,'customer.pii.view'))))$p$,
      t||'_select_pii',t,t,t);
    execute format('create policy %I on app.%I for insert to anon,authenticated with check (false)',t||'_insert_denied',t);
    execute format('create policy %I on app.%I for update to anon,authenticated using (false) with check (false)',t||'_update_denied',t);
    execute format('create policy %I on app.%I for delete to anon,authenticated using (false)',t||'_delete_denied',t);
  end loop;
end;
$rls$;

-- The outbox is operator data. No application role touches it directly.
alter table app.outbox_events enable row level security;
create policy outbox_events_select_denied on app.outbox_events for select to anon,authenticated using (false);
create policy outbox_events_insert_denied on app.outbox_events for insert to anon,authenticated with check (false);
create policy outbox_events_update_denied on app.outbox_events for update to anon,authenticated using (false) with check (false);
create policy outbox_events_delete_denied on app.outbox_events for delete to anon,authenticated using (false);
revoke all on app.outbox_events from public,anon,authenticated;

revoke all on app.bookings,app.booking_events,app.booking_contacts,app.booking_intake_answers
  from public,anon,authenticated;
grant select on app.bookings,app.booking_events,app.booking_contacts,app.booking_intake_answers
  to authenticated;

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
  p_customer_time_zone text default null
)
returns table(
  contract_version integer,
  booking_id uuid,
  public_reference text,
  status text,
  approval_status text,
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
begin
  if p_session_token is null or p_session_token <> btrim(p_session_token)
     or char_length(p_session_token) not between 16 and 200 then
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
      v_booking.approval_status,v_booking.payment_status,v_booking.notification_status,
      v_booking.calendar_status,v_booking.starts_at,v_booking.ends_at,v_booking.service_name,
      v_booking.location_name,v_booking.location_time_zone,v_booking.customer_time_zone,
      v_booking.locale,v_booking.price_minor,v_booking.tax_rate_bps,v_booking.currency,
      v_booking.policy_snapshot,v_booking.consent_version,v_booking.revision,true;
    return;
  end if;

  -- Lock the hold before reading anything derived from it. Ownership is proved
  -- by the creating session: an unknown hold and someone else's hold are
  -- indistinguishable to the caller, and a cross-tenant hold is simply unknown.
  select * into v_hold from app.booking_holds h
  where h.tenant_id=v_tenant_id and h.id=p_hold_id and h.session_hash=v_session_hash
  for update;
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
  if v_revision.payment_mode <> 'none' then
    raise log 'booking_denied code=payment_pending correlation=% tenant=%',v_correlation_id,v_tenant_id;
    raise exception using errcode='23505',message='payment_pending';
  end if;
  if v_revision.approval_required then
    -- Request-to-book is issue #13. Until it ships, this tracer declines rather
    -- than confirming something a tenant expects to approve.
    raise log 'booking_denied code=policy_denied correlation=% tenant=% reason=approval_required',v_correlation_id,v_tenant_id;
    raise exception using errcode='42501',message='policy_denied';
  end if;

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
    customer_time_zone,correlation_id)
  values (
    v_booking_id,v_tenant_id,v_reference,v_hold.service_id,v_hold.location_id,v_hold.id,
    v_hold.publication_id,'confirmed','not_required','queued','pending','not_required',
    v_hold.starts_at,v_hold.ends_at,1,v_revision.duration_minutes,
    v_revision.buffer_before_minutes,v_revision.buffer_after_minutes,
    v_hold.price_minor,v_hold.tax_rate_bps,v_hold.currency,v_revision.policy,
    v_consent_text,v_consent_version,v_now,v_revision.intake_schema,v_service_name,
    v_location_name,p_locale,v_location.time_zone,
    coalesce(p_customer_time_zone,v_location.time_zone),v_correlation_id);

  insert into app.booking_contacts(tenant_id,booking_id,full_name,email,phone)
  values (v_tenant_id,v_booking_id,v_full_name,v_email,v_phone);
  if v_intake <> '{}'::jsonb then
    insert into app.booking_intake_answers(tenant_id,booking_id,answers)
    values (v_tenant_id,v_booking_id,v_intake);
  end if;

  insert into app.booking_events(
    tenant_id,booking_id,sequence,event_type,actor_kind,reason,outcome,request_id,
    booking_revision,metadata)
  values (v_tenant_id,v_booking_id,1,'booking_confirmed',
    case when p_application='dashboard' then 'member' else 'guest' end,
    'instant_booking','succeeded',v_correlation_id,1,
    jsonb_build_object('application',p_application,'locale',p_locale,
      'payment_mode','none','publication_id',v_hold.publication_id));

  -- Delivery intent only. Nothing here reaches a network provider, and the
  -- payload carries no contact detail or management link.
  insert into app.outbox_events(tenant_id,booking_id,topic,payload,correlation_id)
  values (v_tenant_id,v_booking_id,'booking.confirmed',
    jsonb_build_object('booking_id',v_booking_id,'locale',p_locale,
      'public_reference',v_reference,'starts_at',v_hold.starts_at),
    v_correlation_id);

  update app.idempotency_keys k
  set state='succeeded',result_kind='booking',result_id=v_booking_id,updated_at=v_now
  where k.tenant_id=v_tenant_id and k.operation='confirm_booking_v1'
    and k.idempotency_key=p_idempotency_key;

  raise log 'booking_confirmed booking=% correlation=% tenant=% hold=%',
    v_booking_id,v_correlation_id,v_tenant_id,v_hold.id;
  return query select 1,v_booking_id,v_reference,'confirmed'::text,'not_required'::text,
    'not_required'::text,'queued'::text,'pending'::text,v_hold.starts_at,v_hold.ends_at,
    v_service_name,v_location_name,v_location.time_zone,
    coalesce(p_customer_time_zone,v_location.time_zone),p_locale,v_hold.price_minor,
    v_hold.tax_rate_bps,v_hold.currency,v_revision.policy,v_consent_version,1::bigint,false;
end;
$function$;
comment on function private.confirm_booking_v1(text,text,uuid,text,text,jsonb,text,text,jsonb,text) is
  'Booking confirmation v1 engine. Claims idempotency, locks the hold, re-reads the published catalog, checks policy and consent, promotes the held allocations, snapshots immutable facts, and records the event and outbox intent in one transaction. Calls no provider.';
revoke all on function private.confirm_booking_v1(text,text,uuid,text,text,jsonb,text,text,jsonb,text) from public;
grant execute on function private.confirm_booking_v1(text,text,uuid,text,text,jsonb,text,text,jsonb,text) to anon,authenticated;

create or replace function api_v1.confirm_booking_v1(
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
returns table(
  contract_version integer, booking_id uuid, public_reference text, status text,
  approval_status text, payment_status text, notification_status text, calendar_status text,
  starts_at timestamptz, ends_at timestamptz, service_name text, location_name text,
  location_time_zone text, customer_time_zone text, locale text, price_minor bigint,
  tax_rate_bps integer, currency text, policy_snapshot jsonb, consent_version text,
  booking_revision bigint, replayed boolean
)
language sql volatile security invoker set search_path = '' set statement_timeout = '5s' as $$
  select * from private.confirm_booking_v1(
    p_hostname,p_application,p_hold_id,p_session_token,p_idempotency_key,p_contact,
    p_consent_version,p_locale,p_intake,p_customer_time_zone);
$$;
revoke all on function api_v1.confirm_booking_v1(text,text,uuid,text,text,jsonb,text,text,jsonb,text) from public;
grant execute on function api_v1.confirm_booking_v1(text,text,uuid,text,text,jsonb,text,text,jsonb,text) to anon,authenticated;

-- Minimal Dashboard read. RLS decides visibility; the DTO deliberately carries
-- no contact detail and no intake answer. The Today and Calendar workspace is
-- issue #16 and expands from here.
create or replace function api_v1.list_bookings_v1(
  p_tenant_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  contract_version integer, booking_id uuid, public_reference text, status text,
  approval_status text, payment_status text, notification_status text, calendar_status text,
  service_id uuid, service_name text, location_id uuid, location_name text,
  location_time_zone text, staff_id uuid, starts_at timestamptz, ends_at timestamptz,
  price_minor bigint, tax_rate_bps integer, currency text, locale text, booking_revision bigint,
  has_intake boolean
)
language sql stable security invoker set search_path = '' set statement_timeout = '5s' as $$
  select 1,b.id,b.public_reference,b.status,b.approval_status,b.payment_status,
    b.notification_status,b.calendar_status,b.service_id,b.service_name,b.location_id,
    b.location_name,b.location_time_zone,
    (select a.staff_id from app.assignment_allocations a
      where a.tenant_id=b.tenant_id and a.hold_id=b.hold_id and a.staff_id is not null limit 1),
    b.starts_at,b.ends_at,b.price_minor,b.tax_rate_bps,b.currency,b.locale,b.revision,
    exists (select 1 from app.booking_intake_answers i
      where i.tenant_id=b.tenant_id and i.booking_id=b.id)
  from app.bookings b
  where b.tenant_id=p_tenant_id
    and (p_from is null or b.starts_at>=p_from)
    and (p_to is null or b.starts_at<p_to)
  order by b.starts_at,b.id
  limit 500;
$$;
revoke all on function api_v1.list_bookings_v1(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function api_v1.list_bookings_v1(uuid,timestamptz,timestamptz) to authenticated;

-- The guest must see the consent text and the intake questions from exactly the
-- publication the hold read. The public catalog DTO deliberately excludes both
-- (issue #7), so this narrow read is scoped to a hold the caller owns instead
-- of widening the public catalog for everyone.
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
  consent_version text, consent_text text, intake_schema jsonb
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
  return query select 1,v_hold.id,v_hold.state,v_hold.expires_at,v_hold.starts_at,v_hold.ends_at,
    v_revision.name,coalesce(v_location_name,v_location.name),v_location.time_zone,
    v_hold.price_minor,v_hold.tax_rate_bps,v_hold.currency,
    coalesce(v_revision.policy->>'consent_version','1'),
    coalesce(v_revision.policy->>'consent_text',''),
    v_revision.intake_schema;
end;
$function$;
revoke all on function private.get_hold_form_v1(text,text,uuid,text,text) from public;
grant execute on function private.get_hold_form_v1(text,text,uuid,text,text) to anon,authenticated;

create or replace function api_v1.get_hold_form_v1(
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
  consent_version text, consent_text text, intake_schema jsonb
)
language sql stable security invoker set search_path = '' set statement_timeout = '5s' as $$
  select * from private.get_hold_form_v1(p_hostname,p_application,p_hold_id,p_session_token,p_locale);
$$;
revoke all on function api_v1.get_hold_form_v1(text,text,uuid,text,text) from public;
grant execute on function api_v1.get_hold_form_v1(text,text,uuid,text,text) to anon,authenticated;
