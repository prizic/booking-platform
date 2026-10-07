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

-- Create (admin), idempotent.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin');
set local role authenticated;
select set_config('test.t1',(select tenant_id::text from api_v1.create_tenant_v2('North Clinic','north-clinic','create-north-clinic-0001')),true);
select is((select tenant_id::text from api_v1.create_tenant_v2('North Clinic','north-clinic','create-north-clinic-0001')),
  current_setting('test.t1'),'resubmitting the same form returns the same tenant');
select is((select replayed from api_v1.create_tenant_v2('North Clinic','north-clinic','create-north-clinic-0001')),true,
  'and says it was a replay');
select is((select tenant_id::text from api_v1.create_tenant_v2(' North Clinic ','north-clinic','create-north-clinic-0001')),
  current_setting('test.t1'),'whitespace-normalized tenant payload replays');
select throws_ok($$ select * from api_v1.create_tenant_v2('Different Clinic','north-clinic','create-north-clinic-0001') $$,
  '23505','idempotency_conflict','same key cannot create a different tenant');

select throws_ok($$ select * from api_v1.create_tenant_v2(' ','x-y','create-bad-name-00001') $$,'22023','tenant_name_invalid',
  'a blank name is refused');
reset role;
select is((select count(*)::int from app.tenants where name='North Clinic'),1,'only one tenant exists');
select is((select count(*)::int from control_plane.audit_events where action='tenant.created'
  and tenant_id=current_setting('test.t1')::uuid),1,'creation is audited once');

-- Operators cannot create; viewers cannot update.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000c','operator');
set local role authenticated;
select throws_ok($$ select * from api_v1.create_tenant_v2('X','x','create-by-operator-0001') $$,'42501','policy_denied',
  'an operator cannot originate a tenant');
reset role;
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000d','viewer');
set local role authenticated;
select ok((select count(*) from api_v1.list_tenants_v1('north',null,null,null,20,0)
  where tenant_id=current_setting('test.t1')::uuid) = 1,'a viewer finds the tenant by search');
select is((select get_tenant_v1->'tenant'->>'name' from api_v1.get_tenant_v1(current_setting('test.t1')::uuid)),
  'North Clinic','and reads its detail');
select ok((select get_tenant_v1 ? 'audit' from api_v1.get_tenant_v1(current_setting('test.t1')::uuid)),'detail carries audit history');
select ok(not (select get_tenant_v1::text ~* '(customer|booking)' from api_v1.get_tenant_v1(current_setting('test.t1')::uuid)),
  'detail never carries tenant customers or bookings');
select throws_ok($$ select api_v1.get_tenant_v1('00000000-0000-0000-0000-000000000099') $$,'P0002','not_found',
  'an unknown tenant is not_found');
select throws_ok(format($$ select * from api_v1.update_tenant_v1(%L,'New',now()) $$,current_setting('test.t1')),
  '42501','policy_denied','a viewer cannot rename');
reset role;

-- Update with optimistic concurrency.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000c','operator');
set local role authenticated;
select throws_ok(format($$ select * from api_v1.update_tenant_v1(%L,'North Clinic Group','2000-01-01') $$,current_setting('test.t1')),
  '40001','stale_revision','a stale edit is refused');
select lives_ok(format($$ select * from api_v1.update_tenant_v1(%L,'North Clinic Group',
  (select (get_tenant_v1->'tenant'->>'updated_at')::timestamptz from api_v1.get_tenant_v1(%L))) $$,
  current_setting('test.t1'),current_setting('test.t1')),'a current edit succeeds');
reset role;

-- Suspend/reactivate: admin, reason, step-up, legal transitions only.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin',3600);
set local role authenticated;
select throws_ok(format($$ select * from api_v1.set_tenant_status_v1(%L,'suspended','Payment dispute open','active') $$,current_setting('test.t1')),
  '42501','recent_authentication_required','suspension needs a recent verification');
reset role;
select pg_temp.claims('c0000000-0000-0000-0000-00000000000a','aal2',30);
set local role authenticated;
select throws_ok(format($$ select * from api_v1.set_tenant_status_v1(%L,'suspended','short','active') $$,current_setting('test.t1')),
  '22023','reason_required','a reason under ten characters is refused');
select throws_ok(format($$ select * from api_v1.set_tenant_status_v1(%L,'suspended','Payment dispute open','suspended') $$,current_setting('test.t1')),
  '40001','stale_revision','acting on a stale status is refused');
select is((select status from api_v1.set_tenant_status_v1(current_setting('test.t1')::uuid,'suspended','Payment dispute open','active')),
  'suspended','a recent admin suspends with a reason');
select throws_ok(format($$ select * from api_v1.set_tenant_status_v1(%L,'closed','Closing the account','suspended') $$,current_setting('test.t1')),
  '22023','transition_not_allowed','closing is not a status flip');
reset role;
select is((select reason from control_plane.audit_events where action='tenant.suspended'
  and tenant_id=current_setting('test.t1')::uuid),'Payment dispute open',
  'the reason is in the audit trail');

-- Closure: confirmation, suspended first, two-person approval job, no deletion.
select pg_temp.claims('c0000000-0000-0000-0000-00000000000a','aal2',30);
set local role authenticated;
select throws_ok(format($$ select * from api_v1.request_tenant_closure_v1(%L,'Contract ended in writing','Wrong Name','close-north-000000001') $$,current_setting('test.t1')),
  '22023','confirmation_mismatch','closure requires typing the tenant name');
select is((select array_length(job_ids,1) from api_v1.request_tenant_closure_v1(current_setting('test.t1')::uuid,
  'Contract ended in writing','North Clinic Group','close-north-000000001')),1,'one close job per instance');
select throws_ok(format($$ select * from api_v1.request_tenant_closure_v1(%L,'Different closure reason','North Clinic Group','close-north-000000001') $$,current_setting('test.t1')),
  '23505','idempotency_conflict','closure replay checks the tenant and reason');

reset role;
select ok((select approved_by is null and status='queued' from control_plane.jobs where kind='close_instance'
  and tenant_id=current_setting('test.t1')::uuid),'the close job waits for a second admin');
select is((select status from app.tenants where id=current_setting('test.t1')::uuid),'suspended','nothing was closed or deleted');

select pg_temp.claims('c0000000-0000-0000-0000-00000000000a','aal2',30);
set local role authenticated;
select is((select status from api_v1.set_tenant_status_v1(current_setting('test.t1')::uuid,'active','Dispute resolved by finance','suspended')),
  'active','reactivation works');
reset role;

-- A tenant session never reaches any of this.
select pg_temp.user('c0000000-0000-0000-0000-00000000000e','tenant-user@example.invalid');
select pg_temp.claims('c0000000-0000-0000-0000-00000000000e','aal2');
set local role authenticated;
select throws_ok($$ select * from api_v1.list_tenants_v1() $$,'42501','policy_denied','a tenant session is refused');
reset role;

select * from finish();
rollback;
