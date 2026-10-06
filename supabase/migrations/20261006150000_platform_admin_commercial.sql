-- Platform Admin completion, part 4: plans, subscriptions, entitlements.
--
-- Subscriptions here are administrative records. There is no SaaS billing
-- provider integration (ADR-0003: Stripe in this product is the tenant's own
-- payments), so nothing in this file claims a payment happened; the UI labels
-- these states accordingly.
--
-- Cancelling with a future end date stamps that date as expires_at on the
-- plan-sourced entitlements, which the product already honours
-- (20260921120000: expires_at > now()). Re-activating clears it. Overrides
-- (source = 'override') are never touched by plan changes.

create or replace function control_plane.project_plan_entitlements_v1(p_tenant_id uuid, p_plan_key text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_features text[];
  v_count integer;
  v_expires timestamptz;
  v_granted boolean;
begin
  select case when s.state in ('cancelled','trialing') then s.ends_at end
  into v_expires from control_plane.subscriptions s where s.tenant_id = p_tenant_id;
  v_granted := v_expires is null or v_expires > pg_catalog.statement_timestamp();
  select p.entitlements into v_features from control_plane.plans p where p.key = p_plan_key;
  update app.tenant_entitlements e set granted = false, expires_at = null,
    updated_at = pg_catalog.statement_timestamp()
  where e.tenant_id = p_tenant_id and e.source = 'plan' and not (e.feature_key = any(coalesce(v_features,'{}')));
  insert into app.tenant_entitlements(tenant_id,feature_key,granted,source,expires_at)
  select p_tenant_id, k, v_granted, 'plan',v_expires from pg_catalog.unnest(coalesce(v_features,'{}')) k
  on conflict (tenant_id,feature_key) do update
    set granted = excluded.granted, expires_at = excluded.expires_at, updated_at = pg_catalog.statement_timestamp()
    where app.tenant_entitlements.source = 'plan';
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

create or replace function control_plane.list_plans_v1()
returns table (key text, name text, entitlements text[], active boolean,
  created_at timestamptz, subscriber_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  select p.key, p.name, p.entitlements, p.active, p.created_at,
    (select pg_catalog.count(*) from control_plane.subscriptions s
      where s.plan_key = p.key and s.state <> 'cancelled')
  from control_plane.plans p order by p.active desc, p.name;
end;
$function$;

create or replace function control_plane.save_plan_v1(
  p_key text, p_name text, p_entitlements text[], p_active boolean, p_create boolean, p_reason text)
returns table (key text, subscribers_updated integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_before control_plane.plans%rowtype;
  v_features text[];
  v_name text := pg_catalog.btrim(p_name);
  v_tenant uuid;
  v_updated integer := 0;
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  if p_key is null or p_key !~ '^[a-z][a-z0-9_-]{1,40}$' then
    raise exception using errcode='22023',message='plan_invalid';
  end if;
  if v_name is null or pg_catalog.char_length(v_name) not between 1 and 80 then
    raise exception using errcode='22023',message='name_invalid';
  end if;
  if exists (select 1 from pg_catalog.unnest(coalesce(p_entitlements,'{}')) k
             where k is null or k !~ '^[a-z][a-z0-9_.]{1,60}$') then
    raise exception using errcode='22023',message='entitlement_invalid';
  end if;
  select coalesce(pg_catalog.array_agg(distinct k order by k),'{}') into v_features
  from pg_catalog.unnest(coalesce(p_entitlements,'{}')) k;

  select * into v_before from control_plane.plans p where p.key = p_key for update;
  if p_create then
    if v_before.key is not null then
      raise exception using errcode='23505',message='plan_exists';
    end if;
    insert into control_plane.plans(key,name,entitlements,active)
    values (p_key,v_name,v_features,coalesce(p_active,true));
  else
    if v_before.key is null then
      raise exception using errcode='P0002',message='not_found';
    end if;
    update control_plane.plans p set name = v_name, entitlements = v_features,
      active = coalesce(p_active,p.active)
    where p.key = p_key;
    if v_before.entitlements is distinct from v_features then
      for v_tenant in select s.tenant_id from control_plane.subscriptions s
                      where s.plan_key = p_key loop
        perform control_plane.project_plan_entitlements_v1(v_tenant,p_key);
        v_updated := v_updated + 1;
      end loop;
    end if;
  end if;

  perform control_plane.write_audit_v1(v_operator,
    case when p_create then 'plan.created' else 'plan.updated' end,null,null,'plan',p_key,p_reason,
    pg_catalog.jsonb_build_object('plan',p_key,
      'added',(select coalesce(pg_catalog.jsonb_agg(k),'[]'::jsonb) from pg_catalog.unnest(v_features) k
               where not (k = any(coalesce(v_before.entitlements,'{}')))),
      'removed',(select coalesce(pg_catalog.jsonb_agg(k),'[]'::jsonb) from pg_catalog.unnest(coalesce(v_before.entitlements,'{}')) k
               where not (k = any(v_features))),
      'enabled',coalesce(p_active,true),'rows',v_updated));
  return query select p_key, v_updated;
end;
$function$;

create or replace function control_plane.list_subscriptions_v1(
  p_state text default null, p_plan_key text default null, p_search text default null,
  p_limit integer default 25, p_offset integer default 0)
returns table (tenant_id uuid, tenant_name text, tenant_status text, plan_key text, plan_name text,
  state text, rollout_ring text, started_at timestamptz, ends_at timestamptz,
  updated_at timestamptz, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  select t.id, t.name, t.status, s.plan_key, p.name, coalesce(s.state,'none'), s.rollout_ring,
    s.started_at, s.ends_at, s.updated_at, pg_catalog.count(*) over ()
  from app.tenants t
  left join control_plane.subscriptions s on s.tenant_id = t.id
  left join control_plane.plans p on p.key = s.plan_key
  where (p_state is null or coalesce(s.state,'none') = p_state)
    and (p_plan_key is null or s.plan_key = p_plan_key)
    and (coalesce(pg_catalog.btrim(p_search),'') = ''
      or pg_catalog.strpos(pg_catalog.lower(t.name), pg_catalog.lower(pg_catalog.btrim(p_search))) > 0)
  order by t.name, t.id
  limit least(greatest(coalesce(p_limit,25),1),100) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function control_plane.assign_subscription_v1(
  p_tenant_id uuid, p_plan_key text, p_rollout_ring text, p_reason text)
returns table (tenant_id uuid, plan_key text, granted integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_before control_plane.subscriptions%rowtype;
  v_granted integer;
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  if coalesce(p_rollout_ring,'') not in ('canary','early','general') then
    raise exception using errcode='22023',message='settings_invalid';
  end if;
  if not exists (select 1 from control_plane.plans p where p.key = p_plan_key and p.active) then
    raise exception using errcode='22023',message='plan_unknown';
  end if;
  if not exists (select 1 from app.tenants t where t.id = p_tenant_id) then
    raise exception using errcode='P0002',message='not_found';
  end if;
  select * into v_before from control_plane.subscriptions s where s.tenant_id = p_tenant_id for update;

  insert into control_plane.subscriptions(tenant_id,plan_key,rollout_ring,state)
  values (p_tenant_id,p_plan_key,p_rollout_ring,'active')
  on conflict (tenant_id) do update
    set plan_key = excluded.plan_key, rollout_ring = excluded.rollout_ring,
        state = case when control_plane.subscriptions.state = 'cancelled' then 'active'
                     else control_plane.subscriptions.state end,
        ends_at = case when control_plane.subscriptions.state = 'cancelled' then null
                       else control_plane.subscriptions.ends_at end,
        updated_at = pg_catalog.statement_timestamp();
  v_granted := control_plane.project_plan_entitlements_v1(p_tenant_id,p_plan_key);

  perform control_plane.write_audit_v1(v_operator,'subscription.plan_assigned',p_tenant_id,null,
    'subscription',p_tenant_id::text,p_reason,
    pg_catalog.jsonb_build_object('from',v_before.plan_key,'to',p_plan_key,'ring',p_rollout_ring));
  return query select p_tenant_id, p_plan_key, v_granted;
end;
$function$;

create or replace function control_plane.update_subscription_v1(
  p_tenant_id uuid, p_state text, p_ends_at timestamptz, p_rollout_ring text,
  p_reason text, p_expected_updated_at timestamptz)
returns table (tenant_id uuid, state text, updated_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_sub control_plane.subscriptions%rowtype;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  if p_state not in ('trialing','active','past_due','cancelled')
     or coalesce(p_rollout_ring,'') not in ('canary','early','general') then
    raise exception using errcode='22023',message='settings_invalid';
  end if;
  if p_state in ('trialing','cancelled') and p_ends_at is null then
    raise exception using errcode='22023',message='ends_at_required';
  end if;
  if p_state = 'trialing' and p_ends_at <= v_now then
    raise exception using errcode='22023',message='expiry_invalid';
  end if;
  select * into v_sub from control_plane.subscriptions s where s.tenant_id = p_tenant_id for update;
  if v_sub.tenant_id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if v_sub.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode='40001',message='stale_revision';
  end if;

  update control_plane.subscriptions s set state = p_state, rollout_ring = p_rollout_ring,
    ends_at = case when p_state in ('trialing','cancelled') then p_ends_at else null end,
    updated_at = v_now
  where s.tenant_id = p_tenant_id;

  if p_state in ('cancelled','trialing') then
    update app.tenant_entitlements e set expires_at = p_ends_at, updated_at = v_now,
      granted = case when p_ends_at <= v_now then false else e.granted end
    where e.tenant_id = p_tenant_id and e.source = 'plan';
  elsif v_sub.state in ('cancelled','trialing') then
    perform control_plane.project_plan_entitlements_v1(p_tenant_id,v_sub.plan_key);
  end if;

  perform control_plane.write_audit_v1(v_operator,'subscription.updated',p_tenant_id,null,
    'subscription',p_tenant_id::text,p_reason,
    pg_catalog.jsonb_build_object('from',v_sub.state,'to',p_state,'ring',p_rollout_ring,
      'expires_at',p_ends_at));
  return query select p_tenant_id, p_state, v_now;
end;
$function$;

create or replace function control_plane.set_entitlement_override_v1(
  p_tenant_id uuid, p_feature_key text, p_granted boolean, p_expires_at timestamptz, p_reason text)
returns table (tenant_id uuid, feature_key text, granted boolean)
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
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  if p_feature_key is null or p_feature_key !~ '^[a-z][a-z0-9_.]{1,60}$' or p_granted is null then
    raise exception using errcode='22023',message='entitlement_invalid';
  end if;
  if p_expires_at is not null and p_expires_at <= pg_catalog.statement_timestamp() then
    raise exception using errcode='22023',message='expiry_invalid';
  end if;
  if not exists (select 1 from app.tenants t where t.id = p_tenant_id) then
    raise exception using errcode='P0002',message='not_found';
  end if;
  insert into app.tenant_entitlements(tenant_id,feature_key,granted,source,expires_at)
  values (p_tenant_id,p_feature_key,p_granted,'override',p_expires_at)
  on conflict (tenant_id,feature_key) do update
    set granted = excluded.granted, source = 'override', expires_at = excluded.expires_at,
        updated_at = pg_catalog.statement_timestamp();
  perform control_plane.write_audit_v1(v_operator,'entitlement.overridden',p_tenant_id,null,
    'entitlement',p_feature_key,p_reason,
    pg_catalog.jsonb_build_object('feature_key',p_feature_key,'granted',p_granted,'expires_at',p_expires_at));
  return query select p_tenant_id, p_feature_key, p_granted;
end;
$function$;

create or replace function control_plane.clear_entitlement_override_v1(
  p_tenant_id uuid, p_feature_key text, p_reason text)
returns table (tenant_id uuid, feature_key text, granted boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_in_plan boolean;
  v_expires timestamptz;
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  if not exists (select 1 from app.tenant_entitlements e where e.tenant_id = p_tenant_id
                 and e.feature_key = p_feature_key and e.source = 'override') then
    raise exception using errcode='P0002',message='not_found';
  end if;
  select case when s.state in ('cancelled','trialing') then s.ends_at end
  into v_expires from control_plane.subscriptions s where s.tenant_id = p_tenant_id;
  select exists (select 1 from control_plane.subscriptions s join control_plane.plans p on p.key = s.plan_key
    where s.tenant_id = p_tenant_id and p_feature_key = any(p.entitlements)
      and (v_expires is null or v_expires > pg_catalog.statement_timestamp()))
  into v_in_plan;
  update app.tenant_entitlements e set source = 'plan', granted = v_in_plan, expires_at = case when v_in_plan then v_expires end,
    updated_at = pg_catalog.statement_timestamp()
  where e.tenant_id = p_tenant_id and e.feature_key = p_feature_key;
  perform control_plane.write_audit_v1(v_operator,'entitlement.override_cleared',p_tenant_id,null,
    'entitlement',p_feature_key,p_reason,
    pg_catalog.jsonb_build_object('feature_key',p_feature_key,'granted',v_in_plan));
  return query select p_tenant_id, p_feature_key, v_in_plan;
end;
$function$;

-- api_v1 pass-throughs
create or replace function api_v1.list_plans_v1()
returns table (key text, name text, entitlements text[], active boolean, created_at timestamptz, subscriber_count bigint)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_plans_v1(); $$;

create or replace function api_v1.save_plan_v1(p_key text, p_name text, p_entitlements text[], p_active boolean, p_create boolean, p_reason text)
returns table (key text, subscribers_updated integer)
language sql security definer set search_path to ''
as $$ select * from control_plane.save_plan_v1(p_key,p_name,p_entitlements,p_active,p_create,p_reason); $$;

create or replace function api_v1.list_subscriptions_v1(p_state text default null, p_plan_key text default null,
  p_search text default null, p_limit integer default 25, p_offset integer default 0)
returns table (tenant_id uuid, tenant_name text, tenant_status text, plan_key text, plan_name text,
  state text, rollout_ring text, started_at timestamptz, ends_at timestamptz,
  updated_at timestamptz, total_count bigint)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_subscriptions_v1(p_state,p_plan_key,p_search,p_limit,p_offset); $$;

create or replace function api_v1.assign_subscription_v1(p_tenant_id uuid, p_plan_key text, p_rollout_ring text, p_reason text)
returns table (tenant_id uuid, plan_key text, granted integer)
language sql security definer set search_path to ''
as $$ select * from control_plane.assign_subscription_v1(p_tenant_id,p_plan_key,p_rollout_ring,p_reason); $$;

create or replace function api_v1.update_subscription_v1(p_tenant_id uuid, p_state text, p_ends_at timestamptz,
  p_rollout_ring text, p_reason text, p_expected_updated_at timestamptz)
returns table (tenant_id uuid, state text, updated_at timestamptz)
language sql security definer set search_path to ''
as $$ select * from control_plane.update_subscription_v1(p_tenant_id,p_state,p_ends_at,p_rollout_ring,p_reason,p_expected_updated_at); $$;

create or replace function api_v1.set_entitlement_override_v1(p_tenant_id uuid, p_feature_key text,
  p_granted boolean, p_expires_at timestamptz, p_reason text)
returns table (tenant_id uuid, feature_key text, granted boolean)
language sql security definer set search_path to ''
as $$ select * from control_plane.set_entitlement_override_v1(p_tenant_id,p_feature_key,p_granted,p_expires_at,p_reason); $$;

create or replace function api_v1.clear_entitlement_override_v1(p_tenant_id uuid, p_feature_key text, p_reason text)
returns table (tenant_id uuid, feature_key text, granted boolean)
language sql security definer set search_path to ''
as $$ select * from control_plane.clear_entitlement_override_v1(p_tenant_id,p_feature_key,p_reason); $$;

revoke all on all functions in schema control_plane from public,anon,authenticated;
grant execute on function control_plane.contains_no_secret_v1(jsonb) to service_role;

revoke all on function
  api_v1.list_plans_v1(),
  api_v1.save_plan_v1(text,text,text[],boolean,boolean,text),
  api_v1.list_subscriptions_v1(text,text,text,integer,integer),
  api_v1.assign_subscription_v1(uuid,text,text,text),
  api_v1.update_subscription_v1(uuid,text,timestamptz,text,text,timestamptz),
  api_v1.set_entitlement_override_v1(uuid,text,boolean,timestamptz,text),
  api_v1.clear_entitlement_override_v1(uuid,text,text)
from public, anon;
grant execute on function
  api_v1.list_plans_v1(),
  api_v1.save_plan_v1(text,text,text[],boolean,boolean,text),
  api_v1.list_subscriptions_v1(text,text,text,integer,integer),
  api_v1.assign_subscription_v1(uuid,text,text,text),
  api_v1.update_subscription_v1(uuid,text,timestamptz,text,text,timestamptz),
  api_v1.set_entitlement_override_v1(uuid,text,boolean,timestamptz,text),
  api_v1.clear_entitlement_override_v1(uuid,text,text)
to authenticated;
