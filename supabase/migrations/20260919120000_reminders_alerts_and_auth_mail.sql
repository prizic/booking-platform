-- Issue #20: scheduled reminders, staff alerts, and tenant-aware Auth mail.
--
-- Issue #19 built the durable path: an outbox intent becomes a message, a
-- message becomes attempts, attempts become a provider ledger, and nothing is
-- ever sent twice. This adds three things to that path and changes none of it.
--
--   1. A reminder is an outbox intent with a FUTURE `available_at`. The column
--      already exists and the dispatcher already respects it, so scheduling is
--      not a new mechanism — it is the existing one, later.
--   2. A staff alert is a message with a second recipient kind. Addresses are
--      still resolved at send time and still never copied into the ledger.
--   3. Auth mail resolves its tenant from membership and invitation records
--      only, and falls back to a generic message the moment that is ambiguous.
--
-- Why reminders need no scheduler table:
--
--   The outbox intent key is (tenant, booking, topic, booking_revision). A
--   reschedule bumps the booking revision, so the reminder for the new time is
--   a DIFFERENT intent, and the one for the old time is superseded rather than
--   deleted. That is the whole invalidation story: it falls out of the key that
--   was already there, and there is no window in which both are pending.
--
-- What this deliberately does NOT do:
--
--   * no second queue, no `scheduled_reminders` table, no separate worker. One
--     outbox, one claim, one attempt ledger, one dead-letter rule.
--   * no reminder computed in a client. A reminder is scheduled from the
--     committed booking and its location timezone.
--   * no tenant branding on Auth mail that cannot be proved. An identity
--     belonging to two tenants gets a generic message, because guessing which
--     brand to wear tells one tenant that the person also deals with another.
--
-- Error vocabulary: no new strings.

-- ---------------------------------------------------------------------------
-- 1. Vocabulary
-- ---------------------------------------------------------------------------

alter table app.outbox_events drop constraint outbox_events_topic_check;
alter table app.outbox_events add constraint outbox_events_topic_check
  check (topic in ('booking.confirmed','booking.requested','booking.rejected',
    'booking.request_expired','booking.proposal_created','booking.proposal_declined',
    'management.otp_requested','booking.rescheduled','booking.cancelled',
    'payment.refunded','payment.refund_failed',
    -- The customer's reminder, and the alerts a tenant's own team needs.
    'booking.reminder',
    'staff.request_pending','staff.payment_exception','staff.booking_cancelled',
    'staff.delivery_failed'));

-- A superseded intent is not a failure. A rescheduled booking's old reminder
-- did not fail to send; it stopped being true, and the ledger should say which.
alter table app.outbox_events drop constraint outbox_events_state_check;
alter table app.outbox_events add constraint outbox_events_state_check
  check (state in ('pending','delivered','failed','superseded'));

alter table app.notification_templates drop constraint notification_templates_key_check;
alter table app.notification_templates add constraint notification_templates_key_check
  check (key in (
    'booking.confirmed','booking.requested','booking.rejected',
    'booking.request_expired','booking.proposal_created','booking.proposal_declined',
    'booking.rescheduled','booking.cancelled','management.otp_requested',
    'payment.refunded','payment.refund_failed','booking.reminder',
    'staff.request_pending','staff.payment_exception','staff.booking_cancelled',
    'staff.delivery_failed'));

insert into app.notification_templates(key,locale,version,variable_schema) values
  ('booking.reminder','en',1,'["publicReference","serviceName","locationName","startAt","timeZone","manageUrl","brandName"]'::jsonb),
  ('booking.reminder','ar',1,'["publicReference","serviceName","locationName","startAt","timeZone","manageUrl","brandName"]'::jsonb),
  ('staff.request_pending','en',1,'["publicReference","serviceName","startAt","timeZone","brandName"]'::jsonb),
  ('staff.request_pending','ar',1,'["publicReference","serviceName","startAt","timeZone","brandName"]'::jsonb),
  ('staff.payment_exception','en',1,'["publicReference","serviceName","brandName"]'::jsonb),
  ('staff.payment_exception','ar',1,'["publicReference","serviceName","brandName"]'::jsonb),
  ('staff.booking_cancelled','en',1,'["publicReference","serviceName","startAt","timeZone","brandName"]'::jsonb),
  ('staff.booking_cancelled','ar',1,'["publicReference","serviceName","startAt","timeZone","brandName"]'::jsonb),
  ('staff.delivery_failed','en',1,'["publicReference","serviceName","brandName"]'::jsonb),
  ('staff.delivery_failed','ar',1,'["publicReference","serviceName","brandName"]'::jsonb)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. A message can now be addressed to a member
-- ---------------------------------------------------------------------------

alter table app.notification_messages add column recipient_kind text not null default 'customer'
  check (recipient_kind in ('customer','staff'));
-- Which member, so the address can be resolved at send time from the membership
-- that still owns it. The address itself is never stored here, exactly as for a
-- customer.
alter table app.notification_messages add column recipient_membership_id uuid;
alter table app.notification_messages
  add constraint notification_messages_membership_fk
  foreign key (tenant_id,recipient_membership_id)
  references app.memberships(tenant_id,id) on delete restrict;
alter table app.notification_messages
  add constraint notification_messages_recipient_check
  check ((recipient_kind = 'staff') = (recipient_membership_id is not null));

-- ---------------------------------------------------------------------------
-- 3. Scheduling reminders
-- ---------------------------------------------------------------------------

-- How long before the appointment the reminder goes out, from the snapshotted
-- policy and clamped, so no tenant edit can schedule a reminder a year out or
-- one second before.
create or replace function private.resolve_reminder_lead_minutes_v1(p_policy jsonb)
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select least(greatest(
    coalesce((p_policy->>'reminder_lead_minutes')::integer, 1440), 15), 10080);
$$;

-- Scheduled from committed booking facts, in bounded batches, and idempotent on
-- the intent key that was already there. Safe to run on any schedule and from
-- more than one worker: the unique index settles it.
create or replace function private.schedule_booking_reminders_v1(
  p_tenant_id uuid default null,
  p_limit integer default 200
)
returns table (scheduled integer, superseded integer)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '20s'
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_scheduled integer := 0;
  v_superseded integer := 0;
  v_row record;
  v_lead integer;
  v_send_at timestamptz;
begin
  if p_limit is null or p_limit not between 1 and 1000 then
    raise exception using errcode='22023',message='notification_invalid_batch';
  end if;

  -- A booking whose revision moved leaves its old reminder behind. It did not
  -- fail; it stopped being true, so it is superseded and the ledger says which.
  update app.outbox_events o set state='superseded', updated_at=v_now
  from app.bookings b
  where o.tenant_id = b.tenant_id and o.booking_id = b.id
    and o.topic = 'booking.reminder' and o.state = 'pending'
    and (p_tenant_id is null or o.tenant_id = p_tenant_id)
    and (o.booking_revision <> b.revision
      -- A booking that is no longer going to happen must never be reminded of.
      or b.status in ('cancelled','completed','no_show'));
  get diagnostics v_superseded = row_count;

  for v_row in
    select b.id, b.tenant_id, b.starts_at, b.revision, b.policy_snapshot, b.correlation_id
    from app.bookings b
    where (p_tenant_id is null or b.tenant_id = p_tenant_id)
      and b.status in ('confirmed','checked_in')
      and b.starts_at > v_now
      and not exists (
        select 1 from app.outbox_events o
        where o.tenant_id = b.tenant_id and o.booking_id = b.id
          and o.topic = 'booking.reminder' and o.booking_revision = b.revision)
    order by b.starts_at
    limit p_limit
  loop
    v_lead := private.resolve_reminder_lead_minutes_v1(v_row.policy_snapshot);
    v_send_at := v_row.starts_at - pg_catalog.make_interval(mins=>v_lead);
    -- A booking made inside its own reminder window still gets one, immediately
    -- rather than never: `available_at` in the past is simply due.
    insert into app.outbox_events(
      tenant_id,booking_id,topic,payload,available_at,correlation_id,booking_revision)
    values (v_row.tenant_id,v_row.id,'booking.reminder',
      jsonb_build_object('lead_minutes',v_lead),
      greatest(v_send_at,v_now),v_row.correlation_id,v_row.revision)
    on conflict (tenant_id,booking_id,topic,booking_revision) do nothing;
    v_scheduled := v_scheduled + 1;
  end loop;

  return query select v_scheduled, v_superseded;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Staff alerts
-- ---------------------------------------------------------------------------

-- Who on the team should hear about this booking. Capability and location scope
-- decide, never a list somebody maintains by hand: a member who loses the
-- capability stops being alerted the moment they lose it.
create or replace function private.resolve_alert_recipients_v1(
  p_tenant_id uuid,
  p_location_id uuid,
  p_permission_key text
)
returns table (membership_id uuid, auth_user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.auth_user_id
  from app.memberships m
  join app.role_permissions rp on rp.tenant_id = m.tenant_id and rp.role_id = m.role_id
  where m.tenant_id = p_tenant_id
    and m.status = 'active'
    and rp.permission_key = p_permission_key
    and (
      rp.scope_kind = 'tenant'
      or (rp.scope_kind = 'location' and exists (
        select 1 from app.membership_location_scopes s
        where s.tenant_id = m.tenant_id and s.membership_id = m.id
          and s.location_id = p_location_id))
    )
  group by m.id, m.auth_user_id;
$$;

-- One alert per member, per booking, per revision. A team of six gets six
-- messages and never twelve, and a replayed dispatch creates none.
create or replace function private.enqueue_staff_alert_v1(
  p_tenant_id uuid,
  p_booking_id uuid,
  p_topic text,
  p_permission_key text
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_booking app.bookings%rowtype;
  v_outbox uuid;
  v_version integer;
  v_count integer := 0;
  r record;
begin
  select * into v_booking from app.bookings b
  where b.tenant_id = p_tenant_id and b.id = p_booking_id;
  if v_booking.id is null then return 0; end if;

  insert into app.outbox_events(
    tenant_id,booking_id,topic,payload,correlation_id,booking_revision)
  values (p_tenant_id,p_booking_id,p_topic,'{}'::jsonb,
    v_booking.correlation_id,v_booking.revision)
  on conflict (tenant_id,booking_id,topic,booking_revision) do nothing
  returning id into v_outbox;
  if v_outbox is null then
    select o.id into v_outbox from app.outbox_events o
    where o.tenant_id = p_tenant_id and o.booking_id = p_booking_id
      and o.topic = p_topic and o.booking_revision = v_booking.revision;
  end if;

  for r in select * from private.resolve_alert_recipients_v1(
    p_tenant_id,v_booking.location_id,p_permission_key)
  loop
    select t.version into v_version from app.notification_templates t
    where t.key = p_topic and t.locale = 'en' and t.retired_at is null;
    if v_version is null then continue; end if;
    insert into app.notification_messages(
      tenant_id,booking_id,outbox_event_id,template_key,template_locale,template_version,
      booking_revision,recipient_hash,recipient_kind,recipient_membership_id,correlation_id)
    values (p_tenant_id,p_booking_id,v_outbox,p_topic,'en',v_version,
      v_booking.revision,
      -- Staff are addressed by the same tenant-salted digest shape customers
      -- are, so one ledger reads one way.
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
        p_tenant_id::text||':membership:'||r.membership_id::text,'UTF8')),'hex'),
      'staff',r.membership_id,v_booking.correlation_id)
    on conflict do nothing;
    v_count := v_count + 1;
  end loop;

  update app.outbox_events o set state='delivered', updated_at=pg_catalog.statement_timestamp()
  where o.id = v_outbox;
  return v_count;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. The worker learns the second recipient kind
-- ---------------------------------------------------------------------------

-- Reproduced from issue #19 with one change: the address resolved at send time
-- comes from the booking contact for a customer and from the member's Auth
-- record for a staff alert. Everything else — the visibility timeout, the skip
-- locked claim, the attempt counting — is the same code.
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
  select c.id,c.tenant_id,c.booking_id,c.template_key,c.template_locale,c.template_version,
    c.booking_revision,c.attempts,c.correlation_id,o.payload,
    case when c.recipient_kind = 'staff' then au.email else ct.email end
  from claimed c
  join app.outbox_events o on o.id=c.outbox_event_id
  left join app.booking_contacts ct
    on ct.tenant_id=c.tenant_id and ct.booking_id=c.booking_id
  left join app.memberships mem
    on mem.tenant_id=c.tenant_id and mem.id=c.recipient_membership_id
  left join auth.users au on au.id=mem.auth_user_id;
end;
$$;
revoke all on function private.claim_notification_batch_v1(integer,integer)
  from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 6. Auth mail identity
-- ---------------------------------------------------------------------------

-- What brand, if any, an Auth message may wear. Resolved from membership and
-- invitation records ONLY. Not from user metadata, not from a redirect URL, not
-- from a hostname the request claimed: all three are attacker-controlled, and
-- an Auth message is exactly where that matters most.
--
-- If the address belongs to more than one tenant the answer is deliberately
-- nothing. Picking one would tell that tenant the person also deals with
-- another, which is a disclosure the customer never agreed to.
create or replace function private.resolve_auth_mail_context_v1(
  p_email text
)
returns table (
  tenant_id uuid,
  brand_name text,
  ambiguous boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email,'')));
  v_tenants uuid[];
  v_tenant uuid;
  v_name text;
begin
  if v_email = '' then
    return query select null::uuid, null::text, true;
    return;
  end if;

  -- Active memberships first, then open invitations. Both are records this
  -- platform wrote; neither can be influenced by the person signing in.
  select pg_catalog.array_agg(distinct t) into v_tenants from (
    select m.tenant_id as t
    from app.memberships m
    join auth.users u on u.id = m.auth_user_id
    where m.status = 'active' and pg_catalog.lower(u.email) = v_email
    union
    select i.tenant_id
    from app.invitations i
    where i.status = 'pending' and pg_catalog.lower(i.invitee_email) = v_email
      and i.expires_at > pg_catalog.statement_timestamp()
  ) as candidates;

  if v_tenants is null or pg_catalog.array_length(v_tenants,1) is null then
    -- Nobody we know. A generic message, and no hint that the address is
    -- unknown either.
    return query select null::uuid, null::text, true;
    return;
  end if;
  if pg_catalog.array_length(v_tenants,1) > 1 then
    return query select null::uuid, null::text, true;
    return;
  end if;

  v_tenant := v_tenants[1];
  -- The tenant's own name. A brand carries a key and a revision, not a display
  -- name, and the message should say who the business is rather than which
  -- brand record the platform happens to hold.
  select t.name into v_name from app.tenants t where t.id = v_tenant;
  return query select v_tenant, v_name, false;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Delivery health for the Dashboard
-- ---------------------------------------------------------------------------

-- Tenant-wide delivery state: what is queued, what is failing, what has been
-- given up on, and how old the oldest waiting message is. Counts and states
-- only — no address, no subject, no body.
create or replace function api_v1.get_delivery_health_v1(
  p_tenant_id uuid
)
returns table (
  contract_version integer,
  queued bigint,
  sending bigint,
  delivered bigint,
  bounced bigint,
  complained bigint,
  failed bigint,
  suppressed bigint,
  dead_lettered bigint,
  oldest_queued_minutes integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select 1,
    pg_catalog.count(*) filter (where m.status='queued'),
    pg_catalog.count(*) filter (where m.status='sending'),
    pg_catalog.count(*) filter (where m.status='delivered'),
    pg_catalog.count(*) filter (where m.status='bounced'),
    pg_catalog.count(*) filter (where m.status='complained'),
    pg_catalog.count(*) filter (where m.status='failed'),
    pg_catalog.count(*) filter (where m.status='suppressed'),
    pg_catalog.count(*) filter (where m.dead_lettered_at is not null),
    coalesce(pg_catalog.max(
      extract(epoch from (pg_catalog.statement_timestamp() - m.created_at))/60)
      filter (where m.status='queued'),0)::integer
  from app.notification_messages m
  where m.tenant_id = p_tenant_id;
$$;

create or replace function api_v1.schedule_booking_reminders_v1(
  p_tenant_id uuid default null, p_limit integer default 200)
returns table (scheduled integer, superseded integer)
language sql volatile security invoker set search_path = '' set statement_timeout = '20s'
as $$ select * from private.schedule_booking_reminders_v1(p_tenant_id,p_limit); $$;

create or replace function api_v1.resolve_auth_mail_context_v1(p_email text)
returns table (tenant_id uuid, brand_name text, ambiguous boolean)
language sql stable security invoker set search_path = ''
as $$ select * from private.resolve_auth_mail_context_v1(p_email); $$;

-- ---------------------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------------------

revoke all on function
  private.resolve_reminder_lead_minutes_v1(jsonb),
  private.schedule_booking_reminders_v1(uuid,integer),
  private.resolve_alert_recipients_v1(uuid,uuid,text),
  private.enqueue_staff_alert_v1(uuid,uuid,text,text),
  private.resolve_auth_mail_context_v1(text)
from public, anon, authenticated;

revoke all on function
  api_v1.get_delivery_health_v1(uuid),
  api_v1.schedule_booking_reminders_v1(uuid,integer),
  api_v1.resolve_auth_mail_context_v1(text)
from public, anon, authenticated;

-- A scoped member may see how their tenant's mail is going.
grant execute on function api_v1.get_delivery_health_v1(uuid) to authenticated;

-- Scheduling and Auth-mail identity are worker and hook surfaces. A session must
-- never be able to ask which tenant an arbitrary address belongs to: that is an
-- enumeration oracle, and this function answers it truthfully by design.
grant execute on function
  api_v1.schedule_booking_reminders_v1(uuid,integer),
  api_v1.resolve_auth_mail_context_v1(text)
to service_role;
