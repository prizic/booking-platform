create or replace function control_plane.retry_provisioning_run_v1(p_run_id uuid)
returns table (run_state text, steps_reset integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_operator uuid;
  v_run control_plane.provisioning_runs%rowtype;
  v_reset integer;
  v_state text;
begin
  perform control_plane.require_operator_v1('operator');
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
  perform control_plane.require_operator_v1('operator');
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
    if v_existing.idempotency_key is distinct from p_idempotency_key
       or v_existing.request is distinct from v_request
       or v_existing.requested_by is distinct from v_operator
       or v_existing.slug is distinct from p_slug
       or v_existing.plan_key is distinct from p_plan_key
       or v_existing.desired_release is distinct from p_desired_release
       or v_existing.config_schema_version is distinct from p_config_schema_version
       or v_existing.backend_contract_min is distinct from p_backend_contract_min
       or v_existing.backend_contract_max is distinct from p_backend_contract_max then
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

-- Platform Admin completion, part 3: jobs, provisioning, instances, domains.
--
-- Jobs gain an event timeline, idempotency keys, cancellation and retry, and a
-- worker-only claim/complete pair so the boundary an external worker will use
-- is real and tested even where no worker runs yet. A queued job that no worker
-- has claimed is shown as exactly that; nothing here marks external work done.
--
-- Also fixes 20260930160000: execute_local_provisioning_steps_v1 parks steps
-- with waiting_reason 'worker_not_implemented', which the check constraints on
-- provisioning_steps and provisioning_runs did not allow.

-- ---------------------------------------------------------------------------
-- 0. Waiting-reason fix
-- ---------------------------------------------------------------------------
do $$
declare v_table text; v_name text;
begin
  foreach v_table in array array['provisioning_steps','provisioning_runs'] loop
    select c.conname into v_name from pg_catalog.pg_constraint c
    where c.conrelid = ('control_plane.' || v_table)::regclass and c.contype = 'c'
      and pg_catalog.pg_get_constraintdef(c.oid) like '%customer_dns%';
    execute format('alter table control_plane.%I drop constraint %I', v_table, v_name);
    execute format('alter table control_plane.%I add constraint %I check (waiting_reason is null or waiting_reason in '
      '(''customer_dns'',''external_approval'',''provider_rate_limit'',''provider_outage'',''worker_not_implemented''))',
      v_table, v_table || '_waiting_reason_check');
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Jobs: kinds, keys, cancellation, events
-- ---------------------------------------------------------------------------
do $$
declare v_name text;
begin
  select c.conname into v_name from pg_catalog.pg_constraint c
  where c.conrelid = 'control_plane.jobs'::regclass and c.contype = 'c'
    and pg_catalog.pg_get_constraintdef(c.oid) like '%provision_instance%';
  execute format('alter table control_plane.jobs drop constraint %I', v_name);

  select c.conname into v_name from pg_catalog.pg_constraint c
  where c.conrelid = 'control_plane.jobs'::regclass and c.contype = 'c'
    and pg_catalog.pg_get_constraintdef(c.oid) like '%approved_by IS NOT NULL%';
  execute format('alter table control_plane.jobs drop constraint %I', v_name);
end $$;

alter table control_plane.jobs
  add constraint jobs_kind_check check (kind in (
    'provision_instance','seed_repository','provision_domains','publish_release',
    'rotate_secret','suspend_instance','close_instance','reconcile_drift',
    'verify_domain','check_integration')),
  -- Cancelling an unapproved destructive job must be possible: it is the safe way out.
  add constraint jobs_destructive_approval_check check (
    kind not in ('close_instance','rotate_secret') or approved_by is not null
    or status in ('queued','cancelled')),
  add column idempotency_key text unique
    check (idempotency_key is null or idempotency_key ~ '^[A-Za-z0-9:_.-]{8,200}$'),
  add column started_at timestamptz,
  add column cancelled_by uuid,
  add column cancelled_at timestamptz,
  add column reason text check (reason is null or pg_catalog.char_length(reason) between 1 and 500);
alter table control_plane.jobs add constraint jobs_text_no_secrets check (
  control_plane.contains_no_secret_v1(pg_catalog.jsonb_build_object(
    'kind',kind,'reason',reason,'last_error_code',last_error_code,'idempotency_key',idempotency_key)));
create index jobs_status_created_idx on control_plane.jobs (status, created_at desc);

create table control_plane.job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references control_plane.jobs(id) on delete restrict,
  event text not null check (event in (
    'enqueued','approved','claimed','succeeded','failed','retried','cancelled')),
  attempt integer check (attempt is null or attempt >= 0),
  error_code text check (error_code is null or pg_catalog.char_length(error_code) between 1 and 80),
  actor_id uuid,
  occurred_at timestamptz not null default pg_catalog.statement_timestamp()
);
alter table control_plane.job_events add constraint job_events_text_no_secrets check (
  control_plane.contains_no_secret_v1(pg_catalog.jsonb_build_object('event',event,'error_code',error_code)));
create index job_events_job_idx on control_plane.job_events (job_id, id);
create trigger job_events_append_only
  before update or delete on control_plane.job_events
  for each row execute function private.enforce_append_only();
alter table control_plane.job_events enable row level security;
create policy job_events_no_application_access on control_plane.job_events
  for all to anon,authenticated using (false) with check (false);
revoke all on control_plane.job_events from public,anon,authenticated;

create or replace function control_plane.enqueue_operator_job_v1(
  p_operator uuid, p_kind text, p_tenant_id uuid, p_instance_id uuid,
  p_parameters jsonb, p_idempotency_key text, p_reason text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  if not control_plane.contains_no_secret_v1(coalesce(p_parameters,'{}'::jsonb)) then
    raise exception using errcode='22023',message='secret_rejected';
  end if;
  insert into control_plane.jobs(kind,tenant_id,instance_id,parameters,requested_by,idempotency_key,reason)
  values (p_kind,p_tenant_id,p_instance_id,coalesce(p_parameters,'{}'::jsonb),p_operator,
    p_idempotency_key,nullif(pg_catalog.btrim(p_reason),''))
  on conflict (idempotency_key) do nothing
  returning id into v_id;
  if v_id is null then
    select j.id into v_id from control_plane.jobs j where j.idempotency_key = p_idempotency_key
      and j.requested_by is not distinct from p_operator and j.kind is not distinct from p_kind
      and j.tenant_id is not distinct from p_tenant_id and j.instance_id is not distinct from p_instance_id
      and j.parameters is not distinct from coalesce(p_parameters,'{}'::jsonb)
      and j.reason is not distinct from nullif(pg_catalog.btrim(p_reason),'');
    if v_id is null then
      raise exception using errcode='23505',message='idempotency_conflict';
    end if;
    return v_id;
  end if;
  insert into control_plane.job_events(job_id,event,actor_id) values (v_id,'enqueued',p_operator);
  perform control_plane.write_audit_v1(p_operator,'job.enqueued',p_tenant_id,p_instance_id,'job',
    v_id::text,p_reason,pg_catalog.jsonb_build_object('kind',p_kind,'job_id',v_id));
  return v_id;
end;
$function$;

create or replace function control_plane.list_jobs_v1(
  p_status text default null, p_kind text default null, p_tenant_id uuid default null,
  p_limit integer default 25, p_offset integer default 0)
returns table (job_id uuid, kind text, status text, tenant_id uuid, tenant_name text,
  instance_id uuid, attempts integer, last_error_code text, requested_by_email text,
  approved_by_email text, needs_approval boolean, created_at timestamptz,
  updated_at timestamptz, completed_at timestamptz, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  select j.id, j.kind, j.status, j.tenant_id, t.name, j.instance_id, j.attempts, j.last_error_code,
    ro.email, ao.email,
    (j.kind in ('close_instance','rotate_secret') and j.approved_by is null and j.status = 'queued'),
    j.created_at, j.updated_at, j.completed_at, pg_catalog.count(*) over ()
  from control_plane.jobs j
  left join app.tenants t on t.id = j.tenant_id
  left join control_plane.operators ro on ro.auth_user_id = j.requested_by
  left join control_plane.operators ao on ao.auth_user_id = j.approved_by
  where (p_status is null or j.status = p_status
         or (p_status = 'awaiting_approval' and j.kind in ('close_instance','rotate_secret')
             and j.approved_by is null and j.status = 'queued'))
    and (p_kind is null or j.kind = p_kind)
    and (p_tenant_id is null or j.tenant_id = p_tenant_id)
  order by j.created_at desc, j.id
  limit least(greatest(coalesce(p_limit,25),1),100) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function control_plane.get_job_v1(p_job_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_doc jsonb;
begin
  perform control_plane.require_operator_v1('viewer');
  select pg_catalog.jsonb_build_object(
    'id',j.id,'kind',j.kind,'status',j.status,'tenant_id',j.tenant_id,'tenant_name',t.name,
    'instance_id',j.instance_id,'attempts',j.attempts,'last_error_code',j.last_error_code,
    'parameters',control_plane.audit_detail_summary_v1(j.parameters),
    'requested_by_email',ro.email,'approved_by_email',ao.email,'reason',j.reason,
    'needs_approval',j.kind in ('close_instance','rotate_secret') and j.approved_by is null and j.status = 'queued',
    'locked_until',j.locked_until,'created_at',j.created_at,'started_at',j.started_at,
    'updated_at',j.updated_at,'completed_at',j.completed_at,'cancelled_at',j.cancelled_at,
    'events',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'event',e.event,'attempt',e.attempt,'error_code',e.error_code,
        'actor_email',eo.email,'at',e.occurred_at) order by e.id)
      from control_plane.job_events e
      left join control_plane.operators eo on eo.auth_user_id = e.actor_id
      where e.job_id = j.id),'[]'::jsonb))
  into v_doc
  from control_plane.jobs j
  left join app.tenants t on t.id = j.tenant_id
  left join control_plane.operators ro on ro.auth_user_id = j.requested_by
  left join control_plane.operators ao on ao.auth_user_id = j.approved_by
  where j.id = p_job_id;
  if v_doc is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  return v_doc;
end;
$function$;

create or replace function control_plane.cancel_job_v1(p_job_id uuid, p_reason text)
returns table (job_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_job control_plane.jobs%rowtype;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_operator := control_plane.require_operator_v1('operator');
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  select * into v_job from control_plane.jobs j where j.id = p_job_id for update;
  if v_job.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if v_job.status = 'running' then
    raise exception using errcode='22023',message='job_running';
  end if;
  if v_job.status not in ('queued','failed') then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  update control_plane.jobs j set status = 'cancelled', cancelled_by = v_operator,
    cancelled_at = v_now, locked_until = null, updated_at = v_now
  where j.id = p_job_id;
  insert into control_plane.job_events(job_id,event,actor_id) values (p_job_id,'cancelled',v_operator);
  perform control_plane.write_audit_v1(v_operator,'job.cancelled',v_job.tenant_id,v_job.instance_id,
    'job',p_job_id::text,p_reason,pg_catalog.jsonb_build_object('kind',v_job.kind,'from',v_job.status));
  return query select p_job_id,'cancelled'::text;
end;
$function$;

create or replace function control_plane.retry_job_v1(p_job_id uuid, p_reason text)
returns table (job_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_job control_plane.jobs%rowtype;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_operator := control_plane.require_operator_v1('operator');
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  select * into v_job from control_plane.jobs j where j.id = p_job_id for update;
  if v_job.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if v_job.status <> 'failed' then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  if v_job.attempts >= 20 then
    raise exception using errcode='22023',message='attempts_exhausted';
  end if;
  -- A destructive job that failed is re-approved, not silently re-run.
  update control_plane.jobs j set status = 'queued', locked_until = null, last_error_code = null,
    completed_at = null, updated_at = v_now,
    approved_by = case when j.kind in ('close_instance','rotate_secret') then null else j.approved_by end
  where j.id = p_job_id;
  insert into control_plane.job_events(job_id,event,actor_id,attempt) values (p_job_id,'retried',v_operator,v_job.attempts);
  perform control_plane.write_audit_v1(v_operator,'job.retried',v_job.tenant_id,v_job.instance_id,
    'job',p_job_id::text,p_reason,pg_catalog.jsonb_build_object('kind',v_job.kind));
  return query select p_job_id,'queued'::text;
end;
$function$;

create or replace function control_plane.approve_operator_job_v1(p_job_id uuid)
returns table (job_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  perform control_plane.approve_job_v1(p_job_id);
  insert into control_plane.job_events(job_id,event,actor_id) values (p_job_id,'approved',v_operator);
  return query select p_job_id,'queued'::text;
end;
$function$;

-- The worker side. Destructive jobs are claimable only once approved.
create or replace function control_plane.claim_job_v1(p_kinds text[] default null, p_lock_seconds integer default 300)
returns table (job_id uuid, kind text, tenant_id uuid, instance_id uuid, parameters jsonb, attempt integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_job control_plane.jobs%rowtype;
begin
  if not control_plane.is_worker_v1() then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  select * into v_job from control_plane.jobs j
  where (j.status = 'queued' or (j.status = 'running' and j.locked_until < v_now))
    and (p_kinds is null or j.kind = any(p_kinds))
    and (j.kind not in ('close_instance','rotate_secret') or j.approved_by is not null)
    and j.attempts < 20
  order by j.created_at
  for update skip locked
  limit 1;
  if v_job.id is null then
    return;
  end if;
  update control_plane.jobs j set status = 'running', attempts = j.attempts + 1,
    started_at = coalesce(j.started_at,v_now),
    locked_until = v_now + pg_catalog.make_interval(secs => greatest(coalesce(p_lock_seconds,300),30)),
    updated_at = v_now
  where j.id = v_job.id
  returning * into v_job;
  insert into control_plane.job_events(job_id,event,attempt) values (v_job.id,'claimed',v_job.attempts);
  return query select v_job.id,v_job.kind,v_job.tenant_id,v_job.instance_id,v_job.parameters,v_job.attempts;
end;
$function$;

create or replace function control_plane.complete_job_v1(p_job_id uuid, p_outcome text, p_error_code text default null)
returns table (job_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_job control_plane.jobs%rowtype;
begin
  if not control_plane.is_worker_v1() then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if p_outcome not in ('succeeded','failed')
     or (p_error_code is not null and p_error_code !~ '^[a-z][a-z0-9_]{2,60}$') then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  select * into v_job from control_plane.jobs j where j.id = p_job_id for update;
  if v_job.id is null or v_job.status <> 'running' then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  if p_outcome = 'succeeded' and v_job.kind = 'verify_domain' and not exists (
    select 1 from app.tenant_domains d where d.id::text = v_job.parameters->>'domain_id'
      and d.tenant_id = v_job.tenant_id and d.instance_id = v_job.instance_id
      and d.verification_status = 'verified' and d.verified_at is not null) then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  update control_plane.jobs j set status = p_outcome, locked_until = null,
    last_error_code = case when p_outcome = 'failed' then coalesce(p_error_code,'unknown_error') end,
    completed_at = case when p_outcome = 'succeeded' then v_now end, updated_at = v_now
  where j.id = p_job_id;
  insert into control_plane.job_events(job_id,event,attempt,error_code)
  values (p_job_id,p_outcome,v_job.attempts,p_error_code);
  return query select p_job_id,p_outcome;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Provisioning reads and operator actions
-- ---------------------------------------------------------------------------
create or replace function control_plane.list_provisioning_runs_v1(
  p_state text default null, p_tenant_id uuid default null, p_search text default null,
  p_limit integer default 25, p_offset integer default 0)
returns table (run_id uuid, tenant_id uuid, tenant_name text, instance_id uuid, slug text,
  plan_key text, state text, waiting_reason text, last_error_code text, desired_release text,
  steps_total bigint, steps_succeeded bigint, steps_failed bigint,
  created_at timestamptz, updated_at timestamptz, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  select r.id, r.tenant_id, t.name, r.instance_id, r.slug, r.plan_key, r.state, r.waiting_reason,
    r.last_error_code, r.desired_release,
    (select pg_catalog.count(*) from control_plane.provisioning_steps s where s.run_id = r.id),
    (select pg_catalog.count(*) from control_plane.provisioning_steps s where s.run_id = r.id and s.status = 'succeeded'),
    (select pg_catalog.count(*) from control_plane.provisioning_steps s where s.run_id = r.id and s.status = 'failed'),
    r.created_at, r.updated_at, pg_catalog.count(*) over ()
  from control_plane.provisioning_runs r
  join app.tenants t on t.id = r.tenant_id
  where (p_state is null or r.state = p_state
         or (p_state = 'waiting' and r.waiting_reason is not null)
         or (p_state = 'in_progress' and r.state not in ('active','failed','deactivated')
             and r.waiting_reason is null))
    and (p_tenant_id is null or r.tenant_id = p_tenant_id)
    and (coalesce(pg_catalog.btrim(p_search),'') = ''
      or pg_catalog.strpos(r.slug, pg_catalog.lower(pg_catalog.btrim(p_search))) > 0
      or pg_catalog.strpos(pg_catalog.lower(t.name), pg_catalog.lower(pg_catalog.btrim(p_search))) > 0)
  order by r.updated_at desc, r.id
  limit least(greatest(coalesce(p_limit,25),1),100) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function control_plane.get_provisioning_run_detail_v1(p_run_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_doc jsonb;
begin
  perform control_plane.require_operator_v1('viewer');
  select pg_catalog.jsonb_build_object(
    'id',r.id,'tenant_id',r.tenant_id,'tenant_name',t.name,'instance_id',r.instance_id,
    'slug',r.slug,'plan_key',r.plan_key,'state',r.state,'waiting_reason',r.waiting_reason,
    'last_error_code',r.last_error_code,'desired_release',r.desired_release,
    'config_schema_version',r.config_schema_version,
    'backend_contract_min',r.backend_contract_min,'backend_contract_max',r.backend_contract_max,
    'requested_by_email',o.email,'activated_at',r.activated_at,'deactivated_at',r.deactivated_at,
    'deactivation_reason',r.deactivation_reason,'created_at',r.created_at,'updated_at',r.updated_at,
    'steps',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'step_key',s.step_key,'order',s.step_order,'provider',s.provider,'required',s.required,
        'status',s.status,'attempts',s.attempts,'max_attempts',s.max_attempts,
        'external_id',s.external_id,'waiting_reason',s.waiting_reason,'error_code',s.last_error_code,
        'retry_after',s.retry_after,'locked_until',s.locked_until,'started_at',s.started_at,
        'last_success_at',s.last_success_at,'updated_at',s.updated_at) order by s.step_order)
      from control_plane.provisioning_steps s where s.run_id = r.id),'[]'::jsonb),
    'timeline',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'at',e.occurred_at,'event',e.event,'step_key',e.step_key,'attempt',e.attempt,
        'error_code',e.error_code,'detail',control_plane.audit_detail_summary_v1(e.detail)) order by e.id)
      from control_plane.provisioning_events e where e.run_id = r.id),'[]'::jsonb))
  into v_doc
  from control_plane.provisioning_runs r
  join app.tenants t on t.id = r.tenant_id
  left join control_plane.operators o on o.auth_user_id = r.requested_by
  where r.id = p_run_id;
  if v_doc is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  return v_doc;
end;
$function$;

create or replace function control_plane.activate_provisioned_instance_v1(p_run_id uuid)
returns table (activated boolean, run_state text, blocked text[])
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_result record;
  v_run control_plane.provisioning_runs%rowtype;
begin
  v_operator := control_plane.require_operator_v1('operator');
  select * into v_run from control_plane.provisioning_runs r where r.id = p_run_id;
  if v_run.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  select a.activated, a.run_state, a.blocked into v_result
  from control_plane.activate_instance_v1(p_run_id) a;
  perform control_plane.write_audit_v1(v_operator,'provisioning.activation_requested',
    v_run.tenant_id,v_run.instance_id,'provisioning_run',p_run_id::text,null,
    pg_catalog.jsonb_build_object('blocked',pg_catalog.to_jsonb(v_result.blocked)),
    case when v_result.activated then 'succeeded' else 'failed' end);
  return query select v_result.activated, v_result.run_state, v_result.blocked;
end;
$function$;

create or replace function control_plane.deactivate_provisioned_instance_v1(p_run_id uuid, p_reason text)
returns table (run_state text, resources_deactivated integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 10 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  -- deactivate_instance_v1 writes its own audit row with the reason.
  return query select * from control_plane.deactivate_instance_v1(p_run_id,p_reason);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Health observations (written by workers; read in part 6)
-- ---------------------------------------------------------------------------
create table control_plane.health_observations (
  id bigint generated always as identity primary key,
  subject_kind text not null check (subject_kind in ('instance','integration')),
  tenant_id uuid references app.tenants(id) on delete restrict,
  instance_id uuid,
  subject_key text not null check (subject_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  signal text not null check (signal ~ '^[a-z][a-z0-9_]{1,40}$'),
  status text not null check (status in ('healthy','degraded','failing')),
  error_code text check (error_code is null or error_code ~ '^[a-z][a-z0-9_]{2,60}$'),
  detail jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(detail) = 'object'),
  observed_at timestamptz not null,
  recorded_at timestamptz not null default pg_catalog.statement_timestamp(),
  foreign key (tenant_id,instance_id) references app.instances(tenant_id,id) on delete restrict,
  check ((subject_kind = 'instance') = (instance_id is not null)),
  check (subject_kind <> 'instance' or tenant_id is not null),
  check (control_plane.contains_no_secret_v1(detail))
);
create index health_observations_latest_idx
  on control_plane.health_observations (subject_kind, instance_id, subject_key, signal, observed_at desc);
create trigger health_observations_append_only
  before update or delete on control_plane.health_observations
  for each row execute function private.enforce_append_only();
alter table control_plane.health_observations enable row level security;
create policy health_observations_no_application_access on control_plane.health_observations
  for all to anon,authenticated using (false) with check (false);
revoke all on control_plane.health_observations from public,anon,authenticated;

create or replace function control_plane.record_health_observation_v1(
  p_subject_kind text, p_tenant_id uuid, p_instance_id uuid, p_subject_key text,
  p_signal text, p_status text, p_error_code text, p_detail jsonb, p_observed_at timestamptz)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_id bigint;
begin
  if not control_plane.is_worker_v1() then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if not control_plane.contains_no_secret_v1(coalesce(p_detail,'{}'::jsonb)) then
    raise exception using errcode='22023',message='secret_rejected';
  end if;
  if p_observed_at is null or p_observed_at > pg_catalog.statement_timestamp() + interval '5 minutes' then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  insert into control_plane.health_observations(subject_kind,tenant_id,instance_id,subject_key,
    signal,status,error_code,detail,observed_at)
  values (p_subject_kind,p_tenant_id,p_instance_id,p_subject_key,p_signal,p_status,p_error_code,
    coalesce(p_detail,'{}'::jsonb),p_observed_at)
  returning id into v_id;
  return v_id;
end;
$function$;

-- Worst latest status across an instance's signals, or null when unobserved.
create or replace function control_plane.instance_health_v1(p_instance_id uuid)
returns table (status text, observed_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with latest as (
    select distinct on (h.subject_key,h.signal) h.status, h.observed_at
    from control_plane.health_observations h
    where h.subject_kind = 'instance' and h.instance_id = p_instance_id
    order by h.subject_key, h.signal, h.observed_at desc)
  select (select l.status from latest l
          order by case l.status when 'failing' then 1 when 'degraded' then 2 else 3 end limit 1),
         (select pg_catalog.min(l.observed_at) from latest l);
$$;

-- ---------------------------------------------------------------------------
-- 4. Instances
-- ---------------------------------------------------------------------------
create or replace function control_plane.list_instances_v1(
  p_search text default null, p_state text default null, p_ring text default null,
  p_drift boolean default null, p_limit integer default 25, p_offset integer default 0)
returns table (instance_id uuid, tenant_id uuid, tenant_name text, tenant_status text,
  deployment_state text, rollout_ring text, desired_release text, current_release text,
  release_drifted boolean, infrastructure_total bigint, infrastructure_failing bigint,
  infrastructure_drifted bigint, health_status text, health_observed_at timestamptz,
  created_at timestamptz, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  with base as (
    select i.id, i.tenant_id, t.name, t.status as tenant_status, i.deployment_state,
      s.rollout_ring, r.desired_release, r.current_release,
      (case when r.reported_at is null or r.current_release is null then null
        else r.desired_release is distinct from r.current_release end) as release_drifted,
      (select pg_catalog.count(*) from control_plane.instance_infrastructure f
        where f.tenant_id = i.tenant_id and f.instance_id = i.id) as infra_total,
      (select pg_catalog.count(*) from control_plane.instance_infrastructure f
        where f.tenant_id = i.tenant_id and f.instance_id = i.id and f.last_error_code is not null) as infra_failing,
      (select pg_catalog.count(*) from control_plane.instance_infrastructure f
        where f.tenant_id = i.tenant_id and f.instance_id = i.id
          and f.observed_at is not null
          and exists (select 1 from pg_catalog.jsonb_each(f.desired_state) d
                      where f.observed_state -> d.key is distinct from d.value)) as infra_drifted,
      h.status as health_status, h.observed_at as health_observed_at, i.created_at
    from app.instances i
    join app.tenants t on t.id = i.tenant_id
    left join control_plane.subscriptions s on s.tenant_id = i.tenant_id
    left join control_plane.instance_release_state r on r.tenant_id = i.tenant_id and r.instance_id = i.id
    left join lateral control_plane.instance_health_v1(i.id) h on true
  )
  select b.id, b.tenant_id, b.name, b.tenant_status, b.deployment_state, b.rollout_ring,
    b.desired_release, b.current_release, b.release_drifted, b.infra_total, b.infra_failing,
    b.infra_drifted, b.health_status, b.health_observed_at, b.created_at, pg_catalog.count(*) over ()
  from base b
  where (p_state is null or b.deployment_state = p_state)
    and (p_ring is null or b.rollout_ring = p_ring)
    and (p_drift is null or (p_drift = (b.release_drifted or b.infra_drifted > 0)))
    and (coalesce(pg_catalog.btrim(p_search),'') = ''
      or pg_catalog.strpos(pg_catalog.lower(b.name), pg_catalog.lower(pg_catalog.btrim(p_search))) > 0
      or b.id::text = pg_catalog.btrim(p_search))
  order by b.name, b.created_at, b.id
  limit least(greatest(coalesce(p_limit,25),1),100) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function control_plane.get_instance_v1(p_instance_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_doc jsonb;
begin
  perform control_plane.require_operator_v1('viewer');
  select pg_catalog.jsonb_build_object(
    'id',i.id,'tenant_id',i.tenant_id,'tenant_name',t.name,'deployment_state',i.deployment_state,
    'brand_published',i.published_brand_revision_id is not null,'created_at',i.created_at,
    'release',(select pg_catalog.jsonb_build_object('desired_release',r.desired_release,
        'current_release',r.current_release,'config_schema_version',r.config_schema_version,
        'customization_tier',r.customization_tier,'supported_backend_min',r.supported_backend_min,
        'supported_backend_max',r.supported_backend_max,
        'environment_verified',r.environment_fingerprint is not null,'reported_at',r.reported_at)
      from control_plane.instance_release_state r where r.tenant_id = i.tenant_id and r.instance_id = i.id),
    'infrastructure',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',f.id,'provider',f.provider,'resource_kind',f.resource_kind,'external_id',f.external_id,
        'desired_state',f.desired_state,'observed_state',f.observed_state,
        'drifted',case when f.observed_at is null then null
          else exists (select 1 from pg_catalog.jsonb_each(f.desired_state) d
                          where f.observed_state -> d.key is distinct from d.value) end,
        'observed_at',f.observed_at,'attempts',f.attempts,'last_success_at',f.last_success_at,
        'last_error_code',f.last_error_code) order by f.provider,f.resource_kind)
      from control_plane.instance_infrastructure f
      where f.tenant_id = i.tenant_id and f.instance_id = i.id),'[]'::jsonb),
    'health',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'subject_key',h.subject_key,'signal',h.signal,'status',h.status,'error_code',h.error_code,
        'observed_at',h.observed_at))
      from (select distinct on (h.subject_key,h.signal) h.*
            from control_plane.health_observations h
            where h.subject_kind = 'instance' and h.instance_id = i.id
            order by h.subject_key,h.signal,h.observed_at desc) h),'[]'::jsonb),
    'domains',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',d.id,'hostname',d.hostname,'application',d.application,'kind',d.kind,
        'verification_status',d.verification_status,'active',d.active) order by d.hostname)
      from app.tenant_domains d where d.tenant_id = i.tenant_id and d.instance_id = i.id),'[]'::jsonb),
    'runs',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',r.id,'state',r.state,'slug',r.slug,'updated_at',r.updated_at))
      from control_plane.provisioning_runs r where r.instance_id = i.id),'[]'::jsonb))
  into v_doc
  from app.instances i join app.tenants t on t.id = i.tenant_id
  where i.id = p_instance_id;
  if v_doc is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  return v_doc;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Domains
-- ---------------------------------------------------------------------------
create or replace function control_plane.list_domains_v1(
  p_search text default null, p_status text default null,
  p_limit integer default 25, p_offset integer default 0)
returns table (domain_id uuid, hostname text, tenant_id uuid, tenant_name text, instance_id uuid,
  application text, kind text, verification_status text, verified_at timestamptz, active boolean,
  certificate_status text, certificate_observed_at timestamptz, pending_job_id uuid,
  created_at timestamptz, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  select d.id, d.hostname, d.tenant_id, t.name, d.instance_id, d.application, d.kind,
    d.verification_status, d.verified_at, d.active,
    -- Only what a worker reported. Null renders as "Not reported".
    f.observed_state->>'certificate_status', f.observed_at,
    (select j.id from control_plane.jobs j where j.kind = 'verify_domain'
       and j.status in ('queued','running') and j.parameters->>'domain_id' = d.id::text
       order by j.created_at desc limit 1),
    d.created_at, pg_catalog.count(*) over ()
  from app.tenant_domains d
  join app.tenants t on t.id = d.tenant_id
  left join control_plane.instance_infrastructure f
    on f.provider = 'vercel' and f.resource_kind = 'domain' and f.tenant_id = d.tenant_id
   and f.observed_state->>'hostname' = d.hostname
  where (p_status is null or d.verification_status = p_status)
    and (coalesce(pg_catalog.btrim(p_search),'') = ''
      or pg_catalog.strpos(d.hostname, pg_catalog.lower(pg_catalog.btrim(p_search))) > 0
      or pg_catalog.strpos(pg_catalog.lower(t.name), pg_catalog.lower(pg_catalog.btrim(p_search))) > 0)
  order by d.hostname
  limit least(greatest(coalesce(p_limit,25),1),100) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function control_plane.request_domain_verification_v1(p_domain_id uuid)
returns table (job_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_domain app.tenant_domains%rowtype;
  v_existing uuid;
  v_attempt bigint;
begin
  v_operator := control_plane.require_operator_v1('operator');
  select * into v_domain from app.tenant_domains d where d.id = p_domain_id for update;
  if v_domain.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  select j.id into v_existing from control_plane.jobs j
  where j.kind = 'verify_domain' and j.status in ('queued','running')
    and j.parameters->>'domain_id' = p_domain_id::text
  limit 1;
  if v_existing is not null then
    return query select v_existing;
    return;
  end if;
  select pg_catalog.count(*) + 1 into v_attempt from control_plane.jobs j
  where j.kind = 'verify_domain' and j.parameters->>'domain_id' = p_domain_id::text;
  return query select control_plane.enqueue_operator_job_v1(v_operator,'verify_domain',
    v_domain.tenant_id,v_domain.instance_id,
    pg_catalog.jsonb_build_object('domain_id',p_domain_id,'hostname',v_domain.hostname),
    'verify_domain:' || p_domain_id::text || ':' || v_attempt::text);
end;
$function$;

create or replace function control_plane.add_tenant_domain_v1(
  p_tenant_id uuid, p_instance_id uuid, p_hostname text, p_application text, p_idempotency_key text)
returns table (domain_id uuid, job_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_prior jsonb;
  v_request jsonb := pg_catalog.jsonb_build_object('tenant_id',p_tenant_id,'instance_id',p_instance_id,'hostname',pg_catalog.lower(pg_catalog.btrim(p_hostname)),'application',p_application);
  v_hostname text := pg_catalog.lower(pg_catalog.btrim(p_hostname));
  v_id uuid := pg_catalog.gen_random_uuid();
  v_job uuid;
begin
  v_operator := control_plane.require_operator_v1('operator');
  v_prior := control_plane.replay_request_v1(p_idempotency_key,'domain.add',v_request);
  if v_prior is not null then
    return query select (v_prior->>'domain_id')::uuid,(v_prior->>'job_id')::uuid;
    return;
  end if;
  if v_hostname is null or pg_catalog.char_length(v_hostname) not between 4 and 253
     or v_hostname !~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$' then
    raise exception using errcode='22023',message='hostname_invalid';
  end if;
  if p_application not in ('client','dashboard') then
    raise exception using errcode='22023',message='settings_invalid';
  end if;
  if not exists (select 1 from app.instances i where i.tenant_id = p_tenant_id and i.id = p_instance_id) then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if exists (select 1 from app.tenant_domains d where d.hostname = v_hostname) then
    raise exception using errcode='23505',message='domain_taken';
  end if;

  insert into app.tenant_domains(id,tenant_id,instance_id,hostname,application,kind,verification_status,active)
  values (v_id,p_tenant_id,p_instance_id,v_hostname,p_application,'production','pending',false);
  v_job := control_plane.enqueue_operator_job_v1(v_operator,'verify_domain',p_tenant_id,p_instance_id,
    pg_catalog.jsonb_build_object('domain_id',v_id,'hostname',v_hostname),
    'verify_domain:' || v_id::text || ':1');
  perform control_plane.write_audit_v1(v_operator,'domain.added',p_tenant_id,p_instance_id,'domain',
    v_id::text,null,pg_catalog.jsonb_build_object('hostname',v_hostname,'application',p_application));
  perform control_plane.remember_request_v1(p_idempotency_key,'domain.add',
    pg_catalog.jsonb_build_object('domain_id',v_id,'job_id',v_job),v_request);
  return query select v_id, v_job;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. api_v1 pass-throughs and grants
-- ---------------------------------------------------------------------------
create or replace function api_v1.list_jobs_v1(p_status text default null, p_kind text default null,
  p_tenant_id uuid default null, p_limit integer default 25, p_offset integer default 0)
returns table (job_id uuid, kind text, status text, tenant_id uuid, tenant_name text,
  instance_id uuid, attempts integer, last_error_code text, requested_by_email text,
  approved_by_email text, needs_approval boolean, created_at timestamptz,
  updated_at timestamptz, completed_at timestamptz, total_count bigint)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_jobs_v1(p_status,p_kind,p_tenant_id,p_limit,p_offset); $$;

create or replace function api_v1.get_job_v1(p_job_id uuid) returns jsonb
language sql security definer set search_path to ''
as $$ select control_plane.get_job_v1(p_job_id); $$;

create or replace function api_v1.cancel_job_v1(p_job_id uuid, p_reason text)
returns table (job_id uuid, status text)
language sql security definer set search_path to ''
as $$ select * from control_plane.cancel_job_v1(p_job_id,p_reason); $$;

create or replace function api_v1.retry_job_v1(p_job_id uuid, p_reason text)
returns table (job_id uuid, status text)
language sql security definer set search_path to ''
as $$ select * from control_plane.retry_job_v1(p_job_id,p_reason); $$;

create or replace function api_v1.approve_operator_job_v1(p_job_id uuid)
returns table (job_id uuid, status text)
language sql security definer set search_path to ''
as $$ select * from control_plane.approve_operator_job_v1(p_job_id); $$;

create or replace function api_v1.claim_job_v1(p_kinds text[] default null, p_lock_seconds integer default 300)
returns table (job_id uuid, kind text, tenant_id uuid, instance_id uuid, parameters jsonb, attempt integer)
language sql security definer set search_path to '' set statement_timeout to '20s'
as $$ select * from control_plane.claim_job_v1(p_kinds,p_lock_seconds); $$;

create or replace function api_v1.complete_job_v1(p_job_id uuid, p_outcome text, p_error_code text default null)
returns table (job_id uuid, status text)
language sql security definer set search_path to ''
as $$ select * from control_plane.complete_job_v1(p_job_id,p_outcome,p_error_code); $$;

create or replace function api_v1.list_provisioning_runs_v1(p_state text default null, p_tenant_id uuid default null,
  p_search text default null, p_limit integer default 25, p_offset integer default 0)
returns table (run_id uuid, tenant_id uuid, tenant_name text, instance_id uuid, slug text,
  plan_key text, state text, waiting_reason text, last_error_code text, desired_release text,
  steps_total bigint, steps_succeeded bigint, steps_failed bigint,
  created_at timestamptz, updated_at timestamptz, total_count bigint)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_provisioning_runs_v1(p_state,p_tenant_id,p_search,p_limit,p_offset); $$;

create or replace function api_v1.get_provisioning_run_detail_v1(p_run_id uuid) returns jsonb
language sql security definer set search_path to ''
as $$ select control_plane.get_provisioning_run_detail_v1(p_run_id); $$;

create or replace function api_v1.retry_provisioning_run_v1(p_run_id uuid)
returns table (run_state text, steps_reset integer)
language sql security definer set search_path to ''
as $$ select * from control_plane.retry_provisioning_run_v1(p_run_id); $$;

create or replace function api_v1.activate_provisioned_instance_v1(p_run_id uuid)
returns table (activated boolean, run_state text, blocked text[])
language sql security definer set search_path to ''
as $$ select * from control_plane.activate_provisioned_instance_v1(p_run_id); $$;

create or replace function api_v1.deactivate_provisioned_instance_v1(p_run_id uuid, p_reason text)
returns table (run_state text, resources_deactivated integer)
language sql security definer set search_path to ''
as $$ select * from control_plane.deactivate_provisioned_instance_v1(p_run_id,p_reason); $$;

create or replace function api_v1.list_instances_v1(p_search text default null, p_state text default null,
  p_ring text default null, p_drift boolean default null, p_limit integer default 25, p_offset integer default 0)
returns table (instance_id uuid, tenant_id uuid, tenant_name text, tenant_status text,
  deployment_state text, rollout_ring text, desired_release text, current_release text,
  release_drifted boolean, infrastructure_total bigint, infrastructure_failing bigint,
  infrastructure_drifted bigint, health_status text, health_observed_at timestamptz,
  created_at timestamptz, total_count bigint)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_instances_v1(p_search,p_state,p_ring,p_drift,p_limit,p_offset); $$;

create or replace function api_v1.get_instance_v1(p_instance_id uuid) returns jsonb
language sql security definer set search_path to ''
as $$ select control_plane.get_instance_v1(p_instance_id); $$;

create or replace function api_v1.list_domains_v1(p_search text default null, p_status text default null,
  p_limit integer default 25, p_offset integer default 0)
returns table (domain_id uuid, hostname text, tenant_id uuid, tenant_name text, instance_id uuid,
  application text, kind text, verification_status text, verified_at timestamptz, active boolean,
  certificate_status text, certificate_observed_at timestamptz, pending_job_id uuid,
  created_at timestamptz, total_count bigint)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_domains_v1(p_search,p_status,p_limit,p_offset); $$;

create or replace function api_v1.add_tenant_domain_v1(p_tenant_id uuid, p_instance_id uuid,
  p_hostname text, p_application text, p_idempotency_key text)
returns table (domain_id uuid, job_id uuid)
language sql security definer set search_path to ''
as $$ select * from control_plane.add_tenant_domain_v1(p_tenant_id,p_instance_id,p_hostname,p_application,p_idempotency_key); $$;

create or replace function api_v1.request_domain_verification_v1(p_domain_id uuid)
returns table (job_id uuid)
language sql security definer set search_path to ''
as $$ select * from control_plane.request_domain_verification_v1(p_domain_id); $$;

create or replace function api_v1.record_health_observation_v1(p_subject_kind text, p_tenant_id uuid,
  p_instance_id uuid, p_subject_key text, p_signal text, p_status text, p_error_code text,
  p_detail jsonb, p_observed_at timestamptz)
returns bigint
language sql security definer set search_path to ''
as $$ select control_plane.record_health_observation_v1(p_subject_kind,p_tenant_id,p_instance_id,p_subject_key,p_signal,p_status,p_error_code,p_detail,p_observed_at); $$;

revoke all on all functions in schema control_plane from public,anon,authenticated;
grant execute on function control_plane.contains_no_secret_v1(jsonb) to service_role;

revoke all on function
  api_v1.list_jobs_v1(text,text,uuid,integer,integer),
  api_v1.get_job_v1(uuid),
  api_v1.cancel_job_v1(uuid,text),
  api_v1.retry_job_v1(uuid,text),
  api_v1.approve_operator_job_v1(uuid),
  api_v1.claim_job_v1(text[],integer),
  api_v1.complete_job_v1(uuid,text,text),
  api_v1.list_provisioning_runs_v1(text,uuid,text,integer,integer),
  api_v1.get_provisioning_run_detail_v1(uuid),
  api_v1.retry_provisioning_run_v1(uuid),
  api_v1.activate_provisioned_instance_v1(uuid),
  api_v1.deactivate_provisioned_instance_v1(uuid,text),
  api_v1.list_instances_v1(text,text,text,boolean,integer,integer),
  api_v1.get_instance_v1(uuid),
  api_v1.list_domains_v1(text,text,integer,integer),
  api_v1.add_tenant_domain_v1(uuid,uuid,text,text,text),
  api_v1.request_domain_verification_v1(uuid),
  api_v1.record_health_observation_v1(text,uuid,uuid,text,text,text,text,jsonb,timestamptz)
from public, anon, authenticated;

grant execute on function
  api_v1.list_jobs_v1(text,text,uuid,integer,integer),
  api_v1.get_job_v1(uuid),
  api_v1.cancel_job_v1(uuid,text),
  api_v1.retry_job_v1(uuid,text),
  api_v1.approve_operator_job_v1(uuid),
  api_v1.list_provisioning_runs_v1(text,uuid,text,integer,integer),
  api_v1.get_provisioning_run_detail_v1(uuid),
  api_v1.retry_provisioning_run_v1(uuid),
  api_v1.activate_provisioned_instance_v1(uuid),
  api_v1.deactivate_provisioned_instance_v1(uuid,text),
  api_v1.list_instances_v1(text,text,text,boolean,integer,integer),
  api_v1.get_instance_v1(uuid),
  api_v1.list_domains_v1(text,text,integer,integer),
  api_v1.add_tenant_domain_v1(uuid,uuid,text,text,text),
  api_v1.request_domain_verification_v1(uuid)
to authenticated;

grant execute on function
  api_v1.claim_job_v1(text[],integer),
  api_v1.complete_job_v1(uuid,text,text),
  api_v1.record_health_observation_v1(text,uuid,uuid,text,text,text,text,jsonb,timestamptz)
to service_role;
