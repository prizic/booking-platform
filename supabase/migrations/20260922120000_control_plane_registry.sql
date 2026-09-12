-- Issue #27: the private control-plane registry.
--
-- Everything here lives in a new `control_plane` schema, and the reason is the
-- whole design: `anon` and `authenticated` are never granted USAGE on it. A
-- tenant session cannot reach these tables to be refused by a policy — it
-- cannot name them. That is a stronger statement than row level security, and
-- it is the right one for a schema whose rows are about tenants rather than
-- owned by them.
--
-- The distinction from `private`: `private` holds helpers and worker state for
-- the tenant-facing product, reached through SECURITY DEFINER functions that
-- tenant sessions do call. `control_plane` holds the fleet, and no tenant
-- session calls into it at all.
--
-- Desired versus current, everywhere:
--
--   A third-party API call that returned 200 last Tuesday is not a fact about
--   today. Every infrastructure record therefore carries what we asked for,
--   what we last observed, when we last observed it, how many attempts it took,
--   and a sanitized error — so drift is a value that can be read rather than a
--   surprise found by a customer.
--
-- Secrets: there are none here, structurally. Columns hold references,
-- fingerprints and status. A check constraint refuses anything shaped like a
-- credential, so a mistake in a provisioning worker fails loudly at the write
-- rather than quietly storing a key that then appears in a backup.
--
-- What this deliberately does NOT add:
--
--   * no tenant browsing. Reading a tenant's customers or bookings from here is
--     not merely discouraged; there is no function that does it. Support access
--     is issue #28 and is a grant with an expiry, not a role.
--   * no direct infrastructure action. Privileged work is a queued job row with
--     attempts and an audit trail, because a destructive call fired straight
--     from a request handler has nowhere to resume from.
--   * no second audit ledger for tenant-facing things. Tenant actions are
--     already recorded in their own tables; this records operator actions.

create schema if not exists control_plane authorization postgres;
comment on schema control_plane is
  'Private fleet registry. Never granted to anon or authenticated, never copied into a distributed instance repository.';

revoke all on schema control_plane from public;
-- Deliberately absent: any grant to anon or authenticated. A tenant session
-- cannot name an object in here.
grant usage on schema control_plane to service_role;
alter default privileges for role postgres in schema control_plane
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema control_plane
  revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Operators
-- ---------------------------------------------------------------------------

-- An allow-list, not a role claim. Being able to sign in is not being an
-- operator; being in this table is, and it is revocable in one place.
create table control_plane.operators (
  auth_user_id uuid not null primary key,
  email text not null check (email = lower(email) and email like '%@%'),
  role text not null check (role in ('viewer','operator','admin','break_glass')),
  -- Break-glass is time-boxed by construction. An account that can do anything
  -- forever is an account somebody eventually forgets about.
  expires_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check (role <> 'break_glass' or expires_at is not null)
);

alter table control_plane.operators enable row level security;
create policy operators_no_application_access on control_plane.operators
  for all to anon,authenticated using (false) with check (false);
revoke all on control_plane.operators from public,anon,authenticated;

-- Is the caller an operator right now, at at least this level? Re-read on every
-- privileged action rather than trusted from a session claim, so revoking
-- somebody takes effect immediately rather than when their token expires.
create or replace function control_plane.is_operator_v1(p_minimum text default 'viewer')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from control_plane.operators o
    where o.auth_user_id = (select private.current_auth_user_id())
      and o.disabled_at is null
      and (o.expires_at is null or o.expires_at > pg_catalog.statement_timestamp())
      and case p_minimum
        when 'viewer' then true
        when 'operator' then o.role in ('operator','admin','break_glass')
        when 'admin' then o.role in ('admin','break_glass')
        else false
      end
      -- Every privileged read and write requires a recent authentication, not
      -- merely a session that was strong once.
      and (select private.is_aal2())
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Plans and subscriptions
-- ---------------------------------------------------------------------------

create table control_plane.plans (
  key text not null primary key
    check (key = lower(key) and key ~ '^[a-z][a-z0-9_-]{1,40}$'),
  name text not null check (btrim(name) <> ''),
  -- The feature keys this plan grants. Writing a subscription projects these
  -- into `app.tenant_entitlements`, which is the table the product reads.
  entitlements text[] not null default '{}'::text[],
  active boolean not null default true,
  created_at timestamptz not null default statement_timestamp()
);

create table control_plane.subscriptions (
  tenant_id uuid not null primary key references app.tenants(id) on delete restrict,
  plan_key text not null references control_plane.plans(key) on delete restrict,
  state text not null default 'active'
    check (state in ('trialing','active','past_due','cancelled')),
  rollout_ring text not null default 'general'
    check (rollout_ring in ('canary','early','general')),
  started_at timestamptz not null default statement_timestamp(),
  ends_at timestamptz,
  updated_at timestamptz not null default statement_timestamp()
);

do $rls$
declare t text;
begin
  foreach t in array array['plans','subscriptions'] loop
    execute format('alter table control_plane.%I enable row level security',t);
    execute format('create policy %I on control_plane.%I for all to anon,authenticated using (false) with check (false)',t||'_no_application_access',t);
    execute format('revoke all on control_plane.%I from public,anon,authenticated',t);
  end loop;
end;
$rls$;

-- ---------------------------------------------------------------------------
-- 3. Infrastructure identities, desired versus current
-- ---------------------------------------------------------------------------

-- Stable external IDs, never mutable names. A GitHub repository can be renamed
-- and a Vercel project can be relabelled; their numeric identity cannot, and
-- the identity is what a reconciler needs to find the thing again.
create table control_plane.instance_infrastructure (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  instance_id uuid not null,
  provider text not null check (provider in ('github','vercel','resend','supabase','stripe')),
  resource_kind text not null check (resource_kind in (
    'app_installation','repository','branch','ruleset',
    'team','project','deployment','domain',
    'sending_domain','database_project','connected_account')),
  -- The provider's own identifier. Opaque here on purpose.
  external_id text not null check (btrim(external_id) <> ''),
  -- What we asked for, and what we last actually saw. Two columns rather than
  -- one, because a call that returned 200 last Tuesday is not a fact about now.
  desired_state jsonb not null default '{}'::jsonb check (jsonb_typeof(desired_state) = 'object'),
  observed_state jsonb not null default '{}'::jsonb check (jsonb_typeof(observed_state) = 'object'),
  observed_at timestamptz,
  attempts integer not null default 0 check (attempts between 0 and 100),
  last_success_at timestamptz,
  -- A short stable code, never a provider body: provider errors quote tokens
  -- and addresses, and this column is read by operators.
  last_error_code text check (last_error_code is null or char_length(last_error_code) between 1 and 80),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (id),
  unique (provider,resource_kind,external_id),
  foreign key (tenant_id,instance_id) references app.instances(tenant_id,id) on delete restrict
);
create index instance_infrastructure_instance_idx
  on control_plane.instance_infrastructure (tenant_id,instance_id);

-- Nothing shaped like a credential is stored, anywhere in either document. A
-- provisioning worker that puts a token in `observed_state` fails loudly here
-- rather than quietly writing a key that then appears in every backup.
create or replace function control_plane.contains_no_secret_v1(p_document jsonb)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select not (p_document::text ~* '(sk_[a-z0-9]|rk_[a-z0-9]|whsec_|ghp_|ghs_|github_pat_|xox[abpr]-|-----BEGIN|eyJ[A-Za-z0-9_-]{10}|Bearer\s)');
$$;

alter table control_plane.instance_infrastructure
  add constraint instance_infrastructure_no_secrets
  check (control_plane.contains_no_secret_v1(desired_state)
    and control_plane.contains_no_secret_v1(observed_state));

-- Release and configuration state for the instance itself: what it should be
-- running and what it last reported running.
create table control_plane.instance_release_state (
  tenant_id uuid not null,
  instance_id uuid not null,
  desired_release text check (desired_release is null or char_length(desired_release) between 1 and 80),
  current_release text check (current_release is null or char_length(current_release) between 1 and 80),
  config_schema_version integer not null default 1 check (config_schema_version > 0),
  customization_tier text not null default 'config_only'
    check (customization_tier in ('config_only','extended','bespoke')),
  supported_backend_min integer not null default 1 check (supported_backend_min > 0),
  supported_backend_max integer not null default 1 check (supported_backend_max > 0),
  -- Fingerprints, never values. Enough to detect a change, useless to an
  -- attacker who reads this table.
  environment_fingerprint text
    check (environment_fingerprint is null or environment_fingerprint ~ '^[a-f0-9]{64}$'),
  reported_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id,instance_id),
  foreign key (tenant_id,instance_id) references app.instances(tenant_id,id) on delete restrict,
  check (supported_backend_max >= supported_backend_min)
);

-- ---------------------------------------------------------------------------
-- 4. Privileged work is a job, never a direct call
-- ---------------------------------------------------------------------------

-- A destructive infrastructure call fired straight from a request handler has
-- nowhere to resume from when it half-succeeds. Every privileged action is a
-- row here first: claimable, attributable, retryable, and readable afterwards.
create table control_plane.jobs (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid,
  instance_id uuid,
  kind text not null check (kind in (
    'provision_instance','seed_repository','provision_domains','publish_release',
    'rotate_secret','suspend_instance','close_instance','reconcile_drift')),
  status text not null default 'queued'
    check (status in ('queued','running','succeeded','failed','cancelled')),
  parameters jsonb not null default '{}'::jsonb check (jsonb_typeof(parameters) = 'object'),
  attempts integer not null default 0 check (attempts between 0 and 20),
  locked_until timestamptz,
  last_error_code text check (last_error_code is null or char_length(last_error_code) between 1 and 80),
  requested_by uuid not null,
  approved_by uuid,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  primary key (id),
  check (control_plane.contains_no_secret_v1(parameters)),
  -- Destructive kinds need a second operator. One person should not be able to
  -- close a tenant's instance alone.
  check (kind not in ('close_instance','rotate_secret') or approved_by is not null
    or status = 'queued')
);
create index jobs_claimable_idx on control_plane.jobs (created_at)
  where status in ('queued','running');

-- Everything an operator does, in one place, append-only.
create table control_plane.audit_events (
  id uuid not null default pg_catalog.gen_random_uuid(),
  operator_id uuid not null,
  action text not null check (btrim(action) <> ''),
  tenant_id uuid,
  instance_id uuid,
  -- Stable codes and identifiers only. Never a credential, never a customer.
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  primary key (id),
  check (control_plane.contains_no_secret_v1(detail))
);
create trigger audit_events_append_only
  before update or delete on control_plane.audit_events
  for each row execute function private.enforce_append_only();

-- ---------------------------------------------------------------------------
-- 5. Fleet-wide switches
-- ---------------------------------------------------------------------------

create table control_plane.platform_flags (
  key text not null primary key
    check (key = lower(key) and key ~ '^[a-z][a-z0-9_.]{1,60}$'),
  enabled boolean not null default false,
  kind text not null default 'feature'
    check (kind in ('feature','incident_banner','maintenance_window','kill_switch')),
  -- Shown to tenants when set. Bilingual, because a fleet-wide banner reaches
  -- Arabic-speaking operators and customers too.
  message_en text check (message_en is null or char_length(message_en) between 1 and 500),
  message_ar text check (message_ar is null or char_length(message_ar) between 1 and 500),
  starts_at timestamptz,
  ends_at timestamptz,
  updated_by uuid,
  updated_at timestamptz not null default statement_timestamp(),
  -- A banner nobody can read in one of the product's languages is a banner that
  -- half the audience does not get.
  check ((message_en is null) = (message_ar is null)),
  check (kind <> 'incident_banner' or message_en is not null)
);

do $rls$
declare t text;
begin
  foreach t in array array['instance_infrastructure','instance_release_state','jobs',
                           'audit_events','platform_flags'] loop
    execute format('alter table control_plane.%I enable row level security',t);
    execute format('create policy %I on control_plane.%I for all to anon,authenticated using (false) with check (false)',t||'_no_application_access',t);
    execute format('revoke all on control_plane.%I from public,anon,authenticated',t);
  end loop;
end;
$rls$;

-- ---------------------------------------------------------------------------
-- 6. Registering and reading the fleet
-- ---------------------------------------------------------------------------

-- Assigning a plan is the one control-plane write that reaches into the tenant
-- product: it projects the plan's feature list into `app.tenant_entitlements`,
-- which is the table issue #26's `save_tenant_settings_v1` reads. Nothing
-- inside the tenant can write that table, which is why this has to.
create or replace function control_plane.assign_plan_v1(
  p_tenant_id uuid,
  p_plan_key text,
  p_rollout_ring text default 'general'
)
returns table (tenant_id uuid, plan_key text, granted integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
-- The result columns are named for the contract (tenant_id), which collides
-- with the columns this body reads. Column wins.
#variable_conflict use_column
declare
  v_plan control_plane.plans%rowtype;
  v_operator uuid;
  v_granted integer := 0;
begin
  if not control_plane.is_operator_v1('admin') then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  v_operator := (select private.current_auth_user_id());

  select * into v_plan from control_plane.plans p where p.key = p_plan_key and p.active;
  if v_plan.key is null then
    raise exception using errcode='22023',message='plan_unknown';
  end if;

  insert into control_plane.subscriptions(tenant_id,plan_key,rollout_ring)
  values (p_tenant_id,p_plan_key,p_rollout_ring)
  on conflict (tenant_id) do update
    set plan_key = excluded.plan_key, rollout_ring = excluded.rollout_ring,
        state = 'active', updated_at = pg_catalog.statement_timestamp();

  -- Revoke first, then grant: a plan change that removes a feature has to
  -- actually remove it, not merely fail to add it.
  update app.tenant_entitlements e set granted = false,
    updated_at = pg_catalog.statement_timestamp()
  where e.tenant_id = p_tenant_id and e.source = 'plan'
    and not (e.feature_key = any (v_plan.entitlements));

  insert into app.tenant_entitlements(tenant_id,feature_key,granted,source)
  select p_tenant_id, k, true, 'plan' from unnest(v_plan.entitlements) k
  on conflict (tenant_id,feature_key) do update
    set granted = true, source = 'plan', updated_at = pg_catalog.statement_timestamp();
  get diagnostics v_granted = row_count;

  insert into control_plane.audit_events(operator_id,action,tenant_id,detail)
  values (v_operator,'plan.assigned',p_tenant_id,
    jsonb_build_object('plan',p_plan_key,'ring',p_rollout_ring));

  return query select p_tenant_id, p_plan_key, v_granted;
end;
$function$;

-- Recording what a provisioning worker actually observed. Desired state is only
-- ever written by the job that asked for it; this records reality.
create or replace function control_plane.record_infrastructure_state_v1(
  p_tenant_id uuid,
  p_instance_id uuid,
  p_provider text,
  p_resource_kind text,
  p_external_id text,
  p_observed_state jsonb,
  p_error_code text default null
)
returns table (infrastructure_id uuid, drifted boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_id uuid;
  v_desired jsonb;
  v_drifted boolean;
begin
  if not control_plane.is_operator_v1('operator') then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if not control_plane.contains_no_secret_v1(coalesce(p_observed_state,'{}'::jsonb)) then
    raise exception using errcode='22023',message='secret_rejected';
  end if;

  insert into control_plane.instance_infrastructure(
    tenant_id,instance_id,provider,resource_kind,external_id,observed_state,
    observed_at,attempts,last_success_at,last_error_code)
  values (p_tenant_id,p_instance_id,p_provider,p_resource_kind,p_external_id,
    coalesce(p_observed_state,'{}'::jsonb),v_now,1,
    case when p_error_code is null then v_now end,p_error_code)
  on conflict (provider,resource_kind,external_id) do update
    set observed_state = excluded.observed_state,
        observed_at = v_now,
        attempts = control_plane.instance_infrastructure.attempts + 1,
        last_success_at = case when p_error_code is null then v_now
          else control_plane.instance_infrastructure.last_success_at end,
        last_error_code = p_error_code,
        updated_at = v_now
  returning id, desired_state into v_id, v_desired;

  -- Drift is a value that can be read, not a surprise a customer finds. Every
  -- key we asked for must be present and equal in what we saw; extra keys the
  -- provider added are not drift.
  v_drifted := exists (
    select 1 from pg_catalog.jsonb_each(v_desired) d
    where coalesce(p_observed_state,'{}'::jsonb)->d.key is distinct from d.value);

  return query select v_id, v_drifted;
end;
$function$;

-- The registry view an operator actually works from: one row per instance with
-- its plan, release state, infrastructure health and drift.
create or replace function control_plane.get_fleet_registry_v1()
returns table (
  tenant_id uuid,
  tenant_name text,
  tenant_status text,
  instance_id uuid,
  deployment_state text,
  plan_key text,
  subscription_state text,
  rollout_ring text,
  desired_release text,
  current_release text,
  release_drifted boolean,
  infrastructure_total bigint,
  infrastructure_failing bigint,
  oldest_observation_minutes integer
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not control_plane.is_operator_v1('viewer') then
    raise exception using errcode='42501',message='policy_denied';
  end if;

  return query
  select t.id, t.name, t.status, i.id, i.deployment_state,
    s.plan_key, s.state, s.rollout_ring,
    r.desired_release, r.current_release,
    -- A release nobody has confirmed is running is drift, and so is a mismatch.
    (r.desired_release is distinct from r.current_release),
    (select pg_catalog.count(*) from control_plane.instance_infrastructure f
      where f.tenant_id = t.id and f.instance_id = i.id),
    (select pg_catalog.count(*) from control_plane.instance_infrastructure f
      where f.tenant_id = t.id and f.instance_id = i.id and f.last_error_code is not null),
    (select coalesce(pg_catalog.max(
       extract(epoch from (pg_catalog.statement_timestamp() - f.observed_at))/60),0)::integer
     from control_plane.instance_infrastructure f
     where f.tenant_id = t.id and f.instance_id = i.id)
  from app.tenants t
  join app.instances i on i.tenant_id = t.id
  left join control_plane.subscriptions s on s.tenant_id = t.id
  left join control_plane.instance_release_state r
    on r.tenant_id = t.id and r.instance_id = i.id
  order by t.created_at, i.created_at;
end;
$function$;

-- Queueing privileged work. Destructive kinds need a second operator, so one
-- person cannot close a tenant's instance alone.
create or replace function control_plane.enqueue_job_v1(
  p_kind text,
  p_tenant_id uuid default null,
  p_instance_id uuid default null,
  p_parameters jsonb default '{}'::jsonb
)
returns table (job_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_operator uuid;
  v_id uuid;
begin
  if not control_plane.is_operator_v1('operator') then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if not control_plane.contains_no_secret_v1(coalesce(p_parameters,'{}'::jsonb)) then
    raise exception using errcode='22023',message='secret_rejected';
  end if;
  v_operator := (select private.current_auth_user_id());

  insert into control_plane.jobs(kind,tenant_id,instance_id,parameters,requested_by)
  values (p_kind,p_tenant_id,p_instance_id,coalesce(p_parameters,'{}'::jsonb),v_operator)
  returning id into v_id;

  insert into control_plane.audit_events(operator_id,action,tenant_id,instance_id,detail)
  values (v_operator,'job.enqueued',p_tenant_id,p_instance_id,
    jsonb_build_object('kind',p_kind,'job_id',v_id));

  return query select v_id,'queued'::text;
end;
$function$;

-- Approving a destructive job. A different operator, checked here rather than
-- hoped for: the whole point of two-person control is that it is not the same
-- person twice.
create or replace function control_plane.approve_job_v1(p_job_id uuid)
returns table (job_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_job control_plane.jobs%rowtype;
  v_operator uuid;
begin
  if not control_plane.is_operator_v1('admin') then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  v_operator := (select private.current_auth_user_id());

  select * into v_job from control_plane.jobs j where j.id = p_job_id for update;
  if v_job.id is null or v_job.status <> 'queued' then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if v_job.requested_by = v_operator then
    raise exception using errcode='42501',message='second_operator_required';
  end if;

  update control_plane.jobs j set approved_by = v_operator,
    updated_at = pg_catalog.statement_timestamp()
  where j.id = p_job_id;

  insert into control_plane.audit_events(operator_id,action,tenant_id,instance_id,detail)
  values (v_operator,'job.approved',v_job.tenant_id,v_job.instance_id,
    jsonb_build_object('job_id',p_job_id,'kind',v_job.kind));

  return query select p_job_id,'queued'::text;
end;
$function$;

-- What a tenant application is allowed to know about fleet-wide state: an
-- incident banner and nothing else. No flag keys, no kill switches, no other
-- tenant's anything.
create or replace function private.get_platform_notice_v1()
returns table (message_en text, message_ar text, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select f.message_en, f.message_ar, f.ends_at
  from control_plane.platform_flags f
  where f.kind = 'incident_banner'
    and f.enabled
    and (f.starts_at is null or f.starts_at <= pg_catalog.statement_timestamp())
    and (f.ends_at is null or f.ends_at > pg_catalog.statement_timestamp())
  order by f.updated_at desc
  limit 1;
$$;

create or replace function api_v1.get_platform_notice_v1()
returns table (message_en text, message_ar text, ends_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_platform_notice_v1(); $$;

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------

-- Control-plane functions are reachable only by the service role, and each one
-- re-checks operator standing on top of that. Two locks, because the first is
-- about which process and the second is about which person.
revoke all on function
  control_plane.is_operator_v1(text),
  control_plane.contains_no_secret_v1(jsonb),
  control_plane.assign_plan_v1(uuid,text,text),
  control_plane.record_infrastructure_state_v1(uuid,uuid,text,text,text,jsonb,text),
  control_plane.get_fleet_registry_v1(),
  control_plane.enqueue_job_v1(text,uuid,uuid,jsonb),
  control_plane.approve_job_v1(uuid)
from public, anon, authenticated;

grant execute on function
  control_plane.is_operator_v1(text),
  control_plane.assign_plan_v1(uuid,text,text),
  control_plane.record_infrastructure_state_v1(uuid,uuid,text,text,text,jsonb,text),
  control_plane.get_fleet_registry_v1(),
  control_plane.enqueue_job_v1(text,uuid,uuid,jsonb),
  control_plane.approve_job_v1(uuid)
to service_role;

-- The incident banner is the one thing that crosses the boundary outward, and
-- it carries nothing but a message somebody wrote for customers to read.
revoke all on function
  private.get_platform_notice_v1(),
  api_v1.get_platform_notice_v1()
from public, anon, authenticated;
grant execute on function private.get_platform_notice_v1() to anon, authenticated;
grant execute on function api_v1.get_platform_notice_v1() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. The first-release plan
-- ---------------------------------------------------------------------------

insert into control_plane.plans(key,name,entitlements) values
  ('launch','Launch', array[
    'booking.online','booking.request_to_book','booking.guest_management',
    'payments.deposits','reports.operational','brand.custom_domain'])
on conflict do nothing;
