-- Published choices, authorized independently from catalog drafting.
create or replace function private.get_operational_choices_v1(p_tenant_id uuid,p_locale text)
returns jsonb language sql stable security definer set search_path='' as $$
 with allowed_locations as (
 select l.* from app.locations l where l.tenant_id=p_tenant_id and l.status='active' and exists(select 1 from app.tenants t where t.id=l.tenant_id and t.status='active') and (
 private.can_decide_booking(p_tenant_id,l.id,'booking.view.any') or private.can_decide_booking(p_tenant_id,l.id,'booking.create_on_behalf') or exists(select 1 from app.staff_profiles sp join app.staff_locations sl on sl.tenant_id=sp.tenant_id and sl.staff_id=sp.id join app.memberships m on m.tenant_id=sp.tenant_id and m.id=sp.membership_id join app.role_permissions rp on rp.tenant_id=m.tenant_id and rp.role_id=m.role_id where sp.tenant_id=l.tenant_id and sl.location_id=l.id and m.status='active' and m.auth_user_id=private.current_auth_user_id() and rp.permission_key='booking.view.own' and rp.grant_kind='direct'))
 ), offers as (
 select sr.service_id id,sr.name,sl.location_id,lr.name location_name,l.time_zone,sr.payment_mode,sr.approval_required,private.can_decide_booking(p_tenant_id,l.id,'booking.create_on_behalf') can_create
 from app.catalog_service_revisions sr join app.catalog_publications p on p.tenant_id=sr.tenant_id and p.id=sr.publication_id and p.state='published' join app.catalog_services s on s.tenant_id=sr.tenant_id and s.id=sr.service_id and s.status='active' join app.catalog_service_locations sl on sl.tenant_id=s.tenant_id and sl.service_id=s.id join allowed_locations l on l.id=sl.location_id join app.catalog_location_revisions lr on lr.tenant_id=l.tenant_id and lr.location_id=l.id and lr.publication_id=p.id and lr.state='published' and lr.locale=p_locale where sr.tenant_id=p_tenant_id and sr.state='published' and sr.locale=p_locale
 ) select jsonb_build_object('offers',coalesce((select jsonb_agg(to_jsonb(o) order by o.name,o.location_name) from offers o),'[]'::jsonb),
 'staff',coalesce((select jsonb_agg(jsonb_build_object('id',sp.id,'name',sp.public_name,'location_id',sl.location_id)) from app.staff_profiles sp join app.staff_locations sl on sl.tenant_id=sp.tenant_id and sl.staff_id=sp.id join allowed_locations l on l.id=sl.location_id where sp.tenant_id=p_tenant_id and sp.status='active' and (private.can_decide_booking(p_tenant_id,l.id,'booking.view.any') or private.can_decide_booking(p_tenant_id,l.id,'booking.create_on_behalf') or sp.membership_id=private.current_membership_id(p_tenant_id))),'[]'::jsonb),
 'resources',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.public_name,'location_id',rl.location_id)) from app.resources r join app.resource_locations rl on rl.tenant_id=r.tenant_id and rl.resource_id=r.id join allowed_locations l on l.id=rl.location_id where r.tenant_id=p_tenant_id and r.status in ('active','maintenance') and (private.can_decide_booking(p_tenant_id,l.id,'booking.view.any') or private.can_decide_booking(p_tenant_id,l.id,'booking.create_on_behalf'))),'[]'::jsonb));
$$;
revoke all on function private.get_operational_choices_v1(uuid,text) from public,anon;
grant execute on function private.get_operational_choices_v1(uuid,text) to authenticated;
create or replace function api_v1.get_operational_choices_v1(p_tenant_id uuid,p_locale text default 'en')
returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_operational_choices_v1(p_tenant_id,p_locale); $$;
revoke all on function api_v1.get_operational_choices_v1(uuid,text) from public,anon;
grant execute on function api_v1.get_operational_choices_v1(uuid,text) to authenticated;
