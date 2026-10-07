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

-- Exactly one usable admin to start (others from earlier fixtures are absent in this file).
update control_plane.operators set disabled_at = now() where role in ('admin','break_glass');
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin',30);
select pg_temp.verified_factor('c0000000-0000-0000-0000-00000000000a');
select pg_temp.user('c0000000-0000-0000-0000-00000000000b','admin-b@example.invalid');
select pg_temp.user('c0000000-0000-0000-0000-00000000000f','new-person@example.invalid');

set local role authenticated;
-- Operator directory.
select ok((select mfa_verified from api_v1.list_operators_v1() where operator_id='c0000000-0000-0000-0000-00000000000a'),
  'the directory shows verified MFA');
select throws_ok($$ select * from api_v1.add_operator_v1('nobody@example.invalid','viewer',null,'Hire onboarding') $$,
  'P0002','account_not_found','only an existing account can be added');
select lives_ok($$ select * from api_v1.add_operator_v1('NEW-PERSON@example.invalid','viewer',null,'Hire onboarding') $$,
  'an admin adds an operator by email, case-insensitively');
select throws_ok($$ select * from api_v1.add_operator_v1('new-person@example.invalid','viewer',null,'Hire onboarding') $$,
  '23505','operator_exists','adding twice is refused');

-- Last usable admin is protected.
select throws_ok($$ select * from api_v1.set_operator_role_v1('c0000000-0000-0000-0000-00000000000a','operator',null,'Stepping back now') $$,
  '42501','last_admin_protected','the only admin cannot demote themselves');
select throws_ok($$ select * from api_v1.disable_operator_v1('c0000000-0000-0000-0000-00000000000a','Leaving the company') $$,
  '42501','last_admin_protected','or be disabled');

-- An admin without verified MFA does not count as usable.
select lives_ok($$ select * from api_v1.add_operator_v1('admin-b@example.invalid','admin',null,'Second admin') $$,'a second admin is added');
select throws_ok($$ select * from api_v1.disable_operator_v1('c0000000-0000-0000-0000-00000000000a','Leaving the company') $$,
  '42501','last_admin_protected','an admin with no verified factor is not a usable admin');
reset role;
select pg_temp.verified_factor('c0000000-0000-0000-0000-00000000000b');
set local role authenticated;
select lives_ok($$ select * from api_v1.set_operator_role_v1('c0000000-0000-0000-0000-00000000000a','operator',null,'Stepping back now') $$,
  'with a second usable admin, demotion works');
reset role;

-- Break-glass: bounded, never self-granted, step-up.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000b','admin',30);
set local role authenticated;
select throws_ok($$ select * from api_v1.set_operator_role_v1('c0000000-0000-0000-0000-00000000000b','break_glass',now()+interval '1 hour','Incident 42 response') $$,
  '42501','self_grant_denied','nobody grants themselves break-glass');
select throws_ok($$ select * from api_v1.set_operator_role_v1('c0000000-0000-0000-0000-00000000000a','break_glass',now()+interval '9 hours','Incident 42 response') $$,
  '22023','expiry_invalid','break-glass longer than eight hours is refused');
select lives_ok($$ select * from api_v1.set_operator_role_v1('c0000000-0000-0000-0000-00000000000a','break_glass',now()+interval '1 hour','Incident 42 response') $$,
  'a bounded grant to someone else works');
reset role;
select is((select count(*)::int from control_plane.audit_events where action='operator.role_changed'
  and reason='Incident 42 response'),1,'with its reason audited');

-- Support access: request (operator), approve (other admin, step-up), revoke.
select set_config('test.t',(select tenant_id::text from control_plane.create_tenant_v2('Support Tenant','support-tenant','support-tenant-create-1')),true);
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000c','operator');
set local role authenticated;
select throws_ok($$ select * from api_v1.request_support_grant_v1(current_setting('test.t')::uuid,
  E'Bearer\tabcdefghijk','TICKET-1042',null,60) $$,'22023','secret_rejected','support reasons cannot persist credentials');
select set_config('test.g',(select grant_id::text from api_v1.request_support_grant_v1(current_setting('test.t')::uuid,
  'Customer cannot see Tuesday slots','TICKET-1042',null,60)),true);
select is((select status from api_v1.list_support_grants_v2('pending',current_setting('test.t')::uuid,10,0)),
  'pending','the request is pending');
reset role;
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000b','admin',3600);
set local role authenticated;
select throws_ok(format($$ select * from api_v1.approve_support_access_v1(%L,60) $$,current_setting('test.g')),
  '42501','recent_authentication_required','approval needs step-up');
reset role;
select pg_temp.claims('c0000000-0000-0000-0000-00000000000b','aal2',30);
set local role authenticated;
select is((select status from api_v1.approve_support_access_v1(current_setting('test.g')::uuid,60)),'active','a recent admin approves');
select is((select requested_by_email from api_v1.list_support_grants_v2('active',current_setting('test.t')::uuid,10,0)),
  'op-c0000000-0000-0000-0000-00000000000c@example.invalid','active access shows who holds it');
select is((select status from api_v1.revoke_support_grant_v1(current_setting('test.g')::uuid,'Issue resolved')),'revoked','and it can be ended');
reset role;

-- Health reads: unknown is explicit, stale is computed.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000d','viewer');
set local role authenticated;
select ok(exists (select 1 from api_v1.list_health_v1('unknown',null,50,0)
  where tenant_id=current_setting('test.t')::uuid),'an unobserved instance is listed as unknown');
reset role;
select pg_temp.as_worker();
select control_plane.record_health_observation_v1('instance',current_setting('test.t')::uuid,
  (select id from app.instances where tenant_id=current_setting('test.t')::uuid),'client','http_health','healthy',null,'{}',now()-interval '2 hours');
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000d','viewer');
set local role authenticated;
select is((select freshness from api_v1.list_health_v1(null,'instance',50,0) where tenant_id=current_setting('test.t')::uuid),
  'stale','a two-hour-old healthy observation is stale, not healthy-now');
select ok(exists (select 1 from api_v1.list_alerts_v1() where kind='stale_observation'),'and raises a stale alert');
select ok(exists (select 1 from api_v1.list_alerts_v1() where kind='break_glass_active'),'active break-glass is an alert');

-- Overview: real counts and explicit unknowns.
select ok((select (get_overview_v1->>'tenant_total')::int >= 1 from api_v1.get_overview_v1()),'overview counts tenants');
select ok((select (get_overview_v1->'health'->>'unobserved')::int >= 0 from api_v1.get_overview_v1()),'overview reports unobserved instances');
reset role;

-- Integrations: references only, connection checks are jobs.
-- Establish an unobserved fixture state, then restore durable demo state on rollback.
update control_plane.integrations set configured_fingerprint=null,configured_reported_at=null,
  last_check_at=null,last_check_outcome=null,last_check_error_code=null,verified_at=null
where provider='github';
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000b','admin',30);
set local role authenticated;
select is((select status from api_v1.list_integrations_v1() where provider='github'),'not_configured',
  'an integration nobody has reported on is not configured');
select throws_ok($$ select * from api_v1.save_integration_references_v1('github',array['ghp_abcdefghijklmnop']) $$,
  '22023','reference_invalid','a token-shaped reference is refused');
select lives_ok($$ select * from api_v1.save_integration_references_v1('github',array['GITHUB_APP_ID','GITHUB_APP_PRIVATE_KEY']) $$,
  'environment variable names are accepted');
select is((select job_id from api_v1.request_integration_check_v1('github')),(select job_id from api_v1.request_integration_check_v1('github')),
  'a second check request reuses the queued job');
reset role;
select pg_temp.as_worker();
select control_plane.record_integration_status_v1('github',repeat('a',64),'reachable',null,false);
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000d','viewer');
set local role authenticated;
select is((select status from api_v1.list_integrations_v1() where provider='github'),'reachable',
  'reachable is distinct from verified');
reset role;

-- Platform flags.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000b','admin',30);
set local role authenticated;
select throws_ok($$ select * from api_v1.save_platform_flag_v1('maintenance.oct','incident_banner',true,'Maintenance tonight',null,null,null,'Planned maintenance') $$,
  '22023','flag_invalid','a banner needs both languages');
select throws_ok($$ select * from api_v1.save_platform_flag_v1('maintenance.secret','incident_banner',true,
  E'Bearer\tabcdefghijk','صيانة الليلة',null,null,'Planned maintenance') $$,'22023','secret_rejected','platform banner text cannot persist credentials');
select lives_ok($$ select * from api_v1.save_platform_flag_v1('maintenance.oct','incident_banner',true,'Maintenance tonight','صيانة الليلة',null,null,'Planned maintenance') $$,
  'a bilingual banner is saved');
reset role;
select is((select message_en from api_v1.get_platform_notice_v1()),'Maintenance tonight','and reaches tenants through the existing notice');

-- Tenant sessions see none of it.
select pg_temp.user('c0000000-0000-0000-0000-00000000000e','tenant-user@example.invalid');
select pg_temp.claims('c0000000-0000-0000-0000-00000000000e','aal2');
set local role authenticated;
select throws_ok($$ select * from api_v1.list_operators_v1() $$,'42501','policy_denied','tenant sessions cannot list operators');
select throws_ok($$ select api_v1.get_overview_v1() $$,'42501','policy_denied','or read the overview');
reset role;

select * from finish();
rollback;
