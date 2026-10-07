begin;
select no_plan();

do $$ begin
  execute format('grant usage on schema %I to authenticated',pg_my_temp_schema()::regnamespace::text);
end $$;

-- A real auth user, so MFA-factor and email lookups behave as in production.
create function pg_temp.user(p_id uuid, p_email text) returns uuid
language sql as $$
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,
    email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values ('00000000-0000-0000-0000-000000000000',p_id,'authenticated','authenticated',
    p_email,'',now(),'{}','{}',now(),now())
  on conflict (id) do nothing;
  select p_id;
$$;

create function pg_temp.verified_factor(p_user uuid) returns void
language sql as $$
  insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at)
  values (gen_random_uuid(),p_user,'test-'||gen_random_uuid(),'totp','verified',now(),now());
$$;

-- Lists the user, then becomes them with aal2 and a TOTP verification p_age seconds ago.
create function pg_temp.as_operator(p_user uuid, p_role text, p_age integer default 60) returns void
language plpgsql as $$
begin
  perform pg_temp.user(p_user, 'op-'||p_user::text||'@example.invalid');
  insert into control_plane.operators(auth_user_id,email,role,expires_at)
  values (p_user,'op-'||p_user::text||'@example.invalid',p_role,
    case when p_role='break_glass' then now()+interval '1 hour' end)
  on conflict (auth_user_id) do update
    set role=excluded.role, expires_at=excluded.expires_at, disabled_at=null;
  perform pg_temp.claims(p_user,'aal2',p_age);
end $$;

create function pg_temp.claims(p_user uuid, p_aal text, p_age integer default 60) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub',p_user,'role','authenticated','aal',p_aal,
    'amr',jsonb_build_array(jsonb_build_object('method','totp',
      'timestamp',extract(epoch from statement_timestamp())::bigint - p_age)))::text, true);
$$;

create function pg_temp.as_worker() returns void
language sql as $$ select set_config('request.jwt.claims',null,true); $$;

-- Boundary: the wrappers exist, are definer pass-throughs, and anon cannot run them.
select has_function('api_v1','get_operator_context_v1',array[]::text[]);
select ok(not has_function_privilege('anon','api_v1.list_audit_events_v1(text,text,uuid,uuid,text,timestamptz,timestamptz,integer,integer)','execute'),
  'anon cannot list audit events');
select ok(not has_schema_privilege('authenticated','control_plane','usage'),
  'the schema stays unnamed to application roles');

-- Not an operator: refused at every level.
select pg_temp.user('c0000000-0000-0000-0000-00000000000e','tenant-user@example.invalid');
select pg_temp.claims('c0000000-0000-0000-0000-00000000000e','aal2');
set local role authenticated;
select throws_ok($$ select * from api_v1.get_operator_context_v1() $$,'42501','policy_denied',
  'a signed-in non-operator is refused');
select throws_ok($$ select api_v1.record_operator_failure_v1('tenant.suspend','policy_denied',null,null,null) $$,
  '42501','policy_denied','and cannot write audit noise');
reset role;

-- Viewer: context works.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000d','viewer');
set local role authenticated;
select is((select role from api_v1.get_operator_context_v1()),'viewer','a viewer reads their own context');
select is((select step_up_seconds from api_v1.get_operator_context_v1()),900,'and learns the step-up window');
reset role;

-- aal1 is refused even when listed.
select pg_temp.claims('c0000000-0000-0000-0000-00000000000d','aal1');
set local role authenticated;
select throws_ok($$ select * from api_v1.get_operator_context_v1() $$,'42501','policy_denied','aal1 is refused');
reset role;

-- Step-up: recent passes, old fails, missing amr fails.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin',60);
select lives_ok($$ select control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1()) $$,
  'a TOTP verification one minute ago satisfies step-up');
select pg_temp.claims('c0000000-0000-0000-0000-00000000000a','aal2',3600);
select throws_ok($$ select control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1()) $$,
  '42501','recent_authentication_required','an hour-old verification does not');
select set_config('request.jwt.claims','{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal2"}',true);
select throws_ok($$ select control_plane.require_operator_v1('admin',900) $$,
  '42501','recent_authentication_required','a token without amr is never recent');
select lives_ok($$ select control_plane.require_operator_v1('admin') $$,
  'but step-up is opt-in per action');

-- Future verification timestamps cannot bypass the recency check.
select pg_temp.claims('c0000000-0000-0000-0000-00000000000a','aal2',-3600);
select throws_ok($$ select control_plane.require_operator_v1('admin',900) $$,
  '42501','recent_authentication_required','a future second-factor timestamp is refused');

-- Idempotency ledger.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin');
select is(control_plane.replay_request_v1('test-key-0000000001','tenant.create'),null,'a new key replays nothing');
select control_plane.remember_request_v1('test-key-0000000001','tenant.create','{"tenant_id":"x"}');
select is(control_plane.replay_request_v1('test-key-0000000001','tenant.create')->>'tenant_id','x','the same key replays the first result');
select throws_ok($$ select control_plane.replay_request_v1('test-key-0000000001','plan.save') $$,
  '23505','idempotency_conflict','reusing a key for another action is refused');
select throws_ok($$ select control_plane.replay_request_v1('short','tenant.create') $$,
  '22023','idempotency_key_invalid','a malformed key is refused');
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000b','admin');
select throws_ok($$ select control_plane.replay_request_v1('test-key-0000000001','tenant.create') $$,
  '23505','idempotency_conflict','another operator cannot replay someone else''s request');

select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin');
select control_plane.remember_request_v1('test-key-payload-00001','tenant.create','{}','{"x":1}');
select throws_ok($$ select control_plane.replay_request_v1('test-key-payload-00001','tenant.create','{"x":2}') $$,
  '23505','idempotency_conflict','same key with a different request fingerprint is refused');

-- Failures are recorded as denied/failed, append-only.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000c','operator');
set local role authenticated;
select lives_ok($$ select api_v1.record_operator_failure_v1('tenant.suspend','policy_denied',null,'tenant','abc') $$,
  'an operator records their own refused attempt');
reset role;
select is((select outcome from control_plane.audit_events where action='tenant.suspend' and operator_id='c0000000-0000-0000-0000-00000000000c'),
  'denied','a refusal is recorded as denied');
select throws_ok($$ select control_plane.record_operator_failure_v1('Bad Action','x',null,null,null) $$,
  '22023','settings_invalid','malformed codes are refused');
select throws_ok($$ select control_plane.write_audit_v1('c0000000-0000-0000-0000-00000000000c','x.y',null,null,null,null,'token sk_live_abcdef',null) $$,
  '23514',null,'a secret-shaped reason cannot be stored');

select ok(not control_plane.contains_no_secret_v1(pg_catalog.jsonb_build_object('nested',
  pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('reason',E'Bearer\tabc')))),
  'secret checks inspect decoded nested strings with escaped whitespace');

-- Audit list: viewer reads, filters, paginates; detail is summarised.
select control_plane.write_audit_v1('c0000000-0000-0000-0000-00000000000a','plan.updated',null,null,'plan','launch',
  'Tightened features','{"plan":"launch","unlisted_key":"hidden"}');
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000d','viewer');
set local role authenticated;
select ok((select count(*) from api_v1.list_audit_events_v1(null,'plan',null,null,null,null,null,10,0)) >= 1,
  'a viewer lists audit events filtered by action family');
select is((select detail from api_v1.list_audit_events_v1(null,'plan.updated',null,null,null,null,null,10,0) limit 1),
  '{"plan":"launch"}'::jsonb,'only allow-listed detail keys leave the database');
select is((select count(*)::int from api_v1.list_audit_events_v1('tightened',null,null,null,null,null,null,10,0)),1,
  'search matches the reason case-insensitively');
select is((select count(*)::int from api_v1.list_audit_events_v1('%',null,null,null,null,null,null,10,0)),0,
  'search treats % literally');
select throws_ok($$ select * from api_v1.export_audit_events_v1(null,null,null,null,null,null,null) $$,
  '42501','policy_denied','a viewer cannot export');
reset role;

-- Export: admin with step-up only, and audited.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin',3600);
set local role authenticated;
select throws_ok($$ select * from api_v1.export_audit_events_v1(null,null,null,null,null,null,null) $$,
  '42501','recent_authentication_required','an admin without recent verification cannot export');
reset role;
select pg_temp.claims('c0000000-0000-0000-0000-00000000000a','aal2',30);
set local role authenticated;
select ok((select count(*) from api_v1.export_audit_events_v1(null,null,null,null,null,null,null)) >= 2,'a recent admin exports');
reset role;
select is((select count(*)::int from control_plane.audit_events where action='audit.exported'),1,'and the export is itself audited');

select * from finish();
rollback;
