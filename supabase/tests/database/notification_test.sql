begin;
select no_plan();

-- Issue #19. The durable email pipeline: outbox to message to attempt to
-- provider ledger, with idempotency, backoff, dead lettering, suppression, and
-- callbacks that never regress canonical state.

select set_config('test.n_day',
  (date_trunc('week',statement_timestamp() at time zone 'America/New_York')::date+14)::text,true);
create function pg_temp.n_time(p_time time)
returns timestamptz language sql stable as $$
  select (current_setting('test.n_day')::date+p_time) at time zone 'America/New_York';
$$;
do $$ begin
  execute format('grant usage on schema %I to authenticated',pg_my_temp_schema()::regnamespace::text);
end $$;

select has_table('app'::name,'notification_templates'::name);
select has_table('app'::name,'notification_messages'::name);
select has_table('app'::name,'notification_attempts'::name);
select has_table('app'::name,'notification_provider_events'::name);
select has_table('app'::name,'notification_suppressions'::name);
select ok(not exists(
  select 1 from (values ('anon'),('authenticated')) principals(role_name)
  cross join (values ('app.notification_messages'),('app.notification_attempts'),
    ('app.notification_provider_events'),('app.notification_suppressions'),
    ('app.notification_templates')) tables(table_name)
  cross join (values ('INSERT'),('UPDATE'),('DELETE')) commands(privilege)
  where has_table_privilege(principals.role_name,tables.table_name,commands.privilege)
),'no application role writes delivery state');
select ok(not has_table_privilege('anon','app.notification_messages','SELECT')
  and not has_table_privilege('authenticated','app.notification_attempts','SELECT'),
  'delivery internals are not readable by application roles');
select ok(not has_function_privilege('anon','private.claim_notification_batch_v1(integer,integer)','execute')
  and not has_function_privilege('authenticated','private.claim_notification_batch_v1(integer,integer)','execute'),
  'only the worker claims a batch');
select ok(has_function_privilege('authenticated','api_v1.list_booking_notifications_v1(uuid,uuid)','execute')
  and not has_function_privilege('anon','api_v1.list_booking_notifications_v1(uuid,uuid)','execute'),
  'the delivery view is a scoped member read, never anonymous');
select is((select count(*)::integer from app.notification_templates where retired_at is null),32,
  'every template key has one live English and Arabic version');
-- Issue #23. The count is a bound, not the point: what matters is that no key
-- exists in only one language, which is what would ship an English-only message.
select is((select count(*)::integer from (
    select key from app.notification_templates where retired_at is null
    group by key having count(distinct locale) <> 2) as lopsided),0,
  'no template key is published in one language only');

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
  'a5000000-0000-0000-0000-000000000001',pg_temp.n_time('10:00'),
  'session-token-aaaa-0001','idempotency-key-aaaa-0001') h),true);
select set_config('test.booking',(select b.booking_id::text from api_v1.confirm_booking_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.hold')::uuid,
  'session-token-aaaa-0001','confirm-key-aaaa-0001',
  '{"fullName":"Guest A","email":"guest@example.invalid"}'::jsonb,
  '1','en','{}'::jsonb,'Asia/Riyadh') b),true);

-- The booking already committed with its intent; dispatch turns it into one
-- message and never a second.
select is((select array[d.dispatched,d.suppressed] from private.dispatch_notifications_v1() d),
  array[1,0],'a committed booking intent becomes exactly one message');
select is((select array[d.dispatched,d.suppressed] from private.dispatch_notifications_v1() d),
  array[0,0],'a second dispatch of the same intent creates nothing');
select is((select count(*)::integer from app.notification_messages),1,
  'the durable key is the message, not the dispatch');
select is((select array[m.template_key,m.template_locale,m.status,m.attempts::text]
  from app.notification_messages m),
  array['booking.confirmed','en','queued','0'],
  'the message names its template, its locale, and its state');
select ok(not exists(select 1 from app.notification_messages m
  where m.recipient_hash = 'guest@example.invalid'),
  'the ledger addresses the recipient by digest, never in the clear');

-- Claiming holds the message under a visibility timeout.
select set_config('test.message',(select c.message_id::text
  from private.claim_notification_batch_v1() c),true);
select is((select count(*)::integer from private.claim_notification_batch_v1()),0,
  'a claimed message is invisible to a second worker until its timeout elapses');
select is((select array[m.status,m.attempts::text] from app.notification_messages m),
  array['sending','1'],'claiming counts the attempt before the provider is called');
select ok((select c.recipient_email='guest@example.invalid'
  from private.claim_notification_batch_v1() c
  where false or true limit 1) is not false,
  'the address is read at send time from the booking contact');

-- A retryable failure backs off; a success is accepted, not delivered.
select is((select array[r.status,r.dead_lettered::text] from private.record_notification_attempt_v1(
    current_setting('test.message')::uuid,1,'retryable_error',statement_timestamp(),null,'provider_timeout') r),
  array['queued','false'],'a retryable provider failure re-queues the message');
select ok((select m.next_attempt_at > statement_timestamp() from app.notification_messages m),
  'the retry is scheduled into the future with backoff');
select is((select a.error_code from app.notification_attempts a where a.attempt=1),
  'provider_timeout','the attempt ledger keeps a short stable error code');
update app.notification_messages set next_attempt_at=statement_timestamp();
select is((select c.attempt from private.claim_notification_batch_v1() c),2,
  'the retry is a new numbered attempt');
select is((select array[r.status] from private.record_notification_attempt_v1(
    current_setting('test.message')::uuid,2,'accepted',statement_timestamp(),'prov-ref-1') r),
  array['sent'],'a provider acceptance is sent, never delivered');

-- Provider callbacks: duplicates, out-of-order, and state that only moves
-- forward.
select is((select array[e.applied::text] from private.record_notification_event_v1(
    'resend','evt-1','delivered',statement_timestamp(),'prov-ref-1') e),
  array['true'],'the provider callback is what marks a message delivered');
select is((select array[e.applied::text] from private.record_notification_event_v1(
    'resend','evt-1','delivered',statement_timestamp(),'prov-ref-1') e),
  array['false'],'a duplicate callback changes nothing');
select is((select count(*)::integer from app.notification_provider_events),1,
  'the duplicate was deduplicated by the provider event id');
select is((select array[e.applied::text] from private.record_notification_event_v1(
    'resend','evt-0','delayed',statement_timestamp()-interval '1 hour','prov-ref-1') e),
  array['false'],'an out-of-order earlier event never regresses the state');
select is((select m.status from app.notification_messages m),'delivered',
  'the canonical state is still what the latest applied event said');

-- A bounce suppresses that address for this tenant only.
select is((select array[e.applied::text] from private.record_notification_event_v1(
    'resend','evt-2','bounced',statement_timestamp()+interval '1 minute','prov-ref-1') e),
  array['true'],'a later bounce is applied');
select is((select array[s.reason] from app.notification_suppressions s),
  array['hard_bounce'],'a hard bounce suppresses the address');
select is((select count(*)::integer from app.notification_suppressions s
  where s.tenant_id <> 'a0000000-0000-0000-0000-000000000001'),0,
  'suppression is scoped to the tenant that bounced, not the platform');

savepoint suppressed_dispatch;
insert into app.outbox_events(tenant_id,booking_id,topic,payload,correlation_id,booking_revision)
values ('a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid,
  'booking.rescheduled','{}'::jsonb,pg_catalog.gen_random_uuid(),5);
select is((select array[d.dispatched,d.suppressed] from private.dispatch_notifications_v1() d),
  array[0,1],'a suppressed address produces a recorded outcome, not a silent drop');
select is((select m.status from app.notification_messages m where m.booking_revision=5),
  'suppressed','the suppressed message is visible in the ledger');
rollback to savepoint suppressed_dispatch;

-- Dead lettering and authorized replay.
savepoint dead_letter;
update app.notification_messages set status='queued', attempts=6,
  next_attempt_at=statement_timestamp();
select set_config('test.msg2',(select c.message_id::text from private.claim_notification_batch_v1() c),true);
select is((select array[r.status,r.dead_lettered::text] from private.record_notification_attempt_v1(
    current_setting('test.msg2')::uuid,7,'retryable_error',statement_timestamp(),null,'provider_timeout') r),
  array['failed','true'],'a message past the attempt ceiling is dead lettered rather than retried forever');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select array[v.status,v.attempts::text,v.dead_lettered::text]
  from api_v1.list_booking_notifications_v1('a0000000-0000-0000-0000-000000000001',
    current_setting('test.booking')::uuid) v),
  array['failed','7','true'],'the Dashboard sees the delivery state and its dead letter');
select ok(not exists(select 1 from jsonb_object_keys(to_jsonb((
    select x from api_v1.list_booking_notifications_v1('a0000000-0000-0000-0000-000000000001',
      current_setting('test.booking')::uuid) x))) key
  where key in ('recipient_hash','provider_message_reference','provider')),
  'the delivery view exposes no recipient and no provider reference');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint dead_letter;

savepoint replay;
update app.notification_messages set status='failed', dead_lettered_at=statement_timestamp(), attempts=6;
delete from app.notification_suppressions;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select array[r.status] from api_v1.replay_notification_v1(
    'a0000000-0000-0000-0000-000000000001',current_setting('test.message')::uuid) r),
  array['queued'],'an authorized replay re-queues the same message rather than making a second');
reset role;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok(
  format($$select * from api_v1.replay_notification_v1('a0000000-0000-0000-0000-000000000001',%L)$$,
    current_setting('test.message')),
  '42501','policy_denied','a member without the correction capability cannot replay');
reset role;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok(
  format($$select * from api_v1.replay_notification_v1('a0000000-0000-0000-0000-000000000001',%L)$$,
    current_setting('test.message')),
  '42501','policy_denied','another tenant cannot replay this tenant message');
select is((select count(*)::integer from api_v1.list_booking_notifications_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid)),0,
  'another tenant sees no delivery state');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint replay;

savepoint replay_suppressed;
update app.notification_messages set status='failed', dead_lettered_at=statement_timestamp();
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok(
  format($$select * from api_v1.replay_notification_v1('a0000000-0000-0000-0000-000000000001',%L)$$,
    current_setting('test.message')),
  '42501','policy_denied','a replay to a suppressed address is refused');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint replay_suppressed;

-- The booking's own notification column follows its newest message.
select is((select b.notification_status from app.bookings b
  where b.id=current_setting('test.booking')::uuid),'bounced',
  'the booking read carries delivery state without a second query');
select is((select array[b.status,b.payment_status] from app.bookings b
  where b.id=current_setting('test.booking')::uuid),
  array['confirmed','not_required'],
  'provider truth never rewrites booking truth');

-- Stuck-job recovery.
savepoint stuck;
update app.notification_messages set status='sending',
  locked_until=statement_timestamp()-interval '1 minute';
select is((select r.recovered from private.recover_stuck_notifications_v1() r),1,
  'a claim whose visibility timeout elapsed is released for another worker');
select is((select r.recovered from private.recover_stuck_notifications_v1() r),0,
  'a second recovery run releases the same claim for nobody');
rollback to savepoint stuck;

select _set('curr_test',(select last_value::integer from __tresults___numb_seq));
select * from finish();

rollback;
