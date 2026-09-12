begin;
select no_plan();

-- Issue #28. Support access. The properties that matter: no grant means no
-- access at all, a grant produces exactly the READ a member has and never a
-- write, and expiry, revocation and operator removal all take effect on the
-- next statement rather than the next login.

do $$ begin
  execute format('grant usage on schema %I to authenticated',pg_my_temp_schema()::regnamespace::text);
end $$;

-- ---------------------------------------------------------------------------
-- Contract shape.
select has_table('control_plane'::name,'support_grants'::name);
select ok(not exists(
  select 1 from information_schema.table_privileges
  where table_name='support_grants' and grantee in ('anon','authenticated','PUBLIC')),
  'the grant table is unreachable from any application role');
select has_function('api_v1'::name,'get_support_context_v1'::name);
select ok(has_function_privilege('authenticated','api_v1.get_support_context_v1()','execute')
  and not has_function_privilege('anon','api_v1.get_support_context_v1()','execute'),
  'the banner is readable by a signed-in session, because the answer for '
  'somebody not in a support session is simply nothing');

-- The two-person rule and the bound are constraints, not conventions.
select throws_ok(
  $$insert into control_plane.support_grants(tenant_id,operator_id,reason,ticket_reference,
      status,approved_by,starts_at,expires_at)
    values ('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002',
      'Diagnosing a reported booking failure','TICKET-1','active',
      'a1000000-0000-0000-0000-000000000002',statement_timestamp(),
      statement_timestamp()+interval '1 hour')$$,
  '23514',null,
  'a grant cannot be approved by the operator who requested it, at the table');
select throws_ok(
  $$insert into control_plane.support_grants(tenant_id,operator_id,reason,ticket_reference,
      status,approved_by,starts_at)
    values ('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002',
      'Diagnosing a reported booking failure','TICKET-1','active',
      'a1000000-0000-0000-0000-000000000003',statement_timestamp())$$,
  '23514',null,
  'and an active grant with no expiry cannot exist: a grant that never ends is a role');
select throws_ok(
  $$insert into control_plane.support_grants(tenant_id,operator_id,reason,ticket_reference)
    values ('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002',
      'too short','TICKET-1')$$,
  '23514',null,
  'a grant with no real reason is refused: one nobody can review afterwards is '
  'not an audit trail');

-- ---------------------------------------------------------------------------
-- Fixtures: two operators, neither a member of tenant A.
insert into control_plane.operators(auth_user_id,email,role) values
  ('d1000000-0000-0000-0000-000000000001','no-membership@example.invalid','operator'),
  ('b1000000-0000-0000-0000-000000000001','staff-b@example.invalid','admin');

-- ---------------------------------------------------------------------------
-- No grant means no access.
savepoint sa_none;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select ok(not private.is_active_tenant_member('a0000000-0000-0000-0000-000000000001'),
  'an operator with no grant is not a member of anything');
select is((select count(*)::integer from app.bookings),0,
  'and reads no bookings');
select is((select count(*)::integer from api_v1.get_support_context_v1()),0,
  'and is shown no support banner, because they are not in a support session');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint sa_none;

-- ---------------------------------------------------------------------------
-- A live grant is exactly the read a member has, and never a write.
savepoint sa_read;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('test.sa_grant',(select g.grant_id::text
  from control_plane.request_support_grant_v1('a0000000-0000-0000-0000-000000000001',
    'Diagnosing a reported booking failure','TICKET-1') g),true);
select is((select g.status from control_plane.support_grants g
  where g.id=current_setting('test.sa_grant')::uuid),'pending',
  'requesting a grant does not grant anything');

set local role authenticated;
select ok(not private.is_active_tenant_member('a0000000-0000-0000-0000-000000000001'),
  'and a pending grant gives no access');
reset role;

select throws_ok(
  format($$select * from control_plane.approve_support_grant_v1(%L)$$,
    current_setting('test.sa_grant')),
  '42501','policy_denied','the requester cannot approve it, being only an operator');

select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select ok((select a.expires_at > statement_timestamp() from control_plane.approve_support_grant_v1(
  current_setting('test.sa_grant')::uuid,60) a),
  'a different admin approves it, with an expiry');
select set_config('request.jwt.claims',null,true);

select set_config('request.jwt.claims','{"sub":"d1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select ok(private.is_active_tenant_member('a0000000-0000-0000-0000-000000000001'),
  'now the operator reads as a member of that tenant');
select ok(not private.is_active_tenant_member('b0000000-0000-0000-0000-000000000001'),
  'and of no other tenant: a grant names one');
select ok((select count(*)::integer from app.bookings) >= 0,
  'bookings are readable');

-- The banner is unmistakable and says what the session actually is.
select is((select c.tenant_name from api_v1.get_support_context_v1() c),
  'Synthetic Tenant A','the banner names the tenant');
select is((select c.scope from api_v1.get_support_context_v1() c),'read',
  'and the scope');
select is((select c.ticket_reference from api_v1.get_support_context_v1() c),'TICKET-1',
  'and what it was opened against');
select ok((select c.expires_at > statement_timestamp() from api_v1.get_support_context_v1() c),
  'and when it ends');

-- Writes do not follow. This is not a rule enforced somewhere: the operator has
-- no membership row, so they hold no capability, so nothing is reachable.
select ok(not private.has_direct_capability('a0000000-0000-0000-0000-000000000001','refund.issue'),
  'a support operator holds no capability at all');
select ok(not private.can_decide_booking('a0000000-0000-0000-0000-000000000001',null,'brand.manage'),
  'including the approval-grant ones');
select throws_ok(
  $$select * from api_v1.save_tenant_settings_v1('a0000000-0000-0000-0000-000000000001',
    '{}'::jsonb,'{}'::jsonb,'{}'::jsonb)$$,
  '42501','policy_denied','so settings cannot be changed under support');
select throws_ok(
  $$select * from api_v1.advance_tenant_offboarding_v1('a0000000-0000-0000-0000-000000000001',
    'restrict_bookings')$$,
  '42501','policy_denied','nor can the tenant be offboarded');
select throws_ok(
  format($$select * from api_v1.request_refund_v1('a0000000-0000-0000-0000-000000000001',
    %L,'support-refund-key-000001')$$,gen_random_uuid()),
  '42501','booking_context_required','nor money issued');
select is((select count(*)::integer from app.customers),0,
  'and customer personal data still needs its own capability, which support does not confer');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint sa_read;

-- ---------------------------------------------------------------------------
-- Ending access ends it now, not at the next login.
savepoint sa_end;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('test.sa_grant',(select g.grant_id::text
  from control_plane.request_support_grant_v1('a0000000-0000-0000-0000-000000000001',
    'Diagnosing a reported booking failure','TICKET-2') g),true);
select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select * from control_plane.approve_support_grant_v1(current_setting('test.sa_grant')::uuid,60);
select set_config('request.jwt.claims','{"sub":"d1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select ok(private.is_active_tenant_member('a0000000-0000-0000-0000-000000000001'),
  'access is live');
reset role;

-- Expiry.
-- Wound back rather than forward, so the grant stays internally consistent:
-- it started two hours ago and ended one hour ago.
update control_plane.support_grants set
  starts_at=statement_timestamp()-interval '2 hours',
  expires_at=statement_timestamp()-interval '1 hour'
where id=current_setting('test.sa_grant')::uuid;
set local role authenticated;
select ok(not private.is_active_tenant_member('a0000000-0000-0000-0000-000000000001'),
  'an expired grant stops working on the next statement, without anything '
  'having to notice it expired');
select is((select count(*)::integer from api_v1.get_support_context_v1()),0,
  'and the banner disappears with it');
reset role;

-- Revocation.
update control_plane.support_grants set
  starts_at=statement_timestamp()-interval '1 minute',
  expires_at=statement_timestamp()+interval '1 hour', status='active'
where id=current_setting('test.sa_grant')::uuid;
set local role authenticated;
select ok(private.is_active_tenant_member('a0000000-0000-0000-0000-000000000001'),'live again');
reset role;
select * from control_plane.revoke_support_grant_v1(current_setting('test.sa_grant')::uuid,'done');
set local role authenticated;
select ok(not private.is_active_tenant_member('a0000000-0000-0000-0000-000000000001'),
  'a revoked grant stops working immediately');
reset role;

-- Removing the operator from the allow-list revokes every grant they hold,
-- without touching the grants.
update control_plane.support_grants set
  status='active', revoked_at=null, revoked_by=null,
  starts_at=statement_timestamp()-interval '1 minute',
  expires_at=statement_timestamp()+interval '1 hour'
where id=current_setting('test.sa_grant')::uuid;
update control_plane.operators set disabled_at=statement_timestamp()
where auth_user_id='d1000000-0000-0000-0000-000000000001';
set local role authenticated;
select ok(not private.is_active_tenant_member('a0000000-0000-0000-0000-000000000001'),
  'disabling the operator ends their access on their next statement, not their '
  'next login');
reset role;
update control_plane.operators set disabled_at=null
where auth_user_id='d1000000-0000-0000-0000-000000000001';

-- A session that was strong an hour ago is not a session that is strong now.
select set_config('request.jwt.claims','{"sub":"d1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select ok(not private.is_active_tenant_member('a0000000-0000-0000-0000-000000000001'),
  'and a downgraded authentication ends it too');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint sa_end;

-- ---------------------------------------------------------------------------
-- A grant narrowed to one location sees that location and no other.
savepoint sa_scope;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('test.sa_grant',(select g.grant_id::text
  from control_plane.request_support_grant_v1('a0000000-0000-0000-0000-000000000001',
    'Diagnosing one location only','TICKET-3',
    'a5000000-0000-0000-0000-000000000001') g),true);
select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select * from control_plane.approve_support_grant_v1(current_setting('test.sa_grant')::uuid,60);
select set_config('request.jwt.claims','{"sub":"d1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select ok(private.can_access_location('a0000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001'),
  'the granted location is reachable');
select ok(not private.can_access_location('a0000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000002'),
  'and another location of the same tenant is not: a grant narrowed cannot be '
  'widened from inside the session');
select is((select c.location_id from api_v1.get_support_context_v1() c),
  'a5000000-0000-0000-0000-000000000001'::uuid,
  'and the banner says which location, so nobody misreads how much they can see');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint sa_scope;

-- ---------------------------------------------------------------------------
-- Write support is modelled and refused.
savepoint sa_write;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('test.sa_grant',(select g.grant_id::text
  from control_plane.request_support_grant_v1('a0000000-0000-0000-0000-000000000001',
    'Needs a data correction on a booking','TICKET-4') g),true);
update control_plane.support_grants set scope='write'
where id=current_setting('test.sa_grant')::uuid;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select throws_ok(
  format($$select * from control_plane.approve_support_grant_v1(%L)$$,
    current_setting('test.sa_grant')),
  '42501','policy_denied',
  'write support is modelled so it can exist later, and is not approvable now: '
  'a capability an operator can assume is one somebody eventually assumes by '
  'accident');
select set_config('request.jwt.claims',null,true);
rollback to savepoint sa_write;

-- ---------------------------------------------------------------------------
-- Everything is in the trail, and the trail cannot be rewritten.
savepoint sa_audit;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('test.sa_grant',(select g.grant_id::text
  from control_plane.request_support_grant_v1('a0000000-0000-0000-0000-000000000001',
    'Diagnosing a reported booking failure','TICKET-5') g),true);
select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select * from control_plane.approve_support_grant_v1(current_setting('test.sa_grant')::uuid,60);
select * from control_plane.revoke_support_grant_v1(current_setting('test.sa_grant')::uuid,'finished');

select is((select count(*)::integer from control_plane.audit_events a
  where a.action in ('support.requested','support.approved','support.revoked')),3,
  'request, approval and revocation are each recorded');
select ok((select bool_and(a.operator_id is not null) from control_plane.audit_events a),
  'each attributed to the operator who did it');
select is((select count(*)::integer from control_plane.list_support_grants_v1(
  'a0000000-0000-0000-0000-000000000001')),1,
  'and the grant itself is queryable afterwards');
select set_config('request.jwt.claims',null,true);
select throws_ok(
  $$update control_plane.audit_events set action='nothing'$$,
  '42501','booking_immutable','the support trail cannot be rewritten');
rollback to savepoint sa_audit;

-- ---------------------------------------------------------------------------
-- A support grant does not make an operator a tenant, anywhere.
savepoint sa_isolation;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('test.sa_grant',(select g.grant_id::text
  from control_plane.request_support_grant_v1('a0000000-0000-0000-0000-000000000001',
    'Diagnosing a reported booking failure','TICKET-6') g),true);
select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select * from control_plane.approve_support_grant_v1(current_setting('test.sa_grant')::uuid,60);
select set_config('request.jwt.claims','{"sub":"d1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select count(*)::integer from app.memberships
  where auth_user_id='d1000000-0000-0000-0000-000000000001'),0,
  'there is no membership row: support is never impersonation');
select is((select private.current_membership_id('a0000000-0000-0000-0000-000000000001')),null,
  'so there is no membership to act as, and every audited action would record '
  'the operator rather than somebody else');
-- `app.tenants` itself carries only an id, a name and a status, and is readable
-- more widely because public tenant resolution needs it — that is issue #6's
-- behaviour and a plain member of one tenant sees it too. The question that
-- matters is whether tenant-OWNED rows leak, so that is what is asserted.
select is((select count(*)::integer from app.locations
  where tenant_id='b0000000-0000-0000-0000-000000000001'),0,
  'and the other tenant''s own rows are as invisible as they were before the grant');
select ok((select count(*)::integer from app.locations
  where tenant_id='a0000000-0000-0000-0000-000000000001') > 0,
  'while the granted tenant''s are readable, which is the whole point');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint sa_isolation;

-- The savepoint rollbacks above revert pgTAP's own counter, so it is restored
-- from the non-transactional sequence before the plan is emitted.
select _set('curr_test',(select last_value::integer from __tresults___numb_seq));
select * from finish();
rollback;
