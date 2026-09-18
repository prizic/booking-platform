-- Issue #32: later Vercel provisioning steps must use the project identity
-- created by `create_projects`, never reconstruct it from a mutable name or
-- slug. Both project IDs are recorded together so `configure_environment`,
-- `deploy_applications`, and `verify_domains` always act on the same pair.

create or replace function control_plane.vercel_projects_for_run_v1(p_run_id uuid)
returns table (
  client_project_id text,
  dashboard_project_id text,
  client_project_name text,
  dashboard_project_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not control_plane.is_worker_v1() then
    raise exception using errcode='42501',message='policy_denied';
  end if;

  return query
  select s.observed_state->>'client_project_id',
    s.observed_state->>'dashboard_project_id',
    s.observed_state->>'client_project_name',
    s.observed_state->>'dashboard_project_name'
  from control_plane.provisioning_steps s
  where s.run_id=p_run_id
    and s.step_key='create_projects'
    and s.status='succeeded'
    and coalesce(s.observed_state->>'client_project_id','') ~ '^prj_[A-Za-z0-9]{1,60}$'
    and coalesce(s.observed_state->>'dashboard_project_id','') ~ '^prj_[A-Za-z0-9]{1,60}$';
end;
$function$;

revoke all on function control_plane.vercel_projects_for_run_v1(uuid)
  from public,anon,authenticated;
