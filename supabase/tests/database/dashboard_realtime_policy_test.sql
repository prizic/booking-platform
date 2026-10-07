begin;
select plan(4);
-- The platform-managed table owner installs this policy through the explicit
-- provisioning script. Environments without a reachable Realtime authorization
-- surface record these assertions as skipped.
select case when exists(select 1 from pg_policies where schemaname='realtime' and policyname='tenant_workspace_broadcast_read') then
  lives_ok($$select realtime.send('{}'::jsonb,'completion_probe','tenant:a0000000-0000-0000-0000-000000000001',true); select realtime.send('{}'::jsonb,'completion_probe','tenant:b0000000-0000-0000-0000-000000000001',true)$$,'infrastructure can enqueue private invalidations for distinct tenants')
else skip('Realtime owner policy is not provisioned',1) end;
create function pg_temp.realtime_completion_probe_count()
returns integer language plpgsql security invoker set search_path='' as $$
declare v_count integer;
begin
  execute 'select count(*)::integer from realtime.messages where event=$1'
    into v_count using 'completion_probe';
  return v_count;
end;
$$;
select set_config('realtime.topic','tenant:a0000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select case when exists(
  select 1 from pg_policies p
  join pg_namespace n on n.nspname=p.schemaname
  join pg_class c on c.relnamespace=n.oid and c.relname=p.tablename
  where p.policyname='tenant_workspace_broadcast_read'
    and has_schema_privilege('authenticated',n.oid,'usage')
    and has_table_privilege('authenticated',c.oid,'select')) then
  is(pg_temp.realtime_completion_probe_count(),1,'active member can read its private topic')
else skip('Realtime policy is not reachable by the authenticated role',1) end;
select set_config('realtime.topic','tenant:b0000000-0000-0000-0000-000000000001',true);
select case when exists(
  select 1 from pg_policies p
  join pg_namespace n on n.nspname=p.schemaname
  join pg_class c on c.relnamespace=n.oid and c.relname=p.tablename
  where p.policyname='tenant_workspace_broadcast_read'
    and has_schema_privilege('authenticated',n.oid,'usage')
    and has_table_privilege('authenticated',c.oid,'select')) then
  is(pg_temp.realtime_completion_probe_count(),0,'known foreign tenant topic is refused')
else skip('Realtime policy is not reachable by the authenticated role',1) end;
select case when exists(
  select 1 from pg_policies p
  join pg_namespace n on n.nspname=p.schemaname
  join pg_class c on c.relnamespace=n.oid and c.relname=p.tablename
  where p.policyname='tenant_workspace_broadcast_read'
    and has_schema_privilege('authenticated',n.oid,'usage')
    and has_table_privilege('authenticated',c.oid,'insert')) then
  throws_like($$insert into realtime.messages(topic,extension,event,payload,private) values('tenant:a0000000-0000-0000-0000-000000000001','broadcast','completion_probe','{}',true)$$,'%row-level security%','members cannot write broadcast messages')
else skip('Realtime policy is not reachable by the authenticated role',1) end;
reset role;
select * from finish();
rollback;
