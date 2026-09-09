begin;
select no_plan();

-- Issue #16. The Today queues and the calendar are scoped reads: a member sees
-- exactly its own tenant, its permitted locations, and only the customer fields
-- its role already grants. Neither read can act.

select set_config('test.w_day',
  (date_trunc('week',statement_timestamp() at time zone 'America/New_York')::date+14)::text,true);
create function pg_temp.w_time(p_time time)
returns timestamptz language sql stable as $$
  select (current_setting('test.w_day')::date+p_time) at time zone 'America/New_York';
$$;
do $$ begin
  execute format('grant usage on schema %I to authenticated',pg_my_temp_schema()::regnamespace::text);
end $$;

select has_function('api_v1'::name,'get_today_workspace_v1'::name,
  array['uuid','timestamp with time zone','timestamp with time zone']);
select has_function('api_v1'::name,'list_calendar_v1'::name,
  array['uuid','timestamp with time zone','timestamp with time zone','uuid','uuid','uuid']);
select ok(not has_function_privilege('anon','api_v1.get_today_workspace_v1(uuid,timestamptz,timestamptz)','execute')
  and not has_function_privilege('anon','api_v1.list_calendar_v1(uuid,timestamptz,timestamptz,uuid,uuid,uuid)','execute'),
  'the workspace is never anonymous');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='api_v1' and p.prosecdef
    and p.proname in ('get_today_workspace_v1','list_calendar_v1')),
  'both workspace reads are security invoker, so RLS decides what they return');
select ok((select p.provolatile='s' from pg_proc p
  where p.oid='api_v1.get_today_workspace_v1(uuid,timestamptz,timestamptz)'::regprocedure),
  'the Today read is stable: it cannot write, so it can never become a second way to act');
select ok((select p.provolatile='s' from pg_proc p
  where p.oid='api_v1.list_calendar_v1(uuid,timestamptz,timestamptz,uuid,uuid,uuid)'::regprocedure),
  'the calendar read is stable for the same reason');

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
update app.catalog_service_revisions
set policy=jsonb_build_object('consent_version','1','consent_text','Terms.')
where tenant_id='a0000000-0000-0000-0000-000000000001' and service_id='a7200000-0000-0000-0000-000000000001';

select set_config('test.hold',(select h.hold_id::text from api_v1.create_hold_v1(
  'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.w_time('10:00'),
  'session-token-aaaa-0001','idempotency-key-aaaa-0001') h),true);
select set_config('test.booking',(select b.booking_id::text from api_v1.confirm_booking_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.hold')::uuid,
  'session-token-aaaa-0001','confirm-key-aaaa-0001',
  '{"fullName":"Guest A","email":"guest@example.invalid"}'::jsonb,
  '1','en','{}'::jsonb,'Asia/Riyadh') b),true);
select set_config('test.hold_two',(select h.hold_id::text from api_v1.create_hold_v1(
  'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.w_time('14:00'),
  'session-token-bbbb-0001','idempotency-key-bbbb-0001') h),true);
select set_config('test.booking_two',(select b.booking_id::text from api_v1.confirm_booking_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.hold_two')::uuid,
  'session-token-bbbb-0001','confirm-key-bbbb-0001',
  '{"fullName":"Guest B","email":"guest.b@example.invalid"}'::jsonb,
  '1','en','{}'::jsonb,'Asia/Riyadh') b),true);
-- One booking whose email bounced, so the exceptions queue has work.
update app.bookings set notification_status='bounced'
where id=current_setting('test.booking_two')::uuid;

savepoint workspace_admin;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select array_agg(t.queue order by t.queue) from api_v1.get_today_workspace_v1(
    'a0000000-0000-0000-0000-000000000001',pg_temp.w_time('00:00'),pg_temp.w_time('23:59')) t),
  array['arrivals','exceptions'],
  'a booking arriving today and one whose email bounced land in different queues');
select is((select t.queue from api_v1.get_today_workspace_v1(
    'a0000000-0000-0000-0000-000000000001',pg_temp.w_time('00:00'),pg_temp.w_time('23:59')) t
  limit 1),'exceptions',
  'the queue that needs attention first is returned first');
select is((select array[t.customer_display_name,t.has_intake::text,(t.staff_id is not null)::text]
  from api_v1.get_today_workspace_v1('a0000000-0000-0000-0000-000000000001',
    pg_temp.w_time('00:00'),pg_temp.w_time('23:59')) t
  where t.queue='arrivals' limit 1),
  array['Guest A','false','true'],
  'a member with the personal-data capability sees the customer and the assignment');
select ok(not exists(select 1 from jsonb_object_keys(to_jsonb((
    select x from api_v1.get_today_workspace_v1('a0000000-0000-0000-0000-000000000001',
      pg_temp.w_time('00:00'),pg_temp.w_time('23:59')) x limit 1))) key
  where key in ('email','phone','answers','intake_schema_snapshot','policy_snapshot')),
  'the queue DTO carries no contact detail, intake answer, or policy blob');
select is((select count(*)::integer from api_v1.list_calendar_v1(
  'a0000000-0000-0000-0000-000000000001',pg_temp.w_time('00:00'),pg_temp.w_time('23:59'))),2,
  'the calendar reads the same day');
select is((select count(*)::integer from api_v1.list_calendar_v1(
  'a0000000-0000-0000-0000-000000000001',pg_temp.w_time('00:00'),pg_temp.w_time('23:59'),
  null,'a8000000-0000-0000-0000-000000000001')),2,
  'the staff filter selects that staff member''s work');
select is((select count(*)::integer from api_v1.list_calendar_v1(
  'a0000000-0000-0000-0000-000000000001',pg_temp.w_time('00:00'),pg_temp.w_time('23:59'),
  null,'a8000000-0000-0000-0000-000000000009')),0,
  'a filter for someone with no work returns nothing rather than everything');
select is((select count(*)::integer from api_v1.list_calendar_v1(
  'a0000000-0000-0000-0000-000000000001',pg_temp.w_time('00:00'),pg_temp.w_time('23:59'),
  'a5000000-0000-0000-0000-000000000002')),0,
  'the location filter excludes another location''s work');
select is((select count(*)::integer from api_v1.list_calendar_v1(
  'a0000000-0000-0000-0000-000000000001',pg_temp.w_time('11:00'),pg_temp.w_time('12:00'))),0,
  'a window with no bookings is empty rather than approximate');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint workspace_admin;

savepoint workspace_scope;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select count(*)::integer from api_v1.get_today_workspace_v1(
    'a0000000-0000-0000-0000-000000000001',pg_temp.w_time('00:00'),pg_temp.w_time('23:59')) t
  where t.customer_display_name is not null),0,
  'a member without the personal-data capability sees no customer name');
select ok((select count(*) from api_v1.get_today_workspace_v1(
  'a0000000-0000-0000-0000-000000000001',pg_temp.w_time('00:00'),pg_temp.w_time('23:59')))>0,
  'that member still sees the work itself');
reset role;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select count(*)::integer from api_v1.get_today_workspace_v1(
  'a0000000-0000-0000-0000-000000000001',pg_temp.w_time('00:00'),pg_temp.w_time('23:59'))),0,
  'another tenant sees no queue at all');
select is((select count(*)::integer from api_v1.list_calendar_v1(
  'a0000000-0000-0000-0000-000000000001',pg_temp.w_time('00:00'),pg_temp.w_time('23:59'))),0,
  'another tenant sees no calendar at all');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint workspace_scope;

-- A request and a cancellation are separate queues, and a cancelled booking
-- leaves the calendar without leaving history.
savepoint workspace_states;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select ok((select c.status from api_v1.cancel_booking_v1(
    'a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid,1,
    'Closed that day','Team offsite') c)='cancelled',
  'the fixture cancels through the same RPC the Dashboard calls');
select is((select array_agg(t.queue order by t.queue) from api_v1.get_today_workspace_v1(
    'a0000000-0000-0000-0000-000000000001',pg_temp.w_time('00:00'),pg_temp.w_time('23:59')) t),
  array['cancellations','exceptions'],
  'a cancellation moves out of arrivals and into its own queue');
select is((select count(*)::integer from api_v1.list_calendar_v1(
  'a0000000-0000-0000-0000-000000000001',pg_temp.w_time('00:00'),pg_temp.w_time('23:59'))),1,
  'a cancelled booking no longer occupies the calendar');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint workspace_states;

select _set('curr_test',(select last_value::integer from __tresults___numb_seq));
select * from finish();

rollback;
