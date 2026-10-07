begin;
select plan(4);
-- The platform-managed table owner installs this policy through the explicit
-- provisioning script. Environments without Realtime record these as skipped.
select case when exists(select 1 from pg_policies where schemaname='realtime' and policyname='tenant_workspace_broadcast_read') then
  lives_ok($$select realtime.send('{}'::jsonb,'completion_probe','tenant:a0000000-0000-0000-0000-000000000001',true); select realtime.send('{}'::jsonb,'completion_probe','tenant:b0000000-0000-0000-0000-000000000001',true)$$,'infrastructure can enqueue private invalidations for distinct tenants')
else skip('Realtime owner policy is not provisioned',1) end;
select set_config('realtime.topic','tenant:a0000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select case when exists(select 1 from pg_policies where schemaname='realtime' and policyname='tenant_workspace_broadcast_read') then
  is((select count(*) from realtime.messages where event='completion_probe')::integer,1,'active member can read its private topic')
else skip('Realtime owner policy is not provisioned',1) end;
select set_config('realtime.topic','tenant:b0000000-0000-0000-0000-000000000001',true);
select case when exists(select 1 from pg_policies where schemaname='realtime' and policyname='tenant_workspace_broadcast_read') then
  is((select count(*) from realtime.messages where event='completion_probe')::integer,0,'known foreign tenant topic is refused')
else skip('Realtime owner policy is not provisioned',1) end;
select case when exists(select 1 from pg_policies where schemaname='realtime' and policyname='tenant_workspace_broadcast_read') then
  throws_like($$insert into realtime.messages(topic,extension,event,payload,private) values('tenant:a0000000-0000-0000-0000-000000000001','broadcast','completion_probe','{}',true)$$,'%row-level security%','members cannot write broadcast messages')
else skip('Realtime owner policy is not provisioned',1) end;
reset role;
select * from finish();
rollback;
