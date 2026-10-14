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

select pg_temp.as_operator('e6000000-0000-0000-0000-00000000000a','admin');
select set_config('test.lifecycle_tenant',(select tenant_id::text from api_v1.create_tenant_v2(
  'Lifecycle Tenant','lifecycle-tenant','lifecycle-create-0001')),true);
select set_config('test.lifecycle_instance',(select id::text from app.instances where tenant_id=current_setting('test.lifecycle_tenant')::uuid),true);
select is((select count(*)::int from app.roles where tenant_id=current_setting('test.lifecycle_tenant')::uuid and is_builtin),4,
  'R15 tenant creation preserves built-in role installation');
select ok(not has_schema_privilege('authenticated','control_plane','usage') and
  not has_table_privilege('authenticated','control_plane.instance_configuration','select'),
  'R15 private instance metadata is not an application table contract');
select ok((select relrowsecurity from pg_class where oid='control_plane.instance_configuration'::regclass),
  'R15 private instance metadata retains RLS defense');
select ok(not has_function_privilege('anon','api_v1.decide_operator_review_v1(text,uuid,text,text,text)','execute'),
  'R15 review decisions are never public');
select ok(not has_function_privilege('anon','api_v1.list_domains_v1(text,text,integer,integer)','execute') and
  not has_function_privilege('authenticated','control_plane.list_domains_v1(text,text,integer,integer)','execute'),
  'B2 recreated domain read grants keep public and direct private execution denied');

select throws_ok($$insert into control_plane.jobs(kind,tenant_id,instance_id,requested_by)
  values('reconcile_drift','b0000000-0000-0000-0000-000000000001',current_setting('test.lifecycle_instance')::uuid,
    'e6000000-0000-0000-0000-00000000000a')$$,'42501','tenant_context_mismatch',
  'R15 a direct forged job cannot cross tenant/instance scope');

select pg_temp.claims('a1000000-0000-0000-0000-000000000002','aal2',30);
set local role authenticated;
select throws_ok($$select api_v1.update_instance_configuration_v1(current_setting('test.lifecycle_instance')::uuid,
  'Forged',0,'Changed by a tenant account','metadata-forged-0001')$$,'42501','policy_denied',
  'R15 a tenant administrator cannot forge an instance metadata mutation');
select throws_ok($$select api_v1.list_operator_reviews_v1()$$,'42501','policy_denied',
  'R15 a tenant administrator cannot enumerate operator reviews');
reset role;

select pg_temp.as_operator('e6000000-0000-0000-0000-00000000000a','admin',3600);
set local role authenticated;
select throws_ok($$select api_v1.update_instance_configuration_v1(current_setting('test.lifecycle_instance')::uuid,
  'Lifecycle demo',0,'Clarify the operator label','metadata-update-0001')$$,'42501','recent_authentication_required',
  'R15 metadata writes require a fresh second factor');
reset role;
select pg_temp.as_operator('e6000000-0000-0000-0000-00000000000a','admin',30);
set local role authenticated;
select is(api_v1.update_instance_configuration_v1(current_setting('test.lifecycle_instance')::uuid,
  'Lifecycle demo',0,'Clarify the operator label','metadata-update-0001')->>'revision','1',
  'R15 permitted display metadata has compare-and-swap revision');
select is(api_v1.update_instance_configuration_v1(current_setting('test.lifecycle_instance')::uuid,
  'Lifecycle demo',0,'Clarify the operator label','metadata-update-0001')->>'revision','1',
  'R15 replaying the same metadata request is idempotent');
select throws_ok($$select api_v1.update_instance_configuration_v1(current_setting('test.lifecycle_instance')::uuid,
  'Different label',0,'Clarify the operator label','metadata-update-0001')$$,'23505','idempotency_conflict',
  'R15 replay compares payload as well as key');
select throws_ok($$select api_v1.update_instance_configuration_v1(current_setting('test.lifecycle_instance')::uuid,
  'New label',0,'Clarify the operator label','metadata-update-0002')$$,'40001','stale_revision',
  'R15 a stale operator cannot overwrite newer metadata');
select throws_ok($$select api_v1.update_instance_configuration_v1(current_setting('test.lifecycle_instance')::uuid,
  'New label',1,'x','metadata-update-0003')$$,'22023','reason_required','R15 metadata writes require a reason');
select throws_ok($$select api_v1.update_instance_configuration_v1(current_setting('test.lifecycle_instance')::uuid,
  'Bearer redacted',1,'Clarify the operator label','metadata-update-0004')$$,'22023','secret_rejected',
  'R15 metadata cannot store credential-shaped strings');
select is(api_v1.deactivate_instance_by_id_v1(current_setting('test.lifecycle_instance')::uuid,
  'Tenant requested downtime','provisioning','lifecycle-deactivate-0001')->>'deployment_state','suspended',
  'R15 an instance without a provisioning run can be safely deactivated');
select is(api_v1.deactivate_instance_by_id_v1(current_setting('test.lifecycle_instance')::uuid,
  'Tenant requested downtime','provisioning','lifecycle-deactivate-0001')->>'deployment_state','suspended',
  'R15 instance deactivation replays without changing history');
select throws_ok($$select api_v1.request_instance_closure_v1(current_setting('test.lifecycle_instance')::uuid,
  'Contract ended in writing',current_setting('test.lifecycle_instance'),'lifecycle-close-0001')$$,
  '22023','suspend_before_closure','R15 instance closure cannot bypass tenant suspension');
reset role;

-- Domain retirement is a review-owned database-routing cutover, not deletion.
select set_config('test.domain_old',(select id::text from app.tenant_domains where hostname='client.tenant-a.example.invalid'),true);
insert into app.tenant_domains(id,tenant_id,instance_id,hostname,application,kind,verification_status,verified_at,active)
  values('e6100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
    'a4200000-0000-0000-0000-000000000001','replacement.tenant-a.example.invalid','client','production','verified',now(),false);
set local role authenticated;
select throws_ok($$select api_v1.request_domain_retirement_v1(current_setting('test.domain_old')::uuid,null,
  'Remove the canonical route','domain-retire-invalid-01')$$,'22023','active_route_requires_replacement',
  'R15 active canonical route cannot be removed without an explicit replacement');
reset role;
select set_config('test.other_domain',(select id::text from app.tenant_domains where hostname='client.tenant-b.example.invalid'),true);
set local role authenticated;
select throws_ok($$select api_v1.request_domain_retirement_v1(current_setting('test.domain_old')::uuid,current_setting('test.other_domain')::uuid,
  'Replace the canonical route','domain-retire-invalid-02')$$,'22023','replacement_domain_invalid',
  'R15 replacement must be the same tenant, instance, and application');
select throws_ok($$select api_v1.request_domain_retirement_v1(current_setting('test.domain_old')::uuid,current_setting('test.domain_old')::uuid,
  'Replace the canonical route','domain-retire-invalid-03')$$,'22023','replacement_domain_invalid',
  'R15 a domain cannot replace itself');
select set_config('test.domain_review',api_v1.request_domain_retirement_v1(current_setting('test.domain_old')::uuid,
  'e6100000-0000-0000-0000-000000000001','Replace the canonical route','domain-retire-valid-0001')->>'job_id',true);
select is(api_v1.get_operator_review_v1('job',current_setting('test.domain_review')::uuid)->>'status','pending',
  'R15 the review queue inspects the actual pending workflow');
select ok(jsonb_array_length(api_v1.list_operator_reviews_v1('pending','job',25,0)->'items')>=1,
  'R15 pending job approvals are a dedicated queue');
select throws_ok($$select api_v1.decide_operator_review_v1('job',current_setting('test.domain_review')::uuid,
  'approve','Verified replacement DNS','domain-review-self-0001')$$,'42501','second_operator_required',
  'R15 destructive requester cannot approve');
select throws_ok($$select api_v1.decide_operator_review_v1('job',current_setting('test.domain_review')::uuid,
  'reject','Verified replacement DNS','domain-review-self-0002')$$,'42501','second_operator_required',
  'R15 destructive requester cannot decide their own review rejection either');
select throws_ok($$select * from api_v1.approve_operator_job_v1(current_setting('test.domain_review')::uuid)$$,
  '22023','review_required','R15 older generic approval cannot bypass domain cutover validation');
reset role;
select ok((select active and retired_at is null from app.tenant_domains where id=current_setting('test.domain_old')::uuid),
  'R15 request alone keeps the active route live');

select pg_temp.as_operator('e6000000-0000-0000-0000-00000000000b','admin',30);
set local role authenticated;
select is((select pending_retirement_job_id::text from api_v1.list_domains_v1('client.tenant-a',null,25,0)),
  current_setting('test.domain_review'),'B2 retirement and verification pending job identifiers are distinct');
select is((select pending_job_id from api_v1.list_domains_v1('client.tenant-a',null,25,0)),null::uuid,
  'B2 retirement never masquerades as pending verification');
select is((select d->>'pending_retirement_job_id' from jsonb_array_elements(
  api_v1.get_tenant_v1('a0000000-0000-0000-0000-000000000001')->'domains') d
  where d->>'id'=current_setting('test.domain_old')),current_setting('test.domain_review'),
  'B2 tenant detail exposes the same pending retirement identifier');
reset role;
-- Revalidate a replacement that became invalid after the request was accepted.
update app.tenant_domains set verification_status='pending',verified_at=null where id='e6100000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($$select api_v1.decide_operator_review_v1('job',current_setting('test.domain_review')::uuid,
  'approve','Verified replacement DNS','domain-review-approved-01')$$,'22023','replacement_domain_invalid',
  'B1 invalid replacement refuses the cutover and does not consume its idempotency key');
reset role;
select ok((select active and retired_at is null and replacement_domain_id is null from app.tenant_domains
  where id=current_setting('test.domain_old')::uuid),'B1 invalid replacement preserves the original live route');
select is((select status from control_plane.jobs where id=current_setting('test.domain_review')::uuid),'queued',
  'B1 failed review keeps the original pending workflow');
update app.tenant_domains set verification_status='verified',verified_at=now() where id='e6100000-0000-0000-0000-000000000001';
-- A failure during the second write must roll back the already retired route,
-- approval/event changes and the replay receipt, not leave a routing gap.
create function pg_temp.refuse_cutover_activation() returns trigger language plpgsql as $$
begin
  if new.id='e6100000-0000-0000-0000-000000000001' and new.active then
    raise exception using errcode='22023',message='cutover_test_activation_refused';
  end if;
  return new;
end $$;
create trigger test_refuse_cutover_activation before update on app.tenant_domains
  for each row execute function pg_temp.refuse_cutover_activation();
set local role authenticated;
select throws_ok($$select api_v1.decide_operator_review_v1('job',current_setting('test.domain_review')::uuid,
  'approve','Verified replacement DNS','domain-review-approved-01')$$,'22023','cutover_test_activation_refused',
  'B1 failure after outgoing retirement rolls the whole cutover back');
reset role;
select ok((select active and retired_at is null and replacement_domain_id is null from app.tenant_domains
  where id=current_setting('test.domain_old')::uuid),'B1 failed activation restores the outgoing route and lineage');
select ok((select not active and retired_at is null from app.tenant_domains
  where id='e6100000-0000-0000-0000-000000000001'),'B1 failed activation does not activate its replacement');
select is((select count(*)::int from control_plane.job_events where job_id=current_setting('test.domain_review')::uuid
  and event in ('approved','succeeded')),0,'B1 failed activation retains no false execution history');
drop trigger test_refuse_cutover_activation on app.tenant_domains;
set local role authenticated;
select is(api_v1.decide_operator_review_v1('job',current_setting('test.domain_review')::uuid,
  'approve','Verified replacement DNS','domain-review-approved-01')->>'status','approved',
  'R15 a second fresh administrator approves the guarded replacement');
select is(api_v1.decide_operator_review_v1('job',current_setting('test.domain_review')::uuid,
  'approve','Verified replacement DNS','domain-review-approved-01')->>'status','approved',
  'R15 review replay preserves the first decision');
select ok(exists(select 1 from jsonb_array_elements(api_v1.get_operator_review_v1('job',current_setting('test.domain_review')::uuid)->'history') h
  where h->>'action'='review.approved' and h->>'reason'='Verified replacement DNS'),
  'R15 review history retains the decision reason alongside the original request');
select throws_ok($$select * from api_v1.request_domain_verification_v1(current_setting('test.domain_old')::uuid)$$,
  '22023','transition_not_allowed','R15 retired domain cannot be revived by an older verification RPC');
reset role;
select ok((select not active and retired_at is not null and replacement_domain_id='e6100000-0000-0000-0000-000000000001'
  from app.tenant_domains where id=current_setting('test.domain_old')::uuid),'R15 outgoing route is retained with replacement lineage');
select ok((select active from app.tenant_domains where id='e6100000-0000-0000-0000-000000000001'),
  'R15 replacement route activates atomically with retirement');
select is((select count(*)::int from app.tenant_domains where tenant_id='a0000000-0000-0000-0000-000000000001'
  and instance_id='a4200000-0000-0000-0000-000000000001' and application='client' and kind='production' and active),1,
  'B1 successful active production cutover and replay preserve exactly one live canonical route');
select is((select count(*)::int from control_plane.job_events where job_id=current_setting('test.domain_review')::uuid
  and event='succeeded'),1,'B1 replay never repeats cutover execution');
set local role authenticated;
select ok((select retired_at is not null and replacement_domain_id='e6100000-0000-0000-0000-000000000001'
  and not active and pending_retirement_job_id is null from api_v1.list_domains_v1('client.tenant-a',null,25,0)),
  'B2 list keeps retired verified rows and lineage without presenting pending execution');
select ok((select d->>'retired_at' is not null and d->>'replacement_domain_id'='e6100000-0000-0000-0000-000000000001'
  and d->>'pending_retirement_job_id' is null from jsonb_array_elements(
  api_v1.get_tenant_v1('a0000000-0000-0000-0000-000000000001')->'domains') d
  where d->>'id'=current_setting('test.domain_old')),'B2 tenant detail retains published retirement lineage');
select ok(not exists(select 1 from jsonb_array_elements(api_v1.get_tenant_v1('b0000000-0000-0000-0000-000000000001')->'domains') d
  where d->>'id' in (current_setting('test.domain_old'),'e6100000-0000-0000-0000-000000000001')),
  'B2 tenant detail never joins another tenant retirement lineage');
reset role;
select pg_temp.claims('a1000000-0000-0000-0000-000000000002','aal2',30);
set local role authenticated;
select throws_ok($$select * from api_v1.list_domains_v1()$$,'42501','policy_denied',
  'B2 an ordinary tenant session cannot enumerate private domain lineage');
select throws_ok($$select api_v1.get_tenant_v1('a0000000-0000-0000-0000-000000000001')$$,'42501','policy_denied',
  'B2 an ordinary tenant session cannot read operator tenant/domain metadata');
reset role;
select pg_temp.as_operator('e6000000-0000-0000-0000-00000000000b','admin',30);

select throws_ok($$update app.tenant_domains set active=true where id=current_setting('test.domain_old')::uuid$$,
  '22023','transition_not_allowed','R15 even a direct forged writer cannot reactivate retired routing');

-- Pending support approvals share the review queue, with their own original scope.
select pg_temp.as_operator('e6000000-0000-0000-0000-00000000000a','admin',30);
set local role authenticated;
select set_config('test.support_review',(select grant_id::text from api_v1.request_support_grant_v1(
  'a0000000-0000-0000-0000-000000000001','Investigate tenant-reported issue','TEST-134',null,60)),true);
reset role;
select pg_temp.as_operator('e6000000-0000-0000-0000-00000000000b','admin',3600);
set local role authenticated;
select throws_ok($$select api_v1.decide_operator_review_v1('support',current_setting('test.support_review')::uuid,
  'reject','Missing authorization evidence','support-review-reject-01')$$,'42501','recent_authentication_required',
  'R15 rejection requires the same fresh authority as approval');
reset role;
select pg_temp.as_operator('e6000000-0000-0000-0000-00000000000b','admin',30);
set local role authenticated;
select throws_ok($$select api_v1.decide_operator_review_v1('support',current_setting('test.support_review')::uuid,
  'unexpected','Missing authorization evidence','support-review-enum-0001')$$,'22023','settings_invalid',
  'R15 review decision enum is enforced by SQL');
select is(api_v1.decide_operator_review_v1('support',current_setting('test.support_review')::uuid,
  'reject','Missing authorization evidence','support-review-reject-01')->>'status','rejected',
  'R15 a second administrator rejects support approval with a reason');
select ok(exists(select 1 from jsonb_array_elements(api_v1.get_operator_review_v1('support',current_setting('test.support_review')::uuid)->'history') h
  where h->>'action'='review.rejected' and h->>'reason'='Missing authorization evidence'),
  'R15 support rejection history is inspectable alongside the original request');
reset role;
select is((select status from control_plane.support_grants where id=current_setting('test.support_review')::uuid),'revoked',
  'R15 rejected support never becomes active and remains retained');

-- Plan inactivity keeps existing subscriptions and entitlements; only new sales stop.
select pg_temp.as_operator('e6000000-0000-0000-0000-00000000000a','admin',30);
set local role authenticated;
select lives_ok($$select * from api_v1.save_plan_v1('lifecycle-plan','Lifecycle Plan',array['reports.advanced'],true,true,'Create a test lifecycle plan')$$,
  'R15 existing safe plan API creates plans');
select lives_ok($$select * from api_v1.assign_subscription_v1(current_setting('test.lifecycle_tenant')::uuid,
  'lifecycle-plan','general','Assign the agreed test plan')$$,'R15 subscriptions use the existing guarded plan workflow');
select lives_ok($$select * from api_v1.save_plan_v1('lifecycle-plan','Lifecycle Plan',array['reports.advanced'],false,false,'Retire the plan for new sales')$$,
  'R15 plan deactivation is an update, never deletion');
select throws_ok($$select * from api_v1.assign_subscription_v1('b0000000-0000-0000-0000-000000000001',
  'lifecycle-plan','general','Attempt a new inactive plan')$$,'22023','plan_unknown','R15 inactive plans cannot be newly assigned');
reset role;
select is((select plan_key from control_plane.subscriptions where tenant_id=current_setting('test.lifecycle_tenant')::uuid),
  'lifecycle-plan','R15 existing subscriptions survive plan inactivity');
select ok((select granted from app.tenant_entitlements where tenant_id=current_setting('test.lifecycle_tenant')::uuid and feature_key='reports.advanced'),
  'R15 unchanged entitlements are preserved for existing subscribers');

-- Closure uses workflow-created jobs, waits for another operator and verified deactivation.
set local role authenticated;
select lives_ok($$select * from api_v1.set_tenant_status_v1(current_setting('test.lifecycle_tenant')::uuid,
  'suspended','Contract ended in writing','active')$$,'R15 tenant suspension is a live state transition');
reset role;
select set_config('test.conflicting_job',control_plane.enqueue_operator_job_v1('e6000000-0000-0000-0000-00000000000a',
  'reconcile_drift',current_setting('test.lifecycle_tenant')::uuid,current_setting('test.lifecycle_instance')::uuid,
  '{}','lifecycle-conflicting-job-01')::text,true);
set local role authenticated;
select throws_ok($$select api_v1.request_instance_closure_v1(current_setting('test.lifecycle_instance')::uuid,
  'Contract ended in writing',current_setting('test.lifecycle_instance'),'instance-close-conflict-1')$$,
  '55000','unfinished_job_conflict','R15 closure does not bypass another unfinished instance workflow');
select lives_ok($$select * from api_v1.cancel_job_v1(current_setting('test.conflicting_job')::uuid,
  'Superseded by the explicit closure')$$,'R15 an unfinished workflow is explicitly cancelled before closure');
select set_config('test.instance_review',api_v1.request_instance_closure_v1(current_setting('test.lifecycle_instance')::uuid,
  'Contract ended in writing',current_setting('test.lifecycle_instance'),'instance-close-valid-001')->>'job_id',true);
select throws_ok($$select * from api_v1.set_tenant_status_v1(current_setting('test.lifecycle_tenant')::uuid,
  'active','Attempt to bypass closure','suspended')$$,'55000','unfinished_job_conflict',
  'R15 reactivation cannot bypass an unfinished closure job');
reset role;
select is((select reason from control_plane.jobs where id=current_setting('test.instance_review')::uuid),'Contract ended in writing',
  'R15 closure request reason is available to the reviewer');
select pg_temp.as_operator('e6000000-0000-0000-0000-00000000000b','admin',30);
set local role authenticated;
select is(api_v1.decide_operator_review_v1('job',current_setting('test.instance_review')::uuid,
  'approve','Confirmed retained closure scope','instance-close-approved-1')->>'status','approved',
  'R15 closure is approved by the second operator');
reset role;
insert into control_plane.instance_infrastructure(tenant_id,instance_id,provider,resource_kind,external_id,desired_state,observed_state,observed_at)
  values(current_setting('test.lifecycle_tenant')::uuid,current_setting('test.lifecycle_instance')::uuid,
    'vercel','project','retained-lifecycle-project','{"active":false}','{"active":true}',now());
select pg_temp.as_worker();
set local role service_role;
select is((select job_id::text from api_v1.claim_job_v1(array['close_instance'],60)),current_setting('test.instance_review'),
  'R15 approved closure is claimable only by the worker');
select throws_ok($$select * from api_v1.complete_job_v1(current_setting('test.instance_review')::uuid,'succeeded',null)$$,
  '55000','infrastructure_not_deactivated','R15 closure cannot invent external deactivation evidence');
reset role;
update control_plane.instance_infrastructure set observed_state='{"active":false}',observed_at=now()
  where instance_id=current_setting('test.lifecycle_instance')::uuid;
set local role service_role;
select is((select status from api_v1.complete_job_v1(current_setting('test.instance_review')::uuid,'succeeded',null)),'succeeded',
  'R15 closure completes only after retained infrastructure is observed inactive');
reset role;
select is((select deployment_state from app.instances where id=current_setting('test.lifecycle_instance')::uuid),'closed',
  'R15 approved instance lifecycle reaches closed');
select is((select status from app.tenants where id=current_setting('test.lifecycle_tenant')::uuid),'closed',
  'R15 final instance closure completes tenant closure');
select is((select count(*)::int from control_plane.instance_infrastructure where instance_id=current_setting('test.lifecycle_instance')::uuid),1,
  'R15 closure retains infrastructure history');
select ok((select count(*)::int from control_plane.job_events where job_id=current_setting('test.instance_review')::uuid)>=4,
  'R15 closure retains enqueue, approval, claim, and completion events');
select throws_ok($$update control_plane.job_events set event='failed' where job_id=current_setting('test.instance_review')::uuid$$,
  '42501','booking_immutable','R15 retained execution history cannot be overwritten');

select pg_temp.as_operator('e6000000-0000-0000-0000-00000000000b','admin',30);
set local role authenticated;
select throws_ok($$select api_v1.update_instance_configuration_v1(current_setting('test.lifecycle_instance')::uuid,
  'Closed label edit',1,'Attempt to revive closed configuration','closed-config-write-0001')$$,
  '22023','transition_not_allowed','R15 closed instances cannot be edited through a stale form');
reset role;
update control_plane.operators set disabled_at=now() where auth_user_id='e6000000-0000-0000-0000-00000000000b';
set local role authenticated;
select throws_ok($$select api_v1.get_operator_review_v1('job',current_setting('test.instance_review')::uuid)$$,
  '42501','policy_denied','R15 stale revoked operator session loses review access immediately');
reset role;
select * from finish();
rollback;
