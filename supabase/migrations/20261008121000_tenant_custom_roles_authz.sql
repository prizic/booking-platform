-- Tenant custom roles, part 2: authorization (ADR-0019).
--
-- Every helper below reads capabilities from the member's role rows. None of
-- them looks at a role key, so a custom role is judged exactly like a built-in
-- one holding the same grants.

-- ---------------------------------------------------------------------------
-- 1. Location scope. The support branch is unchanged. For a member:
--    * tenant mode: unchanged from issue #6 - no location rows reach the whole
--      tenant, otherwise exactly the listed locations;
--    * assigned mode: exactly the listed locations, and no rows reach nothing.
--      The part 1 backfill gave every existing assigned member its rows first.
-- ---------------------------------------------------------------------------
create or replace function private.can_access_location(
  p_tenant_id uuid,
  p_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when exists (
        select 1 from app.memberships m
        where m.tenant_id = p_tenant_id
          and m.auth_user_id = (select private.current_auth_user_id())
          and m.status = 'active'
      ) then
        exists (
          select 1 from app.memberships m
          join app.roles r on r.tenant_id = m.tenant_id and r.id = m.role_id
          where m.tenant_id = p_tenant_id
            and m.auth_user_id = (select private.current_auth_user_id())
            and m.status = 'active'
            and (
              exists (
                select 1 from app.membership_location_scopes s
                where s.tenant_id = m.tenant_id and s.membership_id = m.id
                  and s.location_id = p_location_id)
              or (
                r.location_scope_mode = 'tenant'
                and not exists (
                  select 1 from app.membership_location_scopes s
                  where s.tenant_id = m.tenant_id and s.membership_id = m.id))
            )
        )
      else
        -- A support grant: whole tenant, or exactly the one location it names.
        exists (
          select 1 from private.active_support_grant_v1(p_tenant_id) g
          where g.location_id is null or g.location_id = p_location_id
        )
    end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Administrator = a role holding role.manage at tenant scope. Only the
--    built-in Tenant admin can hold it (role.manage is reserved), so the set of
--    administrators is exactly the set it was when this keyed on 'tenant_admin'.
-- ---------------------------------------------------------------------------
create function private.role_is_administrator(p_tenant_id uuid, p_role_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from app.role_permissions rp
    where rp.tenant_id = p_tenant_id and rp.role_id = p_role_id
      and rp.permission_key = 'role.manage' and rp.scope_kind = 'tenant');
$$;
revoke all on function private.role_is_administrator(uuid, uuid) from public, anon, authenticated, service_role;

-- The current caller as a role administrator of this tenant (active member).
create function private.is_role_administrator(p_tenant_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select (select private.current_auth_user_id()) is not null and exists (
    select 1 from app.memberships m
    where m.tenant_id = p_tenant_id
      and m.auth_user_id = (select private.current_auth_user_id())
      and m.status = 'active'
      and private.role_is_administrator(m.tenant_id, m.role_id));
$$;
revoke all on function private.is_role_administrator(uuid) from public, anon, authenticated, service_role;

create or replace function private.guard_last_tenant_administrator()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'active' and private.role_is_administrator(old.tenant_id, old.role_id) then
    -- A version write also makes repeatable-read racers serialize/fail instead
    -- of judging the last-admin count from a stale transaction snapshot.
    update app.tenants t set updated_at = statement_timestamp() where t.id = old.tenant_id;
    if tg_op = 'DELETE' or new.status <> 'active'
       or (new.role_id <> old.role_id and not private.role_is_administrator(new.tenant_id, new.role_id)) then
      if not exists (
        select 1 from app.memberships m
        where m.tenant_id = old.tenant_id and m.id <> old.id and m.status = 'active'
          and private.role_is_administrator(m.tenant_id, m.role_id)) then
        raise exception using errcode = '22023', message = 'last_administrator_required';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. No escalation. A grant covers another of the same key when its scope is at
--    least as wide (tenant > location > own) and its kind at least as strong
--    (direct covers direct and approval; approval covers approval only).
-- ---------------------------------------------------------------------------
create function private.grant_covers(
  p_actor_kind text, p_actor_scope text, p_target_kind text, p_target_scope text)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select coalesce(
    (case p_actor_scope when 'tenant' then 3 when 'location' then 2 when 'own' then 1 end)
      >= (case p_target_scope when 'tenant' then 3 when 'location' then 2 when 'own' then 1 end)
    and (p_actor_kind = 'direct' and p_target_kind in ('direct', 'approval')
      or p_actor_kind = 'approval' and p_target_kind = 'approval'),
    false);
$$;
revoke all on function private.grant_covers(text, text, text, text) from public, anon, authenticated, service_role;

-- The caller dominates a set of grants when, for every grant, the caller's own
-- active role holds a covering grant of the same key. A covering grant below
-- tenant scope works only where the caller works, so every target location must
-- also be one the caller can reach. A null location list means "no location
-- context" (a role definition rather than an assignment).
create function private.actor_dominates_grants(p_tenant_id uuid, p_grants jsonb, p_location_ids uuid[])
returns boolean language sql stable security invoker set search_path = '' as $$
  select (select private.current_membership_id(p_tenant_id)) is not null
    and jsonb_typeof(coalesce(p_grants, '[]'::jsonb)) = 'array'
    and not exists (
      select 1
      from jsonb_to_recordset(coalesce(p_grants, '[]'::jsonb)) as g(permission_key text, grant_kind text, scope_kind text)
      where not exists (
        select 1 from app.memberships m
        join app.role_permissions a on a.tenant_id = m.tenant_id and a.role_id = m.role_id
        where m.tenant_id = p_tenant_id
          and m.auth_user_id = (select private.current_auth_user_id())
          and m.status = 'active'
          and a.permission_key = g.permission_key
          and private.grant_covers(a.grant_kind, a.scope_kind, g.grant_kind, g.scope_kind)
          and (
            a.scope_kind = 'tenant'
            or not exists (
              select 1 from unnest(coalesce(p_location_ids, '{}'::uuid[])) as l(id)
              where not coalesce(private.can_access_location(p_tenant_id, l.id), false))
          )
      )
    );
$$;
revoke all on function private.actor_dominates_grants(uuid, jsonb, uuid[]) from public, anon, authenticated, service_role;

create function private.role_grants_json(p_tenant_id uuid, p_role_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'permission_key', rp.permission_key, 'grant_kind', rp.grant_kind, 'scope_kind', rp.scope_kind)
      order by rp.permission_key), '[]'::jsonb)
  from app.role_permissions rp
  where rp.tenant_id = p_tenant_id and rp.role_id = p_role_id;
$$;
revoke all on function private.role_grants_json(uuid, uuid) from public, anon, authenticated, service_role;

-- Dominance over a role as it would apply to a member at these locations. A
-- tenant-mode member with no rows reaches every location, so that is the set
-- the caller must reach too.
create function private.actor_dominates_role(p_tenant_id uuid, p_role_id uuid, p_location_ids uuid[])
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce((
    select private.actor_dominates_grants(p_tenant_id, private.role_grants_json(r.tenant_id, r.id),
      case
        when p_location_ids is null then null
        when r.location_scope_mode = 'tenant' and cardinality(p_location_ids) = 0 then
          coalesce((select array_agg(l.id) from app.locations l where l.tenant_id = r.tenant_id), '{}'::uuid[])
        else p_location_ids
      end)
    from app.roles r where r.tenant_id = p_tenant_id and r.id = p_role_id), false);
$$;
revoke all on function private.actor_dominates_role(uuid, uuid, uuid[]) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Live re-authorization. A broadcast tells open Dashboard sessions of the
--    tenant to re-read their own context; it carries identifiers only. Like the
--    booking broadcast it is an accelerator: where Realtime is absent, or the
--    send fails, the authorization change still commits.
-- ---------------------------------------------------------------------------
create function private.broadcast_authorization_change_v1(p_tenant_id uuid, p_payload jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then
    return;
  end if;
  execute 'select realtime.send($1, $2, $3, $4)'
    using coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('tenant_id', p_tenant_id),
      'authorization_changed', 'tenant:' || p_tenant_id::text, true;
exception when others then
  return;
end;
$$;
revoke all on function private.broadcast_authorization_change_v1(uuid, jsonb) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Provisioning installs the tenant's built-in roles (ADR-0013). v2 calls v1,
--    so both paths get them.
-- ---------------------------------------------------------------------------
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

  -- The tenant's four built-in roles, from the platform template.
  perform private.install_builtin_roles_v1(v_tenant_id);

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
revoke all on function control_plane.create_tenant_v1(text,text) from public,anon,authenticated;
