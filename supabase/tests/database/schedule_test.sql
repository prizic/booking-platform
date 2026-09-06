begin;
select no_plan();

select has_table('app'::name, 'schedule_scopes'::name);
select has_table('app'::name, 'weekly_schedules'::name);
select has_table('app'::name, 'schedule_breaks'::name);
select has_table('app'::name, 'schedule_exceptions'::name);
select has_table('app'::name, 'time_off'::name);
select has_table('app'::name, 'holidays'::name);
select has_table('app'::name, 'blackouts'::name);
select has_table('app'::name, 'resource_maintenance_blocks'::name);
select has_table('app'::name, 'schedule_policy_overrides'::name);
select has_table('app'::name, 'schedule_audit_events'::name);

select ok((select relrowsecurity from pg_class where oid='app.schedule_scopes'::regclass), 'schedule scopes require RLS');
select ok((select relrowsecurity from pg_class where oid='app.weekly_schedules'::regclass), 'weekly schedules require RLS');
select ok((select relrowsecurity from pg_class where oid='app.schedule_exceptions'::regclass), 'exceptions require RLS');
select ok((select relrowsecurity from pg_class where oid='app.schedule_audit_events'::regclass), 'schedule audit is protected by RLS');
select ok(not has_table_privilege('anon','app.schedule_scopes','select'), 'anonymous cannot read raw schedule scopes');
select ok(not has_table_privilege('anon','app.time_off','select'), 'anonymous cannot read private time off');
select ok(has_function_privilege('authenticated','api_v1.save_schedule_config_v1(uuid,text,jsonb,bigint,uuid)','execute'), 'authenticated Dashboard can use the authoring RPC');
select ok(not has_function_privilege('anon','api_v1.save_schedule_config_v1(uuid,text,jsonb,bigint,uuid)','execute'), 'anonymous cannot use the authoring RPC');
select ok(has_function_privilege('authenticated','api_v1.get_schedule_workspace_v1(uuid,uuid)','execute'), 'authenticated Dashboard can read scoped workspace rows');
select ok(not has_function_privilege('anon','api_v1.get_schedule_workspace_v1(uuid,uuid)','execute'), 'anonymous cannot read schedule workspace rows');
select is(
  pg_get_function_result('api_v1.get_schedule_workspace_v1(uuid,uuid)'::regprocedure),
  'TABLE(kind text, id uuid, scope_id uuid, location_id uuid, staff_id uuid, resource_id uuid, local_date text, day_of_week smallint, start_minute smallint, end_minute smallint, starts_at timestamp with time zone, ends_at timestamp with time zone, exception_kind text, time_zone text, reason text, policy_key text, value numeric, revision bigint)',
  'schedule workspace preserves its published return-column order and types'
);
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='api_v1' and p.proname in ('save_schedule_config_v1','get_schedule_workspace_v1') and p.prosecdef), 'schedule API functions are invoker functions');
select ok((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='can_manage_schedule_scope')=1, 'schedule scope authorization is a single narrow helper');

select is((select count(*)::integer from app.schedule_scopes where tenant_id='a0000000-0000-0000-0000-000000000001'), 1, 'seed contains one tenant A location scope');
select is((select count(*)::integer from app.schedule_scopes where tenant_id='b0000000-0000-0000-0000-000000000001'), 1, 'seed contains one tenant B location scope');
select is((select count(*)::integer from api_v1.get_schedule_workspace_v1('a0000000-0000-0000-0000-000000000001',null) where kind='weekly'), 5, 'workspace exposes only normalized weekly rows');
select ok(not exists (select 1 from api_v1.get_schedule_workspace_v1('a0000000-0000-0000-0000-000000000001',null) where reason is not null and kind not in ('time_off','holiday','blackout','maintenance')), 'schedule workspace keeps reason fields limited to exception records');

select throws_ok(
  $$select * from api_v1.save_schedule_config_v1('a0000000-0000-0000-0000-000000000001','weekly',jsonb_build_object('scope_id','a5600000-0000-0000-0000-000000000001','day_of_week',1,'start_minute',600,'end_minute',700),1,null)$$,
  '42501', 'schedule_authorization_required', 'direct unauthenticated SQL cannot author a schedule'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is((select count(*)::integer from api_v1.get_schedule_workspace_v1('a0000000-0000-0000-0000-000000000001',null) where kind='weekly'), 5, 'tenant A scheduler can read the complete schedule workspace');
select is((select count(*)::integer from api_v1.get_schedule_workspace_v1('b0000000-0000-0000-0000-000000000001',null)), 0, 'tenant A scheduler cannot read tenant B schedule rows');
create temp table schedule_first_result as
  select null::uuid as target_id, null::bigint as revision
  where false;
select lives_ok($$insert into schedule_first_result select * from api_v1.save_schedule_config_v1('a0000000-0000-0000-0000-000000000001','weekly',jsonb_build_object('scope_id','a5600000-0000-0000-0000-000000000001','day_of_week',6,'start_minute',600,'end_minute',700),1,'a5900000-0000-0000-0000-000000000001')$$, 'authorized scheduler can add a non-overlapping weekly interval');
select results_eq(
  $$select * from api_v1.save_schedule_config_v1('a0000000-0000-0000-0000-000000000001','weekly',jsonb_build_object('scope_id','a5600000-0000-0000-0000-000000000001','day_of_week',6,'start_minute',600,'end_minute',700),1,'a5900000-0000-0000-0000-000000000001')$$,
  $$select target_id,revision from schedule_first_result$$,
  'repeating a successful request returns the identical target and revision');
reset role;
set local role postgres;
select is((select count(*)::integer from app.schedule_audit_events where request_id='a5900000-0000-0000-0000-000000000001'), 1, 'successful mutation records actor, target, request, and redacted diff');
select is((select count(*)::integer from app.weekly_schedules where tenant_id='a0000000-0000-0000-0000-000000000001' and day_of_week=6 and start_minute=600 and end_minute=700), 1, 'repeating a successful request creates no second schedule mutation');
reset role;
set local role authenticated;
select throws_ok($$select * from api_v1.save_schedule_config_v1('a0000000-0000-0000-0000-000000000001','weekly',jsonb_build_object('scope_id','a5600000-0000-0000-0000-000000000001','day_of_week',1,'start_minute',600,'end_minute',700),2,'a5900000-0000-0000-0000-000000000002')$$, '22023', 'schedule_interval_overlap', 'overlapping weekly intervals are rejected');
select throws_ok($$select * from api_v1.save_schedule_config_v1('a0000000-0000-0000-0000-000000000001','weekly',jsonb_build_object('scope_id','a5600000-0000-0000-0000-000000000001','id','b5700000-0000-0000-0000-000000000001','day_of_week',6,'start_minute',700,'end_minute',800),2,'a5900000-0000-0000-0000-000000000003')$$, '42501', 'schedule_cross_tenant_target', 'foreign tenant row identifiers cannot be upserted');
select throws_ok($$select * from api_v1.save_schedule_config_v1('a0000000-0000-0000-0000-000000000001','weekly',jsonb_build_object('scope_id','a5600000-0000-0000-0000-000000000001','day_of_week',6,'start_minute',700,'end_minute',800),1,'a5900000-0000-0000-0000-000000000004')$$, '40001', 'revision_conflict', 'stale scope revisions are rejected');
reset role;

select * from finish();
rollback;
