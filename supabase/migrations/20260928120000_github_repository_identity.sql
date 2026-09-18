-- Issue #31: later GitHub provisioning steps must use the immutable repository
-- identity created by the seed step, never reconstruct it from a mutable name.
-- The node ID is canonical because GitHub webhook payloads use it; the numeric
-- REST ID is retained only as safe observed metadata for a narrowly scoped
-- installation token.

create or replace function control_plane.github_repository_for_run_v1(p_run_id uuid)
returns table (
  repository_external_id text,
  repository_rest_id bigint,
  repository_name text,
  default_branch text
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
  select s.external_id,
    (s.observed_state->>'repository_rest_id')::bigint,
    s.observed_state->>'repository_name',
    s.observed_state->>'default_branch'
  from control_plane.provisioning_steps s
  where s.run_id=p_run_id
    and s.step_key='seed_repository'
    and s.status='succeeded'
    and s.external_id is not null
    and coalesce(s.observed_state->>'repository_rest_id','') ~ '^[1-9][0-9]{0,18}$'
    and coalesce(s.observed_state->>'repository_name','') ~ '^[A-Za-z0-9_.-]{1,100}$'
    and coalesce(s.observed_state->>'default_branch','') ~ '^[A-Za-z0-9._/-]{1,100}$';
end;
$function$;

revoke all on function control_plane.github_repository_for_run_v1(uuid)
  from public,anon,authenticated;
