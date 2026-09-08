begin;
select no_plan();

-- Issue #14. Manage-booking links: scope, expiry, revocation, replay, wrong
-- host, cross-tenant, rate limiting, step-up, enumeration resistance, and the
-- audit trail. ADR-0004 is the contract these assertions check.

select set_config('test.link_day',
  (date_trunc('week',statement_timestamp() at time zone 'America/New_York')::date+14)::text,true);
create function pg_temp.link_time(p_time time)
returns timestamptz language sql stable as $$
  select (current_setting('test.link_day')::date+p_time) at time zone 'America/New_York';
$$;
do $$ begin
  execute format('grant usage on schema %I to authenticated',pg_my_temp_schema()::regnamespace::text);
end $$;

select has_table('app'::name,'management_tokens'::name);
select has_table('app'::name,'management_otps'::name);
select has_table('app'::name,'management_access_events'::name);
select ok((select relrowsecurity from pg_class where oid='app.management_tokens'::regclass),'tokens require RLS');
select ok((select relrowsecurity from pg_class where oid='app.management_otps'::regclass),'step-up challenges require RLS');
select ok((select relrowsecurity from pg_class where oid='app.management_access_events'::regclass),'the security trail requires RLS');
select ok(not exists(
  select 1 from (values ('anon'),('authenticated')) principals(role_name)
  cross join (values ('app.management_tokens'),('app.management_otps')) tables(table_name)
  cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) commands(privilege)
  where has_table_privilege(principals.role_name,tables.table_name,commands.privilege)
),'no application role reads or writes link state directly');
select ok(not has_function_privilege('anon','private.issue_management_token_v1(uuid,uuid,text,uuid)','execute')
  and not has_function_privilege('authenticated','private.issue_management_token_v1(uuid,uuid,text,uuid)','execute'),
  'only the platform issues a link');
select ok(not has_function_privilege('anon','private.mint_management_otp_code_v1(uuid)','execute')
  and not has_function_privilege('authenticated','private.mint_management_otp_code_v1(uuid)','execute'),
  'only the notification worker mints a step-up code');
select has_function('api_v1'::name,'redeem_management_token_v1'::name,array['text','text','text','text']);
select has_function('api_v1'::name,'request_management_otp_v1'::name,array['text','text','text']);
select has_function('api_v1'::name,'verify_management_otp_v1'::name,array['text','text','text','text']);
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='api_v1' and p.prosecdef and p.proname like '%management%'),
  'every exposed link wrapper is security invoker');

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
  'a5000000-0000-0000-0000-000000000001',pg_temp.link_time('10:00'),
  'session-token-aaaa-0001','idempotency-key-aaaa-0001') h),true);
select set_config('test.booking',(select b.booking_id::text from api_v1.confirm_booking_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.hold')::uuid,
  'session-token-aaaa-0001','confirm-key-aaaa-0001',
  '{"fullName":"Guest A","email":"guest@example.invalid"}'::jsonb,
  '1','en','{}'::jsonb,'Asia/Riyadh') b),true);

select set_config('test.view_token',(select i.token from private.issue_management_token_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid,'view') i),true);
select matches(current_setting('test.view_token'),'^[0-9a-f]{64}$',
  'the link carries well over the required entropy as opaque hex');
select ok(not exists(select 1 from app.management_tokens t
  where t.token_hash = current_setting('test.view_token')),
  'the plaintext link is never stored, only its digest');

select is((select array[r.outcome,r.intent,r.public_reference,r.step_up_required::text,r.step_up_verified::text]
  from api_v1.redeem_management_token_v1('client.tenant-a.example.invalid','client',
    current_setting('test.view_token'),'view') r),
  array['granted','view',
    (select b.public_reference from app.bookings b where b.id=current_setting('test.booking')::uuid),
    'false','false'],
  'a live view link grants exactly its own booking without step-up');
select is((select r.outcome from api_v1.redeem_management_token_v1('client.tenant-a.example.invalid','client',
    current_setting('test.view_token'),'view') r),'granted',
  'a view link is reusable inside its lifetime');
select is((select array[r.can_reschedule::text,r.can_cancel::text]
  from api_v1.redeem_management_token_v1('client.tenant-a.example.invalid','client',
    current_setting('test.view_token'),'view') r),
  array['true','true'],
  'eligibility is computed from the snapshotted policy, not the current one');

-- Enumeration resistance: every refusal is the same answer.
select is((select r.outcome from api_v1.redeem_management_token_v1('client.tenant-a.example.invalid','client',
    current_setting('test.view_token'),'cancel') r),'unavailable',
  'a view link can never be replayed as an action link');
select is((select r.outcome from api_v1.redeem_management_token_v1('client.tenant-b.example.invalid','client',
    current_setting('test.view_token'),'view') r),'unavailable',
  'another tenant host resolves a valid link to nothing');
select is((select r.outcome from api_v1.redeem_management_token_v1('preview.tenant-a.example.invalid','client',
    current_setting('test.view_token'),'view') r),'unavailable',
  'an unverified host resolves a valid link to nothing');
select is((select r.outcome from api_v1.redeem_management_token_v1('client.tenant-a.example.invalid','client',
    repeat('a',64),'view') r),'unavailable',
  'an unknown link is answered exactly like an expired one');
select is((select r.outcome from api_v1.redeem_management_token_v1('client.tenant-a.example.invalid','client',
    'not-a-token','view') r),'unavailable',
  'a malformed link is answered exactly like an unknown one');
select ok(not exists(
  select 1 from api_v1.redeem_management_token_v1('client.tenant-a.example.invalid','client',
    repeat('a',64),'view') r
  where r.booking_id is not null or r.public_reference is not null or r.status is not null),
  'a refusal carries no booking field at all');

-- Refusals persist their audit trail, which is what makes rate limiting real.
select ok((select count(*) from app.management_access_events e where e.action='denied' and e.outcome='failed')>=4,
  'every refusal is recorded rather than rolled back with an exception');
select ok(not exists(select 1 from app.management_access_events e
  where e.id::text like '%'||current_setting('test.view_token')||'%'),
  'the security trail never contains the link itself');

-- Step-up: an action link is granted but unverified, and the code is minted by
-- the worker rather than written here.
select set_config('test.cancel_token',(select i.token from private.issue_management_token_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid,'cancel') i),true);
select is((select array[r.outcome,r.step_up_required::text,r.step_up_verified::text]
  from api_v1.redeem_management_token_v1('client.tenant-a.example.invalid','client',
    current_setting('test.cancel_token'),'cancel') r),
  array['granted','true','false'],'an action link requires step-up before it may act');
select is((select o.outcome from api_v1.request_management_otp_v1('client.tenant-a.example.invalid','client',
    current_setting('test.view_token')) o),'unavailable',
  'a view link cannot request a step-up code');
select is((select o.outcome from api_v1.request_management_otp_v1('client.tenant-a.example.invalid','client',
    current_setting('test.cancel_token')) o),'sent',
  'an action link requests a code');
select ok((select o.code_hash is null from app.management_otps o),
  'the challenge exists before any code does');
select ok(not exists(select 1 from app.outbox_events o
  where o.topic='management.otp_requested' and o.payload ? 'code'),
  'the delivery intent references the challenge and never carries a code');
select is((select v.verified from api_v1.verify_management_otp_v1('client.tenant-a.example.invalid','client',
    current_setting('test.cancel_token'),'123456') v),false,
  'no code can verify before the worker mints one');
select set_config('test.code',(select m.code from private.mint_management_otp_code_v1(
  (select o.id from app.management_otps o where o.verified_at is null)) m),true);
select matches(current_setting('test.code'),'^[0-9]{6}$','the minted code is six digits');
select is((select v.verified from api_v1.verify_management_otp_v1('client.tenant-a.example.invalid','client',
    current_setting('test.cancel_token'),'000000') v),false,
  'a wrong code never verifies');
select is((select o.attempts from app.management_otps o),1,
  'a wrong code costs an attempt, which is what makes lockout possible');
select is((select v.verified from api_v1.verify_management_otp_v1('client.tenant-a.example.invalid','client',
    current_setting('test.cancel_token'),current_setting('test.code')) v),true,
  'the right code verifies once');
select is((select array[r.step_up_required::text,r.step_up_verified::text]
  from api_v1.redeem_management_token_v1('client.tenant-a.example.invalid','client',
    current_setting('test.cancel_token'),'cancel') r),
  array['true','true'],'the verified step-up is visible to the action surface');

savepoint step_up_lockout;
select set_config('test.locked_token',(select i.token from private.issue_management_token_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid,'reschedule') i),true);
select is((select o.outcome from api_v1.request_management_otp_v1('client.tenant-a.example.invalid','client',
  current_setting('test.locked_token')) o),'sent','a second intent gets its own challenge');
select set_config('test.locked_code',(select m.code from private.mint_management_otp_code_v1(
  (select o.id from app.management_otps o
   join app.management_tokens t on t.id=o.token_id
   where o.verified_at is null and t.intent='reschedule')) m),true);
do $lockout$
begin
  for i in 1..5 loop
    perform v.verified from api_v1.verify_management_otp_v1(
      'client.tenant-a.example.invalid','client',current_setting('test.locked_token'),'000001') v;
  end loop;
end;
$lockout$;
select is((select v.verified from api_v1.verify_management_otp_v1('client.tenant-a.example.invalid','client',
    current_setting('test.locked_token'),current_setting('test.locked_code')) v),false,
  'the right code stops working once the attempt ceiling is reached');
rollback to savepoint step_up_lockout;

-- Superseding and revocation.
savepoint link_superseded;
select set_config('test.newer_token',(select i.token from private.issue_management_token_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid,'view') i),true);
select is((select r.outcome from api_v1.redeem_management_token_v1('client.tenant-a.example.invalid','client',
    current_setting('test.view_token'),'view') r),'unavailable',
  'issuing a newer link of the same intent retires the forwarded older one');
select is((select r.outcome from api_v1.redeem_management_token_v1('client.tenant-a.example.invalid','client',
    current_setting('test.newer_token'),'view') r),'granted','the newer link works');
rollback to savepoint link_superseded;

savepoint link_revocation;
update app.bookings set status='cancelled', revision=revision+1
where id=current_setting('test.booking')::uuid;
select is((select r.outcome from api_v1.redeem_management_token_v1('client.tenant-a.example.invalid','client',
    current_setting('test.view_token'),'view') r),'unavailable',
  'a booking state change revokes every outstanding link');
select ok((select count(*) from app.management_tokens t
  where t.revoked_reason='booking_state_changed')>=2,
  'revocation is recorded with its reason, not left to the lifetime');
rollback to savepoint link_revocation;

savepoint link_expiry;
update app.management_tokens set expires_at=statement_timestamp()-interval '1 second';
select is((select r.outcome from api_v1.redeem_management_token_v1('client.tenant-a.example.invalid','client',
    current_setting('test.view_token'),'view') r),'unavailable','an elapsed link stops working');
select ok((select e.expired_tokens from private.expire_management_links_v1() e)>=2,
  'the batched job retires elapsed links');
select is((select e.expired_tokens from private.expire_management_links_v1() e),0,
  'a second run retires the same links a second time for nobody');
rollback to savepoint link_expiry;

-- The security trail is readable only by a member with the audit capability.
savepoint link_audit;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select ok((select count(*) from app.management_access_events)>0,
  'a tenant administrator with audit.read reads the trail');
reset role;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select count(*)::integer from app.management_access_events),0,
  'a member without audit.read reads none of it');
reset role;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select count(*)::integer from app.management_access_events),0,
  'another tenant reads none of it');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint link_audit;

-- A link for a booking in another tenant can never be minted against this one.
select is((select count(*)::integer from app.management_tokens t
  where t.tenant_id <> (select b.tenant_id from app.bookings b where b.id=t.booking_id)),
  0,'every token belongs to the tenant of the booking it manages');
select throws_ok(
  format($$select * from private.issue_management_token_v1('b0000000-0000-0000-0000-000000000001',%L,'view')$$,
    current_setting('test.booking')),
  '42501','management_link_unavailable','another tenant cannot mint a link for this booking');

select _set('curr_test',(select last_value::integer from __tresults___numb_seq));
select * from finish();

rollback;
