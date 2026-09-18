-- Issue #41. Nothing in this schema creates a tenant. Every existing
-- function — request_provisioning_v1 included — assumes app.tenants and
-- app.instances rows already exist. create_tenant_v1 is that missing first
-- step: the one action that originates a tenant, gated at 'admin' rather
-- than the 'operator' floor everything else here uses, because there is no
-- narrower-scoped tenant to check permissions against yet.
create or replace function control_plane.create_tenant_v1(p_name text, p_brand_key text)
returns table (brand_id uuid, instance_id uuid, tenant_id uuid)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_tenant_id uuid;
  v_brand_id uuid;
  v_instance_id uuid;
begin
  if not control_plane.is_operator_v1('admin') then
    raise exception using errcode='42501',message='policy_denied';
  end if;

  if p_name is null or pg_catalog.btrim(p_name) = ''
     or pg_catalog.char_length(pg_catalog.btrim(p_name)) > 160 then
    raise exception using errcode='22023',message='tenant_name_invalid';
  end if;
  if p_brand_key is null
     or p_brand_key !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception using errcode='22023',message='brand_key_invalid';
  end if;

  insert into app.tenants(id,name,status)
  values (pg_catalog.gen_random_uuid(),pg_catalog.btrim(p_name),'active')
  returning id into v_tenant_id;

  insert into app.brands(id,tenant_id,key,status)
  values (pg_catalog.gen_random_uuid(),v_tenant_id,p_brand_key,'active')
  returning id into v_brand_id;

  -- 'provisioning' until request_provisioning_v1 and its worker chain take
  -- this instance the rest of the way to 'active'; instances_check already
  -- refuses 'active' without a published brand revision.
  insert into app.instances(id,tenant_id,brand_id,deployment_state)
  values (pg_catalog.gen_random_uuid(),v_tenant_id,v_brand_id,'provisioning')
  returning id into v_instance_id;

  return query select v_brand_id,v_instance_id,v_tenant_id;
end;
$function$;

revoke all on function control_plane.create_tenant_v1(text,text) from public,anon,authenticated;

create or replace function api_v1.create_tenant_v1(p_name text, p_brand_key text)
returns table (brand_id uuid, instance_id uuid, tenant_id uuid)
language sql
set search_path to ''
as $function$
  select * from control_plane.create_tenant_v1(p_name,p_brand_key);
$function$;

revoke all on function api_v1.create_tenant_v1(text,text) from public,anon;
grant execute on function api_v1.create_tenant_v1(text,text) to authenticated;

-- Platform Admin talks to Postgres only through the exposed api_v1 schema,
-- like every other surface in this platform — it has no privileged direct
-- connection. control_plane.request_provisioning_v1 already does its own
-- authorization (is_operator_v1) and validation; this is the thin, ungated
-- pass-through that makes it reachable over PostgREST, matching the exact
-- shape api_v1.advance_tenant_offboarding_v1 already uses for the same
-- reason.
create or replace function api_v1.request_provisioning_v1(
  p_tenant_id uuid, p_instance_id uuid, p_slug text, p_plan_key text,
  p_desired_release text, p_config_schema_version integer,
  p_backend_contract_min integer, p_backend_contract_max integer,
  p_request jsonb, p_idempotency_key text
)
returns table (run_id uuid, state text, rejected text[])
language sql
set search_path to ''
as $function$
  select * from control_plane.request_provisioning_v1(
    p_tenant_id,p_instance_id,p_slug,p_plan_key,p_desired_release,
    p_config_schema_version,p_backend_contract_min,p_backend_contract_max,
    p_request,p_idempotency_key);
$function$;

revoke all on function api_v1.request_provisioning_v1(
  uuid,uuid,text,text,text,integer,integer,integer,jsonb,text) from public,anon;
grant execute on function api_v1.request_provisioning_v1(
  uuid,uuid,text,text,text,integer,integer,integer,jsonb,text) to authenticated;
