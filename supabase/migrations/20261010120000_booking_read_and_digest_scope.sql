create or replace function private.member_scope_covers_booking_v1(
  p_scope text, p_tenant_id uuid, p_membership_id uuid, p_location_id uuid, p_hold_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from app.memberships m
    join app.roles r on r.tenant_id = m.tenant_id and r.id = m.role_id
    where m.tenant_id = p_tenant_id and m.id = p_membership_id and m.status = 'active'
      and (
        exists (select 1 from app.membership_location_scopes s
          where s.tenant_id = m.tenant_id and s.membership_id = m.id
            and s.location_id = p_location_id)
        or (r.location_scope_mode = 'tenant' and not exists (
          select 1 from app.membership_location_scopes s
          where s.tenant_id = m.tenant_id and s.membership_id = m.id))
      )
      and case p_scope
        when 'tenant' then true
        when 'location' then exists (select 1 from app.membership_location_scopes s
          where s.tenant_id = m.tenant_id and s.membership_id = m.id
            and s.location_id = p_location_id)
        when 'own' then exists (
          select 1 from app.assignment_allocations a
          join app.staff_profiles sp on sp.tenant_id = a.tenant_id and sp.id = a.staff_id
          where a.tenant_id = m.tenant_id and a.hold_id = p_hold_id
            and sp.membership_id = m.id)
        else false end
  );
$$;

create function private.can_read_booking_v1(
  p_tenant_id uuid, p_location_id uuid, p_hold_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from app.memberships m
    join app.role_permissions rp on rp.tenant_id = m.tenant_id and rp.role_id = m.role_id
    where m.tenant_id = p_tenant_id
      and m.auth_user_id = (select private.current_auth_user_id())
      and m.status = 'active' and rp.grant_kind = 'direct'
      and rp.permission_key in ('booking.view.any', 'booking.view.own')
      and private.member_scope_covers_booking_v1(
        rp.scope_kind, m.tenant_id, m.id, p_location_id, p_hold_id)
  ) or (
    not exists (select 1 from app.memberships m
      where m.tenant_id = p_tenant_id and m.status = 'active'
        and m.auth_user_id = (select private.current_auth_user_id()))
    and exists (select 1 from private.active_support_grant_v1(p_tenant_id) g
      where g.location_id is null or g.location_id = p_location_id)
  );
$$;
revoke all on function private.can_read_booking_v1(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.can_read_booking_v1(uuid,uuid,uuid) to authenticated;

alter policy bookings_select_scoped on app.bookings
using ((select private.can_read_booking_v1(tenant_id,location_id,hold_id)));
