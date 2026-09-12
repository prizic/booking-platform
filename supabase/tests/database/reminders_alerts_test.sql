begin;
select no_plan();

-- Issue #20. Reminders, staff alerts, and Auth mail identity. The properties
-- that matter: a reminder for a time that changed is superseded rather than
-- sent, alerts reach the people a capability says they should, and an Auth
-- message wears a tenant's brand only when that tenant is provable.

select set_config('test.rm_day',
  (date_trunc('week',statement_timestamp() at time zone 'America/New_York')::date+56)::text,true);
create function pg_temp.rm_time(p_time time)
returns timestamptz language sql stable as $$
  select (current_setting('test.rm_day')::date+p_time) at time zone 'America/New_York';
$$;
do $$ begin
  execute format('grant usage on schema %I to authenticated',pg_my_temp_schema()::regnamespace::text);
end $$;

-- ---------------------------------------------------------------------------
-- Contract shape.
select has_function('api_v1'::name,'get_delivery_health_v1'::name,array['uuid']);
select has_function('api_v1'::name,'schedule_booking_reminders_v1'::name,
  array['uuid','integer']);
select has_function('api_v1'::name,'resolve_auth_mail_context_v1'::name,array['text']);

select ok(has_function_privilege('authenticated','api_v1.get_delivery_health_v1(uuid)','execute')
  and not has_function_privilege('anon','api_v1.get_delivery_health_v1(uuid)','execute'),
  'delivery health is a scoped member read, never anonymous');
-- The important one. This function answers "which tenant owns this address",
-- truthfully and by design, so no session may ever ask it.
select ok(
  not has_function_privilege('anon','api_v1.resolve_auth_mail_context_v1(text)','execute')
  and not has_function_privilege('authenticated','api_v1.resolve_auth_mail_context_v1(text)','execute'),
  'Auth-mail identity is not reachable from a session: it would be an address '
  'enumeration oracle');
select ok(
  not has_function_privilege('anon','api_v1.schedule_booking_reminders_v1(uuid,integer)','execute')
  and not has_function_privilege('authenticated','api_v1.schedule_booking_reminders_v1(uuid,integer)','execute'),
  'and scheduling is worker work, not something a session triggers');

-- Reminder lead time comes from the snapshotted policy and is clamped, so no
-- tenant edit can schedule a reminder a year out or one second before.
select is(private.resolve_reminder_lead_minutes_v1('{}'::jsonb),1440,
  'the default reminder is a day before');
select is(private.resolve_reminder_lead_minutes_v1('{"reminder_lead_minutes":120}'::jsonb),120,
  'a published lead time is honoured');
select is(private.resolve_reminder_lead_minutes_v1('{"reminder_lead_minutes":1}'::jsonb),15,
  'an absurdly short lead time is clamped up');
select is(private.resolve_reminder_lead_minutes_v1('{"reminder_lead_minutes":999999}'::jsonb),10080,
  'and an absurdly long one is clamped down');

-- ---------------------------------------------------------------------------
-- Fixtures: one confirmed booking a week out.
insert into app.staff_profiles(id,tenant_id,public_name)
values ('aa000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Reminder staff');
insert into app.staff_services(tenant_id,staff_id,service_id)
values ('a0000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001');
insert into app.staff_locations(tenant_id,staff_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001');
insert into app.staff_service_locations(tenant_id,staff_id,service_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001');
insert into app.schedule_scopes(id,tenant_id,scope_kind,location_id,staff_id,time_zone)
values ('aa100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','staff','a5000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001','America/New_York');
insert into app.weekly_schedules(id,tenant_id,schedule_scope_id,day_of_week,start_minute,end_minute)
values ('aa200000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','aa100000-0000-0000-0000-000000000001',1,540,1020);

update app.catalog_service_revisions
set policy=jsonb_build_object('consent_version','1','consent_text','Terms.',
  'reminder_lead_minutes',1440,'reschedule_cutoff_minutes',0,
  'reschedule_customer_self_service',true,'cancellation_cutoff_minutes',0)
where tenant_id='a0000000-0000-0000-0000-000000000001'
  and service_id='a7200000-0000-0000-0000-000000000001';

select set_config('test.rm_hold',(select h.hold_id::text from api_v1.create_hold_v1(
  'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.rm_time('10:00'),
  'session-token-rm01-0001','idempotency-key-rm01-0001') h),true);
select set_config('test.rm_booking',(select b.booking_id::text from api_v1.confirm_booking_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.rm_hold')::uuid,
  'session-token-rm01-0001','confirm-key-rm01-0001',
  '{"fullName":"Reminder Guest","email":"reminder@example.invalid"}'::jsonb,
  '1','en','{}'::jsonb,'Asia/Riyadh') b),true);

-- ---------------------------------------------------------------------------
-- Scheduling, and the invalidation that falls out of the intent key.
savepoint rm_schedule;
select is((select r.scheduled from private.schedule_booking_reminders_v1(
  'a0000000-0000-0000-0000-000000000001') r),1,
  'a confirmed future booking gets a reminder scheduled from committed facts');
select is((select o.state from app.outbox_events o
  where o.booking_id=current_setting('test.rm_booking')::uuid and o.topic='booking.reminder'),
  'pending','which waits rather than sending now');
select is((select o.available_at from app.outbox_events o
  where o.booking_id=current_setting('test.rm_booking')::uuid and o.topic='booking.reminder'),
  pg_temp.rm_time('10:00') - interval '1440 minutes',
  'exactly one lead time before the appointment');
select is((select o.booking_revision from app.outbox_events o
  where o.booking_id=current_setting('test.rm_booking')::uuid and o.topic='booking.reminder'),
  1::bigint,'and is keyed to the revision it was scheduled for');

-- Running the scheduler again is the point: it must be safe on any schedule.
select is((select r.scheduled from private.schedule_booking_reminders_v1(
  'a0000000-0000-0000-0000-000000000001') r),0,
  'a second run schedules nothing, because the intent key already exists');
select is((select count(*)::integer from app.outbox_events o
  where o.booking_id=current_setting('test.rm_booking')::uuid and o.topic='booking.reminder'),1,
  'one reminder intent');

-- The booking's own confirmation intent is already pending; drain it so the
-- next assertion is about the reminder and nothing else.
select * from private.dispatch_notifications_v1();
-- The dispatcher leaves a future reminder alone. This is the whole reason no
-- scheduler table was needed: `available_at` already meant this.
select is((select d.dispatched from private.dispatch_notifications_v1() d),0,
  'a reminder that is not due yet is not dispatched');
select is((select count(*)::integer from app.notification_messages m
  where m.template_key='booking.reminder'),0,'and becomes no message');

-- Due now: it dispatches exactly once.
update app.outbox_events set available_at=statement_timestamp()
where booking_id=current_setting('test.rm_booking')::uuid and topic='booking.reminder';
select is((select d.dispatched from private.dispatch_notifications_v1() d),1,
  'a due reminder becomes exactly one message');
select is((select d.dispatched from private.dispatch_notifications_v1() d),0,
  'and a second dispatch creates nothing');
rollback to savepoint rm_schedule;

-- ---------------------------------------------------------------------------
-- A booking whose time changed must never be reminded of the old one.
savepoint rm_reschedule;
select * from private.schedule_booking_reminders_v1('a0000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select * from api_v1.reschedule_booking_v1('a0000000-0000-0000-0000-000000000001',
  current_setting('test.rm_booking')::uuid,1,pg_temp.rm_time('14:00'));
reset role;
select set_config('request.jwt.claims',null,true);

select is((select r.superseded from private.schedule_booking_reminders_v1(
  'a0000000-0000-0000-0000-000000000001') r),1,
  'the reminder for the old time is superseded, not sent');
select is((select o.state from app.outbox_events o
  where o.booking_id=current_setting('test.rm_booking')::uuid
    and o.topic='booking.reminder' and o.booking_revision=1),
  'superseded',
  'and is recorded as superseded rather than failed: it did not fail to send, '
  'it stopped being true');
select is((select count(*)::integer from app.outbox_events o
  where o.booking_id=current_setting('test.rm_booking')::uuid
    and o.topic='booking.reminder' and o.state='pending'),1,
  'exactly one reminder is pending, for the new time');
select is((select o.available_at from app.outbox_events o
  where o.booking_id=current_setting('test.rm_booking')::uuid
    and o.topic='booking.reminder' and o.state='pending'),
  pg_temp.rm_time('14:00') - interval '1440 minutes',
  'scheduled from the time the booking actually has now');

-- Even if the old one were due, it is no longer pending, so it cannot go out.
update app.outbox_events set available_at=statement_timestamp()
where booking_id=current_setting('test.rm_booking')::uuid and topic='booking.reminder';
select * from private.dispatch_notifications_v1();
select is((select count(*)::integer from app.notification_messages m
  where m.template_key='booking.reminder'),1,
  'a rescheduled booking sends one reminder, for the time it actually has');
rollback to savepoint rm_reschedule;

-- ---------------------------------------------------------------------------
-- A booking that is not going to happen is never reminded of.
savepoint rm_cancel;
select * from private.schedule_booking_reminders_v1('a0000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select * from api_v1.cancel_booking_v1('a0000000-0000-0000-0000-000000000001',
  current_setting('test.rm_booking')::uuid,1,'Customer cancelled.');
reset role;
select set_config('request.jwt.claims',null,true);

select ok((select r.superseded >= 1 from private.schedule_booking_reminders_v1(
  'a0000000-0000-0000-0000-000000000001') r),
  'a cancelled booking supersedes its reminder');
select is((select count(*)::integer from app.outbox_events o
  where o.booking_id=current_setting('test.rm_booking')::uuid
    and o.topic='booking.reminder' and o.state='pending'),0,
  'and schedules no replacement');
update app.outbox_events set available_at=statement_timestamp()
where booking_id=current_setting('test.rm_booking')::uuid;
select * from private.dispatch_notifications_v1();
select is((select count(*)::integer from app.notification_messages m
  where m.template_key='booking.reminder'),0,
  'nobody is reminded of an appointment that is not happening');
rollback to savepoint rm_cancel;

-- ---------------------------------------------------------------------------
-- Staff alerts go to the people a capability says they should.
savepoint rm_alerts;
select is(private.enqueue_staff_alert_v1('a0000000-0000-0000-0000-000000000001',
  current_setting('test.rm_booking')::uuid,'staff.request_pending','booking.approve'),
  3,'every member whose role can approve is alerted');
select is((select count(*)::integer from app.notification_messages m
  where m.template_key='staff.request_pending'),3,'one message each');
select is((select count(distinct m.recipient_membership_id)::integer
  from app.notification_messages m where m.template_key='staff.request_pending'),3,
  'addressed to three different members');
select ok((select bool_and(m.recipient_kind='staff') from app.notification_messages m
  where m.template_key='staff.request_pending'),
  'and marked as staff, so the worker resolves a member address rather than a '
  'booking contact');
select ok(not exists(select 1 from app.notification_messages m
  where m.template_key='staff.request_pending' and m.recipient_hash like '%@%'),
  'the ledger still addresses by digest, never in the clear');

-- Re-alerting the same revision creates nothing. A team of three gets three
-- messages and never six.
select is(private.enqueue_staff_alert_v1('a0000000-0000-0000-0000-000000000001',
  current_setting('test.rm_booking')::uuid,'staff.request_pending','booking.approve'),
  3,'the enqueue is reported again');
select is((select count(*)::integer from app.notification_messages m
  where m.template_key='staff.request_pending'),3,
  'but the durable key means still three messages');

-- A capability nobody holds alerts nobody, rather than everybody.
select is(private.enqueue_staff_alert_v1('a0000000-0000-0000-0000-000000000001',
  current_setting('test.rm_booking')::uuid,'staff.payment_exception','tenant.read_other_tenant'),
  0,'a capability no role holds alerts nobody');
rollback to savepoint rm_alerts;

-- ---------------------------------------------------------------------------
-- Location scope narrows who hears about it.
savepoint rm_alert_scope;
-- The location manager is scoped to location A and can approve there.
select ok((select count(*)::integer from private.resolve_alert_recipients_v1(
  'a0000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',
  'booking.approve')) = 3,
  'three members can approve at the location this booking is at');
select ok((select count(*)::integer from private.resolve_alert_recipients_v1(
  'a0000000-0000-0000-0000-000000000001','b5000000-0000-0000-0000-000000000001',
  'booking.approve')) = 2,
  'and only the tenant-scoped ones at a location the manager does not cover');
rollback to savepoint rm_alert_scope;

-- ---------------------------------------------------------------------------
-- Auth mail wears a brand only when the tenant is provable.
savepoint rm_auth;
select ok((select not a.ambiguous from private.resolve_auth_mail_context_v1(
  'admin-a@example.invalid') a),
  'an address belonging to exactly one tenant resolves to that tenant');
select is((select a.tenant_id from private.resolve_auth_mail_context_v1(
  'admin-a@example.invalid') a),'a0000000-0000-0000-0000-000000000001'::uuid,
  'and it is the tenant its membership names');

-- The shared support account is a member of both tenants.
select ok((select a.ambiguous from private.resolve_auth_mail_context_v1(
  'multi-tenant@example.invalid') a),
  'an address belonging to two tenants is ambiguous, so the message stays generic');
select is((select a.tenant_id from private.resolve_auth_mail_context_v1(
  'multi-tenant@example.invalid') a),null,
  'picking one would tell that tenant the person also deals with another');

select ok((select a.ambiguous from private.resolve_auth_mail_context_v1(
  'nobody@example.invalid') a),
  'an unknown address is ambiguous too, which is also how it stays unknowable '
  'whether it exists');
select ok((select a.ambiguous from private.resolve_auth_mail_context_v1(null) a),
  'and a missing address resolves to nothing rather than to something');

-- Metadata a caller controls has no influence at all: the function takes only
-- an address and reads only records this platform wrote.
select is((select count(*)::integer from pg_proc p
  where p.oid='private.resolve_auth_mail_context_v1(text)'::regprocedure
    and pg_get_function_identity_arguments(p.oid)='p_email text'),1,
  'the only input is an address; there is no hostname or redirect to forge');
rollback to savepoint rm_auth;

-- ---------------------------------------------------------------------------
-- Delivery health is counts and states, never content.
savepoint rm_health;
select * from private.dispatch_notifications_v1();
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select ok((select h.queued >= 1 from api_v1.get_delivery_health_v1(
  'a0000000-0000-0000-0000-000000000001') h),
  'a scoped member can see what is waiting to go out');
select is((select h.dead_lettered from api_v1.get_delivery_health_v1(
  'a0000000-0000-0000-0000-000000000001') h),0::bigint,
  'and that nothing has been given up on');
select ok((select h.oldest_queued_minutes >= 0 from api_v1.get_delivery_health_v1(
  'a0000000-0000-0000-0000-000000000001') h),
  'queue age is reported, which is the number that says a worker has stopped');
reset role;
select set_config('request.jwt.claims',null,true);

select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select h.queued from api_v1.get_delivery_health_v1(
  'a0000000-0000-0000-0000-000000000001') h),0::bigint,
  'another tenant sees nothing of this tenant''s mail');
reset role;
select set_config('request.jwt.claims',null,true);

select ok(
  pg_get_function_result('api_v1.get_delivery_health_v1(uuid)'::regprocedure)
    !~* '(email|subject|body|recipient|content)',
  'and the shape carries no address, subject or body: it is health, not mail');
rollback to savepoint rm_health;

-- The savepoint rollbacks above revert pgTAP's own counter, so it is restored
-- from the non-transactional sequence before the plan is emitted.
select _set('curr_test',(select last_value::integer from __tresults___numb_seq));
select * from finish();
rollback;
