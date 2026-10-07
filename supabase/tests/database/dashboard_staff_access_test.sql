begin;
select no_plan();
select has_table('app'::name,'staff_access_events'::name);
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app' and c.relname='staff_access_events'),'access events have RLS');
select ok(not has_function_privilege('anon','api_v1.get_staff_access_workspace_v1(uuid)','execute'),'anonymous cannot read access');
select ok(not has_function_privilege('authenticated','api_v1.claim_staff_invitation_delivery_v1()','execute'),'tenant session cannot claim worker jobs');
select ok(not has_function_privilege('service_role','api_v1.change_staff_access_v1(uuid,uuid,text,uuid,bigint,uuid,uuid[],text)','execute'),'worker cannot administer membership');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_like($$select api_v1.get_staff_access_workspace_v1('a0000000-0000-0000-0000-000000000001')$$,'%not_authorized%','ordinary staff cannot read access administration');
reset role;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_like($$select api_v1.get_staff_access_workspace_v1('a0000000-0000-0000-0000-000000000001')$$,'%not_authorized%','location manager cannot administer login access');
reset role;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_like($$select api_v1.get_staff_access_workspace_v1('a0000000-0000-0000-0000-000000000001')$$,'%not_authorized%','revoked membership cannot read access');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','a1000000-0000-0000-0000-000000000002','role','authenticated','aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp())::bigint)))::text,true);
set local role authenticated;
select is((api_v1.get_staff_access_workspace_v1('a0000000-0000-0000-0000-000000000001')->>'version')::integer,1,'administrator reads versioned workspace');
select throws_like($$select api_v1.get_staff_access_workspace_v1('b0000000-0000-0000-0000-000000000001')$$,'%not_authorized%','administrator cannot read another tenant');
select throws_like($$select api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001','a9f00000-0000-4000-8000-000000000001','revoke_membership','a3000000-0000-0000-0000-000000000002',1)$$,'%last_administrator_required%','final administrator cannot be revoked');
select throws_like($$select api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001','a9f00000-0000-4000-8000-000000000002','edit_membership','a3000000-0000-0000-0000-000000000001',99,'a2000000-0000-0000-0000-000000000001','{}')$$,'%revision_conflict%','stale membership edit refused');
select throws_like($$select api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001','a9f00000-0000-4000-8000-000000000003','invite',null,null,'a2000000-0000-0000-0000-000000000001',array['b5000000-0000-0000-0000-000000000001'::uuid],'new@example.invalid')$$,'%invalid_request%','cross-tenant location reference refused');
select is((api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001','a9f00000-0000-4000-8000-000000000004','invite',null,null,'a2000000-0000-0000-0000-000000000001',array['a5000000-0000-0000-0000-000000000001'::uuid],'no-membership@example.invalid')->>'revision')::integer,1,'administrator queues a staff invitation');
select is((api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001','a9f00000-0000-4000-8000-000000000004','invite',null,null,'a2000000-0000-0000-0000-000000000001',array['a5000000-0000-0000-0000-000000000001'::uuid],'no-membership@example.invalid')->>'replayed')::boolean,true,'same request replays without another invitation/job');
select throws_like($$select api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001','a9f00000-0000-4000-8000-000000000004','invite',null,null,'a2000000-0000-0000-0000-000000000001','{}','other@example.invalid')$$,'%idempotency_conflict%','changed request cannot reuse invitation attempt');
select ok(not exists(select 1 from app.staff_access_events where result::text like '%@%' or result::text like '%token%'),'audit contains no email or token material');
reset role;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_like($$select api_v1.accept_staff_invitation_v1((select target_id from app.staff_access_events where request_id='a9f00000-0000-4000-8000-000000000004'))$$,'%invitation_unavailable%','other identity cannot accept an invitation');
reset role;
-- Save the invitation selector without granting unrelated identities audit access.
select set_config('test.invitation_id',(select target_id::text from app.staff_access_events where request_id='a9f00000-0000-4000-8000-000000000004'),true);
select set_config('request.jwt.claims','{"sub":"d1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((api_v1.accept_staff_invitation_v1(current_setting('test.invitation_id')::uuid)->>'replayed')::boolean,false,'confirmed invited email obtains membership');
select is((api_v1.accept_staff_invitation_v1(current_setting('test.invitation_id')::uuid)->>'replayed')::boolean,true,'accepted invitation replay returns existing membership');
reset role;
select is((select count(*)::integer from app.memberships where tenant_id='a0000000-0000-0000-0000-000000000001' and auth_user_id='d1000000-0000-0000-0000-000000000001'),1,'acceptance creates exactly one membership');
select is((select count(*)::integer from private.staff_invitation_deliveries where invitation_id=current_setting('test.invitation_id')::uuid),1,'invitation replay created one delivery job');
select throws_like($$update app.staff_access_events set action='changed'$$,'%booking_immutable%','audit rows are append-only');

-- Custom roles (ADR-0019) through the same staff-access RPC.
select set_config('request.jwt.claims',jsonb_build_object('sub','a1000000-0000-0000-0000-000000000002','role','authenticated','aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp())::bigint)))::text,true);
set local role authenticated;
select is((api_v1.get_staff_access_workspace_v2('a0000000-0000-0000-0000-000000000001')->>'version')::integer,2,'administrator reads the v2 workspace');
select ok((select bool_and((r->>'assignable')::boolean) from jsonb_array_elements(api_v1.get_staff_access_workspace_v2('a0000000-0000-0000-0000-000000000001')->'roles') r where (r->>'is_builtin')::boolean),'an administrator may assign every built-in role');
select set_config('test.greeter',api_v1.save_role_v1(p_tenant_id=>'a0000000-0000-0000-0000-000000000001',p_request_id=>'a9f00000-0000-4000-8000-000000000020',
  p_name_en=>'Greeter',p_name_ar=>'المرحب',p_location_scope_mode=>'tenant',p_grants=>'[{"permission_key":"booking.view.any","grant_kind":"direct","scope_kind":"tenant"}]')->>'role_id',true);
select is((api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001','a9f00000-0000-4000-8000-000000000021','edit_membership','a3000000-0000-0000-0000-000000000001',1,current_setting('test.greeter')::uuid,'{}')->>'revision')::integer,2,'a member moves onto a custom role');
select ok((api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001','a9f00000-0000-4000-8000-000000000022','invite',null,null,current_setting('test.greeter')::uuid,'{}','greeter@example.invalid')->>'id') is not null,'an invitation names a custom role');
select is((select r->>'name_en' from jsonb_array_elements(api_v1.get_staff_access_workspace_v2('a0000000-0000-0000-0000-000000000001')->'roles') r where r->>'id'=current_setting('test.greeter')),'Greeter','v2 names custom roles');
reset role;
select case when to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
  ok(exists(select 1 from realtime.messages where event='authorization_changed' and topic='tenant:a0000000-0000-0000-0000-000000000001'
    and payload->>'membership_id'='a3000000-0000-0000-0000-000000000001'),'a membership change tells open sessions to re-authorize')
  else pass('realtime is not installed; the broadcast is skipped') end;
select case when to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
  ok(not exists(select 1 from realtime.messages where event='authorization_changed' and (payload::text like '%@%' or payload ? 'grants')),'the broadcast carries identifiers only')
  else pass('realtime is not installed; the broadcast is skipped') end;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_like($$select api_v1.get_staff_access_workspace_v2('a0000000-0000-0000-0000-000000000001')$$,'%not_authorized%','a location manager cannot read the v2 workspace');
reset role;
select * from finish();
rollback;
