-- Synthetic Platform Admin demo data. Local isolated stack only.
-- Every name says "Synthetic demo"; every email ends in .example.invalid.
-- Repeatable: fixed IDs with ON CONFLICT, and time-relative values refreshed
-- on each run so "fresh", "stale" and "expires" stay meaningful.
\set ON_ERROR_STOP on
begin;

do $guard$
begin
  if not exists (select 1 from auth.users where email = 'demo-admin@platform-admin.example.invalid') then
    raise exception 'run through scripts/platform-admin-local.mjs seed (demo operators missing)';
  end if;
end
$guard$;

create temp table demo_ids as
select
  (select id from auth.users where email = 'demo-admin@platform-admin.example.invalid') as admin_id,
  (select id from auth.users where email = 'demo-admin-2@platform-admin.example.invalid') as admin2_id,
  (select id from auth.users where email = 'demo-operator@platform-admin.example.invalid') as operator_id,
  (select id from auth.users where email = 'demo-viewer@platform-admin.example.invalid') as viewer_id;

-- Operators ---------------------------------------------------------------
insert into control_plane.operators(auth_user_id,email,role)
select admin_id,'demo-admin@platform-admin.example.invalid','admin' from demo_ids
union all select admin2_id,'demo-admin-2@platform-admin.example.invalid','admin' from demo_ids
union all select operator_id,'demo-operator@platform-admin.example.invalid','operator' from demo_ids
union all select viewer_id,'demo-viewer@platform-admin.example.invalid','viewer' from demo_ids
on conflict (auth_user_id) do update set role = excluded.role, disabled_at = null, expires_at = null;

-- Tenants, brands, published revisions, instances ---------------------------
insert into app.tenants(id,name,status) values
  ('d1000000-0000-4000-8000-000000000001','Synthetic demo · North Clinic','active'),
  ('d1000000-0000-4000-8000-000000000002','Synthetic demo · East Studio','active'),
  ('d1000000-0000-4000-8000-000000000003','Synthetic demo · West Salon','suspended'),
  ('d1000000-0000-4000-8000-000000000004','Synthetic demo · Central Gym','active'),
  ('d1000000-0000-4000-8000-000000000005','Synthetic demo · South Spa','active')
on conflict (id) do nothing;

insert into app.brands(id,tenant_id,key,status)
select ('d2000000-0000-4000-8000-00000000000' || n)::uuid, ('d1000000-0000-4000-8000-00000000000' || n)::uuid,
  'demo-' || k, 'active'
from (values (1,'north'),(2,'east'),(3,'west'),(4,'central'),(5,'south')) v(n,k)
on conflict do nothing;

-- Published revisions copied verbatim from Synthetic Tenant A, so config,
-- content and content_hash stay mutually consistent without restating them.
insert into app.brand_revisions(id,tenant_id,brand_id,revision,state,config_version,created_at,published_at,config,content,content_hash)
select ('d4000000-0000-4000-8000-00000000000' || n)::uuid, ('d1000000-0000-4000-8000-00000000000' || n)::uuid,
  ('d2000000-0000-4000-8000-00000000000' || n)::uuid, 1, 'published', r.config_version, now(), now(),
  r.config, r.content, r.content_hash
from app.brand_revisions r cross join (values (1),(3)) v(n)
where r.id = 'a4100000-0000-0000-0000-000000000001'
on conflict do nothing;

insert into app.instances(id,tenant_id,brand_id,published_brand_revision_id,deployment_state)
values
  ('d3000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','active'),
  ('d3000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000002',null,'provisioning'),
  ('d3000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-000000000003','d4000000-0000-4000-8000-000000000003','suspended'),
  ('d3000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000004','d2000000-0000-4000-8000-000000000004',null,'provisioning'),
  ('d3000000-0000-4000-8000-000000000005','d1000000-0000-4000-8000-000000000005','d2000000-0000-4000-8000-000000000005',null,'provisioning')
on conflict do nothing;

insert into app.tenant_domains(id,tenant_id,instance_id,hostname,application,kind,verification_status,verified_at,active)
values
  ('da000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','book.demo-north.example.invalid','client','production','verified',now() - interval '20 days',true),
  ('da000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000004','d3000000-0000-4000-8000-000000000004','book.demo-central.example.invalid','client','production','pending',null,false)
on conflict do nothing;

-- Subscriptions and entitlements ------------------------------------------
insert into control_plane.subscriptions(tenant_id,plan_key,state,rollout_ring,started_at,ends_at) values
  ('d1000000-0000-4000-8000-000000000001','launch','active','canary',now() - interval '60 days',null),
  ('d1000000-0000-4000-8000-000000000002','launch','trialing','early',now() - interval '3 days',now() + interval '11 days'),
  ('d1000000-0000-4000-8000-000000000003','launch','past_due','general',now() - interval '120 days',null),
  ('d1000000-0000-4000-8000-000000000004','launch','active','general',now() - interval '10 days',null)
on conflict (tenant_id) do update set state = excluded.state, rollout_ring = excluded.rollout_ring,
  ends_at = excluded.ends_at, updated_at = now();
select control_plane.project_plan_entitlements_v1(t, 'launch') from (values
  ('d1000000-0000-4000-8000-000000000001'::uuid),('d1000000-0000-4000-8000-000000000002'),
  ('d1000000-0000-4000-8000-000000000003'),('d1000000-0000-4000-8000-000000000004')) v(t);
insert into app.tenant_entitlements(tenant_id,feature_key,granted,source,expires_at)
values ('d1000000-0000-4000-8000-000000000001','reports.advanced',true,'override',now() + interval '30 days')
on conflict (tenant_id,feature_key) do update set granted = true, source = 'override', expires_at = excluded.expires_at;

-- Releases and instance release state ---------------------------------------
insert into control_plane.releases(id,version,channel,git_commit,config_schema_version,backend_contract_min,
  backend_contract_max,migration_ids,feature_notes,upgrade_notes,reversible,registered_by,created_at)
select 'd6000000-0000-4000-8000-000000000001'::uuid,'0.1.0','stable',repeat('1',40),3,1,1,'{}',
  array['Synthetic demo baseline release'],array['None'],true,admin_id,now() - interval '40 days' from demo_ids
union all
select 'd6000000-0000-4000-8000-000000000002','0.2.0','candidate',repeat('2',40),3,1,1,
  array['20261006120000_platform_admin_foundation'],array['Synthetic demo candidate'],array['No action required'],true,admin_id,now() - interval '2 days' from demo_ids
on conflict do nothing;

insert into control_plane.instance_release_state(tenant_id,instance_id,desired_release,current_release,
  config_schema_version,environment_fingerprint,reported_at) values
  ('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','0.1.0','0.1.0',3,repeat('a',64),now() - interval '10 minutes'),
  ('d1000000-0000-4000-8000-000000000003','d3000000-0000-4000-8000-000000000003','0.1.0','0.1.0',3,repeat('b',64),now() - interval '3 hours'),
  ('d1000000-0000-4000-8000-000000000002','d3000000-0000-4000-8000-000000000002','0.1.0',null,3,null,null),
  ('d1000000-0000-4000-8000-000000000004','d3000000-0000-4000-8000-000000000004','0.1.0',null,3,null,null)
on conflict (tenant_id,instance_id) do update set desired_release = excluded.desired_release,
  current_release = excluded.current_release, reported_at = excluded.reported_at;

-- Infrastructure: one in sync, one drifted, one domain with a reported certificate.
insert into control_plane.instance_infrastructure(tenant_id,instance_id,provider,resource_kind,external_id,
  desired_state,observed_state,observed_at,attempts,last_success_at) values
  ('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','github','app_installation','demo-install-north','{}','{}',now() - interval '1 day',1,now() - interval '1 day'),
  ('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','github','repository','R_demo_north','{"active":true,"default_branch":"main"}','{"active":true,"default_branch":"main"}',now() - interval '10 minutes',1,now() - interval '10 minutes'),
  ('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','vercel','project','prj_demonorthclient','{"active":true,"framework":"nextjs"}','{"active":true,"framework":"other"}',now() - interval '10 minutes',2,now() - interval '10 minutes'),
  ('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','vercel','domain','dom_demo_north','{"active":true}','{"active":true,"hostname":"book.demo-north.example.invalid","certificate_status":"issued"}',now() - interval '10 minutes',1,now() - interval '10 minutes'),
  ('d1000000-0000-4000-8000-000000000002','d3000000-0000-4000-8000-000000000002','github','app_installation','demo-install-east','{}','{}',now() - interval '3 days',1,now() - interval '3 days'),
  ('d1000000-0000-4000-8000-000000000004','d3000000-0000-4000-8000-000000000004','github','app_installation','demo-install-central','{}','{}',now() - interval '10 days',1,now() - interval '10 days')
on conflict (provider,resource_kind,external_id) do update set observed_at = excluded.observed_at,
  last_success_at = excluded.last_success_at;

-- Provisioning runs and steps ------------------------------------------------
insert into control_plane.provisioning_runs(id,tenant_id,instance_id,slug,plan_key,state,waiting_reason,idempotency_key,
  request,desired_release,config_schema_version,backend_contract_min,backend_contract_max,last_error_code,requested_by,activated_at,created_at,updated_at)
select v.id::uuid, v.t::uuid, v.i::uuid, v.slug, 'launch', v.state, v.waiting, 'demo-run-' || v.slug,
  '{"default_locale":"en","timezone":"Asia/Riyadh","currency":"SAR"}', '0.1.0', 3, 1, 1, v.err, d.operator_id,
  case when v.state = 'active' then now() - interval '40 days' end, now() - v.age, now() - v.age + interval '1 hour'
from demo_ids d, (values
  ('d5000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','demo-north','active',null,null,interval '41 days'),
  ('d5000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000002','d3000000-0000-4000-8000-000000000002','demo-east','failed',null,'github_rate_limited',interval '3 days'),
  ('d5000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000004','d3000000-0000-4000-8000-000000000004','demo-central','domain_pending','customer_dns',null,interval '2 days')
) v(id,t,i,slug,state,waiting,err,age)
on conflict do nothing;

-- Steps: north all succeeded; east failed at step 3; central waiting at step 10.
insert into control_plane.provisioning_steps(run_id,step_order,step_key,provider,resource_kind,required,resulting_state,
  waiting_state,status,attempts,max_attempts,idempotency_key,waiting_reason,last_error_code,retry_after,started_at,last_success_at)
select r.id, c.step_order, c.step_key, c.provider, c.resource_kind, c.required, c.resulting_state, c.waiting_state,
  case
    when r.slug = 'demo-north' then 'succeeded'
    when r.slug = 'demo-east' and c.step_order < 3 then 'succeeded'
    when r.slug = 'demo-east' and c.step_order = 3 then 'failed'
    when r.slug = 'demo-central' and c.step_order < 10 then 'succeeded'
    when r.slug = 'demo-central' and c.step_order = 10 then 'waiting'
    else 'pending' end,
  case when r.slug = 'demo-east' and c.step_order = 3 then 5 when c.step_order = 10 and r.slug = 'demo-central' then 0
       when (r.slug = 'demo-north') or (r.slug = 'demo-east' and c.step_order < 3) or (r.slug = 'demo-central' and c.step_order < 10) then 1
       else 0 end,
  case when c.step_order = 3 then 5 else c.max_attempts end,
  r.id::text || ':' || c.step_key,
  case when r.slug = 'demo-central' and c.step_order = 10 then 'customer_dns' end,
  case when r.slug = 'demo-east' and c.step_order = 3 then 'github_rate_limited' end,
  case when r.slug = 'demo-central' and c.step_order = 10 then now() + interval '15 minutes' end,
  case when (r.slug = 'demo-north') or (r.slug = 'demo-east' and c.step_order <= 3) or (r.slug = 'demo-central' and c.step_order <= 10)
       then r.created_at + make_interval(mins => c.step_order) end,
  case when (r.slug = 'demo-north') or (r.slug = 'demo-east' and c.step_order < 3) or (r.slug = 'demo-central' and c.step_order < 10)
       then r.created_at + make_interval(mins => c.step_order + 1) end
from control_plane.provisioning_runs r
cross join (values
  (1,'validate_request',null::text,null::text,true,'validated',null::text,3),
  (2,'create_tenant_records','supabase','database_project',true,'tenant_created',null,5),
  (3,'seed_repository','github','repository',true,'repository_seeded',null,5),
  (4,'commit_configuration','github','branch',true,'config_committed',null,5),
  (5,'protect_repository','github','ruleset',true,null,null,5),
  (6,'create_projects','vercel','project',true,'projects_created',null,5),
  (7,'configure_mail','resend','sending_domain',false,null,null,5),
  (8,'configure_environment','vercel','project',true,'environment_configured',null,5),
  (9,'deploy_applications','vercel','deployment',true,null,null,5),
  (10,'verify_domains','vercel','domain',true,'domain_deployed','domain_pending',60),
  (11,'health_check',null,null,true,'health_checked',null,10),
  (12,'generate_agent_pack',null,null,true,null,null,3)
) c(step_order,step_key,provider,resource_kind,required,resulting_state,waiting_state,max_attempts)
where r.slug in ('demo-north','demo-east','demo-central')
on conflict do nothing;

insert into control_plane.provisioning_events(run_id,step_key,event,attempt,error_code,occurred_at)
select r.id, e.step_key, e.event, e.attempt, e.error_code, r.created_at + e.offset_
from control_plane.provisioning_runs r
join (values
  ('demo-north',null,'requested',null,null,interval '0'),
  ('demo-north',null,'activated',null,null,interval '1 day'),
  ('demo-east',null,'requested',null,null,interval '0'),
  ('demo-east','seed_repository','failed',4,'github_rate_limited',interval '40 minutes'),
  ('demo-east','seed_repository','failed',5,'github_rate_limited',interval '2 hours'),
  ('demo-central',null,'requested',null,null,interval '0'),
  ('demo-central','verify_domains','waiting',0,null,interval '3 hours')
) e(slug,step_key,event,attempt,error_code,offset_) on e.slug = r.slug
where not exists (select 1 from control_plane.provisioning_events x where x.run_id = r.id);

-- Rollouts -------------------------------------------------------------------
insert into control_plane.rollouts(id,release_id,status,target_rings,reason,created_by,started_at,finished_at,created_at)
select 'd7000000-0000-4000-8000-000000000001'::uuid,'d6000000-0000-4000-8000-000000000001'::uuid,'completed',array['canary'],
  'Synthetic demo baseline rollout',admin_id,now() - interval '39 days',now() - interval '39 days',now() - interval '39 days' from demo_ids
union all
select 'd7000000-0000-4000-8000-000000000002','d6000000-0000-4000-8000-000000000002','paused',array['canary'],
  'Synthetic demo canary of 0.2.0',admin_id,now() - interval '1 day',null,now() - interval '1 day' from demo_ids
on conflict do nothing;

-- Jobs -------------------------------------------------------------------------
insert into control_plane.jobs(id,kind,status,tenant_id,instance_id,parameters,attempts,last_error_code,requested_by,
  approved_by,idempotency_key,created_at,updated_at,started_at,completed_at)
select v.id::uuid, v.kind, v.status, v.t::uuid, v.i::uuid, v.params::jsonb, v.attempts, v.err,
  case v.who when 'admin2' then d.admin2_id else d.operator_id end, null,
  'demo-job-' || right(v.id, 2), now() - v.age, now() - v.age, case when v.attempts > 0 then now() - v.age end,
  case when v.status = 'succeeded' then now() - v.age + interval '2 minutes' end
from demo_ids d, (values
  ('d8000000-0000-4000-8000-000000000001','provision_instance','succeeded','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','{"slug":"demo-north"}',1,null,'operator',interval '41 days'),
  ('d8000000-0000-4000-8000-000000000002','provision_instance','failed','d1000000-0000-4000-8000-000000000002','d3000000-0000-4000-8000-000000000002','{"slug":"demo-east"}',5,'github_rate_limited','operator',interval '3 days'),
  ('d8000000-0000-4000-8000-000000000003','verify_domain','queued','d1000000-0000-4000-8000-000000000004','d3000000-0000-4000-8000-000000000004','{"domain_id":"da000000-0000-4000-8000-000000000002","hostname":"book.demo-central.example.invalid"}',0,null,'operator',interval '2 hours'),
  ('d8000000-0000-4000-8000-000000000004','close_instance','queued','d1000000-0000-4000-8000-000000000003','d3000000-0000-4000-8000-000000000003','{"reason_recorded":true}',0,null,'admin2',interval '5 hours'),
  ('d8000000-0000-4000-8000-000000000005','publish_release','failed','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','{"release":"0.2.0","rollout_id":"d7000000-0000-4000-8000-000000000002"}',1,'smoke_failed','operator',interval '1 day'),
  ('d8000000-0000-4000-8000-000000000006','reconcile_drift','succeeded','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','{"provider":"vercel"}',1,null,'operator',interval '6 hours')
) v(id,kind,status,t,i,params,attempts,err,who,age)
on conflict do nothing;

insert into control_plane.job_events(job_id,event,attempt,error_code,actor_id,occurred_at)
select j.id, e.event, e.attempt, e.err, case when e.event = 'enqueued' then j.requested_by end, j.created_at + e.offset_
from control_plane.jobs j
join (values
  ('enqueued',null,null,interval '0'),('claimed',1,null,interval '1 minute'),
  ('failed',1,'smoke_failed',interval '3 minutes')
) e(event,attempt,err,offset_) on (e.event = 'enqueued' or j.attempts > 0)
  and (e.event <> 'failed' or j.status = 'failed')
where j.id::text like 'd8000000-%'
  and not exists (select 1 from control_plane.job_events x where x.job_id = j.id);

insert into control_plane.rollout_targets(rollout_id,tenant_id,instance_id,ring,from_release,status,job_id,attempts,error_code)
values
  ('d7000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','canary',null,'succeeded',null,1,null),
  ('d7000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','canary','0.1.0','failed','d8000000-0000-4000-8000-000000000005',1,'smoke_failed')
on conflict do nothing;

-- Health observations (append-only: new fresh rows each run; stale row once) --
insert into control_plane.health_observations(subject_kind,tenant_id,instance_id,subject_key,signal,status,detail,observed_at)
values
  ('instance','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','client','http_health','healthy','{"synthetic":true}',now() - interval '5 minutes'),
  ('instance','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','dashboard','http_health','healthy','{"synthetic":true}',now() - interval '5 minutes'),
  ('integration',null,null,'github','api','healthy','{"synthetic":true}',now() - interval '20 minutes');
insert into control_plane.health_observations(subject_kind,tenant_id,instance_id,subject_key,signal,status,error_code,detail,observed_at)
select 'instance','d1000000-0000-4000-8000-000000000003','d3000000-0000-4000-8000-000000000003','client','http_health','degraded','http_slow','{"synthetic":true}',now() - interval '3 hours'
where not exists (select 1 from control_plane.health_observations h where h.instance_id = 'd3000000-0000-4000-8000-000000000003');

-- Integrations -----------------------------------------------------------------
update control_plane.integrations set configured_fingerprint = repeat('c',64), configured_reported_at = now() - interval '1 day',
  last_check_at = now() - interval '1 day', last_check_outcome = 'reachable', last_check_error_code = null, verified_at = null
where provider = 'github';

-- Support access ---------------------------------------------------------------
insert into control_plane.support_grants(id,tenant_id,operator_id,reason,ticket_reference,status,requested_at,approved_by,
  approved_at,starts_at,expires_at,revoked_at,revoked_by)
select 'd9000000-0000-4000-8000-000000000001'::uuid,'d1000000-0000-4000-8000-000000000001'::uuid,operator_id,
  'Synthetic demo: customer reports missing Tuesday slots','DEMO-1042','active',now() - interval '20 minutes',
  admin_id,now() - interval '10 minutes',now() - interval '10 minutes',now() + interval '2 hours',null::timestamptz,null::uuid from demo_ids
union all
select 'd9000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000002',operator_id,
  'Synthetic demo: trial onboarding question about services','DEMO-1043','pending',now() - interval '1 hour',
  null,null,null,null,null,null from demo_ids
union all
select 'd9000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000003',operator_id,
  'Synthetic demo: billing dispute investigation','DEMO-0991','revoked',now() - interval '9 days',
  admin_id,now() - interval '9 days',now() - interval '9 days',now() - interval '8 days',now() - interval '9 days' + interval '30 minutes',admin_id from demo_ids
on conflict (id) do update set status = excluded.status, starts_at = excluded.starts_at,
  expires_at = excluded.expires_at, approved_at = excluded.approved_at, revoked_at = excluded.revoked_at,
  revoked_by = excluded.revoked_by;

-- Platform flag ----------------------------------------------------------------
insert into control_plane.platform_flags(key,enabled,kind,message_en,message_ar,updated_by)
select 'maintenance.demo',false,'incident_banner','Synthetic demo: scheduled maintenance tonight.',
  'عرض تجريبي: صيانة مجدولة الليلة.',admin_id from demo_ids
on conflict (key) do nothing;

-- Audit history ----------------------------------------------------------------
insert into control_plane.audit_events(id,operator_id,action,tenant_id,instance_id,target_kind,target_id,reason,detail,outcome,created_at)
select v.id::uuid, case v.who when 'admin' then d.admin_id when 'admin2' then d.admin2_id when 'viewer' then d.viewer_id else d.operator_id end,
  v.action, v.t::uuid, null, v.kind, v.target, v.reason, v.detail::jsonb, v.outcome, now() - v.age
from demo_ids d, (values
  ('db000000-0000-4000-8000-000000000001','admin','tenant.created','d1000000-0000-4000-8000-000000000001','tenant','d1000000-0000-4000-8000-000000000001',null,'{"name":"Synthetic demo · North Clinic"}','succeeded',interval '42 days'),
  ('db000000-0000-4000-8000-000000000002','admin','plan.assigned','d1000000-0000-4000-8000-000000000001','subscription','d1000000-0000-4000-8000-000000000001','Synthetic demo onboarding','{"plan":"launch","ring":"canary"}','succeeded',interval '41 days'),
  ('db000000-0000-4000-8000-000000000003','admin','rollout.started',null,'rollout','d7000000-0000-4000-8000-000000000002',null,'{"targets":1}','succeeded',interval '1 day'),
  ('db000000-0000-4000-8000-000000000004','admin','tenant.suspended','d1000000-0000-4000-8000-000000000003','tenant','d1000000-0000-4000-8000-000000000003','Synthetic demo: payment dispute','{"from":"active","to":"suspended"}','succeeded',interval '6 hours'),
  ('db000000-0000-4000-8000-000000000005','admin2','tenant.closure_requested','d1000000-0000-4000-8000-000000000003','tenant','d1000000-0000-4000-8000-000000000003','Synthetic demo: contract ended','{"job_ids":["d8000000-0000-4000-8000-000000000004"]}','succeeded',interval '5 hours'),
  ('db000000-0000-4000-8000-000000000006','viewer','tenant.suspend','d1000000-0000-4000-8000-000000000001','tenant','d1000000-0000-4000-8000-000000000001',null,'{"error_code":"policy_denied"}','denied',interval '4 hours'),
  ('db000000-0000-4000-8000-000000000007','admin','support.approved','d1000000-0000-4000-8000-000000000001','support_grant','d9000000-0000-4000-8000-000000000001',null,'{"grant_id":"d9000000-0000-4000-8000-000000000001"}','succeeded',interval '10 minutes')
) v(id,who,action,t,kind,target,reason,detail,outcome,age)
on conflict (id) do nothing;

commit;
