-- Issue #13: request-to-book. A service the tenant approves creates a
-- `requested` booking, never a confirmed one (§6.2, §7.1), and staff accept,
-- propose another time, or reject it through the same atomic allocation and
-- audit guarantees the instant tracer uses.
--
-- Policy comes from ADR-0005 and is read from the published service policy, so
-- nothing here invents a value:
--   service.request_holds_allocation  false  does a request reserve capacity
--   request.response_sla_hours        48     wall-clock decision deadline
--   request.proposal_ttl_hours        24     staff proposal lifetime
--
-- A request that reserves capacity keeps its issue #11 hold instead of adding a
-- second reservation mechanism: the hold's purpose becomes provisional_request
-- and its expires_at becomes the SLA deadline. Allocations stay `held`, so the
-- exclusion constraints and the availability engine keep deciding overlap
-- exactly as before, and the existing expiry job still releases it on time.
--
-- Errors stay in the published vocabulary: slot_unavailable, policy_denied,
-- revision_conflict, payment_pending, idempotency_conflict.

alter table app.booking_holds
  add column purpose text not null default 'checkout'
    check (purpose in ('checkout','provisional_request'));
comment on column app.booking_holds.purpose is
  'checkout holds live by ttl_seconds; provisional_request holds live to the request SLA deadline in expires_at (ADR-0005 rows 34-35).';

alter table app.bookings drop constraint bookings_status_check;
alter table app.bookings add constraint bookings_status_check
  check (status in ('requested','confirmed','cancelled','completed','no_show','rejected','expired'));
alter table app.bookings drop constraint bookings_approval_status_check;
alter table app.bookings add constraint bookings_approval_status_check
  check (approval_status in ('not_required','pending','approved','declined','expired'));
-- The decision deadline is data on the booking, exactly as hold expiry is data:
-- no moving now-time predicate decides whether a request is still open.
alter table app.bookings add column approval_deadline timestamptz;
-- The customer-safe reason. The internal reason stays in the booking event, so
-- a staff note is never rendered to a guest.
alter table app.bookings add column decision_reason_public text
  check (decision_reason_public is null or char_length(decision_reason_public) between 1 and 500);
alter table app.bookings
  add constraint bookings_request_deadline
    check ((status = 'requested') = (approval_status = 'pending')
      and (approval_status = 'pending') <= (approval_deadline is not null));
create index bookings_pending_requests_idx on app.bookings(tenant_id,approval_deadline)
  where status = 'requested';

alter table app.booking_events drop constraint booking_events_event_type_check;
alter table app.booking_events add constraint booking_events_event_type_check
  check (event_type in (
    'booking_requested','booking_confirmed','booking_cancelled','booking_completed',
    'booking_no_show','booking_rejected','booking_request_expired',
    'booking_proposal_created','booking_proposal_declined'));

alter table app.outbox_events drop constraint outbox_events_topic_check;
alter table app.outbox_events add constraint outbox_events_topic_check
  check (topic in ('booking.confirmed','booking.requested','booking.rejected',
    'booking.request_expired','booking.proposal_created','booking.proposal_declined'));

-- A staff proposal never replaces the request (ADR-0005 row 40): it is a
-- separate expiring offer with its own intent-scoped customer link.
create table app.booking_proposals (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  booking_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  expires_at timestamptz not null,
  state text not null default 'pending' check (state in ('pending','accepted','declined','expired')),
  -- The customer link is a bearer credential, so only its digest is stored.
  action_token_hash text not null unique check (action_token_hash ~ '^[a-f0-9]{64}$'),
  proposed_by_membership_id uuid,
  message_public text check (message_public is null or char_length(message_public) between 1 and 500),
  correlation_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (id), unique (tenant_id,id),
  check (ends_at > starts_at),
  foreign key (tenant_id,booking_id) references app.bookings(tenant_id,id) on delete restrict
);
-- One live proposal per request: a second offer would let a customer accept a
-- time staff already moved on from.
create unique index booking_proposals_one_pending on app.booking_proposals(tenant_id,booking_id)
  where state = 'pending';
create index booking_proposals_expiry_idx on app.booking_proposals(expires_at) where state = 'pending';

alter table app.booking_proposals enable row level security;
create policy booking_proposals_select_scoped on app.booking_proposals for select to authenticated
using (exists (
  select 1 from app.bookings b
  where b.tenant_id = booking_proposals.tenant_id and b.id = booking_proposals.booking_id
    and (select private.is_active_tenant_member(b.tenant_id))
    and (select private.can_access_location(b.tenant_id,b.location_id))));
create policy booking_proposals_insert_denied on app.booking_proposals for insert to anon,authenticated with check (false);
create policy booking_proposals_update_denied on app.booking_proposals for update to anon,authenticated using (false) with check (false);
create policy booking_proposals_delete_denied on app.booking_proposals for delete to anon,authenticated using (false);
revoke all on app.booking_proposals from public,anon,authenticated;
-- Column-level grant, not a table grant: the token digest never leaves the
-- database, not even to a scoped member, and a table grant cannot be narrowed
-- afterwards.
grant select (id,tenant_id,booking_id,starts_at,ends_at,expires_at,state,
  proposed_by_membership_id,message_public,correlation_id,created_at,updated_at)
  on app.booking_proposals to authenticated;

create trigger booking_proposals_no_delete
  before delete on app.booking_proposals
  for each row execute function private.enforce_append_only();

-- Request policy resolution. Values live in the published service policy and are
-- clamped to the ADR-0005 bounds here, so no tenant edit can widen them.
create or replace function private.resolve_request_policy_v1(
  p_policy jsonb,
  p_key text
)
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_key
    when 'response_sla_hours' then
      least(greatest(coalesce((p_policy->>'request_response_sla_hours')::integer,48),1),168)
    when 'proposal_ttl_hours' then
      least(greatest(coalesce((p_policy->>'request_proposal_ttl_hours')::integer,24),1),72)
  end;
$$;

create or replace function private.request_booking_v1(
  p_tenant_id uuid,
  p_hold app.booking_holds,
  p_revision app.catalog_service_revisions,
  p_booking_id uuid,
  p_correlation_id uuid,
  p_now timestamptz
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deadline timestamptz;
  v_holds_allocation boolean :=
    coalesce((p_revision.policy->>'request_holds_allocation')::boolean,false);
begin
  -- The SLA clock is wall-clock and starts now (ADR-0005 row 35): no tenant
  -- calendar, holiday, or opening-hours setting pauses it.
  v_deadline := p_now + make_interval(hours =>
    private.resolve_request_policy_v1(p_revision.policy,'response_sla_hours'));

  if v_holds_allocation then
    -- The request keeps the capacity the checkout hold already protects. The
    -- hold's own TTL stops governing it; the SLA deadline does.
    update app.booking_holds h
    set purpose='provisional_request', expires_at=v_deadline, updated_at=p_now
    where h.tenant_id=p_tenant_id and h.id=p_hold.id;
  else
    -- The request reserves nothing. Two requests for one slot is the honest
    -- outcome, and acceptance may lose with slot_unavailable.
    update app.assignment_allocations a set state='cancelled'
    where a.tenant_id=p_tenant_id and a.hold_id=p_hold.id and a.state='held';
    update app.booking_holds h set state='released', released_at=p_now, updated_at=p_now
    where h.tenant_id=p_tenant_id and h.id=p_hold.id;
  end if;

  insert into app.outbox_events(tenant_id,booking_id,topic,payload,correlation_id)
  values (p_tenant_id,p_booking_id,'booking.requested',
    jsonb_build_object('booking_id',p_booking_id,'decision_deadline',v_deadline),
    p_correlation_id);
  raise log 'booking_requested booking=% correlation=% tenant=% holds_allocation=%',
    p_booking_id,p_correlation_id,p_tenant_id,v_holds_allocation;
  return v_deadline;
end;
$$;
revoke all on function private.request_booking_v1(uuid,app.booking_holds,app.catalog_service_revisions,uuid,uuid,timestamptz) from public,anon,authenticated;

-- Confirmation now has two outcomes. The transaction, its idempotency claim,
-- its catalog re-read, and its snapshot are unchanged; only the resulting
-- status, what happens to the hold, and the intent it enqueues differ. The
-- result gains the decision deadline, so both functions are recreated.
drop function api_v1.confirm_booking_v1(text,text,uuid,text,text,jsonb,text,text,jsonb,text);
drop function private.confirm_booking_v1(text,text,uuid,text,text,jsonb,text,text,jsonb,text);

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
    v_hold.publication_id,v_status,'not_required','queued','pending',v_approval_status,
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
      'payment_mode','none','publication_id',v_hold.publication_id));

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
    v_approval_deadline,'not_required'::text,'queued'::text,'pending'::text,
    v_hold.starts_at,v_hold.ends_at,
    v_service_name,v_location_name,v_location.time_zone,
    coalesce(p_customer_time_zone,v_location.time_zone),p_locale,v_hold.price_minor,
    v_hold.tax_rate_bps,v_hold.currency,v_revision.policy,v_consent_version,1::bigint,false;
end;
$function$;
comment on function private.confirm_booking_v1(text,text,uuid,text,text,jsonb,text,text,jsonb,text) is
  'Booking commit v1 engine. Claims idempotency, locks the hold, re-reads the published catalog, checks policy and consent, and commits either a confirmed booking or, when the service is approval-gated, a requested one with its wall-clock decision deadline. Calls no provider.';
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
  approval_status text, approval_deadline timestamptz, payment_status text,
  notification_status text, calendar_status text, starts_at timestamptz,
  ends_at timestamptz, service_name text, location_name text, location_time_zone text,
  customer_time_zone text, locale text, price_minor bigint, tax_rate_bps integer,
  currency text, policy_snapshot jsonb, consent_version text, booking_revision bigint,
  replayed boolean
)
language sql volatile security invoker set search_path = '' set statement_timeout = '5s' as $$
  select * from private.confirm_booking_v1(
    p_hostname,p_application,p_hold_id,p_session_token,p_idempotency_key,p_contact,
    p_consent_version,p_locale,p_intake,p_customer_time_zone);
$$;
revoke all on function api_v1.confirm_booking_v1(text,text,uuid,text,text,jsonb,text,text,jsonb,text) from public;
grant execute on function api_v1.confirm_booking_v1(text,text,uuid,text,text,jsonb,text,text,jsonb,text) to anon,authenticated;

-- Booking capability with location scope, mirroring the staff and catalog
-- helpers: a tenant-scoped grant works anywhere, a location-scoped grant works
-- only where the member is scoped, and an approval-kind grant needs AAL2.
create or replace function private.can_decide_booking(
  p_tenant_id uuid,
  p_location_id uuid,
  p_permission_key text
)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from app.memberships m
    join app.role_permissions rp on rp.tenant_id=m.tenant_id and rp.role_id=m.role_id
    where m.tenant_id=p_tenant_id
      and m.auth_user_id=(select private.current_auth_user_id())
      and m.status='active' and rp.permission_key=p_permission_key
      and (rp.grant_kind='direct' or (rp.grant_kind='approval' and (select private.is_aal2())))
      and (
        rp.scope_kind='tenant'
        or (
          p_location_id is not null and rp.scope_kind='location'
          and (select private.can_access_location(p_tenant_id,p_location_id))
        )
      )
  );
$$;
revoke execute on function private.can_decide_booking(uuid,uuid,text) from public;
grant execute on function private.can_decide_booking(uuid,uuid,text) to authenticated;

-- One staff decision on a request: accept, propose another time, or reject.
-- Competing decisions are settled by the booking revision, so exactly one wins
-- and the loser learns only that it acted on a stale read.
create or replace function private.decide_booking_request_v1(
  p_tenant_id uuid,
  p_booking_id uuid,
  p_action text,
  p_expected_revision bigint,
  p_reason_public text default null,
  p_reason_internal text default null,
  p_proposed_start timestamptz default null,
  p_request_id uuid default null
)
returns table(
  contract_version integer,
  booking_id uuid,
  status text,
  approval_status text,
  booking_revision bigint,
  proposal_expires_at timestamptz,
  proposal_action_token text
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
-- The result columns are named for the contract (booking_id, status), which
-- collides with the columns of the tables this body writes. Column wins.
#variable_conflict use_column
declare
  v_now timestamptz := statement_timestamp();
  v_correlation_id uuid := coalesce(p_request_id,pg_catalog.gen_random_uuid());
  v_booking app.bookings%rowtype;
  v_membership_id uuid;
  v_revision app.catalog_service_revisions%rowtype;
  v_status text;
  v_approval text;
  v_sequence bigint;
  v_promoted integer;
  v_token text;
  v_expires_at timestamptz;
  v_proposal_end timestamptz;
begin
  if p_action is null or p_action not in ('accept','reject','propose') then
    raise exception using errcode='22023',message='booking_invalid_action';
  end if;
  if p_reason_public is not null and char_length(p_reason_public) not between 1 and 500 then
    raise exception using errcode='22023',message='booking_invalid_reason';
  end if;
  if p_action='propose' and (p_proposed_start is null
     or p_proposed_start <> pg_catalog.date_trunc('minute',p_proposed_start)) then
    raise exception using errcode='22023',message='booking_invalid_slot';
  end if;

  -- Lock the request before reading anything derived from it, so two staff
  -- decisions serialize instead of both reading `requested`.
  select * into v_booking from app.bookings b
  where b.tenant_id=p_tenant_id and b.id=p_booking_id
  for update;
  if v_booking.id is null
     or not coalesce((select private.is_active_tenant_member(p_tenant_id)),false)
     or not coalesce((select private.can_access_location(p_tenant_id,v_booking.location_id)),false) then
    raise exception using errcode='42501',message='booking_context_required';
  end if;
  -- Authority is re-read at decision time, so a revoked grant cannot decide.
  if not coalesce((select private.can_decide_booking(
       p_tenant_id,v_booking.location_id,'booking.approve')),false) then
    raise log 'booking_decision_denied code=not_authorized correlation=% tenant=%',v_correlation_id,p_tenant_id;
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if v_booking.status <> 'requested' or v_booking.revision is distinct from p_expected_revision then
    raise log 'booking_decision_denied code=revision_conflict correlation=% tenant=% booking=%',
      v_correlation_id,p_tenant_id,v_booking.id;
    raise exception using errcode='23505',message='revision_conflict';
  end if;
  if v_booking.approval_deadline <= v_now then
    -- The SLA already elapsed. Expiry is the terminal decision; a late accept
    -- must not resurrect the request behind the customer's back.
    raise log 'booking_decision_denied code=revision_conflict correlation=% tenant=% reason=sla_elapsed',v_correlation_id,p_tenant_id;
    raise exception using errcode='23505',message='revision_conflict';
  end if;

  v_membership_id := (select private.current_membership_id(p_tenant_id));
  select max(e.sequence)+1 into v_sequence from app.booking_events e
  where e.tenant_id=p_tenant_id and e.booking_id=v_booking.id;

  if p_action='accept' then
    -- Re-read the publication the request snapshotted. Acceptance uses the same
    -- final capacity guard as instant booking: the allocation rows and the
    -- exclusion constraints decide, not this function.
    select * into v_revision from app.catalog_service_revisions sr
    where sr.tenant_id=p_tenant_id and sr.publication_id=v_booking.publication_id
      and sr.service_id=v_booking.service_id and sr.state='published'
    order by (sr.locale=v_booking.locale) desc,sr.locale limit 1;
    if v_revision.id is null then
      raise exception using errcode='23505',message='revision_conflict';
    end if;
    if v_revision.payment_mode <> 'none' then
      -- A deposit or full payment after acceptance is issue #22. Until it ships
      -- the request stays open rather than confirming an unpaid booking.
      raise log 'booking_decision_denied code=payment_pending correlation=% tenant=%',v_correlation_id,p_tenant_id;
      raise exception using errcode='23505',message='payment_pending';
    end if;

    update app.assignment_allocations a set state='confirmed'
    where a.tenant_id=p_tenant_id and a.hold_id=v_booking.hold_id and a.state='held';
    get diagnostics v_promoted = row_count;
    if v_promoted = 0 then
      -- Either the request never reserved capacity (ADR-0005 row 34 default) or
      -- its provisional hold has gone. Allocate now, and let the constraints
      -- refuse if the slot was taken meanwhile.
      insert into app.assignment_allocations(
        id,tenant_id,service_id,location_id,staff_id,resource_id,resource_type_id,
        starts_at,ends_at,buffer_before_minutes,buffer_after_minutes,state,hold_id)
      select pg_catalog.gen_random_uuid(),p_tenant_id,a.service_id,a.location_id,a.staff_id,
        a.resource_id,a.resource_type_id,a.starts_at,a.ends_at,a.buffer_before_minutes,
        a.buffer_after_minutes,'confirmed',null
      from app.assignment_allocations a
      where a.tenant_id=p_tenant_id and a.hold_id=v_booking.hold_id
      order by a.id;
      get diagnostics v_promoted = row_count;
      if v_promoted = 0 then
        raise log 'booking_decision_denied code=slot_unavailable correlation=% tenant=% reason=no_allocation',v_correlation_id,p_tenant_id;
        raise exception using errcode='23P01',message='slot_unavailable';
      end if;
    end if;
    update app.booking_holds h set state='released',released_at=v_now,updated_at=v_now
    where h.tenant_id=p_tenant_id and h.id=v_booking.hold_id and h.state='active';
    v_status := 'confirmed';
    v_approval := 'approved';
  elsif p_action='reject' then
    update app.assignment_allocations a set state='cancelled'
    where a.tenant_id=p_tenant_id and a.hold_id=v_booking.hold_id and a.state='held';
    update app.booking_holds h set state='released',released_at=v_now,updated_at=v_now
    where h.tenant_id=p_tenant_id and h.id=v_booking.hold_id and h.state='active';
    v_status := 'rejected';
    v_approval := 'declined';
  else
    -- A proposal leaves the request pending (ADR-0005 row 40) and does not
    -- extend its SLA. The customer receives an intent-scoped expiring link.
    v_proposal_end := p_proposed_start
      + make_interval(mins => v_booking.duration_minutes);
    v_expires_at := least(
      v_now + make_interval(hours =>
        private.resolve_request_policy_v1(v_booking.policy_snapshot,'proposal_ttl_hours')),
      v_booking.approval_deadline,
      p_proposed_start);
    if v_expires_at <= v_now then
      raise exception using errcode='42501',message='policy_denied';
    end if;
    -- Two random UUIDs give a 64-character hex bearer token from the built-in
    -- generator, so the token needs no extension the platform does not already
    -- depend on.
    v_token := pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','')
      || pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','');
    -- Only the digest is stored, so a database read never yields a usable link.
    begin
      insert into app.booking_proposals(
        tenant_id,booking_id,starts_at,ends_at,expires_at,action_token_hash,
        proposed_by_membership_id,message_public,correlation_id)
      values (p_tenant_id,v_booking.id,p_proposed_start,v_proposal_end,v_expires_at,
        encode(pg_catalog.sha256(pg_catalog.convert_to(p_tenant_id::text||':'||v_token,'UTF8')),'hex'),
        v_membership_id,p_reason_public,v_correlation_id);
    exception when unique_violation then
      -- A live proposal already exists, so this staff member decided from a
      -- stale read. The caller learns that, and never a constraint name.
      raise log 'booking_decision_denied code=revision_conflict correlation=% tenant=% reason=proposal_exists',v_correlation_id,p_tenant_id;
      raise exception using errcode='23505',message='revision_conflict';
    end;
    v_status := v_booking.status;
    v_approval := v_booking.approval_status;
  end if;

  if p_action <> 'propose' then
    update app.bookings b
    set status=v_status, approval_status=v_approval,
        approval_deadline=case when v_approval='pending' then b.approval_deadline end,
        decision_reason_public=coalesce(p_reason_public,b.decision_reason_public),
        revision=b.revision+1, updated_at=v_now
    where b.tenant_id=p_tenant_id and b.id=v_booking.id;
    v_booking.revision := v_booking.revision+1;
  end if;

  insert into app.booking_events(
    tenant_id,booking_id,sequence,event_type,actor_kind,actor_membership_id,
    reason,outcome,request_id,booking_revision,metadata)
  values (p_tenant_id,v_booking.id,coalesce(v_sequence,2),
    case p_action when 'accept' then 'booking_confirmed'
      when 'reject' then 'booking_rejected' else 'booking_proposal_created' end,
    'member',v_membership_id,
    -- The internal reason is lineage, never customer-facing text.
    p_reason_internal,'succeeded',v_correlation_id,v_booking.revision,
    jsonb_build_object('action',p_action,'has_public_reason',p_reason_public is not null));

  insert into app.outbox_events(tenant_id,booking_id,topic,payload,correlation_id)
  values (p_tenant_id,v_booking.id,
    case p_action when 'accept' then 'booking.confirmed'
      when 'reject' then 'booking.rejected' else 'booking.proposal_created' end,
    jsonb_build_object('booking_id',v_booking.id,'locale',v_booking.locale,
      'public_reference',v_booking.public_reference),
    v_correlation_id)
  on conflict (tenant_id,booking_id,topic) do update
    set state='pending',available_at=statement_timestamp(),updated_at=statement_timestamp();

  raise log 'booking_decided booking=% action=% correlation=% tenant=% membership=%',
    v_booking.id,p_action,v_correlation_id,p_tenant_id,v_membership_id;
  return query select 1,v_booking.id,v_status,v_approval,v_booking.revision,
    v_expires_at,v_token;
end;
$function$;
comment on function private.decide_booking_request_v1(uuid,uuid,text,bigint,text,text,timestamptz,uuid) is
  'Staff decision v1 engine. Locks the request, re-reads live authority and the published catalog, settles competing decisions by booking revision, and lets the allocation rows and their exclusion constraints decide acceptance capacity.';
revoke all on function private.decide_booking_request_v1(uuid,uuid,text,bigint,text,text,timestamptz,uuid) from public,anon;
grant execute on function private.decide_booking_request_v1(uuid,uuid,text,bigint,text,text,timestamptz,uuid) to authenticated;

create or replace function api_v1.decide_booking_request_v1(
  p_tenant_id uuid,
  p_booking_id uuid,
  p_action text,
  p_expected_revision bigint,
  p_reason_public text default null,
  p_reason_internal text default null,
  p_proposed_start timestamptz default null,
  p_request_id uuid default null
)
returns table(
  contract_version integer, booking_id uuid, status text, approval_status text,
  booking_revision bigint, proposal_expires_at timestamptz, proposal_action_token text
)
language sql volatile security invoker set search_path = '' set statement_timeout = '5s' as $$
  select * from private.decide_booking_request_v1(
    p_tenant_id,p_booking_id,p_action,p_expected_revision,p_reason_public,
    p_reason_internal,p_proposed_start,p_request_id);
$$;
revoke all on function api_v1.decide_booking_request_v1(uuid,uuid,text,bigint,text,text,timestamptz,uuid) from public,anon;
grant execute on function api_v1.decide_booking_request_v1(uuid,uuid,text,bigint,text,text,timestamptz,uuid) to authenticated;

-- Accepting a staff proposal moves the booking to the proposed time, which is
-- the reschedule shape from §6.3: new capacity is secured before the old
-- allocation is released, the revision increments, and both times stay in
-- history. The snapshot guard therefore has to let the scheduled range move
-- under a revision change while every snapshotted policy, price, and consent
-- value stays frozen.
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
        - 'calendar_status' - 'approval_status' - 'approval_deadline'
        - 'decision_reason_public' - 'revision' - 'updated_at'
        - 'starts_at' - 'ends_at')
     is distinct from
     (to_jsonb(new) - 'status' - 'payment_status' - 'notification_status'
        - 'calendar_status' - 'approval_status' - 'approval_deadline'
        - 'decision_reason_public' - 'revision' - 'updated_at'
        - 'starts_at' - 'ends_at') then
    raise exception using errcode='42501',message='booking_immutable';
  end if;
  -- A moved booking is a new revision, never a silent edit of the old one.
  if (new.starts_at,new.ends_at) is distinct from (old.starts_at,old.ends_at)
     and new.revision <= old.revision then
    raise exception using errcode='42501',message='booking_immutable';
  end if;
  return new;
end;
$$;

-- The customer side of a proposal. The link is a bearer credential scoped to
-- one intent: it can accept or decline this proposal and nothing else.
create or replace function private.respond_to_proposal_v1(
  p_hostname text,
  p_application text,
  p_action_token text,
  p_action text
)
returns table(
  contract_version integer,
  booking_id uuid,
  public_reference text,
  status text,
  approval_status text,
  starts_at timestamptz,
  ends_at timestamptz,
  proposal_state text
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
-- The result columns are named for the contract (booking_id, status), which
-- collides with the columns of the tables this body writes. Column wins.
#variable_conflict use_column
declare
  v_now timestamptz := statement_timestamp();
  v_correlation_id uuid := pg_catalog.gen_random_uuid();
  v_tenant_id uuid;
  v_proposal app.booking_proposals%rowtype;
  v_booking app.bookings%rowtype;
  v_sequence bigint;
  v_moved integer;
begin
  if p_action is null or p_action not in ('accept','decline') then
    raise exception using errcode='22023',message='booking_invalid_action';
  end if;
  if p_action_token is null or p_action_token !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='22023',message='booking_invalid_token';
  end if;
  select r.tenant_id into v_tenant_id
  from api_v1.resolve_public_tenant_v1(p_hostname,p_application) r;
  if v_tenant_id is null then
    raise exception using errcode='42501',message='booking_context_required';
  end if;

  select * into v_proposal from app.booking_proposals p
  where p.tenant_id=v_tenant_id
    and p.action_token_hash=encode(pg_catalog.sha256(
      pg_catalog.convert_to(v_tenant_id::text||':'||p_action_token,'UTF8')),'hex')
  for update;
  -- An unknown token and someone else's token are indistinguishable here.
  if v_proposal.id is null then
    raise exception using errcode='42501',message='booking_context_required';
  end if;
  if v_proposal.state <> 'pending' or v_proposal.expires_at <= v_now then
    raise log 'proposal_denied code=revision_conflict correlation=% tenant=%',v_correlation_id,v_tenant_id;
    raise exception using errcode='23505',message='revision_conflict';
  end if;

  select * into v_booking from app.bookings b
  where b.tenant_id=v_tenant_id and b.id=v_proposal.booking_id
  for update;
  if v_booking.status <> 'requested' or v_booking.approval_deadline <= v_now then
    raise exception using errcode='23505',message='revision_conflict';
  end if;
  select max(e.sequence)+1 into v_sequence from app.booking_events e
  where e.tenant_id=v_tenant_id and e.booking_id=v_booking.id;

  if p_action='decline' then
    -- Declining returns the request to its original pending decision without
    -- extending the response SLA (ADR-0005 row 40).
    update app.booking_proposals p set state='declined',updated_at=v_now where p.id=v_proposal.id;
    insert into app.booking_events(
      tenant_id,booking_id,sequence,event_type,actor_kind,outcome,request_id,
      booking_revision,metadata)
    values (v_tenant_id,v_booking.id,coalesce(v_sequence,2),'booking_proposal_declined',
      'guest','succeeded',v_correlation_id,v_booking.revision,
      jsonb_build_object('proposal_id',v_proposal.id));
    insert into app.outbox_events(tenant_id,booking_id,topic,payload,correlation_id)
    values (v_tenant_id,v_booking.id,'booking.proposal_declined',
      jsonb_build_object('booking_id',v_booking.id,'proposal_id',v_proposal.id),v_correlation_id)
    on conflict (tenant_id,booking_id,topic) do update
      set state='pending',available_at=statement_timestamp(),updated_at=statement_timestamp();
    return query select 1,v_booking.id,v_booking.public_reference,v_booking.status,
      v_booking.approval_status,v_booking.starts_at,v_booking.ends_at,'declined'::text;
    return;
  end if;

  -- Secure the proposed capacity before releasing the requested one, in this
  -- transaction. The exclusion constraints remain the final guard.
  insert into app.assignment_allocations(
    id,tenant_id,service_id,location_id,staff_id,resource_id,resource_type_id,
    starts_at,ends_at,buffer_before_minutes,buffer_after_minutes,state,hold_id)
  select pg_catalog.gen_random_uuid(),v_tenant_id,a.service_id,a.location_id,a.staff_id,
    a.resource_id,a.resource_type_id,v_proposal.starts_at,v_proposal.ends_at,
    a.buffer_before_minutes,a.buffer_after_minutes,'confirmed',null
  from app.assignment_allocations a
  where a.tenant_id=v_tenant_id and a.hold_id=v_booking.hold_id
  order by a.id;
  get diagnostics v_moved = row_count;
  if v_moved = 0 then
    raise log 'proposal_denied code=slot_unavailable correlation=% tenant=% reason=no_allocation',v_correlation_id,v_tenant_id;
    raise exception using errcode='23P01',message='slot_unavailable';
  end if;
  update app.assignment_allocations a set state='cancelled'
  where a.tenant_id=v_tenant_id and a.hold_id=v_booking.hold_id and a.state in ('held','confirmed');
  update app.booking_holds h set state='released',released_at=v_now,updated_at=v_now
  where h.tenant_id=v_tenant_id and h.id=v_booking.hold_id and h.state='active';

  update app.bookings b
  set status='confirmed', approval_status='approved', approval_deadline=null,
      starts_at=v_proposal.starts_at, ends_at=v_proposal.ends_at,
      revision=b.revision+1, updated_at=v_now
  where b.tenant_id=v_tenant_id and b.id=v_booking.id;
  update app.booking_proposals p set state='accepted',updated_at=v_now where p.id=v_proposal.id;

  insert into app.booking_events(
    tenant_id,booking_id,sequence,event_type,actor_kind,outcome,request_id,
    booking_revision,metadata)
  values (v_tenant_id,v_booking.id,coalesce(v_sequence,2),'booking_confirmed','guest',
    'succeeded',v_correlation_id,v_booking.revision+1,
    -- Both times stay in history, so the move is auditable without reading the
    -- current row.
    jsonb_build_object('proposal_id',v_proposal.id,
      'previous_starts_at',v_booking.starts_at,'starts_at',v_proposal.starts_at));
  insert into app.outbox_events(tenant_id,booking_id,topic,payload,correlation_id)
  values (v_tenant_id,v_booking.id,'booking.confirmed',
    jsonb_build_object('booking_id',v_booking.id,'locale',v_booking.locale,
      'public_reference',v_booking.public_reference,'starts_at',v_proposal.starts_at),
    v_correlation_id)
  on conflict (tenant_id,booking_id,topic) do update
    set state='pending',available_at=statement_timestamp(),updated_at=statement_timestamp();

  raise log 'proposal_accepted booking=% proposal=% correlation=% tenant=%',
    v_booking.id,v_proposal.id,v_correlation_id,v_tenant_id;
  return query select 1,v_booking.id,v_booking.public_reference,'confirmed'::text,
    'approved'::text,v_proposal.starts_at,v_proposal.ends_at,'accepted'::text;
end;
$function$;
revoke all on function private.respond_to_proposal_v1(text,text,text,text) from public;
grant execute on function private.respond_to_proposal_v1(text,text,text,text) to anon,authenticated;

create or replace function api_v1.respond_to_proposal_v1(
  p_hostname text,
  p_application text,
  p_action_token text,
  p_action text
)
returns table(
  contract_version integer, booking_id uuid, public_reference text, status text,
  approval_status text, starts_at timestamptz, ends_at timestamptz, proposal_state text
)
language sql volatile security invoker set search_path = '' set statement_timeout = '5s' as $$
  select * from private.respond_to_proposal_v1(p_hostname,p_application,p_action_token,p_action);
$$;
revoke all on function api_v1.respond_to_proposal_v1(text,text,text,text) from public;
grant execute on function api_v1.respond_to_proposal_v1(text,text,text,text) to anon,authenticated;

-- Expiry is a terminal decision (ADR-0005 row 35): an ignored request expires,
-- releases any provisional capacity exactly once, and notifies the customer.
create or replace function private.expire_booking_requests_v1(
  p_tenant_id uuid default null,
  p_limit integer default 500
)
returns table(expired_requests integer, expired_proposals integer)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_ids uuid[];
  v_expired integer;
  v_proposals integer;
begin
  if p_limit is null or p_limit not between 1 and 5000 then
    raise exception using errcode='22023',message='booking_invalid_batch';
  end if;
  select coalesce(array_agg(candidate.id),'{}'::uuid[]) into v_ids from (
    select b.id from app.bookings b
    where b.status='requested' and b.approval_deadline<=v_now
      and (p_tenant_id is null or b.tenant_id=p_tenant_id)
    order by b.approval_deadline
    limit p_limit
    for update skip locked
  ) candidate;

  update app.assignment_allocations a set state='cancelled'
  where a.hold_id in (select b.hold_id from app.bookings b where b.id = any(v_ids))
    and a.state='held';
  update app.booking_holds h set state='released',released_at=v_now,updated_at=v_now
  where h.id in (select b.hold_id from app.bookings b where b.id = any(v_ids))
    and h.state='active';

  insert into app.booking_events(
    tenant_id,booking_id,sequence,event_type,actor_kind,reason,outcome,request_id,
    booking_revision,metadata)
  select b.tenant_id,b.id,
    coalesce((select max(e.sequence)+1 from app.booking_events e
      where e.tenant_id=b.tenant_id and e.booking_id=b.id),2),
    'booking_request_expired','system','response_sla_elapsed','succeeded',
    b.correlation_id,b.revision+1,jsonb_build_object('deadline',b.approval_deadline)
  from app.bookings b where b.id = any(v_ids);
  insert into app.outbox_events(tenant_id,booking_id,topic,payload,correlation_id)
  select b.tenant_id,b.id,'booking.request_expired',
    jsonb_build_object('booking_id',b.id,'locale',b.locale,
      'public_reference',b.public_reference),b.correlation_id
  from app.bookings b where b.id = any(v_ids)
  on conflict (tenant_id,booking_id,topic) do nothing;

  with expired as (
    update app.bookings b
    set status='expired', approval_status='expired', approval_deadline=null,
        revision=b.revision+1, updated_at=v_now
    where b.id = any(v_ids) and b.status='requested'
    returning 1
  ) select count(*)::integer into v_expired from expired;

  with lapsed as (
    update app.booking_proposals p set state='expired',updated_at=v_now
    where p.state='pending' and p.expires_at<=v_now
      and (p_tenant_id is null or p.tenant_id=p_tenant_id)
    returning 1
  ) select count(*)::integer into v_proposals from lapsed;

  if v_expired > 0 or v_proposals > 0 then
    raise log 'booking_request_expiry_batch requests=% proposals=% tenant=%',
      v_expired,v_proposals,coalesce(p_tenant_id::text,'all');
  end if;
  return query select v_expired,v_proposals;
end;
$$;
revoke all on function private.expire_booking_requests_v1(uuid,integer) from public,anon,authenticated;

-- The pending-action queue. RLS decides visibility; the DTO carries the age,
-- the requested time, the deadline, and the policy the request was made under.
-- Customer identity appears only for a member who may read it, because the
-- contact row is behind its own capability policy.
create or replace function api_v1.list_booking_requests_v1(
  p_tenant_id uuid
)
returns table(
  contract_version integer, booking_id uuid, public_reference text, service_name text,
  location_id uuid, location_name text, location_time_zone text, starts_at timestamptz,
  ends_at timestamptz, requested_at timestamptz, approval_deadline timestamptz,
  booking_revision bigint, locale text, price_minor bigint, currency text,
  customer_display_name text, has_intake boolean, proposal_state text,
  proposal_starts_at timestamptz, proposal_expires_at timestamptz
)
language sql stable security invoker set search_path = '' set statement_timeout = '5s' as $$
  select 1,b.id,b.public_reference,b.service_name,b.location_id,b.location_name,
    b.location_time_zone,b.starts_at,b.ends_at,b.created_at,b.approval_deadline,
    b.revision,b.locale,b.price_minor,b.currency,
    (select c.full_name from app.booking_contacts c
      where c.tenant_id=b.tenant_id and c.booking_id=b.id),
    exists (select 1 from app.booking_intake_answers i
      where i.tenant_id=b.tenant_id and i.booking_id=b.id),
    p.state,p.starts_at,p.expires_at
  from app.bookings b
  left join app.booking_proposals p
    on p.tenant_id=b.tenant_id and p.booking_id=b.id and p.state='pending'
  where b.tenant_id=p_tenant_id and b.status='requested'
  order by b.approval_deadline,b.id
  limit 200;
$$;
revoke all on function api_v1.list_booking_requests_v1(uuid) from public,anon;
grant execute on function api_v1.list_booking_requests_v1(uuid) to authenticated;
