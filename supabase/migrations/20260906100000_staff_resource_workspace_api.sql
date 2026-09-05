-- Issue #8 Dashboard tracer: one minimal tenant-scoped management projection.
-- The application schema remains outside the Data API; Dashboard reads this
-- projection through its request-scoped authenticated client.

-- Keep exposed API functions invoker-rights. The privileged mutation body is
-- private and reachable from PostgREST only through this narrow wrapper.
alter function api_v1.deactivate_staff_v1(uuid, uuid, text, uuid, uuid, text)
  set schema private;
alter function private.deactivate_staff_v1(uuid, uuid, text, uuid, uuid, text)
  rename to deactivate_staff_v1_internal;
revoke all on function private.deactivate_staff_v1_internal(uuid, uuid, text, uuid, uuid, text)
  from public, anon, service_role;
grant execute on function private.deactivate_staff_v1_internal(uuid, uuid, text, uuid, uuid, text)
  to authenticated;

create function api_v1.deactivate_staff_v1(
  p_tenant_id uuid,
  p_staff_id uuid,
  p_resolution text,
  p_replacement_staff_id uuid,
  p_request_id uuid,
  p_reason text
)
returns table (
  staff_id uuid,
  outcome text,
  remaining_allocations integer
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.deactivate_staff_v1_internal(
    p_tenant_id,
    p_staff_id,
    p_resolution,
    p_replacement_staff_id,
    p_request_id,
    p_reason
  );
$$;
revoke all on function api_v1.deactivate_staff_v1(uuid, uuid, text, uuid, uuid, text)
  from public, anon, service_role;
grant execute on function api_v1.deactivate_staff_v1(uuid, uuid, text, uuid, uuid, text)
  to authenticated;

alter function api_v1.deactivate_resource_v1(uuid, uuid, text, uuid, text)
  set schema private;
alter function private.deactivate_resource_v1(uuid, uuid, text, uuid, text)
  rename to deactivate_resource_v1_internal;
revoke all on function private.deactivate_resource_v1_internal(uuid, uuid, text, uuid, text)
  from public, anon, service_role;
grant execute on function private.deactivate_resource_v1_internal(uuid, uuid, text, uuid, text)
  to authenticated;

create function api_v1.deactivate_resource_v1(
  p_tenant_id uuid,
  p_resource_id uuid,
  p_resolution text,
  p_request_id uuid,
  p_reason text
)
returns table (
  resource_id uuid,
  outcome text,
  remaining_allocations integer
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.deactivate_resource_v1_internal(
    p_tenant_id,
    p_resource_id,
    p_resolution,
    p_request_id,
    p_reason
  );
$$;
revoke all on function api_v1.deactivate_resource_v1(uuid, uuid, text, uuid, text)
  from public, anon, service_role;
grant execute on function api_v1.deactivate_resource_v1(uuid, uuid, text, uuid, text)
  to authenticated;

alter function api_v1.get_assignment_candidates_v1(uuid, uuid)
  set schema private;
alter function private.get_assignment_candidates_v1(uuid, uuid)
  rename to get_assignment_candidates_v1_internal;
revoke all on function private.get_assignment_candidates_v1_internal(uuid, uuid)
  from public, service_role;
grant execute on function private.get_assignment_candidates_v1_internal(uuid, uuid)
  to anon, authenticated;

create function api_v1.get_assignment_candidates_v1(
  p_service_id uuid,
  p_location_id uuid
)
returns table (
  assignment_mode text,
  staff_id uuid,
  staff_name text,
  resource_id uuid,
  resource_name text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from private.get_assignment_candidates_v1_internal(
    p_service_id,
    p_location_id
  );
$$;
revoke all on function api_v1.get_assignment_candidates_v1(uuid, uuid)
  from public, service_role;
grant execute on function api_v1.get_assignment_candidates_v1(uuid, uuid)
  to anon, authenticated;

create or replace function api_v1.get_staff_resource_workspace_v1(
  p_tenant_id uuid
)
returns table (
  tenant_id uuid,
  item_kind text,
  item_id uuid,
  name text,
  status text,
  resource_type_name text,
  location_ids uuid[],
  service_ids uuid[],
  future_allocation_count integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_tenant_id is null
    or not exists (
      select 1
      from app.memberships as membership
      join app.roles as role
        on role.tenant_id = membership.tenant_id
        and role.id = membership.role_id
      join app.role_permissions as permission
        on permission.tenant_id = role.tenant_id
        and permission.role_id = role.id
      where membership.tenant_id = p_tenant_id
        and membership.auth_user_id = (select private.current_auth_user_id())
        and membership.status = 'active'
        and permission.permission_key = 'staff.manage'
        and permission.scope_kind = 'tenant'
        and (
          permission.grant_kind = 'direct'
          or (
            permission.grant_kind = 'approval'
            and (select private.is_aal2())
          )
        )
    )
  then
    raise exception using
      errcode = '42501',
      message = 'staff_authorization_required';
  end if;

  return query
  select
    staff.tenant_id,
    'staff'::text as item_kind,
    staff.id as item_id,
    staff.public_name as name,
    staff.status,
    null::text as resource_type_name,
    coalesce(locations.ids, '{}'::uuid[]) as location_ids,
    coalesce(services.ids, '{}'::uuid[]) as service_ids,
    coalesce(allocations.future_count, 0)::integer as future_allocation_count
  from app.staff_profiles as staff
  left join lateral (
    select array_agg(link.location_id order by link.location_id) as ids
    from app.staff_locations as link
    where link.tenant_id = staff.tenant_id
      and link.staff_id = staff.id
  ) as locations on true
  left join lateral (
    select array_agg(link.service_id order by link.service_id) as ids
    from app.staff_services as link
    where link.tenant_id = staff.tenant_id
      and link.staff_id = staff.id
  ) as services on true
  left join lateral (
    select count(*)::integer as future_count
    from app.assignment_allocations as allocation
    where allocation.tenant_id = staff.tenant_id
      and allocation.staff_id = staff.id
      and allocation.state in ('held', 'confirmed')
      and allocation.starts_at > statement_timestamp()
  ) as allocations on true
  where staff.tenant_id = p_tenant_id

  union all

  select
    resource.tenant_id,
    'resource'::text as item_kind,
    resource.id as item_id,
    resource.public_name as name,
    resource.status,
    resource_type.name as resource_type_name,
    coalesce(locations.ids, '{}'::uuid[]) as location_ids,
    coalesce(services.ids, '{}'::uuid[]) as service_ids,
    coalesce(allocations.future_count, 0)::integer as future_allocation_count
  from app.resources as resource
  join app.resource_types as resource_type
    on resource_type.tenant_id = resource.tenant_id
    and resource_type.id = resource.resource_type_id
  left join lateral (
    select array_agg(link.location_id order by link.location_id) as ids
    from app.resource_locations as link
    where link.tenant_id = resource.tenant_id
      and link.resource_id = resource.id
  ) as locations on true
  left join lateral (
    select array_agg(requirement.service_id order by requirement.service_id) as ids
    from app.resource_requirements as requirement
    where requirement.tenant_id = resource.tenant_id
      and requirement.resource_type_id = resource.resource_type_id
  ) as services on true
  left join lateral (
    select count(*)::integer as future_count
    from app.assignment_allocations as allocation
    where allocation.tenant_id = resource.tenant_id
      and allocation.resource_id = resource.id
      and allocation.state in ('held', 'confirmed')
      and allocation.starts_at > statement_timestamp()
  ) as allocations on true
  where resource.tenant_id = p_tenant_id;
end;
$$;

revoke all on function api_v1.get_staff_resource_workspace_v1(uuid)
  from public, anon, authenticated;
grant execute on function api_v1.get_staff_resource_workspace_v1(uuid)
  to authenticated;

-- Dashboard mutations are RPC-only. The first staff/resource migration
-- installed the RLS policies needed by those RPCs, but also left direct table
-- mutation privileges on the application role. Remove that alternate path
-- while the dedicated create/edit RPCs remain deliberately unavailable.
revoke insert, update, delete on
  app.staff_profiles,
  app.staff_services,
  app.staff_locations,
  app.resource_types,
  app.resources,
  app.resource_locations,
  app.resource_requirements,
  app.assignment_allocations
from authenticated;
