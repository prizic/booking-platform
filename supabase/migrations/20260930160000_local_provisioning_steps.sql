-- Steps 1 and 2 of the provisioning catalog had no implementation anywhere,
-- which meant a run could not advance past its first row: the github worker
-- claims whatever claim_provisioning_step_v1 hands it, sees a provider it does
-- not serve, and returns without completing the step — so the row sat 'running'
-- until its lock lapsed, forever.
--
-- Neither step calls anyone else's API. validate_request re-asserts what was
-- true at request time, and create_tenant_records writes rows in this very
-- database. A worker process for either would be a network hop, a credential
-- and a host to run it on, all to issue SQL. They run here instead, on cron.

-- 1. A worker must only be handed steps it can actually execute. Provider-blind
--    claiming is what stranded step 1. `local` names the provider-less steps.
drop function if exists control_plane.claim_provisioning_step_v1(uuid,integer);
create function control_plane.claim_provisioning_step_v1(
  p_run_id uuid default null,
  p_lock_seconds integer default 300,
  p_providers text[] default null
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
  if not control_plane.is_worker_v1() then
    raise exception using errcode='42501',message='policy_denied';
  end if;

  select s.* into v_step
  from control_plane.provisioning_steps s
  join control_plane.provisioning_runs r on r.id = s.run_id
  where (p_run_id is null or s.run_id = p_run_id)
    and (p_providers is null
         or coalesce(s.provider,'local') = any(p_providers))
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

-- 2. The executor for the steps that are pure database work.
create or replace function control_plane.execute_local_provisioning_steps_v1(
  p_limit integer default 10)
returns table (step_key text, outcome text, detail text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_step record;
  v_run control_plane.provisioning_runs%rowtype;
  v_instance app.instances%rowtype;
  v_domain jsonb;
  v_outcome text;
  v_detail text;
  v_count integer := 0;
begin
  if not control_plane.is_worker_v1() then
    raise exception using errcode='42501',message='policy_denied';
  end if;

  loop
    exit when v_count >= greatest(p_limit,1);
    select * into v_step from control_plane.claim_provisioning_step_v1(
      null, 120, array['local','supabase']);
    exit when v_step.step_id is null;
    v_count := v_count + 1;
    v_outcome := 'succeeded';
    v_detail := null;

    select * into v_run from control_plane.provisioning_runs r where r.id = v_step.run_id;
    select * into v_instance from app.instances i where i.id = v_step.instance_id;

    if v_step.step_key = 'validate_request' then
      -- What was true when the run was requested need not still be true when it
      -- is executed, so this asserts rather than assumes.
      if v_instance.id is null then
        v_outcome := 'failed'; v_detail := 'instance_unknown';
      elsif v_instance.deployment_state <> 'provisioning' then
        v_outcome := 'failed'; v_detail := 'instance_not_provisioning';
      elsif not exists (select 1 from control_plane.plans p
                        where p.key = v_run.plan_key and p.active) then
        v_outcome := 'failed'; v_detail := 'plan_unknown';
      elsif control_plane.backend_contract_version_v1()
            not between v_run.backend_contract_min and v_run.backend_contract_max then
        v_outcome := 'failed'; v_detail := 'backend_contract_incompatible';
      end if;

    elsif v_step.step_key = 'create_tenant_records' then
      -- The tenant, brand and instance rows already exist — create_tenant_v1
      -- makes those before a run is ever requested. What is missing is the
      -- state the later steps and activate_instance_v1 read: the release the
      -- instance is meant to be on, and the domains it is meant to answer for.
      insert into control_plane.instance_release_state(
        tenant_id,instance_id,desired_release,config_schema_version,
        supported_backend_min,supported_backend_max)
      values (v_step.tenant_id,v_step.instance_id,v_run.desired_release,
        v_run.config_schema_version,v_run.backend_contract_min,v_run.backend_contract_max)
      on conflict (tenant_id,instance_id) do update
        set desired_release = excluded.desired_release,
            config_schema_version = excluded.config_schema_version,
            supported_backend_min = excluded.supported_backend_min,
            supported_backend_max = excluded.supported_backend_max,
            updated_at = pg_catalog.statement_timestamp();

      -- Domains stay 'pending' here on purpose. verify_domains (step 10) is what
      -- may call them verified, and only after the provider says they resolve.
      for v_domain in
        select value from pg_catalog.jsonb_array_elements(
          case when pg_catalog.jsonb_typeof(v_run.request->'domains') = 'array'
               then v_run.request->'domains' else '[]'::jsonb end)
      loop
        insert into app.tenant_domains(
          id,tenant_id,instance_id,hostname,application,kind,verification_status,active)
        values (pg_catalog.gen_random_uuid(),v_step.tenant_id,v_step.instance_id,
          v_domain->>'hostname',v_domain->>'application','production','pending',false)
        on conflict do nothing;
      end loop;

    else
      -- health_check and generate_agent_pack are provider-less but are not SQL:
      -- one needs the network and the other a checkout. Parking them as waiting
      -- leaves them for the worker that will own them without spending an
      -- attempt or failing a run whose earlier steps genuinely succeeded.
      v_outcome := 'waiting'; v_detail := 'worker_not_implemented';
    end if;

    if v_outcome = 'waiting' then
      perform control_plane.complete_provisioning_step_v1(
        v_step.step_id,'waiting',null,'{}'::jsonb,null,v_detail,
        pg_catalog.statement_timestamp() + pg_catalog.make_interval(secs => 3600));
    else
      perform control_plane.complete_provisioning_step_v1(
        v_step.step_id, v_outcome, null, '{}'::jsonb, v_detail);
    end if;

    step_key := v_step.step_key; outcome := v_outcome; detail := v_detail;
    return next;
  end loop;
end;
$function$;

revoke all on function control_plane.execute_local_provisioning_steps_v1(integer)
from public, anon, authenticated;

-- 3. The api_v1 wrapper follows the claim's new signature.
create or replace function api_v1.claim_provisioning_step_v1(
  p_run_id uuid default null, p_lock_seconds integer default 300,
  p_providers text[] default null)
returns table (
  step_id uuid, run_id uuid, tenant_id uuid, instance_id uuid, slug text,
  step_key text, step_order integer, provider text, resource_kind text,
  attempt integer, idempotency_key text, external_id text, request jsonb)
language sql
security definer
set search_path to ''
set statement_timeout to '20s'
as $function$
  select * from control_plane.claim_provisioning_step_v1(
    p_run_id,p_lock_seconds,p_providers);
$function$;

revoke all on function api_v1.claim_provisioning_step_v1(uuid,integer,text[])
from public,anon,authenticated;
grant execute on function api_v1.claim_provisioning_step_v1(uuid,integer,text[])
to service_role;
