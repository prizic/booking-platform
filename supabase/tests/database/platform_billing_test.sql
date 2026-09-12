begin;
select no_plan();

-- Issue #37. Platform billing, and the line between it and booking money.
--
-- The separation is the point, so it is asserted structurally rather than
-- described: no foreign key crosses between a subscription and a charge, and
-- the surface a tenant's billing administrator reads cannot name a customer
-- because it does not select from anywhere a customer lives.

do $$ begin
  execute format('grant usage on schema %I to authenticated',pg_my_temp_schema()::regnamespace::text);
end $$;

create function pg_temp.become_operator(p_role text default 'admin') returns void
language plpgsql as $$
begin
  insert into control_plane.operators(auth_user_id,email,role)
  values ('a1000000-0000-0000-0000-000000000002','admin-a@example.invalid',p_role)
  on conflict (auth_user_id) do update set role=excluded.role;
  perform set_config('request.jwt.claims',
    '{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
end $$;

create function pg_temp.become_worker() returns void
language plpgsql as $$ begin perform set_config('request.jwt.claims',null,true); end $$;

-- ---------------------------------------------------------------------------
-- The two moneys never touch.
select ok(not exists (
  select 1
  from pg_constraint as fk
  join pg_class as child on child.oid = fk.conrelid
  join pg_namespace as child_schema on child_schema.oid = child.relnamespace
  join pg_class as parent on parent.oid = fk.confrelid
  join pg_namespace as parent_schema on parent_schema.oid = parent.relnamespace
  where fk.contype = 'f'
    and (
      (child_schema.nspname = 'control_plane'
        and parent.relname in ('payment_attempts','payment_charges','payment_refunds',
          'commerce_ledger_entries','payment_accounts','bookings','customers'))
      or (parent_schema.nspname = 'control_plane'
        and child.relname in ('payment_attempts','payment_charges','payment_refunds',
          'commerce_ledger_entries','payment_accounts','bookings','customers'))
    )),
  'no foreign key joins platform billing to booking money: a tenant''s customers '
  'pay the tenant, the tenant pays us, and a schema where one can read the other '
  'is a schema where a refund can settle a subscription');

select ok(
  pg_get_function_result('api_v1.get_billing_overview_v1(uuid)'::regprocedure)
    !~* '(customer|charge|refund|payout|booking_id|email|phone)',
  'and the tenant-facing billing surface carries no customer, charge, refund or '
  'payout column at all');

select ok(not exists(
  select 1 from information_schema.table_privileges
  where table_schema='control_plane'
    and table_name in ('billing_accounts','invoices','invoice_lines','usage_events',
      'usage_counters','billing_credits','tenant_restrictions','plan_revisions','meters')
    and grantee in ('anon','authenticated','PUBLIC')),
  'no application role is granted anything on a billing table');

-- ---------------------------------------------------------------------------
-- A tenant cannot raise its own ceiling or grant itself a feature.
select ok(has_table_privilege('authenticated','app.tenant_quotas','select'),
  'a member can read the quotas their plan bought');
select ok(not exists(
  select 1 from (values ('INSERT'),('UPDATE'),('DELETE')) as command(privilege)
  where has_table_privilege('authenticated','app.tenant_quotas',command.privilege)),
  'and cannot write them: a tenant that can edit its own ceiling does not have one');
select ok(not exists(
  select 1 from (values ('INSERT'),('UPDATE'),('DELETE')) as command(privilege)
  where has_table_privilege('authenticated','app.tenant_entitlements',command.privilege)),
  'nor grant itself a feature it has not bought');

-- ---------------------------------------------------------------------------
-- Metering: one event, however many deliveries.
savepoint pb_meter;
select pg_temp.become_worker();

select ok((select m.recorded from control_plane.record_usage_event_v1(
  'a0000000-0000-0000-0000-000000000001','bookings.committed','evt-1',1,
  '2026-03-05T10:00:00Z'::timestamptz,'booking') m),
  'a usage event is recorded');
select ok((select m.duplicate from control_plane.record_usage_event_v1(
  'a0000000-0000-0000-0000-000000000001','bookings.committed','evt-1',1,
  '2026-03-05T10:00:00Z'::timestamptz,'booking') m),
  'and the same event key again is recognised as a duplicate, because a usage '
  'pipeline that cannot be retried loses events the first time a network blips');
select is((select count(*)::integer from control_plane.usage_events e
  where e.tenant_id='a0000000-0000-0000-0000-000000000001'),1,
  'the database holds one event, not two');

select throws_ok(
  $$select * from control_plane.record_usage_event_v1(
    'a0000000-0000-0000-0000-000000000001','bookings.invented','evt-2',1)$$,
  '22023','meter_unknown','a meter nobody defined cannot be billed for');

-- Aggregation follows the meter's own rule.
select * from control_plane.record_usage_event_v1(
  'a0000000-0000-0000-0000-000000000001','bookings.committed','evt-2',1,
  '2026-03-06T10:00:00Z'::timestamptz,'booking');
select * from control_plane.record_usage_event_v1(
  'a0000000-0000-0000-0000-000000000001','staff.active','seat-1',3,
  '2026-03-05T10:00:00Z'::timestamptz,'workspace');
select * from control_plane.record_usage_event_v1(
  'a0000000-0000-0000-0000-000000000001','staff.active','seat-2',7,
  '2026-03-06T10:00:00Z'::timestamptz,'workspace');
select * from control_plane.record_usage_event_v1(
  'a0000000-0000-0000-0000-000000000001','staff.active','seat-3',4,
  '2026-03-07T10:00:00Z'::timestamptz,'workspace');

select * from control_plane.aggregate_usage_v1('a0000000-0000-0000-0000-000000000001',
  '2026-03-01T00:00:00Z'::timestamptz,'2026-04-01T00:00:00Z'::timestamptz);
select is((select c.quantity from control_plane.usage_counters c
  where c.tenant_id='a0000000-0000-0000-0000-000000000001' and c.meter_key='bookings.committed'),
  2::bigint,'bookings are a sum');
select is((select c.quantity from control_plane.usage_counters c
  where c.tenant_id='a0000000-0000-0000-0000-000000000001' and c.meter_key='staff.active'),
  7::bigint,'seats are a high-water mark, because a tenant that had seven people '
  'in March had seven people in March');

-- Aggregating twice recomputes rather than accumulating.
select * from control_plane.aggregate_usage_v1('a0000000-0000-0000-0000-000000000001',
  '2026-03-01T00:00:00Z'::timestamptz,'2026-04-01T00:00:00Z'::timestamptz);
select is((select c.quantity from control_plane.usage_counters c
  where c.tenant_id='a0000000-0000-0000-0000-000000000001' and c.meter_key='bookings.committed'),
  2::bigint,'a counter is derived, so recomputing it is free');
rollback to savepoint pb_meter;

-- ---------------------------------------------------------------------------
-- Plans grant, revoke, and cap.
savepoint pb_plan;
select pg_temp.become_operator('operator');
select is((select p.plan_revision from control_plane.change_plan_v1(
  'a0000000-0000-0000-0000-000000000001','launch') p),1,'a plan change records its revision');
select is((select q.limit_quantity from app.tenant_quotas q
  where q.tenant_id='a0000000-0000-0000-0000-000000000001' and q.meter_key='staff.active'),
  25::bigint,'and projects the plan''s ceilings into the table the product reads');
select ok((select count(*) from app.tenant_entitlements e
  where e.tenant_id='a0000000-0000-0000-0000-000000000001' and e.granted) >= 6,
  'and the plan''s feature list with it');

-- A downgrade has to remove, not merely fail to add.
insert into control_plane.plans(key,name,entitlements)
values ('starter','Starter',array['booking.online']);
insert into control_plane.plan_revisions(plan_key,revision,effective_from,currency,
  base_price_minor,included,unit_prices,entitlements,quotas)
values ('starter',1,'2026-01-01T00:00:00Z','SAR',9900,'{}'::jsonb,'{}'::jsonb,
  array['booking.online'],'{"staff.active":3}'::jsonb);
select * from control_plane.change_plan_v1('a0000000-0000-0000-0000-000000000001','starter');
select is((select count(*)::integer from app.tenant_entitlements e
  where e.tenant_id='a0000000-0000-0000-0000-000000000001' and e.granted),1,
  'downgrading revokes what the new plan does not include');
select is((select q.limit_quantity from app.tenant_quotas q
  where q.tenant_id='a0000000-0000-0000-0000-000000000001' and q.meter_key='staff.active'),
  3::bigint,'and replaces the ceiling rather than leaving the old one behind');
select is((select count(*)::integer from app.tenant_quotas q
  where q.tenant_id='a0000000-0000-0000-0000-000000000001' and q.meter_key='locations.active'),
  0,'a ceiling the new plan does not define is removed, not inherited');
select set_config('request.jwt.claims',null,true);
rollback to savepoint pb_plan;

-- ---------------------------------------------------------------------------
-- Invoicing: once per period, and reconcilable afterwards.
savepoint pb_invoice;
select pg_temp.become_operator('operator');
select * from control_plane.change_plan_v1('a0000000-0000-0000-0000-000000000001','launch',1,
  '2026-03-01T00:00:00Z'::timestamptz,'2026-04-01T00:00:00Z'::timestamptz);
select pg_temp.become_worker();

-- 600 bookings against an allowance of 500.
do $$ declare i integer; begin
  for i in 1..6 loop
    perform control_plane.record_usage_event_v1('a0000000-0000-0000-0000-000000000001',
      'bookings.committed','batch-'||i,100,'2026-03-10T10:00:00Z'::timestamptz,'booking');
  end loop;
end $$;
select * from control_plane.aggregate_usage_v1('a0000000-0000-0000-0000-000000000001',
  '2026-03-01T00:00:00Z'::timestamptz,'2026-04-01T00:00:00Z'::timestamptz);

select is((select i.total_minor from control_plane.issue_invoice_v1(
  'a0000000-0000-0000-0000-000000000001',
  '2026-03-01T00:00:00Z'::timestamptz,'2026-04-01T00:00:00Z'::timestamptz) i),
  54900::bigint,
  'the invoice is the base price plus the hundred bookings over the allowance, '
  'at the plan revision''s own unit price');

select ok((select i.replayed from control_plane.issue_invoice_v1(
  'a0000000-0000-0000-0000-000000000001',
  '2026-03-01T00:00:00Z'::timestamptz,'2026-04-01T00:00:00Z'::timestamptz) i),
  'running the biller again returns the same invoice rather than a second one');
select is((select count(*)::integer from control_plane.invoices i
  where i.tenant_id='a0000000-0000-0000-0000-000000000001'),1,
  'and the database holds one invoice for the period');

-- Every usage line reconciles to a counter and the revision it was billed at.
select is(
  (select l.quantity from control_plane.invoice_lines l
   join control_plane.invoices i on i.id=l.invoice_id
   where i.tenant_id='a0000000-0000-0000-0000-000000000001' and l.kind='usage'
     and l.meter_key='bookings.committed'),
  100::bigint,
  'a usage line is the counter minus what the plan included, which is the only '
  'way somebody can check it a year later');
select isnt((select l.meter_version from control_plane.invoice_lines l
  join control_plane.invoices i on i.id=l.invoice_id
  where i.tenant_id='a0000000-0000-0000-0000-000000000001' and l.kind='usage' limit 1),
  null,'and names the meter definition it billed, because "bookings" meant '
  'something in January and may mean something else in June');

-- A late event does not rewrite an invoice somebody has already been sent.
select ok((select m.late from control_plane.record_usage_event_v1(
  'a0000000-0000-0000-0000-000000000001','bookings.committed','straggler',40,
  '2026-03-15T10:00:00Z'::timestamptz,'booking') m),
  'an event for a period that has already been invoiced is flagged late');
select is((select c.quantity from control_plane.usage_counters c
  where c.tenant_id='a0000000-0000-0000-0000-000000000001'
    and c.meter_key='bookings.committed'),600::bigint,
  'the closed counter is unchanged: silently changing a number somebody has '
  'already paid is worse than billing it late');

select * from control_plane.aggregate_usage_v1('a0000000-0000-0000-0000-000000000001',
  '2026-04-01T00:00:00Z'::timestamptz,'2026-05-01T00:00:00Z'::timestamptz);
select * from control_plane.issue_invoice_v1('a0000000-0000-0000-0000-000000000001',
  '2026-04-01T00:00:00Z'::timestamptz,'2026-05-01T00:00:00Z'::timestamptz);
select is(
  (select l.quantity from control_plane.invoice_lines l
   join control_plane.invoices i on i.id=l.invoice_id
   where i.tenant_id='a0000000-0000-0000-0000-000000000001' and l.kind='adjustment'),
  40::bigint,
  'it lands on the next invoice as an adjustment instead');
select set_config('request.jwt.claims',null,true);
rollback to savepoint pb_invoice;

-- ---------------------------------------------------------------------------
-- A trial owes nothing, and still says what renewal costs.
savepoint pb_trial;
select pg_temp.become_operator('operator');
-- A trial that has not ended yet, whenever this suite runs.
select * from control_plane.change_plan_v1('a0000000-0000-0000-0000-000000000001','launch',1,
  '2026-03-01T00:00:00Z'::timestamptz,'2026-04-01T00:00:00Z'::timestamptz,
  statement_timestamp() + interval '14 days');
select is((select s.state from control_plane.subscriptions s
  where s.tenant_id='a0000000-0000-0000-0000-000000000001'),'trialing',
  'a subscription with a future trial end is trialing');
select pg_temp.become_worker();
select is((select i.total_minor from control_plane.issue_invoice_v1(
  'a0000000-0000-0000-0000-000000000001',
  '2026-03-01T00:00:00Z'::timestamptz,'2026-04-01T00:00:00Z'::timestamptz) i),
  0::bigint,'and owes nothing for the period');
select is((select l.unit_price_minor from control_plane.invoice_lines l
  join control_plane.invoices i on i.id=l.invoice_id
  where i.tenant_id='a0000000-0000-0000-0000-000000000001' and l.kind='base'),
  49900::bigint,
  'while still showing what the plan costs, because an invoice that hides the '
  'price teaches nobody what renewal will be');
select set_config('request.jwt.claims',null,true);
rollback to savepoint pb_trial;

-- ---------------------------------------------------------------------------
-- Credits are consumed oldest first and never exceed what is owed.
savepoint pb_credit;
select pg_temp.become_operator('admin');
select * from control_plane.change_plan_v1('a0000000-0000-0000-0000-000000000001','launch',1,
  '2026-03-01T00:00:00Z'::timestamptz,'2026-04-01T00:00:00Z'::timestamptz);
select * from control_plane.apply_credit_v1('a0000000-0000-0000-0000-000000000001',20000,'goodwill for the March incident');
select * from control_plane.apply_credit_v1('a0000000-0000-0000-0000-000000000001',90000,'migration credit');
select pg_temp.become_worker();
select is((select i.total_minor from control_plane.issue_invoice_v1(
  'a0000000-0000-0000-0000-000000000001',
  '2026-03-01T00:00:00Z'::timestamptz,'2026-04-01T00:00:00Z'::timestamptz) i),
  0::bigint,'credit covering the whole invoice leaves nothing to pay');
select is((select c.consumed_minor from control_plane.billing_credits c
  where c.reason='goodwill for the March incident'),20000::bigint,
  'the oldest credit is consumed first');
select is((select c.consumed_minor from control_plane.billing_credits c
  where c.reason='migration credit'),29900::bigint,
  'and the next only as far as the invoice went, so the rest survives for the '
  'following month');
select set_config('request.jwt.claims',null,true);
rollback to savepoint pb_credit;

-- ---------------------------------------------------------------------------
-- Restriction: reasoned, audited, reversible, and never destructive.
savepoint pb_restrict;
select pg_temp.become_operator('admin');
select * from control_plane.change_plan_v1('a0000000-0000-0000-0000-000000000001','launch');
select is((select r.kind from control_plane.set_tenant_restriction_v1(
  'a0000000-0000-0000-0000-000000000001','new_bookings_paused','sixty days past due') r),
  'new_bookings_paused','an admin can restrict a tenant');
select is((select a.state from control_plane.billing_accounts a
  where a.tenant_id='a0000000-0000-0000-0000-000000000001'),'restricted',
  'and the account says so');
select throws_ok(
  $$select * from control_plane.set_tenant_restriction_v1(
    'a0000000-0000-0000-0000-000000000001','new_bookings_paused','x')$$,
  '22023','settings_invalid',
  'a restriction without a real reason cannot be applied: the reason is what '
  'the tenant is owed when they ask why');
select ok(exists(select 1 from control_plane.audit_events a
  where a.action='billing.restriction_applied'
    and a.detail->>'reason'='sixty days past due'),
  'every restriction records who, why and until when');

select ok(exists(select 1 from private.active_tenant_restrictions_v1(
  'a0000000-0000-0000-0000-000000000001') r where r.kind='new_bookings_paused'),
  'the product can read the restriction it must honour');

-- Nothing is destroyed. The restriction kinds stop new work; none of them
-- touches a tenant's data or a customer's existing booking.
select ok(not exists(
  select 1 from pg_constraint where conname like '%tenant_restrictions%'
    and pg_get_constraintdef(oid) like '%cascade%'),
  'and no restriction cascades a delete anywhere');

select ok((select v.revoked from control_plane.revoke_tenant_restriction_v1(
  (select r.id from control_plane.tenant_restrictions r
   where r.tenant_id='a0000000-0000-0000-0000-000000000001' limit 1),
  'payment received') v),'it can be lifted');
select is((select a.state from control_plane.billing_accounts a
  where a.tenant_id='a0000000-0000-0000-0000-000000000001'),'active',
  'and the account reactivates once nothing else is holding the tenant down');
select is((select count(*)::integer from private.active_tenant_restrictions_v1(
  'a0000000-0000-0000-0000-000000000001')),0,'with nothing left for the product to honour');
select set_config('request.jwt.claims',null,true);
rollback to savepoint pb_restrict;

-- ---------------------------------------------------------------------------
-- Who may read what a tenant owes.
savepoint pb_role;
select pg_temp.become_operator('operator');
select * from control_plane.change_plan_v1('a0000000-0000-0000-0000-000000000001','launch',1,
  '2026-03-01T00:00:00Z'::timestamptz,'2026-04-01T00:00:00Z'::timestamptz);
select set_config('request.jwt.claims',null,true);

-- The tenant administrator holds `billing.view` directly.
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select o.plan_key from api_v1.get_billing_overview_v1(
  'a0000000-0000-0000-0000-000000000001') o),'launch',
  'a tenant administrator can read their own plan');
select is((select o.restrictions from api_v1.get_billing_overview_v1(
  'a0000000-0000-0000-0000-000000000001') o),'[]'::jsonb,
  'and sees no restriction when there is none');
reset role;

-- A staff member is a member of the same tenant and holds no billing capability.
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok(
  $$select * from api_v1.get_billing_overview_v1('a0000000-0000-0000-0000-000000000001')$$,
  '42501','policy_denied',
  'being a member is not being a billing administrator');
reset role;

-- Another tenant's administrator is refused by the same check.
select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok(
  $$select * from api_v1.get_billing_overview_v1('a0000000-0000-0000-0000-000000000001')$$,
  '42501','policy_denied','and nobody reads another tenant''s billing at all');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint pb_role;

-- The savepoint rollbacks above revert pgTAP's own counter, so it is restored
-- from the non-transactional sequence before the plan is emitted.
select _set('curr_test',(select last_value::integer from __tresults___numb_seq));
select * from finish();
rollback;
