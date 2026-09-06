begin;
select no_plan();

-- Keep ordinary Monday fixtures beyond notice, regardless of the run date or
-- New York's current UTC offset. Day offsets are elapsed 24-hour periods so
-- maximum-window tests stay exactly 31 days across a seasonal clock change.
select set_config('test.availability_day',
  (date_trunc('week',statement_timestamp() at time zone 'America/New_York')::date+14)::text,true);
create function pg_temp.availability_time(p_days integer,p_time time)
returns timestamptz language sql stable as $$
  select ((current_setting('test.availability_day')::date+p_time) at time zone 'America/New_York')
    + make_interval(hours=>24*p_days);
$$;
do $$ begin
  execute format('grant usage on schema %I to authenticated',pg_my_temp_schema()::regnamespace::text);
end $$;

-- Prefer the next New York fold. Occasionally consecutive November folds are
-- 371 days apart, outside the allowed 365-day horizon; Sydney's April fold
-- supplies an in-horizon case then, so DST assertions never depend on a skip.
with candidates as (
  select zone,local_hour,make_date(year,month,1) as month_start
  from generate_series(extract(year from statement_timestamp())::integer,
                       extract(year from statement_timestamp())::integer+1) year
  cross join (values ('America/New_York',11,1),('Australia/Sydney',4,2)) zones(zone,month,local_hour)
), transitions as (
  select zone,local_hour,month_start+mod(7-extract(dow from month_start)::integer,7) as local_date
  from candidates
), upcoming as (
  select *, (local_date+make_time(local_hour,0,0)) at time zone zone as second_hour
  from transitions
)
select set_config('test.fold_zone',zone,true),set_config('test.fold_date',local_date::text,true),
  set_config('test.fold_minute',(local_hour*60)::text,true),set_config('test.fold_at',second_hour::text,true)
from upcoming
where second_hour-interval '1 hour'>statement_timestamp()+interval '2 hours'
  and second_hour+interval '1 hour'<statement_timestamp()+interval '365 days'
order by (zone='America/New_York') desc,second_hour limit 1;
create function pg_temp.fold_time(p_minutes integer)
returns timestamptz language sql stable as $$
  select current_setting('test.fold_at')::timestamptz+make_interval(mins=>p_minutes);
$$;

select has_table('app'::name, 'availability_revisions'::name);
select is((select count(*)::integer from app.availability_revisions), (select count(*)::integer from app.tenants), 'existing tenants receive availability revision rows during migration');
select ok((select relrowsecurity from pg_class where oid='app.availability_revisions'::regclass), 'availability revisions require RLS');
select ok(not has_table_privilege('anon','app.availability_revisions','select'), 'anonymous callers cannot read availability revisions');
select ok(not exists(
  select 1 from (values ('anon'),('authenticated')) principals(role_name)
  cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) commands(privilege)
  where has_table_privilege(principals.role_name,'app.availability_revisions',commands.privilege)
), 'application roles have no direct availability revision CRUD grants');
select ok(not exists(
  select 1 from (values ('anon'),('authenticated')) principals(role_name)
  cross join (values ('private.bump_availability_revision()'),('private.initialize_availability_revision()')) helpers(signature)
  where has_function_privilege(principals.role_name,helpers.signature,'EXECUTE')
), 'application roles cannot directly execute revision trigger helpers');

savepoint revision_rls;
insert into app.tenants(id,name) values ('a8860000-0000-0000-0000-000000000001','Synthetic revision tenant');
select is((select revision from app.availability_revisions where tenant_id='a8860000-0000-0000-0000-000000000001'),1::bigint,
  'the private tenant trigger initializes revision state despite application deny policies');
-- Grant only inside this rolled-back fixture to prove RLS independently of
-- the production privilege denial. Neither principal may read or mutate rows.
grant select,insert,update,delete on app.availability_revisions to anon,authenticated;
set local role anon;
select is((select count(*)::integer from app.availability_revisions),0,'anonymous RLS hides all tenant revisions');
with changed as (update app.availability_revisions set revision=revision+1 returning 1) select is((select count(*)::integer from changed),0,'anonymous RLS denies revision updates');
with changed as (delete from app.availability_revisions returning 1) select is((select count(*)::integer from changed),0,'anonymous RLS denies revision deletion');
select throws_ok($$insert into app.availability_revisions(tenant_id) values ('a8860000-0000-0000-0000-000000000001')$$,
  '42501','new row violates row-level security policy for table "availability_revisions"','anonymous RLS denies revision insertion');
reset role;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select count(*)::integer from app.availability_revisions),0,'tenant admin RLS hides same-tenant and other-tenant revisions');
with changed as (update app.availability_revisions set revision=revision+1 returning 1) select is((select count(*)::integer from changed),0,'tenant admin RLS denies revision updates');
with changed as (delete from app.availability_revisions returning 1) select is((select count(*)::integer from changed),0,'tenant admin RLS denies revision deletion');
select throws_ok($$insert into app.availability_revisions(tenant_id) values ('a0000000-0000-0000-0000-000000000001')$$,
  '42501','new row violates row-level security policy for table "availability_revisions"','tenant admin RLS denies even same-tenant revision insertion');
reset role;
rollback to savepoint revision_rls;
select has_function('api_v1'::name, 'get_availability_v1'::name, array['text','text','uuid','uuid','uuid','timestamp with time zone','timestamp with time zone','integer','text']);
select ok(has_function_privilege('anon','api_v1.get_availability_v1(text,text,uuid,uuid,uuid,timestamptz,timestamptz,integer,text)','execute'), 'anonymous Client callers can request availability');
select ok(has_function_privilege('authenticated','api_v1.get_availability_v1(text,text,uuid,uuid,uuid,timestamptz,timestamptz,integer,text)','execute'), 'authenticated Dashboard callers can request availability');
select ok(not (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='api_v1' and p.proname='get_availability_v1'), 'public availability wrapper is security invoker');
select ok((select p.proconfig @> array['statement_timeout=2s'] from pg_proc p where p.oid='api_v1.get_availability_v1(text,text,uuid,uuid,uuid,timestamptz,timestamptz,integer,text)'::regprocedure), 'exposed availability RPC declares the timeout PostgREST hoists');
select ok(not has_function_privilege('anon','private.resolve_availability_policy_v1(uuid,uuid,uuid,uuid,uuid,text,integer)','execute'), 'anonymous callers cannot execute the private policy resolver');
select ok(not has_function_privilege('authenticated','private.resolve_availability_policy_v1(uuid,uuid,uuid,uuid,uuid,text,integer)','execute'), 'authenticated callers cannot execute the private policy resolver');

select throws_ok(
  $$select * from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.availability_time(0,'08:00'),pg_temp.availability_time(32,'08:00'),1,'America/New_York')$$,
  '22023','availability_window_too_large','availability windows are bounded'
);
select throws_ok(
  $$select * from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.availability_time(0,'08:00'),pg_temp.availability_time(1,'08:00'),2,'America/New_York')$$,
  '22023','availability_party_size_out_of_bounds','v1 rejects unsupported party sizes'
);
select throws_ok(
  $$select * from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.availability_time(0,'08:00'),pg_temp.availability_time(1,'08:00'),1,'Mars/Olympus')$$,
  '22023','availability_invalid_timezone','unknown timezones are rejected'
);
select throws_ok(
  $$select * from api_v1.get_availability_v1('preview.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.availability_time(0,'08:00'),pg_temp.availability_time(1,'08:00'),1,'America/New_York')$$,
  '42501','availability_context_required','unverified preview hosts fail closed'
);

-- A bookable staff member and matching civil-time schedule make the seeded
-- published service available on the derived Monday in New York.
insert into app.staff_profiles(id,tenant_id,public_name)
values ('a8000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Available staff');
insert into app.staff_services(tenant_id,staff_id,service_id)
values ('a0000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001');
insert into app.staff_locations(tenant_id,staff_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001');
insert into app.staff_service_locations(tenant_id,staff_id,service_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001');
insert into app.schedule_scopes(id,tenant_id,scope_kind,location_id,staff_id,time_zone)
values ('a8100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','staff','a5000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001','America/New_York');
insert into app.weekly_schedules(id,tenant_id,schedule_scope_id,day_of_week,start_minute,end_minute)
values ('a8200000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a8100000-0000-0000-0000-000000000001',1,540,1020);

select set_config('test.availability_revision',(select revision::text from app.availability_revisions where tenant_id='a0000000-0000-0000-0000-000000000001'),true);
select is(
  (select count(*)::integer from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.availability_time(0,'09:00'),pg_temp.availability_time(0,'18:00'),1,'America/New_York') where result_kind='slot'),
  30,
  'duration, opening hours, staff schedule, and 15-minute interval produce bounded slots'
);
savepoint staff_choices;
insert into app.staff_profiles(id,tenant_id,public_name)
values ('a8000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','Second available staff');
insert into app.staff_services(tenant_id,staff_id,service_id)
values ('a0000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000002','a7200000-0000-0000-0000-000000000001');
insert into app.staff_locations(tenant_id,staff_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000002','a5000000-0000-0000-0000-000000000001');
insert into app.staff_service_locations(tenant_id,staff_id,service_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000002','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001');
insert into app.schedule_scopes(id,tenant_id,scope_kind,location_id,staff_id,time_zone)
values ('a8100000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','staff','a5000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000002','America/New_York');
insert into app.weekly_schedules(id,tenant_id,schedule_scope_id,day_of_week,start_minute,end_minute)
values ('a8200000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','a8100000-0000-0000-0000-000000000002',1,540,1020);
select is(
  (select array[count(*)::integer,count(distinct staff_id)::integer,max(candidate_rank)]
    from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.availability_time(0,'09:00'),pg_temp.availability_time(0,'09:45'),1,'America/New_York')
    where result_kind='slot' and allocation_kind='appointment'),
  array[2,2,2],
  'appointment offers preserve distinct public staff choices at the same time'
);
rollback to savepoint staff_choices;
select is(
  (select array_agg(a.slot_start order by requested.window_start,a.slot_start)
    from (values (pg_temp.availability_time(0,'09:01')),(pg_temp.availability_time(0,'09:00:30'))) requested(window_start)
    cross join lateral api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,requested.window_start,pg_temp.availability_time(0,'10:00'),1,'America/New_York') a
    where a.result_kind='slot'),
  array[pg_temp.availability_time(0,'09:15'),pg_temp.availability_time(0,'09:15')],
  'non-grid minute and second window starts retain only the in-bounds 09:15 local grid slot'
);
update app.schedule_scopes set time_zone='America/Chicago'
where id='a5600000-0000-0000-0000-000000000001';
update app.weekly_schedules set start_minute=480,end_minute=540
where schedule_scope_id='a5600000-0000-0000-0000-000000000001' and day_of_week=1;
select is(
  (select count(*)::integer from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.availability_time(0,'09:00'),pg_temp.availability_time(0,'10:00'),1,'America/New_York') where result_kind='slot' and location_time_zone='America/Chicago'),
  2,
  'location civil hours and returned zone use the authoritative location schedule scope timezone'
);
update app.schedule_scopes set time_zone='America/New_York'
where id='a5600000-0000-0000-0000-000000000001';
update app.weekly_schedules set start_minute=540,end_minute=1020
where schedule_scope_id='a5600000-0000-0000-0000-000000000001' and day_of_week=1;
update app.schedule_scopes set time_zone='America/Chicago'
where id='a8100000-0000-0000-0000-000000000001';
update app.weekly_schedules set start_minute=480,end_minute=960
where id='a8200000-0000-0000-0000-000000000001';
select is(
  (select count(*)::integer from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.availability_time(0,'09:00'),pg_temp.availability_time(0,'18:00'),1,'America/New_York') where result_kind='slot'),
  30,
  'subject working hours are interpreted in the subject schedule timezone'
);
update app.schedule_scopes set time_zone='America/New_York'
where id='a8100000-0000-0000-0000-000000000001';
update app.weekly_schedules set start_minute=540,end_minute=1020
where id='a8200000-0000-0000-0000-000000000001';
savepoint dst_fixtures;
update app.schedule_scopes set time_zone=current_setting('test.fold_zone')
where id in ('a5600000-0000-0000-0000-000000000001','a8100000-0000-0000-0000-000000000001');
insert into app.schedule_policy_overrides(id,tenant_id,scope_kind,service_id,policy_key,value) values
 ('a8840000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','service','a7200000-0000-0000-0000-000000000001','horizon_days','365'),
 ('a8840000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','service','a7200000-0000-0000-0000-000000000001','minimum_notice_minutes','0');
insert into app.schedule_exceptions(id,tenant_id,schedule_scope_id,local_date,exception_kind,start_minute,end_minute,fold) values
 ('a8900000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a5600000-0000-0000-0000-000000000001',current_setting('test.fold_date')::date,'override',current_setting('test.fold_minute')::integer,current_setting('test.fold_minute')::integer+60,1),
 ('a8900000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','a8100000-0000-0000-0000-000000000001',current_setting('test.fold_date')::date,'override',current_setting('test.fold_minute')::integer,current_setting('test.fold_minute')::integer+60,1);
select is(
  (select count(*)::integer from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.fold_time(-60),pg_temp.fold_time(60),1,current_setting('test.fold_zone')) where result_kind='slot' and fold=1),
  2,
  'an explicit exception fold exposes only the selected repeated civil-time occurrence'
);
select is(
  (select array_agg(slot_start order by slot_start)
    from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.fold_time(0),pg_temp.fold_time(60),1,current_setting('test.fold_zone'))
    where result_kind='slot' and fold=1),
  array[pg_temp.fold_time(0),pg_temp.fold_time(15)],
  'a window containing only the second repeated hour preserves fold 1 and its exceptions'
);
savepoint buffered_fold;
update app.schedule_exceptions set fold=null
where id in ('a8900000-0000-0000-0000-000000000001','a8900000-0000-0000-0000-000000000002');
insert into app.schedule_policy_overrides(id,tenant_id,scope_kind,staff_id,policy_key,value)
values ('a8820000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','staff','a8000000-0000-0000-0000-000000000001','buffer_before_minutes','30');
select is(
  (select array_agg(fold order by slot_start)
    from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.fold_time(0),pg_temp.fold_time(60),1,current_setting('test.fold_zone'))
    where result_kind='slot'),
  array[1,1]::smallint[],
  'public fold identifies the slot start even when its buffer begins in the first repeated hour'
);
rollback to savepoint buffered_fold;
savepoint fold_breaks;
update app.schedule_exceptions set fold=null,start_minute=0,end_minute=current_setting('test.fold_minute')::integer+120
where id in ('a8900000-0000-0000-0000-000000000001','a8900000-0000-0000-0000-000000000002');
insert into app.schedule_breaks(id,tenant_id,schedule_scope_id,day_of_week,start_minute,end_minute) values
 ('a8830000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a5600000-0000-0000-0000-000000000001',0,10,20),
 ('a8830000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','a8100000-0000-0000-0000-000000000001',0,10,20);
select is(
  (select count(*)::integer from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.fold_time(-30),pg_temp.fold_time(15),1,current_setting('test.fold_zone')) where result_kind='slot'),
  1,
  'a first-fold-crossing slot survives non-overlapping Sunday breaks without reversed civil ranges'
);
update app.schedule_breaks set start_minute=current_setting('test.fold_minute')::integer+45,end_minute=current_setting('test.fold_minute')::integer+60
where id='a8830000-0000-0000-0000-000000000001';
select is(
  (select count(*)::integer from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.fold_time(-30),pg_temp.fold_time(15),1,current_setting('test.fold_zone')) where result_kind='slot'),
  0,
  'a break inside the first repeated hour blocks a slot crossing the fold'
);
select is(
  (select count(*)::integer from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.fold_time(0),pg_temp.fold_time(45),1,current_setting('test.fold_zone')) where result_kind='slot'),
  1,
  'an occupied interval ending exactly at the second-hour break start remains available'
);
update app.schedule_breaks set start_minute=current_setting('test.fold_minute')::integer,end_minute=current_setting('test.fold_minute')::integer+15
where id='a8830000-0000-0000-0000-000000000002';
select is(
  (select count(*)::integer
    from (values (pg_temp.fold_time(-60)),(pg_temp.fold_time(0))) repeated(starts_at)
    cross join lateral api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,repeated.starts_at,repeated.starts_at+interval '45 minutes',1,current_setting('test.fold_zone')) a
    where a.result_kind='slot'),
  0,
  'a subject break blocks both occurrences of the same local minutes'
);
rollback to savepoint fold_breaks;
savepoint fold_openings;
delete from app.schedule_exceptions
where id in ('a8900000-0000-0000-0000-000000000001','a8900000-0000-0000-0000-000000000002');
insert into app.weekly_schedules(id,tenant_id,schedule_scope_id,day_of_week,start_minute,end_minute) values
 ('a8850000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a5600000-0000-0000-0000-000000000001',0,current_setting('test.fold_minute')::integer+20,current_setting('test.fold_minute')::integer+40),
 ('a8850000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','a8100000-0000-0000-0000-000000000001',0,current_setting('test.fold_minute')::integer,current_setting('test.fold_minute')::integer+60);
select is(
  (select count(*)::integer from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.fold_time(-30),pg_temp.fold_time(15),1,current_setting('test.fold_zone')) where result_kind='slot'),
  0,
  'a fold-crossing slot is rejected when occupied minutes leave the narrow location opening'
);
update app.weekly_schedules set start_minute=current_setting('test.fold_minute')::integer,end_minute=current_setting('test.fold_minute')::integer+60
where id='a8850000-0000-0000-0000-000000000001';
select is(
  (select count(*)::integer from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.fold_time(-30),pg_temp.fold_time(15),1,current_setting('test.fold_zone')) where result_kind='slot'),
  1,
  'full repeated-hour openings cover every occupied minute of a fold-crossing slot'
);
update app.weekly_schedules set start_minute=current_setting('test.fold_minute')::integer+20,end_minute=current_setting('test.fold_minute')::integer+40
where id='a8850000-0000-0000-0000-000000000002';
select is(
  (select count(*)::integer from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.fold_time(-30),pg_temp.fold_time(15),1,current_setting('test.fold_zone')) where result_kind='slot'),
  0,
  'subject openings must also cover every occupied minute across the fold'
);
update app.weekly_schedules set start_minute=current_setting('test.fold_minute')::integer,end_minute=current_setting('test.fold_minute')::integer+60
where id='a8850000-0000-0000-0000-000000000002';
insert into app.schedule_exceptions(id,tenant_id,schedule_scope_id,local_date,exception_kind,start_minute,end_minute,fold)
values ('a8900000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','a5600000-0000-0000-0000-000000000001',current_setting('test.fold_date')::date,'override',current_setting('test.fold_minute')::integer+20,current_setting('test.fold_minute')::integer+40,0);
select is(
  (select count(*)::integer from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.fold_time(-30),pg_temp.fold_time(15),1,current_setting('test.fold_zone')) where result_kind='slot'),
  0,
  'date overrides also require complete occupied-minute coverage and replace broader weekly hours'
);
rollback to savepoint fold_openings;
rollback to savepoint dst_fixtures;
select is(
  (select no_slot_code from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.availability_time(1,'09:00'),pg_temp.availability_time(1,'10:00'),1,'America/New_York') where result_kind='summary'),
  'no_matching_availability',
  'missing subject schedule is minimized to no matching availability'
);
select is(
  (select no_slot_code from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.availability_time(120,'10:00'),pg_temp.availability_time(120,'11:00'),1,'America/New_York') where result_kind='summary'),
  'outside_booking_window',
  'notice and horizon rejection use the coarse outside-window code'
);

-- Every policy dimension uses tenant -> location -> service -> subject
-- precedence. Travel expands the leading occupied range and turnover expands
-- the trailing range, both of which must remain inside schedules and breaks.
insert into app.schedule_policy_overrides(id,tenant_id,scope_kind,location_id,service_id,staff_id,policy_key,value) values
 ('a8800000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','tenant',null,null,null,'slot_interval_minutes','60'),
 ('a8800000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','location','a5000000-0000-0000-0000-000000000001',null,null,'slot_interval_minutes','30'),
 ('a8800000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','service',null,'a7200000-0000-0000-0000-000000000001',null,'slot_interval_minutes','20'),
 ('a8800000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','staff',null,null,'a8000000-0000-0000-0000-000000000001','slot_interval_minutes','15'),
 ('a8800000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','tenant',null,null,null,'travel_minutes','5'),
 ('a8800000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001','location','a5000000-0000-0000-0000-000000000001',null,null,'travel_minutes','10'),
 ('a8800000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000001','service',null,'a7200000-0000-0000-0000-000000000001',null,'travel_minutes','15'),
 ('a8800000-0000-0000-0000-000000000008','a0000000-0000-0000-0000-000000000001','staff',null,null,'a8000000-0000-0000-0000-000000000001','travel_minutes','20'),
 ('a8800000-0000-0000-0000-000000000009','a0000000-0000-0000-0000-000000000001','tenant',null,null,null,'turnover_minutes','5'),
 ('a8800000-0000-0000-0000-000000000010','a0000000-0000-0000-0000-000000000001','location','a5000000-0000-0000-0000-000000000001',null,null,'turnover_minutes','10'),
 ('a8800000-0000-0000-0000-000000000011','a0000000-0000-0000-0000-000000000001','service',null,'a7200000-0000-0000-0000-000000000001',null,'turnover_minutes','20'),
 ('a8800000-0000-0000-0000-000000000012','a0000000-0000-0000-0000-000000000001','staff',null,null,'a8000000-0000-0000-0000-000000000001','turnover_minutes','30');
select is(
  (select count(*)::integer from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.availability_time(0,'09:00'),pg_temp.availability_time(0,'18:00'),1,'America/New_York') where result_kind='slot'),
  26,
  'subject policy precedence drives interval and occupied travel/turnover containment'
);

insert into app.catalog_services(id,tenant_id,key,category_id)
values ('a7200000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','room-booking','a7100000-0000-0000-0000-000000000001');
insert into app.catalog_service_revisions(
  id,tenant_id,service_id,revision,locale,state,name,canonical_path,duration_minutes,
  price_minor,currency,capacity_mode,booking_mode,publication_id,published_at
) values (
  'a7210000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001',
  'a7200000-0000-0000-0000-000000000002',1,'en','published','Room booking',
  '/services/room-booking',45,1000,'SAR','exclusive','exclusive_resource',
  'a7000000-0000-0000-0000-000000000001','2026-09-05 00:00+00'
);
insert into app.catalog_service_locations(tenant_id,service_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000002','a5000000-0000-0000-0000-000000000001');
insert into app.resource_types(id,tenant_id,key,name)
values ('a8400000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','room','Room');
insert into app.resources(id,tenant_id,resource_type_id,key,public_name)
values ('a8500000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a8400000-0000-0000-0000-000000000001','room-one','Room one');
insert into app.resource_locations(tenant_id,resource_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','a8500000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001');
insert into app.resource_requirements(tenant_id,service_id,resource_type_id)
values ('a0000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000002','a8400000-0000-0000-0000-000000000001');
insert into app.schedule_scopes(id,tenant_id,scope_kind,location_id,resource_id,time_zone)
values ('a8600000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','resource','a5000000-0000-0000-0000-000000000001','a8500000-0000-0000-0000-000000000001','America/New_York');
insert into app.weekly_schedules(id,tenant_id,schedule_scope_id,day_of_week,start_minute,end_minute)
values ('a8700000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a8600000-0000-0000-0000-000000000001',1,540,1020);
select is(
  (select count(*)::integer from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000002','a5000000-0000-0000-0000-000000000001',null,pg_temp.availability_time(0,'09:00'),pg_temp.availability_time(0,'18:00'),1,'America/New_York') where result_kind='slot' and allocation_kind='exclusive_resource' and staff_id is null),
  14,
  'exclusive-resource slots expose their kind while resource identity remains private'
);
insert into app.resources(id,tenant_id,resource_type_id,key,public_name)
values ('a8500000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','a8400000-0000-0000-0000-000000000001','room-two','Room two');
insert into app.resource_locations(tenant_id,resource_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','a8500000-0000-0000-0000-000000000002','a5000000-0000-0000-0000-000000000001');
insert into app.schedule_scopes(id,tenant_id,scope_kind,location_id,resource_id,time_zone)
values ('a8600000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','resource','a5000000-0000-0000-0000-000000000001','a8500000-0000-0000-0000-000000000002','America/New_York');
insert into app.weekly_schedules(id,tenant_id,schedule_scope_id,day_of_week,start_minute,end_minute)
values ('a8700000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','a8600000-0000-0000-0000-000000000002',1,540,1020);
select is(
  (select array[count(*)::integer,count(distinct (slot_start,slot_end,allocation_kind))::integer,max(candidate_rank)]
    from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000002','a5000000-0000-0000-0000-000000000001',null,pg_temp.availability_time(0,'10:00'),pg_temp.availability_time(0,'10:45'),1,'America/New_York')
    where result_kind='slot' and allocation_kind='exclusive_resource' and staff_id is null),
  array[1,1,1],
  'two interchangeable resources produce one private-identity public slot with deterministic rank'
);
insert into app.catalog_services(id,tenant_id,key,category_id)
values ('a7200000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','group-session','a7100000-0000-0000-0000-000000000001');
insert into app.catalog_service_revisions(
  id,tenant_id,service_id,revision,locale,state,name,canonical_path,duration_minutes,
  price_minor,currency,capacity_mode,booking_mode,publication_id,published_at
) values (
  'a7210000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001',
  'a7200000-0000-0000-0000-000000000003',1,'en','published','Group session',
  '/services/group-session',45,1000,'SAR','group','appointment',
  'a7000000-0000-0000-0000-000000000001','2026-09-05 00:00+00'
);
insert into app.catalog_service_locations(tenant_id,service_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000003','a5000000-0000-0000-0000-000000000001');
select throws_ok(
  $$select * from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000003','a5000000-0000-0000-0000-000000000001',null,pg_temp.availability_time(0,'09:00'),pg_temp.availability_time(0,'18:00'),1,'America/New_York')$$,
  '22023','availability_selection_unavailable','deferred group capacity fails closed even for party size one'
);

-- More than 128 eligible subjects must not silently discard the only subject
-- whose schedule can satisfy the requested window.
insert into app.catalog_services(id,tenant_id,key,category_id)
values ('a7200000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','large-candidate-set','a7100000-0000-0000-0000-000000000001');
insert into app.catalog_service_revisions(id,tenant_id,service_id,revision,locale,state,name,canonical_path,duration_minutes,price_minor,currency,publication_id,published_at)
values ('a7210000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000004',1,'en','published','Large candidate set','/services/large-candidate-set',45,1000,'SAR','a7000000-0000-0000-0000-000000000001','2026-09-05 00:00+00');
insert into app.catalog_service_locations(tenant_id,service_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000004','a5000000-0000-0000-0000-000000000001');
insert into app.staff_profiles(id,tenant_id,public_name)
select ('10000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'a0000000-0000-0000-0000-000000000001'::uuid,'Unavailable '||i from generate_series(1,128) i
union all select 'f9000000-0000-0000-0000-000000000001'::uuid,'a0000000-0000-0000-0000-000000000001'::uuid,'Only available';
insert into app.staff_services(tenant_id,staff_id,service_id)
select 'a0000000-0000-0000-0000-000000000001',id,'a7200000-0000-0000-0000-000000000004' from app.staff_profiles where id::text like '10000000-%' or id='f9000000-0000-0000-0000-000000000001';
insert into app.staff_locations(tenant_id,staff_id,location_id)
select 'a0000000-0000-0000-0000-000000000001',id,'a5000000-0000-0000-0000-000000000001' from app.staff_profiles where id::text like '10000000-%' or id='f9000000-0000-0000-0000-000000000001';
insert into app.staff_service_locations(tenant_id,staff_id,service_id,location_id)
select 'a0000000-0000-0000-0000-000000000001',id,'a7200000-0000-0000-0000-000000000004','a5000000-0000-0000-0000-000000000001' from app.staff_profiles where id::text like '10000000-%' or id='f9000000-0000-0000-0000-000000000001';
insert into app.schedule_scopes(id,tenant_id,scope_kind,location_id,staff_id,time_zone)
select ('20000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'a0000000-0000-0000-0000-000000000001'::uuid,'staff','a5000000-0000-0000-0000-000000000001'::uuid,('10000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'America/New_York' from generate_series(1,128) i
union all select 'f9100000-0000-0000-0000-000000000001'::uuid,'a0000000-0000-0000-0000-000000000001'::uuid,'staff','a5000000-0000-0000-0000-000000000001'::uuid,'f9000000-0000-0000-0000-000000000001'::uuid,'America/New_York';
insert into app.weekly_schedules(id,tenant_id,schedule_scope_id,day_of_week,start_minute,end_minute)
select ('30000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'a0000000-0000-0000-0000-000000000001'::uuid,('20000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,2,540,1020 from generate_series(1,128) i
union all select 'f9200000-0000-0000-0000-000000000001'::uuid,'a0000000-0000-0000-0000-000000000001'::uuid,'f9100000-0000-0000-0000-000000000001'::uuid,1,540,1020;
select ok(
  exists(select 1 from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000004','a5000000-0000-0000-0000-000000000001',null,pg_temp.availability_time(0,'09:00'),pg_temp.availability_time(0,'11:00'),1,'America/New_York') where result_kind='slot' and staff_id='f9000000-0000-0000-0000-000000000001'),
  'availability evaluates the valid later subject beyond the former 128-candidate truncation'
);
select throws_ok(
  $$select * from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000004','a5000000-0000-0000-0000-000000000001',null,pg_temp.availability_time(0,'00:00'),pg_temp.availability_time(31,'00:00'),1,'America/New_York')$$,
  '54000','availability_query_too_complex',
  'high candidate cardinality combined with the maximum window is rejected before slot generation'
);
select throws_ok(
  $$select * from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000004','a5000000-0000-0000-0000-000000000001',null,pg_temp.availability_time(0,'00:00'),pg_temp.availability_time(6,'00:00'),1,'America/New_York')$$,
  '54000','availability_query_too_complex',
  'fold context is included in the 250000-point candidate workload bound'
);
select is(
  (select provider_health_code from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.availability_time(0,'09:00'),pg_temp.availability_time(0,'18:00'),1,'America/New_York') limit 1),
  'not_applicable',
  'external calendar health remains explicitly deferred'
);
select is(
  (select allocation_kind from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.availability_time(0,'09:00'),pg_temp.availability_time(0,'18:00'),1,'America/New_York') where result_kind='slot' limit 1),
  'appointment',
  'slot DTO identifies appointment versus exclusive-resource allocation without leaking resource IDs'
);
select ok(
  (select bool_and(cache_tag like 'availability:a0000000-0000-0000-0000-000000000001:1:3:1:%') from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.availability_time(0,'09:00'),pg_temp.availability_time(0,'18:00'),1,'America/New_York')),
  'cache tag includes tenant, publication, config, feature, and availability revisions'
);

insert into app.assignment_allocations(id,tenant_id,service_id,location_id,staff_id,starts_at,ends_at)
values ('a8300000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001',pg_temp.availability_time(0,'09:00'),pg_temp.availability_time(0,'09:45'));
select cmp_ok(
  (select revision from app.availability_revisions where tenant_id='a0000000-0000-0000-0000-000000000001'),
  '>',current_setting('test.availability_revision')::bigint,
  'allocation mutations invalidate tenant availability cache tags'
);
select is(
  (select count(*)::integer from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.availability_time(0,'09:00'),pg_temp.availability_time(0,'18:00'),1,'America/New_York') where result_kind='slot'),
  23,
  'active allocation occupied ranges remove overlapping advisory slots'
);
select is(
  (select no_slot_code from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.availability_time(0,'09:00'),pg_temp.availability_time(0,'09:45'),1,'America/New_York') where result_kind='summary'),
  'capacity_unavailable',
  'allocation conflicts use a coarse capacity code without conflict details'
);
insert into app.schedule_policy_overrides(id,tenant_id,scope_kind,staff_id,policy_key,value)
values ('a8800000-0000-0000-0000-000000000013','a0000000-0000-0000-0000-000000000001','staff','a8000000-0000-0000-0000-000000000001','daily_limit_per_staff','1');
select is(
  (select no_slot_code from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.availability_time(0,'14:00'),pg_temp.availability_time(0,'15:00'),1,'America/New_York') where result_kind='summary'),
  'policy_restricted',
  'daily limits use a coarse policy code'
);
insert into app.schedule_policy_overrides(id,tenant_id,scope_kind,location_id,service_id,staff_id,policy_key,value) values
 ('a8810000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','tenant',null,null,null,'buffer_before_minutes','1'),
 ('a8810000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','location','a5000000-0000-0000-0000-000000000001',null,null,'buffer_before_minutes','2'),
 ('a8810000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','service',null,'a7200000-0000-0000-0000-000000000001',null,'buffer_before_minutes','3'),
 ('a8810000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','staff',null,null,'a8000000-0000-0000-0000-000000000001','buffer_before_minutes','4'),
 ('a8810000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','tenant',null,null,null,'buffer_after_minutes','5'),
 ('a8810000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001','location','a5000000-0000-0000-0000-000000000001',null,null,'buffer_after_minutes','6'),
 ('a8810000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000001','service',null,'a7200000-0000-0000-0000-000000000001',null,'buffer_after_minutes','7'),
 ('a8810000-0000-0000-0000-000000000008','a0000000-0000-0000-0000-000000000001','staff',null,null,'a8000000-0000-0000-0000-000000000001','buffer_after_minutes','8'),
 ('a8810000-0000-0000-0000-000000000009','a0000000-0000-0000-0000-000000000001','tenant',null,null,null,'minimum_notice_minutes','60'),
 ('a8810000-0000-0000-0000-000000000010','a0000000-0000-0000-0000-000000000001','location','a5000000-0000-0000-0000-000000000001',null,null,'minimum_notice_minutes','90'),
 ('a8810000-0000-0000-0000-000000000011','a0000000-0000-0000-0000-000000000001','service',null,'a7200000-0000-0000-0000-000000000001',null,'minimum_notice_minutes','120'),
 ('a8810000-0000-0000-0000-000000000012','a0000000-0000-0000-0000-000000000001','staff',null,null,'a8000000-0000-0000-0000-000000000001','minimum_notice_minutes','150'),
 ('a8810000-0000-0000-0000-000000000013','a0000000-0000-0000-0000-000000000001','tenant',null,null,null,'horizon_days','30'),
 ('a8810000-0000-0000-0000-000000000014','a0000000-0000-0000-0000-000000000001','location','a5000000-0000-0000-0000-000000000001',null,null,'horizon_days','40'),
 ('a8810000-0000-0000-0000-000000000015','a0000000-0000-0000-0000-000000000001','service',null,'a7200000-0000-0000-0000-000000000001',null,'horizon_days','50'),
 ('a8810000-0000-0000-0000-000000000016','a0000000-0000-0000-0000-000000000001','staff',null,null,'a8000000-0000-0000-0000-000000000001','horizon_days','55'),
 ('a8810000-0000-0000-0000-000000000017','a0000000-0000-0000-0000-000000000001','tenant',null,null,null,'daily_limit_per_staff','4'),
 ('a8810000-0000-0000-0000-000000000018','a0000000-0000-0000-0000-000000000001','location','a5000000-0000-0000-0000-000000000001',null,null,'daily_limit_per_staff','3'),
 ('a8810000-0000-0000-0000-000000000019','a0000000-0000-0000-0000-000000000001','service',null,'a7200000-0000-0000-0000-000000000001',null,'daily_limit_per_staff','2');
select is(private.resolve_availability_policy_v1('a0000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001',null,'buffer_before_minutes',0),4,'buffer-before uses subject precedence');
select is(private.resolve_availability_policy_v1('a0000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001',null,'buffer_after_minutes',0),8,'buffer-after uses subject precedence');
select is(private.resolve_availability_policy_v1('a0000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001',null,'minimum_notice_minutes',0),150,'notice uses subject precedence');
select is(private.resolve_availability_policy_v1('a0000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001',null,'horizon_days',1),55,'horizon uses subject precedence');
select is(private.resolve_availability_policy_v1('a0000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001',null,'daily_limit_per_staff',null),1,'daily limit uses subject precedence');

select ok(
  (select count(*) <= 500 from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.availability_time(0,'00:00'),pg_temp.availability_time(31,'00:00'),1,'America/New_York')),
  'a maximum-size request cannot return more than 500 rows'
);
select lives_ok(
  $$explain (analyze,buffers,format json) select * from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.availability_time(0,'00:00'),pg_temp.availability_time(31,'00:00'),1,'America/New_York')$$,
  'representative accepted-bound maximum-window plan completes within the RPC statement timeout'
);

select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select lives_ok(
  $$select * from api_v1.get_availability_v1('dashboard.tenant-a.example.invalid','dashboard','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.availability_time(0,'09:00'),pg_temp.availability_time(0,'18:00'),1,'America/New_York')$$,
  'a live tenant member receives the same Dashboard availability semantics'
);
select throws_ok(
  $$select * from api_v1.get_availability_v1('dashboard.tenant-b.example.invalid','dashboard','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.availability_time(0,'09:00'),pg_temp.availability_time(0,'18:00'),1,'America/New_York')$$,
  '42501','availability_context_required','Dashboard context requires a live membership in the resolved tenant'
);
reset role;

select * from finish();

rollback;
