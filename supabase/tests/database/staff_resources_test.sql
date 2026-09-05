begin;
select plan(21);

select has_table('app'::name,'staff_profiles'::name);
select has_table('app'::name,'resources'::name);
select has_table('app'::name,'assignment_allocations'::name);
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app' and c.relname='staff_profiles'),'staff profiles have RLS');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app' and c.relname='resources'),'resources have RLS');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app' and c.relname='assignment_allocations'),'allocations have RLS');

reset role;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
insert into app.staff_profiles(id,tenant_id,public_name) values ('a8000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Alex Staff');
select is((select count(*)::integer from app.staff_profiles where tenant_id='a0000000-0000-0000-0000-000000000001'),1,'tenant admin can create staff');
select throws_like($$insert into app.staff_profiles(id,tenant_id,public_name) values ('b8000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','Cross tenant')$$,'%row-level security%','tenant admin cannot create another tenant staff');
insert into app.resource_types(id,tenant_id,key,name) values ('a8100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','room','Room');
insert into app.resources(id,tenant_id,resource_type_id,key,public_name) values ('a8200000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a8100000-0000-0000-0000-000000000001','room-one','Room One');
select throws_like($$insert into app.resources(id,tenant_id,resource_type_id,key,public_name) values ('b8200000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','b8100000-0000-0000-0000-000000000001','bad-room','Bad')$$,'%violates foreign key%','cross-tenant resource type is rejected structurally');
insert into app.staff_services(tenant_id,staff_id,service_id) values ('a0000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001');
insert into app.staff_locations(tenant_id,staff_id,location_id) values ('a0000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001');
select is((select count(*)::integer from api_v1.get_assignment_candidates_v1('a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001') where staff_id='a8000000-0000-0000-0000-000000000001'),1,'active eligible staff is offered');
update app.resources set status='maintenance' where id='a8200000-0000-0000-0000-000000000001';
select is((select count(*)::integer from app.resources where id='a8200000-0000-0000-0000-000000000001'),1,'maintenance resource remains visible to operators');
select ok((select has_function_privilege('anon','api_v1.get_assignment_candidates_v1(uuid,uuid)','execute')),'anonymous gets only candidate RPC');
select throws_like($$select * from app.staff_profiles$$,'%permission denied%','anonymous cannot read staff table');

insert into app.assignment_allocations(id,tenant_id,staff_id,starts_at,ends_at) values ('a8300000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001',now()+interval '1 day',now()+interval '1 day 1 hour');
select throws_like($$select * from api_v1.deactivate_staff_v1('a0000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001','invalid',null,gen_random_uuid(),'test')$$,'%deactivation_resolution_required%','future allocation requires explicit resolution');
insert into app.staff_profiles(id,tenant_id,public_name) values ('a8000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','Replacement Staff');
select is((select outcome from api_v1.deactivate_staff_v1('a0000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001','reassign','a8000000-0000-0000-0000-000000000002',gen_random_uuid(),'staff unavailable')), 'reassigned','deactivation records explicit reassignment outcome');
select is((select status from app.staff_profiles where id='a8000000-0000-0000-0000-000000000001'),'inactive','staff is inactive after safe resolution');
select is((select count(*)::integer from app.staff_resource_audit_events where target_id='a8000000-0000-0000-0000-000000000001'),1,'deactivation creates audit evidence');
select ok((select redacted_diff ? 'status' from app.staff_resource_audit_events where target_id='a8000000-0000-0000-0000-000000000001'),'audit diff is redacted and minimal');
select ok((select not (redacted_diff ? 'internal_notes') from app.staff_resource_audit_events where target_id='a8000000-0000-0000-0000-000000000001'),'audit excludes sensitive notes');

reset role;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((select count(*)::integer from app.staff_profiles where tenant_id='a0000000-0000-0000-0000-000000000001'),0,'other tenant staff is hidden');
select throws_like($$insert into app.staff_services(tenant_id,staff_id,service_id) values ('b0000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001')$$,'%row-level security%','cross-tenant staff link is denied');

reset role;
select * from finish();
rollback;
