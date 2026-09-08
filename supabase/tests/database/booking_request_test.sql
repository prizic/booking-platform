begin;
select no_plan();

-- Issue #13. Request-to-book: the requested state, what a request does to
-- capacity under both ADR-0005 settings, competing staff decisions, proposals
-- and their customer link, SLA expiry, and authority in both directions.

select set_config('test.request_day',
  (date_trunc('week',statement_timestamp() at time zone 'America/New_York')::date+14)::text,true);
create function pg_temp.request_time(p_time time)
returns timestamptz language sql stable as $$
  select (current_setting('test.request_day')::date+p_time) at time zone 'America/New_York';
$$;
do $$ begin
  execute format('grant usage on schema %I to authenticated',pg_my_temp_schema()::regnamespace::text);
end $$;

select has_table('app'::name,'booking_proposals'::name);
select has_column('app'::name,'booking_holds'::name,'purpose'::name,'a hold records why it is holding');
select has_column('app'::name,'bookings'::name,'approval_deadline'::name,'the decision deadline is data on the booking');
select ok((select relrowsecurity from pg_class where oid='app.booking_proposals'::regclass),'proposals require RLS');
select ok(not exists(
  select 1 from (values ('anon'),('authenticated')) principals(role_name)
  cross join (values ('INSERT'),('UPDATE'),('DELETE')) commands(privilege)
  where has_table_privilege(principals.role_name,'app.booking_proposals',commands.privilege)
),'no application role writes proposals directly');
select ok(not has_column_privilege('authenticated','app.booking_proposals','action_token_hash','SELECT'),
  'the proposal token digest is readable by nobody, not even a scoped member');
select has_function('api_v1'::name,'decide_booking_request_v1'::name,
  array['uuid','uuid','text','bigint','text','text','timestamp with time zone','uuid']);
select has_function('api_v1'::name,'respond_to_proposal_v1'::name,array['text','text','text','text']);
select has_function('api_v1'::name,'list_booking_requests_v1'::name,array['uuid']);
select ok(not has_function_privilege('anon','api_v1.decide_booking_request_v1(uuid,uuid,text,bigint,text,text,timestamptz,uuid)','execute'),
  'a guest can never decide a request');
select ok(has_function_privilege('anon','api_v1.respond_to_proposal_v1(text,text,text,text)','execute'),
  'a guest answers a proposal through its intent-scoped link');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='api_v1' and p.prosecdef
    and p.proname in ('decide_booking_request_v1','respond_to_proposal_v1','list_booking_requests_v1')),
  'every exposed request wrapper is security invoker');

-- The holdable fixture, published with approval and a request that reserves
-- capacity, so both ADR-0005 row 34 settings are exercised.
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
set approval_required=true,
    policy=jsonb_build_object('consent_version','1','consent_text','Terms.',
      'request_holds_allocation',true)
where tenant_id='a0000000-0000-0000-0000-000000000001' and service_id='a7200000-0000-0000-0000-000000000001';

select set_config('test.hold',(select h.hold_id::text from api_v1.create_hold_v1(
  'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.request_time('10:00'),
  'session-token-aaaa-0001','idempotency-key-aaaa-0001') h),true);
select set_config('test.booking',(select b.booking_id::text from api_v1.confirm_booking_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.hold')::uuid,
  'session-token-aaaa-0001','confirm-key-aaaa-0001',
  '{"fullName":"Guest A","email":"guest@example.invalid"}'::jsonb,
  '1','en','{}'::jsonb,'Asia/Riyadh') b),true);

select is((select array[b.status,b.approval_status,
    round(extract(epoch from b.approval_deadline-b.created_at)/3600)::text]
  from app.bookings b where b.id=current_setting('test.booking')::uuid),
  array['requested','pending','48'],
  'an approval-gated service commits requested with the default wall-clock SLA');
select is((select array[h.purpose,h.state,
    (h.expires_at=(select b.approval_deadline from app.bookings b where b.id=current_setting('test.booking')::uuid))::text]
  from app.booking_holds h where h.id=current_setting('test.hold')::uuid),
  array['provisional_request','active','true'],
  'a request that reserves capacity keeps its hold until the decision is due');
select is((select array[a.state] from app.assignment_allocations a
  where a.hold_id=current_setting('test.hold')::uuid),array['held'],
  'the reservation stays the same allocation the exclusion constraints already guard');
select is(
  (select count(*)::integer from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.request_time('09:00'),pg_temp.request_time('18:00'),1,'America/New_York') where result_kind='slot'),
  25,'a reserved request counts against public availability');
select is((select array[e.event_type,e.actor_kind] from app.booking_events e
  where e.booking_id=current_setting('test.booking')::uuid),
  array['booking_requested','guest'],'the submitted request records its own lineage');
select is((select array[o.topic] from app.outbox_events o
  where o.booking_id=current_setting('test.booking')::uuid),
  array['booking.requested'],'submission enqueues one customer intent, and calls no provider');

-- Authority, in both directions.
savepoint request_authority;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok(
  format($$select * from api_v1.decide_booking_request_v1('a0000000-0000-0000-0000-000000000001',%L,'accept',1)$$,current_setting('test.booking')),
  '42501','policy_denied','a member without the approval capability cannot decide');
reset role;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok(
  format($$select * from api_v1.decide_booking_request_v1('a0000000-0000-0000-0000-000000000001',%L,'accept',1)$$,current_setting('test.booking')),
  '42501','booking_context_required','another tenant cannot decide this tenant request');
select is((select count(*)::integer from api_v1.list_booking_requests_v1('a0000000-0000-0000-0000-000000000001')),
  0,'another tenant sees no pending request');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint request_authority;

-- The pending-action queue.
savepoint request_queue;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select array[q.service_name,q.customer_display_name,q.has_intake::text,
    (q.approval_deadline is not null)::text,(q.proposal_state is null)::text]
  from api_v1.list_booking_requests_v1('a0000000-0000-0000-0000-000000000001') q),
  array['Initial consultation','Guest A','false','true','true'],
  'the queue reports the request, its deadline, and the customer a reader may see');
select ok(not exists(select 1 from jsonb_object_keys(to_jsonb((
    select x from api_v1.list_booking_requests_v1('a0000000-0000-0000-0000-000000000001') x))) key
  where key in ('email','phone','answers','action_token_hash')),
  'the queue reveals no contact detail, intake answer, or proposal token');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint request_queue;

-- Payment after acceptance is issue #22, so the request stays open.
savepoint request_payment;
update app.catalog_service_revisions set payment_mode='deposit'
where tenant_id='a0000000-0000-0000-0000-000000000001' and service_id='a7200000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok(
  format($$select * from api_v1.decide_booking_request_v1('a0000000-0000-0000-0000-000000000001',%L,'accept',1)$$,current_setting('test.booking')),
  '23505','payment_pending','a service that needs payment is not accepted by this issue');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint request_payment;

-- Rejection releases the reserved capacity and keeps the reasons apart.
savepoint request_reject;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select array[d.status,d.approval_status,d.booking_revision::text]
  from api_v1.decide_booking_request_v1('a0000000-0000-0000-0000-000000000001',
    current_setting('test.booking')::uuid,'reject',1,
    'We are fully booked that day.','Double booked with the annual audit.') d),
  array['rejected','declined','2'],'rejection settles the request and bumps the revision');
reset role;
select set_config('request.jwt.claims',null,true);
select is((select b.decision_reason_public from app.bookings b where b.id=current_setting('test.booking')::uuid),
  'We are fully booked that day.','the customer-safe reason is stored on the booking');
select ok(not exists(select 1 from app.bookings b
  where b.id=current_setting('test.booking')::uuid
    and b.decision_reason_public like '%annual audit%'),
  'the internal reason never reaches the customer-facing column');
select is((select e.reason from app.booking_events e
  where e.booking_id=current_setting('test.booking')::uuid and e.event_type='booking_rejected'),
  'Double booked with the annual audit.','the internal reason stays in the booking history');
select is((select array[a.state] from app.assignment_allocations a
  where a.hold_id=current_setting('test.hold')::uuid),array['cancelled'],
  'rejection releases the reserved capacity');
select is(
  (select count(*)::integer from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.request_time('09:00'),pg_temp.request_time('18:00'),1,'America/New_York') where result_kind='slot'),
  30,'the released time is publicly bookable again');
rollback to savepoint request_reject;

-- Competing decisions: exactly one wins, and the loser learns only that it read
-- a superseded state.
savepoint request_race;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok(
  format($$select * from api_v1.decide_booking_request_v1('a0000000-0000-0000-0000-000000000001',%L,'accept',99)$$,current_setting('test.booking')),
  '23505','revision_conflict','a stale revision cannot decide');
select is((select array[d.status,d.approval_status] from api_v1.decide_booking_request_v1(
    'a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid,'accept',1) d),
  array['confirmed','approved'],'the first decision wins');
select throws_ok(
  format($$select * from api_v1.decide_booking_request_v1('a0000000-0000-0000-0000-000000000001',%L,'reject',2)$$,current_setting('test.booking')),
  '23505','revision_conflict','a second decision on the settled request is refused');
reset role;
select set_config('request.jwt.claims',null,true);
select is((select array[a.state] from app.assignment_allocations a
  where a.hold_id=current_setting('test.hold')::uuid),array['confirmed'],
  'acceptance promotes the reserved allocation rather than allocating twice');
select is((select array[h.state] from app.booking_holds h where h.id=current_setting('test.hold')::uuid),
  array['released'],'the accepted request stops holding capacity through its hold');
rollback to savepoint request_race;

-- Proposals: one live offer, an intent-scoped link, and a decline that returns
-- the request to its original pending decision.
savepoint request_proposal;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select set_config('test.token',(select d.proposal_action_token
  from api_v1.decide_booking_request_v1('a0000000-0000-0000-0000-000000000001',
    current_setting('test.booking')::uuid,'propose',1,'Would 11:00 work instead?',null,
    pg_temp.request_time('11:00')) d),true);
select throws_ok(
  format($$select * from api_v1.decide_booking_request_v1('a0000000-0000-0000-0000-000000000001',%L,'propose',1,null,null,%L)$$,
    current_setting('test.booking'),pg_temp.request_time('12:00')),
  '23505','revision_conflict','a second live proposal is refused without naming a constraint');
reset role;
select set_config('request.jwt.claims',null,true);
select matches(current_setting('test.token'),'^[0-9a-f]{64}$','the customer link is a full-length opaque token');
select is((select array[b.status,b.approval_status] from app.bookings b
  where b.id=current_setting('test.booking')::uuid),array['requested','pending'],
  'a proposal leaves the request pending rather than replacing it');
select ok((select p.expires_at<=b.approval_deadline from app.booking_proposals p
  join app.bookings b on b.id=p.booking_id),
  'a proposal never outlives the decision deadline it belongs to');
select throws_ok(
  $$select * from api_v1.respond_to_proposal_v1('client.tenant-a.example.invalid','client',repeat('a',64),'accept')$$,
  '42501','booking_context_required','an unknown token is indistinguishable from someone else''s');
select is((select array[r.proposal_state,r.status] from api_v1.respond_to_proposal_v1(
    'client.tenant-a.example.invalid','client',current_setting('test.token'),'decline') r),
  array['declined','requested'],'declining returns the request to its original decision');
select is((select b.approval_deadline=(b.created_at+interval '48 hours') from app.bookings b
  where b.id=current_setting('test.booking')::uuid),true,
  'a declined proposal does not extend the response SLA');
select throws_ok(
  format($$select * from api_v1.respond_to_proposal_v1('client.tenant-a.example.invalid','client',%L,'accept')$$,current_setting('test.token')),
  '23505','revision_conflict','a spent link cannot be reused');
rollback to savepoint request_proposal;

-- Accepting a proposal moves the booking under a new revision and keeps both
-- times in history.
savepoint request_proposal_accept;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select set_config('test.token2',(select d.proposal_action_token
  from api_v1.decide_booking_request_v1('a0000000-0000-0000-0000-000000000001',
    current_setting('test.booking')::uuid,'propose',1,null,null,
    pg_temp.request_time('13:00')) d),true);
reset role;
select set_config('request.jwt.claims',null,true);
select is((select array[r.proposal_state,r.status,(r.starts_at=pg_temp.request_time('13:00'))::text]
  from api_v1.respond_to_proposal_v1('client.tenant-a.example.invalid','client',
    current_setting('test.token2'),'accept') r),
  array['accepted','confirmed','true'],'accepting the proposal confirms the booking at the new time');
select is((select array[b.status,b.approval_status,b.revision::text,
    (b.starts_at=pg_temp.request_time('13:00'))::text,(b.approval_deadline is null)::text]
  from app.bookings b where b.id=current_setting('test.booking')::uuid),
  array['confirmed','approved','2','true','true'],
  'the moved booking is a new revision with no decision still due');
select is((select array[b.price_minor::text,b.consent_version,b.service_name] from app.bookings b
  where b.id=current_setting('test.booking')::uuid),
  array['18000','1','Initial consultation'],
  'moving the time rewrites no snapshotted price, policy, or consent');
select is((select (e.metadata->>'previous_starts_at')::timestamptz from app.booking_events e
  where e.booking_id=current_setting('test.booking')::uuid and e.event_type='booking_confirmed'),
  pg_temp.request_time('10:00'),'the original requested time stays in history');
select is((select count(*)::integer from app.assignment_allocations a
  where a.tenant_id='a0000000-0000-0000-0000-000000000001' and a.state='confirmed'
    and a.starts_at=pg_temp.request_time('13:00')),1,
  'the new capacity is secured, and the exclusion constraints guarded it');
select throws_ok(
  format($$update app.bookings set price_minor=1 where id=%L$$,current_setting('test.booking')),
  '42501','booking_immutable','the snapshot stays frozen even though the time moved');
rollback to savepoint request_proposal_accept;

-- SLA expiry is terminal, releases capacity exactly once, and cannot be undone
-- by a late decision.
savepoint request_expiry;
update app.bookings set approval_deadline=statement_timestamp()-interval '1 second'
where id=current_setting('test.booking')::uuid;
select is((select array[e.expired_requests,e.expired_proposals] from private.expire_booking_requests_v1() e),
  array[1,0],'the batched job expires the ignored request');
select is((select array[e.expired_requests,e.expired_proposals] from private.expire_booking_requests_v1() e),
  array[0,0],'a second run expires the same request a second time for nobody');
select is((select array[b.status,b.approval_status,(b.approval_deadline is null)::text]
  from app.bookings b where b.id=current_setting('test.booking')::uuid),
  array['expired','expired','true'],'expiry is a terminal decision');
select is((select array[a.state] from app.assignment_allocations a
  where a.hold_id=current_setting('test.hold')::uuid),array['cancelled'],
  'expiry releases the reserved capacity');
select is((select array_agg(o.topic order by o.topic) from app.outbox_events o
  where o.booking_id=current_setting('test.booking')::uuid),
  array['booking.request_expired','booking.requested'],
  'the customer is told the request closed');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok(
  format($$select * from api_v1.decide_booking_request_v1('a0000000-0000-0000-0000-000000000001',%L,'accept',1)$$,current_setting('test.booking')),
  '23505','revision_conflict','a late acceptance cannot resurrect an expired request');
select is((select count(*)::integer from api_v1.list_booking_requests_v1('a0000000-0000-0000-0000-000000000001')),
  0,'an expired request leaves the pending-action queue');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint request_expiry;

-- With the ADR-0005 default, a request reserves nothing and acceptance
-- allocates at decision time.
savepoint request_without_allocation;
update app.catalog_service_revisions
set policy=jsonb_build_object('consent_version','1','consent_text','Terms.')
where tenant_id='a0000000-0000-0000-0000-000000000001' and service_id='a7200000-0000-0000-0000-000000000001';
select set_config('test.hold_two',(select h.hold_id::text from api_v1.create_hold_v1(
  'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.request_time('14:00'),
  'session-token-bbbb-0001','idempotency-key-bbbb-0001') h),true);
select set_config('test.booking_two',(select b.booking_id::text from api_v1.confirm_booking_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.hold_two')::uuid,
  'session-token-bbbb-0001','confirm-key-bbbb-0001',
  '{"fullName":"Guest B","email":"guest.b@example.invalid"}'::jsonb,
  '1','en','{}'::jsonb,'Asia/Riyadh') b),true);
select is((select array[h.state,h.purpose] from app.booking_holds h
  where h.id=current_setting('test.hold_two')::uuid),array['released','checkout'],
  'the default request reserves nothing');
select is((select array[a.state] from app.assignment_allocations a
  where a.hold_id=current_setting('test.hold_two')::uuid),array['cancelled'],
  'the checkout allocation is released when the request protects no capacity');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select array[d.status] from api_v1.decide_booking_request_v1(
    'a0000000-0000-0000-0000-000000000001',current_setting('test.booking_two')::uuid,'accept',1) d),
  array['confirmed'],'acceptance allocates at decision time');
reset role;
select set_config('request.jwt.claims',null,true);
select is((select count(*)::integer from app.assignment_allocations a
  where a.tenant_id='a0000000-0000-0000-0000-000000000001' and a.state='confirmed'
    and a.starts_at=pg_temp.request_time('14:00')),1,
  'the accepted request holds exactly one confirmed allocation');
rollback to savepoint request_without_allocation;

-- Savepoint rollbacks revert pgTAP's counter, which lives in a temporary table,
-- but not the test numbering, which comes from a temporary sequence. Re-sync the
-- count so the emitted plan matches the tests that actually ran.
select _set('curr_test',(select last_value::integer from __tresults___numb_seq));
select * from finish();

rollback;
