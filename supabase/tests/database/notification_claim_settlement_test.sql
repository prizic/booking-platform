-- A WhatsApp claim that cannot be delivered is settled, not stranded or retried
-- forever (`20261008130000_notification_claim_settlement.sql`).
--
-- Against `20261007101000_notification_engine_channels.sql` alone, every case
-- below that says "settled" leaves the row exactly where the worker died:
--
--   * the dead-letter sweep considered only `status = 'queued'`, while the claim
--     filter accepts `sending` with a lapsed visibility timeout;
--   * `recover_stuck_notifications_v1` would have released such a row, but no
--     job in `supabase/cron/schedule.sql` runs it.
--
-- So a lapsed claim on a tenant that has since lost the channel was never
-- settled at all, and a lapsed claim on a booking with no consent snapshot was
-- claimed, incremented, dropped by the inner join, and reclaimed on every poll
-- until `attempts` hit the table's own check constraint.
begin;
select no_plan();

do $$ begin
  execute format('grant usage on schema %I to authenticated,anon,service_role',
    pg_my_temp_schema()::regnamespace::text);
end $$;

-- A future-dated slot inside the seeded Monday-Friday 09:00-17:00 schedule.
select set_config('test.day',
  (date_trunc('week',statement_timestamp() at time zone 'America/New_York')::date+28)::text,true);
create function pg_temp.at_slot(p_time time) returns timestamptz
language sql stable as $$
  select (current_setting('test.day')::date+p_time) at time zone 'America/New_York';
$$;
select set_config('test.worker','{"role":"service_role"}',true);

-- ---------------------------------------------------------------------------
-- The tenant is entitled, configured and enabled, so the only thing that can
-- stop a message is the state of its own booking.
-- ---------------------------------------------------------------------------
insert into app.tenant_entitlements(tenant_id,feature_key,granted,source)
values ('a0000000-0000-0000-0000-000000000001','whatsapp_notifications',true,'plan');
insert into app.whatsapp_configs(tenant_id,enabled,phone_number_id,business_account_id,
  access_token_secret_ref,template_map)
values ('a0000000-0000-0000-0000-000000000001',true,'1234567890','9876543210',
  'env:WHATSAPP_TOKEN_A0000000000000000000000000000001',
  '{"booking.confirmed":{"name":"booking_confirmed_v1","language":"en"}}'::jsonb);

update app.catalog_service_revisions
set policy=jsonb_build_object('consent_version','1','consent_text','Terms.')
where tenant_id='a0000000-0000-0000-0000-000000000001' and service_id='a7200000-0000-0000-0000-000000000001';

-- Availability fixture: the seed carries no staff schedule for this
-- service/location, so holds would fail with slot_unavailable. Same shape as
-- the WhatsApp suite's own staff (Monday 09:00-17:00, fresh ids).
insert into app.staff_profiles(id,tenant_id,public_name)
values ('b8000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Settlement staff');
insert into app.staff_services(tenant_id,staff_id,service_id)
values ('a0000000-0000-0000-0000-000000000001','b8000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001');
insert into app.staff_locations(tenant_id,staff_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','b8000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001');
insert into app.staff_service_locations(tenant_id,staff_id,service_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','b8000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001');
insert into app.schedule_scopes(id,tenant_id,scope_kind,location_id,staff_id,time_zone)
values ('b8100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','staff','a5000000-0000-0000-0000-000000000001','b8000000-0000-0000-0000-000000000001','America/New_York');
insert into app.weekly_schedules(id,tenant_id,schedule_scope_id,day_of_week,start_minute,end_minute)
values ('b8200000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','b8100000-0000-0000-0000-000000000001',1,540,1020);

-- One booking that opted in, one that did not. Both are real confirmations, so
-- their snapshots, hold and outbox intent are the ones production wrote.
select set_config('test.hold1',(select h.hold_id::text from api_v1.create_hold_v1(
  'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.at_slot('10:00'),
  'session-token-hs01-0001','idempotency-key-hs01-0001') h),true);
select set_config('test.consented',(select b.booking_id::text from api_v1.confirm_booking_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.hold1')::uuid,
  'session-token-hs01-0001','confirm-key-hs01-0001',
  '{"fullName":"Consented Guest","email":"consented@example.invalid",
    "whatsappOptIn":{"phoneE164":"+966501234567","consentText":"Yes.","consentVersion":"1"}}'::jsonb,
  '1','en','{}'::jsonb,'Asia/Riyadh') b),true);

select set_config('test.hold2',(select h.hold_id::text from api_v1.create_hold_v1(
  'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.at_slot('13:00'),
  'session-token-hs02-0001','idempotency-key-hs02-0001') h),true);
select set_config('test.unconsented',(select b.booking_id::text from api_v1.confirm_booking_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.hold2')::uuid,
  'session-token-hs02-0001','confirm-key-hs02-0001',
  '{"fullName":"Silent Guest","email":"silent@example.invalid"}'::jsonb,
  '1','en','{}'::jsonb,'Asia/Riyadh') b),true);

select is((select count(*)::integer from app.booking_whatsapp_consents
    where booking_id=current_setting('test.consented')::uuid),1,
  'the opted-in booking has its consent snapshot');
select is((select count(*)::integer from app.booking_whatsapp_consents
    where booking_id=current_setting('test.unconsented')::uuid),0,
  'the other booking deliberately has none');

-- Dispatch writes the WhatsApp row for the consented booking only.
select * from private.dispatch_notifications_v1();
select set_config('test.message',(select m.id::text from app.notification_messages m
  where m.channel='whatsapp' and m.booking_id=current_setting('test.consented')::uuid),true);
select ok(current_setting('test.message') <> '',
  'dispatch produced the one WhatsApp message that can be delivered');
select set_config('test.email_message',(select m.id::text from app.notification_messages m
  where m.channel='email' and m.booking_id=current_setting('test.consented')::uuid limit 1),true);

-- A WhatsApp row for the booking that never opted in. Dispatch correctly refuses
-- to create one, so this is the state a row is in after consent is the only
-- missing piece - a revoked snapshot or a row written before the snapshot.
insert into app.notification_messages
  (tenant_id,booking_id,outbox_event_id,template_key,template_locale,template_version,
   booking_revision,recipient_hash,status,correlation_id,channel)
select 'a0000000-0000-0000-0000-000000000001', o.booking_id, o.id, 'booking.confirmed', 'en', 1,
  1, repeat('b',64), 'sending', gen_random_uuid(), 'whatsapp'
from app.outbox_events o
where o.tenant_id='a0000000-0000-0000-0000-000000000001'
  and o.booking_id=current_setting('test.unconsented')::uuid;

select set_config('test.unconsented_message',(select m.id::text from app.notification_messages m
  where m.channel='whatsapp' and m.booking_id=current_setting('test.unconsented')::uuid),true);
select ok(current_setting('test.unconsented_message') <> '', 'and the fixture row exists');

-- Every message below starts in the state a worker that died mid-attempt leaves
-- behind: `sending`, with a visibility timeout that has already lapsed.
update app.notification_messages set locked_until=statement_timestamp()-interval '1 minute'
where id in (current_setting('test.message')::uuid, current_setting('test.unconsented_message')::uuid);
update app.notification_messages set status='sending',
  locked_until=statement_timestamp()-interval '1 minute'
where id=current_setting('test.email_message')::uuid;

-- ---------------------------------------------------------------------------
-- 1. One poll settles the undeliverable lapsed claim and still hands the
--    deliverable one to a worker.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',current_setting('test.worker'),true);
set local role service_role;
create temp table hs_claimed on commit drop as
  select * from api_v1.claim_whatsapp_batch_v1(20,120);
reset role;

select is((select count(*)::integer from hs_claimed),1,
  'the one deliverable message is handed to a worker');
select is((select c.message_id::text from hs_claimed c),current_setting('test.message'),
  'and it is the consented booking''s own message');
select is((select c.recipient_phone_e164 from hs_claimed c),'+966501234567',
  'with the number the customer consented to');

-- The consent-less row. On the old code this was claimed (attempts + 1) and
-- then discarded by the join to booking_whatsapp_consents.
select is((select count(*)::integer from hs_claimed
    where message_id=current_setting('test.unconsented_message')::uuid),0,
  'the consent-less row is never handed to a worker');
select is((select status from app.notification_messages
    where id=current_setting('test.unconsented_message')::uuid),'failed',
  'it is settled instead of being left claimed');
select ok((select dead_lettered_at is not null from app.notification_messages
    where id=current_setting('test.unconsented_message')::uuid),'and dead-lettered');
select ok((select locked_until is null from app.notification_messages
    where id=current_setting('test.unconsented_message')::uuid),'with its visibility lock released');
select is((select last_error_code from app.notification_messages
    where id=current_setting('test.unconsented_message')::uuid),'whatsapp_unavailable',
  'and a stable operator-facing code');
-- The old loop's evidence: the counter went up on every poll although no worker
-- ever saw the row, so it grew to the table's check and broke the whole claim.
select is((select attempts from app.notification_messages
    where id=current_setting('test.unconsented_message')::uuid),0,
  'a settled message is never counted as an attempt');

-- ---------------------------------------------------------------------------
-- 2. A lapsed claim on a tenant that lost the channel reaches an outcome too.
--
-- The claim filter requires an available channel, so this row could never be
-- claimed and, with a sweep that only saw `queued`, never settled either.
-- ---------------------------------------------------------------------------
update app.notification_messages set locked_until=statement_timestamp()-interval '1 minute'
where id=current_setting('test.message')::uuid;
update app.tenant_entitlements set granted=false
where tenant_id='a0000000-0000-0000-0000-000000000001' and feature_key='whatsapp_notifications';

select set_config('request.jwt.claims',current_setting('test.worker'),true);
set local role service_role;
select is((select count(*)::integer from api_v1.claim_whatsapp_batch_v1(20,120)),0,
  'nothing is claimed once the entitlement is gone');
reset role;

select is((select status from app.notification_messages where id=current_setting('test.message')::uuid),
  'failed','the stranded claim is settled rather than left sending');
select ok((select dead_lettered_at is not null and locked_until is null
    from app.notification_messages where id=current_setting('test.message')::uuid),
  'dead-lettered, with its lock released');
select is((select attempts from app.notification_messages where id=current_setting('test.message')::uuid),1,
  'its one real attempt is not rewritten by the sweep');

-- ---------------------------------------------------------------------------
-- 3. The sweep only touches lapsed claims, and only on the WhatsApp channel.
-- ---------------------------------------------------------------------------
update app.tenant_entitlements set granted=true
where tenant_id='a0000000-0000-0000-0000-000000000001' and feature_key='whatsapp_notifications';

-- A live worker still owns this one: its lock has not lapsed.
insert into app.notification_messages
  (tenant_id,booking_id,outbox_event_id,template_key,template_locale,template_version,
   booking_revision,recipient_hash,status,correlation_id,channel,locked_until)
select 'a0000000-0000-0000-0000-000000000001', o.booking_id, o.id, 'booking.confirmed', 'en', 1,
  1, repeat('c',64), 'sending', gen_random_uuid(), 'whatsapp', statement_timestamp()+interval '5 minutes'
from app.outbox_events o
where o.tenant_id='a0000000-0000-0000-0000-000000000001'
  and o.booking_id=current_setting('test.consented')::uuid;
select set_config('test.live',(select m.id::text from app.notification_messages m
  where m.recipient_hash=repeat('c',64)),true);

select set_config('request.jwt.claims',current_setting('test.worker'),true);
set local role service_role;
select is((select count(*)::integer from api_v1.claim_whatsapp_batch_v1(20,120)
    where message_id=current_setting('test.live')::uuid),0,
  'a claim a live worker still holds is not handed out again');
reset role;
select is((select status from app.notification_messages where id=current_setting('test.live')::uuid),
  'sending','its row is left alone');
select ok((select dead_lettered_at is null from app.notification_messages
    where id=current_setting('test.live')::uuid),'and is not dead-lettered under it');

-- The email worker's message is not this channel's business, in either state.
select set_config('request.jwt.claims',current_setting('test.worker'),true);
set local role service_role;
select is((select count(*)::integer from api_v1.claim_whatsapp_batch_v1(20,120)
    where message_id=current_setting('test.email_message')::uuid),0,
  'the WhatsApp claim never returns an email message');
reset role;
select ok((select dead_lettered_at is null and status='sending'
    from app.notification_messages where id=current_setting('test.email_message')::uuid),
  'and never settles an email message whose lock lapsed');

-- ---------------------------------------------------------------------------
-- 4. The claim is still the worker's alone. (Exercised by the WhatsApp suite
--    too; restated here because the replacement above re-issued the grants.)
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated','api_v1.claim_whatsapp_batch_v1(integer,integer)','execute'),
  'a member cannot claim WhatsApp messages');
select ok(not has_function_privilege('anon','api_v1.claim_whatsapp_batch_v1(integer,integer)','execute'),
  'neither can an anonymous caller');
select ok(has_function_privilege('service_role','api_v1.claim_whatsapp_batch_v1(integer,integer)','execute'),
  'the worker still can');

select * from finish();
rollback;