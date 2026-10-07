-- Notification settings, staff preferences, test sends, the WhatsApp channel's
-- configuration and consent records, and the brand the mail wears.
--
-- This migration is the data and the tenant-facing surface. The engine that
-- reads it (dispatch, claim, reminders, staff alerts, digests, the WhatsApp
-- worker and the booking confirmation hook) is the next migration, so each file
-- reads in one direction.
--
-- Decisions recorded here, because the code cannot say them on its own:
--
--   * Capability. There is no `communication.manage` permission, and adding one
--     is a role-matrix change for every tenant. Notification settings are tenant
--     configuration of the same kind `save_tenant_settings_v1` already guards,
--     so they use the same capability: `policy.edit`, direct, tenant-scoped.
--     The WhatsApp provider configuration is a provider integration and uses
--     `integration.manage` plus a recent second factor, exactly like payment
--     onboarding.
--   * Email is the channel that always works. A type that is not editable is
--     always sent by email, whatever the stored overrides say.
--   * WhatsApp is additive. It is never a replacement for the email of the same
--     event, it is off unless the plan grants `whatsapp_notifications`, and it
--     needs the tenant's configuration AND the customer's own consent snapshot.
--   * No provider secret is stored. `access_token_secret_ref` names a Vault
--     secret or an Edge Function environment variable; only the platform worker
--     reads the reference, and no tenant-facing function ever returns it.
--
-- Error vocabulary added here:
--   notification_settings_invalid       22023
--   notification_preferences_invalid    22023
--   notification_test_invalid           22023
--   notification_test_recipient_unverified 42501
--   notification_test_rate_limited      42501
--   whatsapp_config_invalid             22023
-- Reused: policy_denied, not_entitled, revision_conflict (40001),
-- idempotency_conflict, integration_step_up_required.

-- ---------------------------------------------------------------------------
-- 1. Vocabulary
-- ---------------------------------------------------------------------------

-- The daily agenda digest is a staff message like any other, rendered from the
-- platform's own template and addressed to a member by digest.
alter table app.notification_templates drop constraint notification_templates_key_check;
alter table app.notification_templates add constraint notification_templates_key_check
  check (key in (
    'booking.confirmed','booking.requested','booking.rejected',
    'booking.request_expired','booking.proposal_created','booking.proposal_declined',
    'booking.rescheduled','booking.cancelled','management.otp_requested',
    'payment.refunded','payment.refund_failed','booking.reminder',
    'staff.request_pending','staff.payment_exception','staff.booking_cancelled',
    'staff.delivery_failed','staff.daily_digest'));
insert into app.notification_templates(key,locale,version,variable_schema) values
  ('staff.daily_digest','en',1,'["localDate","timeZone","brandName"]'::jsonb),
  ('staff.daily_digest','ar',1,'["localDate","timeZone","brandName"]'::jsonb)
on conflict do nothing;

-- An intent the tenant has switched off is neither delivered nor failed. The
-- ledger says which, exactly as it does for a superseded reminder.
alter table app.outbox_events drop constraint outbox_events_state_check;
alter table app.outbox_events add constraint outbox_events_state_check
  check (state in ('pending','delivered','failed','superseded','skipped'));

-- A message now names its channel and, where one intent legitimately produces
-- several messages for one recipient (a reminder 24 h and again 2 h before),
-- the variant that tells them apart. Both join the durable key, so a duplicate
-- dispatch still creates nothing.
alter table app.notification_messages
  add column channel text not null default 'email' check (channel in ('email','whatsapp')),
  add column variant text not null default '' check (variant ~ '^[a-z0-9:_-]{0,64}$'),
  -- A test send to the caller's own address. It never touches a booking.
  add column is_test boolean not null default false,
  -- The durable key for a message that has no booking (a test send, a daily
  -- digest). A booking message is keyed by its own tuple instead.
  add column dedupe_key text check (dedupe_key is null or char_length(dedupe_key) between 1 and 200),
  -- Renderer variables for a message that has no outbox intent to carry them.
  add column payload jsonb check (payload is null or jsonb_typeof(payload) = 'object');
alter table app.notification_messages alter column outbox_event_id drop not null;
alter table app.notification_messages add constraint notification_messages_origin_check
  check (outbox_event_id is not null or dedupe_key is not null);
alter table app.notification_messages add constraint notification_messages_test_check
  check (not is_test or (recipient_kind = 'staff' and booking_id is null and channel = 'email'));

do $key$
declare v_name text;
begin
  select c.conname into v_name from pg_catalog.pg_constraint c
  where c.conrelid = 'app.notification_messages'::regclass and c.contype = 'u'
    and pg_catalog.pg_get_constraintdef(c.oid) like 'UNIQUE (tenant_id, booking_id, template_key,%';
  if v_name is null then
    raise exception 'notification message intent key not found';
  end if;
  execute pg_catalog.format('alter table app.notification_messages drop constraint %I', v_name);
end;
$key$;
alter table app.notification_messages add constraint notification_messages_intent_key
  unique (tenant_id,booking_id,template_key,booking_revision,recipient_hash,template_locale,
    channel,variant);
create unique index notification_messages_dedupe_idx
  on app.notification_messages(tenant_id,dedupe_key) where dedupe_key is not null;
create index notification_messages_test_rate_idx
  on app.notification_messages(tenant_id,recipient_membership_id,created_at) where is_test;
create index notification_messages_whatsapp_due_idx
  on app.notification_messages(next_attempt_at)
  where channel = 'whatsapp' and status in ('queued','sending') and dead_lettered_at is null;

-- WhatsApp Cloud API statuses are `sent`, `delivered`, `read` and `failed`.
alter table app.notification_provider_events drop constraint notification_provider_events_event_type_check;
alter table app.notification_provider_events add constraint notification_provider_events_event_type_check
  check (event_type in ('delivered','delayed','bounced','complained','failed','suppressed',
    'opened','clicked','sent','read'));

-- ---------------------------------------------------------------------------
-- 2. The notification type catalogue
-- ---------------------------------------------------------------------------

-- Every message type a tenant can see in its settings, what audience it has,
-- whether the tenant may switch it off, and whether it may also go by WhatsApp.
-- A function rather than a table: it is platform vocabulary that changes with
-- a migration, never with a tenant edit.
create or replace function private.notification_type_catalog_v1()
returns table (
  template_key text,
  audience text,
  editable boolean,
  whatsapp_capable boolean,
  default_email boolean,
  default_whatsapp boolean,
  -- Default for a member's own preference; null where there is no preference.
  staff_preference_default boolean,
  sort_order integer
)
language sql
immutable
security invoker
set search_path = ''
as $$
  select * from (values
    -- Transactional messages that must always go.
    ('booking.confirmed','customer',false,true,true,true,null::boolean,10),
    ('management.otp_requested','customer',false,false,true,false,null::boolean,15),
    ('booking.requested','customer',true,true,true,true,null::boolean,20),
    ('booking.rejected','customer',true,true,true,true,null::boolean,30),
    ('booking.request_expired','customer',true,true,true,true,null::boolean,40),
    ('booking.proposal_created','customer',true,true,true,true,null::boolean,50),
    ('booking.proposal_declined','customer',true,true,true,true,null::boolean,60),
    ('booking.rescheduled','customer',true,true,true,true,null::boolean,70),
    ('booking.cancelled','customer',true,true,true,true,null::boolean,80),
    ('booking.reminder','customer',true,true,true,true,null::boolean,90),
    ('payment.refunded','customer',true,false,true,false,null::boolean,100),
    ('payment.refund_failed','customer',true,false,true,false,null::boolean,110),
    -- Auth mail is sent by the Auth hook, not the outbox, and always goes. It
    -- is listed so a tenant can see that it exists.
    ('auth.sign_in_link','staff',false,false,true,false,null::boolean,200),
    ('auth.password_reset','staff',false,false,true,false,null::boolean,210),
    ('auth.email_change','staff',false,false,true,false,null::boolean,220),
    ('staff.request_pending','staff',true,false,true,false,true,300),
    ('staff.booking_cancelled','staff',true,false,true,false,true,310),
    ('staff.payment_exception','staff',true,false,true,false,true,320),
    ('staff.delivery_failed','staff',true,false,true,false,true,330),
    -- Off for every member until that member turns it on.
    ('staff.daily_digest','staff',true,false,true,false,false,340)
  ) as catalog(template_key,audience,editable,whatsapp_capable,default_email,
    default_whatsapp,staff_preference_default,sort_order);
$$;

-- ---------------------------------------------------------------------------
-- 3. Tenant-owned tables
-- ---------------------------------------------------------------------------

-- The tenant's choices. Overrides are sparse: a type the tenant never touched
-- follows the catalogue default, so a new type ships with a sensible default
-- instead of a migration per tenant.
create table app.notification_settings (
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  overrides jsonb not null default '{}'::jsonb check (jsonb_typeof(overrides) = 'object'),
  reminder_offsets_minutes integer[] not null default '{1440,120}'::integer[]
    check (cardinality(reminder_offsets_minutes) between 1 and 4
      and pg_catalog.array_position(reminder_offsets_minutes,null) is null
      and 15 <= all (reminder_offsets_minutes)
      and 10080 >= all (reminder_offsets_minutes)),
  revision bigint not null default 1 check (revision > 0),
  updated_by_membership_id uuid,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id),
  foreign key (tenant_id,updated_by_membership_id)
    references app.memberships(tenant_id,id) on delete restrict
);

-- A member's own choices about the staff mail addressed to them.
create table app.staff_notification_preferences (
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  membership_id uuid not null,
  preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(preferences) = 'object'),
  -- Wall-clock time in the member's location time zone.
  digest_local_time time not null default '07:30',
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id,membership_id),
  foreign key (tenant_id,membership_id) references app.memberships(tenant_id,id) on delete restrict
);

-- The WhatsApp Cloud API configuration. The access token is never here: only a
-- reference to where the platform keeps it.
create table app.whatsapp_configs (
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  enabled boolean not null default false,
  phone_number_id text check (phone_number_id is null or phone_number_id ~ '^[0-9]{5,32}$'),
  business_account_id text check (business_account_id is null or business_account_id ~ '^[0-9]{5,32}$'),
  -- `vault:<uuid>` or `env:<NAME>`. Anything shaped like a credential fails.
  access_token_secret_ref text check (access_token_secret_ref is null
    or access_token_secret_ref ~ '^(vault:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|env:[A-Z][A-Za-z0-9_]{2,127})$'),
  -- template_key -> {"name": approved template name, "language": "en"|"ar"|"en_US"...}
  template_map jsonb not null default '{}'::jsonb check (jsonb_typeof(template_map) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  updated_by_membership_id uuid,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id),
  foreign key (tenant_id,updated_by_membership_id)
    references app.memberships(tenant_id,id) on delete restrict
);

-- What the customer agreed to, in the words and language they saw, when they
-- booked. Written once by the confirmation path and never rewritten: a later
-- edit to the tenant's configuration or wording cannot change what this
-- customer consented to.
create table app.booking_whatsapp_consents (
  tenant_id uuid not null,
  booking_id uuid not null,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  consent_text text not null check (consent_text = btrim(consent_text)
    and char_length(consent_text) between 1 and 2000),
  consent_version text not null check (consent_version ~ '^[A-Za-z0-9._-]{1,40}$'),
  locale text not null check (locale in ('en','ar')),
  consented_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id,booking_id),
  foreign key (tenant_id,booking_id) references app.bookings(tenant_id,id) on delete restrict
);
create trigger booking_whatsapp_consents_append_only
  before update or delete on app.booking_whatsapp_consents
  for each row execute function private.enforce_append_only();

-- Who changed notification configuration, under which request, with what
-- outcome. Doubles as the idempotency ledger for every mutation below. Never
-- the values: a settings document can carry an address.
create table app.notification_settings_events (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  actor_auth_user_id uuid not null,
  actor_membership_id uuid,
  request_id uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  action text not null check (action in
    ('settings_saved','preferences_saved','test_enqueued','whatsapp_config_saved')),
  target_id uuid,
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  primary key (id),
  unique (tenant_id,request_id),
  foreign key (tenant_id,actor_membership_id)
    references app.memberships(tenant_id,id) on delete restrict
);
create trigger notification_settings_events_append_only
  before update or delete on app.notification_settings_events
  for each row execute function private.enforce_append_only();

-- ---------------------------------------------------------------------------
-- 4. Row level security
-- ---------------------------------------------------------------------------

do $rls$
declare t text;
begin
  foreach t in array array['notification_settings','staff_notification_preferences',
    'whatsapp_configs','booking_whatsapp_consents','notification_settings_events'] loop
    execute format('alter table app.%I enable row level security',t);
    execute format('create policy %I on app.%I for insert to anon,authenticated with check (false)',t||'_insert_denied',t);
    execute format('create policy %I on app.%I for update to anon,authenticated using (false) with check (false)',t||'_update_denied',t);
    execute format('create policy %I on app.%I for delete to anon,authenticated using (false)',t||'_delete_denied',t);
    execute format('revoke all on app.%I from public,anon,authenticated',t);
  end loop;
end;
$rls$;

-- Settings carry no secret and no personal data: any active member may read
-- their own tenant's row, and nobody may read another tenant's. The RPC is
-- stricter (policy.edit), because it doubles as the preview authorization.
create policy notification_settings_select_member on app.notification_settings
  for select to authenticated using ((select private.is_active_tenant_member(tenant_id)));
create policy notification_settings_select_denied_anon on app.notification_settings
  for select to anon using (false);
grant select on app.notification_settings to authenticated;

-- A member reads their own preferences; a staff manager reads the team's.
create policy staff_notification_preferences_select_own on app.staff_notification_preferences
  for select to authenticated using (
    exists (select 1 from app.memberships m
      where m.tenant_id = staff_notification_preferences.tenant_id
        and m.id = staff_notification_preferences.membership_id
        and m.status = 'active'
        and m.auth_user_id = (select private.current_auth_user_id()))
    or (select private.has_direct_capability(tenant_id,'staff.manage')));
create policy staff_notification_preferences_select_denied_anon on app.staff_notification_preferences
  for select to anon using (false);
grant select on app.staff_notification_preferences to authenticated;

-- The provider configuration holds a secret reference, so no application role
-- reads the table at all. The RPC projects it without the reference.
create policy whatsapp_configs_select_denied on app.whatsapp_configs
  for select to anon,authenticated using (false);

-- A consent record holds a phone number: readable by members who may see this
-- booking's customer details, and by nobody else.
create policy booking_whatsapp_consents_select_scoped on app.booking_whatsapp_consents
  for select to authenticated using (exists (
    select 1 from app.bookings b
    where b.tenant_id = booking_whatsapp_consents.tenant_id
      and b.id = booking_whatsapp_consents.booking_id
      and (select private.is_active_tenant_member(b.tenant_id))
      and (select private.can_access_location(b.tenant_id,b.location_id))
      and (select private.can_decide_booking(b.tenant_id,b.location_id,'customer.pii.view'))));
create policy booking_whatsapp_consents_select_denied_anon on app.booking_whatsapp_consents
  for select to anon using (false);
grant select on app.booking_whatsapp_consents to authenticated;

create policy notification_settings_events_select_audit on app.notification_settings_events
  for select to authenticated using ((select private.is_active_tenant_member(tenant_id))
    and (select private.has_direct_capability(tenant_id,'audit.read')));
create policy notification_settings_events_select_denied_anon on app.notification_settings_events
  for select to anon using (false);
grant select on app.notification_settings_events to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Helpers the engine and the RPCs share
-- ---------------------------------------------------------------------------

-- Is this type sent on this channel for this tenant? Email for a type that is
-- not editable is always yes. A type outside the catalogue keeps its email and
-- never gets WhatsApp, so an unknown key fails safe in both directions.
create or replace function private.notification_channel_enabled_v1(
  p_tenant_id uuid, p_template_key text, p_channel text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((
    select case
      when p_channel = 'email' and not c.editable then true
      when p_channel = 'whatsapp' and not c.whatsapp_capable then false
      else coalesce(
        case when pg_catalog.jsonb_typeof(s.overrides->p_template_key->(p_channel||'_enabled')) = 'boolean'
          then (s.overrides->p_template_key->>(p_channel||'_enabled'))::boolean end,
        case when p_channel = 'email' then c.default_email else c.default_whatsapp end)
    end
    from private.notification_type_catalog_v1() c
    left join app.notification_settings s on s.tenant_id = p_tenant_id
    where c.template_key = p_template_key), p_channel = 'email');
$$;

-- Reminder lead times, longest first. A tenant that never saved settings gets
-- the documented default of a day and two hours before.
create or replace function private.notification_reminder_offsets_v1(p_tenant_id uuid)
returns integer[]
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((
    select pg_catalog.array_agg(distinct o order by o desc)
    from app.notification_settings s, pg_catalog.unnest(s.reminder_offsets_minutes) o
    where s.tenant_id = p_tenant_id), array[1440,120]);
$$;

-- Does this member want this staff message? A type without a preference (or
-- an unknown one) is wanted, so a new alert is never silently dropped.
create or replace function private.staff_preference_enabled_v1(
  p_tenant_id uuid, p_membership_id uuid, p_template_key text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select case when pg_catalog.jsonb_typeof(p.preferences->p_template_key) = 'boolean'
       then (p.preferences->>p_template_key)::boolean end
     from app.staff_notification_preferences p
     where p.tenant_id = p_tenant_id and p.membership_id = p_membership_id),
    (select c.staff_preference_default from private.notification_type_catalog_v1() c
     where c.template_key = p_template_key),
    true);
$$;

-- The WhatsApp channel's state for one tenant. Available means all three:
-- the plan grants it (runtime entitlements override everything local), the
-- tenant configured every id and the token reference, and the tenant turned it
-- on. Not entitled is the default: no entitlement row, no channel.
create or replace function private.whatsapp_state_v1(p_tenant_id uuid)
returns table (entitled boolean, configured boolean, enabled boolean, available boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  with state as (
    select
      coalesce((private.get_runtime_entitlements_v1(p_tenant_id)->>'whatsapp_notifications')::boolean,
        false) as entitled,
      coalesce((select w.phone_number_id is not null and w.business_account_id is not null
          and w.access_token_secret_ref is not null
        from app.whatsapp_configs w where w.tenant_id = p_tenant_id),false) as configured,
      coalesce((select w.enabled from app.whatsapp_configs w where w.tenant_id = p_tenant_id),
        false) as enabled
  )
  select s.entitled, s.configured, s.enabled, s.entitled and s.configured and s.enabled
  from state s;
$$;

-- The wall clock a member's day runs on: their first scoped location, else the
-- tenant's first active location, else UTC.
create or replace function private.membership_time_zone_v1(p_tenant_id uuid, p_membership_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select l.time_zone from app.membership_location_scopes s
     join app.locations l on l.tenant_id = s.tenant_id and l.id = s.location_id
     where s.tenant_id = p_tenant_id and s.membership_id = p_membership_id and l.status = 'active'
     order by l.name, l.id limit 1),
    (select l.time_zone from app.locations l
     where l.tenant_id = p_tenant_id and l.status = 'active'
     order by l.created_at, l.id limit 1),
    'UTC');
$$;

-- One idempotency rule for every mutation in this file: the same request id
-- with the same request and the same actor replays the stored result; anything
-- else under that id is a conflict rather than a silent second write.
create or replace function private.notification_request_replay_v1(
  p_tenant_id uuid, p_request_id uuid, p_request_hash text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_prior app.notification_settings_events%rowtype;
begin
  select * into v_prior from app.notification_settings_events e
  where e.tenant_id = p_tenant_id and e.request_id = p_request_id;
  if v_prior.id is null then
    return null;
  end if;
  if v_prior.request_hash is distinct from p_request_hash
     or v_prior.actor_auth_user_id is distinct from (select private.current_auth_user_id()) then
    raise exception using errcode='22023',message='idempotency_conflict';
  end if;
  return v_prior.result || jsonb_build_object('replayed',true);
end;
$$;

create or replace function private.notification_request_hash_v1(p_parts jsonb)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_parts::text,'UTF8')),'hex');
$$;

-- ---------------------------------------------------------------------------
-- 6. Tenant notification settings
-- ---------------------------------------------------------------------------

create or replace function private.get_notification_settings_v1(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings app.notification_settings%rowtype;
  v_whatsapp record;
begin
  -- Membership AND the settings capability. The preview and test-send Edge
  -- Function use this read as its authorization probe, so it must refuse
  -- exactly the callers those surfaces refuse. `has_direct_capability` already
  -- requires an active membership of this tenant.
  if not coalesce((select private.is_active_tenant_member(p_tenant_id)),false)
     or not coalesce((select private.has_direct_capability(p_tenant_id,'policy.edit')),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  select * into v_settings from app.notification_settings s where s.tenant_id = p_tenant_id;
  select * into v_whatsapp from private.whatsapp_state_v1(p_tenant_id);
  return jsonb_build_object(
    'version',1,
    'tenant_id',p_tenant_id,
    -- Zero until the first save, so the first save sends 0 as its expectation.
    'revision',coalesce(v_settings.revision,0),
    'reminder_offsets_minutes',to_jsonb(private.notification_reminder_offsets_v1(p_tenant_id)),
    'whatsapp_entitled',v_whatsapp.entitled,
    'whatsapp_configured',v_whatsapp.configured,
    'whatsapp_enabled',v_whatsapp.enabled,
    'whatsapp_available',v_whatsapp.available,
    'items',(select jsonb_agg(jsonb_build_object(
        'template_key',c.template_key,
        'audience',c.audience,
        'email_enabled',private.notification_channel_enabled_v1(p_tenant_id,c.template_key,'email'),
        'whatsapp_enabled',private.notification_channel_enabled_v1(p_tenant_id,c.template_key,'whatsapp'),
        'whatsapp_capable',c.whatsapp_capable,
        'editable',c.editable) order by c.sort_order)
      from private.notification_type_catalog_v1() c));
end;
$$;

create or replace function private.save_notification_settings_v1(
  p_tenant_id uuid,
  p_settings jsonb,
  p_reminder_offsets integer[],
  p_expected_revision bigint,
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_hash text;
  v_replay jsonb;
  v_current app.notification_settings%rowtype;
  v_overrides jsonb;
  v_item jsonb;
  v_catalog record;
  v_entry jsonb;
  v_offsets integer[];
  v_next bigint;
  v_membership uuid;
  v_result jsonb;
begin
  perform 1 from app.tenants t where t.id = p_tenant_id and t.status = 'active' for update;
  if not found or not coalesce((select private.has_direct_capability(p_tenant_id,'policy.edit')),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if p_request_id is null or p_settings is null or pg_catalog.jsonb_typeof(p_settings) <> 'array'
     or pg_catalog.jsonb_array_length(p_settings) > 64 then
    raise exception using errcode='22023',message='notification_settings_invalid';
  end if;
  if p_reminder_offsets is null or cardinality(p_reminder_offsets) not between 1 and 4
     or pg_catalog.array_position(p_reminder_offsets,null) is not null
     or exists (select 1 from pg_catalog.unnest(p_reminder_offsets) o where o not between 15 and 10080)
     or (select count(distinct o) from pg_catalog.unnest(p_reminder_offsets) o) <> cardinality(p_reminder_offsets) then
    raise exception using errcode='22023',message='notification_settings_invalid';
  end if;
  select pg_catalog.array_agg(o order by o desc) into v_offsets
  from pg_catalog.unnest(p_reminder_offsets) o;

  -- Validate every row before anything is written: one bad row refuses the
  -- whole document rather than half-applying it.
  for v_item in select value from pg_catalog.jsonb_array_elements(p_settings) loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object'
       or not (v_item ? 'template_key')
       or exists (select 1 from pg_catalog.jsonb_object_keys(v_item) k
         where k not in ('template_key','email_enabled','whatsapp_enabled'))
       or (v_item ? 'email_enabled' and pg_catalog.jsonb_typeof(v_item->'email_enabled') <> 'boolean')
       or (v_item ? 'whatsapp_enabled' and pg_catalog.jsonb_typeof(v_item->'whatsapp_enabled') <> 'boolean') then
      raise exception using errcode='22023',message='notification_settings_invalid';
    end if;
    select * into v_catalog from private.notification_type_catalog_v1() c
    where c.template_key = v_item->>'template_key';
    if v_catalog.template_key is null
       -- A message that must always go cannot be switched off by email.
       or (not v_catalog.editable and (v_item->>'email_enabled')::boolean is false)
       or (not v_catalog.whatsapp_capable and (v_item->>'whatsapp_enabled')::boolean is true) then
      raise exception using errcode='22023',message='notification_settings_invalid';
    end if;
  end loop;

  v_hash := private.notification_request_hash_v1(jsonb_build_array(
    'settings',p_tenant_id,p_settings,to_jsonb(v_offsets),p_expected_revision));
  v_replay := private.notification_request_replay_v1(p_tenant_id,p_request_id,v_hash);
  if v_replay is not null then
    return v_replay;
  end if;

  select * into v_current from app.notification_settings s
  where s.tenant_id = p_tenant_id for update;
  if p_expected_revision is null
     or coalesce(v_current.revision,0) is distinct from p_expected_revision then
    raise exception using errcode='40001',message='revision_conflict';
  end if;

  v_overrides := coalesce(v_current.overrides,'{}'::jsonb);
  for v_item in select value from pg_catalog.jsonb_array_elements(p_settings) loop
    select * into v_catalog from private.notification_type_catalog_v1() c
    where c.template_key = v_item->>'template_key';
    v_entry := coalesce(v_overrides->(v_item->>'template_key'),'{}'::jsonb)
      || (v_item - 'template_key');
    -- A non-editable type stores no email override at all.
    if not v_catalog.editable then
      v_entry := v_entry - 'email_enabled';
    end if;
    if not v_catalog.whatsapp_capable then
      v_entry := v_entry - 'whatsapp_enabled';
    end if;
    v_overrides := pg_catalog.jsonb_set(v_overrides,array[v_item->>'template_key'],v_entry,true);
  end loop;

  v_membership := (select private.current_membership_id(p_tenant_id));
  v_next := coalesce(v_current.revision,0) + 1;
  insert into app.notification_settings as s(
    tenant_id,overrides,reminder_offsets_minutes,revision,updated_by_membership_id,updated_at)
  values (p_tenant_id,v_overrides,v_offsets,v_next,v_membership,v_now)
  on conflict (tenant_id) do update set
    overrides = excluded.overrides,
    reminder_offsets_minutes = excluded.reminder_offsets_minutes,
    revision = excluded.revision,
    updated_by_membership_id = excluded.updated_by_membership_id,
    updated_at = excluded.updated_at;

  v_result := jsonb_build_object('version',1,'revision',v_next,'replayed',false);
  insert into app.notification_settings_events(
    tenant_id,actor_auth_user_id,actor_membership_id,request_id,request_hash,action,target_id,result)
  values (p_tenant_id,(select private.current_auth_user_id()),v_membership,p_request_id,v_hash,
    'settings_saved',p_tenant_id,v_result);
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. A member's own preferences
-- ---------------------------------------------------------------------------

create or replace function private.get_my_notification_preferences_v1(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_membership uuid := (select private.current_membership_id(p_tenant_id));
  v_preferences app.staff_notification_preferences%rowtype;
begin
  if v_membership is null then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  select * into v_preferences from app.staff_notification_preferences p
  where p.tenant_id = p_tenant_id and p.membership_id = v_membership;
  return jsonb_build_object(
    'version',1,
    'tenant_id',p_tenant_id,
    'membership_id',v_membership,
    'revision',coalesce(v_preferences.revision,0),
    'digest_local_time',pg_catalog.to_char(coalesce(v_preferences.digest_local_time,'07:30'::time),'HH24:MI'),
    'digest_time_zone',private.membership_time_zone_v1(p_tenant_id,v_membership),
    'items',(select jsonb_agg(jsonb_build_object(
        'template_key',c.template_key,
        'enabled',private.staff_preference_enabled_v1(p_tenant_id,v_membership,c.template_key),
        -- Whether the tenant sends this type at all. A member may want a
        -- message the tenant has switched off; they still will not get it.
        'tenant_enabled',private.notification_channel_enabled_v1(p_tenant_id,c.template_key,'email'))
        order by c.sort_order)
      from private.notification_type_catalog_v1() c
      where c.staff_preference_default is not null));
end;
$$;

create or replace function private.save_my_notification_preferences_v1(
  p_tenant_id uuid,
  p_preferences jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_membership uuid := (select private.current_membership_id(p_tenant_id));
  v_hash text;
  v_replay jsonb;
  v_current app.staff_notification_preferences%rowtype;
  v_values jsonb;
  v_time time;
  v_next bigint;
  v_result jsonb;
begin
  if v_membership is null
     or not exists (select 1 from app.tenants t where t.id = p_tenant_id and t.status = 'active') then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if p_request_id is null or p_preferences is null
     or pg_catalog.jsonb_typeof(p_preferences) <> 'object'
     or exists (select 1 from pg_catalog.jsonb_each(p_preferences) e
       where not (
         (e.key = 'digest_local_time' and pg_catalog.jsonb_typeof(e.value) = 'string'
           and e.value #>> '{}' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
         or (pg_catalog.jsonb_typeof(e.value) = 'boolean' and exists (
           select 1 from private.notification_type_catalog_v1() c
           where c.template_key = e.key and c.staff_preference_default is not null))))
  then
    raise exception using errcode='22023',message='notification_preferences_invalid';
  end if;

  v_hash := private.notification_request_hash_v1(jsonb_build_array(
    'preferences',p_tenant_id,v_membership,p_preferences));
  v_replay := private.notification_request_replay_v1(p_tenant_id,p_request_id,v_hash);
  if v_replay is not null then
    return v_replay;
  end if;

  select * into v_current from app.staff_notification_preferences p
  where p.tenant_id = p_tenant_id and p.membership_id = v_membership for update;
  v_values := coalesce(v_current.preferences,'{}'::jsonb) || (p_preferences - 'digest_local_time');
  v_time := coalesce((p_preferences->>'digest_local_time')::time,
    v_current.digest_local_time,'07:30'::time);
  v_next := coalesce(v_current.revision,0) + 1;
  insert into app.staff_notification_preferences as p(
    tenant_id,membership_id,preferences,digest_local_time,revision,updated_at)
  values (p_tenant_id,v_membership,v_values,v_time,v_next,v_now)
  on conflict (tenant_id,membership_id) do update set
    preferences = excluded.preferences,
    digest_local_time = excluded.digest_local_time,
    revision = excluded.revision,
    updated_at = excluded.updated_at;

  v_result := jsonb_build_object('version',1,'revision',v_next,'replayed',false);
  insert into app.notification_settings_events(
    tenant_id,actor_auth_user_id,actor_membership_id,request_id,request_hash,action,target_id,result)
  values (p_tenant_id,(select private.current_auth_user_id()),v_membership,p_request_id,v_hash,
    'preferences_saved',v_membership,v_result);
  return v_result;
end;
$$;

-- The team view for whoever manages staff. Names and choices only.
create or replace function private.list_staff_notification_preferences_v1(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce((select private.has_direct_capability(p_tenant_id,'staff.manage')),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  return jsonb_build_object('version',1,'tenant_id',p_tenant_id,
    'members',coalesce((select jsonb_agg(jsonb_build_object(
        'membership_id',m.id,
        'name',coalesce(sp.public_name,u.email),
        'digest_local_time',pg_catalog.to_char(coalesce(p.digest_local_time,'07:30'::time),'HH24:MI'),
        'items',(select jsonb_agg(jsonb_build_object(
            'template_key',c.template_key,
            'enabled',private.staff_preference_enabled_v1(p_tenant_id,m.id,c.template_key))
            order by c.sort_order)
          from private.notification_type_catalog_v1() c
          where c.staff_preference_default is not null))
        order by m.joined_at,m.id)
      from app.memberships m
      join auth.users u on u.id = m.auth_user_id
      left join app.staff_profiles sp on sp.tenant_id = m.tenant_id and sp.membership_id = m.id
      left join app.staff_notification_preferences p on p.tenant_id = m.tenant_id and p.membership_id = m.id
      where m.tenant_id = p_tenant_id and m.status = 'active'),'[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. "Send a test to me"
-- ---------------------------------------------------------------------------

-- One message, to the caller's OWN verified address, and only that: there is
-- no recipient parameter to abuse. Rate limited per member, audited, marked as
-- a test so the worker renders it from fixed sample data.
create or replace function private.enqueue_test_notification_v1(
  p_tenant_id uuid,
  p_template_key text,
  p_locale text,
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_membership uuid;
  v_hash text;
  v_replay jsonb;
  v_version integer;
  v_message uuid;
  v_result jsonb;
  v_rate_limit constant integer := 10;
begin
  perform 1 from app.tenants t where t.id = p_tenant_id and t.status = 'active' for update;
  if not found or not coalesce((select private.has_direct_capability(p_tenant_id,'policy.edit')),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if p_request_id is null or p_locale is null or p_locale not in ('en','ar')
     or not exists (select 1 from private.notification_type_catalog_v1() c
       where c.template_key = p_template_key) then
    raise exception using errcode='22023',message='notification_test_invalid';
  end if;
  v_membership := (select private.current_membership_id(p_tenant_id));

  v_hash := private.notification_request_hash_v1(jsonb_build_array(
    'test',p_tenant_id,v_membership,p_template_key,p_locale));
  v_replay := private.notification_request_replay_v1(p_tenant_id,p_request_id,v_hash);
  if v_replay is not null then
    return v_replay;
  end if;

  -- The address the worker will use is the member's own, read at send time.
  -- It must be one Auth has verified, or "send to me" becomes "send anywhere".
  if not exists (select 1 from app.memberships m join auth.users u on u.id = m.auth_user_id
    where m.tenant_id = p_tenant_id and m.id = v_membership
      and u.email is not null and u.email_confirmed_at is not null) then
    raise exception using errcode='42501',message='notification_test_recipient_unverified';
  end if;
  if (select count(*) from app.notification_messages m
      where m.tenant_id = p_tenant_id and m.recipient_membership_id = v_membership
        and m.is_test and m.created_at > v_now - interval '1 hour') >= v_rate_limit then
    raise exception using errcode='42501',message='notification_test_rate_limited';
  end if;

  select t.version into v_version from app.notification_templates t
  where t.key = p_template_key and t.locale = p_locale and t.retired_at is null;
  insert into app.notification_messages(
    tenant_id,booking_id,outbox_event_id,template_key,template_locale,template_version,
    booking_revision,recipient_hash,recipient_kind,recipient_membership_id,correlation_id,
    is_test,dedupe_key,payload)
  values (p_tenant_id,null,null,p_template_key,p_locale,coalesce(v_version,1),0,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      p_tenant_id::text||':membership:'||v_membership::text,'UTF8')),'hex'),
    'staff',v_membership,pg_catalog.gen_random_uuid(),
    true,'test:'||p_request_id::text,'{}'::jsonb)
  returning id into v_message;

  v_result := jsonb_build_object('version',1,'message_id',v_message,'status','queued',
    'replayed',false);
  insert into app.notification_settings_events(
    tenant_id,actor_auth_user_id,actor_membership_id,request_id,request_hash,action,target_id,result)
  values (p_tenant_id,(select private.current_auth_user_id()),v_membership,p_request_id,v_hash,
    'test_enqueued',v_message,v_result);
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. The brand a message wears
-- ---------------------------------------------------------------------------

-- Everything a template needs to look like the tenant: names in both
-- languages, the published logo and colours, and the verified origins links
-- point at. Read by the platform worker, the preview and the digest; a member
-- of the tenant may read it too, because it is their own published brand.
create or replace function private.get_notification_brand_v2(p_tenant_id uuid)
returns table (
  name_en text,
  name_ar text,
  logo_url text,
  icon_url text,
  primary_color text,
  on_primary_color text,
  client_origin text,
  dashboard_origin text,
  default_locale text,
  support_email text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_worker boolean := (select auth.role()) = 'service_role'
    and (select private.current_auth_user_id()) is null;
begin
  if not v_worker and not coalesce((select private.is_active_tenant_member(p_tenant_id)),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  return query
  with tenant as (
    select t.id, t.name from app.tenants t where t.id = p_tenant_id
  ), brand as (
    select r.config, r.content from app.instances i
    join app.brand_revisions r on r.tenant_id = i.tenant_id and r.id = i.published_brand_revision_id
    where i.tenant_id = p_tenant_id
    order by r.published_at desc nulls last limit 1
  ), origins as (
    select
      (select 'https://'||d.hostname from app.tenant_domains d
       where d.tenant_id = p_tenant_id and d.application = 'client' and d.kind = 'production'
         and d.active and d.verification_status = 'verified' order by d.hostname limit 1) as client,
      (select 'https://'||d.hostname from app.tenant_domains d
       where d.tenant_id = p_tenant_id and d.application = 'dashboard' and d.kind = 'production'
         and d.active and d.verification_status = 'verified' order by d.hostname limit 1) as dashboard
  ), names as (
    select
      coalesce(nullif(pg_catalog.btrim(b.content->>'brandName'),''),
        nullif(pg_catalog.btrim(b.content->'title'->>'en'),''),
        nullif(pg_catalog.btrim(b.config->>'name'),''), t.name) as name_en,
      coalesce(nullif(pg_catalog.btrim(b.content->'title'->>'ar'),''),
        nullif(pg_catalog.btrim(b.content->>'brandName'),''),
        nullif(pg_catalog.btrim(b.config->>'name'),''), t.name) as name_ar,
      b.config->'assets'->>'logoLight' as logo,
      b.config->'assets'->>'icon' as icon,
      b.config->'tokens'->'color'->>'primary' as primary_color,
      b.config->'tokens'->'color'->>'onPrimary' as on_primary,
      b.content->'contact'->>'email' as support
    from tenant t left join brand b on true
  )
  select n.name_en, n.name_ar,
    -- A published asset path is resolved against the verified client origin;
    -- an absolute https URL is kept; anything else is no logo at all.
    case when n.logo ~ '^https://' then n.logo
      when n.logo ~ '^/[A-Za-z0-9._/-]+$' and o.client is not null then o.client||n.logo end,
    case when n.icon ~ '^https://' then n.icon
      when n.icon ~ '^/[A-Za-z0-9._/-]+$' and o.client is not null then o.client||n.icon end,
    case when n.primary_color ~ '^#[0-9A-Fa-f]{6}$' then n.primary_color end,
    case when n.on_primary ~ '^#[0-9A-Fa-f]{6}$' then n.on_primary end,
    o.client, o.dashboard,
    coalesce((select s.default_locale from app.tenant_settings s where s.tenant_id = p_tenant_id),'en'),
    case when n.support ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then n.support end
  from names n cross join origins o;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. WhatsApp configuration
-- ---------------------------------------------------------------------------

create or replace function private.get_whatsapp_config_v1(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_config app.whatsapp_configs%rowtype;
  v_state record;
begin
  if not coalesce((select private.has_direct_capability(p_tenant_id,'integration.manage')),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  select * into v_config from app.whatsapp_configs w where w.tenant_id = p_tenant_id;
  select * into v_state from private.whatsapp_state_v1(p_tenant_id);
  -- The secret reference is reported as present or absent. Its value never
  -- leaves the database through a tenant-facing function.
  return jsonb_build_object(
    'version',1,
    'tenant_id',p_tenant_id,
    'revision',coalesce(v_config.revision,0),
    'entitled',v_state.entitled,
    'configured',v_state.configured,
    'enabled',v_state.enabled,
    'available',v_state.available,
    'phone_number_id',v_config.phone_number_id,
    'business_account_id',v_config.business_account_id,
    'access_token_configured',v_config.access_token_secret_ref is not null,
    'template_map',coalesce(v_config.template_map,'{}'::jsonb));
end;
$$;

create or replace function private.save_whatsapp_config_v1(
  p_tenant_id uuid,
  p_config jsonb,
  p_expected_revision bigint,
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_hash text;
  v_replay jsonb;
  v_current app.whatsapp_configs%rowtype;
  v_enabled boolean;
  v_phone text;
  v_account text;
  v_ref text;
  v_map jsonb;
  v_next bigint;
  v_membership uuid;
  v_result jsonb;
begin
  perform 1 from app.tenants t where t.id = p_tenant_id and t.status = 'active' for update;
  if not found or not coalesce((select private.has_direct_capability(p_tenant_id,'integration.manage')),false)
     or not coalesce((select private.dashboard_recent_aal2()),false) then
    raise exception using errcode='42501',message='integration_step_up_required';
  end if;
  if p_request_id is null or p_config is null or pg_catalog.jsonb_typeof(p_config) <> 'object'
     or exists (select 1 from pg_catalog.jsonb_object_keys(p_config) k where k not in
       ('enabled','phone_number_id','business_account_id','access_token_secret_ref','template_map'))
     or pg_catalog.jsonb_typeof(p_config->'enabled') is distinct from 'boolean'
     or (p_config ? 'phone_number_id' and pg_catalog.jsonb_typeof(p_config->'phone_number_id') not in ('string','null'))
     or (p_config ? 'business_account_id' and pg_catalog.jsonb_typeof(p_config->'business_account_id') not in ('string','null'))
     or (p_config ? 'access_token_secret_ref' and pg_catalog.jsonb_typeof(p_config->'access_token_secret_ref') not in ('string','null'))
     or (p_config ? 'template_map' and pg_catalog.jsonb_typeof(p_config->'template_map') <> 'object') then
    raise exception using errcode='22023',message='whatsapp_config_invalid';
  end if;
  v_enabled := (p_config->>'enabled')::boolean;
  v_phone := nullif(pg_catalog.btrim(p_config->>'phone_number_id'),'');
  v_account := nullif(pg_catalog.btrim(p_config->>'business_account_id'),'');
  v_map := coalesce(p_config->'template_map','{}'::jsonb);
  if (v_phone is not null and v_phone !~ '^[0-9]{5,32}$')
     or (v_account is not null and v_account !~ '^[0-9]{5,32}$')
     or (p_config->>'access_token_secret_ref' is not null and p_config->>'access_token_secret_ref'
       !~ '^(vault:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|env:[A-Z][A-Za-z0-9_]{2,127})$')
     -- Only Meta-approved templates are sent, so the map names a template per
     -- WhatsApp-capable type, never free text.
     or exists (select 1 from pg_catalog.jsonb_each(v_map) e
       where not exists (select 1 from private.notification_type_catalog_v1() c
           where c.template_key = e.key and c.whatsapp_capable)
         or pg_catalog.jsonb_typeof(e.value) <> 'object'
         or exists (select 1 from pg_catalog.jsonb_object_keys(e.value) k where k not in ('name','language'))
         or coalesce(e.value->>'name','') !~ '^[a-z0-9_]+$'
         or char_length(e.value->>'name') > 512
         or coalesce(e.value->>'language','') !~ '^[a-z]{2,3}(_[A-Z]{2})?$') then
    raise exception using errcode='22023',message='whatsapp_config_invalid';
  end if;

  -- The plan decides, not the tenant: switching the channel on without the
  -- entitlement is refused at the backend, not merely hidden in a form.
  if v_enabled and not coalesce(
      (private.get_runtime_entitlements_v1(p_tenant_id)->>'whatsapp_notifications')::boolean,false) then
    raise exception using errcode='42501',message='not_entitled';
  end if;

  -- The hash names whether a reference was sent, never the reference itself.
  v_hash := private.notification_request_hash_v1(jsonb_build_array(
    'whatsapp',p_tenant_id,p_config - 'access_token_secret_ref',
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      coalesce(p_config->>'access_token_secret_ref',''),'UTF8')),'hex'),
    p_expected_revision));
  v_replay := private.notification_request_replay_v1(p_tenant_id,p_request_id,v_hash);
  if v_replay is not null then
    return v_replay;
  end if;

  select * into v_current from app.whatsapp_configs w where w.tenant_id = p_tenant_id for update;
  if p_expected_revision is null
     or coalesce(v_current.revision,0) is distinct from p_expected_revision then
    raise exception using errcode='40001',message='revision_conflict';
  end if;
  -- An omitted reference keeps the stored one, so the form never has to hold
  -- or echo it. An explicit null removes it.
  v_ref := case when p_config ? 'access_token_secret_ref' then p_config->>'access_token_secret_ref'
    else v_current.access_token_secret_ref end;
  if v_enabled and (v_phone is null or v_account is null or v_ref is null) then
    raise exception using errcode='22023',message='whatsapp_config_invalid';
  end if;

  v_membership := (select private.current_membership_id(p_tenant_id));
  v_next := coalesce(v_current.revision,0) + 1;
  insert into app.whatsapp_configs as w(
    tenant_id,enabled,phone_number_id,business_account_id,access_token_secret_ref,template_map,
    revision,updated_by_membership_id,updated_at)
  values (p_tenant_id,v_enabled,v_phone,v_account,v_ref,v_map,v_next,v_membership,v_now)
  on conflict (tenant_id) do update set
    enabled = excluded.enabled,
    phone_number_id = excluded.phone_number_id,
    business_account_id = excluded.business_account_id,
    access_token_secret_ref = excluded.access_token_secret_ref,
    template_map = excluded.template_map,
    revision = excluded.revision,
    updated_by_membership_id = excluded.updated_by_membership_id,
    updated_at = excluded.updated_at;

  v_result := jsonb_build_object('version',1,'revision',v_next,'replayed',false);
  insert into app.notification_settings_events(
    tenant_id,actor_auth_user_id,actor_membership_id,request_id,request_hash,action,target_id,result)
  values (p_tenant_id,(select private.current_auth_user_id()),v_membership,p_request_id,v_hash,
    'whatsapp_config_saved',p_tenant_id,v_result);
  return v_result;
end;
$$;

-- What the public booking form needs to decide whether to offer the opt-in at
-- all. A visitor learns one boolean, never ids, template names or the plan.
create or replace function private.get_public_whatsapp_availability_v1(
  p_hostname text, p_application text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
begin
  v_tenant_id := (select r.tenant_id from api_v1.resolve_public_tenant_v1(p_hostname,p_application) r);
  if v_tenant_id is null then
    raise exception using errcode='42501',message='booking_context_required';
  end if;
  return jsonb_build_object('version',1,
    'whatsapp_available',(select s.available from private.whatsapp_state_v1(v_tenant_id) s));
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. api_v1 surface: invoker wrappers, no logic
-- ---------------------------------------------------------------------------

create or replace function api_v1.get_notification_settings_v1(p_tenant_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.get_notification_settings_v1(p_tenant_id); $$;

create or replace function api_v1.save_notification_settings_v1(
  p_tenant_id uuid, p_settings jsonb, p_reminder_offsets integer[],
  p_expected_revision bigint, p_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = '' set statement_timeout = '5s'
as $$ select private.save_notification_settings_v1(p_tenant_id,p_settings,p_reminder_offsets,
  p_expected_revision,p_request_id); $$;

create or replace function api_v1.get_my_notification_preferences_v1(p_tenant_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.get_my_notification_preferences_v1(p_tenant_id); $$;

create or replace function api_v1.save_my_notification_preferences_v1(
  p_tenant_id uuid, p_preferences jsonb, p_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = '' set statement_timeout = '5s'
as $$ select private.save_my_notification_preferences_v1(p_tenant_id,p_preferences,p_request_id); $$;

create or replace function api_v1.list_staff_notification_preferences_v1(p_tenant_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.list_staff_notification_preferences_v1(p_tenant_id); $$;

create or replace function api_v1.enqueue_test_notification_v1(
  p_tenant_id uuid, p_template_key text, p_locale text, p_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = '' set statement_timeout = '5s'
as $$ select private.enqueue_test_notification_v1(p_tenant_id,p_template_key,p_locale,p_request_id); $$;

create or replace function api_v1.get_notification_brand_v2(p_tenant_id uuid)
returns table (
  name_en text, name_ar text, logo_url text, icon_url text, primary_color text,
  on_primary_color text, client_origin text, dashboard_origin text, default_locale text,
  support_email text)
language sql stable security invoker set search_path = '' set statement_timeout = '5s'
as $$ select * from private.get_notification_brand_v2(p_tenant_id); $$;

create or replace function api_v1.get_whatsapp_config_v1(p_tenant_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.get_whatsapp_config_v1(p_tenant_id); $$;

create or replace function api_v1.save_whatsapp_config_v1(
  p_tenant_id uuid, p_config jsonb, p_expected_revision bigint, p_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = '' set statement_timeout = '5s'
as $$ select private.save_whatsapp_config_v1(p_tenant_id,p_config,p_expected_revision,p_request_id); $$;

create or replace function api_v1.get_public_whatsapp_availability_v1(
  p_hostname text, p_application text)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.get_public_whatsapp_availability_v1(p_hostname,p_application); $$;

-- ---------------------------------------------------------------------------
-- 12. Grants
-- ---------------------------------------------------------------------------

-- Helpers are reached only through the definer functions that call them.
revoke all on function
  private.notification_type_catalog_v1(),
  private.notification_channel_enabled_v1(uuid,text,text),
  private.notification_reminder_offsets_v1(uuid),
  private.staff_preference_enabled_v1(uuid,uuid,text),
  private.whatsapp_state_v1(uuid),
  private.membership_time_zone_v1(uuid,uuid),
  private.notification_request_replay_v1(uuid,uuid,text),
  private.notification_request_hash_v1(jsonb)
from public, anon, authenticated;

revoke all on function
  private.get_notification_settings_v1(uuid),
  private.save_notification_settings_v1(uuid,jsonb,integer[],bigint,uuid),
  private.get_my_notification_preferences_v1(uuid),
  private.save_my_notification_preferences_v1(uuid,jsonb,uuid),
  private.list_staff_notification_preferences_v1(uuid),
  private.enqueue_test_notification_v1(uuid,text,text,uuid),
  private.get_notification_brand_v2(uuid),
  private.get_whatsapp_config_v1(uuid),
  private.save_whatsapp_config_v1(uuid,jsonb,bigint,uuid),
  private.get_public_whatsapp_availability_v1(text,text),
  api_v1.get_notification_settings_v1(uuid),
  api_v1.save_notification_settings_v1(uuid,jsonb,integer[],bigint,uuid),
  api_v1.get_my_notification_preferences_v1(uuid),
  api_v1.save_my_notification_preferences_v1(uuid,jsonb,uuid),
  api_v1.list_staff_notification_preferences_v1(uuid),
  api_v1.enqueue_test_notification_v1(uuid,text,text,uuid),
  api_v1.get_notification_brand_v2(uuid),
  api_v1.get_whatsapp_config_v1(uuid),
  api_v1.save_whatsapp_config_v1(uuid,jsonb,bigint,uuid),
  api_v1.get_public_whatsapp_availability_v1(text,text)
from public, anon, authenticated, service_role;

grant execute on function
  private.get_notification_settings_v1(uuid),
  private.save_notification_settings_v1(uuid,jsonb,integer[],bigint,uuid),
  private.get_my_notification_preferences_v1(uuid),
  private.save_my_notification_preferences_v1(uuid,jsonb,uuid),
  private.list_staff_notification_preferences_v1(uuid),
  private.enqueue_test_notification_v1(uuid,text,text,uuid),
  private.get_notification_brand_v2(uuid),
  private.get_whatsapp_config_v1(uuid),
  private.save_whatsapp_config_v1(uuid,jsonb,bigint,uuid),
  api_v1.get_notification_settings_v1(uuid),
  api_v1.save_notification_settings_v1(uuid,jsonb,integer[],bigint,uuid),
  api_v1.get_my_notification_preferences_v1(uuid),
  api_v1.save_my_notification_preferences_v1(uuid,jsonb,uuid),
  api_v1.list_staff_notification_preferences_v1(uuid),
  api_v1.enqueue_test_notification_v1(uuid,text,text,uuid),
  api_v1.get_notification_brand_v2(uuid),
  api_v1.get_whatsapp_config_v1(uuid),
  api_v1.save_whatsapp_config_v1(uuid,jsonb,bigint,uuid)
to authenticated;

-- The worker, the preview and the digest read the brand with the platform key.
grant execute on function
  private.get_notification_brand_v2(uuid),
  api_v1.get_notification_brand_v2(uuid)
to service_role;

-- The booking form asks before showing an opt-in.
grant execute on function
  private.get_public_whatsapp_availability_v1(text,text),
  api_v1.get_public_whatsapp_availability_v1(text,text)
to anon, authenticated;
