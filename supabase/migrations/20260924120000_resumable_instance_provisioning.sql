-- Issue #30: resumable instance provisioning.
--
-- The whole design follows from one observation: provisioning an instance is a
-- sequence of calls to other people's APIs, and every one of them can time out
-- after having succeeded. A worker that holds the sequence in a local variable
-- has nowhere to resume from when it is restarted mid-run, and no way to tell a
-- duplicate response from a second resource.
--
-- So the sequence lives in rows. Each step carries its own status, attempt
-- count, stable idempotency key, the provider's stable external ID once known,
-- a sanitized error and a retry time. Resuming is a query, not a reconstruction.
--
-- Three properties are worth naming, because each of them is a bug that would
-- otherwise be found by a customer:
--
--   * Waiting is not failing. A tenant's DNS change takes as long as it takes.
--     A run blocked on it is `waiting` with a reason and a retry time — not
--     `failed` (which invites a destructive retry) and not `active` (which
--     invites traffic to a domain that resolves nowhere).
--
--   * A retry is the same call, not another one. Every step has one stable
--     idempotency key for its whole life, so the provider deduplicates a
--     retried create. A step that already succeeded is never re-run, and
--     re-reporting its success is a no-op rather than a second resource.
--
--   * Rollback deactivates; it never deletes. A half-provisioned repository
--     holds a tenant's configuration and a half-provisioned domain holds their
--     DNS. Automated deletion of either turns a recoverable incident into an
--     unrecoverable one, so there is no DELETE in this file's rollback path at
--     all — desired state flips to inactive and the rows stay.
--
-- Activation is a gate rather than a step: a run does not become active because
-- the last step finished, it becomes active because every required check
-- passes at the moment somebody asks. `activate_instance_v1` returns the list
-- of reasons it refused, so an operator reads the blockers instead of guessing.

-- ---------------------------------------------------------------------------
-- 1. What the fleet's backend currently answers to
-- ---------------------------------------------------------------------------

-- A release declares the backend contract range it can talk to. That claim is
-- only checkable against a number the database itself owns, so here it is.
-- Bumping it is a deliberate migration edit; `platform-contract.json` is the
-- file side of the same fact and `scripts/check-release-contracts.mjs` owns it.
create or replace function control_plane.backend_contract_version_v1()
returns integer
language sql
immutable
set search_path = ''
as $$ select 1 $$;

-- A worker session has no end-user identity. That is the distinction that
-- matters here: an operator must not be able to mark `health_check` succeeded
-- from a browser and then activate an instance that was never checked.
create or replace function control_plane.is_worker_v1()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select (select private.current_auth_user_id()) is null $$;

-- Run states are ordered, and the order is the only thing that makes "advance"
-- meaningful. A late success from a step that was already overtaken must not
-- walk the run backwards.
create or replace function control_plane.provisioning_state_rank_v1(p_state text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.array_position(
    array['requested','validated','tenant_created','repository_seeded',
          'config_committed','projects_created','environment_configured',
          'domain_pending','domain_deployed','health_checked','active'],
    p_state);
$$;

-- ---------------------------------------------------------------------------
-- 2. The run
-- ---------------------------------------------------------------------------

create table control_plane.provisioning_runs (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  instance_id uuid not null,
  -- Globally unique across the fleet, because it names a repository and two
  -- Vercel projects. Two tenants cannot both be `northside-clinic`.
  slug text not null check (slug ~ '^[a-z][a-z0-9-]{1,38}[a-z0-9]$'),
  plan_key text not null references control_plane.plans(key) on delete restrict,
  state text not null default 'requested' check (state in (
    'requested','validated','tenant_created','repository_seeded','config_committed',
    'projects_created','environment_configured','domain_pending','domain_deployed',
    'health_checked','active','failed','deactivated')),
  -- Set while a step is blocked on somebody else. A run with a waiting reason
  -- is progressing slowly, not broken.
  waiting_reason text check (waiting_reason is null or waiting_reason in (
    'customer_dns','external_approval','provider_rate_limit','provider_outage')),
  idempotency_key text not null check (pg_catalog.char_length(idempotency_key) between 8 and 200),
  request jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(request) = 'object'),
  desired_release text not null check (desired_release ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  config_schema_version integer not null check (config_schema_version > 0),
  backend_contract_min integer not null check (backend_contract_min > 0),
  backend_contract_max integer not null check (backend_contract_max > 0),
  last_error_code text check (last_error_code is null or pg_catalog.char_length(last_error_code) between 1 and 80),
  requested_by uuid not null,
  activated_at timestamptz,
  deactivated_at timestamptz,
  deactivation_reason text check (deactivation_reason is null
    or pg_catalog.char_length(deactivation_reason) between 1 and 200),
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  primary key (id),
  -- One run per instance. Re-requesting resumes; it does not fork.
  unique (tenant_id,instance_id),
  unique (idempotency_key),
  unique (slug),
  foreign key (tenant_id,instance_id) references app.instances(tenant_id,id) on delete restrict,
  check (control_plane.contains_no_secret_v1(request)),
  check (backend_contract_max >= backend_contract_min),
  check (state <> 'active' or activated_at is not null),
  check (state <> 'deactivated' or deactivated_at is not null)
);

-- The step rows. Everything a resumption needs is here, and nothing a
-- resumption needs is anywhere else.
create table control_plane.provisioning_steps (
  id uuid not null default pg_catalog.gen_random_uuid(),
  run_id uuid not null references control_plane.provisioning_runs(id) on delete restrict,
  step_order integer not null check (step_order between 1 and 99),
  step_key text not null check (step_key ~ '^[a-z][a-z0-9_]{2,40}$'),
  provider text check (provider is null or provider in ('github','vercel','resend','supabase','stripe')),
  resource_kind text,
  required boolean not null default true,
  -- The run state this step's success implies, when it implies one. Steps that
  -- do not move the run forward leave it null rather than inventing a state.
  resulting_state text check (resulting_state is null
    or control_plane.provisioning_state_rank_v1(resulting_state) is not null),
  -- The run state that this step *waiting* implies. Only the domain step has
  -- one, because only the domain step waits on somebody outside the fleet.
  waiting_state text check (waiting_state is null
    or control_plane.provisioning_state_rank_v1(waiting_state) is not null),
  status text not null default 'pending'
    check (status in ('pending','running','waiting','succeeded','failed','skipped')),
  attempts integer not null default 0 check (attempts between 0 and 200),
  max_attempts integer not null default 6 check (max_attempts between 1 and 200),
  -- One key for the step's whole life, presented to the provider on every
  -- attempt. This is what makes a retried create the same create.
  idempotency_key text not null check (pg_catalog.char_length(idempotency_key) between 8 and 200),
  -- The provider's own stable identifier. A repository can be renamed and a
  -- project relabelled; this is how the reconciler finds it afterwards.
  external_id text check (external_id is null or pg_catalog.btrim(external_id) <> ''),
  observed_state jsonb not null default '{}'::jsonb
    check (pg_catalog.jsonb_typeof(observed_state) = 'object'),
  waiting_reason text check (waiting_reason is null or waiting_reason in (
    'customer_dns','external_approval','provider_rate_limit','provider_outage')),
  last_error_code text check (last_error_code is null
    or pg_catalog.char_length(last_error_code) between 1 and 80),
  retry_after timestamptz,
  locked_until timestamptz,
  started_at timestamptz,
  last_success_at timestamptz,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  primary key (id),
  unique (run_id,step_key),
  unique (run_id,step_order),
  unique (idempotency_key),
  check (control_plane.contains_no_secret_v1(observed_state)),
  check (status <> 'succeeded' or last_success_at is not null),
  check (status <> 'waiting' or waiting_reason is not null),
  -- A required step cannot be waved through.
  check (status <> 'skipped' or not required)
);
create index provisioning_steps_claimable_idx
  on control_plane.provisioning_steps (run_id,step_order)
  where status in ('pending','waiting','running');

-- The timeline an operator reads after something goes wrong. Append-only,
-- because the point of a timeline is that it is not edited afterwards.
create table control_plane.provisioning_events (
  id bigint generated always as identity,
  run_id uuid not null references control_plane.provisioning_runs(id) on delete restrict,
  step_key text,
  event text not null check (event in (
    'requested','claimed','succeeded','failed','waiting','retried','skipped',
    'activation_blocked','activated','deactivated','reconciled')),
  attempt integer check (attempt is null or attempt >= 0),
  -- A stable code, never a provider body: provider errors quote tokens and
  -- addresses, and an operator reads this column.
  error_code text check (error_code is null or pg_catalog.char_length(error_code) between 1 and 80),
  detail jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(detail) = 'object'),
  occurred_at timestamptz not null default pg_catalog.statement_timestamp(),
  primary key (id),
  check (control_plane.contains_no_secret_v1(detail))
);
create index provisioning_events_run_idx on control_plane.provisioning_events (run_id,id);
create trigger provisioning_events_append_only
  before update or delete on control_plane.provisioning_events
  for each row execute function private.enforce_append_only();

do $rls$
declare t text;
begin
  foreach t in array array['provisioning_runs','provisioning_steps','provisioning_events'] loop
    execute format('alter table control_plane.%I enable row level security',t);
    execute format('create policy %I on control_plane.%I for all to anon,authenticated using (false) with check (false)',t||'_no_application_access',t);
    execute format('revoke all on control_plane.%I from public,anon,authenticated',t);
  end loop;
end;
$rls$;

-- ---------------------------------------------------------------------------
-- 3. Requesting a run
-- ---------------------------------------------------------------------------

-- Validation returns every problem at once rather than one per round trip, and
-- returns them as data rather than as an exception: a rejected request is a
-- normal answer to a bad form, not an incident. `policy_denied` and
-- `secret_rejected` still raise, because those are boundary violations.
create or replace function control_plane.request_provisioning_v1(
  p_tenant_id uuid,
  p_instance_id uuid,
  p_slug text,
  p_plan_key text,
  p_desired_release text,
  p_config_schema_version integer,
  p_backend_contract_min integer,
  p_backend_contract_max integer,
  p_request jsonb,
  p_idempotency_key text
)
returns table (run_id uuid, state text, rejected text[])
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_existing control_plane.provisioning_runs%rowtype;
  v_rejected text[] := '{}'::text[];
  v_run_id uuid;
  v_request jsonb := coalesce(p_request,'{}'::jsonb);
  v_locale text := v_request->>'default_locale';
  v_timezone text := v_request->>'timezone';
  v_currency text := v_request->>'currency';
  v_domain jsonb;
begin
  if not control_plane.is_operator_v1('operator') then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if not control_plane.contains_no_secret_v1(v_request) then
    raise exception using errcode='22023',message='secret_rejected';
  end if;
  v_operator := (select private.current_auth_user_id());

  -- Resuming is the common case, so it is the first thing checked. Re-sending
  -- the same request returns the same run; sending a different one for the same
  -- instance is a mistake worth refusing loudly.
  select * into v_existing from control_plane.provisioning_runs r
  where r.tenant_id = p_tenant_id and r.instance_id = p_instance_id;
  if v_existing.id is not null then
    if v_existing.idempotency_key is distinct from p_idempotency_key then
      raise exception using errcode='23505',message='idempotency_conflict';
    end if;
    return query select v_existing.id, v_existing.state, '{}'::text[];
    return;
  end if;

  -- ---- validation ---------------------------------------------------------
  if not exists (select 1 from app.instances i
      where i.tenant_id = p_tenant_id and i.id = p_instance_id) then
    v_rejected := v_rejected || 'instance_unknown'::text;
  elsif exists (select 1 from app.instances i
      where i.tenant_id = p_tenant_id and i.id = p_instance_id
        and i.deployment_state <> 'provisioning') then
    -- Provisioning an instance that is already serving traffic is not a retry.
    v_rejected := v_rejected || 'instance_not_provisioning'::text;
  end if;

  if not exists (select 1 from control_plane.plans p
      where p.key = p_plan_key and p.active) then
    v_rejected := v_rejected || 'plan_unknown'::text;
  end if;

  if p_slug is null or p_slug !~ '^[a-z][a-z0-9-]{1,38}[a-z0-9]$' then
    v_rejected := v_rejected || 'slug_invalid'::text;
  elsif exists (select 1 from control_plane.provisioning_runs r where r.slug = p_slug) then
    v_rejected := v_rejected || 'slug_taken'::text;
  end if;

  if v_locale is null or v_locale not in ('en','ar') then
    v_rejected := v_rejected || 'locale_invalid'::text;
  end if;
  if v_timezone is null or not exists (
      select 1 from pg_catalog.pg_timezone_names z where z.name = v_timezone) then
    v_rejected := v_rejected || 'timezone_invalid'::text;
  end if;
  if v_currency is null or v_currency !~ '^[A-Z]{3}$' then
    v_rejected := v_rejected || 'currency_invalid'::text;
  end if;

  if p_desired_release is null or p_desired_release !~ '^[0-9]+\.[0-9]+\.[0-9]+$' then
    v_rejected := v_rejected || 'release_invalid'::text;
  end if;
  if coalesce(p_config_schema_version,0) <= 0 then
    v_rejected := v_rejected || 'config_schema_invalid'::text;
  end if;
  -- The release must be able to talk to the backend this fleet actually runs.
  if coalesce(p_backend_contract_min,0) <= 0
     or coalesce(p_backend_contract_max,0) < coalesce(p_backend_contract_min,1)
     or control_plane.backend_contract_version_v1()
        not between p_backend_contract_min and p_backend_contract_max then
    v_rejected := v_rejected || 'backend_contract_incompatible'::text;
  end if;

  -- Domains are optional at request time (a config-only tenant can launch on a
  -- platform subdomain), but a malformed or already-claimed one is refused
  -- before any provider is called rather than after.
  if pg_catalog.jsonb_typeof(v_request->'domains') not in ('array','null')
     and v_request->'domains' is not null then
    v_rejected := v_rejected || 'domains_invalid'::text;
  else
    for v_domain in
      select value from pg_catalog.jsonb_array_elements(
        case when pg_catalog.jsonb_typeof(v_request->'domains') = 'array'
             then v_request->'domains' else '[]'::jsonb end)
    loop
      if coalesce(v_domain->>'hostname','') !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
         or coalesce(v_domain->>'application','') not in ('client','dashboard') then
        v_rejected := v_rejected || 'domains_invalid'::text;
      elsif exists (select 1 from app.tenant_domains d
          where d.hostname = v_domain->>'hostname' and d.tenant_id <> p_tenant_id) then
        v_rejected := v_rejected || 'domain_taken'::text;
      end if;
    end loop;
  end if;

  -- A provider whose app is not installed cannot be called, so it is a
  -- prerequisite rather than a step that will fail six times first.
  if not exists (select 1 from control_plane.instance_infrastructure f
      where f.tenant_id = p_tenant_id and f.provider = 'github'
        and f.resource_kind = 'app_installation') then
    v_rejected := v_rejected || 'github_installation_missing'::text;
  end if;

  if pg_catalog.array_length(v_rejected,1) > 0 then
    return query select null::uuid,'requested'::text,
      (select pg_catalog.array_agg(distinct x order by x) from unnest(v_rejected) x);
    return;
  end if;

  -- ---- the run ------------------------------------------------------------
  insert into control_plane.provisioning_runs(
    tenant_id,instance_id,slug,plan_key,idempotency_key,request,desired_release,
    config_schema_version,backend_contract_min,backend_contract_max,requested_by)
  values (p_tenant_id,p_instance_id,p_slug,p_plan_key,p_idempotency_key,v_request,
    p_desired_release,p_config_schema_version,p_backend_contract_min,
    p_backend_contract_max,v_operator)
  returning id into v_run_id;

  -- The step catalog. It is written here, once, as data on the rows: a step row
  -- that describes itself is a step row a resumption can act on without
  -- consulting code that may have changed since the run started.
  insert into control_plane.provisioning_steps(
    run_id,step_order,step_key,provider,resource_kind,required,resulting_state,
    waiting_state,idempotency_key,max_attempts)
  select v_run_id,c.step_order,c.step_key,c.provider,c.resource_kind,c.required,
    c.resulting_state,c.waiting_state,
    v_run_id::text || ':' || c.step_key,
    c.max_attempts
  from (values
    (1,'validate_request',  null::text,    null::text,           true, 'validated',              null::text, 3),
    (2,'create_tenant_records','supabase', 'database_project',   true, 'tenant_created',         null,       5),
    (3,'seed_repository',   'github',      'repository',         true, 'repository_seeded',      null,       5),
    (4,'commit_configuration','github',    'branch',             true, 'config_committed',       null,       5),
    (5,'protect_repository','github',      'ruleset',            true, null,                     null,       5),
    (6,'create_projects',   'vercel',      'project',            true, 'projects_created',       null,       5),
    (7,'configure_mail',    'resend',      'sending_domain',     false,null,                     null,       5),
    (8,'configure_environment','vercel',   'project',            true, 'environment_configured', null,       5),
    (9,'deploy_applications','vercel',     'deployment',         true, null,                     null,       5),
    -- The only step that waits on somebody outside the fleet, and therefore the
    -- only one with a waiting state of its own.
    (10,'verify_domains',   'vercel',      'domain',             true, 'domain_deployed',        'domain_pending', 60),
    (11,'health_check',     null,          null,                 true, 'health_checked',         null,       10),
    (12,'generate_agent_pack',null,        null,                 true, null,                     null,       3)
  ) as c(step_order,step_key,provider,resource_kind,required,resulting_state,waiting_state,max_attempts);

  -- What the instance should be running, recorded before anything runs it.
  insert into control_plane.instance_release_state(
    tenant_id,instance_id,desired_release,config_schema_version,
    supported_backend_min,supported_backend_max)
  values (p_tenant_id,p_instance_id,p_desired_release,p_config_schema_version,
    p_backend_contract_min,p_backend_contract_max)
  on conflict (tenant_id,instance_id) do update
    set desired_release = excluded.desired_release,
        config_schema_version = excluded.config_schema_version,
        supported_backend_min = excluded.supported_backend_min,
        supported_backend_max = excluded.supported_backend_max,
        updated_at = pg_catalog.statement_timestamp();

  insert into control_plane.provisioning_events(run_id,event,detail)
  values (v_run_id,'requested',jsonb_build_object('slug',p_slug,'plan',p_plan_key,
    'release',p_desired_release));

  -- Privileged work is a queued job, never a call from this transaction.
  perform control_plane.enqueue_job_v1('provision_instance',p_tenant_id,p_instance_id,
    jsonb_build_object('run_id',v_run_id,'slug',p_slug));

  return query select v_run_id,'requested'::text,'{}'::text[];
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Running a step
-- ---------------------------------------------------------------------------

-- Claiming is where resumption actually happens. A step becomes claimable when
-- every earlier required step has succeeded or been skipped, which means a
-- restarted worker with no memory picks up exactly where the last one stopped.
create or replace function control_plane.claim_provisioning_step_v1(
  p_run_id uuid default null,
  p_lock_seconds integer default 300
)
returns table (
  step_id uuid, run_id uuid, tenant_id uuid, instance_id uuid, slug text,
  step_key text, step_order integer, provider text, resource_kind text,
  attempt integer, idempotency_key text, external_id text, request jsonb
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_step control_plane.provisioning_steps%rowtype;
  v_run control_plane.provisioning_runs%rowtype;
begin
  -- Workers only. An operator session must not be able to hand-drive a step and
  -- then claim the instance was checked.
  if not control_plane.is_worker_v1() then
    raise exception using errcode='42501',message='policy_denied';
  end if;

  select s.* into v_step
  from control_plane.provisioning_steps s
  join control_plane.provisioning_runs r on r.id = s.run_id
  where (p_run_id is null or s.run_id = p_run_id)
    and r.state not in ('active','failed','deactivated')
    and s.status in ('pending','waiting')
    and (s.retry_after is null or s.retry_after <= v_now)
    and s.attempts < s.max_attempts
    and not exists (
      select 1 from control_plane.provisioning_steps earlier
      where earlier.run_id = s.run_id
        and earlier.step_order < s.step_order
        and earlier.status not in ('succeeded','skipped'))
  order by s.run_id, s.step_order
  for update of s skip locked
  limit 1;

  if v_step.id is null then
    return;
  end if;

  update control_plane.provisioning_steps s
  set status = 'running',
      -- A wait is not an attempt, so the attempt that goes on to wait is rolled
      -- back in `complete`. Counting it here keeps a crashed worker honest.
      attempts = s.attempts + 1,
      started_at = coalesce(s.started_at,v_now),
      locked_until = v_now + pg_catalog.make_interval(secs => greatest(p_lock_seconds,30)),
      waiting_reason = null,
      last_error_code = null,
      updated_at = v_now
  where s.id = v_step.id
  returning s.* into v_step;

  select * into v_run from control_plane.provisioning_runs r where r.id = v_step.run_id;

  insert into control_plane.provisioning_events(run_id,step_key,event,attempt)
  values (v_step.run_id,v_step.step_key,'claimed',v_step.attempts);

  return query select v_step.id,v_step.run_id,v_run.tenant_id,v_run.instance_id,
    v_run.slug,v_step.step_key,v_step.step_order,v_step.provider,v_step.resource_kind,
    v_step.attempts,v_step.idempotency_key,v_step.external_id,v_run.request;
end;
$function$;

-- Reporting a step's outcome. Every branch here exists because a provider does
-- that thing: succeeds twice, times out after succeeding, rate-limits, or tells
-- us the customer has not changed their DNS yet.
create or replace function control_plane.complete_provisioning_step_v1(
  p_step_id uuid,
  p_outcome text,
  p_external_id text default null,
  p_observed_state jsonb default '{}'::jsonb,
  p_error_code text default null,
  p_waiting_reason text default null,
  p_retry_after timestamptz default null
)
returns table (step_status text, run_state text, retry_at timestamptz, duplicate boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_step control_plane.provisioning_steps%rowtype;
  v_run control_plane.provisioning_runs%rowtype;
  v_next_state text;
  v_retry timestamptz;
  v_status text;
begin
  if not control_plane.is_worker_v1() then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if p_outcome not in ('succeeded','failed','waiting','skipped') then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  if not control_plane.contains_no_secret_v1(coalesce(p_observed_state,'{}'::jsonb)) then
    raise exception using errcode='22023',message='secret_rejected';
  end if;

  select * into v_step from control_plane.provisioning_steps s
  where s.id = p_step_id for update;
  if v_step.id is null then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  select * into v_run from control_plane.provisioning_runs r
  where r.id = v_step.run_id for update;

  -- A provider that returns the same success twice must not create a second
  -- anything. This is the whole of duplicate handling: the step is already
  -- done, so say so and change nothing.
  if v_step.status = 'succeeded' then
    return query select v_step.status,v_run.state,null::timestamptz,true;
    return;
  end if;

  if p_outcome = 'skipped' and v_step.required then
    raise exception using errcode='42501',message='transition_not_allowed';
  end if;

  if p_outcome = 'waiting' and coalesce(p_waiting_reason,'') = '' then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;

  -- ---- the step ----------------------------------------------------------
  if p_outcome in ('succeeded','skipped') then
    v_status := p_outcome;
    v_retry := null;
  elsif p_outcome = 'waiting' then
    v_status := 'waiting';
    -- Waiting for a customer's DNS is not a failed attempt, and counting it as
    -- one would exhaust the budget of a run that is doing nothing wrong.
    v_retry := coalesce(p_retry_after,v_now + interval '15 minutes');
  else
    -- Backoff, doubling, capped. A provider outage should not be hammered, and
    -- a run should not sit still for a day either.
    v_retry := coalesce(p_retry_after,
      v_now + least(interval '1 hour',
        interval '30 seconds' * pg_catalog.power(2,greatest(v_step.attempts - 1,0))));
    v_status := case when v_step.attempts >= v_step.max_attempts then 'failed' else 'pending' end;
  end if;

  update control_plane.provisioning_steps s
  set status = v_status,
      attempts = case when p_outcome = 'waiting' then greatest(s.attempts - 1,0) else s.attempts end,
      external_id = coalesce(p_external_id,s.external_id),
      observed_state = coalesce(p_observed_state,s.observed_state),
      waiting_reason = case when p_outcome = 'waiting' then p_waiting_reason end,
      last_error_code = case when p_outcome = 'failed' then p_error_code end,
      last_success_at = case when p_outcome in ('succeeded','skipped') then v_now else s.last_success_at end,
      retry_after = v_retry,
      locked_until = null,
      updated_at = v_now
  where s.id = p_step_id;

  -- ---- the provider's resource, if this step made one ---------------------
  if p_external_id is not null and v_step.provider is not null and v_step.resource_kind is not null then
    insert into control_plane.instance_infrastructure(
      tenant_id,instance_id,provider,resource_kind,external_id,
      desired_state,observed_state,observed_at,attempts,last_success_at,last_error_code)
    values (v_run.tenant_id,v_run.instance_id,v_step.provider,v_step.resource_kind,
      p_external_id,jsonb_build_object('active',true),
      coalesce(p_observed_state,'{}'::jsonb),v_now,1,
      case when p_outcome = 'succeeded' then v_now end,
      case when p_outcome = 'failed' then p_error_code end)
    on conflict (provider,resource_kind,external_id) do update
      set observed_state = excluded.observed_state,
          observed_at = v_now,
          attempts = control_plane.instance_infrastructure.attempts + 1,
          last_success_at = case when p_outcome = 'succeeded' then v_now
            else control_plane.instance_infrastructure.last_success_at end,
          last_error_code = case when p_outcome = 'failed' then p_error_code end,
          updated_at = v_now;
  end if;

  -- ---- the run -----------------------------------------------------------
  v_next_state := v_run.state;
  if p_outcome = 'succeeded' and v_step.resulting_state is not null
     and control_plane.provisioning_state_rank_v1(v_step.resulting_state)
         > coalesce(control_plane.provisioning_state_rank_v1(v_run.state),0) then
    v_next_state := v_step.resulting_state;
  elsif p_outcome = 'waiting' and v_step.waiting_state is not null
     and control_plane.provisioning_state_rank_v1(v_step.waiting_state)
         > coalesce(control_plane.provisioning_state_rank_v1(v_run.state),0) then
    v_next_state := v_step.waiting_state;
  elsif v_status = 'failed' and v_step.required then
    v_next_state := 'failed';
  end if;

  update control_plane.provisioning_runs r
  set state = v_next_state,
      waiting_reason = case when p_outcome = 'waiting' then p_waiting_reason end,
      last_error_code = case when p_outcome = 'failed' then p_error_code end,
      updated_at = v_now
  where r.id = v_run.id;

  insert into control_plane.provisioning_events(run_id,step_key,event,attempt,error_code,detail)
  values (v_run.id,v_step.step_key,
    case when p_outcome = 'failed' and v_status = 'pending' then 'failed' else p_outcome end,
    v_step.attempts,p_error_code,
    jsonb_strip_nulls(jsonb_build_object('external_id',p_external_id,
      'waiting_reason',p_waiting_reason,'step_status',v_status)));

  return query select v_status,v_next_state,v_retry,false;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Operator control: retry, activate, deactivate
-- ---------------------------------------------------------------------------

-- Retrying a run resets only what failed. Steps that succeeded keep their
-- success and their external IDs, which is the difference between retrying a
-- run and provisioning a second copy of everything.
create or replace function control_plane.retry_provisioning_run_v1(p_run_id uuid)
returns table (run_state text, steps_reset integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_operator uuid;
  v_run control_plane.provisioning_runs%rowtype;
  v_reset integer;
  v_state text;
begin
  if not control_plane.is_operator_v1('operator') then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  v_operator := (select private.current_auth_user_id());

  select * into v_run from control_plane.provisioning_runs r where r.id = p_run_id for update;
  if v_run.id is null or v_run.state in ('active','deactivated') then
    raise exception using errcode='42501',message='transition_not_allowed';
  end if;

  -- The attempt counter goes back to zero because a human has looked at it. The
  -- attempts themselves are not lost: they are in the timeline.
  update control_plane.provisioning_steps s
  set status = 'pending', attempts = 0, retry_after = null, locked_until = null,
      last_error_code = null, waiting_reason = null, updated_at = v_now
  where s.run_id = p_run_id
    and (s.status = 'failed' or (s.status = 'running' and s.locked_until < v_now));
  get diagnostics v_reset = row_count;

  -- The run falls back to the furthest state its surviving successes justify,
  -- rather than to the beginning.
  select coalesce((
    select s.resulting_state from control_plane.provisioning_steps s
    where s.run_id = p_run_id and s.status = 'succeeded' and s.resulting_state is not null
    order by control_plane.provisioning_state_rank_v1(s.resulting_state) desc
    limit 1),'requested')
  into v_state;

  update control_plane.provisioning_runs r
  set state = v_state, last_error_code = null, waiting_reason = null, updated_at = v_now
  where r.id = p_run_id;

  insert into control_plane.provisioning_events(run_id,event,detail)
  values (p_run_id,'retried',jsonb_build_object('steps_reset',v_reset,'state',v_state));
  insert into control_plane.audit_events(operator_id,action,tenant_id,instance_id,detail)
  values (v_operator,'provisioning.retried',v_run.tenant_id,v_run.instance_id,
    jsonb_build_object('run_id',p_run_id,'steps_reset',v_reset));

  return query select v_state,v_reset;
end;
$function$;

-- Activation is a gate, not a step. It refuses with the list of reasons rather
-- than a single code, because an operator who has to discover blockers one
-- deploy at a time will eventually stop checking.
create or replace function control_plane.activate_instance_v1(p_run_id uuid)
returns table (activated boolean, run_state text, blocked text[])
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_run control_plane.provisioning_runs%rowtype;
  v_release control_plane.instance_release_state%rowtype;
  v_blocked text[] := '{}'::text[];
  v_instance app.instances%rowtype;
begin
  if not (control_plane.is_operator_v1('operator') or control_plane.is_worker_v1()) then
    raise exception using errcode='42501',message='policy_denied';
  end if;

  select * into v_run from control_plane.provisioning_runs r where r.id = p_run_id for update;
  if v_run.id is null then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if v_run.state = 'active' then
    return query select true,v_run.state,'{}'::text[];
    return;
  end if;
  if v_run.state = 'deactivated' then
    raise exception using errcode='42501',message='transition_not_allowed';
  end if;

  if exists (select 1 from control_plane.provisioning_steps s
      where s.run_id = p_run_id and s.required and s.status <> 'succeeded') then
    v_blocked := v_blocked || 'steps_incomplete'::text;
  end if;
  if v_run.waiting_reason is not null then
    v_blocked := v_blocked || ('waiting_' || v_run.waiting_reason)::text;
  end if;

  select * into v_release from control_plane.instance_release_state s
  where s.tenant_id = v_run.tenant_id and s.instance_id = v_run.instance_id;
  if v_release.tenant_id is null then
    v_blocked := v_blocked || 'release_state_missing'::text;
  else
    -- A fingerprint is how we know the environment the deployment actually ran
    -- with is the environment we configured.
    if v_release.environment_fingerprint is null then
      v_blocked := v_blocked || 'environment_unverified'::text;
    end if;
    if v_release.current_release is distinct from v_release.desired_release then
      v_blocked := v_blocked || 'release_mismatch'::text;
    end if;
    if control_plane.backend_contract_version_v1()
       not between v_release.supported_backend_min and v_release.supported_backend_max then
      v_blocked := v_blocked || 'backend_contract_incompatible'::text;
    end if;
  end if;

  -- Every production domain this instance has must actually resolve to it. A
  -- domain row that is pending is a customer typing the URL into nothing.
  if exists (select 1 from app.tenant_domains d
      where d.tenant_id = v_run.tenant_id and d.instance_id = v_run.instance_id
        and d.kind = 'production'
        and (d.verification_status <> 'verified' or not d.active)) then
    v_blocked := v_blocked || 'domains_unverified'::text;
  end if;

  select * into v_instance from app.instances i
  where i.tenant_id = v_run.tenant_id and i.id = v_run.instance_id for update;
  if v_instance.published_brand_revision_id is null then
    v_blocked := v_blocked || 'brand_not_published'::text;
  end if;

  if pg_catalog.array_length(v_blocked,1) > 0 then
    v_blocked := (select pg_catalog.array_agg(distinct x order by x) from unnest(v_blocked) x);
    insert into control_plane.provisioning_events(run_id,event,detail)
    values (p_run_id,'activation_blocked',jsonb_build_object('blocked',pg_catalog.to_jsonb(v_blocked)));
    return query select false,v_run.state,v_blocked;
    return;
  end if;

  update control_plane.provisioning_runs r
  set state = 'active', activated_at = v_now, waiting_reason = null,
      last_error_code = null, updated_at = v_now
  where r.id = p_run_id;
  update app.instances i
  set deployment_state = 'active', updated_at = v_now
  where i.tenant_id = v_run.tenant_id and i.id = v_run.instance_id;

  insert into control_plane.provisioning_events(run_id,event,detail)
  values (p_run_id,'activated',jsonb_build_object('slug',v_run.slug));

  return query select true,'active'::text,'{}'::text[];
end;
$function$;

-- Rollback. Read the statements: there is no DELETE. A half-provisioned
-- repository holds the tenant's configuration and a half-provisioned domain
-- holds their DNS, so both survive a rollback and wait for a human. What
-- changes is desired state, and what that buys is that a mistake here is
-- recoverable by flipping it back.
create or replace function control_plane.deactivate_instance_v1(
  p_run_id uuid,
  p_reason text
)
returns table (run_state text, resources_deactivated integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_operator uuid;
  v_run control_plane.provisioning_runs%rowtype;
  v_count integer;
begin
  if not control_plane.is_operator_v1('admin') then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if coalesce(pg_catalog.btrim(p_reason),'') = '' then
    raise exception using errcode='22023',message='settings_invalid';
  end if;
  v_operator := (select private.current_auth_user_id());

  select * into v_run from control_plane.provisioning_runs r where r.id = p_run_id for update;
  if v_run.id is null then
    raise exception using errcode='42501',message='policy_denied';
  end if;

  update control_plane.instance_infrastructure f
  set desired_state = f.desired_state || jsonb_build_object('active',false),
      updated_at = v_now
  where f.tenant_id = v_run.tenant_id and f.instance_id = v_run.instance_id;
  get diagnostics v_count = row_count;

  -- Suspended, never closed: closing is an offboarding decision with its own
  -- sequence, not a consequence of a provisioning failure.
  update app.instances i
  set deployment_state = 'suspended', updated_at = v_now
  where i.tenant_id = v_run.tenant_id and i.id = v_run.instance_id
    and i.deployment_state <> 'closed';

  update control_plane.provisioning_runs r
  set state = 'deactivated', deactivated_at = v_now,
      deactivation_reason = pg_catalog.btrim(p_reason), updated_at = v_now
  where r.id = p_run_id;

  insert into control_plane.provisioning_events(run_id,event,detail)
  values (p_run_id,'deactivated',jsonb_build_object('reason',pg_catalog.btrim(p_reason),
    'resources_deactivated',v_count));
  insert into control_plane.audit_events(operator_id,action,tenant_id,instance_id,detail)
  values (v_operator,'provisioning.deactivated',v_run.tenant_id,v_run.instance_id,
    jsonb_build_object('run_id',p_run_id,'reason',pg_catalog.btrim(p_reason)));

  return query select 'deactivated'::text,v_count;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Reconciliation
-- ---------------------------------------------------------------------------

-- Desired versus actual, on a timer. Everything this reports is something a
-- provider did without telling us: a worker that died holding a lock, a
-- repository somebody renamed by hand, a resource left behind by a rollback.
--
-- It repairs exactly one thing — an expired lock — and reports the rest. That
-- asymmetry is deliberate: releasing a lock is safe to do a thousand times,
-- and every other repair involves calling somebody's API, which is a job.
create or replace function control_plane.reconcile_provisioning_v1(
  p_stale_after interval default interval '10 minutes'
)
returns table (run_id uuid, tenant_id uuid, instance_id uuid, finding text, detail jsonb)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_released record;
  v_freed jsonb := '[]'::jsonb;
begin
  if not control_plane.is_worker_v1() then
    raise exception using errcode='42501',message='policy_denied';
  end if;

  -- A worker that was restarted mid-step left its row `running` forever. The
  -- lock expiring is what turns that back into work.
  for v_released in
    update control_plane.provisioning_steps s
    set status = 'pending', locked_until = null, retry_after = v_now,
        last_error_code = 'worker_lock_expired', updated_at = v_now
    where s.status = 'running' and s.locked_until is not null and s.locked_until < v_now
    returning s.run_id, s.step_key, s.attempts
  loop
    insert into control_plane.provisioning_events(run_id,step_key,event,attempt,error_code)
    values (v_released.run_id,v_released.step_key,'reconciled',v_released.attempts,
      'worker_lock_expired');
    v_freed := v_freed || jsonb_build_object('run_id',v_released.run_id,
      'step_key',v_released.step_key);
  end loop;

  return query
    -- What this pass repaired. A second pass finds nothing, which is the
    -- readable form of "running it again is safe".
    select r.id, r.tenant_id, r.instance_id, 'lock_expired'::text,
      jsonb_build_object('step_key',e->>'step_key')
    from pg_catalog.jsonb_array_elements(v_freed) e
    join control_plane.provisioning_runs r on r.id = (e->>'run_id')::uuid
  union all
    -- What we asked a provider for is not what it last told us it has.
    select r.id, r.tenant_id, r.instance_id, 'drift'::text,
      jsonb_build_object('provider',f.provider,'resource_kind',f.resource_kind,
        'external_id',f.external_id)
    from control_plane.instance_infrastructure f
    join control_plane.provisioning_runs r
      on r.tenant_id = f.tenant_id and r.instance_id = f.instance_id
    where exists (
      select 1 from pg_catalog.jsonb_each(f.desired_state) d
      where f.observed_state -> d.key is distinct from d.value)
  union all
    -- A resource still wanted alive for an instance that is not.
    select r.id, r.tenant_id, r.instance_id, 'orphaned_resource'::text,
      jsonb_build_object('provider',f.provider,'resource_kind',f.resource_kind,
        'external_id',f.external_id,'deployment_state',i.deployment_state)
    from control_plane.instance_infrastructure f
    join app.instances i on i.tenant_id = f.tenant_id and i.id = f.instance_id
    join control_plane.provisioning_runs r
      on r.tenant_id = f.tenant_id and r.instance_id = f.instance_id
    where i.deployment_state in ('suspended','closed')
      and coalesce(f.desired_state->>'active','true') <> 'false'
  union all
    -- Nobody has touched this run in a while and it is not finished.
    select r.id, r.tenant_id, r.instance_id, 'stalled'::text,
      jsonb_build_object('state',r.state,'updated_at',r.updated_at)
    from control_plane.provisioning_runs r
    where r.state not in ('active','deactivated')
      and r.waiting_reason is null
      and r.updated_at < v_now - p_stale_after
  union all
    -- A step that has spent its retry budget. Only an operator can decide what
    -- happens next, so this is reported rather than retried.
    select r.id, r.tenant_id, r.instance_id, 'attempts_exhausted'::text,
      jsonb_build_object('step_key',s.step_key,'attempts',s.attempts,
        'error_code',s.last_error_code)
    from control_plane.provisioning_steps s
    join control_plane.provisioning_runs r on r.id = s.run_id
    where s.status = 'failed' and s.attempts >= s.max_attempts
  union all
    -- An active instance whose infrastructure nobody has looked at recently.
    select r.id, r.tenant_id, r.instance_id, 'stale_observation'::text,
      jsonb_build_object('provider',f.provider,'external_id',f.external_id,
        'observed_at',f.observed_at)
    from control_plane.instance_infrastructure f
    join control_plane.provisioning_runs r
      on r.tenant_id = f.tenant_id and r.instance_id = f.instance_id
    where r.state = 'active'
      and (f.observed_at is null or f.observed_at < v_now - p_stale_after)
  order by 1,4,5;
end;
$function$;

-- The timeline, for an operator reading it afterwards. Sanitized by
-- construction: every column it returns is a code, an identifier or a count.
create or replace function control_plane.get_provisioning_run_v1(p_run_id uuid)
returns table (
  state text, waiting_reason text, slug text, desired_release text,
  last_error_code text, steps jsonb, timeline jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not (control_plane.is_operator_v1('viewer') or control_plane.is_worker_v1()) then
    raise exception using errcode='42501',message='policy_denied';
  end if;

  return query
  select r.state, r.waiting_reason, r.slug, r.desired_release, r.last_error_code,
    coalesce((select jsonb_agg(jsonb_build_object(
        'step_key',s.step_key,'order',s.step_order,'status',s.status,
        'attempts',s.attempts,'max_attempts',s.max_attempts,
        'provider',s.provider,'external_id',s.external_id,
        'waiting_reason',s.waiting_reason,'error_code',s.last_error_code,
        'retry_after',s.retry_after)
      order by s.step_order)
      from control_plane.provisioning_steps s where s.run_id = r.id),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
        'at',e.occurred_at,'event',e.event,'step_key',e.step_key,
        'attempt',e.attempt,'error_code',e.error_code,'detail',e.detail)
      order by e.id)
      from control_plane.provisioning_events e where e.run_id = r.id),'[]'::jsonb)
  from control_plane.provisioning_runs r
  where r.id = p_run_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------

revoke all on function
  control_plane.backend_contract_version_v1(),
  control_plane.is_worker_v1(),
  control_plane.provisioning_state_rank_v1(text),
  control_plane.request_provisioning_v1(uuid,uuid,text,text,text,integer,integer,integer,jsonb,text),
  control_plane.claim_provisioning_step_v1(uuid,integer),
  control_plane.complete_provisioning_step_v1(uuid,text,text,jsonb,text,text,timestamptz),
  control_plane.retry_provisioning_run_v1(uuid),
  control_plane.activate_instance_v1(uuid),
  control_plane.deactivate_instance_v1(uuid,text),
  control_plane.reconcile_provisioning_v1(interval),
  control_plane.get_provisioning_run_v1(uuid)
from public, anon, authenticated;

grant execute on function
  control_plane.backend_contract_version_v1(),
  control_plane.is_worker_v1(),
  control_plane.provisioning_state_rank_v1(text),
  control_plane.request_provisioning_v1(uuid,uuid,text,text,text,integer,integer,integer,jsonb,text),
  control_plane.claim_provisioning_step_v1(uuid,integer),
  control_plane.complete_provisioning_step_v1(uuid,text,text,jsonb,text,text,timestamptz),
  control_plane.retry_provisioning_run_v1(uuid),
  control_plane.activate_instance_v1(uuid),
  control_plane.deactivate_instance_v1(uuid,text),
  control_plane.reconcile_provisioning_v1(interval),
  control_plane.get_provisioning_run_v1(uuid)
to service_role;
