begin;
select no_plan();

-- Issue #27. The private control-plane registry. The property that carries this
-- issue is not a policy: `anon` and `authenticated` are never granted USAGE on
-- the `control_plane` schema, so a tenant session cannot name an object in it
-- to be refused. Everything else here is desired-versus-current state, secrets
-- that structurally cannot be stored, and two-person control.

do $$ begin
  execute format('grant usage on schema %I to authenticated',pg_my_temp_schema()::regnamespace::text);
end $$;

-- ---------------------------------------------------------------------------
-- The boundary.
select has_schema('control_plane'::name);
select ok(not has_schema_privilege('anon','control_plane','usage')
  and not has_schema_privilege('authenticated','control_plane','usage'),
  'no application role has USAGE on the control-plane schema, so a tenant '
  'session cannot even name a table in it');
select ok(has_schema_privilege('service_role','control_plane','usage'),
  'the service role can, because the control plane runs as it');

select ok(not exists(
  select 1 from information_schema.table_privileges
  where table_schema='control_plane' and grantee in ('anon','authenticated','PUBLIC')),
  'and no table in it is granted to an application role by any means');
select ok(not exists(
  select 1 from information_schema.routine_privileges
  where routine_schema='control_plane' and grantee in ('anon','authenticated','PUBLIC')),
  'nor any function');
select ok((select bool_and(c.relrowsecurity) from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='control_plane' and c.relkind='r'),
  'every control-plane table still carries row level security, so the schema '
  'grant is a second lock rather than the only one');

-- The one thing that crosses the boundary outward.
select has_function('api_v1'::name,'get_platform_notice_v1'::name);
select ok(has_function_privilege('anon','api_v1.get_platform_notice_v1()','execute'),
  'an incident banner is readable by anybody, because it exists to be read');
select ok(
  pg_get_function_result('api_v1.get_platform_notice_v1()'::regprocedure)
    !~* '(key|kill|flag|tenant|enabled)',
  'and carries a message and an end time only: no flag keys, no kill switches, '
  'nothing about any tenant');

-- ---------------------------------------------------------------------------
-- Secrets cannot be stored, by construction.
select ok(control_plane.contains_no_secret_v1('{"repository":"tenant-a-client"}'::jsonb),
  'an ordinary identifier is fine');
select ok(not control_plane.contains_no_secret_v1('{"key":"sk_live_abc123"}'::jsonb),
  'a Stripe secret key is refused');
select ok(not control_plane.contains_no_secret_v1('{"t":"ghp_aaaaaaaaaaaa"}'::jsonb),
  'a GitHub personal access token is refused');
select ok(not control_plane.contains_no_secret_v1('{"h":{"authorization":"Bearer abc"}}'::jsonb),
  'an authorization header is refused, however deep it is nested');
-- Assembled rather than written out: a literal PEM header in a committed file
-- is exactly what `scripts/check-ci-history.mjs` scans Git history for, and a
-- test fixture that trips the secret scanner is a test fixture that stops the
-- scanner from being useful.
select ok(not control_plane.contains_no_secret_v1(
  jsonb_build_object('k', repeat('-',5) || 'BEGIN RSA PRIVATE KEY' || repeat('-',5))),
  'and a private key block');
select ok(not control_plane.contains_no_secret_v1('{"w":"whsec_abcdef"}'::jsonb),
  'and a webhook signing secret');

select throws_ok(
  $$insert into control_plane.audit_events(operator_id,action,detail)
    values (gen_random_uuid(),'x','{"token":"ghs_aaaaaaaaaaaa"}'::jsonb)$$,
  '23514',null,
  'the refusal is a table constraint, so a provisioning worker that puts a '
  'token in a payload fails loudly rather than quietly writing a key that then '
  'appears in every backup');

-- ---------------------------------------------------------------------------
-- Operator standing is re-read, never trusted from a session.
savepoint cp_operator;
insert into control_plane.operators(auth_user_id,email,role)
values ('a1000000-0000-0000-0000-000000000002','admin-a@example.invalid','admin');

select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
select ok(control_plane.is_operator_v1('admin'),'a listed admin is an operator');
select ok(control_plane.is_operator_v1('viewer'),'and satisfies a lower bar');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
select ok(not control_plane.is_operator_v1('viewer'),
  'without a recent authentication nobody is an operator, however listed');

select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select ok(not control_plane.is_operator_v1('viewer'),
  'and somebody who is not listed is not an operator, however strong their session');

-- Disabling takes effect immediately, not when a token expires.
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
update control_plane.operators set disabled_at=statement_timestamp()
where auth_user_id='a1000000-0000-0000-0000-000000000002';
select ok(not control_plane.is_operator_v1('viewer'),
  'a disabled operator stops being one on the next call, not on the next login');
update control_plane.operators set disabled_at=null
where auth_user_id='a1000000-0000-0000-0000-000000000002';

-- Break-glass is time-boxed by construction.
select throws_ok(
  $$insert into control_plane.operators(auth_user_id,email,role)
    values ('d1000000-0000-0000-0000-000000000001','no-membership@example.invalid','break_glass')$$,
  '23514',null,
  'a break-glass operator without an expiry cannot be created: an account that '
  'can do anything forever is one somebody eventually forgets about');
select set_config('request.jwt.claims',null,true);
rollback to savepoint cp_operator;

-- ---------------------------------------------------------------------------
-- Plans project into the tenant product, which nothing inside a tenant can do.
savepoint cp_plan;
insert into control_plane.operators(auth_user_id,email,role)
values ('a1000000-0000-0000-0000-000000000002','admin-a@example.invalid','admin');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);

select is((select p.plan_key from control_plane.assign_plan_v1(
  'a0000000-0000-0000-0000-000000000001','launch') p),'launch',
  'assigning a plan records the subscription');
select ok((select count(*)::integer from app.tenant_entitlements e
  where e.tenant_id='a0000000-0000-0000-0000-000000000001' and e.granted) = 6,
  'and projects its feature list into the table the product reads');
select is((select a.action from control_plane.audit_events a order by a.created_at desc limit 1),
  'plan.assigned','every operator action is recorded');

-- A plan change that removes a feature has to actually remove it.
insert into control_plane.plans(key,name,entitlements)
values ('starter','Starter', array['booking.online']);
select * from control_plane.assign_plan_v1('a0000000-0000-0000-0000-000000000001','starter');
select is((select count(*)::integer from app.tenant_entitlements e
  where e.tenant_id='a0000000-0000-0000-0000-000000000001' and e.granted),1,
  'downgrading revokes what the new plan does not include, rather than merely '
  'failing to add it');
select ok(not exists(select 1 from app.tenant_entitlements e
  where e.tenant_id='a0000000-0000-0000-0000-000000000001'
    and e.feature_key='payments.deposits' and e.granted),
  'the removed feature is revoked by name');

select throws_ok(
  $$select * from control_plane.assign_plan_v1('a0000000-0000-0000-0000-000000000001','nonexistent')$$,
  '22023','plan_unknown','an unknown plan is refused');
select set_config('request.jwt.claims',null,true);
rollback to savepoint cp_plan;

-- A viewer cannot assign a plan, and a non-operator cannot do anything.
savepoint cp_authority;
insert into control_plane.operators(auth_user_id,email,role)
values ('a1000000-0000-0000-0000-000000000003','manager-a@example.invalid','viewer');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal2"}',true);
select lives_ok($$select * from control_plane.get_fleet_registry_v1()$$,
  'a viewer can read the fleet');
select throws_ok(
  $$select * from control_plane.assign_plan_v1('a0000000-0000-0000-0000-000000000001','launch')$$,
  '42501','policy_denied','but cannot change what a tenant is entitled to');
select throws_ok(
  $$select * from control_plane.enqueue_job_v1('provision_instance')$$,
  '42501','policy_denied','nor queue privileged work');

select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select throws_ok($$select * from control_plane.get_fleet_registry_v1()$$,
  '42501','policy_denied',
  'and a tenant member who is not an operator cannot read the fleet at all');
select set_config('request.jwt.claims',null,true);
rollback to savepoint cp_authority;

-- ---------------------------------------------------------------------------
-- Desired versus current, and drift as a value rather than a surprise.
savepoint cp_drift;
insert into control_plane.operators(auth_user_id,email,role)
values ('a1000000-0000-0000-0000-000000000002','admin-a@example.invalid','operator');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);

select ok(not (select d.drifted from control_plane.record_infrastructure_state_v1(
  'a0000000-0000-0000-0000-000000000001','a4200000-0000-0000-0000-000000000001',
  'github','repository','R_kgDOabc123','{"visibility":"private"}'::jsonb) d),
  'a resource with nothing asked of it has not drifted');
select is((select f.attempts from control_plane.instance_infrastructure f
  where f.external_id='R_kgDOabc123'),1,'the attempt is counted');
select isnt((select f.last_success_at from control_plane.instance_infrastructure f
  where f.external_id='R_kgDOabc123'),null,'and a clean observation is a success');

-- Now state what we wanted, and observe something different.
update control_plane.instance_infrastructure
set desired_state='{"visibility":"private","archived":false}'::jsonb
where external_id='R_kgDOabc123';
select ok((select d.drifted from control_plane.record_infrastructure_state_v1(
  'a0000000-0000-0000-0000-000000000001','a4200000-0000-0000-0000-000000000001',
  'github','repository','R_kgDOabc123','{"visibility":"public","archived":true}'::jsonb) d),
  'a resource that no longer matches what we asked for is reported as drifted, '
  'because a call that returned 200 last Tuesday is not a fact about today');
select is((select f.attempts from control_plane.instance_infrastructure f
  where f.external_id='R_kgDOabc123'),2,'observations accumulate rather than replace');

-- A failed observation keeps the last success and names the error.
select * from control_plane.record_infrastructure_state_v1(
  'a0000000-0000-0000-0000-000000000001','a4200000-0000-0000-0000-000000000001',
  'github','repository','R_kgDOabc123','{}'::jsonb,'rate_limited');
select is((select f.last_error_code from control_plane.instance_infrastructure f
  where f.external_id='R_kgDOabc123'),'rate_limited',
  'a failure is a stable code, never a provider body');
select isnt((select f.last_success_at from control_plane.instance_infrastructure f
  where f.external_id='R_kgDOabc123'),null,
  'and the last success is kept, which is the number that says how stale this is');

select throws_ok(
  $$select * from control_plane.record_infrastructure_state_v1(
    'a0000000-0000-0000-0000-000000000001','a4200000-0000-0000-0000-000000000001',
    'github','repository','R_kgDOabc123','{"token":"ghp_aaaaaaaaaaaa"}'::jsonb)$$,
  '22023','secret_rejected','and an observation carrying a credential is refused');

select ok((select r.infrastructure_total >= 1 from control_plane.get_fleet_registry_v1() r
  where r.tenant_id='a0000000-0000-0000-0000-000000000001'),
  'the registry counts what each instance depends on');
select ok((select r.infrastructure_failing >= 1 from control_plane.get_fleet_registry_v1() r
  where r.tenant_id='a0000000-0000-0000-0000-000000000001'),
  'and how much of it is failing');
select set_config('request.jwt.claims',null,true);
rollback to savepoint cp_drift;

-- ---------------------------------------------------------------------------
-- Privileged work is a job, and destructive work needs two people.
savepoint cp_jobs;
insert into control_plane.operators(auth_user_id,email,role) values
  ('a1000000-0000-0000-0000-000000000002','admin-a@example.invalid','admin'),
  ('a1000000-0000-0000-0000-000000000003','manager-a@example.invalid','admin');

select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
select set_config('test.cp_job',(select j.job_id::text from control_plane.enqueue_job_v1(
  'close_instance','a0000000-0000-0000-0000-000000000001',
  'a4200000-0000-0000-0000-000000000001') j),true);
select is((select j.status from control_plane.jobs j
  where j.id=current_setting('test.cp_job')::uuid),'queued',
  'destructive work is queued rather than done from a request handler');
select is((select j.approved_by from control_plane.jobs j
  where j.id=current_setting('test.cp_job')::uuid),null,'and is not approved yet');

select throws_ok(
  format($$select * from control_plane.approve_job_v1(%L)$$,current_setting('test.cp_job')),
  '42501','second_operator_required',
  'the operator who asked for it cannot approve it: two-person control means '
  'not the same person twice');

select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal2"}',true);
select is((select a.status from control_plane.approve_job_v1(
  current_setting('test.cp_job')::uuid) a),'queued','a different admin can approve it');
select isnt((select j.approved_by from control_plane.jobs j
  where j.id=current_setting('test.cp_job')::uuid),null,'and the approval is attributed');
select is((select count(*)::integer from control_plane.audit_events a
  where a.action in ('job.enqueued','job.approved')),2,
  'both halves are in the audit trail');

select throws_ok(
  $$select * from control_plane.enqueue_job_v1('provision_instance',null,null,
    '{"token":"ghs_aaaaaaaaaaaa"}'::jsonb)$$,
  '22023','secret_rejected','and a job carrying a credential is refused');
select set_config('request.jwt.claims',null,true);

select throws_ok(
  $$update control_plane.audit_events set action='nothing'$$,
  '42501','booking_immutable','the operator trail cannot be rewritten');
rollback to savepoint cp_jobs;

-- ---------------------------------------------------------------------------
-- The incident banner.
savepoint cp_notice;
insert into control_plane.platform_flags(key,enabled,kind,message_en,message_ar)
values ('incident.degraded',true,'incident_banner',
  'Bookings may be slow while we fix a problem.',
  'قد يكون الحجز بطيئاً بينما نعالج مشكلة.');

set local role anon;
select is((select n.message_en from api_v1.get_platform_notice_v1() n),
  'Bookings may be slow while we fix a problem.',
  'a live incident banner is readable without signing in');
select isnt((select n.message_ar from api_v1.get_platform_notice_v1() n),null,
  'in both languages, because a banner half the audience cannot read is half a banner');
reset role;

update control_plane.platform_flags set enabled=false where key='incident.degraded';
set local role anon;
select is((select count(*)::integer from api_v1.get_platform_notice_v1()),0,
  'and a disabled one shows nothing');
reset role;

-- A kill switch is not a banner and never leaks through this surface.
insert into control_plane.platform_flags(key,enabled,kind)
values ('kill.bookings',true,'kill_switch');
set local role anon;
select is((select count(*)::integer from api_v1.get_platform_notice_v1()),0,
  'a kill switch is not a banner and is never disclosed to a visitor');
reset role;

select throws_ok(
  $$insert into control_plane.platform_flags(key,enabled,kind,message_en)
    values ('incident.half',true,'incident_banner','English only')$$,
  '23514',null,'and a half-translated banner cannot be created at all');
rollback to savepoint cp_notice;

-- The savepoint rollbacks above revert pgTAP's own counter, so it is restored
-- from the non-transactional sequence before the plan is emitted.
select _set('curr_test',(select last_value::integer from __tresults___numb_seq));
select * from finish();
rollback;
