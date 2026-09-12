begin;
select no_plan();

-- Issue #24. Operational reports. The properties that matter are not "a number
-- appears" but: the number comes from a committed ledger, its denominator is
-- the documented one, a day is a day in the tenant's timezone, money needs a
-- financial capability, and a report counts people without ever naming one.

select set_config('test.rp_day',
  (date_trunc('week',statement_timestamp() at time zone 'America/New_York')::date+49)::text,true);
create function pg_temp.rp_time(p_time time)
returns timestamptz language sql stable as $$
  select (current_setting('test.rp_day')::date+p_time) at time zone 'America/New_York';
$$;
do $$ begin
  execute format('grant usage on schema %I to authenticated',pg_my_temp_schema()::regnamespace::text);
end $$;

-- ---------------------------------------------------------------------------
-- Contract shape.
select has_table('app'::name,'report_exports'::name);
select ok((select relrowsecurity from pg_class where oid='app.report_exports'::regclass),
  'exports carry row level security like every other tenant-owned table');
select ok(not has_column_privilege('authenticated','app.report_exports','rows_payload','select'),
  'the resolved rows are unreadable through the table: one function is the only way to them');
select ok(has_column_privilege('authenticated','app.report_exports','status','select'),
  'while the rest of the row stays readable, so the exclusion is one column wide');

select has_function('api_v1'::name,'get_booking_report_v1'::name,
  array['uuid','date','date','text','uuid','uuid','uuid']);
select has_function('api_v1'::name,'get_utilization_report_v1'::name,
  array['uuid','date','date','text','uuid']);
select has_function('api_v1'::name,'get_revenue_report_v1'::name,array['uuid','date','date','text']);
select has_function('api_v1'::name,'get_customer_report_v1'::name,array['uuid','date','date','text']);
select has_function('api_v1'::name,'run_report_export_v1'::name,
  array['uuid','text','date','date','text','uuid']);

select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='api_v1' and p.prosecdef and p.proname in (
    'get_booking_report_v1','get_utilization_report_v1','run_report_export_v1',
    'get_report_export_v1','list_report_exports_v1')),
  'every exposed report wrapper is security invoker, so RLS is the scope');
select ok(
  not has_function_privilege('anon','api_v1.get_booking_report_v1(uuid,date,date,text,uuid,uuid,uuid)','execute')
  and not has_function_privilege('anon','api_v1.get_revenue_report_v1(uuid,date,date,text)','execute'),
  'no report is anonymous: a tenant''s numbers are never public');
select ok((select bool_and(p.provolatile='s') from pg_proc p
  where p.oid in ('api_v1.get_booking_report_v1(uuid,date,date,text,uuid,uuid,uuid)'::regprocedure,
    'api_v1.get_utilization_report_v1(uuid,date,date,text,uuid)'::regprocedure,
    'api_v1.get_revenue_report_v1(uuid,date,date,text)'::regprocedure)),
  'reading a report is stable: reporting can never become a way to act');

-- ---------------------------------------------------------------------------
-- The reporting window is a day in the tenant's timezone, not in UTC.
select is((select w.window_start from private.resolve_report_window_v1(
  '2026-03-08'::date,'2026-03-08'::date,'America/New_York') w),
  '2026-03-08 05:00:00+00'::timestamptz,
  'a report day starts at local midnight, even on the day the clocks move');
select is((select w.window_end from private.resolve_report_window_v1(
  '2026-03-08'::date,'2026-03-08'::date,'America/New_York') w),
  '2026-03-09 04:00:00+00'::timestamptz,
  'and ends at the next local midnight, which is 23 hours later that day');
select is((select extract(epoch from (w.window_end - w.window_start))/3600
  from private.resolve_report_window_v1('2026-11-01'::date,'2026-11-01'::date,'America/New_York') w),
  25::numeric,'a fall-back day is 25 hours, and the report says so rather than losing an hour');

-- ---------------------------------------------------------------------------
-- Fixtures: one staff member with a known schedule and a known set of outcomes.
insert into app.staff_profiles(id,tenant_id,public_name)
values ('a9000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Report staff');
insert into app.staff_services(tenant_id,staff_id,service_id)
values ('a0000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001');
insert into app.staff_locations(tenant_id,staff_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001');
insert into app.staff_service_locations(tenant_id,staff_id,service_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001');
insert into app.schedule_scopes(id,tenant_id,scope_kind,location_id,staff_id,time_zone)
values ('a9100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','staff','a5000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000001','America/New_York');
-- 09:00-17:00 on the report Monday: exactly 480 offered minutes.
insert into app.weekly_schedules(id,tenant_id,schedule_scope_id,day_of_week,start_minute,end_minute)
values ('a9200000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a9100000-0000-0000-0000-000000000001',1,540,1020);

select set_config('test.rp_from',current_setting('test.rp_day'),true);
select set_config('test.rp_to',current_setting('test.rp_day'),true);

-- ---------------------------------------------------------------------------
savepoint rp_offered;
select is((select o.offered_minutes from private.offered_minutes_v1(
  'a0000000-0000-0000-0000-000000000001',
  (current_setting('test.rp_from')::date::timestamp) at time zone 'America/New_York',
  ((current_setting('test.rp_to')::date+1)::timestamp) at time zone 'America/New_York') o
  where o.staff_id='a9000000-0000-0000-0000-000000000001'),
  480::bigint,'a nine-to-five day offers 480 minutes');

-- Time off comes out of the denominator, because nobody was offered that hour.
insert into app.time_off(id,tenant_id,staff_id,location_id,starts_at,ends_at,time_zone)
values ('a9300000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
  'a9000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',
  pg_temp.rp_time('12:00'),pg_temp.rp_time('13:00'),'America/New_York');
select is((select o.offered_minutes from private.offered_minutes_v1(
  'a0000000-0000-0000-0000-000000000001',
  (current_setting('test.rp_from')::date::timestamp) at time zone 'America/New_York',
  ((current_setting('test.rp_to')::date+1)::timestamp) at time zone 'America/New_York') o
  where o.staff_id='a9000000-0000-0000-0000-000000000001'),
  420::bigint,'an hour of time off is an hour that was never offered');
rollback to savepoint rp_offered;

-- ---------------------------------------------------------------------------
-- The denominator that the whole report hangs on.
savepoint rp_denominator;
-- Four bookings on the report day: one completed, one no-show, one cancelled,
-- one still confirmed.
-- Bookings need a hold: capacity is always claimed before it is booked, and the
-- schema says so. These stand in for holds a real journey would have created.
insert into app.booking_holds(
  id,tenant_id,service_id,location_id,publication_id,allocation_kind,starts_at,ends_at,
  state,expires_at,ttl_seconds,price_minor,tax_rate_bps,currency,session_hash,
  correlation_id,released_at)
select ('a9400000-0000-0000-0000-00000000000'||v.n::text)::uuid,
  'a0000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000001',
  'appointment',pg_temp.rp_time('09:00')+(v.n*interval '1 hour'),
  pg_temp.rp_time('10:00')+(v.n*interval '1 hour'),
  'released',pg_temp.rp_time('09:00')+(v.n*interval '1 hour'),900,18000,0,'SAR',
  repeat('a',64),gen_random_uuid(),statement_timestamp()
from (values (0),(1),(2),(3)) as v(n);

insert into app.bookings(
  id,tenant_id,public_reference,service_id,location_id,hold_id,publication_id,
  status,payment_status,notification_status,calendar_status,approval_status,
  starts_at,ends_at,party_size,duration_minutes,buffer_before_minutes,buffer_after_minutes,
  price_minor,tax_rate_bps,currency,policy_snapshot,consent_text,consent_version,consented_at,
  intake_schema_snapshot,service_name,location_name,locale,location_time_zone,
  customer_time_zone,correlation_id,created_at,cancelled_at)
select gen_random_uuid(),'a0000000-0000-0000-0000-000000000001',
  upper(substr(md5(v.status||v.n::text),1,10)),
  'a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',
  ('a9400000-0000-0000-0000-00000000000'||v.n::text)::uuid,
  'a7000000-0000-0000-0000-000000000001',
  v.status,'not_required','queued','pending','not_required',
  pg_temp.rp_time('09:00')+(v.n*interval '1 hour'),
  pg_temp.rp_time('10:00')+(v.n*interval '1 hour'),
  1,60,0,0,18000,0,'SAR','{}'::jsonb,'Terms.','1',statement_timestamp(),
  '{"fields":[]}'::jsonb,'Initial consultation','Downtown','en','America/New_York',
  'America/New_York',gen_random_uuid(),
  pg_temp.rp_time('09:00')+(v.n*interval '1 hour')-interval '3 days',
  -- A cancelled booking has to say when, which is what makes the cancellation
  -- a fact rather than a flag.
  case when v.status='cancelled' then statement_timestamp() end
from (values ('completed',0),('no_show',1),('cancelled',2),('confirmed',3))
  as v(status,n);
update app.bookings set public_reference=upper(translate(public_reference,'ILOU0189','ABCDEFGH'))
where tenant_id='a0000000-0000-0000-0000-000000000001'
  and public_reference !~ '^[0-9A-HJ-NP-Z]{10}$';

select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;

select is((select r.outcome_denominator from api_v1.get_booking_report_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.rp_from')::date,
  current_setting('test.rp_to')::date,'America/New_York') r),3::bigint,
  'the outcome denominator excludes the cancellation: three outcomes, not four');
select is((select r.bookings_cancelled from api_v1.get_booking_report_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.rp_from')::date,
  current_setting('test.rp_to')::date,'America/New_York') r),1::bigint,
  'the cancellation is still counted, just not against arrival');
select is((select r.no_show_rate_bps from api_v1.get_booking_report_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.rp_from')::date,
  current_setting('test.rp_to')::date,'America/New_York') r),3333,
  'one no-show in three outcomes is 33.33 percent, not 25: a generous cancellation '
  'policy must not make a tenant look unreliable');
select is((select r.completion_rate_bps from api_v1.get_booking_report_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.rp_from')::date,
  current_setting('test.rp_to')::date,'America/New_York') r),3333,
  'and the completion rate uses the same denominator');
select is((select r.report_definition_version from api_v1.get_booking_report_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.rp_from')::date,
  current_setting('test.rp_to')::date,'America/New_York') r),1,
  'every report states the definition version it was computed under');
select ok((select r.average_lead_time_minutes > 0 from api_v1.get_booking_report_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.rp_from')::date,
  current_setting('test.rp_to')::date,'America/New_York') r),
  'lead time is measured from creation to the appointment');

-- A day with nothing in it reports zeroes, never a division error.
select is((select r.no_show_rate_bps from api_v1.get_booking_report_v1(
  'a0000000-0000-0000-0000-000000000001','2020-01-01'::date,'2020-01-01'::date,'UTC') r),0,
  'an empty window reports zero rather than failing');
select is((select r.outcome_denominator from api_v1.get_booking_report_v1(
  'a0000000-0000-0000-0000-000000000001','2020-01-01'::date,'2020-01-01'::date,'UTC') r),0::bigint,
  'and says its denominator was zero, so nobody reads the zero as a good result');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint rp_denominator;

-- ---------------------------------------------------------------------------
-- Money is a separate entitlement from operations.
savepoint rp_money;
-- A scheduler runs the day and holds no financial capability.
select set_config('request.jwt.claims','{"sub":"c1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select lives_ok(
  format($$select * from api_v1.get_booking_report_v1('a0000000-0000-0000-0000-000000000001',
    %L::date,%L::date,'America/New_York')$$,
    current_setting('test.rp_from'),current_setting('test.rp_to')),
  'a scheduler can read the operational report');
select throws_ok(
  format($$select * from api_v1.get_revenue_report_v1('a0000000-0000-0000-0000-000000000001',
    %L::date,%L::date)$$,current_setting('test.rp_from'),current_setting('test.rp_to')),
  '42501','policy_denied',
  'and cannot read revenue: running the day is not the same entitlement as seeing the money');
select throws_ok(
  format($$select * from api_v1.run_report_export_v1('a0000000-0000-0000-0000-000000000001',
    'revenue',%L::date,%L::date)$$,current_setting('test.rp_from'),current_setting('test.rp_to')),
  '42501','policy_denied','nor export it, because an export is not a way around a capability');
reset role;
select set_config('request.jwt.claims',null,true);

select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select lives_ok(
  format($$select * from api_v1.get_revenue_report_v1('a0000000-0000-0000-0000-000000000001',
    %L::date,%L::date)$$,current_setting('test.rp_from'),current_setting('test.rp_to')),
  'an admin holding billing.view can');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint rp_money;

-- ---------------------------------------------------------------------------
-- Reports count people and never name one.
savepoint rp_customers;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select ok((select count(*)::integer from api_v1.get_customer_report_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.rp_from')::date,
  current_setting('test.rp_to')::date)) = 1,
  'the customer report returns one aggregate row');
reset role;
select set_config('request.jwt.claims',null,true);

-- The shape itself is the guarantee: there is no column a name could arrive in.
select ok(
  pg_get_function_result('api_v1.get_customer_report_v1(uuid,date,date,text)'::regprocedure)
    !~* '(email|full_name|phone|customer_id|hash)',
  'and its declared shape contains no identifying column at all');
select ok(
  pg_get_function_result('api_v1.get_booking_report_v1(uuid,date,date,text,uuid,uuid,uuid)'::regprocedure)
    !~* '(email|full_name|phone|public_reference)',
  'the booking report is counts and rates, never a list of people or references');
select ok(
  pg_get_function_result('api_v1.get_revenue_report_v1(uuid,date,date,text)'::regprocedure)
    !~* '(email|full_name|phone|customer)',
  'and the revenue report names no customer either');

rollback to savepoint rp_customers;

-- ---------------------------------------------------------------------------
-- Exports: snapshotted, expiring, and reachable only through one function.
savepoint rp_export;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;

select set_config('test.rp_export',(select e.export_id::text from api_v1.run_report_export_v1(
  'a0000000-0000-0000-0000-000000000001','bookings',current_setting('test.rp_from')::date,
  current_setting('test.rp_to')::date,'America/New_York') e),true);
select is((select e.status from app.report_exports e
  where e.id=current_setting('test.rp_export')::uuid),'completed','an export runs to completion');
select throws_ok(
  format($$select rows_payload from app.report_exports where id=%L$$,
    current_setting('test.rp_export')),
  '42501',null,
  'and the snapshotted rows are unreadable through the table, even to the '
  'member who queued the export');
select ok((select g.rows_payload is not null from api_v1.get_report_export_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.rp_export')::uuid) g),
  'the rows come back through the function that re-checks capability');
select is((select g.parameters->>'time_zone' from api_v1.get_report_export_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.rp_export')::uuid) g),
  'America/New_York',
  'and the filters travel with it, so a file can always be explained');
select throws_ok(
  format($$select * from api_v1.run_report_export_v1('a0000000-0000-0000-0000-000000000001',
    'everything',%L::date,%L::date)$$,
    current_setting('test.rp_from'),current_setting('test.rp_to')),
  '22023','report_unknown','an unknown report is refused rather than guessed');
reset role;
select set_config('request.jwt.claims',null,true);

update app.report_exports set expires_at=statement_timestamp()-interval '1 day'
where id=current_setting('test.rp_export')::uuid;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select g.rows_payload from api_v1.get_report_export_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.rp_export')::uuid) g),null,
  'an expired export is the same as an absent one: a stale snapshot is how two '
  'people end up quoting different numbers for the same week');
select is((select g.status from api_v1.get_report_export_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.rp_export')::uuid) g),
  'completed','while the record of it having run stays readable');
reset role;
select set_config('request.jwt.claims',null,true);

-- A revenue export is unreadable without the financial capability, even to
-- somebody who could otherwise list it.
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select set_config('test.rp_money_export',(select e.export_id::text from api_v1.run_report_export_v1(
  'a0000000-0000-0000-0000-000000000001','revenue',current_setting('test.rp_from')::date,
  current_setting('test.rp_to')::date) e),true);
reset role;
select set_config('request.jwt.claims',null,true);
select set_config('request.jwt.claims','{"sub":"c1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select g.rows_payload from api_v1.get_report_export_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.rp_money_export')::uuid) g),null,
  'a scheduler cannot read a revenue export somebody else queued');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint rp_export;

-- ---------------------------------------------------------------------------
-- Cross-tenant and unscoped readers see nothing.
savepoint rp_isolation;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select r.bookings_created from api_v1.get_booking_report_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.rp_from')::date,
  current_setting('test.rp_to')::date,'America/New_York') r),0::bigint,
  'another tenant''s report over this tenant''s id counts nothing');
select throws_ok(
  format($$select * from api_v1.get_revenue_report_v1('a0000000-0000-0000-0000-000000000001',
    %L::date,%L::date)$$,current_setting('test.rp_from'),current_setting('test.rp_to')),
  '42501','policy_denied','and cannot reach the money at all');
select is((select count(*)::integer from api_v1.list_report_exports_v1(
  'a0000000-0000-0000-0000-000000000001')),0,
  'nor learn that any export was ever run');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint rp_isolation;

-- The savepoint rollbacks above revert pgTAP's own counter, so it is restored
-- from the non-transactional sequence before the plan is emitted.
select _set('curr_test',(select last_value::integer from __tresults___numb_seq));
select * from finish();
rollback;
