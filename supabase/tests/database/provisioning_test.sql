begin;
select no_plan();

-- Issue #30. Resumable instance provisioning.
--
-- Every test here is a provider behaving the way providers behave: succeeding
-- twice, timing out after having succeeded, rate-limiting, renaming a resource
-- behind our back, or waiting on a customer who has not changed their DNS. The
-- claim the state machine makes is that none of those produce a duplicate
-- resource, a falsely active instance, or a deleted one.

do $$ begin
  execute format('grant usage on schema %I to authenticated',pg_my_temp_schema()::regnamespace::text);
end $$;

-- A worker that claims the next step and reports it succeeded. Standing in for
-- the thing issues #31 and #32 will put real provider calls inside.
create function pg_temp.advance(p_run uuid) returns text
language plpgsql as $$
declare c record;
begin
  select * into c from control_plane.claim_provisioning_step_v1(p_run) limit 1;
  if not found then return null; end if;
  perform control_plane.complete_provisioning_step_v1(
    c.step_id,'succeeded',
    case when c.provider is not null then 'ext-' || c.step_key end,
    jsonb_build_object('active',true));
  return c.step_key;
end $$;

create function pg_temp.seed_instance(p_instance uuid) returns void
language sql as $$
  insert into app.instances(id,tenant_id,brand_id,published_brand_revision_id,deployment_state)
  values (p_instance,'a0000000-0000-0000-0000-000000000001',
    'a4000000-0000-0000-0000-000000000001',null,'provisioning');
  insert into control_plane.instance_infrastructure(
    tenant_id,instance_id,provider,resource_kind,external_id,desired_state,observed_state,observed_at)
  values ('a0000000-0000-0000-0000-000000000001',p_instance,'github','app_installation',
    'install-' || p_instance::text,'{}'::jsonb,'{}'::jsonb,statement_timestamp());
$$;

create function pg_temp.become_operator(p_role text default 'admin') returns void
language plpgsql as $$
begin
  insert into control_plane.operators(auth_user_id,email,role)
  values ('a1000000-0000-0000-0000-000000000002','admin-a@example.invalid',p_role)
  on conflict (auth_user_id) do update set role=excluded.role;
  perform set_config('request.jwt.claims',
    '{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
end $$;

create function pg_temp.become_worker() returns void
language plpgsql as $$ begin perform set_config('request.jwt.claims',null,true); end $$;

create function pg_temp.request(p_instance uuid, p_slug text, p_key text default null,
  p_request jsonb default null)
returns table (run_id uuid, state text, rejected text[])
language sql as $$
  select * from control_plane.request_provisioning_v1(
    'a0000000-0000-0000-0000-000000000001',p_instance,p_slug,'launch','0.1.0',3,1,1,
    coalesce(p_request,
      '{"default_locale":"en","timezone":"Asia/Riyadh","currency":"SAR"}'::jsonb),
    coalesce(p_key,'idem-' || p_slug));
$$;

-- ---------------------------------------------------------------------------
-- The boundary is the same one issue #27 established, and the new tables are
-- inside it rather than beside it.
select ok(not exists(
  select 1 from information_schema.table_privileges
  where table_schema='control_plane'
    and table_name in ('provisioning_runs','provisioning_steps','provisioning_events')
    and grantee in ('anon','authenticated','PUBLIC')),
  'no application role is granted anything on a provisioning table');
select ok((select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n
  on n.oid=c.relnamespace where n.nspname='control_plane'
    and c.relname in ('provisioning_runs','provisioning_steps','provisioning_events')),
  'and each still carries row level security, so the schema grant is a second '
  'lock rather than the only one');
select ok(not exists(
  select 1 from information_schema.routine_privileges
  where routine_schema='control_plane' and grantee in ('anon','authenticated','PUBLIC')),
  'nor is any control-plane function executable by an application role');

-- ---------------------------------------------------------------------------
-- A valid config-only tenant reaches active through the whole machine.
savepoint pv_happy;
select pg_temp.seed_instance('a4200000-0000-0000-0000-0000000000aa');
select pg_temp.become_operator('operator');

select is((select r.rejected from pg_temp.request('a4200000-0000-0000-0000-0000000000aa','northside') r),
  '{}'::text[],'a complete request is accepted');
select is((select count(*)::integer from control_plane.provisioning_steps s
  join control_plane.provisioning_runs r on r.id=s.run_id where r.slug='northside'),12,
  'and lays down every step of the sequence up front, so resuming is a query '
  'rather than a reconstruction');
select is((select count(distinct s.idempotency_key)::integer
  from control_plane.provisioning_steps s
  join control_plane.provisioning_runs r on r.id=s.run_id where r.slug='northside'),12,
  'each with its own stable key to present to the provider');
select is((select j.kind from control_plane.jobs j where j.tenant_id='a0000000-0000-0000-0000-000000000001'
  order by j.created_at desc limit 1),'provision_instance',
  'privileged work is queued as a job, never called from the request');

select pg_temp.become_worker();
select is(pg_temp.advance((select id from control_plane.provisioning_runs where slug='northside')),
  'validate_request','the first claim is the first step');
select is((select r.state from control_plane.provisioning_runs r where r.slug='northside'),
  'validated','whose success moves the run forward');
select is(pg_temp.advance((select id from control_plane.provisioning_runs where slug='northside')),
  'create_tenant_records','and the second claim is the second step, never a later one');

-- Drive the rest.
select is((select count(*)::integer from (
  select pg_temp.advance((select id from control_plane.provisioning_runs where slug='northside'))
  from generate_series(1,10)) x),10,'the remaining steps run in order');
select is((select r.state from control_plane.provisioning_runs r where r.slug='northside'),
  'health_checked','which is as far as the worker can take it');
select is(pg_temp.advance((select id from control_plane.provisioning_runs where slug='northside')),
  null,'there is nothing left to claim');

-- Activation is a gate, and it refuses with every reason at once.
select is((select a.blocked from control_plane.activate_instance_v1(
    (select id from control_plane.provisioning_runs where slug='northside')) a),
  array['brand_not_published','environment_unverified','release_mismatch'],
  'finishing the last step does not make an instance active: activation is a '
  'gate that re-checks, and it reports every blocker rather than the first');

update control_plane.instance_release_state
set current_release='0.1.0',
    environment_fingerprint=repeat('a',64)
where instance_id='a4200000-0000-0000-0000-0000000000aa';
update app.instances set published_brand_revision_id='a4100000-0000-0000-0000-000000000001'
where id='a4200000-0000-0000-0000-0000000000aa';

select ok((select a.activated from control_plane.activate_instance_v1(
    (select id from control_plane.provisioning_runs where slug='northside')) a),
  'with every gate satisfied the instance activates');
select is((select i.deployment_state from app.instances i
  where i.id='a4200000-0000-0000-0000-0000000000aa'),'active',
  'and the instance the product reads says so too');
select ok((select a.activated from control_plane.activate_instance_v1(
    (select id from control_plane.provisioning_runs where slug='northside')) a),
  'activating an already active run is a no-op rather than an error');
select ok((select jsonb_array_length(g.timeline) from control_plane.get_provisioning_run_v1(
    (select id from control_plane.provisioning_runs where slug='northside')) g) > 24,
  'the timeline holds every claim and outcome, which is what an operator reads '
  'afterwards instead of a log they do not have');
rollback to savepoint pv_happy;

-- ---------------------------------------------------------------------------
-- Validation happens before any provider is called, and reports everything.
savepoint pv_validation;
select pg_temp.seed_instance('a4200000-0000-0000-0000-0000000000bb');
select pg_temp.become_operator('operator');

select is((select r.rejected from pg_temp.request('a4200000-0000-0000-0000-0000000000bb','Bad Slug') r),
  array['slug_invalid'],'a slug that cannot name a repository is refused');
select is((select r.rejected from pg_temp.request('a4200000-0000-0000-0000-0000000000bb','valid-slug',null,
  '{"default_locale":"fr","timezone":"Mars/Olympus","currency":"sar"}'::jsonb) r),
  array['currency_invalid','locale_invalid','timezone_invalid'],
  'and every bad field is reported at once, because an operator who discovers '
  'blockers one round trip at a time stops checking');
select is((select r.rejected from control_plane.request_provisioning_v1(
  'a0000000-0000-0000-0000-000000000001','a4200000-0000-0000-0000-0000000000bb','slug-b','launch',
  '0.1.0',3,2,3,'{"default_locale":"en","timezone":"UTC","currency":"SAR"}'::jsonb,'idem-b') r),
  array['backend_contract_incompatible'],
  'a release that cannot talk to the backend this fleet runs is refused before '
  'anything is built for it');
select is((select r.rejected from pg_temp.request('a4200000-0000-0000-0000-0000000000bb','slug-c',null,
  '{"default_locale":"en","timezone":"UTC","currency":"SAR",'
  '"domains":[{"hostname":"client.tenant-b.example.invalid","application":"client"}]}'::jsonb) r),
  array['domain_taken'],'a hostname another tenant already owns is refused');
select is((select r.rejected from control_plane.request_provisioning_v1(
  'a0000000-0000-0000-0000-000000000001','a4200000-0000-0000-0000-000000000001','slug-d','launch',
  '0.1.0',3,1,1,'{"default_locale":"en","timezone":"UTC","currency":"SAR"}'::jsonb,'idem-d') r),
  array['instance_not_provisioning'],
  'and an instance already serving traffic cannot be provisioned over');

delete from control_plane.instance_infrastructure
where instance_id='a4200000-0000-0000-0000-0000000000bb';
select is((select r.rejected from pg_temp.request('a4200000-0000-0000-0000-0000000000bb','slug-e') r),
  array['github_installation_missing'],
  'a provider whose app is not installed is a prerequisite, not a step that '
  'will fail six times first');
rollback to savepoint pv_validation;

-- ---------------------------------------------------------------------------
-- Requesting twice resumes; requesting differently is a mistake.
savepoint pv_idempotent;
select pg_temp.seed_instance('a4200000-0000-0000-0000-0000000000cc');
select pg_temp.become_operator('operator');
select is((select count(*)::integer from pg_temp.request('a4200000-0000-0000-0000-0000000000cc','resume-me')),1,
  'the first request creates a run');
select is(
  (select r.run_id from pg_temp.request('a4200000-0000-0000-0000-0000000000cc','resume-me') r),
  (select r2.id from control_plane.provisioning_runs r2 where r2.slug='resume-me'),
  're-sending the same request returns the same run rather than forking a second one');
select is((select count(*)::integer from control_plane.provisioning_steps s
  join control_plane.provisioning_runs r on r.id=s.run_id where r.slug='resume-me'),12,
  'and does not lay down a second set of steps');
select throws_ok(
  $$select * from control_plane.request_provisioning_v1(
    'a0000000-0000-0000-0000-000000000001','a4200000-0000-0000-0000-0000000000cc','other-slug',
    'launch','0.1.0',3,1,1,'{"default_locale":"ar","timezone":"UTC","currency":"SAR"}'::jsonb,'different-key')$$,
  '23505','idempotency_conflict',
  'but a different request for the same instance is refused rather than '
  'silently replacing what is already half-built');
rollback to savepoint pv_idempotent;

-- ---------------------------------------------------------------------------
-- A provider that answers twice must not produce two of anything.
savepoint pv_duplicate;
select pg_temp.seed_instance('a4200000-0000-0000-0000-0000000000dd');
select pg_temp.become_operator('operator');
select * from pg_temp.request('a4200000-0000-0000-0000-0000000000dd','twice');
select pg_temp.become_worker();
select pg_temp.advance((select id from control_plane.provisioning_runs where slug='twice'));
select pg_temp.advance((select id from control_plane.provisioning_runs where slug='twice'));

-- Claim the repository step, then report success twice.
select is((select c.step_key from control_plane.claim_provisioning_step_v1(
  (select id from control_plane.provisioning_runs where slug='twice')) c),'seed_repository',
  'the repository step is claimed');
select is((select c.step_status from control_plane.complete_provisioning_step_v1(
  (select s.id from control_plane.provisioning_steps s
   join control_plane.provisioning_runs r on r.id=s.run_id
   where r.slug='twice' and s.step_key='seed_repository'),
  'succeeded','R_kgDOnew','{"active":true}'::jsonb) c),'succeeded','it succeeds once');
select ok((select c.duplicate from control_plane.complete_provisioning_step_v1(
  (select s.id from control_plane.provisioning_steps s
   join control_plane.provisioning_runs r on r.id=s.run_id
   where r.slug='twice' and s.step_key='seed_repository'),
  'succeeded','R_kgDOsecond','{"active":true}'::jsonb) c),
  'and reporting it again is recognised as a duplicate, because a provider '
  'that times out after succeeding will be retried');
select is((select count(*)::integer from control_plane.instance_infrastructure f
  where f.instance_id='a4200000-0000-0000-0000-0000000000dd' and f.resource_kind='repository'),1,
  'the duplicate does not create a second repository record');
select is((select s.external_id from control_plane.provisioning_steps s
  join control_plane.provisioning_runs r on r.id=s.run_id
  where r.slug='twice' and s.step_key='seed_repository'),'R_kgDOnew',
  'nor does it overwrite the identifier of the resource that actually exists');
rollback to savepoint pv_duplicate;

-- ---------------------------------------------------------------------------
-- Failure, backoff, exhaustion, and an operator's retry.
savepoint pv_failure;
select pg_temp.seed_instance('a4200000-0000-0000-0000-0000000000ee');
select pg_temp.become_operator('operator');
select * from pg_temp.request('a4200000-0000-0000-0000-0000000000ee','flaky');
select pg_temp.become_worker();
select pg_temp.advance((select id from control_plane.provisioning_runs where slug='flaky'));
select pg_temp.advance((select id from control_plane.provisioning_runs where slug='flaky'));

select is((select c.step_status from control_plane.complete_provisioning_step_v1(
  (select c2.step_id from control_plane.claim_provisioning_step_v1(
    (select id from control_plane.provisioning_runs where slug='flaky')) c2),
  'failed',null,'{}'::jsonb,'rate_limited') c),'pending',
  'a failure inside the retry budget leaves the step runnable rather than dead');
select ok((select s.retry_after from control_plane.provisioning_steps s
  join control_plane.provisioning_runs r on r.id=s.run_id
  where r.slug='flaky' and s.step_key='seed_repository') > statement_timestamp(),
  'with a backoff, so a provider having a bad minute is not hammered through it');
select is((select r.state from control_plane.provisioning_runs r where r.slug='flaky'),
  'tenant_created','and the run is not marked failed for one bad attempt');
select is((select count(*)::integer from control_plane.claim_provisioning_step_v1(
  (select id from control_plane.provisioning_runs where slug='flaky'))),0,
  'the step is not claimable again until its backoff has passed');

-- Spend the rest of the budget.
do $$
declare v_run uuid; v_step uuid; i integer;
begin
  select id into v_run from control_plane.provisioning_runs where slug='flaky';
  for i in 1..10 loop
    update control_plane.provisioning_steps set retry_after=null
    where run_id=v_run and step_key='seed_repository';
    v_step := null;
    select step_id into v_step from control_plane.claim_provisioning_step_v1(v_run);
    exit when v_step is null;
    perform control_plane.complete_provisioning_step_v1(v_step,'failed',null,'{}'::jsonb,'rate_limited');
  end loop;
end $$;

select is((select s.status from control_plane.provisioning_steps s
  join control_plane.provisioning_runs r on r.id=s.run_id
  where r.slug='flaky' and s.step_key='seed_repository'),'failed',
  'a step that spends its whole budget stops retrying itself');
select is((select r.state from control_plane.provisioning_runs r where r.slug='flaky'),'failed',
  'and a required step failing terminally fails the run');
select is((select a.blocked from control_plane.activate_instance_v1(
  (select id from control_plane.provisioning_runs where slug='flaky')) a),
  array['brand_not_published','environment_unverified','release_mismatch','steps_incomplete'],
  'which cannot be activated around');

-- An operator retries. What already succeeded stays succeeded.
select pg_temp.become_operator('operator');
select is((select t.steps_reset from control_plane.retry_provisioning_run_v1(
  (select id from control_plane.provisioning_runs where slug='flaky')) t),1,
  'retrying resets only what failed');
select is((select s.status from control_plane.provisioning_steps s
  join control_plane.provisioning_runs r on r.id=s.run_id
  where r.slug='flaky' and s.step_key='create_tenant_records'),'succeeded',
  'the steps that worked keep their success, which is the difference between '
  'retrying a run and provisioning a second copy of everything');
select is((select s.external_id from control_plane.provisioning_steps s
  join control_plane.provisioning_runs r on r.id=s.run_id
  where r.slug='flaky' and s.step_key='create_tenant_records'),'ext-create_tenant_records',
  'and keep the identifier of the resource they created');
select is((select r.state from control_plane.provisioning_runs r where r.slug='flaky'),
  'tenant_created','the run falls back to the furthest state its surviving '
  'successes justify, not to the beginning');
select pg_temp.become_worker();
select is(pg_temp.advance((select id from control_plane.provisioning_runs where slug='flaky')),
  'seed_repository','and the retried step is the failed one, from the top of its budget');
rollback to savepoint pv_failure;

-- ---------------------------------------------------------------------------
-- Waiting on a customer's DNS is not failing.
savepoint pv_waiting;
select pg_temp.seed_instance('a4200000-0000-0000-0000-0000000000ff');
select pg_temp.become_operator('operator');
select * from pg_temp.request('a4200000-0000-0000-0000-0000000000ff','slow-dns');
select pg_temp.become_worker();
select count(*) from (select pg_temp.advance(
  (select id from control_plane.provisioning_runs where slug='slow-dns'))
  from generate_series(1,9)) x;

select is((select c.step_key from control_plane.claim_provisioning_step_v1(
  (select id from control_plane.provisioning_runs where slug='slow-dns')) c),'verify_domains',
  'the domain step is reached');
select is((select c.run_state from control_plane.complete_provisioning_step_v1(
  (select s.id from control_plane.provisioning_steps s
   join control_plane.provisioning_runs r on r.id=s.run_id
   where r.slug='slow-dns' and s.step_key='verify_domains'),
  'waiting',null,'{}'::jsonb,null,'customer_dns') c),'domain_pending',
  'a tenant who has not changed their DNS yet leaves the run pending, not failed');
select is((select s.attempts from control_plane.provisioning_steps s
  join control_plane.provisioning_runs r on r.id=s.run_id
  where r.slug='slow-dns' and s.step_key='verify_domains'),0,
  'and does not spend an attempt, because waiting is not a failed try and a '
  'slow customer should not exhaust a retry budget');
select is((select a.blocked from control_plane.activate_instance_v1(
  (select id from control_plane.provisioning_runs where slug='slow-dns')) a),
  array['brand_not_published','environment_unverified','release_mismatch',
        'steps_incomplete','waiting_customer_dns'],
  'a waiting run cannot be activated, because a verified-looking instance whose '
  'domain resolves nowhere is worse than one that is openly not ready');

-- The customer changes their DNS.
update control_plane.provisioning_steps set retry_after=null
where step_key='verify_domains'
  and run_id=(select id from control_plane.provisioning_runs where slug='slow-dns');
select is(pg_temp.advance((select id from control_plane.provisioning_runs where slug='slow-dns')),
  'verify_domains','a waiting step resumes rather than starting over');
select is((select r.state from control_plane.provisioning_runs r where r.slug='slow-dns'),
  'domain_deployed','and the run moves on');
select is((select r.waiting_reason from control_plane.provisioning_runs r where r.slug='slow-dns'),
  null,'with the waiting reason cleared');
rollback to savepoint pv_waiting;

-- ---------------------------------------------------------------------------
-- A worker that dies mid-step, and the reconciler that notices.
savepoint pv_reconcile;
select pg_temp.seed_instance('a4200000-0000-0000-0000-00000000a001');
select pg_temp.become_operator('operator');
select * from pg_temp.request('a4200000-0000-0000-0000-00000000a001','restarted');
select pg_temp.become_worker();
select pg_temp.advance((select id from control_plane.provisioning_runs where slug='restarted'));
select count(*) from control_plane.claim_provisioning_step_v1(
  (select id from control_plane.provisioning_runs where slug='restarted'));

select is((select s.status from control_plane.provisioning_steps s
  join control_plane.provisioning_runs r on r.id=s.run_id
  where r.slug='restarted' and s.step_key='create_tenant_records'),'running',
  'a claimed step is running and locked');
select is((select count(*)::integer from control_plane.claim_provisioning_step_v1(
  (select id from control_plane.provisioning_runs where slug='restarted'))),0,
  'so a second worker cannot claim it and call the same provider twice');

-- The worker is killed. Its lock outlives it, and then expires.
update control_plane.provisioning_steps
set locked_until=statement_timestamp() - interval '1 minute'
where step_key='create_tenant_records'
  and run_id=(select id from control_plane.provisioning_runs where slug='restarted');

select ok(exists(select 1 from control_plane.reconcile_provisioning_v1() f
  where f.finding='lock_expired' and f.detail->>'step_key'='create_tenant_records'),
  'reconciliation reports the lock it had to break');
select is((select s.status from control_plane.provisioning_steps s
  join control_plane.provisioning_runs r on r.id=s.run_id
  where r.slug='restarted' and s.step_key='create_tenant_records'),'pending',
  'and releases the dead worker''s lock, which is what turns a crashed run back '
  'into work rather than a permanent running row');
select is(pg_temp.advance((select id from control_plane.provisioning_runs where slug='restarted')),
  'create_tenant_records','the step is picked up again from where it was');

-- Running it repeatedly changes nothing further.
select is((select count(*)::integer from control_plane.reconcile_provisioning_v1() f
    where f.finding='lock_expired'),0,
  'a second pass has no lock left to release, which is the readable form of '
  '"running it again is safe"');
update control_plane.provisioning_runs set updated_at=statement_timestamp() - interval '1 hour'
where slug='restarted';
select ok(exists(select 1 from control_plane.reconcile_provisioning_v1() f
  where f.finding='stalled'),
  'and a run nobody has touched for an hour is reported, because a run that is '
  'merely stopped looks exactly like one that is working');
select is(
  (select count(*)::integer from control_plane.reconcile_provisioning_v1()),
  (select count(*)::integer from control_plane.reconcile_provisioning_v1()),
  'and reconciliation is idempotent: running it twice reports the same thing '
  'and does not act twice');

-- A resource somebody renamed by hand is drift, found by its stable identifier.
update control_plane.instance_infrastructure
set observed_state='{"active":true,"name":"renamed-by-hand"}'::jsonb,
    desired_state='{"active":true,"name":"restarted-client"}'::jsonb
where instance_id='a4200000-0000-0000-0000-00000000a001' and resource_kind='database_project';
select ok(exists(select 1 from control_plane.reconcile_provisioning_v1() f
  where f.finding='drift' and f.detail->>'resource_kind'='database_project'),
  'a resource renamed outside the fleet is reported as drift, located by the '
  'identifier that cannot be renamed');
rollback to savepoint pv_reconcile;

-- ---------------------------------------------------------------------------
-- Rollback deactivates. Read the assertions: nothing is deleted.
savepoint pv_rollback;
select pg_temp.seed_instance('a4200000-0000-0000-0000-00000000b001');
select pg_temp.become_operator('operator');
select * from pg_temp.request('a4200000-0000-0000-0000-00000000b001','rolled-back');
select pg_temp.become_worker();
select count(*) from (select pg_temp.advance(
  (select id from control_plane.provisioning_runs where slug='rolled-back'))
  from generate_series(1,6)) x;

select throws_ok(
  $$select * from control_plane.deactivate_instance_v1(
    (select id from control_plane.provisioning_runs where slug='rolled-back'),'gave up')$$,
  '42501','policy_denied','a worker cannot deactivate an instance on its own');
select pg_temp.become_operator('admin');
select ok((select d.resources_deactivated from control_plane.deactivate_instance_v1(
  (select id from control_plane.provisioning_runs where slug='rolled-back'),
  'provider outage during launch') d) > 0,
  'an admin can roll a half-built instance back');

select is((select count(*)::integer from control_plane.instance_infrastructure f
  where f.instance_id='a4200000-0000-0000-0000-00000000b001'
    and f.resource_kind='repository'),1,
  'the repository row survives: a half-provisioned repository holds the '
  'tenant''s configuration, and deleting it turns a recoverable incident into '
  'an unrecoverable one');
select ok((select bool_and(f.desired_state->>'active' = 'false')
  from control_plane.instance_infrastructure f
  where f.instance_id='a4200000-0000-0000-0000-00000000b001'
    and f.resource_kind <> 'app_installation'),
  'what changes is desired state, which is a flag a human can flip back');
select is((select i.deployment_state from app.instances i
  where i.id='a4200000-0000-0000-0000-00000000b001'),'suspended',
  'the instance is suspended, never closed: closing is an offboarding decision '
  'with its own sequence, not a consequence of a failed deploy');
select is((select count(*)::integer from control_plane.provisioning_steps s
  join control_plane.provisioning_runs r on r.id=s.run_id where r.slug='rolled-back'),12,
  'and every step row is still there to read');
select throws_ok(
  $$select * from control_plane.activate_instance_v1(
    (select id from control_plane.provisioning_runs where slug='rolled-back'))$$,
  '42501','transition_not_allowed',
  'a deactivated run cannot be activated without somebody deciding to start over');
select ok(exists(select 1 from control_plane.audit_events a
  where a.action='provisioning.deactivated'),
  'and the operator who did it is recorded');
rollback to savepoint pv_rollback;

-- ---------------------------------------------------------------------------
-- Who may do what.
savepoint pv_authority;
select pg_temp.seed_instance('a4200000-0000-0000-0000-00000000c001');
select pg_temp.become_operator('operator');
select * from pg_temp.request('a4200000-0000-0000-0000-00000000c001','authority');

-- An operator with a browser session cannot drive a step by hand. That is the
-- whole reason the worker guard exists: otherwise somebody could mark the
-- health check succeeded and activate an instance that was never checked.
select throws_ok(
  $$select * from control_plane.claim_provisioning_step_v1()$$,
  '42501','policy_denied','an operator session cannot claim a provisioning step');
select throws_ok(
  $$select * from control_plane.complete_provisioning_step_v1(
    (select s.id from control_plane.provisioning_steps s
     join control_plane.provisioning_runs r on r.id=s.run_id
     where r.slug='authority' and s.step_key='health_check'),'succeeded')$$,
  '42501','policy_denied',
  'nor report one succeeded, so an instance cannot be declared healthy by hand');

select pg_temp.become_operator('viewer');
select throws_ok(
  $$select * from control_plane.retry_provisioning_run_v1(
    (select id from control_plane.provisioning_runs where slug='authority'))$$,
  '42501','policy_denied','a viewer cannot retry a run');
select lives_ok(
  $$select * from control_plane.get_provisioning_run_v1(
    (select id from control_plane.provisioning_runs where slug='authority'))$$,
  'but can read one, because reading the timeline is how support answers a '
  'question without touching anything');

select pg_temp.become_worker();
select throws_ok(
  $$select * from control_plane.complete_provisioning_step_v1(
    (select s.id from control_plane.provisioning_steps s
     join control_plane.provisioning_runs r on r.id=s.run_id
     where r.slug='authority' and s.step_key='health_check'),
    'succeeded','x','{"token":"ghp_aaaaaaaaaaaa"}'::jsonb)$$,
  '22023','secret_rejected',
  'and a worker that puts a provider token in observed state is refused at the '
  'call rather than quietly writing a key that then appears in every backup');
select throws_ok(
  $$select * from control_plane.complete_provisioning_step_v1(
    (select s.id from control_plane.provisioning_steps s
     join control_plane.provisioning_runs r on r.id=s.run_id
     where r.slug='authority' and s.step_key='health_check'),'skipped')$$,
  '42501','transition_not_allowed','a required step cannot be waved through');
select is((select c.step_status from control_plane.complete_provisioning_step_v1(
  (select s.id from control_plane.provisioning_steps s
   join control_plane.provisioning_runs r on r.id=s.run_id
   where r.slug='authority' and s.step_key='configure_mail'),'skipped') c),'skipped',
  'but an optional one can be, and the run goes on without it');
rollback to savepoint pv_authority;

-- The savepoint rollbacks above revert pgTAP's own counter, so it is restored
-- from the non-transactional sequence before the plan is emitted.
select _set('curr_test',(select last_value::integer from __tresults___numb_seq));
select * from finish();
rollback;
