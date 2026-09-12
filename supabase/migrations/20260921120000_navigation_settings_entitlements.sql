-- Issue #26: navigation, settings, and entitled features.
--
-- The load-bearing rule of this whole issue is one line that already exists.
-- `isFeatureEnabled` in `packages/config` reads:
--
--     runtimeEntitlements[key] === true && localConfiguration[key]?.enabled === true
--
-- Local configuration can only ever narrow. It cannot turn anything on. What is
-- missing is the other half: something authoritative for
-- `runtimeEntitlements`, living where a tenant cannot edit it. That is what
-- `app.tenant_entitlements` is, and it is the only reason this migration exists.
--
-- The distinction that matters:
--
--   entitlement  what the plan grants. Written by the control plane, readable
--                by the tenant, editable by nobody inside the tenant.
--   setting      how the tenant has chosen to use what it was granted. Theirs
--                to change, bounded, audited.
--
-- A tenant editing a config file in its own instance repository is editing a
-- setting. If the entitlement is absent the feature stays off, and it stays off
-- at the backend rather than only in the interface — which is the difference
-- between a hidden button and an unavailable capability.
--
-- What this deliberately does NOT add:
--
--   * no second feature-flag evaluator. `isFeatureEnabled` is the evaluator and
--     is already unit tested; this supplies its right-hand input.
--   * no navigation renderer. Navigation is stored, validated and published;
--     drawing it is the applications' job and already exists.
--   * no extension slot registry. Typed extension slots are a distribution and
--     customization-tier concern (issues #29 and #34) and would be a contract
--     nothing can honour until the instance repository exists. Adding an empty
--     registry now would be a table with no writer and no reader.
--   * no per-setting table. Settings are one validated jsonb document with a
--     revision, because a column per setting is a migration per setting.
--
-- Error vocabulary. Published strings reused; this migration adds two:
--   not_entitled          42501  the plan does not grant this
--   settings_invalid      22023  the document failed its bounds

-- ---------------------------------------------------------------------------
-- 1. Entitlements: backend truth, tenant-readable, tenant-unwritable
-- ---------------------------------------------------------------------------

create table app.tenant_entitlements (
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  feature_key text not null
    check (feature_key = lower(feature_key) and feature_key ~ '^[a-z][a-z0-9_.]{1,60}$'),
  granted boolean not null default true,
  -- Which plan this came from, so an operator can explain it rather than
  -- guessing why a tenant has something.
  source text not null default 'plan' check (source in ('plan','trial','override')),
  expires_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id,feature_key)
);
create index tenant_entitlements_tenant_idx on app.tenant_entitlements (tenant_id)
  where granted;

-- Readable by any active member: a tenant should be able to see what its plan
-- includes. Writable by nobody in the tenant, including the owner — that is the
-- entire point, and it is enforced here rather than by hoping no UI offers it.
alter table app.tenant_entitlements enable row level security;
create policy tenant_entitlements_select_member on app.tenant_entitlements
for select to authenticated
using ((select private.is_active_tenant_member(tenant_id)));
create policy tenant_entitlements_insert_denied on app.tenant_entitlements
  for insert to anon,authenticated with check (false);
create policy tenant_entitlements_update_denied on app.tenant_entitlements
  for update to anon,authenticated using (false) with check (false);
create policy tenant_entitlements_delete_denied on app.tenant_entitlements
  for delete to anon,authenticated using (false);
revoke all on app.tenant_entitlements from public,anon,authenticated;
grant select on app.tenant_entitlements to authenticated;

-- The authoritative answer, in the shape `isFeatureEnabled` expects for its
-- `runtimeEntitlements` argument. An expired grant is not a grant.
create or replace function private.get_runtime_entitlements_v1(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    pg_catalog.jsonb_object_agg(e.feature_key, true),
    '{}'::jsonb)
  from app.tenant_entitlements e
  where e.tenant_id = p_tenant_id
    and e.granted
    and (e.expires_at is null or e.expires_at > pg_catalog.statement_timestamp());
$$;

-- ---------------------------------------------------------------------------
-- 2. Settings: the tenant's own choices, bounded and audited
-- ---------------------------------------------------------------------------

alter table app.tenant_settings add column settings jsonb not null default '{}'::jsonb
  check (jsonb_typeof(settings) = 'object');
-- Navigation is stored beside settings rather than in its own table: it is one
-- more thing the tenant configures, and a table per config document is a
-- migration per config document.
alter table app.tenant_settings add column navigation jsonb not null default '{}'::jsonb
  check (jsonb_typeof(navigation) = 'object');
-- Local feature choices. These can only narrow what the entitlements grant, and
-- `isFeatureEnabled` is where that is evaluated.
alter table app.tenant_settings add column feature_configuration jsonb not null default '{}'::jsonb
  check (jsonb_typeof(feature_configuration) = 'object');
alter table app.tenant_settings add column updated_by_membership_id uuid;
alter table app.tenant_settings
  add constraint tenant_settings_updated_by_fk
  foreign key (tenant_id,updated_by_membership_id)
  references app.memberships(tenant_id,id) on delete restrict;

-- The same refusal the brand documents get, for the same reason: a settings
-- document ends up in an instance repository and in rendered navigation.
alter table app.tenant_settings
  add constraint tenant_settings_safe
  check (private.brand_document_is_safe_v1(settings)
    and private.brand_document_is_safe_v1(navigation)
    and private.brand_document_is_safe_v1(feature_configuration));

-- Every settings change, who made it, and what moved. Append-only: a settings
-- history that can be edited is not a history.
create table app.tenant_settings_events (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  revision bigint not null check (revision > 0),
  -- Which documents changed. Never their values: a settings document can carry
  -- a reply-to address, and this table is read by operators.
  changed text[] not null,
  actor_membership_id uuid,
  created_at timestamptz not null default statement_timestamp(),
  primary key (id),
  unique (tenant_id,revision),
  foreign key (tenant_id,actor_membership_id)
    references app.memberships(tenant_id,id) on delete restrict
);
create trigger tenant_settings_events_append_only
  before update or delete on app.tenant_settings_events
  for each row execute function private.enforce_append_only();

alter table app.tenant_settings_events enable row level security;
create policy tenant_settings_events_select_audit on app.tenant_settings_events
for select to authenticated
using ((select private.is_active_tenant_member(tenant_id))
  and (select private.has_direct_capability(tenant_id,'audit.read')));
create policy tenant_settings_events_insert_denied on app.tenant_settings_events
  for insert to anon,authenticated with check (false);
create policy tenant_settings_events_update_denied on app.tenant_settings_events
  for update to anon,authenticated using (false) with check (false);
create policy tenant_settings_events_delete_denied on app.tenant_settings_events
  for delete to anon,authenticated using (false);
revoke all on app.tenant_settings_events from public,anon,authenticated;
grant select on app.tenant_settings_events to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Validation the database owns
-- ---------------------------------------------------------------------------

-- Routes a tenant may put in its navigation. An allow-list rather than a
-- pattern: a pattern eventually admits something nobody meant to expose, and a
-- link to a route that does not exist is a dead end a customer finds.
create or replace function private.navigation_is_valid_v1(p_navigation jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  with items as (
    select pg_catalog.jsonb_array_elements(
      coalesce(p_navigation->'items','[]'::jsonb)) as item
  )
  -- `coalesce` per item, not around the aggregate: `bool_and` skips NULLs, so
  -- an item whose checks evaluated to NULL — a missing `href`, for instance —
  -- would otherwise be accepted by being ignored.
  select coalesce(bool_and(coalesce(
    -- Every item names a label in both languages, so navigation cannot ship
    -- half-translated.
    (item->'label') ? 'en' and (item->'label') ? 'ar'
    and pg_catalog.btrim(coalesce(item->'label'->>'en','')) <> ''
    and pg_catalog.btrim(coalesce(item->'label'->>'ar','')) <> ''
    and (
      -- An internal route from the approved set...
      coalesce((item->>'route') in ('/', '/book', '/manage', '/services', '/locations',
                           '/contact', '/privacy', '/terms', '/accessibility'), false)
      -- ...or an external link that is unambiguously external and https.
      or coalesce(item->>'href' ~ '^https://[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(/|$)', false)
    ), false)), true)
  from items;
$$;

-- Settings bounds. Currency and locale are the two a mistake in is immediately
-- visible to every customer, and tax is the one a mistake in is expensive.
create or replace function private.settings_are_valid_v1(p_settings jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    (not (p_settings ? 'currency')
      or p_settings->>'currency' ~ '^[A-Z]{3}$')
    and (not (p_settings ? 'defaultLocale')
      or p_settings->>'defaultLocale' in ('en','ar'))
    and (not (p_settings ? 'taxRateBps')
      or ((p_settings->>'taxRateBps')::integer between 0 and 3000))
    and (not (p_settings ? 'replyToEmail')
      or p_settings->>'replyToEmail' ~ '^[^@[:space:]]+@[^@[:space:]]+$')
    and (not (p_settings ? 'bookingHorizonDays')
      or ((p_settings->>'bookingHorizonDays')::integer between 1 and 730));
$$;

-- ---------------------------------------------------------------------------
-- 4. Saving settings
-- ---------------------------------------------------------------------------

create or replace function private.save_tenant_settings_v1(
  p_tenant_id uuid,
  p_settings jsonb,
  p_navigation jsonb,
  p_feature_configuration jsonb,
  p_expected_revision bigint
)
returns table (
  contract_version integer,
  revision bigint,
  -- Feature keys the caller asked to enable that the plan does not grant. The
  -- save succeeds and those stay off, because refusing the whole document would
  -- make one stale checkbox block every other change.
  ignored_features text[]
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_current app.tenant_settings%rowtype;
  v_membership uuid;
  v_entitlements jsonb;
  v_ignored text[];
  v_changed text[] := array[]::text[];
  v_next bigint;
begin
  if not coalesce((select private.can_decide_booking(p_tenant_id,null,'policy.edit')),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if p_settings is null or pg_catalog.jsonb_typeof(p_settings) <> 'object'
     or p_navigation is null or pg_catalog.jsonb_typeof(p_navigation) <> 'object'
     or p_feature_configuration is null
     or pg_catalog.jsonb_typeof(p_feature_configuration) <> 'object' then
    raise exception using errcode='22023',message='settings_invalid';
  end if;
  if not private.brand_document_is_safe_v1(p_settings)
     or not private.brand_document_is_safe_v1(p_navigation)
     or not private.brand_document_is_safe_v1(p_feature_configuration) then
    raise exception using errcode='22023',message='brand_unsafe_content';
  end if;
  if not private.settings_are_valid_v1(p_settings) then
    raise exception using errcode='22023',message='settings_invalid';
  end if;
  if not private.navigation_is_valid_v1(p_navigation) then
    raise exception using errcode='22023',message='settings_invalid';
  end if;
  v_membership := (select private.current_membership_id(p_tenant_id));

  select * into v_current from app.tenant_settings s
  where s.tenant_id = p_tenant_id for update;
  if v_current.tenant_id is null then
    insert into app.tenant_settings(tenant_id) values (p_tenant_id)
    returning * into v_current;
  end if;
  if p_expected_revision is not null
     and v_current.revision is distinct from p_expected_revision then
    raise exception using errcode='23505',message='revision_conflict';
  end if;

  -- The whole point of the issue, in one statement: a feature the plan does not
  -- grant is stripped on the way in. It is not merely hidden in an interface,
  -- and it is not merely false at read time — it never gets stored as enabled.
  v_entitlements := (select private.get_runtime_entitlements_v1(p_tenant_id));
  select coalesce(pg_catalog.array_agg(k),array[]::text[]) into v_ignored
  from pg_catalog.jsonb_object_keys(p_feature_configuration) k
  where (p_feature_configuration->k->>'enabled')::boolean is true
    and coalesce((v_entitlements->>k)::boolean,false) is not true;

  if pg_catalog.array_length(v_ignored,1) is not null then
    select pg_catalog.jsonb_object_agg(k,
      case when k = any (v_ignored)
        then pg_catalog.jsonb_set(p_feature_configuration->k,'{enabled}','false'::jsonb)
        else p_feature_configuration->k end)
    into p_feature_configuration
    from pg_catalog.jsonb_object_keys(p_feature_configuration) k;
  end if;

  if v_current.settings is distinct from p_settings then
    v_changed := v_changed || 'settings'::text;
  end if;
  if v_current.navigation is distinct from p_navigation then
    v_changed := v_changed || 'navigation'::text;
  end if;
  if v_current.feature_configuration is distinct from p_feature_configuration then
    v_changed := v_changed || 'features'::text;
  end if;

  v_next := v_current.revision + 1;
  update app.tenant_settings s set
    settings = p_settings,
    navigation = p_navigation,
    feature_configuration = coalesce(p_feature_configuration,'{}'::jsonb),
    default_locale = coalesce(p_settings->>'defaultLocale', s.default_locale),
    config_version = s.config_version + 1,
    feature_version = case when 'features' = any (v_changed)
      then s.feature_version + 1 else s.feature_version end,
    revision = v_next,
    updated_by_membership_id = v_membership,
    updated_at = v_now
  where s.tenant_id = p_tenant_id;

  insert into app.tenant_settings_events(
    tenant_id,revision,changed,actor_membership_id)
  values (p_tenant_id,v_next,v_changed,v_membership);

  return query select 1, v_next, v_ignored;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Reads
-- ---------------------------------------------------------------------------

-- What an application needs at startup: the tenant's own choices, the plan's
-- grants, and the versions that say whether this build understands them.
create or replace function private.get_tenant_configuration_v1(p_tenant_id uuid)
returns table (
  contract_version integer,
  settings jsonb,
  navigation jsonb,
  feature_configuration jsonb,
  entitlements jsonb,
  default_locale text,
  config_version bigint,
  feature_version bigint,
  revision bigint,
  -- Changes with the configuration version, so one tenant's settings change
  -- never invalidates another's cached pages.
  cache_tag text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not coalesce((select private.is_active_tenant_member(p_tenant_id)),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;

  -- A tenant that has never saved settings still has entitlements and a
  -- default locale, so the row is synthesised rather than absent. An
  -- application starting up against an unconfigured tenant should get defaults,
  -- not nothing.
  return query
  select 1,
    coalesce(s.settings,'{}'::jsonb),
    coalesce(s.navigation,'{}'::jsonb),
    coalesce(s.feature_configuration,'{}'::jsonb),
    (select private.get_runtime_entitlements_v1(p_tenant_id)),
    coalesce(s.default_locale,'en'),
    coalesce(s.config_version,1::bigint),
    coalesce(s.feature_version,1::bigint),
    coalesce(s.revision,1::bigint),
    pg_catalog.concat('config:',p_tenant_id::text,':',coalesce(s.config_version,1::bigint)::text)
  from (select p_tenant_id as tenant_id) one
  left join app.tenant_settings s on s.tenant_id = one.tenant_id;
end;
$function$;

-- The public half: what a customer's browser needs to render navigation. No
-- feature configuration, no entitlements, no reply-to address — a visitor has
-- no business knowing what a tenant pays for.
create or replace function private.get_public_navigation_v1(
  p_hostname text,
  p_application text
)
returns table (
  contract_version integer,
  navigation jsonb,
  default_locale text,
  cache_tag text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_tenant_id uuid;
begin
  v_tenant_id := (select r.tenant_id from api_v1.resolve_public_tenant_v1(p_hostname,p_application) r);
  if v_tenant_id is null then
    raise exception using errcode='42501',message='booking_context_required';
  end if;

  return query
  select 1, coalesce(s.navigation,'{}'::jsonb), coalesce(s.default_locale,'en'),
    pg_catalog.concat('config:',v_tenant_id::text,':',coalesce(s.config_version,1::bigint)::text)
  from (select v_tenant_id as tenant_id) one
  left join app.tenant_settings s on s.tenant_id = one.tenant_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. api_v1 surface
-- ---------------------------------------------------------------------------

create or replace function api_v1.save_tenant_settings_v1(
  p_tenant_id uuid, p_settings jsonb, p_navigation jsonb,
  p_feature_configuration jsonb, p_expected_revision bigint default null)
returns table (contract_version integer, revision bigint, ignored_features text[])
language sql volatile security invoker set search_path = '' set statement_timeout = '5s'
as $$ select * from private.save_tenant_settings_v1(p_tenant_id,p_settings,p_navigation,
  p_feature_configuration,p_expected_revision); $$;

create or replace function api_v1.get_tenant_configuration_v1(p_tenant_id uuid)
returns table (
  contract_version integer, settings jsonb, navigation jsonb,
  feature_configuration jsonb, entitlements jsonb, default_locale text,
  config_version bigint, feature_version bigint, revision bigint, cache_tag text)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_tenant_configuration_v1(p_tenant_id); $$;

create or replace function api_v1.get_public_navigation_v1(
  p_hostname text, p_application text)
returns table (
  contract_version integer, navigation jsonb, default_locale text, cache_tag text)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_public_navigation_v1(p_hostname,p_application); $$;

-- The settings trail, over rows RLS already scopes to the audit capability.
create or replace function api_v1.list_settings_events_v1(
  p_tenant_id uuid, p_limit integer default 50)
returns table (
  revision bigint, changed text[], actor_membership_id uuid, created_at timestamptz)
language sql stable security invoker set search_path = ''
as $$
  select e.revision, e.changed, e.actor_membership_id, e.created_at
  from app.tenant_settings_events e
  where e.tenant_id = p_tenant_id
  order by e.revision desc
  limit least(greatest(coalesce(p_limit,50),1),200);
$$;

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------

revoke all on function
  private.get_runtime_entitlements_v1(uuid),
  private.navigation_is_valid_v1(jsonb),
  private.settings_are_valid_v1(jsonb),
  private.save_tenant_settings_v1(uuid,jsonb,jsonb,jsonb,bigint),
  private.get_tenant_configuration_v1(uuid),
  private.get_public_navigation_v1(text,text)
from public, anon, authenticated;

grant execute on function
  private.navigation_is_valid_v1(jsonb),
  private.settings_are_valid_v1(jsonb),
  private.save_tenant_settings_v1(uuid,jsonb,jsonb,jsonb,bigint),
  private.get_tenant_configuration_v1(uuid)
to authenticated;

grant execute on function private.get_public_navigation_v1(text,text)
to anon, authenticated;

revoke all on function
  api_v1.save_tenant_settings_v1(uuid,jsonb,jsonb,jsonb,bigint),
  api_v1.get_tenant_configuration_v1(uuid),
  api_v1.get_public_navigation_v1(text,text),
  api_v1.list_settings_events_v1(uuid,integer)
from public, anon, authenticated;

grant execute on function
  api_v1.save_tenant_settings_v1(uuid,jsonb,jsonb,jsonb,bigint),
  api_v1.get_tenant_configuration_v1(uuid),
  api_v1.list_settings_events_v1(uuid,integer)
to authenticated;

grant execute on function api_v1.get_public_navigation_v1(text,text)
to anon, authenticated;
