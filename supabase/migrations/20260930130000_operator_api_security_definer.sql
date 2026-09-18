-- The api_v1 wrappers added in 20260930120000 were modelled on
-- api_v1.advance_tenant_offboarding_v1, which wraps private.* and runs with
-- invoker rights. That works because `authenticated` holds USAGE on private.
-- It deliberately does not hold USAGE on control_plane — a tenant session
-- must not be able to so much as name that schema — so an invoker-rights
-- wrapper over control_plane.* fails with "permission denied for schema
-- control_plane" before it reaches any authorization check.
--
-- Definer rights supply schema reachability only. Authorization is unchanged:
-- both inner functions still call is_operator_v1() and is_aal2() themselves,
-- and SECURITY DEFINER does not alter the JWT those read the caller from.
create or replace function api_v1.create_tenant_v1(p_name text, p_brand_key text)
returns table (brand_id uuid, instance_id uuid, tenant_id uuid)
language sql
security definer
set search_path to ''
as $function$
  select * from control_plane.create_tenant_v1(p_name,p_brand_key);
$function$;

create or replace function api_v1.request_provisioning_v1(
  p_tenant_id uuid, p_instance_id uuid, p_slug text, p_plan_key text,
  p_desired_release text, p_config_schema_version integer,
  p_backend_contract_min integer, p_backend_contract_max integer,
  p_request jsonb, p_idempotency_key text
)
returns table (run_id uuid, state text, rejected text[])
language sql
security definer
set search_path to ''
as $function$
  select * from control_plane.request_provisioning_v1(
    p_tenant_id,p_instance_id,p_slug,p_plan_key,p_desired_release,
    p_config_schema_version,p_backend_contract_min,p_backend_contract_max,
    p_request,p_idempotency_key);
$function$;
