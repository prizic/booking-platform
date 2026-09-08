-- Issue #19: durable booking email. The outbox rows the booking transactions
-- already write become messages, attempts, and a provider event ledger, drained
-- by a worker that calls the provider outside every business transaction.
--
--   booking transaction -> app.outbox_events (committed with the booking)
--     -> private.claim_notification_batch_v1 (visibility timeout, bounded)
--       -> worker -> provider adapter
--         -> private.record_notification_attempt_v1 (durable success or retry)
--   provider webhook -> private.record_notification_event_v1 (verified, dedup)
--
-- Nothing here calls a provider. The booking commits when the provider is down,
-- and provider truth never rewrites booking truth.

-- Immutable template identity. A template key plus locale plus version is what
-- a message is rendered from; the bodies themselves live in the platform's own
-- code, so a tenant edit can never change a legally required string.
create table app.notification_templates (
  key text not null check (key in (
    'booking.confirmed','booking.requested','booking.rejected',
    'booking.request_expired','booking.proposal_created','booking.proposal_declined',
    'booking.rescheduled','booking.cancelled','management.otp_requested')),
  locale text not null check (locale in ('en','ar')),
  version integer not null check (version > 0),
  -- The variables the renderer is allowed to receive. A payload with anything
  -- else is a defect and fails before a provider is called.
  variable_schema jsonb not null check (jsonb_typeof(variable_schema) = 'array'),
  retired_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  primary key (key,locale,version)
);
create unique index notification_templates_live on app.notification_templates(key,locale)
  where retired_at is null;

-- One message per tenant, booking, event type, revision, recipient, and locale.
-- That tuple is the durable idempotency key (§17): a duplicate dispatch finds
-- the message that already exists instead of sending a second one.
create table app.notification_messages (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  booking_id uuid,
  outbox_event_id uuid not null,
  template_key text not null,
  template_locale text not null check (template_locale in ('en','ar')),
  template_version integer not null check (template_version > 0),
  booking_revision bigint not null default 0 check (booking_revision >= 0),
  -- Recipients are addressed by digest here. The address itself is read from
  -- the booking contact at send time and never copied into this ledger.
  recipient_hash text not null check (recipient_hash ~ '^[a-f0-9]{64}$'),
  -- `sending` is claimed-but-unanswered; `sent` is handed to the provider and
  -- awaiting its callback; `delivered` is the provider's own confirmation.
  status text not null default 'queued' check (status in
    ('queued','sending','sent','delivered','bounced','complained','failed','suppressed')),
  attempts integer not null default 0 check (attempts between 0 and 10),
  next_attempt_at timestamptz not null default statement_timestamp(),
  -- Held by a claiming worker until this instant; another worker may claim it
  -- again afterwards, which is what makes a crashed worker recoverable.
  locked_until timestamptz,
  provider text not null default 'resend',
  provider_message_reference text,
  last_error_code text,
  dead_lettered_at timestamptz,
  correlation_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (id), unique (tenant_id,id),
  unique (tenant_id,booking_id,template_key,booking_revision,recipient_hash,template_locale),
  foreign key (tenant_id,booking_id) references app.bookings(tenant_id,id) on delete restrict,
  foreign key (outbox_event_id) references app.outbox_events(id) on delete restrict
);
create index notification_messages_due_idx
  on app.notification_messages(next_attempt_at)
  where status in ('queued','sending') and dead_lettered_at is null;
create index notification_messages_booking_idx
  on app.notification_messages(tenant_id,booking_id,created_at);

-- Every provider call, whatever its result. Attempts are the operational
-- history a resend decision is made from.
create table app.notification_attempts (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  message_id uuid not null,
  attempt integer not null check (attempt between 1 and 10),
  outcome text not null check (outcome in ('accepted','retryable_error','permanent_error')),
  provider_message_reference text,
  -- A short stable code, never a provider body: a provider error can quote an
  -- address, and this table is read by operators.
  error_code text check (error_code is null or char_length(error_code) between 1 and 80),
  started_at timestamptz not null,
  finished_at timestamptz not null default statement_timestamp(),
  primary key (id),
  unique (message_id,attempt),
  foreign key (tenant_id,message_id) references app.notification_messages(tenant_id,id) on delete restrict
);

-- Verified provider callbacks, deduplicated by the provider's own event id.
create table app.notification_provider_events (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  message_id uuid,
  provider text not null default 'resend',
  provider_event_id text not null check (char_length(provider_event_id) between 1 and 200),
  event_type text not null check (event_type in
    ('delivered','delayed','bounced','complained','failed','suppressed','opened','clicked')),
  -- The provider's own timestamp, so out-of-order delivery is detectable.
  occurred_at timestamptz not null,
  received_at timestamptz not null default statement_timestamp(),
  applied boolean not null default false,
  primary key (id),
  unique (provider,provider_event_id),
  foreign key (tenant_id,message_id) references app.notification_messages(tenant_id,id) on delete restrict
);
create index notification_provider_events_message_idx
  on app.notification_provider_events(message_id,occurred_at);

-- A hard bounce or a complaint suppresses an address for one tenant. It is the
-- tenant's own suppression scope: another tenant's mail is unaffected.
create table app.notification_suppressions (
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  recipient_hash text not null check (recipient_hash ~ '^[a-f0-9]{64}$'),
  reason text not null check (reason in ('hard_bounce','complaint','manual')),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id,recipient_hash)
);

-- Delivery state is operator data. The Dashboard reads it through its own
-- policy; nothing writes it but the worker path.
do $rls$
declare t text;
begin
  foreach t in array array['notification_templates','notification_messages',
    'notification_attempts','notification_provider_events','notification_suppressions'] loop
    execute format('alter table app.%I enable row level security',t);
    execute format('create policy %I on app.%I for insert to anon,authenticated with check (false)',t||'_insert_denied',t);
    execute format('create policy %I on app.%I for update to anon,authenticated using (false) with check (false)',t||'_update_denied',t);
    execute format('create policy %I on app.%I for delete to anon,authenticated using (false)',t||'_delete_denied',t);
    execute format('revoke all on app.%I from public,anon,authenticated',t);
  end loop;
end;
$rls$;
create policy notification_templates_select_denied on app.notification_templates
  for select to anon,authenticated using (false);
create policy notification_attempts_select_denied on app.notification_attempts
  for select to anon,authenticated using (false);
create policy notification_provider_events_select_denied on app.notification_provider_events
  for select to anon,authenticated using (false);
create policy notification_suppressions_select_denied on app.notification_suppressions
  for select to anon,authenticated using (false);
-- A scoped member may see whether a booking's mail went out, and nothing about
-- any other tenant's or any other booking's mail.
create policy notification_messages_select_scoped on app.notification_messages
for select to authenticated
using (exists (
  select 1 from app.bookings b
  where b.tenant_id = notification_messages.tenant_id
    and b.id = notification_messages.booking_id
    and (select private.is_active_tenant_member(b.tenant_id))
    and (select private.can_access_location(b.tenant_id,b.location_id))));
create policy notification_messages_select_denied_anon on app.notification_messages
  for select to anon using (false);
grant select on app.notification_messages to authenticated;

insert into app.notification_templates(key,locale,version,variable_schema) values
  ('booking.confirmed','en',1,'["publicReference","serviceName","locationName","startAt","timeZone","manageUrl","price","brandName"]'::jsonb),
  ('booking.confirmed','ar',1,'["publicReference","serviceName","locationName","startAt","timeZone","manageUrl","price","brandName"]'::jsonb),
  ('booking.requested','en',1,'["publicReference","serviceName","startAt","timeZone","decisionDeadline","manageUrl","brandName"]'::jsonb),
  ('booking.requested','ar',1,'["publicReference","serviceName","startAt","timeZone","decisionDeadline","manageUrl","brandName"]'::jsonb),
  ('booking.rejected','en',1,'["publicReference","serviceName","publicReason","brandName"]'::jsonb),
  ('booking.rejected','ar',1,'["publicReference","serviceName","publicReason","brandName"]'::jsonb),
  ('booking.request_expired','en',1,'["publicReference","serviceName","brandName"]'::jsonb),
  ('booking.request_expired','ar',1,'["publicReference","serviceName","brandName"]'::jsonb),
  ('booking.proposal_created','en',1,'["publicReference","serviceName","proposedStartAt","timeZone","proposalUrl","brandName"]'::jsonb),
  ('booking.proposal_created','ar',1,'["publicReference","serviceName","proposedStartAt","timeZone","proposalUrl","brandName"]'::jsonb),
  ('booking.proposal_declined','en',1,'["publicReference","serviceName","brandName"]'::jsonb),
  ('booking.proposal_declined','ar',1,'["publicReference","serviceName","brandName"]'::jsonb),
  ('booking.rescheduled','en',1,'["publicReference","serviceName","startAt","timeZone","manageUrl","brandName"]'::jsonb),
  ('booking.rescheduled','ar',1,'["publicReference","serviceName","startAt","timeZone","manageUrl","brandName"]'::jsonb),
  ('booking.cancelled','en',1,'["publicReference","serviceName","refund","publicReason","brandName"]'::jsonb),
  ('booking.cancelled','ar',1,'["publicReference","serviceName","refund","publicReason","brandName"]'::jsonb),
  ('management.otp_requested','en',1,'["code","expiresAt","brandName"]'::jsonb),
  ('management.otp_requested','ar',1,'["code","expiresAt","brandName"]'::jsonb);

-- Materialize due outbox rows into messages. This runs in the worker, never in
-- a booking transaction, and is safe to run concurrently with itself.
create or replace function private.dispatch_notifications_v1(
  p_tenant_id uuid default null,
  p_limit integer default 100
)
returns table(dispatched integer, suppressed integer)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_dispatched integer := 0;
  v_suppressed integer := 0;
  v_row record;
  v_locale text;
  v_recipient_hash text;
  v_version integer;
begin
  if p_limit is null or p_limit not between 1 and 1000 then
    raise exception using errcode='22023',message='notification_invalid_batch';
  end if;
  for v_row in
    select o.* from app.outbox_events o
    where o.state='pending' and o.available_at<=v_now
      and (p_tenant_id is null or o.tenant_id=p_tenant_id)
    order by o.available_at
    limit p_limit
    for update skip locked
  loop
    select lower(c.email), coalesce(b.locale,'en')
    into v_recipient_hash, v_locale
    from app.bookings b
    join app.booking_contacts c on c.tenant_id=b.tenant_id and c.booking_id=b.id
    where b.tenant_id=v_row.tenant_id and b.id=v_row.booking_id;
    if v_recipient_hash is null then
      -- Nothing to address. The intent is closed rather than retried forever.
      update app.outbox_events e set state='failed', updated_at=v_now where e.id=v_row.id;
      continue;
    end if;
    v_recipient_hash := encode(pg_catalog.sha256(
      pg_catalog.convert_to(v_row.tenant_id::text||':'||v_recipient_hash,'UTF8')),'hex');
    select t.version into v_version from app.notification_templates t
    where t.key=v_row.topic and t.locale=v_locale and t.retired_at is null;
    if v_version is null then
      update app.outbox_events e set state='failed', updated_at=v_now where e.id=v_row.id;
      continue;
    end if;

    if exists (select 1 from app.notification_suppressions s
      where s.tenant_id=v_row.tenant_id and s.recipient_hash=v_recipient_hash) then
      -- A suppressed address is a recorded outcome, not a silent drop.
      insert into app.notification_messages(
        tenant_id,booking_id,outbox_event_id,template_key,template_locale,template_version,
        booking_revision,recipient_hash,status,correlation_id)
      values (v_row.tenant_id,v_row.booking_id,v_row.id,v_row.topic,v_locale,v_version,
        v_row.booking_revision,v_recipient_hash,'suppressed',v_row.correlation_id)
      on conflict do nothing;
      update app.outbox_events e set state='delivered', updated_at=v_now where e.id=v_row.id;
      v_suppressed := v_suppressed + 1;
      continue;
    end if;

    -- The durable key is the message's own unique tuple, so a duplicate
    -- dispatch of the same intent creates nothing.
    insert into app.notification_messages(
      tenant_id,booking_id,outbox_event_id,template_key,template_locale,template_version,
      booking_revision,recipient_hash,correlation_id)
    values (v_row.tenant_id,v_row.booking_id,v_row.id,v_row.topic,v_locale,v_version,
      v_row.booking_revision,v_recipient_hash,v_row.correlation_id)
    on conflict do nothing;
    update app.outbox_events e set state='delivered', updated_at=v_now where e.id=v_row.id;
    v_dispatched := v_dispatched + 1;
  end loop;
  return query select v_dispatched,v_suppressed;
end;
$$;
revoke all on function private.dispatch_notifications_v1(uuid,integer) from public,anon,authenticated;

-- Claim due messages under a visibility timeout. A worker that dies mid-send
-- releases its claim when the timeout elapses, and the message is retried.
create or replace function private.claim_notification_batch_v1(
  p_limit integer default 20,
  p_visibility_seconds integer default 120
)
returns table(
  message_id uuid,
  tenant_id uuid,
  booking_id uuid,
  template_key text,
  template_locale text,
  template_version integer,
  booking_revision bigint,
  attempt integer,
  correlation_id uuid,
  payload jsonb,
  recipient_email text
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  v_now timestamptz := statement_timestamp();
begin
  if p_limit is null or p_limit not between 1 and 200
     or p_visibility_seconds is null or p_visibility_seconds not between 30 and 900 then
    raise exception using errcode='22023',message='notification_invalid_batch';
  end if;
  return query
  with claimed as (
    update app.notification_messages m
    set status='sending', attempts=m.attempts+1,
        locked_until=v_now+make_interval(secs=>p_visibility_seconds), updated_at=v_now
    where m.id in (
      select c.id from app.notification_messages c
      where c.status in ('queued','sending') and c.dead_lettered_at is null
        and c.next_attempt_at<=v_now
        and (c.locked_until is null or c.locked_until<=v_now)
      order by c.next_attempt_at
      limit p_limit
      for update skip locked)
    returning m.*
  )
  -- The recipient address is read here, at send time, from the booking contact
  -- that still owns it. It is never copied into the message ledger.
  select c.id,c.tenant_id,c.booking_id,c.template_key,c.template_locale,c.template_version,
    c.booking_revision,c.attempts,c.correlation_id,o.payload,ct.email
  from claimed c
  join app.outbox_events o on o.id=c.outbox_event_id
  left join app.booking_contacts ct
    on ct.tenant_id=c.tenant_id and ct.booking_id=c.booking_id;
end;
$$;
revoke all on function private.claim_notification_batch_v1(integer,integer) from public,anon,authenticated;

-- Record what the provider said. Acknowledgement is durable state, not an
-- in-memory result: only `accepted` ends the message's send loop.
create or replace function private.record_notification_attempt_v1(
  p_message_id uuid,
  p_attempt integer,
  p_outcome text,
  p_started_at timestamptz,
  p_provider_reference text default null,
  p_error_code text default null
)
returns table(status text, next_attempt_at timestamptz, dead_lettered boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_message app.notification_messages%rowtype;
  v_status text;
  v_next timestamptz;
  v_dead boolean := false;
  v_max_attempts constant integer := 6;
begin
  if p_outcome is null or p_outcome not in ('accepted','retryable_error','permanent_error') then
    raise exception using errcode='22023',message='notification_invalid_outcome';
  end if;
  select * into v_message from app.notification_messages m where m.id=p_message_id for update;
  if v_message.id is null then
    raise exception using errcode='42501',message='notification_unavailable';
  end if;

  insert into app.notification_attempts(
    tenant_id,message_id,attempt,outcome,provider_message_reference,error_code,started_at)
  values (v_message.tenant_id,v_message.id,p_attempt,p_outcome,p_provider_reference,
    p_error_code,coalesce(p_started_at,v_now))
  on conflict (message_id,attempt) do nothing;

  if p_outcome='accepted' then
    -- Accepted by the provider is not delivered to the customer. Only the
    -- provider's own callback moves it to delivered.
    v_status := 'sent';
    v_next := v_message.next_attempt_at;
  elsif p_outcome='permanent_error' or v_message.attempts >= v_max_attempts then
    -- Dead letter, not silence: an operator can see it and replay it.
    v_status := 'failed';
    v_dead := true;
    v_next := v_message.next_attempt_at;
  else
    -- Bounded exponential backoff with jitter, so a provider outage does not
    -- produce a synchronized retry storm when it recovers.
    v_status := 'queued';
    v_next := v_now + make_interval(secs =>
      least(power(2,v_message.attempts)::integer * 30, 3600) * (0.75 + random() * 0.5));
  end if;

  update app.notification_messages m
  set status=v_status, next_attempt_at=v_next, locked_until=null,
      provider_message_reference=coalesce(p_provider_reference,m.provider_message_reference),
      last_error_code=p_error_code,
      dead_lettered_at=case when v_dead then v_now else m.dead_lettered_at end,
      updated_at=v_now
  where m.id=v_message.id;
  raise log 'notification_attempt message=% attempt=% outcome=% tenant=%',
    v_message.id,p_attempt,p_outcome,v_message.tenant_id;
  return query select v_status,v_next,v_dead;
end;
$$;
revoke all on function private.record_notification_attempt_v1(uuid,integer,text,timestamptz,text,text) from public,anon,authenticated;

-- Apply a verified provider callback. Duplicates are ignored by the provider's
-- own event id, and an out-of-order event never regresses canonical state.
create or replace function private.record_notification_event_v1(
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_occurred_at timestamptz,
  p_provider_message_reference text
)
returns table(applied boolean, message_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_now timestamptz := statement_timestamp();
  v_message app.notification_messages%rowtype;
  v_latest timestamptz;
  v_applied boolean := false;
  v_status text;
begin
  if p_event_type is null or p_event_type not in
     ('delivered','delayed','bounced','complained','failed','suppressed','opened','clicked')
     or p_provider_event_id is null or p_occurred_at is null then
    raise exception using errcode='22023',message='notification_invalid_event';
  end if;
  select * into v_message from app.notification_messages m
  where m.provider=coalesce(p_provider,'resend')
    and m.provider_message_reference=p_provider_message_reference
  for update;

  insert into app.notification_provider_events(
    tenant_id,message_id,provider,provider_event_id,event_type,occurred_at)
  values (coalesce(v_message.tenant_id,
      (select t.id from app.tenants t where false)),
    v_message.id,coalesce(p_provider,'resend'),p_provider_event_id,p_event_type,p_occurred_at)
  on conflict (provider,provider_event_id) do nothing;
  if not found then
    -- A duplicate callback is acknowledged and changes nothing.
    return query select false,v_message.id;
    return;
  end if;
  if v_message.id is null then
    return query select false,null::uuid;
    return;
  end if;

  select max(e.occurred_at) into v_latest from app.notification_provider_events e
  where e.message_id=v_message.id and e.applied and e.occurred_at > p_occurred_at;
  if v_latest is not null then
    -- A later event has already been applied, so this one is history only.
    return query select false,v_message.id;
    return;
  end if;

  v_status := case p_event_type
    when 'delivered' then 'delivered'
    when 'delayed' then 'sent'
    when 'bounced' then 'bounced'
    when 'complained' then 'complained'
    when 'failed' then 'failed'
    when 'suppressed' then 'suppressed'
    else v_message.status end;
  if v_status is distinct from v_message.status then
    update app.notification_messages m set status=v_status, updated_at=v_now
    where m.id=v_message.id;
    v_applied := true;
  end if;
  update app.notification_provider_events e set applied=v_applied
  where e.provider=coalesce(p_provider,'resend') and e.provider_event_id=p_provider_event_id;

  -- A hard bounce or a complaint suppresses that address for this tenant only.
  if p_event_type in ('bounced','complained') then
    insert into app.notification_suppressions(tenant_id,recipient_hash,reason)
    values (v_message.tenant_id,v_message.recipient_hash,
      case when p_event_type='bounced' then 'hard_bounce' else 'complaint' end)
    on conflict (tenant_id,recipient_hash) do nothing;
    raise log 'notification_suppressed tenant=% reason=%',v_message.tenant_id,p_event_type;
  end if;
  return query select v_applied,v_message.id;
end;
$function$;
revoke all on function private.record_notification_event_v1(text,text,text,timestamptz,text) from public,anon,authenticated;

-- The Dashboard's delivery view: what happened to this booking's mail, without
-- an address, a provider credential, or another booking's history.
create or replace function api_v1.list_booking_notifications_v1(
  p_tenant_id uuid,
  p_booking_id uuid
)
returns table(
  contract_version integer, message_id uuid, template_key text, template_locale text,
  status text, attempts integer, last_error_code text, dead_lettered boolean,
  created_at timestamptz, updated_at timestamptz
)
language sql stable security invoker set search_path = '' set statement_timeout = '5s' as $$
  select 1,m.id,m.template_key,m.template_locale,m.status,m.attempts,m.last_error_code,
    m.dead_lettered_at is not null,m.created_at,m.updated_at
  from app.notification_messages m
  where m.tenant_id=p_tenant_id and m.booking_id=p_booking_id
  order by m.created_at desc
  limit 50;
$$;
revoke all on function api_v1.list_booking_notifications_v1(uuid,uuid) from public,anon;
grant execute on function api_v1.list_booking_notifications_v1(uuid,uuid) to authenticated;

-- Authorized replay. It clears the dead letter and re-queues the same message,
-- so a resend is the same logical message rather than a second one.
create or replace function private.replay_notification_v1(
  p_tenant_id uuid,
  p_message_id uuid
)
returns table(contract_version integer, status text)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_message app.notification_messages%rowtype;
begin
  select * into v_message from app.notification_messages m
  where m.tenant_id=p_tenant_id and m.id=p_message_id for update;
  if v_message.id is null then
    raise exception using errcode='42501',message='notification_unavailable';
  end if;
  if not coalesce((select private.is_active_tenant_member(p_tenant_id)),false)
     or not coalesce((select private.can_decide_booking(p_tenant_id,
       (select b.location_id from app.bookings b
        where b.tenant_id=p_tenant_id and b.id=v_message.booking_id),
       'booking.correct_status')),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if exists (select 1 from app.notification_suppressions s
    where s.tenant_id=p_tenant_id and s.recipient_hash=v_message.recipient_hash) then
    -- Replaying to a suppressed address would re-send to someone who bounced
    -- or complained, which is exactly what suppression exists to prevent.
    raise exception using errcode='42501',message='policy_denied';
  end if;
  update app.notification_messages m
  set status='queued', next_attempt_at=v_now, locked_until=null,
      dead_lettered_at=null, attempts=0, updated_at=v_now
  where m.id=v_message.id;
  raise log 'notification_replayed message=% tenant=%',v_message.id,p_tenant_id;
  return query select 1,'queued'::text;
end;
$$;
revoke all on function private.replay_notification_v1(uuid,uuid) from public,anon;
grant execute on function private.replay_notification_v1(uuid,uuid) to authenticated;

create or replace function api_v1.replay_notification_v1(
  p_tenant_id uuid,
  p_message_id uuid
)
returns table(contract_version integer, status text)
language sql volatile security invoker set search_path = '' set statement_timeout = '5s' as $$
  select * from private.replay_notification_v1(p_tenant_id,p_message_id);
$$;
revoke all on function api_v1.replay_notification_v1(uuid,uuid) from public,anon;
grant execute on function api_v1.replay_notification_v1(uuid,uuid) to authenticated;

-- Stuck-job recovery: a claim whose visibility timeout elapsed is released so
-- another worker can take it.
create or replace function private.recover_stuck_notifications_v1(
  p_limit integer default 500
)
returns table(recovered integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_recovered integer;
begin
  with released as (
    update app.notification_messages m
    set status='queued', locked_until=null, updated_at=v_now
    where m.id in (
      select c.id from app.notification_messages c
      where c.status='sending' and c.locked_until is not null and c.locked_until<=v_now
      order by c.locked_until limit p_limit for update skip locked)
    returning 1
  ) select count(*)::integer into v_recovered from released;
  return query select v_recovered;
end;
$$;
revoke all on function private.recover_stuck_notifications_v1(integer) from public,anon,authenticated;

-- The booking's own notification column follows the same vocabulary, so a
-- provider callback and a booking read never disagree about what the words mean.
alter table app.bookings drop constraint bookings_notification_status_check;
alter table app.bookings add constraint bookings_notification_status_check
  check (notification_status in
    ('queued','sending','sent','delivered','bounced','complained','failed','suppressed'));

-- The booking's own notification column mirrors its newest message, so the
-- Dashboard's ordinary booking read already carries delivery state and no
-- caller needs a second query per row. Booking truth is untouched: only the
-- notification column moves.
create or replace function private.sync_booking_notification_status_v1(
  p_message_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_message app.notification_messages%rowtype;
  v_status text;
begin
  select * into v_message from app.notification_messages m where m.id=p_message_id;
  if v_message.booking_id is null then return; end if;
  select m.status into v_status from app.notification_messages m
  where m.tenant_id=v_message.tenant_id and m.booking_id=v_message.booking_id
  order by m.created_at desc, m.id desc
  limit 1;
  update app.bookings b
  set notification_status=v_status, updated_at=statement_timestamp()
  where b.tenant_id=v_message.tenant_id and b.id=v_message.booking_id
    and b.notification_status is distinct from v_status;
end;
$$;
revoke all on function private.sync_booking_notification_status_v1(uuid) from public,anon,authenticated;

create or replace function private.notification_status_sync_trigger()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.sync_booking_notification_status_v1(new.id);
  return new;
end;
$$;
create trigger notification_messages_sync_booking
  after insert or update of status on app.notification_messages
  for each row execute function private.notification_status_sync_trigger();

-- Resend the newest failed message for one booking. It is the same authorized
-- replay, addressed the way an operator thinks about it.
create or replace function api_v1.replay_booking_notification_v1(
  p_tenant_id uuid,
  p_booking_id uuid
)
returns table(contract_version integer, status text)
language sql volatile security invoker set search_path = '' set statement_timeout = '5s' as $$
  select * from private.replay_notification_v1(p_tenant_id,(
    select m.id from app.notification_messages m
    where m.tenant_id=p_tenant_id and m.booking_id=p_booking_id
      and m.status in ('failed','bounced','complained')
    order by m.created_at desc
    limit 1));
$$;
revoke all on function api_v1.replay_booking_notification_v1(uuid,uuid) from public,anon;
grant execute on function api_v1.replay_booking_notification_v1(uuid,uuid) to authenticated;
