begin;
select no_plan();

-- Notification settings, staff preferences, test sends, the notification
-- brand and the daily digest. Every new RPC is exercised by the role that may
-- use it AND refused to the wrong role, another tenant, and an anonymous
-- caller; every new table is read in both directions.

select set_config('test.ns_day',
  (date_trunc('week',statement_timestamp() at time zone 'America/New_York')::date+21)::text,true);
create function pg_temp.ns_time(p_time time)
returns timestamptz language sql stable as $$
  select (current_setting('test.ns_day')::date+p_time) at time zone 'America/New_York';
$$;
do $$ begin
  execute format('grant usage on schema %I to authenticated,anon,service_role',
    pg_my_temp_schema()::regnamespace::text);
end $$;

-- Identities from the seed: admin (tenant_admin), staff (staff), manager
-- (location_manager) in tenant A; staff-b in tenant B.
select set_config('test.admin','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
select set_config('test.staff','{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',true);
select set_config('test.manager','{"sub":"a1000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal2"}',true);
select set_config('test.other','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('test.worker','{"role":"service_role"}',true);

-- ---------------------------------------------------------------------------
-- Shape and privileges
select has_table('app'::name,'notification_settings'::name);
select has_table('app'::name,'staff_notification_preferences'::name);
select has_table('app'::name,'notification_settings_events'::name);
select ok((select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='app' and c.relname in ('notification_settings','staff_notification_preferences',
    'notification_settings_events','whatsapp_configs','booking_whatsapp_consents')),
  'every new tenant-owned table has row level security');
select ok(not exists(
  select 1 from (values ('anon'),('authenticated')) r(role_name)
  cross join (values ('app.notification_settings'),('app.staff_notification_preferences'),
    ('app.notification_settings_events')) t(table_name)
  cross join (values ('INSERT'),('UPDATE'),('DELETE')) c(privilege)
  where has_table_privilege(r.role_name,t.table_name,c.privilege)),
  'no application role writes settings, preferences or their audit trail directly');
select ok(not exists(
  select 1 from (values
    ('api_v1.get_notification_settings_v1(uuid)'),
    ('api_v1.save_notification_settings_v1(uuid,jsonb,integer[],bigint,uuid)'),
    ('api_v1.get_my_notification_preferences_v1(uuid)'),
    ('api_v1.save_my_notification_preferences_v1(uuid,jsonb,uuid)'),
    ('api_v1.list_staff_notification_preferences_v1(uuid)'),
    ('api_v1.enqueue_test_notification_v1(uuid,text,text,uuid)'),
    ('api_v1.get_notification_brand_v2(uuid)'),
    ('api_v1.enqueue_staff_daily_digests_v1(integer)')) f(sig)
  where has_function_privilege('anon',f.sig,'execute')),
  'an anonymous caller can execute none of the notification settings surface');
select ok(has_function_privilege('authenticated','api_v1.get_notification_settings_v1(uuid)','execute')
  and has_function_privilege('authenticated','api_v1.save_notification_settings_v1(uuid,jsonb,integer[],bigint,uuid)','execute')
  and has_function_privilege('authenticated','api_v1.enqueue_test_notification_v1(uuid,text,text,uuid)','execute')
  and has_function_privilege('authenticated','api_v1.get_my_notification_preferences_v1(uuid)','execute'),
  'members reach the settings surface, and the functions decide who may act');
select ok(has_function_privilege('service_role','api_v1.get_notification_brand_v2(uuid)','execute')
  and has_function_privilege('service_role','api_v1.enqueue_staff_daily_digests_v1(integer)','execute')
  and not has_function_privilege('authenticated','api_v1.enqueue_staff_daily_digests_v1(integer)','execute')
  and not has_function_privilege('service_role','api_v1.save_notification_settings_v1(uuid,jsonb,integer[],bigint,uuid)','execute'),
  'the worker reads the brand and enqueues digests; it does not edit settings');

-- ---------------------------------------------------------------------------
-- Reading settings: membership AND the settings capability.
select set_config('request.jwt.claims',current_setting('test.admin'),true);
set local role authenticated;
select is((api_v1.get_notification_settings_v1('a0000000-0000-0000-0000-000000000001')->>'revision')::integer,0,
  'an unconfigured tenant reads revision 0');
select is(api_v1.get_notification_settings_v1('a0000000-0000-0000-0000-000000000001')->'reminder_offsets_minutes',
  '[1440,120]'::jsonb,'the default reminders are a day and two hours before');
select is((api_v1.get_notification_settings_v1('a0000000-0000-0000-0000-000000000001')->>'whatsapp_available')::boolean,
  false,'WhatsApp is not available by default');
select is((select i->>'editable' from jsonb_array_elements(api_v1.get_notification_settings_v1(
    'a0000000-0000-0000-0000-000000000001')->'items') i where i->>'template_key'='booking.confirmed'),
  'false','a booking confirmation is not editable');
select is((select i->>'editable' from jsonb_array_elements(api_v1.get_notification_settings_v1(
    'a0000000-0000-0000-0000-000000000001')->'items') i where i->>'template_key'='management.otp_requested'),
  'false','a management code is not editable');
select is((select count(*)::integer from jsonb_array_elements(api_v1.get_notification_settings_v1(
    'a0000000-0000-0000-0000-000000000001')->'items') i where i->>'audience' not in ('customer','staff')),
  0,'every item names a customer or staff audience');
reset role;

select set_config('request.jwt.claims',current_setting('test.staff'),true);
set local role authenticated;
select throws_ok($$select api_v1.get_notification_settings_v1('a0000000-0000-0000-0000-000000000001')$$,
  '42501','policy_denied','a member without the settings capability cannot read (it is the preview probe)');
reset role;
select set_config('request.jwt.claims',current_setting('test.other'),true);
set local role authenticated;
select throws_ok($$select api_v1.get_notification_settings_v1('a0000000-0000-0000-0000-000000000001')$$,
  '42501','policy_denied','another tenant cannot read these settings');
reset role;
select set_config('request.jwt.claims',null,true);
set local role anon;
select throws_ok($$select api_v1.get_notification_settings_v1('a0000000-0000-0000-0000-000000000001')$$,
  '42501',null,'an anonymous caller cannot read settings');
reset role;

-- ---------------------------------------------------------------------------
-- Saving settings: capability, revision, idempotency, audit, bounds.
savepoint ns_save;
select set_config('request.jwt.claims',current_setting('test.admin'),true);
set local role authenticated;
select is(api_v1.save_notification_settings_v1('a0000000-0000-0000-0000-000000000001',
  '[{"template_key":"booking.rescheduled","email_enabled":false}]'::jsonb,array[2880,60],0,
  'c0000000-0000-0000-0000-0000000000a1'),
  '{"version":1,"revision":1,"replayed":false}'::jsonb,'the settings capability saves at the expected revision');
select is(api_v1.save_notification_settings_v1('a0000000-0000-0000-0000-000000000001',
  '[{"template_key":"booking.rescheduled","email_enabled":false}]'::jsonb,array[2880,60],0,
  'c0000000-0000-0000-0000-0000000000a1'),
  '{"version":1,"revision":1,"replayed":true}'::jsonb,'the same request replays rather than saving twice');
select throws_ok($$select api_v1.save_notification_settings_v1('a0000000-0000-0000-0000-000000000001',
  '[]'::jsonb,array[1440],0,'c0000000-0000-0000-0000-0000000000a1')$$,
  '22023','idempotency_conflict','a different request under the same id is a conflict');
select throws_ok($$select api_v1.save_notification_settings_v1('a0000000-0000-0000-0000-000000000001',
  '[]'::jsonb,array[1440],0,'c0000000-0000-0000-0000-0000000000a2')$$,
  '40001','revision_conflict','a stale revision is refused');
select throws_ok($$select api_v1.save_notification_settings_v1('a0000000-0000-0000-0000-000000000001',
  '[{"template_key":"booking.confirmed","email_enabled":false}]'::jsonb,array[1440],1,
  'c0000000-0000-0000-0000-0000000000a3')$$,
  '22023','notification_settings_invalid','a message that must always go cannot be switched off');
select throws_ok($$select api_v1.save_notification_settings_v1('a0000000-0000-0000-0000-000000000001',
  '[{"template_key":"payment.refunded","whatsapp_enabled":true}]'::jsonb,array[1440],1,
  'c0000000-0000-0000-0000-0000000000a4')$$,
  '22023','notification_settings_invalid','WhatsApp cannot be switched on for a type it does not carry');
select throws_ok($$select api_v1.save_notification_settings_v1('a0000000-0000-0000-0000-000000000001',
  '[]'::jsonb,array[5],1,'c0000000-0000-0000-0000-0000000000a5')$$,
  '22023','notification_settings_invalid','a lead time outside 15 minutes to 7 days is refused');
select throws_ok($$select api_v1.save_notification_settings_v1('a0000000-0000-0000-0000-000000000001',
  '[{"template_key":"no.such_type","email_enabled":false}]'::jsonb,array[1440],1,
  'c0000000-0000-0000-0000-0000000000a6')$$,
  '22023','notification_settings_invalid','an unknown type is refused');
select is((select i->>'email_enabled' from jsonb_array_elements(api_v1.get_notification_settings_v1(
    'a0000000-0000-0000-0000-000000000001')->'items') i where i->>'template_key'='booking.rescheduled'),
  'false','the saved choice reads back');
select is(api_v1.get_notification_settings_v1('a0000000-0000-0000-0000-000000000001')->'reminder_offsets_minutes',
  '[2880,60]'::jsonb,'and so do the lead times, longest first');
select is((select count(*)::integer from app.notification_settings s
  where s.tenant_id='a0000000-0000-0000-0000-000000000001'),1,
  'a member reads their own tenant settings row');
select is((select array[e.action,e.request_id::text] from app.notification_settings_events e),
  array['settings_saved','c0000000-0000-0000-0000-0000000000a1'],'the save is audited once');
reset role;

select set_config('request.jwt.claims',current_setting('test.manager'),true);
set local role authenticated;
select throws_ok($$select api_v1.save_notification_settings_v1('a0000000-0000-0000-0000-000000000001',
  '[]'::jsonb,array[1440],1,'c0000000-0000-0000-0000-0000000000a7')$$,
  '42501','policy_denied','a location-scoped policy editor cannot change tenant-wide settings');
select is((select count(*)::integer from app.notification_settings_events),0,
  'and cannot read the audit trail without the audit capability at tenant scope');
reset role;
select set_config('request.jwt.claims',current_setting('test.other'),true);
set local role authenticated;
select throws_ok($$select api_v1.save_notification_settings_v1('a0000000-0000-0000-0000-000000000001',
  '[]'::jsonb,array[1440],1,'c0000000-0000-0000-0000-0000000000a8')$$,
  '42501','policy_denied','another tenant cannot save these settings');
select is((select count(*)::integer from app.notification_settings s
  where s.tenant_id='a0000000-0000-0000-0000-000000000001'),0,
  'nor read them');
reset role;
select set_config('request.jwt.claims',null,true);
set local role anon;
select throws_ok($$select api_v1.save_notification_settings_v1('a0000000-0000-0000-0000-000000000001',
  '[]'::jsonb,array[1440],1,'c0000000-0000-0000-0000-0000000000a9')$$,
  '42501',null,'an anonymous caller cannot save settings');
reset role;
rollback to savepoint ns_save;

-- ---------------------------------------------------------------------------
-- Booking fixture.
insert into app.staff_profiles(id,tenant_id,public_name)
values ('ab000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Settings staff');
insert into app.staff_services(tenant_id,staff_id,service_id)
values ('a0000000-0000-0000-0000-000000000001','ab000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001');
insert into app.staff_locations(tenant_id,staff_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','ab000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001');
insert into app.staff_service_locations(tenant_id,staff_id,service_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','ab000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001');
insert into app.schedule_scopes(id,tenant_id,scope_kind,location_id,staff_id,time_zone)
values ('ab100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','staff','a5000000-0000-0000-0000-000000000001','ab000000-0000-0000-0000-000000000001','America/New_York');
insert into app.weekly_schedules(id,tenant_id,schedule_scope_id,day_of_week,start_minute,end_minute)
values ('ab200000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','ab100000-0000-0000-0000-000000000001',1,540,1020);
update app.catalog_service_revisions
set policy=jsonb_build_object('consent_version','1','consent_text','Terms.')
where tenant_id='a0000000-0000-0000-0000-000000000001' and service_id='a7200000-0000-0000-0000-000000000001';
select set_config('test.ns_hold',(select h.hold_id::text from api_v1.create_hold_v1(
  'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.ns_time('10:00'),
  'session-token-ns01-0001','idempotency-key-ns01-0001') h),true);
select set_config('test.ns_booking',(select b.booking_id::text from api_v1.confirm_booking_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.ns_hold')::uuid,
  'session-token-ns01-0001','confirm-key-ns01-0001',
  '{"fullName":"Settings Guest","email":"settings-guest@example.invalid"}'::jsonb,
  '1','en','{}'::jsonb,'Asia/Riyadh') b),true);

-- ---------------------------------------------------------------------------
-- A type the tenant switched off is not enqueued; one that must go always is.
savepoint ns_disabled;
insert into app.notification_settings(tenant_id,overrides)
values ('a0000000-0000-0000-0000-000000000001',
  '{"booking.rescheduled":{"email_enabled":false},"booking.confirmed":{"email_enabled":false}}');
select is((select d.dispatched from private.dispatch_notifications_v1() d),1,
  'the confirmation intent is dispatched');
select is((select count(*)::integer from app.notification_messages m
  where m.template_key='booking.confirmed' and m.channel='email'),1,
  'a non-editable type is enqueued even against a stored override');
insert into app.outbox_events(tenant_id,booking_id,topic,payload,correlation_id,booking_revision)
values ('a0000000-0000-0000-0000-000000000001',current_setting('test.ns_booking')::uuid,
  'booking.rescheduled','{}'::jsonb,pg_catalog.gen_random_uuid(),7);
select is((select array[d.dispatched,d.suppressed] from private.dispatch_notifications_v1() d),
  array[0,0],'a disabled customer type produces no message');
select is((select count(*)::integer from app.notification_messages m
  where m.template_key='booking.rescheduled'),0,'nothing is queued for it');
select is((select o.state from app.outbox_events o
  where o.topic='booking.rescheduled' and o.booking_revision=7),'skipped',
  'and its intent is recorded as skipped, neither sent nor failed');
rollback to savepoint ns_disabled;

-- ---------------------------------------------------------------------------
-- The send-time payload carries what the templates need, and a manage link
-- whose token is stored only as a digest.
savepoint ns_payload;
select * from private.dispatch_notifications_v1();
create temp table ns_claimed on commit drop as
  select * from private.claim_notification_batch_v1();
select is((select count(*)::integer from ns_claimed),1,'one confirmation is claimed');
select is((select array[c.payload->>'service_name' is not null,c.payload->>'location_name' is not null,
    c.payload->>'time_zone'='America/New_York',c.payload->>'currency' is not null,
    c.payload->>'public_reference' is not null]::text from ns_claimed c),
  array[true,true,true,true,true]::text,
  'the claim carries service, location, time zone, money and reference');
select is((select c.payload->>'staff_name' from ns_claimed c),'Settings staff',
  'and the staff member the customer will see');
select ok((select c.payload->>'manage_url' ~ '^https://client\.tenant-a\.example\.invalid/en/manage\?token=[a-f0-9]{64}$'
  from ns_claimed c),'a customer email carries a manage link on the verified client origin');
select ok(exists(select 1 from app.management_tokens t join ns_claimed c on t.message_id=c.message_id
    where t.intent='view' and t.revoked_at is null
      and t.token_hash=encode(sha256(convert_to(t.tenant_id::text||':'||
        substring(c.payload->>'manage_url' from 'token=([a-f0-9]{64})'),'UTF8')),'hex')),
  'the link is a live view token stored only as its digest');
select ok(not exists(select 1 from app.management_tokens t join ns_claimed c on true
    where t.token_hash = substring(c.payload->>'manage_url' from 'token=([a-f0-9]{64})')),
  'the plaintext token is not stored anywhere in the token table');
select is((select c.is_test from ns_claimed c),false,'a booking message is not a test');
rollback to savepoint ns_payload;

-- ---------------------------------------------------------------------------
-- Reminder lead times drive reminder scheduling.
savepoint ns_reminders;
insert into app.notification_settings(tenant_id,reminder_offsets_minutes)
values ('a0000000-0000-0000-0000-000000000001',array[2880,60]);
select * from private.dispatch_notifications_v1();
select is((select r.scheduled from private.schedule_booking_reminders_v1(
  'a0000000-0000-0000-0000-000000000001') r),1,'one reminder intent is scheduled');
select is((select array[o.available_at::text,(o.payload->>'lead_minutes')]
  from app.outbox_events o where o.topic='booking.reminder'),
  array[(pg_temp.ns_time('10:00') - interval '2880 minutes')::text,'2880'],
  'the first reminder is the tenant''s longest lead time, carried in the payload');
select is((select o.payload->'offsets' from app.outbox_events o where o.topic='booking.reminder'),
  '[2880,60]'::jsonb,'and the intent carries every lead time it will use');
update app.outbox_events set available_at=statement_timestamp() where topic='booking.reminder';
select is((select d.dispatched from private.dispatch_notifications_v1() d),1,
  'the first lead time becomes a message');
select is((select array[o.state,o.available_at::text,o.payload->>'lead_minutes']
  from app.outbox_events o where o.topic='booking.reminder'),
  array['pending',(pg_temp.ns_time('10:00') - interval '60 minutes')::text,'60'],
  'and the same intent re-arms for the next lead time');
update app.outbox_events set available_at=statement_timestamp() where topic='booking.reminder';
select is((select d.dispatched from private.dispatch_notifications_v1() d),1,
  'the second lead time becomes a second message');
select is((select array_agg(m.variant order by m.variant)::text from app.notification_messages m
  where m.template_key='booking.reminder'),'{2880,60}',
  'one reminder per lead time, told apart by variant');
select is((select o.state from app.outbox_events o where o.topic='booking.reminder'),'delivered',
  'and the intent is done after its last lead time');
select is((select d.dispatched from private.dispatch_notifications_v1() d),0,
  'a further dispatch sends nothing');
rollback to savepoint ns_reminders;

-- ---------------------------------------------------------------------------
-- Staff preferences: a member's own, respected by alerts.
savepoint ns_prefs;
select set_config('request.jwt.claims',current_setting('test.manager'),true);
set local role authenticated;
select is((api_v1.get_my_notification_preferences_v1('a0000000-0000-0000-0000-000000000001')->>'digest_local_time'),
  '07:30','the digest defaults to half past seven');
select is((api_v1.get_my_notification_preferences_v1('a0000000-0000-0000-0000-000000000001')->>'digest_time_zone'),
  'America/New_York','in the member''s location time zone');
select is((select i->>'enabled' from jsonb_array_elements(api_v1.get_my_notification_preferences_v1(
    'a0000000-0000-0000-0000-000000000001')->'items') i where i->>'template_key'='staff.daily_digest'),
  'false','the daily digest is off until the member turns it on');
select is(api_v1.save_my_notification_preferences_v1('a0000000-0000-0000-0000-000000000001',
  '{"staff.request_pending":false,"digest_local_time":"06:15"}'::jsonb,'c0000000-0000-0000-0000-0000000000b1'),
  '{"version":1,"revision":1,"replayed":false}'::jsonb,'a member saves their own preferences');
select is((api_v1.save_my_notification_preferences_v1('a0000000-0000-0000-0000-000000000001',
  '{"staff.request_pending":false,"digest_local_time":"06:15"}'::jsonb,'c0000000-0000-0000-0000-0000000000b1')->>'replayed'),
  'true','idempotently');
select throws_ok($$select api_v1.save_my_notification_preferences_v1('a0000000-0000-0000-0000-000000000001',
  '{"booking.confirmed":false}'::jsonb,'c0000000-0000-0000-0000-0000000000b2')$$,
  '22023','notification_preferences_invalid','a member cannot opt out of a customer message');
select throws_ok($$select api_v1.save_my_notification_preferences_v1('a0000000-0000-0000-0000-000000000001',
  '{"digest_local_time":"25:00"}'::jsonb,'c0000000-0000-0000-0000-0000000000b3')$$,
  '22023','notification_preferences_invalid','an impossible digest time is refused');
select is((select count(*)::integer from app.staff_notification_preferences),1,
  'a member reads their own preference row');
select throws_ok($$select api_v1.list_staff_notification_preferences_v1('a0000000-0000-0000-0000-000000000001')$$,
  '42501','policy_denied','a member without tenant staff management cannot list the team');
reset role;

select set_config('request.jwt.claims',current_setting('test.staff'),true);
set local role authenticated;
select is((select count(*)::integer from app.staff_notification_preferences),0,
  'another member of the same tenant cannot read those preferences');
reset role;
select set_config('request.jwt.claims',current_setting('test.admin'),true);
set local role authenticated;
select is((select count(*)::integer from app.staff_notification_preferences),1,
  'the staff manager can');
select is((select m->>'digest_local_time' from jsonb_array_elements(
    api_v1.list_staff_notification_preferences_v1('a0000000-0000-0000-0000-000000000001')->'members') m
  where m->>'membership_id'='a3000000-0000-0000-0000-000000000003'),'06:15',
  'and lists the team''s choices');
reset role;
select set_config('request.jwt.claims',current_setting('test.other'),true);
set local role authenticated;
select throws_ok($$select api_v1.get_my_notification_preferences_v1('a0000000-0000-0000-0000-000000000001')$$,
  '42501','policy_denied','another tenant''s member has no preferences here');
select throws_ok($$select api_v1.save_my_notification_preferences_v1('a0000000-0000-0000-0000-000000000001',
  '{}'::jsonb,'c0000000-0000-0000-0000-0000000000b4')$$,
  '42501','policy_denied','and cannot write any');
select is((select count(*)::integer from app.staff_notification_preferences),0,
  'nor read any');
reset role;
select set_config('request.jwt.claims',null,true);
set local role anon;
select throws_ok($$select api_v1.get_my_notification_preferences_v1('a0000000-0000-0000-0000-000000000001')$$,
  '42501',null,'an anonymous caller has no preferences');
reset role;

select is(private.enqueue_staff_alert_v1('a0000000-0000-0000-0000-000000000001',
  current_setting('test.ns_booking')::uuid,'staff.request_pending','booking.approve'),2,
  'a member who switched an alert off is not alerted');
select ok(not exists(select 1 from app.notification_messages m
  where m.template_key='staff.request_pending'
    and m.recipient_membership_id='a3000000-0000-0000-0000-000000000003'),
  'and has no message');
insert into app.notification_settings(tenant_id,overrides)
values ('a0000000-0000-0000-0000-000000000001','{"staff.booking_cancelled":{"email_enabled":false}}');
select is(private.enqueue_staff_alert_v1('a0000000-0000-0000-0000-000000000001',
  current_setting('test.ns_booking')::uuid,'staff.booking_cancelled','booking.approve'),0,
  'a staff type the tenant switched off alerts nobody');
rollback to savepoint ns_prefs;

-- ---------------------------------------------------------------------------
-- "Send a test to me": the caller's own verified address, rate limited.
savepoint ns_test;
select set_config('request.jwt.claims',current_setting('test.admin'),true);
set local role authenticated;
select is((api_v1.enqueue_test_notification_v1('a0000000-0000-0000-0000-000000000001',
  'booking.confirmed','ar','c0000000-0000-0000-0000-0000000000c1')->>'status'),'queued',
  'a test is queued');
select is((api_v1.enqueue_test_notification_v1('a0000000-0000-0000-0000-000000000001',
  'booking.confirmed','ar','c0000000-0000-0000-0000-0000000000c1')->>'replayed'),'true',
  'and a retried request does not queue a second');
reset role;
select is((select array[m.is_test::text,m.recipient_kind,m.recipient_membership_id::text,
    coalesce(m.booking_id::text,'none'),m.template_locale]
  from app.notification_messages m where m.is_test),
  array['true','staff','a3000000-0000-0000-0000-000000000002','none','ar'],
  'addressed to the caller''s own membership, in the chosen language, with no booking');
select is((select array[c.recipient_email,c.is_test::text]
  from private.claim_notification_batch_v1() c),
  array['admin-a@example.invalid','true'],
  'the worker claims it, addressed to the caller''s own verified email, marked as a test');
select is((select count(*)::integer from app.notification_settings_events e where e.action='test_enqueued'),1,
  'the test is audited');
select set_config('request.jwt.claims',current_setting('test.admin'),true);
set local role authenticated;
select lives_ok($$select api_v1.enqueue_test_notification_v1('a0000000-0000-0000-0000-000000000001',
  'booking.reminder','en',('c0000000-0000-0000-0000-0000000001'||lpad(n::text,2,'0'))::uuid)
  from generate_series(1,9) n$$,'up to ten tests an hour are accepted');
select throws_ok($$select api_v1.enqueue_test_notification_v1('a0000000-0000-0000-0000-000000000001',
  'booking.reminder','en','c0000000-0000-0000-0000-0000000000c2')$$,
  '42501','notification_test_rate_limited','the eleventh within an hour is refused');
select throws_ok($$select api_v1.enqueue_test_notification_v1('a0000000-0000-0000-0000-000000000001',
  'nothing.here','en','c0000000-0000-0000-0000-0000000000c3')$$,
  '22023','notification_test_invalid','an unknown type is refused');
reset role;
rollback to savepoint ns_test;

savepoint ns_test_unverified;
update auth.users set email_confirmed_at=null where id='a1000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claims',current_setting('test.admin'),true);
set local role authenticated;
select throws_ok($$select api_v1.enqueue_test_notification_v1('a0000000-0000-0000-0000-000000000001',
  'booking.confirmed','en','c0000000-0000-0000-0000-0000000000d1')$$,
  '42501','notification_test_recipient_unverified','an unverified address is never a test recipient');
reset role;
rollback to savepoint ns_test_unverified;

savepoint ns_test_denied;
select set_config('request.jwt.claims',current_setting('test.staff'),true);
set local role authenticated;
select throws_ok($$select api_v1.enqueue_test_notification_v1('a0000000-0000-0000-0000-000000000001',
  'booking.confirmed','en','c0000000-0000-0000-0000-0000000000e1')$$,
  '42501','policy_denied','a member without the settings capability cannot send tests');
reset role;
select set_config('request.jwt.claims',current_setting('test.other'),true);
set local role authenticated;
select throws_ok($$select api_v1.enqueue_test_notification_v1('a0000000-0000-0000-0000-000000000001',
  'booking.confirmed','en','c0000000-0000-0000-0000-0000000000e2')$$,
  '42501','policy_denied','another tenant cannot send tests as this one');
reset role;
select set_config('request.jwt.claims',null,true);
set local role anon;
select throws_ok($$select api_v1.enqueue_test_notification_v1('a0000000-0000-0000-0000-000000000001',
  'booking.confirmed','en','c0000000-0000-0000-0000-0000000000e3')$$,
  '42501',null,'an anonymous caller cannot send tests');
reset role;
select is((select count(*)::integer from app.notification_messages where is_test),0,
  'no refused caller queued anything');
rollback to savepoint ns_test_denied;

-- ---------------------------------------------------------------------------
-- The brand a message wears.
savepoint ns_brand;
select set_config('request.jwt.claims',current_setting('test.worker'),true);
set local role service_role;
select is((select array[b.name_en,b.name_ar,b.logo_url,b.primary_color,b.on_primary_color,
    b.client_origin,b.dashboard_origin,b.default_locale,b.support_email]
  from api_v1.get_notification_brand_v2('a0000000-0000-0000-0000-000000000001') b),
  array['Tenant A Salon','صالون المستأجر أ',
    'https://client.tenant-a.example.invalid/assets/logo-light.png','#106b5a','#ffffff',
    'https://client.tenant-a.example.invalid','https://dashboard.tenant-a.example.invalid',
    'en','hello@tenant-a.example.invalid'],
  'the worker reads the published brand with resolved asset URLs and verified origins');
reset role;
select set_config('request.jwt.claims',current_setting('test.staff'),true);
set local role authenticated;
select is((select b.name_en from api_v1.get_notification_brand_v2('a0000000-0000-0000-0000-000000000001') b),
  'Tenant A Salon','a member reads their own tenant''s brand');
reset role;
select set_config('request.jwt.claims',current_setting('test.other'),true);
set local role authenticated;
select throws_ok($$select * from api_v1.get_notification_brand_v2('a0000000-0000-0000-0000-000000000001')$$,
  '42501','policy_denied','another tenant cannot read it through this function');
reset role;
select set_config('request.jwt.claims',null,true);
set local role anon;
select throws_ok($$select * from api_v1.get_notification_brand_v2('a0000000-0000-0000-0000-000000000001')$$,
  '42501',null,'nor can an anonymous caller');
reset role;
rollback to savepoint ns_brand;

-- ---------------------------------------------------------------------------
-- The daily digest: opted-in members only, once per local day, built at send
-- time from what the member may see.
savepoint ns_digest;
insert into app.staff_notification_preferences(tenant_id,membership_id,preferences,digest_local_time)
values ('a0000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000003',
  '{"staff.daily_digest":true}','00:00');
select set_config('request.jwt.claims',current_setting('test.worker'),true);
set local role service_role;
select is((select d.enqueued from api_v1.enqueue_staff_daily_digests_v1(200) d),1,
  'one opted-in member gets one digest');
select is((select d.enqueued from api_v1.enqueue_staff_daily_digests_v1(200) d),0,
  'and only one per local day however often the scheduler runs');
reset role;
select set_config('request.jwt.claims',null,true);
select is((select array[m.recipient_membership_id::text,m.payload->>'time_zone',
    (m.payload ? 'local_date')::text]
  from app.notification_messages m where m.template_key='staff.daily_digest'),
  array['a3000000-0000-0000-0000-000000000003','America/New_York','true'],
  'addressed to that member, in their location''s day');
update app.notification_messages set payload=jsonb_build_object(
    'local_date',current_setting('test.ns_day'),'time_zone','America/New_York')
where template_key='staff.daily_digest';
select is((select jsonb_array_length(c.payload->'bookings')
  from private.claim_notification_batch_v1() c where c.template_key='staff.daily_digest'),1,
  'the agenda is built at send time from bookings the member may see');
select set_config('test.digest_message',(select id::text from app.notification_messages
  where template_key='staff.daily_digest'),true);
select set_config('test.digest_email',(select u.email from auth.users u
  where u.id='a1000000-0000-0000-0000-000000000003'),true);
select set_config('test.digest_payload',(select private.notification_claim_payload_v1(m,null)::text
  from app.notification_messages m where m.id=current_setting('test.digest_message')::uuid),true);
set local role service_role;
select is((select e.encrypted_payload from api_v1.prepare_notification_delivery_v1(
  current_setting('test.digest_message')::uuid,1,current_setting('test.digest_email'),
  current_setting('test.digest_payload')::jsonb,repeat('d',64)) e),repeat('d',64),
  'the worker may prepare a currently authorized digest');
reset role;
update app.membership_location_scopes set location_id='a5000000-0000-0000-0000-000000000002'
where membership_id='a3000000-0000-0000-0000-000000000003';
set local role service_role;
select throws_ok($$select * from api_v1.prepare_notification_delivery_v1(
  current_setting('test.digest_message')::uuid,1,current_setting('test.digest_email'),
  current_setting('test.digest_payload')::jsonb,null)$$,'42501','notification_delivery_unavailable',
  'scope revocation after claim refuses cached digest content');
reset role;
rollback to savepoint ns_digest;

-- A tenant-scoped scheduler may still be pinned to one membership location.
savepoint ns_restricted_scheduler;
insert into app.membership_location_scopes(tenant_id,membership_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000005',
  'a5000000-0000-0000-0000-000000000001') on conflict do nothing;
delete from app.membership_location_scopes where membership_id='a3000000-0000-0000-0000-000000000005'
  and location_id<>'a5000000-0000-0000-0000-000000000001';
select ok(private.member_scope_covers_booking_v1('tenant',
  'a0000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000005',
  'a5000000-0000-0000-0000-000000000001',current_setting('test.ns_hold')::uuid),
  'a tenant capability still covers a booking at the permitted location');
select ok(not private.member_scope_covers_booking_v1('tenant',
  'a0000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000005',
  'a5000000-0000-0000-0000-000000000002',current_setting('test.ns_hold')::uuid),
  'a tenant capability never widens the member location restriction');
select is(jsonb_array_length(private.notification_digest_bookings_v1(
  'a0000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000005',
  current_setting('test.ns_day')::date,'America/New_York')),1,
  'a permitted booking is included in the scheduler digest');
update app.membership_location_scopes set location_id='a5000000-0000-0000-0000-000000000002'
where membership_id='a3000000-0000-0000-0000-000000000005';
select is(jsonb_array_length(private.notification_digest_bookings_v1(
  'a0000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000005',
  current_setting('test.ns_day')::date,'America/New_York')),0,
  'a tenant-scoped digest cannot include bookings or names outside membership locations');
rollback to savepoint ns_restricted_scheduler;

-- Removing booking-read capability denies the row and its contact children.
savepoint ns_no_booking_permission;
insert into app.roles(id,tenant_id,key,location_scope_mode,name_en,name_ar)
values ('a2900000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
  'custom_aa11000000000001','tenant','Brand reader','قارئ العلامة');
insert into app.role_permissions(tenant_id,role_id,permission_key,grant_kind,scope_kind)
values ('a0000000-0000-0000-0000-000000000001','a2900000-0000-0000-0000-000000000001','brand.manage','direct','tenant'),
  ('a0000000-0000-0000-0000-000000000001','a2900000-0000-0000-0000-000000000001','booking.view.any','direct','tenant');
update app.memberships set role_id='a2900000-0000-0000-0000-000000000001'
where id='a3000000-0000-0000-0000-000000000003';
select set_config('request.jwt.claims',current_setting('test.manager'),true);
set local role authenticated;
select is((select count(*)::integer from api_v1.list_calendar_v1(
  'a0000000-0000-0000-0000-000000000001',pg_temp.ns_time('00:00'),pg_temp.ns_time('23:59'))),1,
  'a custom role with direct booking-view capability reads its permitted calendar');
reset role;
delete from app.role_permissions where role_id='a2900000-0000-0000-0000-000000000001'
  and permission_key='booking.view.any';
set local role authenticated;
select is((select count(*)::integer from app.bookings where id=current_setting('test.ns_booking')::uuid),0,
  'membership and location alone cannot read a booking without a view capability');
select is((select count(*)::integer from app.booking_contacts where booking_id=current_setting('test.ns_booking')::uuid),0,
  'contact child reads inherit the booking capability denial');
select is((select count(*)::integer from api_v1.list_calendar_v1(
  'a0000000-0000-0000-0000-000000000001',pg_temp.ns_time('00:00'),pg_temp.ns_time('23:59'))),0,
  'a brand-only custom role cannot bypass booking RLS through Calendar');
select is((select count(*)::integer from api_v1.get_today_workspace_v1(
  'a0000000-0000-0000-0000-000000000001',pg_temp.ns_time('00:00'),pg_temp.ns_time('23:59'))),0,
  'a brand-only custom role cannot bypass booking RLS through Today');
reset role;
rollback to savepoint ns_no_booking_permission;

savepoint ns_own_read;
update app.staff_profiles set membership_id='a3000000-0000-0000-0000-000000000001'
where id='ab000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims',current_setting('test.staff'),true);
set local role authenticated;
select is((select count(*)::integer from app.bookings where id=current_setting('test.ns_booking')::uuid),1,
  'an own-view grant reads an appointment assigned to that member');
reset role;
update app.staff_profiles set membership_id=null where id='ab000000-0000-0000-0000-000000000001';
set local role authenticated;
select is((select count(*)::integer from app.bookings where id=current_setting('test.ns_booking')::uuid),0,
  'the same own-view grant cannot read an unrelated appointment');
reset role;
rollback to savepoint ns_own_read;

select _set('curr_test',(select last_value::integer from __tresults___numb_seq));
select * from finish();
rollback;
