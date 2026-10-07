-- Read-only audit projection. Values, notes, intake, contacts, provider payloads,
-- and source JSON are never selected. Cursor ordering is (time, stream, id).
create or replace function private.list_dashboard_audit_v1(p_tenant_id uuid,p_stream text default null,p_from timestamptz default null,p_to timestamptz default null,p_actor uuid default null,p_cursor jsonb default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_full boolean;v_rows jsonb;v_last jsonb;v_more boolean;
begin
 if not exists(select 1 from app.memberships m join app.role_permissions rp on rp.tenant_id=m.tenant_id and rp.role_id=m.role_id where exists(select 1 from app.tenants t where t.id=p_tenant_id and t.status='active') and m.tenant_id=p_tenant_id and m.auth_user_id=private.current_auth_user_id() and m.status='active' and rp.permission_key='audit.read' and rp.grant_kind='direct' and rp.scope_kind in ('tenant','location')) then raise exception using errcode='42501',message='audit_not_authorized'; end if;
 v_full:=private.has_direct_capability(p_tenant_id,'audit.read');
 if (p_stream is not null and p_stream not in ('booking','settings','brand','staff','access','catalog','schedule','integration')) or (p_from is not null and p_to is not null and p_to<=p_from) or (p_cursor is not null and (jsonb_typeof(p_cursor)<>'object' or not(p_cursor ?& array['time','stream','id']))) then raise exception using errcode='22023',message='audit_filter_invalid';end if;
 with events as (
 select e.id,e.created_at time,'booking'::text stream,e.event_type action,e.booking_id target_id,'booking'::text target_kind,b.public_reference target_reference,e.outcome,m.auth_user_id actor,e.effective_actor_id effective_actor,e.request_id correlation from app.booking_events e join app.bookings b on b.tenant_id=e.tenant_id and b.id=e.booking_id left join app.memberships m on m.tenant_id=e.tenant_id and m.id=e.actor_membership_id where e.tenant_id=p_tenant_id and (v_full or private.can_decide_booking(p_tenant_id,b.location_id,'audit.read'))
 union all select e.id,e.created_at,'settings','settings_saved',p_tenant_id,'settings',e.revision::text,'succeeded',m.auth_user_id,m.auth_user_id,null::uuid from app.tenant_settings_events e left join app.memberships m on m.tenant_id=e.tenant_id and m.id=e.actor_membership_id where e.tenant_id=p_tenant_id and v_full
 union all select r.id,r.published_at,'brand','brand_published',r.id,'brand',r.revision::text,'succeeded',m.auth_user_id,m.auth_user_id,null::uuid from app.brand_revisions r left join app.memberships m on m.tenant_id=r.tenant_id and m.id=r.published_by_membership_id where r.tenant_id=p_tenant_id and v_full and r.published_at is not null
 union all select e.id,e.created_at,'staff',e.action,e.target_id,'staff',null,e.outcome,m.auth_user_id,e.effective_actor_id,e.request_id from app.staff_resource_audit_events e left join app.memberships m on m.tenant_id=e.tenant_id and m.id=e.actor_membership_id where e.tenant_id=p_tenant_id and (v_full or (e.location_id is not null and private.can_decide_booking(p_tenant_id,e.location_id,'audit.read')))
 union all select e.id,e.created_at,'access',e.action,e.target_id,'access',null,'succeeded',e.actor_id,e.effective_actor_id,e.request_id from app.staff_access_events e where e.tenant_id=p_tenant_id and v_full
 union all select e.id,e.created_at,'catalog',e.action,e.target_id,'catalog',null,'succeeded',e.actor_id,e.effective_actor_id,e.request_id from app.catalog_authoring_events e where e.tenant_id=p_tenant_id and v_full
 union all select e.id,e.created_at,'schedule',e.operation,e.target_id,'schedule',null,e.outcome,e.actor_auth_user_id,e.actor_auth_user_id,e.request_id from app.schedule_audit_events e where e.tenant_id=p_tenant_id and v_full
 union all select e.id,e.created_at,'integration',e.action,e.target_id,'integration',null,'succeeded',e.actor_auth_user_id,e.actor_auth_user_id,e.request_id from app.integration_events e where e.tenant_id=p_tenant_id and v_full
 ), page as (
 select e.* from events e where (p_stream is null or e.stream=p_stream) and (p_from is null or e.time>=p_from) and (p_to is null or e.time<p_to) and (p_actor is null or e.actor=p_actor) and (p_cursor is null or (e.time,e.stream,e.id)<((p_cursor->>'time')::timestamptz,p_cursor->>'stream',(p_cursor->>'id')::uuid)) order by e.time desc,e.stream desc,e.id desc limit 51
 ), named as (
 select p.*,coalesce((select sp.public_name from app.staff_profiles sp join app.memberships m on m.tenant_id=sp.tenant_id and m.id=sp.membership_id where m.tenant_id=p_tenant_id and m.auth_user_id=p.actor limit 1),'') actor_name from page p
 ) select coalesce(jsonb_agg(to_jsonb(n) order by n.time desc,n.stream desc,n.id desc),'[]'::jsonb) into v_rows from named n;
 v_more:=jsonb_array_length(v_rows)>50;if v_more then v_rows:=v_rows-50;end if;
 v_last:=v_rows->(jsonb_array_length(v_rows)-1);
 return jsonb_build_object('rows',v_rows,'cursor',case when v_more then jsonb_build_object('time',v_last->'time','stream',v_last->'stream','id',v_last->'id') else null end);
end; $$;
revoke all on function private.list_dashboard_audit_v1(uuid,text,timestamptz,timestamptz,uuid,jsonb) from public,anon;
grant execute on function private.list_dashboard_audit_v1(uuid,text,timestamptz,timestamptz,uuid,jsonb) to authenticated;
create or replace function api_v1.list_dashboard_audit_v1(p_tenant_id uuid,p_stream text default null,p_from timestamptz default null,p_to timestamptz default null,p_actor uuid default null,p_cursor jsonb default null)
returns jsonb language sql stable security invoker set search_path='' as $$select private.list_dashboard_audit_v1(p_tenant_id,p_stream,p_from,p_to,p_actor,p_cursor);$$;
revoke all on function api_v1.list_dashboard_audit_v1(uuid,text,timestamptz,timestamptz,uuid,jsonb) from public,anon;
grant execute on function api_v1.list_dashboard_audit_v1(uuid,text,timestamptz,timestamptz,uuid,jsonb) to authenticated;
