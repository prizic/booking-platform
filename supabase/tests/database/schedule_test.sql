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

select ok((select relrowsecurity from pg_class where oid='app.schedule_scopes'::regclass), 'schedule scopes require RLS');
select ok((select relrowsecurity from pg_class where oid='app.weekly_schedules'::regclass), 'weekly schedules require RLS');
select ok((select relrowsecurity from pg_class where oid='app.schedule_exceptions'::regclass), 'exceptions require RLS');
select ok(not has_table_privilege('anon','app.schedule_scopes','select'), 'anonymous cannot read raw schedule scopes');
select ok(not has_table_privilege('anon','app.time_off','select'), 'anonymous cannot read private time off');
select ok(has_function_privilege('authenticated','api_v1.save_schedule_config_v1(uuid,text,jsonb,bigint)','execute'), 'authenticated Dashboard can use the authoring RPC');
select ok(not has_function_privilege('anon','api_v1.save_schedule_config_v1(uuid,text,jsonb,bigint)','execute'), 'anonymous cannot use the authoring RPC');
select ok(has_function_privilege('authenticated','api_v1.get_schedule_workspace_v1(uuid,uuid)','execute'), 'authenticated Dashboard can read scoped workspace rows');
select ok(not has_function_privilege('anon','api_v1.get_schedule_workspace_v1(uuid,uuid)','execute'), 'anonymous cannot read schedule workspace rows');
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='api_v1' and p.proname in ('save_schedule_config_v1','get_schedule_workspace_v1') and p.prosecdef), 'schedule API functions are invoker functions');
select ok((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='can_manage_schedule_scope')=1, 'schedule scope authorization is a single narrow helper');

select is((select count(*)::integer from app.schedule_scopes where tenant_id='a0000000-0000-0000-0000-000000000001'), 1, 'seed contains one tenant A location scope');
select is((select count(*)::integer from app.schedule_scopes where tenant_id='b0000000-0000-0000-0000-000000000001'), 1, 'seed contains one tenant B location scope');
select is((select count(*)::integer from api_v1.get_schedule_workspace_v1('a0000000-0000-0000-0000-000000000001',null) where kind='weekly'), 5, 'workspace exposes only normalized weekly rows');
select ok(not exists (select 1 from api_v1.get_schedule_workspace_v1('a0000000-0000-0000-0000-000000000001',null) where reason is not null and kind not in ('time_off','holiday','blackout','maintenance')), 'schedule workspace keeps reason fields limited to exception records');

select throws_ok(
  $$select * from api_v1.save_schedule_config_v1('a0000000-0000-0000-0000-000000000001','weekly',jsonb_build_object('scope_id','a5600000-0000-0000-0000-000000000001','day_of_week',1,'start_minute',600,'end_minute',700),1)$$,
  '42501', 'schedule_authorization_required', 'direct unauthenticated SQL cannot author a schedule'
);

rollback;
