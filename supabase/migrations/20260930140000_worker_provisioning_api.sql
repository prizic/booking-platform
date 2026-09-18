-- The provisioning worker reaches Postgres the same way the notification
-- worker does: over PostgREST, which exposes api_v1 and nothing else. Its
-- three RPCs live in control_plane, so without wrappers they are simply not
-- addressable — service_role holding EXECUTE on them is irrelevant while the
-- schema itself is unexposed.
--
-- api_v1.claim_notification_batch_v1 is the model, with one difference: it
-- wraps private.*, where invoker rights suffice because service_role holds
-- USAGE on private. control_plane withholds USAGE, so these are definer
-- rights. Authorization is untouched — each inner function still calls
-- is_worker_v1(), which asserts the caller carries no authenticated user id,
-- and definer rights do not change the JWT it reads that from.
create or replace function api_v1.claim_provisioning_step_v1(
  p_run_id uuid default null, p_lock_seconds integer default 300)
returns table (
  step_id uuid, run_id uuid, tenant_id uuid, instance_id uuid, slug text,
  step_key text, step_order integer, provider text, resource_kind text,
  attempt integer, idempotency_key text, external_id text, request jsonb)
language sql
security definer
set search_path to ''
set statement_timeout to '20s'
as $function$
  select * from control_plane.claim_provisioning_step_v1(p_run_id,p_lock_seconds);
$function$;

create or replace function api_v1.complete_provisioning_step_v1(
  p_step_id uuid, p_outcome text, p_external_id text default null,
  p_observed_state jsonb default '{}'::jsonb, p_error_code text default null,
  p_waiting_reason text default null, p_retry_after timestamptz default null)
returns table (step_status text, run_state text, retry_at timestamptz, duplicate boolean)
language sql
security definer
set search_path to ''
as $function$
  select * from control_plane.complete_provisioning_step_v1(
    p_step_id,p_outcome,p_external_id,p_observed_state,p_error_code,
    p_waiting_reason,p_retry_after);
$function$;

create or replace function api_v1.github_repository_for_run_v1(p_run_id uuid)
returns table (repository_external_id text, repository_rest_id bigint,
               repository_name text, default_branch text)
language sql
security definer
set search_path to ''
as $function$
  select * from control_plane.github_repository_for_run_v1(p_run_id);
$function$;

revoke all on function api_v1.claim_provisioning_step_v1(uuid,integer) from public,anon,authenticated;
revoke all on function api_v1.complete_provisioning_step_v1(uuid,text,text,jsonb,text,text,timestamptz) from public,anon,authenticated;
revoke all on function api_v1.github_repository_for_run_v1(uuid) from public,anon,authenticated;
grant execute on function api_v1.claim_provisioning_step_v1(uuid,integer) to service_role;
grant execute on function api_v1.complete_provisioning_step_v1(uuid,text,text,jsonb,text,text,timestamptz) to service_role;
grant execute on function api_v1.github_repository_for_run_v1(uuid) to service_role;
