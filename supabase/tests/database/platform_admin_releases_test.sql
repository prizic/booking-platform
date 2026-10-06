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

-- Fixture: two active instances on known releases, in canary and general rings.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin',30);
select set_config('test.ta',(select tenant_id::text from control_plane.create_tenant_v2('Ring Canary','ring-canary','ring-canary-create-001')),true);
select set_config('test.tb',(select tenant_id::text from control_plane.create_tenant_v2('Ring General','ring-general','ring-general-create-01')),true);
select control_plane.assign_subscription_v1(current_setting('test.ta')::uuid,'launch','canary','Fixture assignment');
select control_plane.assign_subscription_v1(current_setting('test.tb')::uuid,'launch','general','Fixture assignment');
-- Activation needs a published brand revision. Copy seed tenant A's, so the
-- config, content and content_hash columns stay mutually consistent.
insert into app.brand_revisions(id,tenant_id,brand_id,revision,state,config_version,created_at,published_at,config,content,content_hash)
select gen_random_uuid(),b.tenant_id,b.id,1,'published',r.config_version,now(),now(),r.config,r.content,r.content_hash
from app.brands b cross join app.brand_revisions r
where r.id='a4100000-0000-0000-0000-000000000001'
  and b.tenant_id in (current_setting('test.ta')::uuid,current_setting('test.tb')::uuid);
update app.instances i set deployment_state='active',
  published_brand_revision_id=(select r.id from app.brand_revisions r where r.tenant_id=i.tenant_id)
where i.tenant_id in (current_setting('test.ta')::uuid,current_setting('test.tb')::uuid);
-- Limit global ring selection to the two fixture instances inside this transaction.
update app.instances set deployment_state='provisioning'
where tenant_id not in (current_setting('test.ta')::uuid,current_setting('test.tb')::uuid)
  and deployment_state='active';

insert into control_plane.instance_release_state(tenant_id,instance_id,desired_release,current_release,config_schema_version)
select i.tenant_id,i.id,'88.1.0','88.1.0',3 from app.instances i
where i.tenant_id in (current_setting('test.ta')::uuid,current_setting('test.tb')::uuid);

set local role authenticated;
-- Registration validates like release-contracts.mjs.
select throws_ok($$ select * from api_v1.register_release_v1('1.0','stable',repeat('a',40),3,1,1,'{}',array['n'],array['n'],true,'release-bad-000000001') $$,
  '22023','release_invalid','a non-semver version is refused');
select throws_ok($$ select * from api_v1.register_release_v1('88.2.0','stable','abc',3,1,1,'{}',array['n'],array['n'],true,'release-bad-000000002') $$,
  '22023','release_invalid','a short commit is refused');
select set_config('test.r0',(select release_id::text from api_v1.register_release_v1('88.1.0','stable',repeat('b',40),3,1,1,
  '{}',array['Initial'],array['None'],true,'release-010-000000001')),true);
select set_config('test.r',(select release_id::text from api_v1.register_release_v1('88.2.0','candidate',repeat('c',40),3,1,1,
  array['20260922120000_control_plane_registry'],array['Faster calendar'],array['No action'],true,'release-020-000000001')),true);
select is((select release_id::text from api_v1.register_release_v1('88.2.0','candidate',repeat('c',40),3,1,1,
  array['20260922120000_control_plane_registry'],array['Faster calendar'],array['No action'],true,'release-020-000000001')),
  current_setting('test.r'),'registration is idempotent');
select throws_ok($$ select * from api_v1.register_release_v1('88.2.0','stable',repeat('c',40),3,1,1,
  array['20260922120000_control_plane_registry'],array['Faster calendar'],array['No action'],true,'release-020-000000001') $$,
  '23505','idempotency_conflict','same registration key checks the complete release manifest');

select throws_ok($$ select * from api_v1.register_release_v1('88.2.0','stable',repeat('d',40),3,1,1,'{}',array['n'],array['n'],true,'release-dup-000000001') $$,
  '23505','release_exists','a version is registered once');
select is((select prerequisites from api_v1.list_releases_v1(null,null,10,0) where version='88.2.0'),'{}'::text[],
  'an applied migration and a compatible backend leave no blockers');

-- A release needing an unapplied migration is blocked.
select set_config('test.rx',(select release_id::text from api_v1.register_release_v1('88.3.0','candidate',repeat('e',40),3,1,1,
  array['29990101000000_future_change'],array['Later'],array['Later'],true,'release-030-000000001')),true);
select is((select prerequisites from api_v1.list_releases_v1(null,null,10,0) where version='88.3.0'),array['migrations_missing'],
  'an unapplied migration is a blocker');

select throws_ok($$ select * from api_v1.register_release_v1('88.9.0','stable',repeat('a',40),3,1,1,'{}',
  array['Bearer abc'],array['No action'],true,'release-secret-00000001') $$,
  '22023','secret_rejected','release notes cannot store a credential');

-- Rollout targeting by ring.
select throws_ok(format($$ select * from api_v1.create_rollout_v1(%L,array['early'],null,'Canary first','rollout-none-00000001') $$,current_setting('test.r')),
  '22023','no_targets','a ring with no instances has no targets');
select set_config('test.ro',(select rollout_id::text from api_v1.create_rollout_v1(current_setting('test.r')::uuid,array['canary'],null,
  'Canary first','rollout-020-canary-001')),true);
select throws_ok(format($$ select * from api_v1.create_rollout_v1(%L,array['general'],null,'Canary first','rollout-020-canary-001') $$,current_setting('test.r')),
  '23505','idempotency_conflict','same rollout key cannot select different target rings');

select is((select get_rollout_v1->'counts'->>'pending' from api_v1.get_rollout_v1(current_setting('test.ro')::uuid)),'1',
  'only the canary instance is targeted');
select is((select status from api_v1.start_rollout_v1(current_setting('test.ro')::uuid)),'running','starting queues work');
reset role;
select is((select count(*)::int from control_plane.jobs where kind='publish_release'
  and parameters->>'rollout_id'=current_setting('test.ro')),1,'one publish job per target');
select is((select desired_release from control_plane.instance_release_state where tenant_id=current_setting('test.ta')::uuid),'88.2.0',
  'the target''s desired release moved');

-- The worker reports failure: rollout auto-pauses; retry re-queues; success completes.
select pg_temp.as_worker();
update control_plane.jobs set created_at=(select min(created_at)-interval '1 second' from control_plane.jobs)
where kind='publish_release' and parameters->>'rollout_id'=current_setting('test.ro');
select set_config('test.job',(select job_id::text from control_plane.claim_job_v1(array['publish_release'],60)),true);
select is((select target_status from control_plane.report_rollout_target_v1(current_setting('test.job')::uuid,'failed','smoke_failed',null)),
  'failed','the worker records a failed target');
select is((select status from control_plane.rollouts where id=current_setting('test.ro')::uuid),'paused','a failure pauses the rollout');
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000c','operator');
set local role authenticated;
select is((select retried from api_v1.retry_rollout_targets_v1(current_setting('test.ro')::uuid)),1,'an operator retries failed targets');
reset role;
select pg_temp.as_worker();
update control_plane.jobs set created_at=(select min(created_at)-interval '1 second' from control_plane.jobs)
where kind='publish_release' and parameters->>'rollout_id'=current_setting('test.ro');
select set_config('test.job',(select job_id::text from control_plane.claim_job_v1(array['publish_release'],60)),true);
select throws_ok($$ select * from control_plane.report_rollout_target_v1(current_setting('test.job')::uuid,'succeeded',null,null) $$,
  '22023','transition_not_allowed','success without an observed release is refused');
select throws_ok($$ select * from control_plane.report_rollout_target_v1(current_setting('test.job')::uuid,'succeeded',null,'88.9.0') $$,
  '22023','transition_not_allowed','success for the wrong observed release is refused');
select is((select target_status from control_plane.report_rollout_target_v1(current_setting('test.job')::uuid,'succeeded',null,'88.2.0')),
  'succeeded','the worker records success with the observed release');
select is((select status from control_plane.rollouts where id=current_setting('test.ro')::uuid),'completed','all targets done completes the rollout');
select is((select current_release from control_plane.instance_release_state where tenant_id=current_setting('test.ta')::uuid),'88.2.0',
  'and the observed release is recorded');

-- Rollback: step-up, previous release must be known and compatible.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin',3600);
set local role authenticated;
select throws_ok(format($$ select * from api_v1.rollback_rollout_v1(%L,'Calendar regression found') $$,current_setting('test.ro')),
  '42501','recent_authentication_required','rollback needs step-up');
reset role;
select pg_temp.claims('c0000000-0000-0000-0000-00000000000a','aal2',30);
set local role authenticated;
select is((select status from api_v1.rollback_rollout_v1(current_setting('test.ro')::uuid,'Calendar regression found')),'running',
  'a recent admin queues rollback without claiming external completion');
reset role;
select is((select desired_release from control_plane.instance_release_state where tenant_id=current_setting('test.ta')::uuid),'88.1.0',
  'desired release returns to the previous one');
select is((select status from control_plane.rollout_targets where rollout_id=current_setting('test.ro')::uuid),'rollback_queued',
  'and the target waits for the worker to apply it');

select is((select current_release from control_plane.instance_release_state where tenant_id=current_setting('test.ta')::uuid),'88.2.0',
  'rollback intent preserves the last actual release until a worker reports');
select pg_temp.as_worker();
update control_plane.jobs set created_at=(select min(created_at)-interval '1 second' from control_plane.jobs)
where kind='publish_release' and parameters->>'rollout_id'=current_setting('test.ro');
select set_config('test.rollback_job',(select job_id::text from control_plane.claim_job_v1(array['publish_release'],60)),true);
select is((select rollout_status from control_plane.report_rollout_target_v1(current_setting('test.rollback_job')::uuid,'succeeded',null,'88.1.0')),
  'rolled_back','only the matching restored observation finishes rollback');

-- An irreversible release cannot be rolled back.
select pg_temp.claims('c0000000-0000-0000-0000-00000000000a','aal2',30);
set local role authenticated;
select set_config('test.r4',(select release_id::text from api_v1.register_release_v1('88.4.0','stable',repeat('f',40),3,1,1,
  '{}',array['Contract change'],array['Irreversible'],false,'release-040-000000001')),true);
select set_config('test.ro4',(select rollout_id::text from api_v1.create_rollout_v1(current_setting('test.r4')::uuid,array['general'],null,
  'General wave','rollout-040-general-01')),true);
select throws_ok(format($$ select * from api_v1.rollback_rollout_v1(%L,'Trying anyway now') $$,current_setting('test.ro4')),
  '22023','rollback_not_supported','an irreversible release refuses rollback');
select is((select status from api_v1.cancel_rollout_v1(current_setting('test.ro4')::uuid,'Not needed after all')),'cancelled','a draft is cancellable');
reset role;

-- Viewers read, cannot act; worker reports are worker-only.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000d','viewer');
set local role authenticated;
select ok((select count(*) from api_v1.list_rollouts_v1(null,null,10,0)) >= 2,'a viewer lists rollouts');
select throws_ok(format($$ select * from api_v1.pause_rollout_v1(%L,'viewer tries') $$,current_setting('test.ro')),'42501','policy_denied',
  'a viewer cannot pause');
reset role;
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin');
select throws_ok(format($$ select * from control_plane.report_rollout_target_v1(%L,'succeeded',null,'88.2.0') $$,current_setting('test.job')),
  '42501','policy_denied','an operator cannot report deployment success');

select * from finish();
rollback;
