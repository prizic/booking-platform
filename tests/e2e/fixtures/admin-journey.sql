-- Extend the isolated platform-admin-demo seed; no provider success evidence.
begin;
do $$ begin
  if not exists(select 1 from app.tenants where id='d1000000-0000-4000-8000-000000000001' and name='Synthetic demo · North Clinic') then
    raise exception 'Requires isolated synthetic admin seed';
  end if;
end $$;
insert into app.tenants(id,name,status) values
 ('d1000000-0000-4000-8000-000000000136','Synthetic journey active','active'),
 ('d1000000-0000-4000-8000-000000000137','Synthetic journey reject','suspended'),
 ('d1000000-0000-4000-8000-000000000138','Synthetic journey provisioning','active'),
 ('d1000000-0000-4000-8000-000000000139','Synthetic journey domains','active'),
 ('d1000000-0000-4000-8000-000000000140','Synthetic journey subscribed','active')
on conflict(id) do nothing;
insert into app.brands(id,tenant_id,key,status)
select ('d2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('d1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'journey-'||n,'active'
from generate_series(136,140)n on conflict(id) do nothing;
insert into app.brand_revisions
select (jsonb_populate_record(null::app.brand_revisions,to_jsonb(r)||jsonb_build_object(
 'id',('d4000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'tenant_id',('d1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'brand_id',('d2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid))).*
from app.brand_revisions r cross join generate_series(136,140)n
where r.id='d4000000-0000-4000-8000-000000000001' on conflict(id) do nothing;
insert into app.instances
select (jsonb_populate_record(null::app.instances,to_jsonb(i)||jsonb_build_object(
 'id',('d3000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'tenant_id',('d1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'brand_id',('d2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'published_brand_revision_id',('d4000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'deployment_state',case when n=137 then 'suspended' when n=138 then 'provisioning' else 'active' end))).*
from app.instances i cross join generate_series(136,140)n
where i.id='d3000000-0000-4000-8000-000000000001' on conflict(id) do nothing;

insert into control_plane.plans
select (jsonb_populate_record(null::control_plane.plans,to_jsonb(p)||jsonb_build_object(
 'key','journey-retained','name','Journey retained plan'))).*
from control_plane.plans p where key='launch' on conflict(key) do nothing;
insert into control_plane.subscriptions
select (jsonb_populate_record(null::control_plane.subscriptions,to_jsonb(s)||jsonb_build_object(
 'tenant_id',('d1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'plan_key','journey-retained'))).*
from control_plane.subscriptions s cross join generate_series(136,140)n
where s.tenant_id='d1000000-0000-4000-8000-000000000001' on conflict(tenant_id) do nothing;

insert into app.tenant_domains
select (jsonb_populate_record(null::app.tenant_domains,to_jsonb(d)||jsonb_build_object(
 'id',('da000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'tenant_id','d1000000-0000-4000-8000-000000000139',
 'instance_id','d3000000-0000-4000-8000-000000000139',
 'hostname',case n when 136 then 'book.journey-active.example.invalid' else 'book.journey-replacement.example.invalid' end,
 'active',n=136))).*
from app.tenant_domains d cross join generate_series(136,137)n
where d.id='da000000-0000-4000-8000-000000000001' on conflict(id) do nothing;

-- Synthetic completed release proof copied from the existing demo, never an
-- observation about an actual GitHub/Vercel deployment.
insert into control_plane.instance_release_state
select (jsonb_populate_record(null::control_plane.instance_release_state,to_jsonb(r)||jsonb_build_object(
 'tenant_id','d1000000-0000-4000-8000-000000000138',
 'instance_id','d3000000-0000-4000-8000-000000000138'))).*
from control_plane.instance_release_state r where r.instance_id='d3000000-0000-4000-8000-000000000001'
on conflict(tenant_id,instance_id) do nothing;

insert into control_plane.provisioning_runs
select (jsonb_populate_record(null::control_plane.provisioning_runs,to_jsonb(r)||jsonb_build_object(
 'id','d5000000-0000-4000-8000-000000000138',
 'tenant_id','d1000000-0000-4000-8000-000000000138',
 'instance_id','d3000000-0000-4000-8000-000000000138',
 'slug','journey-active','idempotency_key','journey-active-run','state','health_checked','activated_at',null))).*
from control_plane.provisioning_runs r where r.id='d5000000-0000-4000-8000-000000000001' on conflict(id) do nothing;
insert into control_plane.provisioning_runs
select (jsonb_populate_record(null::control_plane.provisioning_runs,to_jsonb(r)||jsonb_build_object(
 'id','d5000000-0000-4000-8000-000000000137',
 'tenant_id','d1000000-0000-4000-8000-000000000137',
 'instance_id','d3000000-0000-4000-8000-000000000137',
 'slug','journey-failed','idempotency_key','journey-failed-run'))).*
from control_plane.provisioning_runs r where r.id='d5000000-0000-4000-8000-000000000002' on conflict(id) do nothing;
insert into control_plane.provisioning_steps
select (jsonb_populate_record(null::control_plane.provisioning_steps,to_jsonb(s)||jsonb_build_object(
 'run_id',v.target,'idempotency_key',v.target::text||':'||s.step_key))).*
from control_plane.provisioning_steps s join (values
 ('d5000000-0000-4000-8000-000000000001'::uuid,'d5000000-0000-4000-8000-000000000138'::uuid),
 ('d5000000-0000-4000-8000-000000000002'::uuid,'d5000000-0000-4000-8000-000000000137'::uuid)
)v(source,target)on s.run_id=v.source on conflict do nothing;
insert into control_plane.provisioning_events(run_id,step_key,event,attempt,error_code,occurred_at)
select v.target,e.step_key,e.event,e.attempt,e.error_code,e.occurred_at
from control_plane.provisioning_events e join (values
 ('d5000000-0000-4000-8000-000000000001'::uuid,'d5000000-0000-4000-8000-000000000138'::uuid),
 ('d5000000-0000-4000-8000-000000000002'::uuid,'d5000000-0000-4000-8000-000000000137'::uuid)
)v(source,target)on e.run_id=v.source
where not exists(select 1 from control_plane.provisioning_events x where x.run_id=v.target)
 and not(v.target='d5000000-0000-4000-8000-000000000138' and e.event='activated');

insert into control_plane.jobs
select (jsonb_populate_record(null::control_plane.jobs,to_jsonb(j)||jsonb_build_object(
 'id',v.target,'tenant_id','d1000000-0000-4000-8000-000000000137',
 'instance_id','d3000000-0000-4000-8000-000000000137',
 'reason','Synthetic journey rejection request',
 'parameters',j.parameters || jsonb_build_object('reason','Synthetic journey rejection request','reason_recorded',true),
 'idempotency_key',v.target::text))).*
from control_plane.jobs j join(values
 ('d8000000-0000-4000-8000-000000000002'::uuid,'d8000000-0000-4000-8000-000000000136'::uuid),
 ('d8000000-0000-4000-8000-000000000004'::uuid,'d8000000-0000-4000-8000-000000000137'::uuid),
 ('d8000000-0000-4000-8000-000000000004'::uuid,'d8000000-0000-4000-8000-000000000138'::uuid)
)v(source,target)on j.id=v.source on conflict(id) do nothing;
insert into control_plane.job_events(job_id,event,attempt,error_code,actor_id,occurred_at)
select v.target,e.event,e.attempt,e.error_code,e.actor_id,e.occurred_at
from control_plane.job_events e join(values
 ('d8000000-0000-4000-8000-000000000002'::uuid,'d8000000-0000-4000-8000-000000000136'::uuid),
 ('d8000000-0000-4000-8000-000000000004'::uuid,'d8000000-0000-4000-8000-000000000137'::uuid),
 ('d8000000-0000-4000-8000-000000000004'::uuid,'d8000000-0000-4000-8000-000000000138'::uuid)
)v(source,target)on e.job_id=v.source
where not exists(select 1 from control_plane.job_events x where x.job_id=v.target);
commit;
