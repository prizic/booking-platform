begin;
select no_plan();

select set_config('test.issue_day',
  (date_trunc('week',statement_timestamp() at time zone 'America/New_York')::date+14)::text,true);
create function pg_temp.issue_time(p_time time)
returns timestamptz language sql stable as $$
  select (current_setting('test.issue_day')::date+p_time) at time zone 'America/New_York';
$$;
do $$ begin
  execute format('grant usage on schema %I to authenticated',pg_my_temp_schema()::regnamespace::text);
end $$;

-- One confirmed booking to manage.
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
set intake_schema='{"fields":[{"key":"reason","label":"Reason","required":true}]}'::jsonb,
    policy=jsonb_build_object('consent_version','1','consent_text','Terms.')
where tenant_id='a0000000-0000-0000-0000-000000000001' and service_id='a7200000-0000-0000-0000-000000000001';
select set_config('test.hold',(select h.hold_id::text from api_v1.create_hold_v1(
  'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.issue_time('10:00'),
  'session-token-dddd-0001','idempotency-key-dddd-0001') h),true);
select set_config('test.booking',(select b.booking_id::text from api_v1.confirm_booking_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.hold')::uuid,
  'session-token-dddd-0001','confirm-key-dddd-0001',
  '{"fullName":"Guest D","email":"guest.d@example.invalid"}'::jsonb,
  '1','en','{"reason":"Quiet room"}'::jsonb,'Asia/Riyadh') b),true);

create function pg_temp.recovery_booking(p_time time,p_key text) returns uuid language plpgsql as $$
declare v_hold uuid; v_booking uuid;
begin
  select hold_id into v_hold from api_v1.create_hold_v1('client.tenant-a.example.invalid','client',
    'a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',pg_temp.issue_time(p_time),
    'recovery-session-'||p_key,'recovery-hold-key-'||p_key);
  select booking_id into v_booking from api_v1.confirm_booking_v1('client.tenant-a.example.invalid','client',v_hold,
    'recovery-session-'||p_key,'recovery-confirm-key-'||p_key,
    '{"fullName":"Guest D","email":"guest.d@example.invalid"}','1','en','{"reason":"Second appointment"}','Asia/Riyadh');
  return v_booking;
end;
$$;
select set_config('test.second_booking',pg_temp.recovery_booking('13:00','second-0001')::text,true);
select set_config('test.closed_booking',pg_temp.recovery_booking('16:00','closed-0001')::text,true);
-- Cancel through the canonical lifecycle engine: a bare status update would
-- violate the cancelled-fields check constraint (cancelled_at, actor kind).
select * from private.cancel_booking_v1('a0000000-0000-0000-0000-000000000001',
  current_setting('test.closed_booking')::uuid,
  (select b.revision from app.bookings b where b.id=current_setting('test.closed_booking')::uuid),
  'system');

select has_function('api_v1'::name,'request_booking_recovery_v1'::name,array['text','text','text','uuid']);
select ok(not has_table_privilege('anon','app.booking_recovery_requests','select') and
  not has_table_privilege('authenticated','app.booking_recovery_requests','select'),
  'R5 recovery queue is inaccessible to both public application roles');
select ok((select relrowsecurity from pg_class where oid='app.booking_recovery_requests'::regclass),
  'R5 digest-only recovery requests have RLS');
select ok((select prosrc !~ 'app\.(bookings|customers|booking_contacts|management_tokens)'
  from pg_proc where oid='private.request_booking_recovery_v1(text,text,text,uuid)'::regprocedure),
  'R5 public timing architecture contains no existence-dependent booking/contact/token query');
select ok(not has_function_privilege('anon','private.process_booking_recovery_v1(integer)','execute'),
  'R5 public requests cannot run matching or mint delivery links synchronously');

select ok((select prosrc ~ 'pg_advisory_xact_lock' and strpos(prosrc,'pg_advisory_xact_lock')<strpos(prosrc,'limit 100')
  and strpos(prosrc,'limit 3')<strpos(prosrc,'insert into app.booking_recovery_requests')
  from pg_proc where oid='private.request_booking_recovery_v1(text,text,text,uuid)'::regprocedure),
  'B3 concurrency admission budgets and inserts share the tenant transaction lock');
select ok((select prosrc ~ 'octet_length\(p_email\)>1280' and strpos(prosrc,'octet_length(p_email)')<strpos(prosrc,'lower(btrim(p_email))')
  from pg_proc where oid='private.request_booking_recovery_v1(text,text,text,uuid)'::regprocedure),
  'B3 byte bound precedes normalization/hash work on an arbitrary email body');
set local role anon;
select is(api_v1.request_booking_recovery_v1('client.tenant-a.example.invalid','client',repeat('x',1048576)||'@example.invalid',gen_random_uuid()),
  '{"contractVersion":1,"outcome":"accepted"}'::jsonb,'B3 oversized email has the same acknowledgment without hashing/storing it');
select is(api_v1.request_booking_recovery_v1(repeat('x',1048576),'client','bounded@example.invalid',gen_random_uuid()),
  '{"contractVersion":1,"outcome":"accepted"}'::jsonb,'B3 oversized route selector has the same acknowledgment without routing work');
select is(api_v1.request_booking_recovery_v1('client.tenant-a.example.invalid','client','malformed',gen_random_uuid()),
  '{"contractVersion":1,"outcome":"accepted"}'::jsonb,'B3 malformed email does not require an unbounded denial receipt');
reset role;
select is((select count(*)::int from app.booking_recovery_requests),0,'B3 oversized/malformed input allocates no queue state');
select is((select count(*)::int from app.management_access_events where action='recovery_requested'),0,
  'B3 oversized/malformed input allocates no per-request audit state');

set local role anon;
select is(api_v1.request_booking_recovery_v1('client.tenant-a.example.invalid','client',
  '  GUEST.D@EXAMPLE.INVALID  ','e5000000-0000-0000-0000-000000000001'),
  '{"contractVersion":1,"outcome":"accepted"}'::jsonb,'R5 known normalized email returns only the uniform acknowledgment');
select is(api_v1.request_booking_recovery_v1('client.tenant-a.example.invalid','client',
  'unknown@example.invalid','e5000000-0000-0000-0000-000000000002'),
  '{"contractVersion":1,"outcome":"accepted"}'::jsonb,'R5 unknown email has the identical result');
select is(api_v1.request_booking_recovery_v1('client.tenant-a.example.invalid','client',
  'not an email','e5000000-0000-0000-0000-000000000003'),
  '{"contractVersion":1,"outcome":"accepted"}'::jsonb,'R5 ineligible input has the identical result');
select is(api_v1.request_booking_recovery_v1('client.tenant-b.example.invalid','client',
  'guest.d@example.invalid','e5000000-0000-0000-0000-000000000004'),
  '{"contractVersion":1,"outcome":"accepted"}'::jsonb,'R5 another tenant has the identical acknowledgment');
select is(api_v1.request_booking_recovery_v1('unverified.example.invalid','client',
  'guest.d@example.invalid','e5000000-0000-0000-0000-000000000005'),
  '{"contractVersion":1,"outcome":"accepted"}'::jsonb,'R5 unverified routing fails closed without an existence response');
select is(api_v1.request_booking_recovery_v1('client.tenant-a.example.invalid','client',
  'guest.d@example.invalid','e5000000-0000-0000-0000-000000000001'),
  '{"contractVersion":1,"outcome":"accepted"}'::jsonb,'R5 duplicate submit is equally acknowledged');
reset role;
select is((select count(*)::int from app.booking_recovery_requests where request_id='e5000000-0000-0000-0000-000000000001'),1,
  'R5 duplicate request enqueues one digest intent');
select is((select count(*)::int from app.management_tokens),0,'R5 no credential is minted during submission');
select ok(not exists(select 1 from app.booking_recovery_requests q where to_jsonb(q)::text like '%guest.d@%'),
  'R5 queue carries no raw email, booking list or token');
select is((select count(*)::int from app.management_access_events where action='recovery_requested' and booking_id is not null),0,
  'R5 submission audit does not encode whether a matching booking exists');

select private.process_booking_recovery_v1(20);
select is((select count(*)::int from app.notification_messages where variant='recovery:e5000000-0000-0000-0000-000000000001'),2,
  'R5 multiple eligible bookings create separate notification intents');
select is((select count(*)::int from app.notification_messages where variant in (
  'recovery:e5000000-0000-0000-0000-000000000002','recovery:e5000000-0000-0000-0000-000000000004')),0,
  'R5 unknown and other-tenant email create no messages');
select is((select count(*)::int from app.notification_messages where booking_id=current_setting('test.closed_booking')::uuid),0,
  'R5 expired/terminal lifecycle cannot be recovered');
select ok(not exists(select 1 from app.notification_messages where payload ? 'token' or payload ? 'manage_url'),
  'R5 ordinary notification queue persists no bearer');
create temp table recovery_claim as select * from private.claim_notification_batch_v1(20,120);
select is((select count(*)::int from recovery_claim),2,'R5 existing worker claims both scoped emails');
select is((select count(distinct payload->>'manage_url')::int from recovery_claim),2,
  'R5 each booking has a distinct management link, not an account session');
select is((select count(*)::int from app.management_tokens where intent='view'),2,
  'R5 recovery mints only existing single-booking view credentials at delivery time');
select ok(not exists(select 1 from app.management_tokens where token_hash in
  (select split_part(payload->>'manage_url','token=',2) from recovery_claim)),
  'R5 token storage is hashed only');
select lives_ok($$select * from private.record_notification_attempt_v1(
  (select message_id from recovery_claim where booking_id=current_setting('test.booking')::uuid),1,
  'retryable_error',statement_timestamp(),null,'provider_unavailable')$$,
  'R5 provider outage follows the existing durable retry path');
select is((select status from app.bookings where id=current_setting('test.booking')::uuid),'confirmed',
  'R5 provider outage never changes booking truth');
select ok((select next_attempt_at>statement_timestamp() from app.notification_messages where id=
  (select message_id from recovery_claim where booking_id=current_setting('test.booking')::uuid)),
  'R5 a provider outage keeps a scheduled retry instead of exposing match/delivery state to the requester');

-- R9 uses the same caller-scoped table policies as the existing details RPC.
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is(api_v1.get_booking_context_v1('a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid)#>>'{intake,answers,reason}',
  'Quiet room','R9 permitted staff sees the submitted intake answer');
select is(api_v1.get_booking_context_v1('a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid)#>>'{intake,schema,fields,0,label}',
  'Reason','R9 intake labels come from the immutable booking snapshot');
select is(jsonb_array_length(api_v1.get_booking_context_v1('a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid)#>'{customer,history}'),2,
  'R9 permitted related history is scoped to this customer and excludes the current booking');
reset role;
update app.catalog_service_revisions set intake_schema='{"fields":[]}'
  where service_id='a7200000-0000-0000-0000-000000000001';
set local role authenticated;
select is(api_v1.get_booking_context_v1('a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid)#>>'{intake,schema,fields,0,label}',
  'Reason','R9 later catalog edits do not rewrite the request snapshot');
reset role;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
insert into app.roles(id,tenant_id,key,location_scope_mode,name_en,name_ar)
  values('e5900000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','custom_e590000000000001','tenant','Calendar only','التقويم فقط');
insert into app.role_permissions(tenant_id,role_id,permission_key,grant_kind,scope_kind)
  values('a0000000-0000-0000-0000-000000000001','e5900000-0000-0000-0000-000000000001','booking.view.any','direct','tenant');
update app.memberships set role_id='e5900000-0000-0000-0000-000000000001' where id='a3000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is(api_v1.get_booking_context_v1('a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid)->>'contactAccess',
  'restricted','R9 visible bookings without PII authority show an explicit contact restriction');
select is(api_v1.get_booking_context_v1('a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid)->'intake',
  '{"access":"restricted"}'::jsonb,'R9 denied intake has no schema/answer payload');
select is(api_v1.get_booking_context_v1('a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid)->'customer',
  '{"access":"restricted"}'::jsonb,'R9 denied customer history has no identifier/list');
reset role;

-- R9: processing restriction and erasure fail closed in the RPC even for a role
-- that holds customer PII authority; the contact row survives both, so presence
-- alone must never be treated as an access decision.
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select set_config('test.r9_customer', (api_v1.get_booking_context_v1('a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid)#>>'{customer,customerId}'), true);
reset role;
savepoint r9_privacy_fixture;
update app.customers
  set restricted_at=statement_timestamp(), restriction_reason='processing restriction test'
  where id = current_setting('test.r9_customer')::uuid;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is(api_v1.get_booking_context_v1('a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid)->>'contactAccess',
  'restricted','R9 restricted customer context exposes no contact access');
select is(api_v1.get_booking_context_v1('a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid)->'intake',
  '{"access":"restricted"}'::jsonb,'R9 restricted customer context has no intake answer payload');
select is(api_v1.get_booking_context_v1('a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid)->'customer',
  '{"access":"restricted"}'::jsonb,'R9 restricted customer context has no customer identifier or history');
reset role;
update app.customers
  set restricted_at=null, restriction_reason=null,
      erased_at=statement_timestamp(), full_name=null, email=null, phone=null, tags='{}'::text[]
  where id = current_setting('test.r9_customer')::uuid;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is(api_v1.get_booking_context_v1('a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid)->>'contactAccess',
  'restricted','R9 erased customer context exposes no contact access');
select is(api_v1.get_booking_context_v1('a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid)->'intake',
  '{"access":"restricted"}'::jsonb,'R9 erased customer context has no intake answer payload');
select is(api_v1.get_booking_context_v1('a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid)->'customer',
  '{"access":"restricted"}'::jsonb,'R9 erased customer context has no customer identifier or history');
reset role;
rollback to savepoint r9_privacy_fixture;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);

update app.memberships set status='revoked',revoked_at=statement_timestamp() where id='a3000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(api_v1.get_booking_context_v1('a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid),null::jsonb,
  'R9 stale revoked membership reads no booking context');
reset role;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is(api_v1.get_booking_context_v1('a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid),null::jsonb,
  'R9 other-tenant guessed booking ID reads no context');
reset role;

-- Canonical correction revokes old links and changes delivery, not snapshots.
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
-- The correction path keeps the existing optimistic-concurrency guard: a stale
-- read must still be rejected as 23505 revision_conflict before the real edit.
select throws_ok(
  format($$select * from api_v1.correct_customer_v1('a0000000-0000-0000-0000-000000000001',%L,99,'Guest D','corrected@example.invalid',null,'en','{}'::text[])$$,
    api_v1.get_booking_customer_v1('a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid)),
  '23505','revision_conflict','R5 correction against a stale revision is refused');
-- Obtain the caller-authorized current revision instead of assuming revision 1:
-- three bookings canonicalize the customer and bump revision before this call.
select lives_ok($$select * from api_v1.correct_customer_v1('a0000000-0000-0000-0000-000000000001',
  api_v1.get_booking_customer_v1('a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid),
  (select c.revision from app.customers c
     where c.id = api_v1.get_booking_customer_v1('a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid)),
  'Guest D','corrected@example.invalid',null,'en','{}'::text[])$$,'R5 existing verified correction changes the canonical contact');
reset role;
select set_config('request.jwt.claims',null,true);
select is((select email from app.booking_contacts where booking_id=current_setting('test.booking')::uuid),
  'guest.d@example.invalid','R5 canonical correction preserves historical contact snapshots');
select is((select outcome from api_v1.redeem_management_token_v1('client.tenant-a.example.invalid','client',
  (select split_part(payload->>'manage_url','token=',2) from recovery_claim where booking_id=current_setting('test.booking')::uuid),'view')),
  'unavailable','R5 correction revokes the prior recovery bearer');
select api_v1.request_booking_recovery_v1('client.tenant-a.example.invalid','client','guest.d@example.invalid','e5000000-0000-0000-0000-000000000006');
select api_v1.request_booking_recovery_v1('client.tenant-a.example.invalid','client','corrected@example.invalid','e5000000-0000-0000-0000-000000000007');
select private.process_booking_recovery_v1(20);
select is((select count(*)::int from app.notification_messages where variant='recovery:e5000000-0000-0000-0000-000000000006'),0,
  'R5 old snapshot email cannot recover a corrected customer');
create temp table corrected_claim as select * from private.claim_notification_batch_v1(20,120);
select is((select count(*)::int from corrected_claim where recipient_email='corrected@example.invalid'),2,
  'R5 each separate recovery email goes to the current canonical address');

do $$ declare v_result record; begin
  select * into v_result from api_v1.request_management_action_v1('client.tenant-a.example.invalid','client',
    (select split_part(payload->>'manage_url','token=',2) from corrected_claim where booking_id=current_setting('test.booking')::uuid),'cancel');
  perform set_config('test.recovery_action',v_result.token,true);
end $$;
select is((select outcome from api_v1.act_on_management_link_v1('client.tenant-a.example.invalid','client',
  current_setting('test.recovery_action'),'cancel',1)),'unavailable','R5 recovered action still requires OTP');
select is((select outcome from api_v1.redeem_management_token_v1('client.tenant-b.example.invalid','client',
  current_setting('test.recovery_action'),'cancel')),'unavailable','R5 recovered action is tenant-scoped');
select is((select outcome from api_v1.redeem_management_token_v1('client.tenant-a.example.invalid','client',
  current_setting('test.recovery_action'),'reschedule')),'unavailable','R5 action intent cannot be forged');
do $$ declare v_code text; begin
  select code into v_code from private.mint_management_otp_code_v1((select o.id from app.management_otps o join app.management_tokens t on t.id=o.token_id
    where t.booking_id=current_setting('test.booking')::uuid and t.intent='cancel' and t.revoked_at is null));
  perform set_config('test.recovery_otp',v_code,true);
end $$;
savepoint recovery_otp_expiry;
update app.management_otps set expires_at=statement_timestamp()-interval '1 second'
  where token_id in (select id from app.management_tokens where booking_id=current_setting('test.booking')::uuid and intent='cancel');
select is((select verified from api_v1.verify_management_otp_v1('client.tenant-a.example.invalid','client',
  current_setting('test.recovery_action'),current_setting('test.recovery_otp'))),false,'R5 an expired OTP cannot authorize recovered management');
rollback to savepoint recovery_otp_expiry;
select is((select verified from api_v1.verify_management_otp_v1('client.tenant-a.example.invalid','client',
  current_setting('test.recovery_action'),current_setting('test.recovery_otp'))),true,'R5 existing worker-minted OTP verifies the scoped action');
select is((select verified from api_v1.verify_management_otp_v1('client.tenant-a.example.invalid','client',
  current_setting('test.recovery_action'),current_setting('test.recovery_otp'))),false,'R5 OTP verification cannot be replayed');
select is((select outcome from api_v1.act_on_management_link_v1('client.tenant-a.example.invalid','client',
  current_setting('test.recovery_action'),'cancel',1)),'applied','R5 recovered action uses the existing atomic transition');
select is((select outcome from api_v1.act_on_management_link_v1('client.tenant-a.example.invalid','client',
  current_setting('test.recovery_action'),'cancel',2)),'unavailable','R5 action cannot be replayed');
update app.management_tokens set expires_at=statement_timestamp()-interval '1 second'
  where booking_id=current_setting('test.second_booking')::uuid and intent='view';
select is((select outcome from api_v1.redeem_management_token_v1('client.tenant-a.example.invalid','client',
  (select split_part(payload->>'manage_url','token=',2) from corrected_claim where booking_id=current_setting('test.second_booking')::uuid),'view')),
  'unavailable','R5 recovered view expires under the existing TTL');

-- Match-independent limits apply to unknown email and missing IP as well.
savepoint recovery_suppression;
insert into app.notification_suppressions(tenant_id,recipient_hash,reason)
  select tenant_id,email_hash,'manual' from app.customers where email='corrected@example.invalid';
select is(api_v1.request_booking_recovery_v1('client.tenant-a.example.invalid','client','corrected@example.invalid',
  'e5000000-0000-0000-0000-000000000008'),'{"contractVersion":1,"outcome":"accepted"}'::jsonb,
  'R5 suppression never changes the public recovery outcome');
select private.process_booking_recovery_v1(20);
select is((select status from app.notification_messages where variant='recovery:e5000000-0000-0000-0000-000000000008'),
  'suppressed','R5 canonical suppression is retained in the existing notification ledger');
rollback to savepoint recovery_suppression;
savepoint recovery_restriction;
update app.customers set restricted_at=now(),restriction_reason='Synthetic restricted processing'
  where email='corrected@example.invalid';
select api_v1.request_booking_recovery_v1('client.tenant-a.example.invalid','client','corrected@example.invalid',
  'e5000000-0000-0000-0000-000000000009');
select private.process_booking_recovery_v1(20);
select is((select count(*)::int from app.notification_messages where variant='recovery:e5000000-0000-0000-0000-000000000009'),0,
  'R5 restricted canonical customers cannot be recovered');
rollback to savepoint recovery_restriction;
do $$ begin for n in 1..4 loop
  perform api_v1.request_booking_recovery_v1('client.tenant-a.example.invalid','client','rate-probe@example.invalid',gen_random_uuid());
end loop; end $$;
select is((select count(*)::int from app.booking_recovery_requests where email_hash=encode(sha256(convert_to(
  'a0000000-0000-0000-0000-000000000001:rate-probe@example.invalid','UTF8')),'hex') and deliver),3,
  'R5 email budget is enforced even when there are no bookings');
select is((select count(*)::int from app.booking_recovery_requests where email_hash=encode(sha256(convert_to(
  'a0000000-0000-0000-0000-000000000001:rate-probe@example.invalid','UTF8')),'hex')),3,
  'B3 excess email submissions persist neither disabled requests nor delivery receipts');

do $$ begin for n in 1..25 loop
  perform api_v1.request_booking_recovery_v1('client.tenant-a.example.invalid','client','ip-'||n||'@example.invalid',gen_random_uuid());
end loop; end $$;
select ok((select count(*)::int from app.booking_recovery_requests where tenant_id='a0000000-0000-0000-0000-000000000001' and deliver)<=20,
  'R5 distinct emails share an independent IP/action budget even with missing metadata');
select is((select count(*)::int from app.booking_recovery_requests where tenant_id='a0000000-0000-0000-0000-000000000001'),20,
  'B3 missing IP bucket bounds total stored requests, including denied delivery attempts');
select is((select count(*)::int from app.management_access_events where tenant_id='a0000000-0000-0000-0000-000000000001'
  and action='recovery_requested'),20,'B3 missing IP bucket also bounds audit writes');

do $$ begin for n in 1..110 loop
  perform set_config('request.headers',jsonb_build_object('x-forwarded-for','198.51.100.'||n)::text,true);
  perform api_v1.request_booking_recovery_v1('client.tenant-a.example.invalid','client','tenant-'||n||'@example.invalid',gen_random_uuid());
end loop; end $$;
select ok((select count(*)::int from app.booking_recovery_requests where tenant_id='a0000000-0000-0000-0000-000000000001' and deliver)<=100,
  'R5 varying IP/email cannot exceed the independent tenant/action budget');
select is((select count(*)::int from app.booking_recovery_requests where tenant_id='a0000000-0000-0000-0000-000000000001'),100,
  'B3 tenant admission budget caps persisted requests, not just deliver=true');
select is((select count(*)::int from app.management_access_events where tenant_id='a0000000-0000-0000-0000-000000000001'
  and action='recovery_requested'),100,'B3 tenant admission budget caps persisted audits');
set local role anon;
do $$ begin for n in 1..1000 loop
  perform set_config('request.headers',jsonb_build_object('x-forwarded-for','203.0.113.'||(n%250+1))::text,true);
  if api_v1.request_booking_recovery_v1('client.tenant-a.example.invalid','client','excess-'||n||'@example.invalid',gen_random_uuid())
    <> '{"contractVersion":1,"outcome":"accepted"}'::jsonb then raise exception 'nonuniform_recovery_acknowledgment'; end if;
end loop; end $$;
select is(api_v1.request_booking_recovery_v1('client.tenant-a.example.invalid','client','guest.d@example.invalid',
  'e5000000-0000-0000-0000-000000000001'),'{"contractVersion":1,"outcome":"accepted"}'::jsonb,
  'B3 admitted UUID replay is still uniform after every admission budget is exhausted');
reset role;
select is((select count(*)::int from app.booking_recovery_requests where tenant_id='a0000000-0000-0000-0000-000000000001'),100,
  'B3 a thousand excess UUID/email/IP submissions leave request storage bounded');
select is((select count(*)::int from app.management_access_events where tenant_id='a0000000-0000-0000-0000-000000000001'
  and action='recovery_requested'),100,'B3 a thousand excess submissions allocate no audit rows');
select ok(not exists(select 1 from app.booking_recovery_requests q where to_jsonb(q)::text ~ '(@|203\.0\.113\.)') and
  not exists(select 1 from app.management_access_events e where e.action='recovery_requested' and to_jsonb(e)::text ~ '(@|203\.0\.113\.)'),
  'B3 even sustained abusive traffic persists no raw email or network PII');
select is((select count(*)::int from app.booking_recovery_requests where tenant_id='b0000000-0000-0000-0000-000000000001'),1,
  'B3 tenant A abuse never consumes or changes tenant B storage budget');

select is(api_v1.request_booking_recovery_v1('client.tenant-a.example.invalid','client','corrected@example.invalid',gen_random_uuid()),
  '{"contractVersion":1,"outcome":"accepted"}'::jsonb,'R5 rate refusal still has identical public body/status semantics');
insert into app.booking_recovery_requests(tenant_id,request_id,email_hash,actor_hash,deliver,created_at)
  values('a0000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000010',repeat('a',64),repeat('b',64),false,
    statement_timestamp()-interval '8 days');
select ok(private.prune_booking_recovery_requests_v1(1000)>0,'R5 digest retention runs without provider access');
select is((select count(*)::int from app.booking_recovery_requests where request_id='e5000000-0000-0000-0000-000000000010'),0,
  'R5 old digest-only requests are removed by bounded private maintenance');
select _set('curr_test',(select last_value::integer from __tresults___numb_seq));
select * from finish();
rollback;
