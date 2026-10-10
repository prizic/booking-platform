begin;
select no_plan();

-- Management integration: a guest holding only the emailed `view` link can
-- reach cancel/reschedule. Production mints only `view` links and OTP request
-- refuses them, so `api_v1.request_management_action_v1` exchanges a live
-- `view` link for that intent's own action token plus a step-up challenge on
-- the EXISTING `management.otp_requested` delivery path. ADR-0004 and J3/J5
-- are the contract these assertions check. No new email type, no new outbox
-- topic, no authority change: acting still needs the verified OTP.

select set_config('test.issue_day',
  (date_trunc('week',statement_timestamp() at time zone 'America/New_York')::date+14)::text,true);
create function pg_temp.issue_time(p_time time)
returns timestamptz language sql stable as $$
  select (current_setting('test.issue_day')::date+p_time) at time zone 'America/New_York';
$$;
do $$ begin
  execute format('grant usage on schema %I to authenticated',pg_my_temp_schema()::regnamespace::text);
end $$;

select has_function('api_v1'::name,'request_management_action_v1'::name,
  array['text','text','text','text']);
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='api_v1' and p.proname='request_management_action_v1' and p.prosecdef),
  'the exposed issuance wrapper is security invoker');
select ok(has_function_privilege('anon','api_v1.request_management_action_v1(text,text,text,text)','execute')
  and has_function_privilege('authenticated','api_v1.request_management_action_v1(text,text,text,text)','execute'),
  'a guest without a session can exchange the emailed link');
select ok(has_function_privilege('anon','private.request_management_action_v1(text,text,text,text)','execute')
  and has_function_privilege('authenticated','private.request_management_action_v1(text,text,text,text)','execute'),
  'the self-authorizing issuance logic is reachable to guests like its redeem/otp/verify/act siblings');

-- Privilege proof under the real roles, not superuser: an unknown link runs
-- the whole wrapper chain as anon/authenticated and answers `unavailable`,
-- never a 42501 permission error. `reset role` returns every later step to
-- the fixture owner the inserts below need.
set local role anon;
select is((select q.outcome from api_v1.request_management_action_v1(
    'client.tenant-a.example.invalid','client',repeat('a',64),'cancel') q),'unavailable',
  'anon executes the issuance wrapper without a privilege error');
reset role;
set local role authenticated;
select is((select q.outcome from api_v1.request_management_action_v1(
    'client.tenant-a.example.invalid','client',repeat('b',64),'cancel') q),'unavailable',
  'an authenticated caller executes the issuance wrapper without a privilege error');
reset role;

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
set policy=jsonb_build_object('consent_version','1','consent_text','Terms.')
where tenant_id='a0000000-0000-0000-0000-000000000001' and service_id='a7200000-0000-0000-0000-000000000001';
select set_config('test.hold',(select h.hold_id::text from api_v1.create_hold_v1(
  'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.issue_time('10:00'),
  'session-token-dddd-0001','idempotency-key-dddd-0001') h),true);
select set_config('test.booking',(select b.booking_id::text from api_v1.confirm_booking_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.hold')::uuid,
  'session-token-dddd-0001','confirm-key-dddd-0001',
  '{"fullName":"Guest D","email":"guest.d@example.invalid"}'::jsonb,
  '1','en','{}'::jsonb,'Asia/Riyadh') b),true);
select set_config('test.view_token',(select i.token from private.issue_management_token_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid,'view') i),true);

-- The exchange: a live view link yields that intent's own token. Exactly one
-- issuance call runs here, because every call mints: the captured plaintext
-- is the live token every later assertion uses.
select set_config('test.cancel_token',(select q.token from api_v1.request_management_action_v1(
    'client.tenant-a.example.invalid','client',current_setting('test.view_token'),'cancel') q),true);
select matches(current_setting('test.cancel_token'),'^[0-9a-f]{64}$',
  'the issued action link carries opaque hex like every other link');
select ok(not exists(select 1 from app.management_tokens t
  where t.token_hash = current_setting('test.cancel_token')),
  'the issued plaintext is never stored, only its digest');
select is((select array[r.outcome,r.intent,r.step_up_required::text,r.step_up_verified::text]
  from api_v1.redeem_management_token_v1('client.tenant-a.example.invalid','client',
    current_setting('test.cancel_token'),'cancel') r),
  array['granted','cancel','true','false'],
  'the issued token redeems as its own intent and still needs step-up');

-- The step-up challenge already exists on the existing delivery path.
select is((select count(*)::integer from app.management_otps o
  join app.management_tokens t on t.id=o.token_id
  where t.tenant_id='a0000000-0000-0000-0000-000000000001'
    and t.booking_id=current_setting('test.booking')::uuid
    and t.intent='cancel' and o.verified_at is null),1,
  'issuance creates exactly one pending challenge for the action token');
select ok(exists(select 1 from app.outbox_events o
  where o.booking_id=current_setting('test.booking')::uuid
    and o.topic='management.otp_requested' and o.state='pending'),
  'the code is delivered through the existing OTP outbox topic, no new email type');
select ok(not exists(select 1 from app.outbox_events o
  where o.booking_id=current_setting('test.booking')::uuid and o.payload ? 'code'),
  'the delivery intent references the challenge and never carries a code');
-- Exercise the production worker API, not the private test-only shortcut.
select * from private.dispatch_notifications_v1();
-- Claim only the OTP here: claiming the confirmation would issue a newer view
-- link and intentionally supersede the view token the rest of this test uses.
update app.notification_messages set next_attempt_at=statement_timestamp()+interval '1 hour'
where booking_id=current_setting('test.booking')::uuid and template_key<>'management.otp_requested';
create temp table production_claim as select * from private.claim_notification_batch_v1();
select set_config('test.otp_message',(select message_id::text from production_claim
  where template_key='management.otp_requested'),true);
select set_config('test.otp_attempt',(select attempt::text from production_claim
  where template_key='management.otp_requested'),true);
set local role service_role;
select set_config('test.code',(select m.code from api_v1.mint_notification_otp_v1(
  current_setting('test.otp_message')::uuid,current_setting('test.otp_attempt')::integer) m),true);
select matches(current_setting('test.code'),'^[0-9]{6}$','production delivery mints a six-digit OTP');
select is((select e.encrypted_payload from api_v1.prepare_notification_delivery_v1(
  current_setting('test.otp_message')::uuid,current_setting('test.otp_attempt')::integer,
  'guest.d@example.invalid','{}'::jsonb,null) e),
  null::text,'the current worker claim may check for its not-yet-prepared envelope');
select is((select e.encrypted_payload from api_v1.prepare_notification_delivery_v1(
  current_setting('test.otp_message')::uuid,current_setting('test.otp_attempt')::integer,
  'guest.d@example.invalid','{}'::jsonb,repeat('x',64)) e),
  repeat('x',64),'the worker stores ciphertext for its current message');
select is((select e.encrypted_payload from api_v1.prepare_notification_delivery_v1(
  current_setting('test.otp_message')::uuid,current_setting('test.otp_attempt')::integer,
  'guest.d@example.invalid','{}'::jsonb,repeat('y',64)) e),
  repeat('x',64),'a second write cannot change content under the same provider key');
select throws_ok($$select * from api_v1.mint_notification_otp_v1(
  current_setting('test.otp_message')::uuid,current_setting('test.otp_attempt')::integer)$$,
  '42501','notification_delivery_unavailable','a prepared OTP is never regenerated');
select throws_ok($$select * from api_v1.prepare_notification_delivery_v1(
  current_setting('test.otp_message')::uuid,current_setting('test.otp_attempt')::integer+1,
  'guest.d@example.invalid','{}'::jsonb,null)$$,
  '42501','notification_delivery_unavailable','an unclaimed attempt cannot read ciphertext');
reset role;
select ok((select relrowsecurity from pg_class where oid='private.notification_delivery_envelopes'::regclass),
  'the private delivery table has RLS enabled');
select ok(not has_table_privilege('service_role','private.notification_delivery_envelopes','select')
  and not has_table_privilege('authenticated','private.notification_delivery_envelopes','select')
  and not has_table_privilege('anon','private.notification_delivery_envelopes','select'),
  'neither app callers nor the worker can bypass the narrow envelope RPC');
savepoint delivery_reclaim;
update app.notification_messages set attempts=attempts+1
where id=current_setting('test.otp_message')::uuid;
set local role service_role;
select is((select e.encrypted_payload from api_v1.prepare_notification_delivery_v1(
  current_setting('test.otp_message')::uuid,current_setting('test.otp_attempt')::integer+1,
  'guest.d@example.invalid','{}'::jsonb,null) e),repeat('x',64),
  'a reclaimed attempt loads the same encrypted provider input');
select throws_ok($$select * from api_v1.prepare_notification_delivery_v1(
  current_setting('test.otp_message')::uuid,current_setting('test.otp_attempt')::integer+1,
  'other@example.invalid','{}'::jsonb,null)$$,'42501','notification_delivery_unavailable',
  'an old or different recipient cannot use the envelope');
reset role;
update private.notification_delivery_envelopes set expires_at=statement_timestamp()-interval '1 second'
where message_id=current_setting('test.otp_message')::uuid;
set local role service_role;
select throws_ok($$select * from api_v1.prepare_notification_delivery_v1(
  current_setting('test.otp_message')::uuid,current_setting('test.otp_attempt')::integer+1,
  'guest.d@example.invalid','{}'::jsonb,repeat('z',64))$$,'42501','notification_delivery_unavailable',
  'expiry fails closed instead of replacing content under an old key');
reset role;
rollback to savepoint delivery_reclaim;
set local role authenticated;
select throws_ok($$select * from api_v1.prepare_notification_delivery_v1(
  current_setting('test.otp_message')::uuid,1,'guest.d@example.invalid','{}'::jsonb,null)$$,'42501',null,
  'an authenticated app caller cannot read delivery ciphertext');
reset role;
select is((select v.verified from api_v1.verify_management_otp_v1('client.tenant-a.example.invalid',
  'client',current_setting('test.cancel_token'),current_setting('test.code')) v),true,
  'the code the worker mints for the issued challenge verifies');

-- Enumeration resistance: every refusal is the same answer.
select is((select q.outcome from api_v1.request_management_action_v1(
    'client.tenant-a.example.invalid','client','not-a-token','cancel') q),'unavailable',
  'a malformed link is answered exactly like an unknown one');
select is((select q.outcome from api_v1.request_management_action_v1(
    'client.tenant-a.example.invalid','client',repeat('a',64),'cancel') q),'unavailable',
  'an unknown link is answered exactly like an expired one');
select is((select q.outcome from api_v1.request_management_action_v1(
    'client.tenant-a.example.invalid','client',current_setting('test.view_token'),'refund_request') q),
  'unavailable','an intent the guest surface does not implement is never minted');
select is((select q.outcome from api_v1.request_management_action_v1(
    'client.tenant-a.example.invalid','client',current_setting('test.view_token'),'view') q),
  'unavailable','a view link cannot be reissued as itself through this path');
select is((select q.outcome from api_v1.request_management_action_v1(
    'client.tenant-a.example.invalid','client',current_setting('test.cancel_token'),'cancel') q),
  'unavailable','an action link can never be chained into another one');
select is((select q.outcome from api_v1.request_management_action_v1(
    'client.tenant-b.example.invalid','client',current_setting('test.view_token'),'cancel') q),
  'unavailable','another tenant host resolves a valid link to nothing');
select ok(not exists(
  select 1 from api_v1.request_management_action_v1(
    'client.tenant-a.example.invalid','client',repeat('a',64),'cancel') q
  where q.token is not null or q.intent is not null or q.expires_at is not null),
  'a refusal carries no link field at all');

-- Eligibility comes from the snapshot, like redemption. The snapshot is
-- immutable once written, so the ineligible booking is confirmed through the
-- real path while the published policy refuses self-service cancel.
savepoint issue_eligibility;
update app.catalog_service_revisions
set policy = policy || '{"cancellation_customer_self_service":false}'::jsonb
where tenant_id='a0000000-0000-0000-0000-000000000001' and service_id='a7200000-0000-0000-0000-000000000001';
select set_config('test.closed_hold',(select h.hold_id::text from api_v1.create_hold_v1(
  'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.issue_time('13:00'),
  'session-token-dddd-0002','idempotency-key-dddd-0002') h),true);
select set_config('test.closed_booking',(select b.booking_id::text from api_v1.confirm_booking_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.closed_hold')::uuid,
  'session-token-dddd-0002','confirm-key-dddd-0002',
  '{"fullName":"Closed Guest","email":"closed@example.invalid"}'::jsonb,
  '1','en','{}'::jsonb,'Asia/Riyadh') b),true);
select set_config('test.closed_view',(select i.token from private.issue_management_token_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.closed_booking')::uuid,'view') i),true);
select is((select q.outcome from api_v1.request_management_action_v1(
    'client.tenant-a.example.invalid','client',current_setting('test.closed_view'),'cancel') q),
  'unavailable','a booking the snapshot keeps from self-service cancel mints nothing');
select is((select r.outcome from api_v1.redeem_management_token_v1('client.tenant-a.example.invalid',
    'client',current_setting('test.closed_view'),'view') r),'granted',
  'the refused exchange leaves the emailed view link itself untouched');
rollback to savepoint issue_eligibility;

-- Each issuance supersedes the last, and the pace is bounded.
savepoint issue_cooldown;
select is((select count(*)::integer from (
    select q.outcome from api_v1.request_management_action_v1(
      'client.tenant-a.example.invalid','client',current_setting('test.view_token'),'reschedule') q
  ) issued where issued.outcome='issued'),1,'a reschedule token is issued on its own intent');
select is((select q.outcome from api_v1.request_management_action_v1(
    'client.tenant-a.example.invalid','client',current_setting('test.view_token'),'reschedule') q),
  'issued','a re-request supersedes rather than duplicates');
select is((select count(*)::integer from app.management_tokens t
  where t.booking_id=current_setting('test.booking')::uuid and t.intent='reschedule'
    and t.consumed_at is null and t.revoked_at is null),1,
  'only the newest action link of an intent stays live');
rollback to savepoint issue_cooldown;

-- The issued link acts through the same transition staff use, once only.
select is((select array[a.outcome,a.status]
  from api_v1.act_on_management_link_v1('client.tenant-a.example.invalid','client',
    current_setting('test.cancel_token'),'cancel',1) a),
  array['applied','cancelled'],
  'the guest cancels through the issued link once the step-up is verified');
select is((select a.outcome from api_v1.act_on_management_link_v1('client.tenant-a.example.invalid',
    'client',current_setting('test.cancel_token'),'cancel',2) a),'unavailable',
  'the action link is consumed, so a replay changes nothing');
select is((select q.outcome from api_v1.request_management_action_v1(
    'client.tenant-a.example.invalid','client',current_setting('test.view_token'),'reschedule') q),
  'unavailable','a booking state change revokes the emailed link, ending issuance');

-- The trail records the exchange without the secret.
select ok((select count(*)::integer from app.management_access_events e
  where e.booking_id=current_setting('test.booking')::uuid
    and e.intent='cancel' and e.action='issued' and e.outcome='succeeded')>=1,
  'every issuance is recorded rather than rolled back with an exception');
select ok((select count(*)::integer from app.management_access_events e
  where e.booking_id=current_setting('test.booking')::uuid
    and e.action='otp_requested' and e.outcome='succeeded')>=1,
  'the automatic step-up request is recorded like a manual one');
select ok(not exists(select 1 from app.management_access_events e
  where e.booking_id=current_setting('test.booking')::uuid
    and (e.id::text like '%'||current_setting('test.cancel_token')||'%')),
  'the security trail never contains the issued link itself');

select _set('curr_test',(select last_value::integer from __tresults___numb_seq));
select * from finish();

rollback;
