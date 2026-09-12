begin;
select no_plan();

-- Issue #22. A paid or deposit-backed booking. The properties that matter are
-- not "a payment can succeed" but: the server decides the amount, a browser
-- decides nothing, a verified event is the only thing that confirms, and money
-- that arrives for capacity we no longer have becomes a named exception with a
-- refund queued rather than an overbooking or a silent loss.

select set_config('test.pb_day',
  (date_trunc('week',statement_timestamp() at time zone 'America/New_York')::date+35)::text,true);
create function pg_temp.pb_time(p_time time)
returns timestamptz language sql stable as $$
  select (current_setting('test.pb_day')::date+p_time) at time zone 'America/New_York';
$$;
do $$ begin
  execute format('grant usage on schema %I to authenticated',pg_my_temp_schema()::regnamespace::text);
end $$;

-- ---------------------------------------------------------------------------
-- Contract shape.
select has_table('app'::name,'booking_drafts'::name);
select ok((select relrowsecurity from pg_class where oid='app.booking_drafts'::regclass),
  'the draft table carries row level security like every other tenant-owned table');
select ok(not has_table_privilege('anon','app.booking_drafts','select')
  and not has_table_privilege('authenticated','app.booking_drafts','select'),
  'and no application role can read a draft at all: it is contact data in flight');

select has_function('api_v1'::name,'begin_checkout_v1'::name,
  array['text','text','uuid','text','text','jsonb','text','text','jsonb','text']);
select has_function('api_v1'::name,'get_checkout_status_v1'::name,
  array['text','text','uuid','text']);
select has_function('api_v1'::name,'record_payment_event_v1'::name,
  array['uuid','text','text','text','text','text','bigint','text','text','timestamp with time zone']);
select has_function('api_v1'::name,'attach_checkout_reference_v1'::name,
  array['uuid','uuid','text']);

-- The whole security model of this issue in two assertions.
select ok(
  has_function_privilege('anon','api_v1.begin_checkout_v1(text,text,uuid,text,text,jsonb,text,text,jsonb,text)','execute')
  and has_function_privilege('anon','api_v1.get_checkout_status_v1(text,text,uuid,text)','execute'),
  'a guest may open a checkout and ask what happened to it');
select ok(
  not has_function_privilege('anon','api_v1.record_payment_event_v1(uuid,text,text,text,text,text,bigint,text,text,timestamptz)','execute')
  and not has_function_privilege('authenticated','api_v1.record_payment_event_v1(uuid,text,text,text,text,text,bigint,text,text,timestamptz)','execute')
  and not has_function_privilege('anon','api_v1.attach_checkout_reference_v1(uuid,uuid,text)','execute')
  and not has_function_privilege('authenticated','api_v1.attach_checkout_reference_v1(uuid,uuid,text)','execute'),
  'and may never assert that a payment succeeded: settlement is service-role only');
select ok((select p.provolatile='s' from pg_proc p
  where p.oid='api_v1.get_checkout_status_v1(text,text,uuid,text)'::regprocedure),
  'the status read is stable, so asking what happened can never change what happened');

-- ---------------------------------------------------------------------------
-- Pricing is decided in one place, and the deposit rules are the published ones.
select is((select array[a.due_minor,a.balance_minor,a.tax_minor]
  from private.resolve_payment_amounts_v1('full',20000,0,'{}'::jsonb) a),
  array[20000::bigint,0::bigint,0::bigint],
  'a full payment with no tax is the whole price');
select is((select array[a.due_minor,a.balance_minor,a.tax_minor]
  from private.resolve_payment_amounts_v1('full',20000,1500,'{}'::jsonb) a),
  array[23000::bigint,0::bigint,3000::bigint],
  'tax is added to a published tax-exclusive price rather than extracted from it');
select is((select array[a.due_minor,a.balance_minor]
  from private.resolve_payment_amounts_v1('deposit',20000,0,
    '{"deposit_percent_bps":2500}'::jsonb) a),
  array[5000::bigint,15000::bigint],
  'a percentage deposit is taken from the gross and leaves the balance');
select is((select array[a.due_minor,a.balance_minor]
  from private.resolve_payment_amounts_v1('deposit',20000,1500,
    '{"deposit_minor_units":9000,"deposit_percent_bps":2500}'::jsonb) a),
  array[9000::bigint,14000::bigint],
  'a tenant who typed an amount gets that amount, not the percentage');
select is((select a.due_minor from private.resolve_payment_amounts_v1('deposit',20000,0,
    '{"deposit_minor_units":999999}'::jsonb) a),
  20000::bigint,'a deposit larger than the price is clamped to the price');
select is((select a.due_minor from private.resolve_payment_amounts_v1('deposit',20001,0,'{}'::jsonb) a),
  10000::bigint,'an unpublished deposit rule falls back to half, rounded down');
select ok((select p.provolatile='i' from pg_proc p
  where p.oid='private.resolve_payment_amounts_v1(text,bigint,integer,jsonb)'::regprocedure),
  'pricing is immutable: the same inputs are the same money, always');

-- ---------------------------------------------------------------------------
-- Fixtures. One service published at full payment, one at deposit, a connected
-- account that can actually charge, and staff to allocate against.
insert into app.staff_profiles(id,tenant_id,public_name)
values ('e8000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Paid fixture staff');
insert into app.staff_services(tenant_id,staff_id,service_id)
values ('a0000000-0000-0000-0000-000000000001','e8000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001');
insert into app.staff_locations(tenant_id,staff_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','e8000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001');
insert into app.staff_service_locations(tenant_id,staff_id,service_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','e8000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001');
insert into app.schedule_scopes(id,tenant_id,scope_kind,location_id,staff_id,time_zone)
values ('e8100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','staff','a5000000-0000-0000-0000-000000000001','e8000000-0000-0000-0000-000000000001','America/New_York');
insert into app.weekly_schedules(id,tenant_id,schedule_scope_id,day_of_week,start_minute,end_minute)
values ('e8200000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','e8100000-0000-0000-0000-000000000001',1,540,1020);

insert into app.payment_accounts(
  id,tenant_id,provider,provider_account_reference,status,charges_enabled,payouts_enabled)
values ('e9000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
  'stripe','acct_test_tenant_a','connected',true,true);

update app.catalog_service_revisions
set payment_mode='full'
where tenant_id='a0000000-0000-0000-0000-000000000001' and service_id='a7200000-0000-0000-0000-000000000001';

create function pg_temp.pb_hold(p_time time, p_session text, p_key text)
returns uuid language sql volatile as $$
  select h.hold_id from api_v1.create_hold_v1(
    'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
    'a5000000-0000-0000-0000-000000000001',pg_temp.pb_time(p_time),p_session,p_key) h;
$$;
create function pg_temp.pb_checkout(p_hold uuid, p_session text, p_key text)
returns setof record language sql volatile as $$
  select c.payment_attempt_id, c.due_minor, c.balance_minor, c.total_minor, c.payment_mode
  from api_v1.begin_checkout_v1('client.tenant-a.example.invalid','client',p_hold,
    p_session,p_key,'{"fullName":"Paid Guest","email":"paid@example.invalid"}'::jsonb,'1') c;
$$;

-- ---------------------------------------------------------------------------
-- A priced service cannot be confirmed by simply asking.
savepoint pb_unpaid_refused;
select set_config('test.pb_hold',pg_temp.pb_hold('10:00','session-token-pb01-0001','idem-key-pb01-000001')::text,true);
select throws_ok(
  format($$select * from api_v1.confirm_booking_v1(
    'client.tenant-a.example.invalid','client',%L,'session-token-pb01-0001',
    'confirm-key-pb01-0001','{"fullName":"Paid Guest","email":"paid@example.invalid"}'::jsonb,'1')$$,
    current_setting('test.pb_hold')),
  '23505','payment_pending',
  'a service that requires payment is not confirmed by the free path');
select is((select count(*)::integer from app.bookings
  where hold_id=current_setting('test.pb_hold')::uuid),0,
  'and no booking was created while refusing');
rollback to savepoint pb_unpaid_refused;

-- ---------------------------------------------------------------------------
-- The happy path, end to end, with the browser proving nothing.
savepoint pb_full_payment;
select set_config('test.pb_hold',pg_temp.pb_hold('10:00','session-token-pb02-0001','idem-key-pb02-000001')::text,true);
select set_config('test.pb_attempt',(select c.payment_attempt_id::text
  from pg_temp.pb_checkout(current_setting('test.pb_hold')::uuid,
    'session-token-pb02-0001','idem-key-pb02-000002')
    as c(payment_attempt_id uuid, due_minor bigint, balance_minor bigint,
         total_minor bigint, payment_mode text)),true);

select is((select a.status from app.payment_attempts a
  where a.id=current_setting('test.pb_attempt')::uuid),'requires_payment',
  'opening a checkout opens an attempt and calls no provider');
select is((select a.amount_minor_units from app.payment_attempts a
  where a.id=current_setting('test.pb_attempt')::uuid),
  (select sr.price_minor + (sr.price_minor*sr.tax_rate_bps)/10000
   from app.catalog_service_revisions sr
   where sr.tenant_id='a0000000-0000-0000-0000-000000000001'
     and sr.service_id='a7200000-0000-0000-0000-000000000001'
     and sr.state='published' and sr.locale='en'),
  'the amount is the published price, computed by the server');
select is((select count(*)::integer from app.booking_drafts
  where hold_id=current_setting('test.pb_hold')::uuid),1,
  'the contact details are captured before the customer leaves, because the '
  'webhook will confirm with no browser present');
select is((select count(*)::integer from app.bookings
  where hold_id=current_setting('test.pb_hold')::uuid),0,
  'and nothing is confirmed yet: opening a checkout is not a booking');

-- The customer comes back before the webhook. They learn only that it is
-- pending, and nothing they do here can change that.
select is((select s.status from api_v1.get_checkout_status_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.pb_hold')::uuid,
  'session-token-pb02-0001') s),'requires_payment',
  'a customer returning before the webhook is told the payment is still pending');
select is((select s.booking_id from api_v1.get_checkout_status_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.pb_hold')::uuid,
  'session-token-pb02-0001') s),null,
  'and is given no booking, because a redirect is not proof of payment');

select * from api_v1.attach_checkout_reference_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.pb_attempt')::uuid,'cs_test_pb02');
select is((select a.status from app.payment_attempts a
  where a.id=current_setting('test.pb_attempt')::uuid),'processing',
  'linking the provider session moves the attempt to processing');

select is((select r.outcome from api_v1.record_payment_event_v1(
  'a0000000-0000-0000-0000-000000000001','stripe','evt_pb02_1',
  'checkout.session.completed','cs_test_pb02','succeeded',null,null,'ch_pb02') r),
  'confirmed','a verified success confirms the booking');
select is((select array[b.status,b.payment_status] from app.bookings b
  where b.hold_id=current_setting('test.pb_hold')::uuid),
  array['confirmed','succeeded'],
  'the booking is confirmed and says it is paid');
select is((select count(*)::integer from app.booking_drafts
  where hold_id=current_setting('test.pb_hold')::uuid),0,
  'the draft is deleted once the booking holds those values immutably');
select is((select count(*)::integer from app.assignment_allocations a
  where a.hold_id=current_setting('test.pb_hold')::uuid and a.state='confirmed'),1,
  'the allocation was promoted by the one confirmation engine, not a second one');
select is((select count(*)::integer from app.commerce_ledger_entries
  where tenant_id='a0000000-0000-0000-0000-000000000001' and entry_type='charge'),1,
  'exactly one charge reaches the financial ledger');
select is((select count(*)::integer from app.outbox_events
  where booking_id=(select id from app.bookings where hold_id=current_setting('test.pb_hold')::uuid)),1,
  'and exactly one confirmation message intent is enqueued');

-- The provider retries. Nothing happens twice.
select is((select r.outcome from api_v1.record_payment_event_v1(
  'a0000000-0000-0000-0000-000000000001','stripe','evt_pb02_1',
  'checkout.session.completed','cs_test_pb02','succeeded',null,null,'ch_pb02') r),
  'replayed','a redelivered provider event is recognised and does nothing');
select is((select count(*)::integer from app.bookings
  where hold_id=current_setting('test.pb_hold')::uuid),1,
  'one booking');
select is((select count(*)::integer from app.commerce_ledger_entries
  where tenant_id='a0000000-0000-0000-0000-000000000001' and entry_type='charge'),1,
  'one ledger entry');
select is((select count(*)::integer from app.payment_charges
  where tenant_id='a0000000-0000-0000-0000-000000000001'),1,
  'one charge');

-- A different event id for the same object is still the same settled payment.
select is((select r.outcome from api_v1.record_payment_event_v1(
  'a0000000-0000-0000-0000-000000000001','stripe','evt_pb02_2',
  'checkout.session.completed','cs_test_pb02','succeeded',null,null,'ch_pb02') r),
  'replayed','an out-of-order duplicate for a settled attempt settles nothing further');
select is((select count(*)::integer from app.bookings
  where hold_id=current_setting('test.pb_hold')::uuid),1,
  'still one booking');
rollback to savepoint pb_full_payment;

-- ---------------------------------------------------------------------------
-- Nothing a browser can change alters what is owed or what is confirmed.
savepoint pb_tampering;
select set_config('test.pb_hold',pg_temp.pb_hold('10:00','session-token-pb03-0001','idem-key-pb03-000001')::text,true);
select set_config('test.pb_attempt',(select c.payment_attempt_id::text
  from pg_temp.pb_checkout(current_setting('test.pb_hold')::uuid,
    'session-token-pb03-0001','idem-key-pb03-000002')
    as c(payment_attempt_id uuid, due_minor bigint, balance_minor bigint,
         total_minor bigint, payment_mode text)),true);
select * from api_v1.attach_checkout_reference_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.pb_attempt')::uuid,'cs_test_pb03');

-- Someone reports a success for one currency unit.
select throws_ok(
  $$select * from api_v1.record_payment_event_v1(
    'a0000000-0000-0000-0000-000000000001','stripe','evt_pb03_low',
    'checkout.session.completed','cs_test_pb03','succeeded',1,'USD','ch_pb03_low')$$,
  '42501','payment_not_verified',
  'a success for an amount the server never asked for is not a success');
select is((select count(*)::integer from app.bookings
  where hold_id=current_setting('test.pb_hold')::uuid),0,
  'and confirms nothing');

-- A guest cannot present someone else's verified payment for their own hold.
select set_config('test.pb_other',pg_temp.pb_hold('11:00','session-token-pb03-9999','idem-key-pb03-000009')::text,true);
select throws_ok(
  format($$select * from private.confirm_booking_v1(
    'client.tenant-a.example.invalid','client',%L,'session-token-pb03-9999',
    'confirm-key-pb03-9999','{"fullName":"Other Guest","email":"other@example.invalid"}'::jsonb,
    '1','en','{}'::jsonb,null,%L)$$,
    current_setting('test.pb_other'),current_setting('test.pb_attempt')),
  '42501','booking_context_required',
  'a payment made against one hold cannot confirm a different hold, and is '
  'answered as an unknown hold rather than as a rejected payment');

-- An event naming an object we never created is recorded and refused.
select is((select r.outcome from api_v1.record_payment_event_v1(
  'a0000000-0000-0000-0000-000000000001','stripe','evt_pb03_ghost',
  'checkout.session.completed','cs_not_ours','succeeded',null,null,'ch_ghost') r),
  'ignored','an event for an object this platform never created settles nothing');
select is((select e.processing_error from app.payment_webhook_events e
  where e.provider_event_reference='evt_pb03_ghost'),'unknown_object',
  'and is recorded with its reason rather than silently dropped');
rollback to savepoint pb_tampering;

-- ---------------------------------------------------------------------------
-- Money that arrives for capacity we no longer have.
savepoint pb_late_success;
select set_config('test.pb_hold',pg_temp.pb_hold('10:00','session-token-pb04-0001','idem-key-pb04-000001')::text,true);
select set_config('test.pb_attempt',(select c.payment_attempt_id::text
  from pg_temp.pb_checkout(current_setting('test.pb_hold')::uuid,
    'session-token-pb04-0001','idem-key-pb04-000002')
    as c(payment_attempt_id uuid, due_minor bigint, balance_minor bigint,
         total_minor bigint, payment_mode text)),true);
select * from api_v1.attach_checkout_reference_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.pb_attempt')::uuid,'cs_test_pb04');

-- The customer took too long at the provider and the hold expired.
update app.booking_holds set expires_at=statement_timestamp()-interval '1 minute'
where id=current_setting('test.pb_hold')::uuid;

select is((select array[r.outcome,r.exception_code] from api_v1.record_payment_event_v1(
  'a0000000-0000-0000-0000-000000000001','stripe','evt_pb04_1',
  'checkout.session.completed','cs_test_pb04','succeeded',null,null,'ch_pb04') r),
  array['exception','hold_lost'],
  'a verified success after the hold is gone is an exception with a name');
select is((select count(*)::integer from app.bookings
  where hold_id=current_setting('test.pb_hold')::uuid),0,
  'nothing is overbooked');
select is((select count(*)::integer from app.commerce_ledger_entries
  where tenant_id='a0000000-0000-0000-0000-000000000001' and entry_type='charge'),1,
  'the money is still recorded, because it really did move');
select is((select array[r.status,r.reason] from app.payment_refunds r
  where r.tenant_id='a0000000-0000-0000-0000-000000000001'),
  array['eligible','requested_by_customer'],
  'and a refund is queued rather than performed inside this transaction');
select is((select a.status from app.payment_attempts a
  where a.id=current_setting('test.pb_attempt')::uuid),'exception',
  'the attempt says what it is');
select is((select s.exception_code from api_v1.get_checkout_status_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.pb_hold')::uuid,
  'session-token-pb04-0001') s),'hold_lost',
  'and the returning customer is told, in a word the client can localize');
rollback to savepoint pb_late_success;

-- ---------------------------------------------------------------------------
-- Deposits leave a balance, and the balance is the server's number.
savepoint pb_deposit;
update app.catalog_service_revisions
set payment_mode='deposit', policy=policy||'{"deposit_percent_bps":2500}'::jsonb
where tenant_id='a0000000-0000-0000-0000-000000000001'
  and service_id='a7200000-0000-0000-0000-000000000001';
select set_config('test.pb_hold',pg_temp.pb_hold('10:00','session-token-pb05-0001','idem-key-pb05-000001')::text,true);
select set_config('test.pb_due',(select c.due_minor::text
  from pg_temp.pb_checkout(current_setting('test.pb_hold')::uuid,
    'session-token-pb05-0001','idem-key-pb05-000002')
    as c(payment_attempt_id uuid, due_minor bigint, balance_minor bigint,
         total_minor bigint, payment_mode text)),true);
select set_config('test.pb_attempt',(select a.id::text from app.payment_attempts a
  where a.hold_id=current_setting('test.pb_hold')::uuid),true);

select is((select array[a.purpose,a.amount_minor_units::text,a.balance_minor_units::text]
  from app.payment_attempts a where a.id=current_setting('test.pb_attempt')::uuid),
  array['deposit','4500','13500'],
  'a quarter deposit on the published 180.00 service is 45.00 now and 135.00 owed');
select is((select a.amount_minor_units + a.balance_minor_units from app.payment_attempts a
  where a.id=current_setting('test.pb_attempt')::uuid),
  (select sr.price_minor + (sr.price_minor*sr.tax_rate_bps)/10000
   from app.catalog_service_revisions sr
   where sr.tenant_id='a0000000-0000-0000-0000-000000000001'
     and sr.service_id='a7200000-0000-0000-0000-000000000001'
     and sr.state='published' and sr.locale='en'),
  'and the deposit plus the balance is exactly the published total, always');
select is((select s.deposit_minor_units from app.payment_price_snapshots s
  where s.hold_id=current_setting('test.pb_hold')::uuid),4500::bigint,
  'the price snapshot records it before the customer saw any amount');

select * from api_v1.attach_checkout_reference_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.pb_attempt')::uuid,'cs_test_pb05');
select is((select r.outcome from api_v1.record_payment_event_v1(
  'a0000000-0000-0000-0000-000000000001','stripe','evt_pb05_1',
  'checkout.session.completed','cs_test_pb05','succeeded',null,null,'ch_pb05') r),
  'confirmed','a verified deposit confirms the booking');
select is((select b.payment_status from app.bookings b
  where b.hold_id=current_setting('test.pb_hold')::uuid),'succeeded',
  'the payment that was due has moved, so the payment state is succeeded');
select is((select l.amount_minor_units from app.commerce_ledger_entries l
  where l.tenant_id='a0000000-0000-0000-0000-000000000001' and l.entry_type='charge'),
  4500::bigint,'and the ledger records the deposit, not the total');
select is((select s.booking_id from app.payment_price_snapshots s
  where s.hold_id=current_setting('test.pb_hold')::uuid),
  (select b.id from app.bookings b where b.hold_id=current_setting('test.pb_hold')::uuid),
  'the price snapshot is attached to the booking it priced');
rollback to savepoint pb_deposit;

-- ---------------------------------------------------------------------------
-- Refusals before money, not after.
savepoint pb_refusals;
select set_config('test.pb_hold',pg_temp.pb_hold('10:00','session-token-pb06-0001','idem-key-pb06-000001')::text,true);

-- A free service has nothing to check out.
update app.catalog_service_revisions set payment_mode='none'
where tenant_id='a0000000-0000-0000-0000-000000000001'
  and service_id='a7200000-0000-0000-0000-000000000001';
select throws_ok(
  format($$select * from api_v1.begin_checkout_v1('client.tenant-a.example.invalid','client',
    %L,'session-token-pb06-0001','idem-key-pb06-000002',
    '{"fullName":"Paid Guest","email":"paid@example.invalid"}'::jsonb,'1')$$,
    current_setting('test.pb_hold')),
  '42501','checkout_not_ready','a free service refuses a checkout rather than charging zero');

-- An approval-gated service decides before it charges.
update app.catalog_service_revisions set payment_mode='full', approval_required=true
where tenant_id='a0000000-0000-0000-0000-000000000001'
  and service_id='a7200000-0000-0000-0000-000000000001';
select throws_ok(
  format($$select * from api_v1.begin_checkout_v1('client.tenant-a.example.invalid','client',
    %L,'session-token-pb06-0001','idem-key-pb06-000003',
    '{"fullName":"Paid Guest","email":"paid@example.invalid"}'::jsonb,'1')$$,
    current_setting('test.pb_hold')),
  '42501','checkout_not_ready',
  'a request that might be declined is never charged first');
update app.catalog_service_revisions set approval_required=false
where tenant_id='a0000000-0000-0000-0000-000000000001'
  and service_id='a7200000-0000-0000-0000-000000000001';

-- A tenant whose account cannot charge refuses recoverably.
update app.payment_accounts set charges_enabled=false
where id='e9000000-0000-0000-0000-000000000001';
select throws_ok(
  format($$select * from api_v1.begin_checkout_v1('client.tenant-a.example.invalid','client',
    %L,'session-token-pb06-0001','idem-key-pb06-000004',
    '{"fullName":"Paid Guest","email":"paid@example.invalid"}'::jsonb,'1')$$,
    current_setting('test.pb_hold')),
  '42501','checkout_not_ready',
  'a restricted connected account refuses before the customer is asked for money');
update app.payment_accounts set charges_enabled=true
where id='e9000000-0000-0000-0000-000000000001';

-- Consenting to a superseded policy is refused here too, not only at confirm.
select throws_ok(
  format($$select * from api_v1.begin_checkout_v1('client.tenant-a.example.invalid','client',
    %L,'session-token-pb06-0001','idem-key-pb06-000005',
    '{"fullName":"Paid Guest","email":"paid@example.invalid"}'::jsonb,'99')$$,
    current_setting('test.pb_hold')),
  '42501','policy_denied','a superseded consent version is refused before checkout');

-- Another session cannot open a checkout against this hold, and cannot read it.
select throws_ok(
  format($$select * from api_v1.begin_checkout_v1('client.tenant-a.example.invalid','client',
    %L,'session-token-pb06-intruder','idem-key-pb06-000006',
    '{"fullName":"Intruder","email":"intruder@example.invalid"}'::jsonb,'1')$$,
    current_setting('test.pb_hold')),
  '42501','booking_context_required',
  'a hold belongs to the session that created it');
select throws_ok(
  format($$select * from api_v1.get_checkout_status_v1('client.tenant-a.example.invalid',
    'client',%L,'session-token-pb06-intruder')$$,current_setting('test.pb_hold')),
  '42501','booking_context_required',
  'and an unknown hold and someone else''s hold are the same answer');
select is((select count(*)::integer from app.booking_drafts
  where hold_id=current_setting('test.pb_hold')::uuid),0,
  'every refusal above stored nothing');
rollback to savepoint pb_refusals;

-- ---------------------------------------------------------------------------
-- Idempotency and the customer who keeps clicking.
savepoint pb_idempotency;
select set_config('test.pb_hold',pg_temp.pb_hold('10:00','session-token-pb07-0001','idem-key-pb07-000001')::text,true);
select set_config('test.pb_attempt',(select c.payment_attempt_id::text
  from pg_temp.pb_checkout(current_setting('test.pb_hold')::uuid,
    'session-token-pb07-0001','idem-key-pb07-000002')
    as c(payment_attempt_id uuid, due_minor bigint, balance_minor bigint,
         total_minor bigint, payment_mode text)),true);
select is((select c.payment_attempt_id::text
  from pg_temp.pb_checkout(current_setting('test.pb_hold')::uuid,
    'session-token-pb07-0001','idem-key-pb07-000002')
    as c(payment_attempt_id uuid, due_minor bigint, balance_minor bigint,
         total_minor bigint, payment_mode text)),
  current_setting('test.pb_attempt'),
  'a double-submitted checkout returns the attempt it already opened');
select is((select count(*)::integer from app.payment_attempts
  where hold_id=current_setting('test.pb_hold')::uuid),1,
  'and opens exactly one attempt against the capacity');
-- A fresh key for the same hold resumes rather than opening a rival attempt.
select is((select c.payment_attempt_id::text
  from pg_temp.pb_checkout(current_setting('test.pb_hold')::uuid,
    'session-token-pb07-0001','idem-key-pb07-000003')
    as c(payment_attempt_id uuid, due_minor bigint, balance_minor bigint,
         total_minor bigint, payment_mode text)),
  current_setting('test.pb_attempt'),
  'a new key for the same hold resumes the live attempt, never a second one');
select throws_ok(
  format($$select * from api_v1.begin_checkout_v1('client.tenant-a.example.invalid','client',
    %L,'session-token-pb07-0001','idem-key-pb07-000002',
    '{"fullName":"Paid Guest","email":"paid@example.invalid"}'::jsonb,'1','ar')$$,
    current_setting('test.pb_hold')),
  '23505','idempotency_conflict',
  'the same key with a different request is a conflict, not a silent overwrite');
rollback to savepoint pb_idempotency;

-- ---------------------------------------------------------------------------
-- Failure, cancellation, and the states a customer can recover from.
savepoint pb_failure;
select set_config('test.pb_hold',pg_temp.pb_hold('10:00','session-token-pb08-0001','idem-key-pb08-000001')::text,true);
select set_config('test.pb_attempt',(select c.payment_attempt_id::text
  from pg_temp.pb_checkout(current_setting('test.pb_hold')::uuid,
    'session-token-pb08-0001','idem-key-pb08-000002')
    as c(payment_attempt_id uuid, due_minor bigint, balance_minor bigint,
         total_minor bigint, payment_mode text)),true);
select * from api_v1.attach_checkout_reference_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.pb_attempt')::uuid,'cs_test_pb08');

select is((select r.outcome from api_v1.record_payment_event_v1(
  'a0000000-0000-0000-0000-000000000001','stripe','evt_pb08_fail',
  'checkout.session.async_payment_failed','cs_test_pb08','failed') r),
  'failed','a reported failure is recorded as a failure');
select is((select a.status from app.payment_attempts a
  where a.id=current_setting('test.pb_attempt')::uuid),'failed',
  'the attempt says so');
select is((select count(*)::integer from app.commerce_ledger_entries
  where tenant_id='a0000000-0000-0000-0000-000000000001'),0,
  'and no money reaches the ledger for a payment that never moved');
select is((select h.state from app.booking_holds h
  where h.id=current_setting('test.pb_hold')::uuid),'active',
  'the hold survives a failed payment, so the customer can try again inside its life');
select is((select s.status from api_v1.get_checkout_status_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.pb_hold')::uuid,
  'session-token-pb08-0001') s),'failed',
  'and the customer can see a recoverable failure rather than a blank page');

-- Trying again reuses the hold and opens a new attempt, because the old one is
-- no longer live.
select isnt((select c.payment_attempt_id::text
  from pg_temp.pb_checkout(current_setting('test.pb_hold')::uuid,
    'session-token-pb08-0001','idem-key-pb08-000003')
    as c(payment_attempt_id uuid, due_minor bigint, balance_minor bigint,
         total_minor bigint, payment_mode text)),
  current_setting('test.pb_attempt'),
  'a retry after a failure is a new attempt against the same held capacity');
rollback to savepoint pb_failure;

-- ---------------------------------------------------------------------------
-- Cross-tenant isolation of the whole surface.
savepoint pb_isolation;
select set_config('test.pb_hold',pg_temp.pb_hold('10:00','session-token-pb09-0001','idem-key-pb09-000001')::text,true);
select throws_ok(
  format($$select * from api_v1.begin_checkout_v1('client.tenant-b.example.invalid','client',
    %L,'session-token-pb09-0001','idem-key-pb09-000002',
    '{"fullName":"Paid Guest","email":"paid@example.invalid"}'::jsonb,'1')$$,
    current_setting('test.pb_hold')),
  '42501','booking_context_required',
  'another tenant''s hostname cannot open a checkout on this tenant''s hold');
select throws_ok(
  format($$select * from api_v1.get_checkout_status_v1('client.tenant-b.example.invalid',
    'client',%L,'session-token-pb09-0001')$$,current_setting('test.pb_hold')),
  '42501','booking_context_required',
  'nor read what happened to it');
rollback to savepoint pb_isolation;

-- The savepoint rollbacks above revert pgTAP's own counter, so it is restored
-- from the non-transactional sequence before the plan is emitted.
select _set('curr_test',(select last_value::integer from __tresults___numb_seq));
select * from finish();
rollback;
