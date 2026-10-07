-- The engine side of notification settings and the WhatsApp channel.
--
--   booking transaction -> app.outbox_events            (unchanged, never blocks)
--     -> private.dispatch_notifications_v1               (reads settings, consent)
--          email row    (always for a non-editable type)
--          whatsapp row (entitled + configured + enabled + type on + template
--                        mapped + the booking's own consent snapshot)
--     -> private.claim_notification_batch_v1             (email rows only)
--     -> private.claim_whatsapp_batch_v1                 (whatsapp rows only)
--
-- Nothing in this file runs inside a booking transaction except the consent
-- snapshot, which is one insert beside the booking it belongs to. Every
-- decision about sending is made later, in the worker path, so a provider that
-- is down, a tenant that is misconfigured, or a plan that changed can never
-- cost a booking.

-- ---------------------------------------------------------------------------
-- 1. Dispatch learns settings, reminders with several lead times, and WhatsApp
-- ---------------------------------------------------------------------------

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
  v_email text;
  v_starts_at timestamptz;
  v_recipient_hash text;
  v_version integer;
  v_variant text;
  v_email_on boolean;
  v_whatsapp_on boolean;
  v_phone text;
  v_phone_hash text;
  v_made boolean;
  v_email_suppressed boolean;
  v_next_lead integer;
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
    v_email := null; v_locale := null; v_starts_at := null;
    select lower(c.email), coalesce(b.locale,'en'), b.starts_at
    into v_email, v_locale, v_starts_at
    from app.bookings b
    join app.booking_contacts c on c.tenant_id=b.tenant_id and c.booking_id=b.id
    where b.tenant_id=v_row.tenant_id and b.id=v_row.booking_id;
    if v_email is null then
      -- Nothing to address. The intent is closed rather than retried forever.
      update app.outbox_events e set state='failed', updated_at=v_now where e.id=v_row.id;
      continue;
    end if;
    v_recipient_hash := encode(pg_catalog.sha256(
      pg_catalog.convert_to(v_row.tenant_id::text||':'||v_email,'UTF8')),'hex');
    v_version := null;
    select t.version into v_version from app.notification_templates t
    where t.key=v_row.topic and t.locale=v_locale and t.retired_at is null;
    if v_version is null then
      update app.outbox_events e set state='failed', updated_at=v_now where e.id=v_row.id;
      continue;
    end if;

    -- One reminder intent can carry several lead times; each lead time is its
    -- own message for the same recipient.
    v_variant := case when v_row.topic='booking.reminder'
      then coalesce(v_row.payload->>'lead_minutes','') else '' end;
    v_email_on := private.notification_channel_enabled_v1(v_row.tenant_id,v_row.topic,'email');
    v_phone := null;
    v_whatsapp_on := false;
    if (select s.available from private.whatsapp_state_v1(v_row.tenant_id) s)
       and private.notification_channel_enabled_v1(v_row.tenant_id,v_row.topic,'whatsapp')
       and exists (select 1 from app.whatsapp_configs w
         where w.tenant_id=v_row.tenant_id and w.template_map ? v_row.topic) then
      select c.phone_e164 into v_phone from app.booking_whatsapp_consents c
      where c.tenant_id=v_row.tenant_id and c.booking_id=v_row.booking_id;
      v_whatsapp_on := v_phone is not null;
    end if;
    v_made := false;
    v_email_suppressed := false;

    if v_email_on then
      if exists (select 1 from app.notification_suppressions s
        where s.tenant_id=v_row.tenant_id and s.recipient_hash=v_recipient_hash) then
        -- A suppressed address is a recorded outcome, not a silent drop.
        insert into app.notification_messages(
          tenant_id,booking_id,outbox_event_id,template_key,template_locale,template_version,
          booking_revision,recipient_hash,status,correlation_id,channel,variant)
        values (v_row.tenant_id,v_row.booking_id,v_row.id,v_row.topic,v_locale,v_version,
          v_row.booking_revision,v_recipient_hash,'suppressed',v_row.correlation_id,'email',v_variant)
        on conflict do nothing;
        v_email_suppressed := true;
      else
        -- The durable key is the message's own unique tuple, so a duplicate
        -- dispatch of the same intent creates nothing.
        insert into app.notification_messages(
          tenant_id,booking_id,outbox_event_id,template_key,template_locale,template_version,
          booking_revision,recipient_hash,correlation_id,channel,variant)
        values (v_row.tenant_id,v_row.booking_id,v_row.id,v_row.topic,v_locale,v_version,
          v_row.booking_revision,v_recipient_hash,v_row.correlation_id,'email',v_variant)
        on conflict do nothing;
        v_made := true;
      end if;
    end if;

    if v_whatsapp_on then
      -- A separate row on the same intent key plus the channel. Email for the
      -- same event is untouched: WhatsApp is additive, never a substitute.
      v_phone_hash := encode(pg_catalog.sha256(pg_catalog.convert_to(
        v_row.tenant_id::text||':whatsapp:'||v_phone,'UTF8')),'hex');
      insert into app.notification_messages(
        tenant_id,booking_id,outbox_event_id,template_key,template_locale,template_version,
        booking_revision,recipient_hash,status,correlation_id,channel,variant,provider)
      values (v_row.tenant_id,v_row.booking_id,v_row.id,v_row.topic,v_locale,v_version,
        v_row.booking_revision,v_phone_hash,
        case when exists (select 1 from app.notification_suppressions s
          where s.tenant_id=v_row.tenant_id and s.recipient_hash=v_phone_hash)
          then 'suppressed' else 'queued' end,
        v_row.correlation_id,'whatsapp',v_variant,'meta_whatsapp')
      on conflict do nothing;
      v_made := true;
    end if;

    -- The next lead time of a reminder re-arms the same intent rather than
    -- adding a second one, so a reschedule still supersedes exactly one row.
    v_next_lead := null;
    if v_row.topic='booking.reminder' and pg_catalog.jsonb_typeof(v_row.payload->'offsets')='array' then
      select max(x.o) into v_next_lead
      from (select (value #>> '{}')::integer o
            from pg_catalog.jsonb_array_elements(v_row.payload->'offsets')
            where pg_catalog.jsonb_typeof(value)='number') x
      where x.o < coalesce((v_row.payload->>'lead_minutes')::integer,0)
        and v_starts_at - pg_catalog.make_interval(mins=>x.o) > v_now;
    end if;

    if v_next_lead is not null then
      update app.outbox_events e set state='pending',
        available_at=v_starts_at - pg_catalog.make_interval(mins=>v_next_lead),
        payload=e.payload || jsonb_build_object('lead_minutes',v_next_lead),
        updated_at=v_now
      where e.id=v_row.id;
    elsif not v_email_on and not v_whatsapp_on then
      -- Switched off by the tenant: neither sent nor failed, and visibly so.
      update app.outbox_events e set state='skipped', updated_at=v_now where e.id=v_row.id;
    else
      update app.outbox_events e set state='delivered', updated_at=v_now where e.id=v_row.id;
    end if;

    if v_made then
      v_dispatched := v_dispatched + 1;
    elsif v_email_suppressed then
      v_suppressed := v_suppressed + 1;
    end if;
  end loop;
  return query select v_dispatched,v_suppressed;
end;
$$;
revoke all on function private.dispatch_notifications_v1(uuid,integer) from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 2a. What a template needs, read at send time
-- ---------------------------------------------------------------------------

-- Outbox intents were written with only a reference and a time. Templates need
-- the service, the place, the time zone, the price, who is seeing the customer
-- and how to manage the booking. Those are read here, at claim time, from the
-- booking's own immutable snapshot, so nothing new is copied into the outbox or
-- the message ledger and a past booking still renders what it snapshotted.
--
-- Keys are snake_case facts; the email package's payload normalizer turns them
-- into template variables. Customer-only facts (price, public reason) are not
-- given to a staff message, and no staff message carries the customer's name
-- or contact detail: the staff alert templates do not need them.

-- Which bookings a member may see for one capability: tenant-wide, at their
-- scoped locations, or only their own appointments. Null means none.
create or replace function private.member_permission_scope_v1(
  p_tenant_id uuid, p_membership_id uuid, p_permission_keys text[])
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when bool_or(rp.scope_kind = 'tenant') then 'tenant'
    when bool_or(rp.scope_kind = 'location') then 'location'
    when bool_or(rp.scope_kind = 'own') then 'own'
  end
  from app.memberships m
  join app.role_permissions rp on rp.tenant_id = m.tenant_id and rp.role_id = m.role_id
  where m.tenant_id = p_tenant_id and m.id = p_membership_id and m.status = 'active'
    and rp.permission_key = any (p_permission_keys) and rp.grant_kind = 'direct';
$$;

create or replace function private.member_scope_covers_booking_v1(
  p_scope text, p_tenant_id uuid, p_membership_id uuid, p_location_id uuid, p_hold_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(case p_scope
    when 'tenant' then true
    when 'location' then exists (select 1 from app.membership_location_scopes s
      where s.tenant_id = p_tenant_id and s.membership_id = p_membership_id
        and s.location_id = p_location_id)
    when 'own' then exists (select 1 from app.assignment_allocations a
      join app.staff_profiles sp on sp.tenant_id = a.tenant_id and sp.id = a.staff_id
      where a.tenant_id = p_tenant_id and a.hold_id = p_hold_id
        and sp.membership_id = p_membership_id)
    else false end, false);
$$;

-- Money as a customer reads it: minor units in the currency's own exponent.
create or replace function private.format_minor_amount_v1(p_minor bigint, p_currency text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_minor is null or p_currency is null then null
    when p_currency in ('JPY','KRW','VND','CLP','ISK','UGX','XAF','XOF') then
      p_minor::text||' '||p_currency
    when p_currency in ('BHD','JOD','KWD','OMR','TND','IQD','LYD') then
      pg_catalog.to_char(p_minor / 1000.0,'FM999999999990.000')||' '||p_currency
    else pg_catalog.to_char(p_minor / 100.0,'FM999999999990.00')||' '||p_currency
  end;
$$;

-- The facts of one booking a template may show, for one kind of recipient.
create or replace function private.notification_booking_facts_v1(
  p_tenant_id uuid, p_booking_id uuid, p_recipient_kind text, p_locale text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_strip_nulls(
    jsonb_build_object(
      'public_reference',b.public_reference,
      'service_name',b.service_name,
      'location_name',b.location_name,
      'location_address',(select nullif(lr.address,'') from app.catalog_location_revisions lr
        where lr.tenant_id = b.tenant_id and lr.location_id = b.location_id
          and lr.locale = coalesce(p_locale,b.locale) and lr.state = 'published'
        order by lr.published_at desc nulls last limit 1),
      'starts_at',b.starts_at,
      'ends_at',b.ends_at,
      'time_zone',b.location_time_zone,
      'staff_name',(select sp.public_name from app.assignment_allocations a
        join app.staff_profiles sp on sp.tenant_id = a.tenant_id and sp.id = a.staff_id
        where a.tenant_id = b.tenant_id and a.hold_id = b.hold_id
        order by a.starts_at limit 1))
    || case when p_recipient_kind = 'customer' then jsonb_build_object(
      'customer_time_zone',b.customer_time_zone,
      'price_minor',b.price_minor,
      'currency',b.currency,
      'price',private.format_minor_amount_v1(b.price_minor,b.currency),
      'public_reason',b.decision_reason_public)
      else '{}'::jsonb end)
  from app.bookings b
  where b.tenant_id = p_tenant_id and b.id = p_booking_id;
$$;

-- A manage link for one customer email, minted at send time.
--
-- The plaintext token exists only in the claim result handed to the worker
-- and in the delivered email, exactly as ADR-0004 requires: the table stores
-- its digest, the access ledger records the issue without it, and nothing here
-- logs it. The token is tied to the message, so a retry of the SAME message
-- mints a fresh token without revoking the one an earlier attempt may already
-- have delivered, while a newer message still supersedes older links.
create or replace function private.mint_notification_manage_url_v1(
  p_message_id uuid, p_tenant_id uuid, p_booking_id uuid, p_template_key text, p_locale text)
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_booking app.bookings%rowtype;
  v_origin text;
  v_token text;
  v_expires_at timestamptz;
  v_token_id uuid;
  v_email text;
begin
  if p_booking_id is null or p_template_key not in ('booking.confirmed','booking.requested',
    'booking.rescheduled','booking.reminder','booking.proposal_created') then
    return null;
  end if;
  select * into v_booking from app.bookings b
  where b.tenant_id = p_tenant_id and b.id = p_booking_id;
  if v_booking.id is null or v_booking.status not in ('requested','confirmed','checked_in') then
    return null;
  end if;
  select 'https://'||d.hostname into v_origin from app.tenant_domains d
  where d.tenant_id = p_tenant_id and d.application = 'client' and d.kind = 'production'
    and d.active and d.verification_status = 'verified' order by d.hostname limit 1;
  select c.email into v_email from app.booking_contacts c
  where c.tenant_id = p_tenant_id and c.booking_id = p_booking_id;
  if v_origin is null or v_email is null then
    return null;
  end if;
  v_expires_at := private.management_token_expiry_v1('view',v_booking.ends_at,v_now);
  if v_expires_at <= v_now then
    return null;
  end if;
  v_token := pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','')
    || pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','');

  update app.management_tokens t
  set revoked_at = v_now, revoked_reason = 'superseded'
  where t.tenant_id = p_tenant_id and t.booking_id = p_booking_id and t.intent = 'view'
    and t.consumed_at is null and t.revoked_at is null
    and t.message_id is distinct from p_message_id;
  insert into app.management_tokens(
    tenant_id,booking_id,intent,token_hash,email_hash,expires_at,correlation_id,message_id)
  values (p_tenant_id,p_booking_id,'view',
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_tenant_id::text||':'||v_token,'UTF8')),'hex'),
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_tenant_id::text||':'||lower(v_email),'UTF8')),'hex'),
    v_expires_at,v_booking.correlation_id,p_message_id)
  returning id into v_token_id;
  insert into app.management_access_events(
    tenant_id,booking_id,token_id,intent,action,outcome,request_id)
  values (p_tenant_id,p_booking_id,v_token_id,'view','issued','succeeded',v_booking.correlation_id);
  return v_origin||'/'||coalesce(p_locale,'en')||'/manage?token='||v_token;
exception when others then
  -- A link that cannot be minted is a message without a link, never a message
  -- that cannot be sent.
  return null;
end;
$$;

-- The agenda of one digest, built at send time from the member's CURRENT
-- access: tenant-wide, scoped locations, or own appointments. A customer's
-- first name is included only where the member may already see customer
-- details for that booking.
create or replace function private.notification_digest_bookings_v1(
  p_tenant_id uuid, p_membership_id uuid, p_local_date date, p_time_zone text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with scope as (
    select private.member_permission_scope_v1(p_tenant_id,p_membership_id,
        array['booking.view.any','booking.view.own']) as view_scope,
      private.member_permission_scope_v1(p_tenant_id,p_membership_id,
        array['customer.pii.view']) as pii_scope
  )
  select coalesce(jsonb_agg(pg_catalog.jsonb_strip_nulls(jsonb_build_object(
      'starts_at',b.starts_at,
      'service_name',b.service_name,
      'location_name',b.location_name,
      'time_zone',b.location_time_zone,
      'staff_name',(select sp.public_name from app.assignment_allocations a
        join app.staff_profiles sp on sp.tenant_id = a.tenant_id and sp.id = a.staff_id
        where a.tenant_id = b.tenant_id and a.hold_id = b.hold_id order by a.starts_at limit 1),
      'customer_first_name',case when private.member_scope_covers_booking_v1(
          s.pii_scope,b.tenant_id,p_membership_id,b.location_id,b.hold_id)
        then (select nullif(pg_catalog.split_part(c.full_name,' ',1),'')
          from app.booking_contacts c where c.tenant_id = b.tenant_id and c.booking_id = b.id) end))
    order by b.starts_at, b.id),'[]'::jsonb)
  from scope s
  join lateral (
    select b.* from app.bookings b
    where b.tenant_id = p_tenant_id
      and b.starts_at >= (p_local_date::timestamp at time zone p_time_zone)
      and b.starts_at < ((p_local_date + 1)::timestamp at time zone p_time_zone)
      and b.status in ('requested','confirmed','checked_in')
      and private.member_scope_covers_booking_v1(
        s.view_scope,b.tenant_id,p_membership_id,b.location_id,b.hold_id)
    order by b.starts_at, b.id limit 200) b on true;
$$;

-- The full payload one claimed message is rendered from.
create or replace function private.notification_claim_payload_v1(
  p_message app.notification_messages, p_outbox_payload jsonb)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select case
    when p_message.is_test then coalesce(p_message.payload,'{}'::jsonb)
    when p_message.template_key = 'staff.daily_digest' then
      coalesce(p_message.payload,'{}'::jsonb) || jsonb_build_object('bookings',
        private.notification_digest_bookings_v1(p_message.tenant_id,
          p_message.recipient_membership_id,(p_message.payload->>'local_date')::date,
          coalesce(p_message.payload->>'time_zone','UTC')))
    else
      coalesce(private.notification_booking_facts_v1(p_message.tenant_id,p_message.booking_id,
          p_message.recipient_kind,p_message.template_locale),'{}'::jsonb)
      -- The intent's own payload wins over facts read now (it is what the
      -- event said at the time), and the message's own payload wins over both.
      || coalesce(p_outbox_payload,'{}'::jsonb)
      || coalesce(p_message.payload,'{}'::jsonb)
      || case when p_message.channel = 'email' and p_message.recipient_kind = 'customer' then
        coalesce((select jsonb_build_object('manage_url',u) from (select
          private.mint_notification_manage_url_v1(p_message.id,p_message.tenant_id,
            p_message.booking_id,p_message.template_key,p_message.template_locale) u) x
          where u is not null),'{}'::jsonb)
        else '{}'::jsonb end
  end;
$$;

alter table app.management_tokens add column message_id uuid;
alter table app.management_tokens
  add constraint management_tokens_message_fk
  foreign key (tenant_id,message_id) references app.notification_messages(tenant_id,id)
  on delete restrict;

revoke all on function
  private.member_permission_scope_v1(uuid,uuid,text[]),
  private.member_scope_covers_booking_v1(text,uuid,uuid,uuid,uuid),
  private.format_minor_amount_v1(bigint,text),
  private.notification_booking_facts_v1(uuid,uuid,text,text),
  private.mint_notification_manage_url_v1(uuid,uuid,uuid,text,text),
  private.notification_digest_bookings_v1(uuid,uuid,date,text),
  private.notification_claim_payload_v1(app.notification_messages,jsonb)
from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 2. The email claim stays email
-- ---------------------------------------------------------------------------

-- Reproduced with four changes: it claims only the email channel, a message
-- with no outbox intent (a test, a digest) carries its own payload, and the
-- worker is told whether it holds a test and which kind of recipient it is
-- addressing, and the payload is enriched with the booking facts and a freshly
-- minted manage link (see notification_claim_payload_v1). The added columns
-- are appended, so existing readers are intact.
drop function api_v1.claim_notification_batch_v1(integer,integer);
drop function private.claim_notification_batch_v1(integer,integer);

create function private.claim_notification_batch_v1(
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
  recipient_email text,
  is_test boolean,
  recipient_kind text
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
      where c.channel='email'
        and c.status in ('queued','sending') and c.dead_lettered_at is null
        and c.next_attempt_at<=v_now
        and (c.locked_until is null or c.locked_until<=v_now)
      order by c.next_attempt_at
      limit p_limit
      for update skip locked)
    returning m.*
  )
  select c.id,c.tenant_id,c.booking_id,c.template_key,c.template_locale,c.template_version,
    c.booking_revision,c.attempts,c.correlation_id,
    private.notification_claim_payload_v1(row(c.*)::app.notification_messages,o.payload),
    case when c.recipient_kind = 'staff' then au.email else ct.email end,
    c.is_test,c.recipient_kind
  from claimed c
  left join app.outbox_events o on o.id=c.outbox_event_id
  left join app.booking_contacts ct
    on ct.tenant_id=c.tenant_id and ct.booking_id=c.booking_id
  left join app.memberships mem
    on mem.tenant_id=c.tenant_id and mem.id=c.recipient_membership_id
  left join auth.users au on au.id=mem.auth_user_id;
end;
$$;

create function api_v1.claim_notification_batch_v1(
  p_limit integer default 20, p_visibility_seconds integer default 120)
returns table (
  message_id uuid, tenant_id uuid, booking_id uuid, template_key text,
  template_locale text, template_version integer, booking_revision bigint,
  attempt integer, correlation_id uuid, payload jsonb, recipient_email text,
  is_test boolean, recipient_kind text)
language sql volatile security invoker set search_path = '' set statement_timeout = '20s'
as $$ select * from private.claim_notification_batch_v1(p_limit,p_visibility_seconds); $$;

revoke all on function
  private.claim_notification_batch_v1(integer,integer),
  api_v1.claim_notification_batch_v1(integer,integer)
from public,anon,authenticated;
grant execute on function
  private.claim_notification_batch_v1(integer,integer),
  api_v1.claim_notification_batch_v1(integer,integer)
to service_role;

-- The booking's notification column mirrors its newest customer EMAIL message.
-- A WhatsApp row or a test send never moves it.
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
  if v_message.booking_id is null or v_message.channel <> 'email' or v_message.is_test then
    return;
  end if;
  select m.status into v_status from app.notification_messages m
  where m.tenant_id=v_message.tenant_id and m.booking_id=v_message.booking_id
    and m.channel='email' and not m.is_test
  order by m.created_at desc, m.id desc
  limit 1;
  update app.bookings b
  set notification_status=v_status, updated_at=statement_timestamp()
  where b.tenant_id=v_message.tenant_id and b.id=v_message.booking_id
    and b.notification_status is distinct from v_status;
end;
$$;
revoke all on function private.sync_booking_notification_status_v1(uuid) from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 3. Reminders follow the tenant's lead times
-- ---------------------------------------------------------------------------

-- The lead times are the tenant's notification settings (default a day and two
-- hours before). They are copied onto the intent when it is scheduled, so a
-- later settings edit does not move a reminder that is already scheduled.
-- `resolve_reminder_lead_minutes_v1` is kept for its callers and tests; the
-- scheduler no longer reads a lead time from the policy snapshot.
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
  v_offsets integer[];
  v_future integer[];
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
      or b.status in ('cancelled','completed','no_show'));
  get diagnostics v_superseded = row_count;

  for v_row in
    select b.id, b.tenant_id, b.starts_at, b.revision, b.correlation_id
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
    v_offsets := private.notification_reminder_offsets_v1(v_row.tenant_id);
    select pg_catalog.array_agg(o order by o desc) into v_future
    from pg_catalog.unnest(v_offsets) o
    where v_row.starts_at - pg_catalog.make_interval(mins=>o) > v_now;
    if v_future is null then
      -- Booked inside every reminder window: one reminder, now, rather than
      -- none. `available_at` in the past is simply due.
      v_lead := (select min(o) from pg_catalog.unnest(v_offsets) o);
      v_future := array[v_lead];
      v_send_at := v_now;
    else
      v_lead := v_future[1];
      v_send_at := v_row.starts_at - pg_catalog.make_interval(mins=>v_lead);
    end if;
    insert into app.outbox_events(
      tenant_id,booking_id,topic,payload,available_at,correlation_id,booking_revision)
    values (v_row.tenant_id,v_row.id,'booking.reminder',
      jsonb_build_object('lead_minutes',v_lead,'offsets',to_jsonb(v_future)),
      greatest(v_send_at,v_now),v_row.correlation_id,v_row.revision)
    on conflict (tenant_id,booking_id,topic,booking_revision) do nothing;
    v_scheduled := v_scheduled + 1;
  end loop;

  return query select v_scheduled, v_superseded;
end;
$function$;
revoke all on function private.schedule_booking_reminders_v1(uuid,integer) from public,anon,authenticated;
grant execute on function private.schedule_booking_reminders_v1(uuid,integer) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Staff alerts respect the tenant and the member
-- ---------------------------------------------------------------------------

-- Reproduced with two filters: a type the tenant switched off alerts nobody,
-- and a member who switched a type off is not alerted. The capability and
-- location rules that decide who is eligible are unchanged. Staff mail is
-- written in the tenant's default language rather than always English.
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
  v_locale text;
  v_count integer := 0;
  r record;
begin
  select * into v_booking from app.bookings b
  where b.tenant_id = p_tenant_id and b.id = p_booking_id;
  if v_booking.id is null then return 0; end if;
  if not private.notification_channel_enabled_v1(p_tenant_id,p_topic,'email') then
    return 0;
  end if;

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

  v_locale := coalesce((select s.default_locale from app.tenant_settings s
    where s.tenant_id = p_tenant_id),'en');
  select t.version into v_version from app.notification_templates t
  where t.key = p_topic and t.locale = v_locale and t.retired_at is null;
  if v_version is null then
    v_locale := 'en';
    select t.version into v_version from app.notification_templates t
    where t.key = p_topic and t.locale = 'en' and t.retired_at is null;
  end if;

  if v_version is not null then
    for r in select * from private.resolve_alert_recipients_v1(
      p_tenant_id,v_booking.location_id,p_permission_key)
    loop
      if not private.staff_preference_enabled_v1(p_tenant_id,r.membership_id,p_topic) then
        continue;
      end if;
      insert into app.notification_messages(
        tenant_id,booking_id,outbox_event_id,template_key,template_locale,template_version,
        booking_revision,recipient_hash,recipient_kind,recipient_membership_id,correlation_id)
      values (p_tenant_id,p_booking_id,v_outbox,p_topic,v_locale,v_version,
        v_booking.revision,
        pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
          p_tenant_id::text||':membership:'||r.membership_id::text,'UTF8')),'hex'),
        'staff',r.membership_id,v_booking.correlation_id)
      on conflict do nothing;
      v_count := v_count + 1;
    end loop;
  end if;

  update app.outbox_events o set state='delivered', updated_at=pg_catalog.statement_timestamp()
  where o.id = v_outbox;
  return v_count;
end;
$function$;
revoke all on function private.enqueue_staff_alert_v1(uuid,uuid,text,text) from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 5. The daily agenda digest
-- ---------------------------------------------------------------------------

-- One digest per opted-in member per local day, once their own digest time has
-- passed in their location's time zone. Idempotent on (member, local date), so
-- the scheduler may run as often as it likes. The message stores only the day
-- and the zone; the agenda itself is built when the message is claimed, from
-- the member's access at that moment, so no customer detail sits in the ledger.
create or replace function private.enqueue_staff_daily_digests_v1(p_limit integer default 200)
returns table (enqueued integer)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '20s'
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_count integer := 0;
  v_row record;
  v_zone text;
  v_local timestamp;
  v_locale text;
  v_version integer;
  v_id uuid;
begin
  if p_limit is null or p_limit not between 1 and 1000 then
    raise exception using errcode='22023',message='notification_invalid_batch';
  end if;
  for v_row in
    select p.tenant_id, p.membership_id, p.digest_local_time
    from app.staff_notification_preferences p
    join app.memberships m on m.tenant_id = p.tenant_id and m.id = p.membership_id
    join app.tenants t on t.id = p.tenant_id
    where m.status = 'active' and t.status = 'active'
      and pg_catalog.jsonb_typeof(p.preferences->'staff.daily_digest') = 'boolean'
      and (p.preferences->>'staff.daily_digest')::boolean
    order by p.tenant_id, p.membership_id
  loop
    exit when v_count >= p_limit;
    if not private.notification_channel_enabled_v1(v_row.tenant_id,'staff.daily_digest','email') then
      continue;
    end if;
    v_zone := private.membership_time_zone_v1(v_row.tenant_id,v_row.membership_id);
    v_local := v_now at time zone v_zone;
    if v_local::time < v_row.digest_local_time then
      continue;
    end if;
    v_locale := coalesce((select s.default_locale from app.tenant_settings s
      where s.tenant_id = v_row.tenant_id),'en');
    select t.version into v_version from app.notification_templates t
    where t.key = 'staff.daily_digest' and t.locale = v_locale and t.retired_at is null;
    v_id := null;
    insert into app.notification_messages(
      tenant_id,booking_id,outbox_event_id,template_key,template_locale,template_version,
      booking_revision,recipient_hash,recipient_kind,recipient_membership_id,correlation_id,
      dedupe_key,payload)
    values (v_row.tenant_id,null,null,'staff.daily_digest',v_locale,coalesce(v_version,1),0,
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
        v_row.tenant_id::text||':membership:'||v_row.membership_id::text,'UTF8')),'hex'),
      'staff',v_row.membership_id,pg_catalog.gen_random_uuid(),
      'digest:'||v_row.membership_id::text||':'||v_local::date::text,
      jsonb_build_object('local_date',v_local::date::text,'time_zone',v_zone))
    on conflict do nothing
    returning id into v_id;
    if v_id is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return query select v_count;
end;
$$;

create or replace function api_v1.enqueue_staff_daily_digests_v1(p_limit integer default 200)
returns table (enqueued integer)
language sql volatile security invoker set search_path = '' set statement_timeout = '20s'
as $$ select * from private.enqueue_staff_daily_digests_v1(p_limit); $$;

revoke all on function
  private.enqueue_staff_daily_digests_v1(integer),
  api_v1.enqueue_staff_daily_digests_v1(integer)
from public,anon,authenticated;
grant execute on function
  private.enqueue_staff_daily_digests_v1(integer),
  api_v1.enqueue_staff_daily_digests_v1(integer)
to service_role;

-- ---------------------------------------------------------------------------
-- 6. The WhatsApp worker's surface, mirroring email
-- ---------------------------------------------------------------------------

-- Claim due WhatsApp messages under a visibility timeout. The phone number is
-- read from the booking's consent snapshot at send time, and the token is a
-- REFERENCE the worker resolves itself. A tenant whose channel stopped being
-- available (plan changed, channel switched off, consent missing) has its
-- waiting messages failed with a stable code instead of sent.
create or replace function private.claim_whatsapp_batch_v1(
  p_limit integer default 20,
  p_visibility_seconds integer default 120
)
returns table(
  message_id uuid,
  tenant_id uuid,
  booking_id uuid,
  template_key text,
  template_locale text,
  booking_revision bigint,
  attempt integer,
  correlation_id uuid,
  payload jsonb,
  recipient_phone_e164 text,
  phone_number_id text,
  access_token_secret_ref text,
  template_name text,
  template_language text
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

  update app.notification_messages m
  set status='failed', dead_lettered_at=v_now, locked_until=null,
      last_error_code='whatsapp_unavailable', updated_at=v_now
  where m.channel='whatsapp' and m.status='queued' and m.dead_lettered_at is null
    and m.next_attempt_at<=v_now
    and (not (select s.available from private.whatsapp_state_v1(m.tenant_id) s)
      or not exists (select 1 from app.whatsapp_configs w
        where w.tenant_id=m.tenant_id and w.template_map ? m.template_key)
      or not exists (select 1 from app.booking_whatsapp_consents c
        where c.tenant_id=m.tenant_id and c.booking_id=m.booking_id));

  return query
  with claimed as (
    update app.notification_messages m
    set status='sending', attempts=m.attempts+1,
        locked_until=v_now+make_interval(secs=>p_visibility_seconds), updated_at=v_now
    where m.id in (
      select c.id from app.notification_messages c
      where c.channel='whatsapp'
        and c.status in ('queued','sending') and c.dead_lettered_at is null
        and c.next_attempt_at<=v_now
        and (c.locked_until is null or c.locked_until<=v_now)
        and (select s.available from private.whatsapp_state_v1(c.tenant_id) s)
      order by c.next_attempt_at
      limit p_limit
      for update skip locked)
    returning m.*
  )
  select c.id,c.tenant_id,c.booking_id,c.template_key,c.template_locale,c.booking_revision,
    c.attempts,c.correlation_id,
    private.notification_claim_payload_v1(row(c.*)::app.notification_messages,o.payload),
    consent.phone_e164,w.phone_number_id,w.access_token_secret_ref,
    w.template_map->c.template_key->>'name',
    w.template_map->c.template_key->>'language'
  from claimed c
  join app.whatsapp_configs w on w.tenant_id=c.tenant_id
  join app.booking_whatsapp_consents consent
    on consent.tenant_id=c.tenant_id and consent.booking_id=c.booking_id
  left join app.outbox_events o on o.id=c.outbox_event_id;
end;
$$;

-- The same attempt ledger and backoff as email, refused for any other channel
-- so neither worker can settle the other's message.
create or replace function private.record_whatsapp_attempt_v1(
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
begin
  if not exists (select 1 from app.notification_messages m
    where m.id=p_message_id and m.channel='whatsapp') then
    raise exception using errcode='42501',message='notification_unavailable';
  end if;
  return query select * from private.record_notification_attempt_v1(
    p_message_id,p_attempt,p_outcome,p_started_at,p_provider_reference,p_error_code);
end;
$$;

-- A verified Meta status callback. Deduplicated by the reference the webhook
-- derives (`<wamid>:<status>`), ordered by the provider's own timestamp, and
-- never regressing canonical state. The phone-number id the callback arrived
-- for must be the one the message's tenant configured; a callback for another
-- tenant's number is acknowledged and changes nothing. A failed WhatsApp
-- delivery does not suppress the number: a phone that is not on WhatsApp is
-- not a complaint, and email for the same event was sent regardless
-- (docs/adr/0018-whatsapp-notification-channel.md).
create or replace function private.record_whatsapp_provider_event_v1(
  p_provider_event_reference text,
  p_status text,
  p_occurred_at timestamptz,
  p_provider_message_reference text,
  p_phone_number_id text,
  p_error_code text default null
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
  v_error text;
begin
  if p_status is null or p_status not in ('sent','delivered','read','failed')
     or p_provider_event_reference is null
     or char_length(p_provider_event_reference) not between 1 and 200
     or p_occurred_at is null or p_phone_number_id is null then
    raise exception using errcode='22023',message='notification_invalid_event';
  end if;
  -- A short stable code only, never a provider body.
  v_error := case when p_error_code ~ '^[A-Za-z0-9_.:-]{1,80}$' then p_error_code end;
  select * into v_message from app.notification_messages m
  where m.provider='meta_whatsapp' and m.channel='whatsapp'
    and m.provider_message_reference=p_provider_message_reference
  for update;
  if v_message.id is null or not exists (select 1 from app.whatsapp_configs w
      where w.tenant_id=v_message.tenant_id and w.phone_number_id=p_phone_number_id) then
    -- Acknowledged, not invented: no tenant-owned row for a message we do not
    -- recognise, or for a number that is not this tenant's.
    return query select false,null::uuid;
    return;
  end if;

  insert into app.notification_provider_events(
    tenant_id,message_id,provider,provider_event_id,event_type,occurred_at)
  values (v_message.tenant_id,v_message.id,'meta_whatsapp',p_provider_event_reference,
    p_status,p_occurred_at)
  on conflict (provider,provider_event_id) do nothing;
  if not found then
    return query select false,v_message.id;
    return;
  end if;

  select max(e.occurred_at) into v_latest from app.notification_provider_events e
  where e.message_id=v_message.id and e.applied and e.occurred_at > p_occurred_at;
  if v_latest is not null then
    return query select false,v_message.id;
    return;
  end if;

  v_status := case p_status
    when 'sent' then case when v_message.status in ('delivered','failed') then v_message.status else 'sent' end
    when 'delivered' then 'delivered'
    when 'read' then 'delivered'
    when 'failed' then 'failed'
    else v_message.status end;
  if v_status is distinct from v_message.status then
    update app.notification_messages m set status=v_status, updated_at=v_now,
      last_error_code=case when p_status='failed' then coalesce(v_error,'provider_failed')
        else m.last_error_code end
    where m.id=v_message.id;
    v_applied := true;
  end if;
  update app.notification_provider_events e set applied=v_applied
  where e.provider='meta_whatsapp' and e.provider_event_id=p_provider_event_reference;
  return query select v_applied,v_message.id;
end;
$function$;

create or replace function api_v1.claim_whatsapp_batch_v1(
  p_limit integer default 20, p_visibility_seconds integer default 120)
returns table (
  message_id uuid, tenant_id uuid, booking_id uuid, template_key text, template_locale text,
  booking_revision bigint, attempt integer, correlation_id uuid, payload jsonb,
  recipient_phone_e164 text, phone_number_id text, access_token_secret_ref text,
  template_name text, template_language text)
language sql volatile security invoker set search_path = '' set statement_timeout = '20s'
as $$ select * from private.claim_whatsapp_batch_v1(p_limit,p_visibility_seconds); $$;

create or replace function api_v1.record_whatsapp_attempt_v1(
  p_message_id uuid, p_attempt integer, p_outcome text, p_started_at timestamptz,
  p_provider_reference text default null, p_error_code text default null)
returns table (status text, next_attempt_at timestamptz, dead_lettered boolean)
language sql volatile security invoker set search_path = '' set statement_timeout = '20s'
as $$ select * from private.record_whatsapp_attempt_v1(
  p_message_id,p_attempt,p_outcome,p_started_at,p_provider_reference,p_error_code); $$;

create or replace function api_v1.record_whatsapp_provider_event_v1(
  p_provider_event_reference text, p_status text, p_occurred_at timestamptz,
  p_provider_message_reference text, p_phone_number_id text, p_error_code text default null)
returns table (applied boolean, message_id uuid)
language sql volatile security invoker set search_path = '' set statement_timeout = '20s'
as $$ select * from private.record_whatsapp_provider_event_v1(
  p_provider_event_reference,p_status,p_occurred_at,p_provider_message_reference,
  p_phone_number_id,p_error_code); $$;

revoke all on function
  private.claim_whatsapp_batch_v1(integer,integer),
  private.record_whatsapp_attempt_v1(uuid,integer,text,timestamptz,text,text),
  private.record_whatsapp_provider_event_v1(text,text,timestamptz,text,text,text),
  api_v1.claim_whatsapp_batch_v1(integer,integer),
  api_v1.record_whatsapp_attempt_v1(uuid,integer,text,timestamptz,text,text),
  api_v1.record_whatsapp_provider_event_v1(text,text,timestamptz,text,text,text)
from public,anon,authenticated;
grant execute on function
  private.claim_whatsapp_batch_v1(integer,integer),
  private.record_whatsapp_attempt_v1(uuid,integer,text,timestamptz,text,text),
  private.record_whatsapp_provider_event_v1(text,text,timestamptz,text,text,text),
  api_v1.claim_whatsapp_batch_v1(integer,integer),
  api_v1.record_whatsapp_attempt_v1(uuid,integer,text,timestamptz,text,text),
  api_v1.record_whatsapp_provider_event_v1(text,text,timestamptz,text,text,text)
to service_role;

-- ---------------------------------------------------------------------------
-- 7. The booking confirmation path records WhatsApp consent
-- ---------------------------------------------------------------------------

-- The confirmation engine is unchanged and keeps every check it makes. It is
-- renamed, and the public name becomes a thin definer wrapper with the SAME
-- signature, so every caller (the Client, the Dashboard's on-behalf path, and
-- paid settlement replaying a stored draft) passes through it untouched.
--
-- The opt-in rides inside the contact object, which is how it survives the
-- paid path: `begin_checkout_v1` stores the contact on the draft, and
-- settlement replays that draft through this function.
--
--   p_contact = {"fullName": ..., "email": ..., "phone"?: ...,
--                "whatsappOptIn"?: {"phoneE164": "+9665...",
--                                   "consentText": "...", "consentVersion": "1"}}
--
-- The snapshot is written only for a new booking, only when the channel is
-- available to the tenant at that moment, and in the booking's own locale.
-- A malformed opt-in is refused before the booking is attempted, because a
-- customer who ticked the box must not silently lose their choice.
alter function private.confirm_booking_v1(text,text,uuid,text,text,jsonb,text,text,jsonb,text,uuid)
  rename to confirm_booking_engine_v1;
revoke all on function private.confirm_booking_engine_v1(text,text,uuid,text,text,jsonb,text,text,jsonb,text,uuid)
  from public,anon,authenticated;

create function private.confirm_booking_v1(
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
  v_contact jsonb := p_contact;
  v_opt_in jsonb;
  v_result record;
  v_tenant_id uuid;
begin
  if p_contact is not null and pg_catalog.jsonb_typeof(p_contact) = 'object'
     and p_contact ? 'whatsappOptIn' then
    v_opt_in := p_contact->'whatsappOptIn';
    v_contact := p_contact - 'whatsappOptIn';
    if pg_catalog.jsonb_typeof(v_opt_in) = 'null' then
      v_opt_in := null;
    elsif pg_catalog.jsonb_typeof(v_opt_in) <> 'object'
       or not (v_opt_in ?& array['phoneE164','consentText','consentVersion'])
       or exists (select 1 from pg_catalog.jsonb_object_keys(v_opt_in) k
         where k not in ('phoneE164','consentText','consentVersion'))
       or pg_catalog.jsonb_typeof(v_opt_in->'phoneE164') <> 'string'
       or pg_catalog.jsonb_typeof(v_opt_in->'consentText') <> 'string'
       or pg_catalog.jsonb_typeof(v_opt_in->'consentVersion') <> 'string'
       -- E.164: a plus, a non-zero country code, at most fifteen digits.
       or v_opt_in->>'phoneE164' !~ '^\+[1-9][0-9]{7,14}$'
       or char_length(pg_catalog.btrim(v_opt_in->>'consentText')) not between 1 and 2000
       or v_opt_in->>'consentVersion' !~ '^[A-Za-z0-9._-]{1,40}$' then
      raise exception using errcode='22023',message='booking_invalid_whatsapp_opt_in';
    end if;
  end if;

  select * into v_result from private.confirm_booking_engine_v1(
    p_hostname,p_application,p_hold_id,p_session_token,p_idempotency_key,v_contact,
    p_consent_version,p_locale,p_intake,p_customer_time_zone,p_payment_attempt_id);

  if v_opt_in is not null and not v_result.replayed then
    select b.tenant_id into v_tenant_id from app.bookings b where b.id = v_result.booking_id;
    if (select s.available from private.whatsapp_state_v1(v_tenant_id) s) then
      insert into app.booking_whatsapp_consents(
        tenant_id,booking_id,phone_e164,consent_text,consent_version,locale,consented_at)
      values (v_tenant_id,v_result.booking_id,v_opt_in->>'phoneE164',
        pg_catalog.btrim(v_opt_in->>'consentText'),v_opt_in->>'consentVersion',
        coalesce(p_locale,'en'),statement_timestamp())
      on conflict do nothing;
    end if;
  end if;

  return query select v_result.contract_version,v_result.booking_id,v_result.public_reference,
    v_result.status,v_result.approval_status,v_result.approval_deadline,v_result.payment_status,
    v_result.notification_status,v_result.calendar_status,v_result.starts_at,v_result.ends_at,
    v_result.service_name,v_result.location_name,v_result.location_time_zone,
    v_result.customer_time_zone,v_result.locale,v_result.price_minor,v_result.tax_rate_bps,
    v_result.currency,v_result.policy_snapshot,v_result.consent_version,
    v_result.booking_revision,v_result.replayed;
end;
$function$;
comment on function private.confirm_booking_v1(text,text,uuid,text,text,jsonb,text,text,jsonb,text,uuid) is
  'Booking confirmation v1. Validates and strips an optional contact.whatsappOptIn, runs the unchanged confirmation engine, and snapshots WhatsApp consent beside a new booking when the channel is available. Calls no provider.';
revoke all on function private.confirm_booking_v1(text,text,uuid,text,text,jsonb,text,text,jsonb,text,uuid) from public;
grant execute on function private.confirm_booking_v1(text,text,uuid,text,text,jsonb,text,text,jsonb,text,uuid) to anon,authenticated;
