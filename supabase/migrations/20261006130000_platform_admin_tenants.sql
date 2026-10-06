create or replace function control_plane.create_tenant_v1(p_name text, p_brand_key text)
returns table (brand_id uuid, instance_id uuid, tenant_id uuid)
language plpgsql
security definer
set search_path to ''
as $function$
#variable_conflict use_column
declare
  v_tenant_id uuid;
  v_brand_id uuid;
  v_instance_id uuid;
begin
  perform control_plane.require_operator_v1('admin');

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

  perform control_plane.write_audit_v1((select private.current_auth_user_id()),'tenant.created',
    v_tenant_id,v_instance_id,'tenant',v_tenant_id::text,null,
    pg_catalog.jsonb_build_object('name',pg_catalog.btrim(p_name),'brand_key',p_brand_key));
  return query select v_brand_id,v_instance_id,v_tenant_id;
end;
$function$;

-- Platform Admin completion, part 2: the tenant directory and lifecycle.
--
-- Suspension is real: every public tenant-context check already requires
-- app.tenants.status = 'active', so a suspended tenant's client stops resolving
-- on the next request. Reactivation restores it. Closure is not a status flip
-- here — it is a queued close_instance job per instance that a second admin
-- must approve (the existing two-person rule on control_plane.jobs), and
-- nothing in this file deletes a row.

create or replace function control_plane.create_tenant_v2(
  p_name text, p_brand_key text, p_idempotency_key text)
returns table (tenant_id uuid, brand_id uuid, instance_id uuid, replayed boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_prior jsonb;
  v_request jsonb := pg_catalog.jsonb_build_object('name',pg_catalog.btrim(p_name),'brand_key',p_brand_key);
  v_row record;
begin
  v_operator := control_plane.require_operator_v1('admin');
  v_prior := control_plane.replay_request_v1(p_idempotency_key,'tenant.create',v_request);
  if v_prior is not null then
    return query select (v_prior->>'tenant_id')::uuid,(v_prior->>'brand_id')::uuid,
      (v_prior->>'instance_id')::uuid,true;
    return;
  end if;

  select c.tenant_id, c.brand_id, c.instance_id into v_row
  from control_plane.create_tenant_v1(p_name,p_brand_key) c;

  perform control_plane.remember_request_v1(p_idempotency_key,'tenant.create',
    pg_catalog.jsonb_build_object('tenant_id',v_row.tenant_id,'brand_id',v_row.brand_id,
      'instance_id',v_row.instance_id),v_request);
  return query select v_row.tenant_id,v_row.brand_id,v_row.instance_id,false;
end;
$function$;

create or replace function control_plane.list_tenants_v1(
  p_search text default null, p_status text default null, p_plan_key text default null,
  p_sort text default null, p_limit integer default 25, p_offset integer default 0)
returns table (tenant_id uuid, name text, status text, brand_keys text, plan_key text,
  subscription_state text, instance_count bigint, active_instances bigint,
  provisioning_state text, created_at timestamptz, updated_at timestamptz, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_sort text := case when p_sort in ('name','-name','created','-created','status')
                      then p_sort else '-created' end;
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  select t.id, t.name, t.status,
    (select pg_catalog.string_agg(b.key, ', ' order by b.key) from app.brands b where b.tenant_id = t.id),
    s.plan_key, s.state,
    (select pg_catalog.count(*) from app.instances i where i.tenant_id = t.id),
    (select pg_catalog.count(*) from app.instances i where i.tenant_id = t.id and i.deployment_state = 'active'),
    (select r.state from control_plane.provisioning_runs r where r.tenant_id = t.id
       order by r.created_at desc limit 1),
    t.created_at, t.updated_at, pg_catalog.count(*) over ()
  from app.tenants t
  left join control_plane.subscriptions s on s.tenant_id = t.id
  where (p_status is null or t.status = p_status)
    and (p_plan_key is null or s.plan_key = p_plan_key or (p_plan_key = 'none' and s.plan_key is null))
    and (coalesce(pg_catalog.btrim(p_search),'') = ''
      or pg_catalog.strpos(pg_catalog.lower(t.name), pg_catalog.lower(pg_catalog.btrim(p_search))) > 0
      or t.id::text = pg_catalog.btrim(p_search)
      or exists (select 1 from app.brands b where b.tenant_id = t.id
        and pg_catalog.strpos(b.key, pg_catalog.lower(pg_catalog.btrim(p_search))) > 0))
  order by
    case when v_sort = 'name' then t.name end asc,
    case when v_sort = '-name' then t.name end desc,
    case when v_sort = 'status' then t.status end asc,
    case when v_sort = 'created' then t.created_at end asc,
    case when v_sort = '-created' then t.created_at end desc,
    t.id
  limit least(greatest(coalesce(p_limit,25),1),100) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function control_plane.get_tenant_v1(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_tenant app.tenants%rowtype;
begin
  perform control_plane.require_operator_v1('viewer');
  select * into v_tenant from app.tenants t where t.id = p_tenant_id;
  if v_tenant.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;

  return pg_catalog.jsonb_build_object(
    'tenant', pg_catalog.jsonb_build_object('id',v_tenant.id,'name',v_tenant.name,
      'status',v_tenant.status,'created_at',v_tenant.created_at,'updated_at',v_tenant.updated_at),
    'brands', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',b.id,'key',b.key,'status',b.status) order by b.created_at)
      from app.brands b where b.tenant_id = p_tenant_id),'[]'::jsonb),
    'subscription', (select pg_catalog.jsonb_build_object('plan_key',s.plan_key,'state',s.state,
        'rollout_ring',s.rollout_ring,'started_at',s.started_at,'ends_at',s.ends_at,'updated_at',s.updated_at)
      from control_plane.subscriptions s where s.tenant_id = p_tenant_id),
    'plan', (select pg_catalog.jsonb_build_object('key',p.key,'name',p.name,'entitlements',p.entitlements,'active',p.active)
      from control_plane.subscriptions s join control_plane.plans p on p.key = s.plan_key
      where s.tenant_id = p_tenant_id),
    'entitlements', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'feature_key',e.feature_key,'granted',e.granted,'source',e.source,
        'expires_at',e.expires_at,'updated_at',e.updated_at) order by e.feature_key)
      from app.tenant_entitlements e where e.tenant_id = p_tenant_id),'[]'::jsonb),
    'domains', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',d.id,'instance_id',d.instance_id,'hostname',d.hostname,'application',d.application,
        'kind',d.kind,'verification_status',d.verification_status,'verified_at',d.verified_at,
        'active',d.active) order by d.hostname)
      from app.tenant_domains d where d.tenant_id = p_tenant_id),'[]'::jsonb),
    'instances', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',i.id,'deployment_state',i.deployment_state,'brand_id',i.brand_id,
        'brand_published',i.published_brand_revision_id is not null,
        'desired_release',r.desired_release,'current_release',r.current_release,
        'reported_at',r.reported_at,'created_at',i.created_at) order by i.created_at)
      from app.instances i
      left join control_plane.instance_release_state r on r.tenant_id = i.tenant_id and r.instance_id = i.id
      where i.tenant_id = p_tenant_id),'[]'::jsonb),
    'provisioning_runs', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',r.id,'instance_id',r.instance_id,'slug',r.slug,'state',r.state,
        'waiting_reason',r.waiting_reason,'last_error_code',r.last_error_code,
        'created_at',r.created_at,'updated_at',r.updated_at) order by r.created_at desc)
      from control_plane.provisioning_runs r where r.tenant_id = p_tenant_id),'[]'::jsonb),
    'jobs', coalesce((select pg_catalog.jsonb_agg(x.j order by x.created_at desc) from (
        select j.created_at, pg_catalog.jsonb_build_object('id',j.id,'kind',j.kind,'status',j.status,
          'attempts',j.attempts,'last_error_code',j.last_error_code,
          'needs_approval',j.kind in ('close_instance','rotate_secret') and j.approved_by is null and j.status = 'queued',
          'created_at',j.created_at) as j
        from control_plane.jobs j where j.tenant_id = p_tenant_id
        order by j.created_at desc limit 20) x),'[]'::jsonb),
    'support_grants', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',g.id,'status',case when g.status = 'active' and g.expires_at <= pg_catalog.statement_timestamp()
          then 'expired' else g.status end,
        'ticket_reference',g.ticket_reference,'scope',g.scope,'expires_at',g.expires_at,
        'requested_at',g.requested_at) order by g.requested_at desc)
      from control_plane.support_grants g where g.tenant_id = p_tenant_id),'[]'::jsonb),
    'audit', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) - 'total_count')
      from control_plane.audit_rows_v1(null,null,p_tenant_id,null,null,null,null,20,0) a),'[]'::jsonb)
  );
end;
$function$;

create or replace function control_plane.update_tenant_v1(
  p_tenant_id uuid, p_name text, p_expected_updated_at timestamptz)
returns table (tenant_id uuid, updated_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_tenant app.tenants%rowtype;
  v_name text := pg_catalog.btrim(p_name);
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_operator := control_plane.require_operator_v1('operator');
  if v_name is null or v_name = '' or pg_catalog.char_length(v_name) > 160 then
    raise exception using errcode='22023',message='name_invalid';
  end if;
  select * into v_tenant from app.tenants t where t.id = p_tenant_id for update;
  if v_tenant.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if v_tenant.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode='40001',message='stale_revision';
  end if;
  update app.tenants t set name = v_name, updated_at = v_now where t.id = p_tenant_id;
  perform control_plane.write_audit_v1(v_operator,'tenant.renamed',p_tenant_id,null,'tenant',
    p_tenant_id::text,null,pg_catalog.jsonb_build_object('from',v_tenant.name,'to',v_name));
  return query select p_tenant_id, v_now;
end;
$function$;

create or replace function control_plane.set_tenant_status_v1(
  p_tenant_id uuid, p_status text, p_reason text, p_expected_status text)
returns table (tenant_id uuid, status text, updated_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_tenant app.tenants%rowtype;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 10 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  select * into v_tenant from app.tenants t where t.id = p_tenant_id for update;
  if v_tenant.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if v_tenant.status is distinct from p_expected_status then
    raise exception using errcode='40001',message='stale_revision';
  end if;
  if not ((v_tenant.status = 'active' and p_status = 'suspended')
       or (v_tenant.status = 'suspended' and p_status = 'active')) then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;

  update app.tenants t set status = p_status, updated_at = v_now where t.id = p_tenant_id;
  perform control_plane.write_audit_v1(v_operator,
    case p_status when 'suspended' then 'tenant.suspended' else 'tenant.reactivated' end,
    p_tenant_id,null,'tenant',p_tenant_id::text,p_reason,
    pg_catalog.jsonb_build_object('from',v_tenant.status,'to',p_status));
  return query select p_tenant_id, p_status, v_now;
end;
$function$;

create or replace function control_plane.request_tenant_closure_v1(
  p_tenant_id uuid, p_reason text, p_confirmation text, p_idempotency_key text)
returns table (job_ids uuid[])
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_tenant app.tenants%rowtype;
  v_prior jsonb;
  v_request jsonb := pg_catalog.jsonb_build_object('tenant_id',p_tenant_id,'reason',pg_catalog.btrim(p_reason),'confirmation',p_confirmation);
  v_ids uuid[] := '{}'::uuid[];
  v_id uuid;
  v_instance record;
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  v_prior := control_plane.replay_request_v1(p_idempotency_key,'tenant.closure',v_request);
  if v_prior is not null then
    return query select (select pg_catalog.array_agg(x::uuid)
      from pg_catalog.jsonb_array_elements_text(v_prior->'job_ids') x);
    return;
  end if;
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 10 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  select * into v_tenant from app.tenants t where t.id = p_tenant_id for update;
  if v_tenant.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if p_confirmation is distinct from v_tenant.name then
    raise exception using errcode='22023',message='confirmation_mismatch';
  end if;
  if v_tenant.status <> 'suspended' then
    raise exception using errcode='22023',message='suspend_before_closure';
  end if;

  for v_instance in
    select i.id from app.instances i
    where i.tenant_id = p_tenant_id and i.deployment_state <> 'closed'
    order by i.created_at
  loop
    insert into control_plane.jobs(kind,tenant_id,instance_id,parameters,requested_by)
    values ('close_instance',p_tenant_id,v_instance.id,
      pg_catalog.jsonb_build_object('reason_recorded',true),v_operator)
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  perform control_plane.write_audit_v1(v_operator,'tenant.closure_requested',p_tenant_id,null,
    'tenant',p_tenant_id::text,p_reason,pg_catalog.jsonb_build_object('job_ids',pg_catalog.to_jsonb(v_ids)));
  perform control_plane.remember_request_v1(p_idempotency_key,'tenant.closure',
    pg_catalog.jsonb_build_object('job_ids',pg_catalog.to_jsonb(v_ids)),v_request);
  return query select v_ids;
end;
$function$;

-- api_v1 pass-throughs
create or replace function api_v1.create_tenant_v2(p_name text, p_brand_key text, p_idempotency_key text)
returns table (tenant_id uuid, brand_id uuid, instance_id uuid, replayed boolean)
language sql security definer set search_path to ''
as $$ select * from control_plane.create_tenant_v2(p_name,p_brand_key,p_idempotency_key); $$;

create or replace function api_v1.list_tenants_v1(
  p_search text default null, p_status text default null, p_plan_key text default null,
  p_sort text default null, p_limit integer default 25, p_offset integer default 0)
returns table (tenant_id uuid, name text, status text, brand_keys text, plan_key text,
  subscription_state text, instance_count bigint, active_instances bigint,
  provisioning_state text, created_at timestamptz, updated_at timestamptz, total_count bigint)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_tenants_v1(p_search,p_status,p_plan_key,p_sort,p_limit,p_offset); $$;

create or replace function api_v1.get_tenant_v1(p_tenant_id uuid)
returns jsonb
language sql security definer set search_path to ''
as $$ select control_plane.get_tenant_v1(p_tenant_id); $$;

create or replace function api_v1.update_tenant_v1(p_tenant_id uuid, p_name text, p_expected_updated_at timestamptz)
returns table (tenant_id uuid, updated_at timestamptz)
language sql security definer set search_path to ''
as $$ select * from control_plane.update_tenant_v1(p_tenant_id,p_name,p_expected_updated_at); $$;

create or replace function api_v1.set_tenant_status_v1(p_tenant_id uuid, p_status text, p_reason text, p_expected_status text)
returns table (tenant_id uuid, status text, updated_at timestamptz)
language sql security definer set search_path to ''
as $$ select * from control_plane.set_tenant_status_v1(p_tenant_id,p_status,p_reason,p_expected_status); $$;

create or replace function api_v1.request_tenant_closure_v1(p_tenant_id uuid, p_reason text, p_confirmation text, p_idempotency_key text)
returns table (job_ids uuid[])
language sql security definer set search_path to ''
as $$ select * from control_plane.request_tenant_closure_v1(p_tenant_id,p_reason,p_confirmation,p_idempotency_key); $$;

revoke all on all functions in schema control_plane from public,anon,authenticated;
grant execute on function control_plane.contains_no_secret_v1(jsonb) to service_role;

revoke all on function
  api_v1.create_tenant_v2(text,text,text),
  api_v1.list_tenants_v1(text,text,text,text,integer,integer),
  api_v1.get_tenant_v1(uuid),
  api_v1.update_tenant_v1(uuid,text,timestamptz),
  api_v1.set_tenant_status_v1(uuid,text,text,text),
  api_v1.request_tenant_closure_v1(uuid,text,text,text)
from public, anon;
grant execute on function
  api_v1.create_tenant_v2(text,text,text),
  api_v1.list_tenants_v1(text,text,text,text,integer,integer),
  api_v1.get_tenant_v1(uuid),
  api_v1.update_tenant_v1(uuid,text,timestamptz),
  api_v1.set_tenant_status_v1(uuid,text,text,text),
  api_v1.request_tenant_closure_v1(uuid,text,text,text)
to authenticated;
