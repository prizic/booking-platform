-- Issue #14: a guest manages exactly one booking through an opaque, scoped,
-- expiring, revocable link, with email step-up for every action intent.
-- ADR-0004 locks the properties this migration implements:
--   4  one booking per token, expiring, single purpose, revocable
--   5  >=128 bits of entropy; only a digest is stored
--   6  one intent per token; a view token can never act
--   7  view links live to a short window past the booking end; action links 24h
--   8  action tokens are consumed on success; view tokens are reusable in TTL
--   9  every action intent needs an email OTP bound to that token and intent
--   10 every outstanding token is revoked when the booking changes state
--   11 rate limits per token, booking, email, address, and tenant
--   12 one identical answer for invalid, expired, revoked, consumed, unknown
--   16 issue, redemption, OTP request, failure, and action are all audited
--
-- Errors follow the platform vocabulary. Enumeration resistance means the
-- caller only ever learns `management_link_unavailable` (42501) for anything
-- that is not a live, in-scope token, and `policy_denied` (42501) for a
-- refused action. Neither says whether a booking or token exists.

create table app.management_tokens (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  booking_id uuid not null,
  intent text not null check (intent in (
    'view','reschedule','cancel','refund_request','request_alternative',
    'data_export','data_correction_request','data_deletion_request',
    'data_restriction_request')),
  -- Only the digest. The plaintext exists in the delivered email and nowhere
  -- else: not here, not in a log, not in analytics (ADR-0004 decision 5).
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  -- Digest of the address the link was sent to, so an OTP can be bound to the
  -- booking's current contact without copying it into a second place.
  email_hash text not null check (email_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text check (revoked_reason is null or revoked_reason in
    ('booking_state_changed','contact_corrected','customer_request','tenant_action','superseded')),
  correlation_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (id), unique (tenant_id,id),
  foreign key (tenant_id,booking_id) references app.bookings(tenant_id,id) on delete restrict
);
create index management_tokens_booking_idx on app.management_tokens(tenant_id,booking_id)
  where consumed_at is null and revoked_at is null;
create index management_tokens_expiry_idx on app.management_tokens(expires_at)
  where consumed_at is null and revoked_at is null;

-- Step-up for action intents. The code is bound to one token and therefore to
-- one intent, so an OTP issued to cancel can never authorize an export.
create table app.management_otps (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  token_id uuid not null,
  -- Null until the notification worker mints the code: the plaintext exists in
  -- the worker process and the delivered email, and nowhere else (ADR-0004
  -- decision 5 applied to the step-up code).
  code_hash text check (code_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  verified_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  primary key (id), unique (tenant_id,id),
  foreign key (tenant_id,token_id) references app.management_tokens(tenant_id,id) on delete restrict
);
-- One live challenge per token: a second code would double the guessing budget.
create unique index management_otps_one_live on app.management_otps(token_id)
  where verified_at is null;
create index management_otps_expiry_idx on app.management_otps(expires_at);

-- Append-only security trail (ADR-0004 decision 16). It records the booking,
-- the intent, and the outcome, and never the token, the code, or an address.
create table app.management_access_events (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  booking_id uuid,
  token_id uuid,
  intent text,
  action text not null check (action in
    ('issued','redeemed','otp_requested','otp_verified','otp_failed','denied','revoked')),
  outcome text not null check (outcome in ('succeeded','failed')),
  -- Tenant-salted digests only, so a network identity is never stored in the
  -- clear and cannot be correlated across tenants.
  actor_hash text check (actor_hash ~ '^[a-f0-9]{64}$'),
  request_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (id)
);
create index management_access_events_rate_idx
  on app.management_access_events(tenant_id,actor_hash,created_at);
create index management_access_events_token_idx
  on app.management_access_events(token_id,created_at);
create index management_access_events_booking_idx
  on app.management_access_events(tenant_id,booking_id,created_at);

create trigger management_access_events_append_only
  before update or delete on app.management_access_events
  for each row execute function private.enforce_append_only();
create trigger management_tokens_no_delete
  before delete on app.management_tokens
  for each row execute function private.enforce_append_only();

-- Link state is operator data: no application role reads or writes it, and the
-- guest surface reaches it only through the redemption RPCs.
do $rls$
declare t text;
begin
  foreach t in array array['management_tokens','management_otps'] loop
    execute format('alter table app.%I enable row level security',t);
    execute format('create policy %I on app.%I for select to anon,authenticated using (false)',t||'_select_denied',t);
    execute format('create policy %I on app.%I for insert to anon,authenticated with check (false)',t||'_insert_denied',t);
    execute format('create policy %I on app.%I for update to anon,authenticated using (false) with check (false)',t||'_update_denied',t);
    execute format('create policy %I on app.%I for delete to anon,authenticated using (false)',t||'_delete_denied',t);
    execute format('revoke all on app.%I from public,anon,authenticated',t);
  end loop;
end;
$rls$;

-- The security trail is readable by a scoped member with the audit capability,
-- and by nobody else.
alter table app.management_access_events enable row level security;
create policy management_access_events_select_audit on app.management_access_events
for select to authenticated
using (exists (
  select 1 from app.bookings b
  where b.tenant_id = management_access_events.tenant_id
    and b.id = management_access_events.booking_id
    and (select private.is_active_tenant_member(b.tenant_id))
    and (select private.can_decide_booking(b.tenant_id,b.location_id,'audit.read'))));
create policy management_access_events_insert_denied on app.management_access_events
  for insert to anon,authenticated with check (false);
create policy management_access_events_update_denied on app.management_access_events
  for update to anon,authenticated using (false) with check (false);
create policy management_access_events_delete_denied on app.management_access_events
  for delete to anon,authenticated using (false);
revoke all on app.management_access_events from public,anon,authenticated;
grant select on app.management_access_events to authenticated;

-- Link lifetimes are ADR-0004 decision 7: an action link lives at most 24 hours
-- and a view link at most a short window past the booking's end, whichever
-- comes first. The bounds are enforced here, not in a caller.
create or replace function private.management_token_expiry_v1(
  p_intent text,
  p_booking_end timestamptz,
  p_now timestamptz
)
returns timestamptz
language sql
immutable
security invoker
set search_path = ''
as $$
  select least(
    p_now + case when p_intent = 'view' then interval '30 days' else interval '24 hours' end,
    p_booking_end + interval '7 days'
  );
$$;

create or replace function private.issue_management_token_v1(
  p_tenant_id uuid,
  p_booking_id uuid,
  p_intent text,
  p_request_id uuid default null
)
returns table(token text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_booking app.bookings%rowtype;
  v_email text;
  v_token text;
  v_expires_at timestamptz;
  v_token_id uuid;
begin
  select * into v_booking from app.bookings b
  where b.tenant_id=p_tenant_id and b.id=p_booking_id;
  if v_booking.id is null then
    raise exception using errcode='42501',message='management_link_unavailable';
  end if;
  select c.email into v_email from app.booking_contacts c
  where c.tenant_id=p_tenant_id and c.booking_id=p_booking_id;
  if v_email is null then
    raise exception using errcode='42501',message='management_link_unavailable';
  end if;

  -- Two random UUIDs give a 64-character hex token with well over the 128 bits
  -- of entropy ADR-0004 decision 5 requires, from the built-in generator.
  v_token := pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','')
    || pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','');
  v_expires_at := private.management_token_expiry_v1(p_intent,v_booking.ends_at,v_now);
  if v_expires_at <= v_now then
    raise exception using errcode='42501',message='management_link_unavailable';
  end if;

  -- Superseding keeps one live link per intent, so an older forwarded email
  -- stops working the moment a newer one is sent.
  update app.management_tokens t
  set revoked_at=v_now, revoked_reason='superseded'
  where t.tenant_id=p_tenant_id and t.booking_id=p_booking_id and t.intent=p_intent
    and t.consumed_at is null and t.revoked_at is null;

  insert into app.management_tokens(
    tenant_id,booking_id,intent,token_hash,email_hash,expires_at,correlation_id)
  values (p_tenant_id,p_booking_id,p_intent,
    encode(pg_catalog.sha256(pg_catalog.convert_to(p_tenant_id::text||':'||v_token,'UTF8')),'hex'),
    encode(pg_catalog.sha256(pg_catalog.convert_to(p_tenant_id::text||':'||lower(v_email),'UTF8')),'hex'),
    v_expires_at,coalesce(p_request_id,v_booking.correlation_id))
  returning id into v_token_id;

  insert into app.management_access_events(
    tenant_id,booking_id,token_id,intent,action,outcome,request_id)
  values (p_tenant_id,p_booking_id,v_token_id,p_intent,'issued','succeeded',
    coalesce(p_request_id,v_booking.correlation_id));
  raise log 'management_link_issued booking=% intent=% tenant=%',p_booking_id,p_intent,p_tenant_id;
  return query select v_token,v_expires_at;
end;
$$;
revoke all on function private.issue_management_token_v1(uuid,uuid,text,uuid) from public,anon,authenticated;

-- Decision 10: any booking state change revokes every outstanding link, and the
-- notification for the new state carries a new one.
create or replace function private.revoke_management_tokens_on_state_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     or new.approval_status is distinct from old.approval_status
     or new.starts_at is distinct from old.starts_at then
    update app.management_tokens t
    set revoked_at=statement_timestamp(), revoked_reason='booking_state_changed'
    where t.tenant_id=new.tenant_id and t.booking_id=new.id
      and t.consumed_at is null and t.revoked_at is null;
    insert into app.management_access_events(
      tenant_id,booking_id,intent,action,outcome,request_id)
    select new.tenant_id,new.id,null,'revoked','succeeded',new.correlation_id
    where exists (select 1 from app.management_tokens t
      where t.tenant_id=new.tenant_id and t.booking_id=new.id
        and t.revoked_reason='booking_state_changed');
  end if;
  return new;
end;
$$;
create trigger bookings_revoke_management_tokens
  after update on app.bookings
  for each row execute function private.revoke_management_tokens_on_state_change();

-- Redemption. Every failure — unknown, expired, revoked, consumed, wrong host,
-- wrong tenant, rate limited — returns the same error, so the surface never
-- discloses whether a booking or a token exists (ADR-0004 decision 12).
create or replace function private.redeem_management_token_v1(
  p_hostname text,
  p_application text,
  p_token text,
  p_intent text default 'view'
)
returns table(
  contract_version integer,
  -- Every refusal is the same row: outcome `unavailable` with nothing else. It
  -- is a returned value, not an exception, so the audit row and the rate-limit
  -- counters this call just wrote survive the transaction (ADR-0004 11 and 12).
  outcome text,
  booking_id uuid,
  public_reference text,
  intent text,
  status text,
  approval_status text,
  payment_status text,
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
  consent_version text,
  policy_snapshot jsonb,
  booking_revision bigint,
  token_expires_at timestamptz,
  can_reschedule boolean,
  can_cancel boolean,
  step_up_required boolean,
  step_up_verified boolean
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
#variable_conflict use_column
declare
  v_now timestamptz := statement_timestamp();
  v_request_id uuid := pg_catalog.gen_random_uuid();
  v_tenant_id uuid;
  v_token app.management_tokens%rowtype;
  v_booking app.bookings%rowtype;
  v_actor_hash text;
  v_forwarded text;
  v_verified boolean := false;
  v_cancel_cutoff integer;
  v_reschedule_cutoff integer;
  -- Platform ceilings. They are never named in an error or a log line.
  v_actor_limit constant integer := 30;
  v_token_limit constant integer := 60;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$'
     or p_intent is null or p_intent not in (
       'view','reschedule','cancel','refund_request','request_alternative',
       'data_export','data_correction_request','data_deletion_request',
       'data_restriction_request') then
    return query select 1,'unavailable'::text,null::uuid,null::text,null::text,null::text,
      null::text,null::text,null::timestamptz,null::timestamptz,null::text,null::text,
      null::text,null::text,null::text,null::bigint,null::integer,null::text,null::text,
      null::jsonb,null::bigint,null::timestamptz,null::boolean,null::boolean,
      null::boolean,null::boolean;
    return;
  end if;
  -- The hostname must resolve to a verified production domain of a live tenant,
  -- so a forwarded link opened on another tenant's host resolves to nothing.
  select r.tenant_id into v_tenant_id
  from api_v1.resolve_public_tenant_v1(p_hostname,p_application) r;
  if v_tenant_id is null then
    -- A link opened on an unverified or another tenant's host resolves to
    -- nothing, and says exactly as much as every other refusal.
    return query select 1,'unavailable'::text,null::uuid,null::text,null::text,null::text,
      null::text,null::text,null::timestamptz,null::timestamptz,null::text,null::text,
      null::text,null::text,null::text,null::bigint,null::integer,null::text,null::text,
      null::jsonb,null::bigint,null::timestamptz,null::boolean,null::boolean,
      null::boolean,null::boolean;
    return;
  end if;

  begin
    v_forwarded := btrim(split_part(
      coalesce(pg_catalog.current_setting('request.headers',true),'{}')::jsonb->>'x-forwarded-for',',',1));
  exception when others then
    v_forwarded := null;
  end;
  v_actor_hash := case when coalesce(v_forwarded,'')='' then null else encode(pg_catalog.sha256(
    pg_catalog.convert_to(v_tenant_id::text||':'||v_forwarded,'UTF8')),'hex') end;

  -- Rate limits are enforced before the token is looked at, so a guessing
  -- attempt cannot use timing to learn whether a token exists.
  if v_actor_hash is not null and (
    select count(*) from app.management_access_events e
    where e.tenant_id=v_tenant_id and e.actor_hash=v_actor_hash
      and e.created_at > v_now - interval '10 minutes') >= v_actor_limit then
    insert into app.management_access_events(
      tenant_id,action,outcome,actor_hash,request_id)
    values (v_tenant_id,'denied','failed',v_actor_hash,v_request_id);
    raise log 'management_link_denied reason=rate_limited tenant=% request=%',v_tenant_id,v_request_id;
    return query select 1,'unavailable'::text,null::uuid,null::text,null::text,null::text,
      null::text,null::text,null::timestamptz,null::timestamptz,null::text,null::text,
      null::text,null::text,null::text,null::bigint,null::integer,null::text,null::text,
      null::jsonb,null::bigint,null::timestamptz,null::boolean,null::boolean,
      null::boolean,null::boolean;
    return;
  end if;

  select * into v_token from app.management_tokens t
  where t.tenant_id=v_tenant_id
    and t.token_hash=encode(pg_catalog.sha256(
      pg_catalog.convert_to(v_tenant_id::text||':'||p_token,'UTF8')),'hex');

  if v_token.id is null
     or v_token.intent is distinct from p_intent
     or v_token.expires_at <= v_now
     or v_token.revoked_at is not null
     or v_token.consumed_at is not null
     or (select count(*) from app.management_access_events e
         where e.token_id=v_token.id and e.created_at > v_now - interval '10 minutes')
        >= v_token_limit then
    insert into app.management_access_events(
      tenant_id,booking_id,token_id,intent,action,outcome,actor_hash,request_id)
    values (v_tenant_id,v_token.booking_id,v_token.id,p_intent,'denied','failed',
      v_actor_hash,v_request_id);
    raise log 'management_link_denied tenant=% request=%',v_tenant_id,v_request_id;
    return query select 1,'unavailable'::text,null::uuid,null::text,null::text,null::text,
      null::text,null::text,null::timestamptz,null::timestamptz,null::text,null::text,
      null::text,null::text,null::text,null::bigint,null::integer,null::text,null::text,
      null::jsonb,null::bigint,null::timestamptz,null::boolean,null::boolean,
      null::boolean,null::boolean;
    return;
  end if;

  -- The token establishes which booking; the row is still read under the same
  -- tenant scope every other read uses (ADR-0004 decision 15).
  select * into v_booking from app.bookings b
  where b.tenant_id=v_tenant_id and b.id=v_token.booking_id;
  if v_booking.id is null then
    return query select 1,'unavailable'::text,null::uuid,null::text,null::text,null::text,
      null::text,null::text,null::timestamptz,null::timestamptz,null::text,null::text,
      null::text,null::text,null::text,null::bigint,null::integer,null::text,null::text,
      null::jsonb,null::bigint,null::timestamptz,null::boolean,null::boolean,
      null::boolean,null::boolean;
    return;
  end if;

  -- Step-up state: every intent except `view` needs a verified, unexpired OTP
  -- bound to this token (ADR-0004 decision 9).
  select exists (
    select 1 from app.management_otps o
    where o.token_id=v_token.id and o.verified_at is not null
      and o.verified_at > v_now - interval '15 minutes')
  into v_verified;

  -- Eligibility is evaluated against the snapshotted policy (ADR-0006), never
  -- the tenant's current configuration.
  v_cancel_cutoff := coalesce((v_booking.policy_snapshot->>'cancellation_cutoff_minutes')::integer,1440);
  v_reschedule_cutoff := coalesce((v_booking.policy_snapshot->>'reschedule_cutoff_minutes')::integer,1440);

  insert into app.management_access_events(
    tenant_id,booking_id,token_id,intent,action,outcome,actor_hash,request_id)
  values (v_tenant_id,v_booking.id,v_token.id,p_intent,'redeemed','succeeded',
    v_actor_hash,v_request_id);

  return query select 1,'granted'::text,v_booking.id,v_booking.public_reference,v_token.intent,
    v_booking.status,v_booking.approval_status,v_booking.payment_status,
    v_booking.starts_at,v_booking.ends_at,v_booking.service_name,v_booking.location_name,
    v_booking.location_time_zone,v_booking.customer_time_zone,v_booking.locale,
    v_booking.price_minor,v_booking.tax_rate_bps,v_booking.currency,
    v_booking.consent_version,v_booking.policy_snapshot,v_booking.revision,
    v_token.expires_at,
    (v_booking.status='confirmed'
      and coalesce((v_booking.policy_snapshot->>'reschedule_customer_self_service')::boolean,true)
      and v_booking.starts_at - make_interval(mins=>v_reschedule_cutoff) > v_now),
    (v_booking.status in ('confirmed','requested')
      and coalesce((v_booking.policy_snapshot->>'cancellation_customer_self_service')::boolean,true)
      and v_booking.starts_at - make_interval(mins=>v_cancel_cutoff) > v_now),
    p_intent <> 'view',
    v_verified;
end;
$function$;
revoke all on function private.redeem_management_token_v1(text,text,text,text) from public;
grant execute on function private.redeem_management_token_v1(text,text,text,text) to anon,authenticated;

create or replace function api_v1.redeem_management_token_v1(
  p_hostname text,
  p_application text,
  p_token text,
  p_intent text default 'view'
)
returns table(
  contract_version integer, outcome text, booking_id uuid, public_reference text,
  intent text, status text, approval_status text, payment_status text, starts_at timestamptz,
  ends_at timestamptz, service_name text, location_name text, location_time_zone text,
  customer_time_zone text, locale text, price_minor bigint, tax_rate_bps integer,
  currency text, consent_version text, policy_snapshot jsonb, booking_revision bigint,
  token_expires_at timestamptz, can_reschedule boolean, can_cancel boolean,
  step_up_required boolean, step_up_verified boolean
)
language sql volatile security invoker set search_path = '' set statement_timeout = '5s' as $$
  select * from private.redeem_management_token_v1(p_hostname,p_application,p_token,p_intent);
$$;
revoke all on function api_v1.redeem_management_token_v1(text,text,text,text) from public;
grant execute on function api_v1.redeem_management_token_v1(text,text,text,text) to anon,authenticated;

-- OTP request. The code is delivered by the notification worker (issue #19);
-- this transaction records the intent and never sends anything itself.
create or replace function private.request_management_otp_v1(
  p_hostname text,
  p_application text,
  p_token text
)
returns table(contract_version integer, outcome text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
#variable_conflict use_column
declare
  v_now timestamptz := statement_timestamp();
  v_request_id uuid := pg_catalog.gen_random_uuid();
  v_tenant_id uuid;
  v_token app.management_tokens%rowtype;
  v_otp_id uuid;
  v_expires_at timestamptz := statement_timestamp() + interval '10 minutes';
  v_recent integer;
begin
  select r.tenant_id into v_tenant_id
  from api_v1.resolve_public_tenant_v1(p_hostname,p_application) r;
  if v_tenant_id is null or p_token is null or p_token !~ '^[a-f0-9]{64}$' then
    return query select 1,'unavailable'::text,null::timestamptz;
    return;
  end if;
  select * into v_token from app.management_tokens t
  where t.tenant_id=v_tenant_id
    and t.token_hash=encode(pg_catalog.sha256(
      pg_catalog.convert_to(v_tenant_id::text||':'||p_token,'UTF8')),'hex');
  select count(*) into v_recent from app.management_access_events e
  where e.token_id=v_token.id and e.action='otp_requested'
    and e.created_at > v_now - interval '10 minutes';
  if v_token.id is null or v_token.intent='view' or v_token.expires_at <= v_now
     or v_token.revoked_at is not null or v_token.consumed_at is not null
     or coalesce(v_recent,0) >= 3 then
    insert into app.management_access_events(
      tenant_id,booking_id,token_id,intent,action,outcome,request_id)
    values (v_tenant_id,v_token.booking_id,v_token.id,v_token.intent,'denied','failed',v_request_id);
    return query select 1,'unavailable'::text,null::timestamptz;
    return;
  end if;

  -- The challenge is created without a code. The notification worker mints one
  -- when it sends the email, so no code plaintext is ever written here.
  delete from app.management_otps o where o.token_id=v_token.id and o.verified_at is null;
  insert into app.management_otps(tenant_id,token_id,expires_at)
  values (v_tenant_id,v_token.id,v_expires_at)
  returning id into v_otp_id;

  insert into app.outbox_events(tenant_id,booking_id,topic,payload,correlation_id)
  values (v_tenant_id,v_token.booking_id,'management.otp_requested',
    jsonb_build_object('otp_id',v_otp_id,'expires_at',v_expires_at),
    v_request_id)
  on conflict (tenant_id,booking_id,topic) do update
    set payload=excluded.payload, state='pending',
        available_at=statement_timestamp(), updated_at=statement_timestamp();

  insert into app.management_access_events(
    tenant_id,booking_id,token_id,intent,action,outcome,request_id)
  values (v_tenant_id,v_token.booking_id,v_token.id,v_token.intent,'otp_requested','succeeded',v_request_id);
  raise log 'management_otp_requested booking=% intent=% tenant=%',v_token.booking_id,v_token.intent,v_tenant_id;
  return query select 1,'sent'::text,v_expires_at;
end;
$function$;
revoke all on function private.request_management_otp_v1(text,text,text) from public;
grant execute on function private.request_management_otp_v1(text,text,text) to anon,authenticated;

create or replace function api_v1.request_management_otp_v1(
  p_hostname text,
  p_application text,
  p_token text
)
returns table(contract_version integer, outcome text, expires_at timestamptz)
language sql volatile security invoker set search_path = '' set statement_timeout = '5s' as $$
  select * from private.request_management_otp_v1(p_hostname,p_application,p_token);
$$;
revoke all on function api_v1.request_management_otp_v1(text,text,text) from public;
grant execute on function api_v1.request_management_otp_v1(text,text,text) to anon,authenticated;


-- Worker-only: the notification job (issue #19) mints the step-up code when it
-- is about to send it, so the plaintext lives in that process and the delivered
-- email and is never written to a table, a log, or an outbox payload.
create or replace function private.mint_management_otp_code_v1(p_otp_id uuid)
returns table(code text, expires_at timestamptz, booking_id uuid, intent text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_otp app.management_otps%rowtype;
  v_token app.management_tokens%rowtype;
  v_code text;
begin
  select * into v_otp from app.management_otps o
  where o.id=p_otp_id and o.verified_at is null and o.expires_at > v_now
  for update;
  if v_otp.id is null then
    raise exception using errcode='42501',message='management_link_unavailable';
  end if;
  select * into v_token from app.management_tokens t where t.id=v_otp.token_id;
  if v_token.id is null or v_token.revoked_at is not null
     or v_token.consumed_at is not null or v_token.expires_at <= v_now then
    raise exception using errcode='42501',message='management_link_unavailable';
  end if;
  -- Six uniformly drawn digits from the built-in generator.
  v_code := lpad(((('x'||substr(pg_catalog.replace(
    pg_catalog.gen_random_uuid()::text,'-',''),1,8))::bit(32)::bigint) % 1000000)::text,6,'0');
  update app.management_otps o
  set code_hash=encode(pg_catalog.sha256(
    pg_catalog.convert_to(v_token.id::text||':'||v_code,'UTF8')),'hex')
  where o.id=v_otp.id;
  return query select v_code,v_otp.expires_at,v_token.booking_id,v_token.intent;
end;
$$;
revoke all on function private.mint_management_otp_code_v1(uuid) from public,anon,authenticated;

create or replace function private.verify_management_otp_v1(
  p_hostname text,
  p_application text,
  p_token text,
  p_code text
)
returns table(contract_version integer, verified boolean)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
#variable_conflict use_column
declare
  v_now timestamptz := statement_timestamp();
  v_request_id uuid := pg_catalog.gen_random_uuid();
  v_tenant_id uuid;
  v_token app.management_tokens%rowtype;
  v_otp app.management_otps%rowtype;
  v_max_attempts constant integer := 5;
begin
  select r.tenant_id into v_tenant_id
  from api_v1.resolve_public_tenant_v1(p_hostname,p_application) r;
  if v_tenant_id is null or p_token is null or p_token !~ '^[a-f0-9]{64}$'
     or p_code is null or p_code !~ '^[0-9]{6}$' then
    return query select 1,false;
    return;
  end if;
  select * into v_token from app.management_tokens t
  where t.tenant_id=v_tenant_id
    and t.token_hash=encode(pg_catalog.sha256(
      pg_catalog.convert_to(v_tenant_id::text||':'||p_token,'UTF8')),'hex');
  select * into v_otp from app.management_otps o
  where o.token_id=v_token.id and o.verified_at is null
  for update;

  if v_token.id is null or v_token.expires_at <= v_now
     or v_token.revoked_at is not null or v_token.consumed_at is not null
     or v_otp.id is null or v_otp.code_hash is null or v_otp.expires_at <= v_now
     or v_otp.attempts >= v_max_attempts then
    insert into app.management_access_events(
      tenant_id,booking_id,token_id,intent,action,outcome,request_id)
    values (v_tenant_id,v_token.booking_id,v_token.id,v_token.intent,'denied','failed',v_request_id);
    return query select 1,false;
    return;
  end if;

  if v_otp.code_hash is distinct from encode(pg_catalog.sha256(
       pg_catalog.convert_to(v_token.id::text||':'||p_code,'UTF8')),'hex') then
    -- A wrong code costs an attempt and is audited. Lockout is the attempt
    -- ceiling above; the caller is never told how many remain.
    update app.management_otps o set attempts=o.attempts+1 where o.id=v_otp.id;
    insert into app.management_access_events(
      tenant_id,booking_id,token_id,intent,action,outcome,request_id)
    values (v_tenant_id,v_token.booking_id,v_token.id,v_token.intent,'otp_failed','failed',v_request_id);
    raise log 'management_otp_failed booking=% tenant=%',v_token.booking_id,v_tenant_id;
    -- Returned, not raised: the spent attempt and its audit row must survive.
    return query select 1,false;
    return;
  end if;

  update app.management_otps o set verified_at=v_now where o.id=v_otp.id;
  insert into app.management_access_events(
    tenant_id,booking_id,token_id,intent,action,outcome,request_id)
  values (v_tenant_id,v_token.booking_id,v_token.id,v_token.intent,'otp_verified','succeeded',v_request_id);
  raise log 'management_otp_verified booking=% intent=% tenant=%',v_token.booking_id,v_token.intent,v_tenant_id;
  return query select 1,true;
end;
$function$;
revoke all on function private.verify_management_otp_v1(text,text,text,text) from public;
grant execute on function private.verify_management_otp_v1(text,text,text,text) to anon,authenticated;

create or replace function api_v1.verify_management_otp_v1(
  p_hostname text,
  p_application text,
  p_token text,
  p_code text
)
returns table(contract_version integer, verified boolean)
language sql volatile security invoker set search_path = '' set statement_timeout = '5s' as $$
  select * from private.verify_management_otp_v1(p_hostname,p_application,p_token,p_code);
$$;
revoke all on function api_v1.verify_management_otp_v1(text,text,text,text) from public;
grant execute on function api_v1.verify_management_otp_v1(text,text,text,text) to anon,authenticated;

-- Elapsed links and challenges are cleared by the same batched shape the hold
-- and request jobs use.
create or replace function private.expire_management_links_v1(
  p_tenant_id uuid default null,
  p_limit integer default 500
)
returns table(expired_tokens integer, purged_otps integer)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_expired integer;
  v_purged integer;
begin
  if p_limit is null or p_limit not between 1 and 5000 then
    raise exception using errcode='22023',message='management_invalid_batch';
  end if;
  with revoked as (
    update app.management_tokens t
    set revoked_at=v_now, revoked_reason='superseded'
    where t.id in (
      select c.id from app.management_tokens c
      where c.expires_at<=v_now and c.revoked_at is null and c.consumed_at is null
        and (p_tenant_id is null or c.tenant_id=p_tenant_id)
      order by c.expires_at limit p_limit for update skip locked)
    returning 1
  ) select count(*)::integer into v_expired from revoked;
  with purged as (
    delete from app.management_otps o
    where o.expires_at <= v_now - interval '1 hour'
      and (p_tenant_id is null or o.tenant_id=p_tenant_id)
    returning 1
  ) select count(*)::integer into v_purged from purged;
  return query select v_expired,v_purged;
end;
$$;
revoke all on function private.expire_management_links_v1(uuid,integer) from public,anon,authenticated;

alter table app.outbox_events drop constraint outbox_events_topic_check;
alter table app.outbox_events add constraint outbox_events_topic_check
  check (topic in ('booking.confirmed','booking.requested','booking.rejected',
    'booking.request_expired','booking.proposal_created','booking.proposal_declined',
    'management.otp_requested'));
