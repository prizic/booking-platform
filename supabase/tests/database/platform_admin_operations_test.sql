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

-- Fixture: a tenant, its instance in provisioning, and a GitHub installation record.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin');
select set_config('test.t',(select tenant_id::text from control_plane.create_tenant_v2('Ops Tenant','ops-tenant','ops-tenant-create-0001')),true);
select set_config('test.i',(select id::text from app.instances where tenant_id=current_setting('test.t')::uuid),true);
insert into control_plane.instance_infrastructure(tenant_id,instance_id,provider,resource_kind,external_id)
values (current_setting('test.t')::uuid,current_setting('test.i')::uuid,'github','app_installation','inst-ops-1');

-- Local-step constraint fix: a provider-less step may wait on a missing worker.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000c','operator');
select set_config('test.run',(select run_id::text from control_plane.request_provisioning_v1(
  current_setting('test.t')::uuid,current_setting('test.i')::uuid,'ops-tenant','launch','0.1.0',3,1,1,
  '{"default_locale":"en","timezone":"Asia/Riyadh","currency":"SAR"}','ops-tenant-run-0001')),true);
select throws_ok($$ select * from control_plane.request_provisioning_v1(
  current_setting('test.t')::uuid,current_setting('test.i')::uuid,'ops-tenant','launch','0.2.0',3,1,1,
  '{"default_locale":"en","timezone":"Asia/Riyadh","currency":"SAR"}','ops-tenant-run-0001') $$,
  '23505','idempotency_conflict','provisioning replay compares desired release as well as key');
select pg_temp.as_worker();
select set_config('test.step',(select step_id::text from control_plane.claim_provisioning_step_v1(
  current_setting('test.run')::uuid,120,array['local'])),true);
select lives_ok($$ select * from control_plane.complete_provisioning_step_v1(current_setting('test.step')::uuid,
  'waiting',null,'{}',null,'worker_not_implemented',now()+interval '1 hour') $$,
  'worker_not_implemented is an accepted waiting reason (was a check violation)');

-- Provisioning reads.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000d','viewer');
set local role authenticated;
select is((select count(*)::int from api_v1.list_provisioning_runs_v1('waiting',current_setting('test.t')::uuid,null,10,0)),1,'waiting runs are filterable');
select is((select count(*)::int from api_v1.list_provisioning_runs_v1('in_progress',current_setting('test.t')::uuid,null,10,0)),
  0,'in-progress runs exclude a run waiting for an unimplemented worker');
reset role;
update control_plane.provisioning_runs set waiting_reason=null where id=current_setting('test.run')::uuid;
set local role authenticated;
select is((select count(*)::int from api_v1.list_provisioning_runs_v1('in_progress',current_setting('test.t')::uuid,null,10,0)),
  1,'the same nonterminal run is in progress when it is not waiting');
reset role;
update control_plane.provisioning_runs set waiting_reason='worker_not_implemented' where id=current_setting('test.run')::uuid;
set local role authenticated;
select is((select get_provisioning_run_detail_v1->>'tenant_name' from api_v1.get_provisioning_run_detail_v1(current_setting('test.run')::uuid)),
  'Ops Tenant','run detail names the tenant');
select is((select jsonb_array_length(get_provisioning_run_detail_v1->'steps') from api_v1.get_provisioning_run_detail_v1(current_setting('test.run')::uuid)),
  12,'and carries every step');
select ok((select (get_provisioning_run_detail_v1->'steps'->0) ? 'started_at' from api_v1.get_provisioning_run_detail_v1(current_setting('test.run')::uuid)),
  'steps carry timestamps');
select throws_ok(format($$ select * from api_v1.retry_provisioning_run_v1(%L) $$,current_setting('test.run')),
  '42501','policy_denied','a viewer cannot retry');
reset role;

select throws_ok($$ insert into control_plane.jobs(kind,requested_by,reason)
  values ('reconcile_drift','c0000000-0000-0000-0000-00000000000a','Bearer abc') $$,
  '23514',null,'job text is secret-free even for a direct worker write');

-- Jobs: list, detail, cancel, retry, approval.
select set_config('test.job',(select j.id::text from control_plane.jobs j where j.kind='provision_instance'
  and j.tenant_id=current_setting('test.t')::uuid),true);
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000c','operator');
set local role authenticated;
select ok((select count(*) from api_v1.list_jobs_v1('queued','provision_instance',null,10,0)) >= 1,'queued jobs list');
select ok((select get_job_v1 ? 'events' from api_v1.get_job_v1(current_setting('test.job')::uuid)),'job detail has events');
select throws_ok(format($$ select * from api_v1.retry_job_v1(%L,'Retry after fix') $$,current_setting('test.job')),
  '22023','transition_not_allowed','a queued job cannot be retried');
select is((select status from api_v1.cancel_job_v1(current_setting('test.job')::uuid,'Superseded by new request')),
  'cancelled','an operator cancels a queued job');
select throws_ok(format($$ select * from api_v1.cancel_job_v1(%L,'again please') $$,current_setting('test.job')),
  '22023','transition_not_allowed','cancelling twice is refused');
reset role;
select is((select count(*)::int from control_plane.job_events where job_id=current_setting('test.job')::uuid and event='cancelled'),
  1,'cancellation is an event');

select ok(not has_function_privilege('authenticated','api_v1.claim_job_v1(text[],integer)','execute'),
  'authenticated callers have no worker claim grant');
select ok(not has_function_privilege('anon','api_v1.complete_job_v1(uuid,text,text)','execute'),
  'anon has no worker completion grant');

-- Worker boundary: operators cannot claim; workers claim, fail, and operators retry.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000c','operator');
select set_config('test.job2',control_plane.enqueue_operator_job_v1('c0000000-0000-0000-0000-00000000000c',
  'reconcile_drift',current_setting('test.t')::uuid,current_setting('test.i')::uuid,'{}','reconcile-ops-0001')::text,true);
select is(control_plane.enqueue_operator_job_v1('c0000000-0000-0000-0000-00000000000c',
  'reconcile_drift',current_setting('test.t')::uuid,current_setting('test.i')::uuid,'{}','reconcile-ops-0001')::text,
  current_setting('test.job2'),'enqueueing with the same key returns the same job');
select throws_ok($$ select control_plane.enqueue_operator_job_v1('c0000000-0000-0000-0000-00000000000c',
  'reconcile_drift',current_setting('test.t')::uuid,current_setting('test.i')::uuid,'{"changed":true}','reconcile-ops-0001') $$,
  '23505','idempotency_conflict','same job key with a different payload is refused');
-- Claim this fixture ahead of durable demo jobs; the timestamp edit rolls back.
update control_plane.jobs set created_at=(select min(created_at)-interval '1 second' from control_plane.jobs)
where id=current_setting('test.job2')::uuid;

select throws_ok($$ select * from control_plane.claim_job_v1(array['reconcile_drift'],60) $$,'42501','policy_denied',
  'an operator session cannot claim a job');
select pg_temp.as_worker();
select is((select job_id::text from control_plane.claim_job_v1(array['reconcile_drift'],60)),current_setting('test.job2'),'a worker claims it');
select is((select status from control_plane.complete_job_v1(current_setting('test.job2')::uuid,'failed','provider_timeout')),'failed','and reports failure');
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000c','operator');
set local role authenticated;
select throws_ok(format($$ select * from api_v1.cancel_job_v1(%L,'x') $$,current_setting('test.job2')),
  '22023','reason_required','cancelling needs a reason');
select is((select status from api_v1.retry_job_v1(current_setting('test.job2')::uuid,'Provider recovered')),'queued','an operator retries a failed job');
reset role;

-- Destructive approval needs a different admin with step-up.
insert into control_plane.jobs(kind,tenant_id,instance_id,requested_by)
values ('close_instance',current_setting('test.t')::uuid,current_setting('test.i')::uuid,'c0000000-0000-0000-0000-00000000000a');
select set_config('test.close',(select id::text from control_plane.jobs where kind='close_instance' and tenant_id=current_setting('test.t')::uuid),true);
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin',30);
set local role authenticated;
select throws_ok(format($$ select * from api_v1.approve_operator_job_v1(%L) $$,current_setting('test.close')),
  '42501','second_operator_required','the requester cannot approve');
reset role;
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000b','admin',3600);
set local role authenticated;
select throws_ok(format($$ select * from api_v1.approve_operator_job_v1(%L) $$,current_setting('test.close')),
  '42501','recent_authentication_required','approval needs step-up');
reset role;
select pg_temp.claims('c0000000-0000-0000-0000-00000000000b','aal2',30);
set local role authenticated;
select lives_ok(format($$ select * from api_v1.approve_operator_job_v1(%L) $$,current_setting('test.close')),'a second recent admin approves');
select lives_ok(format($$ select * from api_v1.cancel_job_v1(%L,'Customer renewed contract') $$,current_setting('test.close')),
  'an approved or unapproved destructive job can still be cancelled');
reset role;

update control_plane.instance_infrastructure set desired_state='{"installed":true}'
where tenant_id=current_setting('test.t')::uuid;

-- Instances and domains.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000d','viewer');
set local role authenticated;
select ok((select count(*) from api_v1.list_instances_v1('ops',null,null,null,10,0)) = 1,'instances are searchable by tenant');
select is((select health_status from api_v1.list_instances_v1('ops',null,null,null,10,0)),null,
  'an instance nobody observed has no health status — never "healthy"');
select is((select release_drifted from api_v1.list_instances_v1('ops',null,null,null,10,0)),null,
  'unreported release drift is unknown');
select is((select get_instance_v1->'infrastructure'->0->'drifted' from api_v1.get_instance_v1(current_setting('test.i')::uuid)),
  'null'::jsonb,'unobserved infrastructure drift is unknown');
select ok((select get_instance_v1 ? 'infrastructure' from api_v1.get_instance_v1(current_setting('test.i')::uuid)),'instance detail has infrastructure');
reset role;

select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000c','operator');
set local role authenticated;
select throws_ok(format($$ select * from api_v1.add_tenant_domain_v1(%L,%L,'Not A Host','client','domain-ops-0000000001') $$,
  current_setting('test.t'),current_setting('test.i')),'22023','hostname_invalid','a malformed hostname is refused');
select set_config('test.domain',(select domain_id::text from api_v1.add_tenant_domain_v1(current_setting('test.t')::uuid,
  current_setting('test.i')::uuid,'book.ops-tenant.example','client','domain-ops-0000000001')),true);
select is((select domain_id::text from api_v1.add_tenant_domain_v1(current_setting('test.t')::uuid,
  current_setting('test.i')::uuid,'book.ops-tenant.example','client','domain-ops-0000000001')),current_setting('test.domain'),
  'adding the same domain twice with one key is idempotent');
select throws_ok(format($$ select * from api_v1.add_tenant_domain_v1(%L,%L,'different.ops-tenant.example','client','domain-ops-0000000001') $$,
  current_setting('test.t'),current_setting('test.i')),'23505','idempotency_conflict','same domain key cannot select a different host');

select is((select verification_status from api_v1.list_domains_v1('book.ops',null,10,0)),'pending','a new domain is pending, never verified');
select is((select certificate_status from api_v1.list_domains_v1('book.ops',null,10,0)),null,'certificate status is unknown until a worker reports');
select is((select job_id from api_v1.request_domain_verification_v1(current_setting('test.domain')::uuid)),
  (select job_id from api_v1.request_domain_verification_v1(current_setting('test.domain')::uuid)),
  'a second verification request reuses the queued job');
reset role;

update control_plane.jobs set created_at=(select min(created_at)-interval '1 second' from control_plane.jobs)
where kind='verify_domain' and tenant_id=current_setting('test.t')::uuid;
select pg_temp.as_worker();
select set_config('test.domain_job',(select job_id::text from control_plane.claim_job_v1(array['verify_domain'],60)),true);
select throws_ok($$ select * from control_plane.complete_job_v1(current_setting('test.domain_job')::uuid,'succeeded',null) $$,
  '22023','transition_not_allowed','domain verification cannot succeed without persisted evidence');
update app.tenant_domains set verification_status='verified',verified_at=now()
where id=current_setting('test.domain')::uuid;
select is((select status from control_plane.complete_job_v1(current_setting('test.domain_job')::uuid,'succeeded',null)),
  'succeeded','domain verification succeeds after a worker records evidence');

-- Health observations: worker-only writes, secret-free.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin');
select throws_ok(format($$ select control_plane.record_health_observation_v1('instance',%L,%L,'client','http_health','healthy',null,'{}',now()) $$,
  current_setting('test.t'),current_setting('test.i')),'42501','policy_denied','an operator cannot invent an observation');
select pg_temp.as_worker();
select lives_ok(format($$ select control_plane.record_health_observation_v1('instance',%L,%L,'client','http_health','failing','http_503','{}',now()) $$,
  current_setting('test.t'),current_setting('test.i')),'a worker records one');
select throws_ok(format($$ select control_plane.record_health_observation_v1('instance',%L,%L,'client','http_health','failing',null,'{"h":"Bearer abc"}',now()) $$,
  current_setting('test.t'),current_setting('test.i')),'22023','secret_rejected','secret-shaped detail is refused');

-- Deactivation is admin + step-up and audited.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000c','operator');
set local role authenticated;
select throws_ok(format($$ select * from api_v1.deactivate_provisioned_instance_v1(%L,'Tenant asked to stop') $$,current_setting('test.run')),
  '42501','policy_denied','an operator cannot deactivate');
reset role;
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin',30);
set local role authenticated;
select is((select run_state from api_v1.deactivate_provisioned_instance_v1(current_setting('test.run')::uuid,'Tenant asked to stop')),
  'deactivated','a recent admin deactivates');
reset role;

select * from finish();
rollback;
