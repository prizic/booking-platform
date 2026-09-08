begin;
select no_plan();

-- Issue #15. Reschedule and cancel from both entry points: revision locking,
-- snapshotted policy, capacity that survives every failed move, refund
-- eligibility recorded apart from booking state, and revision-keyed intents.

select set_config('test.rc_day',
  (date_trunc('week',statement_timestamp() at time zone 'America/New_York')::date+14)::text,true);
create function pg_temp.rc_time(p_time time)
returns timestamptz language sql stable as $$
  select (current_setting('test.rc_day')::date+p_time) at time zone 'America/New_York';
$$;
do $$ begin
  execute format('grant usage on schema %I to authenticated',pg_my_temp_schema()::regnamespace::text);
end $$;

select has_column('app'::name,'bookings'::name,'reschedule_count'::name,'the customer allowance is counted on the booking');
select has_column('app'::name,'bookings'::name,'refund_eligible_minor'::name,'refund eligibility is recorded apart from booking state');
select has_column('app'::name,'outbox_events'::name,'booking_revision'::name,'an intent records the revision it describes');
select has_function('api_v1'::name,'cancel_booking_v1'::name,array['uuid','uuid','bigint','text','text','uuid']);
select has_function('api_v1'::name,'reschedule_booking_v1'::name,array['uuid','uuid','bigint','timestamp with time zone','text','uuid']);
select has_function('api_v1'::name,'act_on_management_link_v1'::name,
  array['text','text','text','text','bigint','timestamp with time zone','text']);
select ok(not has_function_privilege('anon','api_v1.cancel_booking_v1(uuid,uuid,bigint,text,text,uuid)','execute')
  and not has_function_privilege('anon','api_v1.reschedule_booking_v1(uuid,uuid,bigint,timestamptz,text,uuid)','execute'),
  'the staff entry points are never anonymous');
select ok(has_function_privilege('anon','api_v1.act_on_management_link_v1(text,text,text,text,bigint,timestamptz,text)','execute'),
  'the customer entry point is the management link');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='api_v1' and p.prosecdef
    and p.proname in ('cancel_booking_v1','reschedule_booking_v1','act_on_management_link_v1')),
  'every exposed wrapper is security invoker');

-- Refund tiers come from the snapshot and are pure arithmetic on it.
select is(private.resolve_refund_percent_bps_v1('{}'::jsonb,
  statement_timestamp()+interval '48 hours',statement_timestamp()),10000,
  'a cancellation well before the first tier boundary refunds in full');
select is(private.resolve_refund_percent_bps_v1('{}'::jsonb,
  statement_timestamp()+interval '6 hours',statement_timestamp()),5000,
  'the middle tier refunds half');
select is(private.resolve_refund_percent_bps_v1('{}'::jsonb,
  statement_timestamp()+interval '1 hour',statement_timestamp()),0,
  'inside the last tier nothing is refundable');
select is(private.resolve_refund_percent_bps_v1(
  '{"refund_schedule":[{"minutes_before":60,"percent_bps":2500}]}'::jsonb,
  statement_timestamp()+interval '2 hours',statement_timestamp()),2500,
  'a tenant schedule snapshotted on the booking is what is applied');

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
  'a5000000-0000-0000-0000-000000000001',pg_temp.rc_time('10:00'),
  'session-token-aaaa-0001','idempotency-key-aaaa-0001') h),true);
select set_config('test.booking',(select b.booking_id::text from api_v1.confirm_booking_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.hold')::uuid,
  'session-token-aaaa-0001','confirm-key-aaaa-0001',
  '{"fullName":"Guest A","email":"guest@example.invalid"}'::jsonb,
  '1','en','{}'::jsonb,'Asia/Riyadh') b),true);

-- Staff reschedule.
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok(
  format($$select * from api_v1.reschedule_booking_v1('a0000000-0000-0000-0000-000000000001',%L,9,%L)$$,
    current_setting('test.booking'),pg_temp.rc_time('11:00')),
  '23505','revision_conflict','a stale revision cannot move a booking');
select throws_ok(
  format($$select * from api_v1.reschedule_booking_v1('a0000000-0000-0000-0000-000000000001',%L,1,%L)$$,
    current_setting('test.booking'),pg_temp.rc_time('10:07')),
  '23P01','slot_unavailable','a time availability never offered is refused');
select throws_ok(
  format($$select * from api_v1.reschedule_booking_v1('a0000000-0000-0000-0000-000000000001',%L,1,%L)$$,
    current_setting('test.booking'),pg_temp.rc_time('20:00')),
  '23P01','slot_unavailable','a time outside the working schedule is refused');
select is((select array[b.starts_at::text,b.revision::text] from app.bookings b
  where b.id=current_setting('test.booking')::uuid),
  array[pg_temp.rc_time('10:00')::text,'1'],
  'every refused move leaves the original booking exactly as it was');
select is((select count(*)::integer from app.assignment_allocations a
  where a.tenant_id='a0000000-0000-0000-0000-000000000001' and a.state='confirmed'),1,
  'a refused move leaves no orphaned allocation behind');
select is((select array[r.status,r.booking_revision::text,(r.starts_at=pg_temp.rc_time('13:00'))::text,
    r.reschedule_count::text]
  from api_v1.reschedule_booking_v1('a0000000-0000-0000-0000-000000000001',
    current_setting('test.booking')::uuid,1,pg_temp.rc_time('13:00')) r),
  array['confirmed','2','true','0'],
  'a staff move succeeds, increments the revision, and spends no customer allowance');
reset role;
select set_config('request.jwt.claims',null,true);

select is((select array[(b.starts_at=pg_temp.rc_time('13:00'))::text,b.revision::text,b.status]
  from app.bookings b where b.id=current_setting('test.booking')::uuid),
  array['true','2','confirmed'],
  'rescheduling is a new revision of the same booking, not a terminal status');
select is((select array[b.price_minor::text,b.consent_version,b.service_name] from app.bookings b
  where b.id=current_setting('test.booking')::uuid),
  array['18000','1','Initial consultation'],
  'the move rewrites no snapshotted price, policy, or consent');
select is((select count(*)::integer from app.assignment_allocations a
  where a.tenant_id='a0000000-0000-0000-0000-000000000001' and a.state='confirmed'
    and a.starts_at=pg_temp.rc_time('13:00')),1,
  'the new capacity is held by exactly one confirmed allocation');
select is((select count(*)::integer from app.assignment_allocations a
  where a.tenant_id='a0000000-0000-0000-0000-000000000001' and a.state='confirmed'
    and a.starts_at=pg_temp.rc_time('10:00')),0,
  'the old capacity is released only after the new one is secured');
select is((select array[(e.metadata->>'previous_starts_at')::timestamptz::text,
    (e.metadata->>'starts_at')::timestamptz::text,e.metadata->>'customer_time_zone',
    e.metadata->>'price_minor']
  from app.booking_events e where e.booking_id=current_setting('test.booking')::uuid
    and e.event_type='booking_rescheduled'),
  array[pg_temp.rc_time('10:00')::text,pg_temp.rc_time('13:00')::text,'Asia/Riyadh','18000'],
  'history keeps both times, the timezone they are read in, and the price snapshot');
select is((select o.booking_revision from app.outbox_events o
  where o.booking_id=current_setting('test.booking')::uuid and o.topic='booking.rescheduled'),
  2::bigint,'the delivery intent is keyed to the revision it describes');

-- Two competing moves: the second reads a superseded revision and loses.
savepoint rc_race;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok(
  format($$select * from api_v1.reschedule_booking_v1('a0000000-0000-0000-0000-000000000001',%L,1,%L)$$,
    current_setting('test.booking'),pg_temp.rc_time('14:00')),
  '23505','revision_conflict','a second move from the pre-move revision is refused');
reset role;
select set_config('request.jwt.claims',null,true);
select is((select (b.starts_at=pg_temp.rc_time('13:00'))::text from app.bookings b
  where b.id=current_setting('test.booking')::uuid),'true',
  'the winning move survives the losing one');
rollback to savepoint rc_race;

-- Customer policy: cutoff, allowance, and self-service are all snapshotted.
savepoint rc_customer_policy;
-- The snapshot itself is immutable, so a booking under a different policy is
-- made by publishing that policy and booking again.
update app.catalog_service_revisions
set policy=jsonb_build_object('consent_version','1','consent_text','Terms.',
  'reschedule_customer_self_service',false)
where tenant_id='a0000000-0000-0000-0000-000000000001' and service_id='a7200000-0000-0000-0000-000000000001';
select set_config('test.hold_two',(select h.hold_id::text from api_v1.create_hold_v1(
  'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.rc_time('15:00'),
  'session-token-bbbb-0001','idempotency-key-bbbb-0001') h),true);
select set_config('test.booking_two',(select b.booking_id::text from api_v1.confirm_booking_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.hold_two')::uuid,
  'session-token-bbbb-0001','confirm-key-bbbb-0001',
  '{"fullName":"Guest B","email":"guest.b@example.invalid"}'::jsonb,
  '1','en','{}'::jsonb,'Asia/Riyadh') b),true);
select throws_ok(
  format($$select * from private.reschedule_booking_v1('a0000000-0000-0000-0000-000000000001',%L,1,%L,'guest')$$,
    current_setting('test.booking_two'),pg_temp.rc_time('16:00')),
  '42501','policy_denied','a tenant that disables customer moves is honoured');
rollback to savepoint rc_customer_policy;

savepoint rc_allowance;
update app.bookings set reschedule_count=2 where id=current_setting('test.booking')::uuid;
select throws_ok(
  format($$select * from private.reschedule_booking_v1('a0000000-0000-0000-0000-000000000001',%L,2,%L,'guest')$$,
    current_setting('test.booking'),pg_temp.rc_time('14:00')),
  '42501','policy_denied','an exhausted customer allowance stops a customer move');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select array[r.status,r.reschedule_count::text] from api_v1.reschedule_booking_v1(
    'a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid,2,
    pg_temp.rc_time('14:00')) r),
  array['confirmed','2'],'the same exhausted allowance never blocks staff');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint rc_allowance;

-- Cancellation.
savepoint rc_cancel;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select array[c.status,c.refund_percent_bps::text,c.refund_eligible_minor::text,
    c.booking_revision::text]
  from api_v1.cancel_booking_v1('a0000000-0000-0000-0000-000000000001',
    current_setting('test.booking')::uuid,2,'Closed that day','Team offsite') c),
  array['cancelled','10000','18000','3'],
  'cancellation records the refund the snapshot allows, separately from the booking state');
select throws_ok(
  format($$select * from api_v1.cancel_booking_v1('a0000000-0000-0000-0000-000000000001',%L,3)$$,
    current_setting('test.booking')),
  '23505','revision_conflict','a settled booking cannot be cancelled twice');
reset role;
select set_config('request.jwt.claims',null,true);
select is((select array[b.status,(b.cancelled_at is not null)::text,b.cancellation_actor_kind,
    b.decision_reason_public]
  from app.bookings b where b.id=current_setting('test.booking')::uuid),
  array['cancelled','true','member','Closed that day'],
  'the cancellation is stamped with who did it and what the customer is told');
select is((select e.reason from app.booking_events e
  where e.booking_id=current_setting('test.booking')::uuid and e.event_type='booking_cancelled'),
  'Team offsite','the internal reason stays in history and never becomes customer text');
select is((select count(*)::integer from app.assignment_allocations a
  where a.tenant_id='a0000000-0000-0000-0000-000000000001' and a.state='confirmed'),0,
  'cancellation releases the capacity exactly once');
select is(
  (select count(*)::integer from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.rc_time('09:00'),pg_temp.rc_time('18:00'),1,'America/New_York') where result_kind='slot'),
  30,'the released time is publicly bookable again');
select is((select o.booking_revision from app.outbox_events o
  where o.booking_id=current_setting('test.booking')::uuid and o.topic='booking.cancelled'),
  3::bigint,'the cancellation intent is keyed to its own revision');
select is((select count(*)::integer from app.outbox_events o
  where o.booking_id=current_setting('test.booking')::uuid),3,
  'a move and a cancellation are separate intents, and neither overwrote the other');
rollback to savepoint rc_cancel;

savepoint rc_cancel_cutoff;
update app.catalog_service_revisions
set policy=jsonb_build_object('consent_version','1','consent_text','Terms.',
  'cancellation_cutoff_minutes',20160)
where tenant_id='a0000000-0000-0000-0000-000000000001' and service_id='a7200000-0000-0000-0000-000000000001';
select set_config('test.hold_three',(select h.hold_id::text from api_v1.create_hold_v1(
  'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.rc_time('15:00'),
  'session-token-cccc-0001','idempotency-key-cccc-0001') h),true);
select set_config('test.booking_three',(select b.booking_id::text from api_v1.confirm_booking_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.hold_three')::uuid,
  'session-token-cccc-0001','confirm-key-cccc-0001',
  '{"fullName":"Guest C","email":"guest.c@example.invalid"}'::jsonb,
  '1','en','{}'::jsonb,'Asia/Riyadh') b),true);
select throws_ok(
  format($$select * from private.cancel_booking_v1('a0000000-0000-0000-0000-000000000001',%L,1,'guest')$$,
    current_setting('test.booking_three')),
  '42501','policy_denied','a customer inside the snapshotted cutoff cannot cancel');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select array[c.status] from api_v1.cancel_booking_v1(
    'a0000000-0000-0000-0000-000000000001',current_setting('test.booking_three')::uuid,1) c),
  array['cancelled'],'staff may cancel at any time');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint rc_cancel_cutoff;

savepoint rc_cancel_retry;
select is((select array[c.replayed::text,c.status] from private.cancel_booking_v1(
    'a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid,2,'system',
    null,null,null,'cancel-key-aaaa-0001') c),
  array['false','cancelled'],'a keyed cancellation settles the booking');
select is((select array[c.replayed::text,c.status] from private.cancel_booking_v1(
    'a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid,2,'system',
    null,null,null,'cancel-key-aaaa-0001') c),
  array['true','cancelled'],'retrying the same cancellation returns the established result');
select is((select count(*)::integer from app.booking_events e
  where e.booking_id=current_setting('test.booking')::uuid and e.event_type='booking_cancelled'),1,
  'the retry recorded no second cancellation');
rollback to savepoint rc_cancel_retry;

-- Authority, in both directions.
savepoint rc_authority;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok(
  format($$select * from api_v1.cancel_booking_v1('a0000000-0000-0000-0000-000000000001',%L,2)$$,
    current_setting('test.booking')),
  '42501','policy_denied','a member without the cancel capability is refused');
reset role;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok(
  format($$select * from api_v1.reschedule_booking_v1('a0000000-0000-0000-0000-000000000001',%L,2,%L)$$,
    current_setting('test.booking'),pg_temp.rc_time('14:00')),
  '42501','policy_denied','another tenant cannot move this tenant booking');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint rc_authority;

-- The customer entry point: the link decides which booking, its intent decides
-- which action, and step-up is required before either runs.
savepoint rc_link;
select set_config('test.token',(select i.token from private.issue_management_token_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid,'cancel') i),true);
select is((select a.outcome from api_v1.act_on_management_link_v1('client.tenant-a.example.invalid',
    'client',current_setting('test.token'),'cancel',2) a),'unavailable',
  'a link without a verified step-up cannot act');
select is((select a.outcome from api_v1.act_on_management_link_v1('client.tenant-a.example.invalid',
    'client',current_setting('test.token'),'reschedule',2,pg_temp.rc_time('14:00')) a),'unavailable',
  'a cancel link can never be replayed as a reschedule');
select is((select o.outcome from api_v1.request_management_otp_v1('client.tenant-a.example.invalid',
  'client',current_setting('test.token')) o),'sent','the link requests its step-up code');
select set_config('test.code',(select m.code from private.mint_management_otp_code_v1(
  (select o.id from app.management_otps o where o.verified_at is null)) m),true);
select is((select v.verified from api_v1.verify_management_otp_v1('client.tenant-a.example.invalid',
  'client',current_setting('test.token'),current_setting('test.code')) v),true,'the code verifies');
select is((select array[a.outcome,a.status,a.refund_percent_bps::text]
  from api_v1.act_on_management_link_v1('client.tenant-a.example.invalid','client',
    current_setting('test.token'),'cancel',2) a),
  array['applied','cancelled','10000'],
  'the customer cancels through the same database-authoritative transition staff use');
select is((select b.cancellation_actor_kind from app.bookings b
  where b.id=current_setting('test.booking')::uuid),'guest',
  'the cancellation records the customer as its actor');
select is((select a.outcome from api_v1.act_on_management_link_v1('client.tenant-a.example.invalid',
    'client',current_setting('test.token'),'cancel',3) a),'unavailable',
  'the action link is consumed, so a replay changes nothing');
rollback to savepoint rc_link;

select _set('curr_test',(select last_value::integer from __tresults___numb_seq));
select * from finish();

rollback;
