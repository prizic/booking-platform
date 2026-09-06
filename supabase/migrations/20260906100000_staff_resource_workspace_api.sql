-- Issue #8 Dashboard management projections. PR81 owns all mutation helpers
-- and invoker wrappers; this migration adds read-only, caller-scoped workspace
-- DTOs and removes every direct application-table mutation path.

create or replace function api_v1.get_staff_resource_workspace_v1(
  p_tenant_id uuid
)
returns table (
  tenant_id uuid,
  item_kind text,
  item_id uuid,
  item_key text,
  name text,
  status text,
  revision bigint,
  membership_id uuid,
  public_bio text,
  internal_notes text,
  offered_hours_per_week numeric,
  resource_type_id uuid,
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
declare
  v_catalog_tenant boolean;
  v_staff_tenant boolean;
begin
  v_catalog_tenant := coalesce(
    (select private.can_manage_catalog(p_tenant_id, null)),
    false
  );
  v_staff_tenant := coalesce(
    (select private.can_manage_staff(p_tenant_id, null)),
    false
  );

  if p_tenant_id is null
    or (
      not v_catalog_tenant
      and not v_staff_tenant
      and not exists (
        select 1
        from app.locations as location
        where location.tenant_id = p_tenant_id
          and (
            coalesce(
              (select private.can_manage_catalog(p_tenant_id, location.id)),
              false
            )
            or coalesce(
              (select private.can_manage_staff(p_tenant_id, location.id)),
              false
            )
          )
      )
    )
  then
    raise exception using
      errcode = '42501',
      message = 'staff_resource_authorization_required';
  end if;

  return query
  select
    staff.tenant_id,
    'staff'::text,
    staff.id,
    null::text,
    staff.public_name,
    staff.status,
    case when v_staff_tenant then staff.revision else null::bigint end,
    case when v_staff_tenant then staff.membership_id else null::uuid end,
    case when v_staff_tenant then staff.public_bio else null::text end,
    case when v_staff_tenant then staff.internal_notes else null::text end,
    case when v_staff_tenant then staff.offered_hours_per_week else null::numeric end,
    null::uuid,
    null::text,
    coalesce(locations.ids, '{}'::uuid[]),
    coalesce(services.ids, '{}'::uuid[]),
    coalesce(allocations.future_count, 0)::integer
  from app.staff_profiles as staff
  left join lateral (
    select array_agg(link.location_id order by link.location_id) as ids
    from app.staff_locations as link
    where link.tenant_id = staff.tenant_id
      and link.staff_id = staff.id
      and (
        v_staff_tenant
        or coalesce(
          (select private.can_manage_staff(staff.tenant_id, link.location_id)),
          false
        )
      )
  ) as locations on true
  left join lateral (
    select array_agg(distinct link.service_id order by link.service_id) as ids
    from app.staff_service_locations as link
    where link.tenant_id = staff.tenant_id
      and link.staff_id = staff.id
      and (
        v_staff_tenant
        or coalesce(
          (select private.can_manage_staff(staff.tenant_id, link.location_id)),
          false
        )
      )
  ) as services on true
  left join lateral (
    select count(*)::integer as future_count
    from app.assignment_allocations as allocation
    where allocation.tenant_id = staff.tenant_id
      and allocation.staff_id = staff.id
      and allocation.state in ('held', 'confirmed')
      and allocation.starts_at > statement_timestamp()
      and (
        v_staff_tenant
        or coalesce(
          (select private.can_manage_staff(staff.tenant_id, allocation.location_id)),
          false
        )
      )
  ) as allocations on true
  where staff.tenant_id = p_tenant_id
    and (
      v_staff_tenant
      or exists (
        select 1
        from app.staff_locations as visible_location
        where visible_location.tenant_id = staff.tenant_id
          and visible_location.staff_id = staff.id
          and coalesce(
            (
              select private.can_manage_staff(
                staff.tenant_id,
                visible_location.location_id
              )
            ),
            false
          )
      )
    )

  union all

  select
    resource.tenant_id,
    'resource'::text,
    resource.id,
    case when v_catalog_tenant then resource.key else null::text end,
    resource.public_name,
    resource.status,
    case when v_catalog_tenant then resource.revision else null::bigint end,
    null::uuid,
    null::text,
    case when v_catalog_tenant then resource.internal_notes else null::text end,
    null::numeric,
    case
      when v_catalog_tenant or v_staff_tenant then resource.resource_type_id
      else null::uuid
    end,
    resource_type.name,
    coalesce(locations.ids, '{}'::uuid[]),
    coalesce(services.ids, '{}'::uuid[]),
    coalesce(allocations.future_count, 0)::integer
  from app.resources as resource
  join app.resource_types as resource_type
    on resource_type.tenant_id = resource.tenant_id
    and resource_type.id = resource.resource_type_id
  left join lateral (
    select array_agg(link.location_id order by link.location_id) as ids
    from app.resource_locations as link
    where link.tenant_id = resource.tenant_id
      and link.resource_id = resource.id
      and (
        v_catalog_tenant
        or v_staff_tenant
        or coalesce(
          (select private.can_manage_catalog(resource.tenant_id, link.location_id)),
          false
        )
      )
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
      and (
        v_catalog_tenant
        or v_staff_tenant
        or coalesce(
          (select private.can_manage_catalog(resource.tenant_id, allocation.location_id)),
          false
        )
      )
  ) as allocations on true
  where resource.tenant_id = p_tenant_id
    and (
      v_catalog_tenant
      or v_staff_tenant
      or exists (
        select 1
        from app.resource_locations as visible_location
        where visible_location.tenant_id = resource.tenant_id
          and visible_location.resource_id = resource.id
          and coalesce(
            (
              select private.can_manage_catalog(
                resource.tenant_id,
                visible_location.location_id
              )
            ),
            false
          )
      )
    );
end;
$$;

revoke all on function api_v1.get_staff_resource_workspace_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function api_v1.get_staff_resource_workspace_v1(uuid)
  to authenticated;

create or replace function private.get_staff_resource_choices_v1(
  p_tenant_id uuid,
  p_locale text
)
returns table (
  choice_kind text,
  choice_id uuid,
  choice_key text,
  choice_name text,
  exclusive boolean,
  revision bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_locale not in ('en', 'ar') then
    raise exception using errcode = '22023', message = 'locale_invalid';
  end if;

  perform 1
  from api_v1.get_staff_resource_workspace_v1(p_tenant_id)
  limit 1;

  return query
  select
    'location'::text,
    location.id,
    location.key,
    location.name,
    null::boolean,
    null::bigint
  from app.locations as location
  where location.tenant_id = p_tenant_id
    and location.status = 'active'
    and (
      coalesce((select private.can_manage_staff(p_tenant_id, location.id)), false)
      or coalesce((select private.can_manage_catalog(p_tenant_id, location.id)), false)
    )

  union all

  select
    'service'::text,
    service.id,
    service.key,
    coalesce(localized.name, service.key),
    null::boolean,
    null::bigint
  from app.catalog_services as service
  left join lateral (
    select service_revision.name
    from app.catalog_service_revisions as service_revision
    where service_revision.tenant_id = service.tenant_id
      and service_revision.service_id = service.id
      and service_revision.locale = p_locale
      and service_revision.state = 'published'
    order by service_revision.revision desc
    limit 1
  ) as localized on true
  where service.tenant_id = p_tenant_id
    and service.status = 'active'
    and exists (
      select 1
      from app.catalog_service_locations as service_location
      where service_location.tenant_id = service.tenant_id
        and service_location.service_id = service.id
        and (
          coalesce(
            (select private.can_manage_staff(p_tenant_id, service_location.location_id)),
            false
          )
          or coalesce(
            (select private.can_manage_catalog(p_tenant_id, service_location.location_id)),
            false
          )
        )
    )

  union all

  select
    'resource_type'::text,
    resource_type.id,
    resource_type.key,
    resource_type.name,
    resource_type.exclusive,
    resource_type.revision
  from app.resource_types as resource_type
  where resource_type.tenant_id = p_tenant_id
    and coalesce((select private.can_manage_catalog(p_tenant_id, null)), false)
  order by 1, 4, 2;
end;
$$;

revoke all on function private.get_staff_resource_choices_v1(uuid, text)
  from public, anon, service_role;
grant execute on function private.get_staff_resource_choices_v1(uuid, text)
  to authenticated;

create or replace function api_v1.get_staff_resource_choices_v1(
  p_tenant_id uuid,
  p_locale text
)
returns table (
  choice_kind text,
  choice_id uuid,
  choice_key text,
  choice_name text,
  exclusive boolean,
  revision bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from private.get_staff_resource_choices_v1(p_tenant_id, p_locale);
$$;

revoke all on function api_v1.get_staff_resource_choices_v1(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function api_v1.get_staff_resource_choices_v1(uuid, text)
  to authenticated;

-- Dashboard writes remain RPC-only.
revoke insert, update, delete on
  app.staff_profiles,
  app.staff_services,
  app.staff_locations,
  app.staff_service_locations,
  app.resource_types,
  app.resources,
  app.resource_locations,
  app.resource_requirements,
  app.assignment_allocations
from authenticated;
