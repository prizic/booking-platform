begin;
select no_plan();

-- Issue #23. Everything that happens to money after a payment succeeds. The
-- properties that matter: one logical refund per eligible cancellation, no
-- duplicate movement under any amount of provider retrying or reordering, a
-- terminal state that cannot be walked backwards by a late event, and every
-- problem landing in a queue a human can actually work.

select set_config('test.rf_day',
  (date_trunc('week',statement_timestamp() at time zone 'America/New_York')::date+42)::text,true);
create function pg_temp.rf_time(p_time time)
returns timestamptz language sql stable as $$
  select (current_setting('test.rf_day')::date+p_time) at time zone 'America/New_York';
$$;
do $$ begin
  execute format('grant usage on schema %I to authenticated',pg_my_temp_schema()::regnamespace::text);
end $$;

-- ---------------------------------------------------------------------------
-- Contract shape.
select has_table('app'::name,'payment_exceptions'::name);
select ok((select relrowsecurity from pg_class where oid='app.payment_exceptions'::regclass),
  'the exception queue carries row level security like every other tenant table');
select has_function('api_v1'::name,'request_refund_v1'::name,
  array['uuid','uuid','text','bigint','text']);
select has_function('api_v1'::name,'resolve_payment_exception_v1'::name,
  array['uuid','uuid','text','text']);
select has_function('api_v1'::name,'list_payment_exceptions_v1'::name,
  array['uuid','text','integer']);
select has_function('api_v1'::name,'record_commerce_event_v1'::name,
  array['uuid','text','text','text','text','text','text','bigint','text',
        'timestamp with time zone','text']);
select has_function('api_v1'::name,'reconcile_commerce_v1'::name,array['uuid','integer']);

select ok(
  not has_function_privilege('anon','api_v1.request_refund_v1(uuid,uuid,text,bigint,text)','execute')
  and not has_function_privilege('anon','api_v1.list_payment_exceptions_v1(uuid,text,integer)','execute'),
  'no money surface is anonymous');
select ok(
  not has_function_privilege('authenticated','api_v1.record_commerce_event_v1(uuid,text,text,text,text,text,text,bigint,text,timestamptz,text)','execute')
  and not has_function_privilege('authenticated','api_v1.claim_refund_batch_v1(integer,integer)','execute')
  and not has_function_privilege('authenticated','api_v1.record_refund_result_v1(uuid,uuid,text,text,text)','execute')
  and not has_function_privilege('authenticated','api_v1.reconcile_commerce_v1(uuid,integer)','execute'),
  'a session can never assert a provider outcome, claim work, or run reconciliation');
select ok(
  not has_function_privilege('authenticated','api_v1.get_commerce_health_v1()','execute')
  and not has_function_privilege('anon','api_v1.get_commerce_health_v1()','execute'),
  'fleet health is control-plane only: operating the fleet never reads a tenant''s money');
select ok((select p.provolatile='s' from pg_proc p
  where p.oid='api_v1.list_payment_exceptions_v1(uuid,text,integer)'::regprocedure),
  'reading the queue is stable, so looking at a problem never changes it');

-- ---------------------------------------------------------------------------
-- Fixtures: a paid booking, cancelled, with eligibility already decided by #15.
insert into app.staff_profiles(id,tenant_id,public_name)
values ('f8000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Refund fixture staff');
insert into app.staff_services(tenant_id,staff_id,service_id)
values ('a0000000-0000-0000-0000-000000000001','f8000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001');
insert into app.staff_locations(tenant_id,staff_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','f8000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001');
insert into app.staff_service_locations(tenant_id,staff_id,service_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','f8000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001');
insert into app.schedule_scopes(id,tenant_id,scope_kind,location_id,staff_id,time_zone)
values ('f8100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','staff','a5000000-0000-0000-0000-000000000001','f8000000-0000-0000-0000-000000000001','America/New_York');
insert into app.weekly_schedules(id,tenant_id,schedule_scope_id,day_of_week,start_minute,end_minute)
values ('f8200000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','f8100000-0000-0000-0000-000000000001',1,540,1020);
insert into app.payment_accounts(
  id,tenant_id,provider,provider_account_reference,status,charges_enabled,payouts_enabled)
values ('f9000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
  'stripe','acct_refund_tenant_a','connected',true,true);

-- The booking is six weeks out, so issue #15's documented default tier list
-- already earns a full refund. No custom schedule is published here on purpose:
-- the default is the thing most tenants will actually run on.
update app.catalog_service_revisions
set payment_mode='full',
  policy=policy||'{"cancellation_cutoff_minutes":0,"cancellation_customer_self_service":true}'::jsonb
where tenant_id='a0000000-0000-0000-0000-000000000001'
  and service_id='a7200000-0000-0000-0000-000000000001';

select set_config('test.rf_hold',(select h.hold_id::text from api_v1.create_hold_v1(
  'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.rf_time('10:00'),
  'session-token-rf01-0001','idempotency-key-rf01-0001') h),true);
select set_config('test.rf_attempt',(select c.payment_attempt_id::text
  from api_v1.begin_checkout_v1('client.tenant-a.example.invalid','client',
    current_setting('test.rf_hold')::uuid,'session-token-rf01-0001','idempotency-key-rf01-0002',
    '{"fullName":"Refund Guest","email":"refund@example.invalid"}'::jsonb,'1') c),true);
select * from api_v1.attach_checkout_reference_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.rf_attempt')::uuid,'cs_rf01');
select set_config('test.rf_booking',(select r.booking_id::text
  from api_v1.record_payment_event_v1('a0000000-0000-0000-0000-000000000001','stripe',
    'evt_rf01','checkout.session.completed','cs_rf01','succeeded',null,null,'ch_rf01') r),true);

-- Cancel it so #15 records eligibility. Staff cancellation, not the customer.
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select * from api_v1.cancel_booking_v1('a0000000-0000-0000-0000-000000000001',
  current_setting('test.rf_booking')::uuid,1,'Customer asked to cancel.');
reset role;
select set_config('request.jwt.claims',null,true);

select ok((select b.refund_eligible_minor > 0 from app.bookings b
  where b.id=current_setting('test.rf_booking')::uuid),
  'issue #15 decided the eligibility; this suite only ever executes it');

-- ---------------------------------------------------------------------------
-- One eligible cancellation makes exactly one logical refund.
savepoint rf_request;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;

select is((select r.status from api_v1.request_refund_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.rf_booking')::uuid,
  'refund-key-rf01-000001') r),'eligible','a refund is requested from eligibility already decided');
select is((select r.amount_minor_units from api_v1.request_refund_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.rf_booking')::uuid,
  'refund-key-rf01-000001') r),
  (select b.refund_eligible_minor from app.bookings b
   where b.id=current_setting('test.rf_booking')::uuid),
  'for the amount the cancellation earned, not one this surface invented');
select ok((select r.replayed from api_v1.request_refund_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.rf_booking')::uuid,
  'refund-key-rf01-000001') r),
  'a repeated request replays rather than issuing a second refund');
select is((select count(*)::integer from app.payment_refunds
  where booking_id=current_setting('test.rf_booking')::uuid),1,
  'one logical refund exists, which is the whole acceptance criterion');

-- A second refund on top of a full one would return more than was taken.
select throws_ok(
  format($$select * from api_v1.request_refund_v1('a0000000-0000-0000-0000-000000000001',%L,
    'refund-key-rf01-000002')$$,current_setting('test.rf_booking')),
  '42501','refund_not_eligible',
  'refunds accumulate and together can never exceed the charge');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint rf_request;

-- ---------------------------------------------------------------------------
-- Only somebody entitled to issue money may issue it.
savepoint rf_authority;
-- A staff member holds refund.issue at `own` scope, which grants nothing here.
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok(
  format($$select * from api_v1.request_refund_v1('a0000000-0000-0000-0000-000000000001',%L,
    'refund-key-rf02-000001')$$,current_setting('test.rf_booking')),
  '42501','policy_denied','an own-scoped grant does not issue a tenant refund');
reset role;
select set_config('request.jwt.claims',null,true);

-- A scheduler holds refund.issue as an approval grant, so it needs a step-up.
select set_config('request.jwt.claims','{"sub":"c1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok(
  format($$select * from api_v1.request_refund_v1('a0000000-0000-0000-0000-000000000001',%L,
    'refund-key-rf02-000002')$$,current_setting('test.rf_booking')),
  '42501','policy_denied','an approval grant without a recent authentication is refused');
reset role;
select set_config('request.jwt.claims',null,true);
select set_config('request.jwt.claims','{"sub":"c1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select r.status from api_v1.request_refund_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.rf_booking')::uuid,
  'refund-key-rf02-000003') r),'eligible','and is allowed with one');
reset role;
select set_config('request.jwt.claims',null,true);

-- Another tenant reaches nothing and learns nothing.
select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok(
  format($$select * from api_v1.request_refund_v1('a0000000-0000-0000-0000-000000000001',%L,
    'refund-key-rf02-000004')$$,current_setting('test.rf_booking')),
  '42501','booking_context_required','a cross-tenant refund is an unknown booking');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint rf_authority;

-- ---------------------------------------------------------------------------
-- The worker, the ledger, and the customer's message.
savepoint rf_worker;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select set_config('test.rf_refund',(select r.refund_id::text from api_v1.request_refund_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.rf_booking')::uuid,
  'refund-key-rf03-000001') r),true);
reset role;
select set_config('request.jwt.claims',null,true);

select is((select count(*)::integer from private.claim_refund_batch_v1()),1,
  'the worker claims the due refund');
select is((select count(*)::integer from private.claim_refund_batch_v1()),0,
  'and it is invisible to a second worker until the visibility timeout elapses');
select is((select array[r.status,r.attempts::text] from app.payment_refunds r
  where r.id=current_setting('test.rf_refund')::uuid),
  array['pending','1'],'claiming counts the attempt before the provider is called');

-- A provider timeout backs off rather than giving up.
select is((select s.status from private.record_refund_result_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.rf_refund')::uuid,
  'retryable_error',null,'provider_timeout') s),'eligible',
  'a retryable failure re-queues the refund');
select ok((select r.next_attempt_at > statement_timestamp() from app.payment_refunds r
  where r.id=current_setting('test.rf_refund')::uuid),
  'with backoff, because a provider having a bad hour is not a reason to hammer it');
select is((select count(*)::integer from app.commerce_ledger_entries
  where entry_type='refund'),0,
  'and no money is recorded as moved, because none did');

update app.payment_refunds set next_attempt_at=statement_timestamp()
where id=current_setting('test.rf_refund')::uuid;
select is((select c.attempt from private.claim_refund_batch_v1() c),2,
  'the retry is a new numbered attempt');
select is((select s.status from private.record_refund_result_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.rf_refund')::uuid,
  'succeeded','re_rf03') s),'succeeded','and the retry succeeds');

select is((select l.amount_minor_units from app.commerce_ledger_entries l
  where l.entry_type='refund'),
  (select r.amount_minor_units from app.payment_refunds r
   where r.id=current_setting('test.rf_refund')::uuid),
  'the ledger records the money moving back');
select is((select c.status from app.payment_charges c where c.provider_charge_reference='ch_rf01'),
  'refunded','a fully refunded charge says so');
select is((select count(*)::integer from app.outbox_events
  where topic='payment.refunded'),1,
  'and the customer is told, from committed state rather than an optimistic call');

-- A late worker report never reopens settled money.
select is((select s.status from private.record_refund_result_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.rf_refund')::uuid,
  'permanent_error',null,'too_late') s),'succeeded',
  'a late failure report cannot un-refund a completed refund');
select is((select count(*)::integer from app.commerce_ledger_entries where entry_type='refund'),1,
  'and writes no second ledger entry');
rollback to savepoint rf_worker;

-- ---------------------------------------------------------------------------
-- Webhooks: duplicates, reordering, and the unmatched case.
savepoint rf_webhooks;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select set_config('test.rf_refund',(select r.refund_id::text from api_v1.request_refund_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.rf_booking')::uuid,
  'refund-key-rf04-000001') r),true);
reset role;
select set_config('request.jwt.claims',null,true);
update app.payment_refunds set provider_refund_reference='re_rf04'
where id=current_setting('test.rf_refund')::uuid;

select is((select e.outcome from api_v1.record_commerce_event_v1(
  'a0000000-0000-0000-0000-000000000001','stripe','evt_rf04_1','charge.refund.updated',
  'refund','re_rf04','succeeded',18000,'SAR',statement_timestamp()) e),
  'recorded','a verified refund success settles the refund');
select is((select r.status from app.payment_refunds r
  where r.id=current_setting('test.rf_refund')::uuid),'succeeded','the refund is settled');
select is((select count(*)::integer from app.commerce_ledger_entries where entry_type='refund'),1,
  'one ledger entry');

select is((select e.outcome from api_v1.record_commerce_event_v1(
  'a0000000-0000-0000-0000-000000000001','stripe','evt_rf04_1','charge.refund.updated',
  'refund','re_rf04','succeeded',18000,'SAR',statement_timestamp()) e),
  'replayed','a redelivered event is recognised by the provider''s own event id');
select is((select count(*)::integer from app.commerce_ledger_entries where entry_type='refund'),1,
  'and moves no money a second time');

-- An older event arriving after a terminal state does not walk it backwards.
select is((select e.detail from api_v1.record_commerce_event_v1(
  'a0000000-0000-0000-0000-000000000001','stripe','evt_rf04_stale','charge.refund.updated',
  'refund','re_rf04','failed',18000,'SAR',statement_timestamp()-interval '1 hour') e),
  'older_than_terminal_state',
  'a reordered older event cannot reverse a settled refund');
select is((select r.status from app.payment_refunds r
  where r.id=current_setting('test.rf_refund')::uuid),'succeeded','the refund stays settled');

-- Money left the account for something we cannot identify.
select is((select e.outcome from api_v1.record_commerce_event_v1(
  'a0000000-0000-0000-0000-000000000001','stripe','evt_rf04_ghost','charge.refund.updated',
  'refund','re_not_ours','succeeded',5000,'SAR') e),
  'unmatched','a refund we never requested is not silently accepted');
select is((select e.kind from app.payment_exceptions e where e.detail_code='unknown_refund_reference'),
  'refund_unmatched','it becomes an urgent queue item immediately');
rollback to savepoint rf_webhooks;

-- ---------------------------------------------------------------------------
-- Disputes, payouts, and a connected account that loses its capability.
savepoint rf_queue;
select is((select e.outcome from api_v1.record_commerce_event_v1(
  'a0000000-0000-0000-0000-000000000001','stripe','evt_rf05_dispute','charge.dispute.created',
  'dispute','dp_rf05','warning_needs_response',18000,'SAR',statement_timestamp(),'ch_rf01') e),
  'recorded','a dispute is recorded against the charge it names');
select is((select d.status from app.payment_disputes d where d.provider_dispute_reference='dp_rf05'),
  'warning_needs_response','with the provider''s own state');
select is((select e.severity from app.payment_exceptions e where e.kind='dispute_opened'),
  'urgent','and is urgent the moment it exists, not when somebody notices');
select is((select b.status from app.bookings b where b.id=current_setting('test.rf_booking')::uuid),
  'cancelled','a dispute never rewrites the booking''s own status (invariant 9)');

select is((select e.detail from api_v1.record_commerce_event_v1(
  'a0000000-0000-0000-0000-000000000001','stripe','evt_rf05_stale','charge.dispute.closed',
  'dispute','dp_rf05','lost',18000,'SAR',statement_timestamp(),'ch_rf01') e),
  null::text,'a dispute can still move while it is not terminal');
select is((select d.status from app.payment_disputes d where d.provider_dispute_reference='dp_rf05'),
  'lost','and reaches its outcome');
select is((select e.detail from api_v1.record_commerce_event_v1(
  'a0000000-0000-0000-0000-000000000001','stripe','evt_rf05_reverse','charge.dispute.closed',
  'dispute','dp_rf05','won',18000,'SAR',statement_timestamp()-interval '2 hours','ch_rf01') e),
  'older_than_terminal_state','and a late reversal of a closed dispute is refused');

select is((select e.outcome from api_v1.record_commerce_event_v1(
  'a0000000-0000-0000-0000-000000000001','stripe','evt_rf05_payout','payout.failed',
  'payout','po_rf05','failed',50000,'SAR') e),
  'recorded','a failed payout is recorded');
select is((select e.kind from app.payment_exceptions e where e.provider_reference='po_rf05'),
  'payout_failed','the tenant''s money not arriving is a queue item');

select is((select e.outcome from api_v1.record_commerce_event_v1(
  'a0000000-0000-0000-0000-000000000001','stripe','evt_rf05_acct','account.updated',
  'account','acct_refund_tenant_a','restricted') e),
  'recorded','a restricted connected account is recorded');
select is((select array[pa.status,pa.charges_enabled::text] from app.payment_accounts pa
  where pa.provider_account_reference='acct_refund_tenant_a'),
  array['restricted','false'],
  'and the account can no longer charge, which stops checkout at the door');
select is((select e.kind from app.payment_exceptions e where e.kind='account_restricted'),
  'account_restricted',
  'a tenant who cannot take money is told, rather than finding out from a customer');
rollback to savepoint rf_queue;

-- ---------------------------------------------------------------------------
-- Reconciliation finds what never arrived, repeatedly and safely.
savepoint rf_reconcile;
-- A payment stuck mid-flight far longer than any bank takes.
update app.payment_attempts set status='processing',
  updated_at=statement_timestamp()-interval '3 hours'
where id=current_setting('test.rf_attempt')::uuid;

select is((select r.opened from private.reconcile_commerce_v1(
  'a0000000-0000-0000-0000-000000000001') r),1,
  'reconciliation opens an exception for a payment with no outcome');
select is((select e.detail_code from app.payment_exceptions e
  where e.kind='reconciliation_mismatch'),'processing_without_outcome',
  'and names what is wrong in a code an operator can act on');
select is((select count(*)::integer from app.payment_exceptions),1,'one exception');

-- Running it again is the point: it must be safe under any schedule.
select is((select r.opened from private.reconcile_commerce_v1(
  'a0000000-0000-0000-0000-000000000001') r),1,
  'a second run finds the same problem');
select is((select count(*)::integer from app.payment_exceptions),1,
  'and still holds exactly one row for it, because the queue is keyed by the problem');
select is((select r.opened from private.reconcile_commerce_v1() r),1,
  'a fleet-wide run behaves identically');
select is((select count(*)::integer from app.payment_exceptions),1,'still one');

-- A cancellation that earned money back and never got a refund.
update app.payment_attempts set status='succeeded' where id=current_setting('test.rf_attempt')::uuid;
update app.bookings set cancelled_at=statement_timestamp()-interval '3 hours'
where id=current_setting('test.rf_booking')::uuid;
select ok((select r.opened >= 1 from private.reconcile_commerce_v1(
  'a0000000-0000-0000-0000-000000000001') r),
  'a refund that is owed and was never requested is found');
select is((select count(*)::integer from app.payment_exceptions e
  where e.detail_code='refund_owed_not_requested'),1,
  'and named as exactly that');
select is((select e.severity from app.payment_exceptions e
  where e.detail_code='refund_owed_not_requested'),'urgent',
  'money owed to a customer is urgent');
rollback to savepoint rf_reconcile;

-- ---------------------------------------------------------------------------
-- Working the queue is a financial act with a step-up and an attribution.
savepoint rf_resolve;
select private.raise_payment_exception_v1('a0000000-0000-0000-0000-000000000001',
  'refund_failed','payment_refund','f0000000-0000-0000-0000-00000000000a',
  'provider_refused',null,18000,'SAR',null,'urgent');
select set_config('test.rf_exception',(select e.id::text from app.payment_exceptions e
  where e.detail_code='provider_refused'),true);

select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok(
  format($$select * from api_v1.resolve_payment_exception_v1('a0000000-0000-0000-0000-000000000001',
    %L,'written_off','x')$$,current_setting('test.rf_exception')),
  '42501','policy_denied','writing off money needs a recent authentication');
reset role;
select set_config('request.jwt.claims',null,true);

select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select count(*)::integer from api_v1.list_payment_exceptions_v1(
  'a0000000-0000-0000-0000-000000000001')),1,'an admin can see the queue');
select is((select r.status from api_v1.resolve_payment_exception_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.rf_exception')::uuid,
  'written_off','Provider refused twice; handled by bank transfer.') r),
  'resolved','and resolve an item with a reason');
select throws_ok(
  format($$select * from api_v1.resolve_payment_exception_v1('a0000000-0000-0000-0000-000000000001',
    %L,'written_off','again')$$,current_setting('test.rf_exception')),
  '23505','exception_resolved',
  'a second person is told it was already settled rather than believing they did it');
reset role;
select set_config('request.jwt.claims',null,true);
select ok((select e.resolved_by_membership_id is not null from app.payment_exceptions e
  where e.id=current_setting('test.rf_exception')::uuid),
  'every privileged financial action is attributable');

-- The queue is finance-class, not everyone-class.
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select count(*)::integer from api_v1.list_payment_exceptions_v1(
  'a0000000-0000-0000-0000-000000000001',null)),0,
  'a staff member without a finance capability sees no queue at all');
reset role;
select set_config('request.jwt.claims',null,true);
select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select count(*)::integer from api_v1.list_payment_exceptions_v1(
  'a0000000-0000-0000-0000-000000000001',null)),0,
  'and another tenant sees nothing, including that anything went wrong');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint rf_resolve;

-- ---------------------------------------------------------------------------
-- The ledger is the explanation, so it never changes its mind.
savepoint rf_ledger;
select throws_ok(
  $$update app.commerce_ledger_entries set amount_minor_units = 1$$,
  null,null,'a historical ledger entry cannot be edited');
select throws_ok(
  $$delete from app.commerce_ledger_entries$$,
  null,null,'nor deleted: a correction is a compensating entry, never an erasure');
select ok((select count(*)::integer from app.commerce_ledger_entries
  where tenant_id='a0000000-0000-0000-0000-000000000001' and entry_type='charge') = 1,
  'and the charge that really happened is still there');
select ok(not exists(select 1 from app.payment_exceptions e
  where e.detail_code ilike '%@%' or coalesce(e.resolution_note,'') ilike '%@%'),
  'nothing in the queue carries an address: it is read by operators, not owners');
rollback to savepoint rf_ledger;

-- The savepoint rollbacks above revert pgTAP's own counter, so it is restored
-- from the non-transactional sequence before the plan is emitted.
select _set('curr_test',(select last_value::integer from __tresults___numb_seq));
select * from finish();
rollback;
