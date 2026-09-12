-- Issue #23: everything that happens to money after a payment succeeds.
--
-- Issue #15 already decided *whether* a cancellation earns a refund and *how
-- much*: `bookings.refund_eligible_minor` and `refund_percent_bps` are computed
-- from the snapshotted policy at cancellation time. This migration does not
-- recompute any of that. It executes it, and handles everything that can go
-- wrong afterwards.
--
--   request_refund_v1     one canonical refund from eligibility already decided
--   claim_refund_batch_v1 a worker claims it under a visibility timeout
--   record_refund_result  what the provider said, durably
--   record_payment_event  verified webhooks for refunds, disputes, transfers
--   reconcile_commerce_v1 finds what never arrived and says so out loud
--
-- Money is append-only. A historical ledger entry is never edited; a correction
-- is a compensating entry that references what it corrects. The ledger is the
-- explanation, so it has to stay the record of what actually happened rather
-- than a summary of what we currently believe.
--
-- What this deliberately does NOT add:
--
--   * no second webhook intake. Issue #22's `record_payment_event_v1` is
--     generalized from checkout-only to every provider object kind, because two
--     intakes would mean two dedup rules and two places for ordering to drift.
--   * no per-problem queue. Refund failures, disputes, payout failures, lost
--     account capability and reconciliation mismatches are one
--     `app.payment_exceptions` table with a `kind`. Five tables would be five
--     RLS policies, five read surfaces and five ways to forget one.
--   * no new refund eligibility rule. `resolve_refund_percent_bps_v1` from #15
--     is the only thing that decides a percentage.
--   * no booking status for money. `payment_status`, refund state and dispute
--     state stay separate columns (invariant 9). A disputed booking is still a
--     booking that happened.
--
-- Error vocabulary. Published strings reused; this migration adds two:
--   refund_not_eligible  42501  nothing about this booking earns this refund
--   exception_resolved   23505  the queue item was already settled by somebody
--
-- Ordering. Providers deliver out of order and retry for days. Every inbound
-- event carries `occurred_at`; an event older than the state it would change is
-- recorded and ignored rather than allowed to walk a terminal state backwards.

-- ---------------------------------------------------------------------------
-- 1. Vocabulary
-- ---------------------------------------------------------------------------

alter table app.idempotency_keys drop constraint idempotency_keys_operation_check;
alter table app.idempotency_keys add constraint idempotency_keys_operation_check
  check (operation in ('create_hold_v1','confirm_booking_v1','cancel_booking_v1',
    'reschedule_booking_v1','transition_booking_v1','begin_checkout_v1',
    'request_refund_v1'));
alter table app.idempotency_keys drop constraint idempotency_keys_result_kind_check;
alter table app.idempotency_keys add constraint idempotency_keys_result_kind_check
  check (result_kind in ('hold','booking','payment_attempt','refund'));

alter table app.outbox_events drop constraint outbox_events_topic_check;
alter table app.outbox_events add constraint outbox_events_topic_check
  check (topic in ('booking.confirmed','booking.requested','booking.rejected',
    'booking.request_expired','booking.proposal_created','booking.proposal_declined',
    'management.otp_requested','booking.rescheduled','booking.cancelled',
    -- A refund the customer never hears about is a support call.
    'payment.refunded','payment.refund_failed'));

alter table app.notification_templates drop constraint notification_templates_key_check;
alter table app.notification_templates add constraint notification_templates_key_check
  check (key in (
    'booking.confirmed','booking.requested','booking.rejected',
    'booking.request_expired','booking.proposal_created','booking.proposal_declined',
    'booking.rescheduled','booking.cancelled','management.otp_requested',
    'payment.refunded','payment.refund_failed'));

insert into app.notification_templates(key,locale,version,variable_schema) values
  ('payment.refunded','en',1,'["publicReference","serviceName","refund","brandName"]'::jsonb),
  ('payment.refunded','ar',1,'["publicReference","serviceName","refund","brandName"]'::jsonb),
  ('payment.refund_failed','en',1,'["publicReference","serviceName","refund","brandName"]'::jsonb),
  ('payment.refund_failed','ar',1,'["publicReference","serviceName","refund","brandName"]'::jsonb)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. A refund is a durable job, not a function call
-- ---------------------------------------------------------------------------

alter table app.payment_refunds add column booking_id uuid;
alter table app.payment_refunds add column idempotency_key text;
alter table app.payment_refunds add column attempts integer not null default 0
  check (attempts between 0 and 10);
alter table app.payment_refunds add column next_attempt_at timestamptz
  not null default statement_timestamp();
-- Held by a claiming worker until this instant; another worker may claim it
-- again afterwards, which is what makes a crashed worker recoverable.
alter table app.payment_refunds add column locked_until timestamptz;
-- A short stable code, never a provider body: a provider error can quote an
-- address, and this column is read by operators.
alter table app.payment_refunds add column failure_code text
  check (failure_code is null or char_length(failure_code) between 1 and 80);
alter table app.payment_refunds add column requested_by_membership_id uuid;
alter table app.payment_refunds add column correlation_id uuid
  not null default pg_catalog.gen_random_uuid();
alter table app.payment_refunds
  add constraint payment_refunds_booking_fk
  foreign key (tenant_id,booking_id) references app.bookings(tenant_id,id) on delete restrict;
alter table app.payment_refunds
  add constraint payment_refunds_membership_fk
  foreign key (tenant_id,requested_by_membership_id)
  references app.memberships(tenant_id,id) on delete restrict;
-- One logical refund per idempotency key. The acceptance criterion is literally
-- "eligible cancellation creates ONE logical refund"; this is where that is true
-- rather than hoped for.
create unique index payment_refunds_idempotency_idx
  on app.payment_refunds (tenant_id,idempotency_key) where idempotency_key is not null;
create index payment_refunds_due_idx on app.payment_refunds (next_attempt_at)
  where status in ('eligible','pending');

alter table app.payment_refunds drop constraint payment_refunds_status_check;
alter table app.payment_refunds add constraint payment_refunds_status_check
  check (status in ('eligible','pending','succeeded','failed','manual_review','cancelled'));

-- ---------------------------------------------------------------------------
-- 3. One queue for everything an operator has to deal with
-- ---------------------------------------------------------------------------

create table app.payment_exceptions (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  kind text not null check (kind in (
    'refund_failed',            -- the provider refused or kept failing
    'refund_unmatched',         -- money left, and we cannot say for which booking
    'dispute_opened',           -- a customer went to their bank
    'dispute_lost',
    'payout_failed',            -- the tenant's money did not reach them
    'insufficient_balance',     -- a refund with nothing behind it
    'account_restricted',       -- the connected account lost the capability
    'payment_orphaned',         -- issue #22's late success: paid, no booking
    'reconciliation_mismatch')),-- our state and the provider's disagree
  severity text not null default 'action_required'
    check (severity in ('informational','action_required','urgent')),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  -- What this is about. Deliberately loose: the queue spans charges, refunds,
  -- disputes, transfers and attempts, and a column per kind would be five
  -- nullable columns and one more thing to forget.
  subject_kind text not null check (subject_kind in
    ('payment_attempt','payment_charge','payment_refund','payment_dispute',
     'payment_transfer','payment_account','booking')),
  subject_id uuid not null,
  booking_id uuid,
  amount_minor_units bigint check (amount_minor_units is null or amount_minor_units >= 0),
  currency char(3) check (currency is null or currency = upper(currency)),
  -- Operator-readable and incapable of holding customer data: a stable code and
  -- counts, never a name, address, or provider body.
  detail_code text not null check (char_length(detail_code) between 1 and 80),
  provider_reference text,
  resolution text check (resolution is null or resolution in
    ('refunded','written_off','contested','reconciled','no_action_needed')),
  resolution_note text check (resolution_note is null or char_length(resolution_note) between 1 and 500),
  resolved_by_membership_id uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (id),
  unique (tenant_id,id),
  -- One open exception per subject and kind, so a reconciliation run that keeps
  -- finding the same problem keeps finding the same row.
  foreign key (tenant_id,booking_id) references app.bookings(tenant_id,id) on delete restrict,
  foreign key (tenant_id,resolved_by_membership_id)
    references app.memberships(tenant_id,id) on delete restrict,
  check ((status = 'open') = (resolved_at is null)),
  check ((resolved_at is null) or resolution is not null)
);
create unique index payment_exceptions_open_idx
  on app.payment_exceptions (tenant_id,subject_kind,subject_id,kind) where status = 'open';
create index payment_exceptions_queue_idx
  on app.payment_exceptions (tenant_id,status,severity,created_at desc);

-- Financial exception data is finance-class: readable by a scoped member who
-- can act on money, and by nobody else. It carries no customer PII by
-- construction, which is why it is not gated on `customer.pii.view`.
alter table app.payment_exceptions enable row level security;
create policy payment_exceptions_select_finance on app.payment_exceptions
for select to authenticated
using ((select private.is_active_tenant_member(tenant_id))
  and ((select private.has_direct_capability(tenant_id,'billing.view'))
    or (select private.has_direct_capability(tenant_id,'audit.read'))));
create policy payment_exceptions_insert_denied on app.payment_exceptions
  for insert to anon,authenticated with check (false);
create policy payment_exceptions_update_denied on app.payment_exceptions
  for update to anon,authenticated using (false) with check (false);
create policy payment_exceptions_delete_denied on app.payment_exceptions
  for delete to anon,authenticated using (false);
revoke all on app.payment_exceptions from public,anon,authenticated;
grant select on app.payment_exceptions to authenticated;

-- Raising one is idempotent by construction: the partial unique index means a
-- reconciliation run that finds the same problem ten times raises it once.
create or replace function private.raise_payment_exception_v1(
  p_tenant_id uuid,
  p_kind text,
  p_subject_kind text,
  p_subject_id uuid,
  p_detail_code text,
  p_booking_id uuid default null,
  p_amount_minor_units bigint default null,
  p_currency char(3) default null,
  p_provider_reference text default null,
  p_severity text default 'action_required'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into app.payment_exceptions(
    tenant_id,kind,subject_kind,subject_id,detail_code,booking_id,
    amount_minor_units,currency,provider_reference,severity)
  values (p_tenant_id,p_kind,p_subject_kind,p_subject_id,p_detail_code,p_booking_id,
    p_amount_minor_units,p_currency,p_provider_reference,p_severity)
  on conflict (tenant_id,subject_kind,subject_id,kind) where status = 'open'
  do update set updated_at = pg_catalog.statement_timestamp()
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Requesting a refund
-- ---------------------------------------------------------------------------

-- One canonical refund from eligibility issue #15 already decided. This does not
-- compute a percentage, does not read a policy, and does not call a provider.
create or replace function private.request_refund_v1(
  p_tenant_id uuid,
  p_booking_id uuid,
  p_idempotency_key text,
  p_amount_minor_units bigint default null,
  p_reason text default 'requested_by_customer'
)
returns table (
  contract_version integer,
  refund_id uuid,
  status text,
  amount_minor_units bigint,
  currency text,
  replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_booking app.bookings%rowtype;
  v_charge app.payment_charges%rowtype;
  v_existing app.payment_refunds%rowtype;
  v_membership uuid;
  v_amount bigint;
  v_already bigint;
  v_id uuid;
begin
  if p_idempotency_key is null or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
     or pg_catalog.char_length(p_idempotency_key) not between 16 and 200 then
    raise exception using errcode='22023',message='booking_invalid_idempotency_key';
  end if;

  select * into v_booking from app.bookings b
  where b.tenant_id=p_tenant_id and b.id=p_booking_id for update;
  if v_booking.id is null
     or not coalesce((select private.is_active_tenant_member(p_tenant_id)),false)
     or not coalesce((select private.can_access_location(p_tenant_id,v_booking.location_id)),false) then
    raise exception using errcode='42501',message='booking_context_required';
  end if;
  -- Issuing money is an approval-grant capability, so it carries a step-up
  -- behind it wherever the role is granted that way (ADR-0007).
  if not coalesce((select private.can_decide_booking(
       p_tenant_id,v_booking.location_id,'refund.issue')),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  v_membership := (select private.current_membership_id(p_tenant_id));

  -- A refund replays rather than duplicating. This is checked before anything
  -- else so a retried submission is cheap and safe.
  select * into v_existing from app.payment_refunds r
  where r.tenant_id=p_tenant_id and r.idempotency_key=p_idempotency_key;
  if v_existing.id is not null then
    return query select 1,v_existing.id,v_existing.status,
      v_existing.amount_minor_units,v_existing.currency::text,true;
    return;
  end if;

  -- The money has to exist before it can come back.
  select c.* into v_charge from app.payment_charges c
  join app.payment_attempts a on a.tenant_id=c.tenant_id and a.id=c.payment_attempt_id
  where c.tenant_id=p_tenant_id and a.booking_id=p_booking_id and c.status in ('succeeded','refunded')
  order by c.created_at limit 1;
  if v_charge.id is null then
    raise exception using errcode='42501',message='refund_not_eligible';
  end if;

  -- Eligibility comes from the cancellation that already happened. A null means
  -- this booking was never cancelled, so nothing about it earns a refund.
  v_amount := coalesce(p_amount_minor_units,v_booking.refund_eligible_minor);
  if v_amount is null or v_amount <= 0 then
    raise exception using errcode='42501',message='refund_not_eligible';
  end if;
  -- Partial refunds accumulate; together they can never exceed the charge.
  select coalesce(pg_catalog.sum(r.amount_minor_units),0) into v_already
  from app.payment_refunds r
  where r.tenant_id=p_tenant_id and r.payment_charge_id=v_charge.id
    and r.status in ('eligible','pending','succeeded');
  if v_already + v_amount > v_charge.amount_minor_units then
    raise exception using errcode='42501',message='refund_not_eligible';
  end if;

  insert into app.payment_refunds(
    tenant_id,payment_charge_id,booking_id,amount_minor_units,currency,status,reason,
    idempotency_key,requested_by_membership_id,authorized_by)
  values (p_tenant_id,v_charge.id,p_booking_id,v_amount,v_charge.currency,'eligible',
    p_reason,p_idempotency_key,v_membership,v_membership)
  returning id into v_id;

  insert into app.idempotency_keys(
    tenant_id,operation,idempotency_key,request_hash,state,result_kind,result_id,
    correlation_id,expires_at)
  values (p_tenant_id,'request_refund_v1',p_idempotency_key,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      p_tenant_id::text||':'||p_booking_id::text||':'||v_amount::text,'UTF8')),'hex'),
    'succeeded','refund',v_id,pg_catalog.gen_random_uuid(),
    v_now + pg_catalog.make_interval(days=>30))
  on conflict (tenant_id,operation,idempotency_key) do nothing;

  return query select 1,v_id,'eligible'::text,v_amount,v_charge.currency::text,false;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. The refund worker
-- ---------------------------------------------------------------------------

-- Claim under a visibility timeout, exactly like the notification worker. A
-- crashed worker's claim expires and the refund is picked up again rather than
-- being stranded.
create or replace function private.claim_refund_batch_v1(
  p_limit integer default 10,
  p_visibility_seconds integer default 120
)
returns table (
  refund_id uuid,
  tenant_id uuid,
  booking_id uuid,
  provider_charge_reference text,
  connected_account_reference text,
  amount_minor_units bigint,
  currency text,
  attempt integer,
  correlation_id uuid
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  if p_limit is null or p_limit not between 1 and 200
     or p_visibility_seconds is null or p_visibility_seconds not between 30 and 900 then
    raise exception using errcode='22023',message='notification_invalid_batch';
  end if;

  return query
  with claimed as (
    update app.payment_refunds r set
      status='pending',
      attempts=r.attempts+1,
      locked_until=v_now + pg_catalog.make_interval(secs=>p_visibility_seconds),
      updated_at=v_now
    where r.id in (
      select c.id from app.payment_refunds c
      where c.status in ('eligible','pending')
        and c.next_attempt_at <= v_now
        and (c.locked_until is null or c.locked_until <= v_now)
        and c.attempts < 10
      order by c.next_attempt_at
      for update skip locked
      limit p_limit)
    returning r.*)
  select cl.id, cl.tenant_id, cl.booking_id, ch.provider_charge_reference,
    pa.provider_account_reference, cl.amount_minor_units, cl.currency::text,
    cl.attempts, cl.correlation_id
  from claimed cl
  join app.payment_charges ch on ch.tenant_id=cl.tenant_id and ch.id=cl.payment_charge_id
  join app.payment_attempts at on at.tenant_id=ch.tenant_id and at.id=ch.payment_attempt_id
  join app.payment_accounts pa on pa.tenant_id=at.tenant_id and pa.id=at.payment_account_id;
end;
$$;

-- What the provider said about one attempt. Acknowledgement is durable state,
-- never an assumption, and a refund only becomes `succeeded` here or through a
-- verified webhook.
create or replace function private.record_refund_result_v1(
  p_tenant_id uuid,
  p_refund_id uuid,
  p_outcome text,
  p_provider_refund_reference text default null,
  p_failure_code text default null
)
returns table (refund_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_refund app.payment_refunds%rowtype;
  v_status text;
begin
  select * into v_refund from app.payment_refunds r
  where r.tenant_id=p_tenant_id and r.id=p_refund_id for update;
  if v_refund.id is null then
    raise exception using errcode='42501',message='payment_not_verified';
  end if;
  -- Terminal already. A late worker report never reopens settled money.
  if v_refund.status in ('succeeded','cancelled') then
    return query select v_refund.id, v_refund.status;
    return;
  end if;

  if p_outcome = 'succeeded' then
    v_status := 'succeeded';
  elsif p_outcome = 'retryable_error' and v_refund.attempts < 10 then
    v_status := 'eligible';
  else
    -- Out of attempts, or the provider says never. Either way a human now owns
    -- it, because unreturned money is not something to give up on quietly.
    v_status := 'failed';
  end if;

  update app.payment_refunds r set
    status=v_status,
    provider_refund_reference=coalesce(p_provider_refund_reference,r.provider_refund_reference),
    failure_code=case when v_status='succeeded' then null else p_failure_code end,
    locked_until=null,
    -- Exponential backoff, bounded. A provider having a bad hour is not a
    -- reason to hammer it.
    next_attempt_at=case when v_status='eligible'
      then v_now + pg_catalog.make_interval(secs=>least(3600,60*(2^r.attempts)::integer))
      else r.next_attempt_at end,
    updated_at=v_now
  where r.id=p_refund_id;

  if v_status = 'succeeded' then
    perform private.settle_refund_ledger_v1(p_tenant_id,p_refund_id);
  elsif v_status = 'failed' then
    perform private.raise_payment_exception_v1(
      p_tenant_id,'refund_failed','payment_refund',p_refund_id,
      coalesce(p_failure_code,'provider_refused'),v_refund.booking_id,
      v_refund.amount_minor_units,v_refund.currency,
      v_refund.provider_refund_reference,'urgent');
    insert into app.outbox_events(
      tenant_id,booking_id,topic,payload,correlation_id,booking_revision)
    values (p_tenant_id,v_refund.booking_id,'payment.refund_failed',
      jsonb_build_object('refund_id',p_refund_id),v_refund.correlation_id,
      -- The intent key is (tenant, booking, topic, revision). Keying the
      -- attempt number in is what makes a retried failure one message rather
      -- than one per attempt.
      v_refund.attempts)
    on conflict (tenant_id,booking_id,topic,booking_revision) do nothing;
  end if;

  return query select p_refund_id, v_status;
end;
$function$;

-- The ledger movement for a completed refund, and the customer's message. Split
-- out because a webhook and a worker both reach this point and neither should
-- have its own copy of what "refunded" means.
create or replace function private.settle_refund_ledger_v1(
  p_tenant_id uuid,
  p_refund_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_refund app.payment_refunds%rowtype;
  v_charge_total bigint;
  v_refunded bigint;
begin
  select * into v_refund from app.payment_refunds r
  where r.tenant_id=p_tenant_id and r.id=p_refund_id;
  if v_refund.id is null or v_refund.status <> 'succeeded' then return; end if;

  -- Append-only and keyed by the refund, so a duplicated settlement writes
  -- nothing twice.
  insert into app.commerce_ledger_entries(
    tenant_id,entry_type,source_id,amount_minor_units,currency,occurred_at,metadata)
  values (p_tenant_id,'refund',p_refund_id,v_refund.amount_minor_units,v_refund.currency,
    pg_catalog.statement_timestamp(),
    jsonb_build_object('booking_id',v_refund.booking_id,'reason',v_refund.reason))
  on conflict (tenant_id,entry_type,source_id) do nothing;

  -- The charge says `refunded` only once everything is back. A partial refund
  -- leaves it `succeeded`, because it is still a charge that stands.
  select c.amount_minor_units into v_charge_total from app.payment_charges c
  where c.tenant_id=p_tenant_id and c.id=v_refund.payment_charge_id;
  select coalesce(pg_catalog.sum(r.amount_minor_units),0) into v_refunded
  from app.payment_refunds r
  where r.tenant_id=p_tenant_id and r.payment_charge_id=v_refund.payment_charge_id
    and r.status='succeeded';
  if v_refunded >= v_charge_total then
    update app.payment_charges c set status='refunded'
    where c.tenant_id=p_tenant_id and c.id=v_refund.payment_charge_id;
    update app.payment_attempts a set status='succeeded', updated_at=pg_catalog.statement_timestamp()
    where a.tenant_id=p_tenant_id and a.id=(
      select c.payment_attempt_id from app.payment_charges c
      where c.tenant_id=p_tenant_id and c.id=v_refund.payment_charge_id);
  end if;

  -- Notification intent from committed state, never from an optimistic call.
  if v_refund.booking_id is not null then
    insert into app.outbox_events(
      tenant_id,booking_id,topic,payload,correlation_id,booking_revision)
    values (p_tenant_id,v_refund.booking_id,'payment.refunded',
      jsonb_build_object('refund_id',p_refund_id),v_refund.correlation_id,0)
    on conflict (tenant_id,booking_id,topic,booking_revision) do nothing;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. One webhook intake for every provider object
-- ---------------------------------------------------------------------------

-- Issue #22 introduced this for checkout sessions. Generalizing it rather than
-- adding a second intake keeps one dedup rule, one ordering rule, and one place
-- where an unknown object is handled.
--
-- Monotonicity: a terminal state is never walked backwards by an older event.
-- Providers reorder, and "won" arriving after "lost" because of a redelivery
-- would otherwise silently reverse a real outcome.
create or replace function private.record_commerce_event_v1(
  p_tenant_id uuid,
  p_provider text,
  p_provider_event_reference text,
  p_event_type text,
  p_object_kind text,
  p_provider_object_reference text,
  p_outcome text,
  p_amount_minor_units bigint default null,
  p_currency text default null,
  p_occurred_at timestamptz default null,
  p_related_reference text default null
)
returns table (contract_version integer, outcome text, detail text)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '10s'
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_occurred timestamptz := coalesce(p_occurred_at,v_now);
  v_event app.payment_webhook_events%rowtype;
  v_refund app.payment_refunds%rowtype;
  v_charge app.payment_charges%rowtype;
  v_dispute app.payment_disputes%rowtype;
  v_transfer app.payment_transfers%rowtype;
  v_account app.payment_accounts%rowtype;
begin
  insert into app.payment_webhook_events(
    tenant_id,provider,provider_event_reference,event_type,object_kind,
    provider_object_reference,occurred_at)
  values (p_tenant_id,p_provider,p_provider_event_reference,p_event_type,p_object_kind,
    p_provider_object_reference,v_occurred)
  on conflict (provider,provider_event_reference) do nothing;

  select * into v_event from app.payment_webhook_events e
  where e.provider=p_provider and e.provider_event_reference=p_provider_event_reference;
  if v_event.processed_at is not null then
    -- Seen and handled. Deduplication is on the provider's own event id, which
    -- is the only identifier a retry is guaranteed to preserve.
    return query select 1,'replayed'::text,null::text;
    return;
  end if;

  if p_object_kind = 'refund' then
    select * into v_refund from app.payment_refunds r
    where r.tenant_id=p_tenant_id and r.provider_refund_reference=p_provider_object_reference
    for update;
    if v_refund.id is null then
      -- Money left the account and we cannot say for which booking. That is an
      -- operator's problem immediately, not a log line.
      perform private.raise_payment_exception_v1(
        p_tenant_id,'refund_unmatched','payment_refund',pg_catalog.gen_random_uuid(),
        'unknown_refund_reference',null,p_amount_minor_units,
        pg_catalog.upper(p_currency)::char(3),p_provider_object_reference,'urgent');
      update app.payment_webhook_events e set processed_at=v_now,
        processing_error='unknown_object' where e.id=v_event.id;
      return query select 1,'unmatched'::text,'refund_unmatched'::text;
      return;
    end if;
    if v_refund.status in ('succeeded','cancelled') and v_occurred <= v_refund.updated_at then
      update app.payment_webhook_events e set processed_at=v_now,
        processing_error='stale_event' where e.id=v_event.id;
      return query select 1,'ignored'::text,'older_than_terminal_state'::text;
      return;
    end if;
    if p_outcome = 'succeeded' then
      update app.payment_refunds r set status='succeeded', failure_code=null,
        locked_until=null, updated_at=v_now where r.id=v_refund.id;
      perform private.settle_refund_ledger_v1(p_tenant_id,v_refund.id);
    elsif p_outcome = 'failed' then
      perform private.record_refund_result_v1(
        p_tenant_id,v_refund.id,'permanent_error',p_provider_object_reference,'provider_failed');
    end if;

  elsif p_object_kind = 'dispute' then
    select * into v_charge from app.payment_charges c
    where c.tenant_id=p_tenant_id and c.provider_charge_reference=coalesce(p_related_reference,'');
    insert into app.payment_disputes(
      tenant_id,payment_charge_id,provider_dispute_reference,status)
    values (p_tenant_id,v_charge.id,p_provider_object_reference,
      case p_outcome when 'won' then 'won' when 'lost' then 'lost'
        when 'under_review' then 'under_review' else 'warning_needs_response' end)
    on conflict (tenant_id,provider_dispute_reference) do nothing;
    select * into v_dispute from app.payment_disputes d
    where d.tenant_id=p_tenant_id and d.provider_dispute_reference=p_provider_object_reference
    for update;
    if v_dispute.status in ('won','lost') and v_occurred <= v_dispute.updated_at then
      update app.payment_webhook_events e set processed_at=v_now,
        processing_error='stale_event' where e.id=v_event.id;
      return query select 1,'ignored'::text,'older_than_terminal_state'::text;
      return;
    end if;
    update app.payment_disputes d set
      status=case p_outcome when 'won' then 'won' when 'lost' then 'lost'
        when 'under_review' then 'under_review' else 'warning_needs_response' end,
      updated_at=v_now
    where d.id=v_dispute.id;
    -- A dispute is money at risk and a deadline, so it is a queue item the
    -- moment it exists rather than when somebody notices.
    perform private.raise_payment_exception_v1(
      p_tenant_id,case when p_outcome='lost' then 'dispute_lost' else 'dispute_opened' end,
      'payment_dispute',v_dispute.id,p_event_type,null,p_amount_minor_units,
      pg_catalog.upper(p_currency)::char(3),p_provider_object_reference,'urgent');
    -- A disputed charge does not un-happen the booking. Booking status and
    -- money state stay separate columns (invariant 9).
    if v_charge.id is not null then
      update app.payment_attempts a set status='disputed', updated_at=v_now
      where a.tenant_id=p_tenant_id and a.id=v_charge.payment_attempt_id;
    end if;

  elsif p_object_kind = 'transfer' or p_object_kind = 'payout' then
    insert into app.payment_transfers(
      tenant_id,provider_transfer_reference,amount_minor_units,currency,status)
    values (p_tenant_id,p_provider_object_reference,
      greatest(coalesce(p_amount_minor_units,1),1),
      pg_catalog.upper(coalesce(p_currency,'USD'))::char(3),
      case p_outcome when 'paid' then 'paid' when 'failed' then 'failed'
        when 'canceled' then 'canceled' when 'in_transit' then 'in_transit'
        else 'pending' end)
    on conflict (tenant_id,provider_transfer_reference) do nothing;
    select * into v_transfer from app.payment_transfers t
    where t.tenant_id=p_tenant_id and t.provider_transfer_reference=p_provider_object_reference;
    if p_outcome in ('failed','canceled') then
      perform private.raise_payment_exception_v1(
        p_tenant_id,'payout_failed','payment_transfer',v_transfer.id,p_event_type,null,
        p_amount_minor_units,pg_catalog.upper(coalesce(p_currency,'USD'))::char(3),
        p_provider_object_reference,'urgent');
    end if;

  elsif p_object_kind = 'account' then
    select * into v_account from app.payment_accounts pa
    where pa.tenant_id=p_tenant_id and pa.provider_account_reference=p_provider_object_reference
    for update;
    if v_account.id is not null then
      update app.payment_accounts pa set
        status=case p_outcome when 'restricted' then 'restricted'
          when 'disconnected' then 'disconnected' when 'connected' then 'connected'
          else pa.status end,
        charges_enabled=(p_outcome='connected'),
        last_provider_sync_at=v_now, updated_at=v_now
      where pa.id=v_account.id;
      if p_outcome in ('restricted','disconnected') then
        -- The tenant cannot take money and may not know. Nothing else in the
        -- product would surface this until a customer failed to check out.
        perform private.raise_payment_exception_v1(
          p_tenant_id,'account_restricted','payment_account',v_account.id,p_outcome,
          null,null,null,p_provider_object_reference,'urgent');
      end if;
    end if;
  end if;

  update app.payment_webhook_events e set processed_at=v_now where e.id=v_event.id;
  return query select 1,'recorded'::text,null::text;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Reconciliation
-- ---------------------------------------------------------------------------

-- What never arrived. This does not talk to a provider — nothing in the
-- database does — it finds records that have been waiting too long to still be
-- explainable, and says so. The provider-side comparison is the Edge Function's
-- job and feeds back through `record_commerce_event_v1`.
--
-- Safe to run repeatedly and in any order: every finding is an idempotent
-- exception, and nothing here mutates money.
create or replace function private.reconcile_commerce_v1(
  p_tenant_id uuid default null,
  p_stale_minutes integer default 60
)
returns table (checked integer, opened integer)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '30s'
as $function$
declare
  v_cutoff timestamptz := pg_catalog.statement_timestamp()
    - pg_catalog.make_interval(mins=>greatest(coalesce(p_stale_minutes,60),5));
  v_checked integer := 0;
  v_opened integer := 0;
  r record;
begin
  -- A payment that has been mid-flight far longer than any 3DS or bank
  -- transfer takes. Either the event never came or it went somewhere else.
  for r in
    select a.id, a.tenant_id, a.booking_id, a.amount_minor_units, a.currency
    from app.payment_attempts a
    where (p_tenant_id is null or a.tenant_id = p_tenant_id)
      and a.status = 'processing' and a.updated_at < v_cutoff
  loop
    v_checked := v_checked + 1;
    perform private.raise_payment_exception_v1(
      r.tenant_id,'reconciliation_mismatch','payment_attempt',r.id,
      'processing_without_outcome',r.booking_id,r.amount_minor_units,r.currency);
    v_opened := v_opened + 1;
  end loop;

  -- Issue #22's late-success case, surfaced as a queue item rather than a row
  -- only a developer would find.
  for r in
    select a.id, a.tenant_id, a.amount_minor_units, a.currency, a.exception_code
    from app.payment_attempts a
    where (p_tenant_id is null or a.tenant_id = p_tenant_id)
      and a.status = 'exception' and a.resolved_at is null
  loop
    v_checked := v_checked + 1;
    perform private.raise_payment_exception_v1(
      r.tenant_id,'payment_orphaned','payment_attempt',r.id,
      coalesce(r.exception_code,'unknown'),null,r.amount_minor_units,r.currency,null,'urgent');
    v_opened := v_opened + 1;
  end loop;

  -- A refund the worker keeps failing to place.
  for r in
    select rf.id, rf.tenant_id, rf.booking_id, rf.amount_minor_units, rf.currency
    from app.payment_refunds rf
    where (p_tenant_id is null or rf.tenant_id = p_tenant_id)
      and rf.status in ('eligible','pending') and rf.created_at < v_cutoff
  loop
    v_checked := v_checked + 1;
    perform private.raise_payment_exception_v1(
      r.tenant_id,'reconciliation_mismatch','payment_refund',r.id,
      'refund_not_settled',r.booking_id,r.amount_minor_units,r.currency);
    v_opened := v_opened + 1;
  end loop;

  -- A cancelled booking that earned money back and never got a refund row.
  for r in
    select b.id, b.tenant_id, b.refund_eligible_minor, b.currency
    from app.bookings b
    where (p_tenant_id is null or b.tenant_id = p_tenant_id)
      and b.status='cancelled' and coalesce(b.refund_eligible_minor,0) > 0
      and b.cancelled_at < v_cutoff
      and not exists (select 1 from app.payment_refunds rf
        where rf.tenant_id=b.tenant_id and rf.booking_id=b.id
          and rf.status in ('eligible','pending','succeeded'))
      and exists (select 1 from app.payment_attempts a
        where a.tenant_id=b.tenant_id and a.booking_id=b.id and a.status='succeeded')
  loop
    v_checked := v_checked + 1;
    perform private.raise_payment_exception_v1(
      r.tenant_id,'reconciliation_mismatch','booking',r.id,
      'refund_owed_not_requested',r.id,r.refund_eligible_minor,r.currency,null,'urgent');
    v_opened := v_opened + 1;
  end loop;

  return query select v_checked, v_opened;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 8. Working the queue
-- ---------------------------------------------------------------------------

create or replace function private.resolve_payment_exception_v1(
  p_tenant_id uuid,
  p_exception_id uuid,
  p_resolution text,
  p_note text default null
)
returns table (exception_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_exception app.payment_exceptions%rowtype;
  v_membership uuid;
begin
  -- Writing off money, or declaring a mismatch reconciled, is a financial act.
  -- It needs the capability and a recent authentication, and it is attributed.
  if not coalesce((select private.has_direct_capability(p_tenant_id,'billing.view')),false)
     or not coalesce((select private.can_decide_booking(p_tenant_id,null,'refund.issue')),false)
     or not coalesce((select private.is_aal2()),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  v_membership := (select private.current_membership_id(p_tenant_id));

  select * into v_exception from app.payment_exceptions e
  where e.tenant_id=p_tenant_id and e.id=p_exception_id for update;
  if v_exception.id is null then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if v_exception.status <> 'open' then
    -- Somebody already dealt with it. Telling the second person that is better
    -- than letting them think they did.
    raise exception using errcode='23505',message='exception_resolved';
  end if;

  update app.payment_exceptions e set
    status=case when p_resolution='no_action_needed' then 'dismissed' else 'resolved' end,
    resolution=p_resolution,
    resolution_note=p_note,
    resolved_by_membership_id=v_membership,
    resolved_at=pg_catalog.statement_timestamp(),
    updated_at=pg_catalog.statement_timestamp()
  where e.id=p_exception_id;

  return query select p_exception_id,
    case when p_resolution='no_action_needed' then 'dismissed' else 'resolved' end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Reads
-- ---------------------------------------------------------------------------

-- SECURITY INVOKER over rows RLS already scopes. A location-limited member sees
-- their locations' exceptions and infers nothing about anywhere else.
create or replace function api_v1.list_payment_exceptions_v1(
  p_tenant_id uuid,
  p_status text default 'open',
  p_limit integer default 50
)
returns table (
  exception_id uuid,
  kind text,
  severity text,
  status text,
  subject_kind text,
  subject_id uuid,
  booking_id uuid,
  public_reference text,
  amount_minor_units bigint,
  currency text,
  detail_code text,
  provider_reference text,
  resolution text,
  created_at timestamptz,
  resolved_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.id, e.kind, e.severity, e.status, e.subject_kind, e.subject_id,
    e.booking_id, b.public_reference, e.amount_minor_units, e.currency::text,
    e.detail_code, e.provider_reference, e.resolution, e.created_at, e.resolved_at
  from app.payment_exceptions e
  left join app.bookings b on b.tenant_id=e.tenant_id and b.id=e.booking_id
  where e.tenant_id = p_tenant_id
    and (p_status is null or e.status = p_status)
  order by
    case e.severity when 'urgent' then 0 when 'action_required' then 1 else 2 end,
    e.created_at desc
  limit least(greatest(coalesce(p_limit,50),1),200);
$$;

create or replace function api_v1.list_refunds_v1(
  p_tenant_id uuid,
  p_booking_id uuid default null,
  p_limit integer default 50
)
returns table (
  refund_id uuid,
  booking_id uuid,
  public_reference text,
  amount_minor_units bigint,
  currency text,
  status text,
  reason text,
  failure_code text,
  attempts integer,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.id, r.booking_id, b.public_reference, r.amount_minor_units, r.currency::text,
    r.status, r.reason, r.failure_code, r.attempts, r.created_at, r.updated_at
  from app.payment_refunds r
  left join app.bookings b on b.tenant_id=r.tenant_id and b.id=r.booking_id
  where r.tenant_id = p_tenant_id
    and (p_booking_id is null or r.booking_id = p_booking_id)
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit,50),1),200);
$$;

-- Platform Admin's view of provider health. Counts and states only: operating
-- the fleet never requires reading a tenant's customers or their money in
-- detail, so this cannot return either.
create or replace function private.get_commerce_health_v1()
returns table (
  tenant_id uuid,
  account_status text,
  charges_enabled boolean,
  open_exceptions bigint,
  urgent_exceptions bigint,
  refunds_pending bigint,
  refunds_failed bigint,
  disputes_open bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, coalesce(pa.status,'none'), coalesce(pa.charges_enabled,false),
    (select pg_catalog.count(*) from app.payment_exceptions e
      where e.tenant_id=t.id and e.status='open'),
    (select pg_catalog.count(*) from app.payment_exceptions e
      where e.tenant_id=t.id and e.status='open' and e.severity='urgent'),
    (select pg_catalog.count(*) from app.payment_refunds r
      where r.tenant_id=t.id and r.status in ('eligible','pending')),
    (select pg_catalog.count(*) from app.payment_refunds r
      where r.tenant_id=t.id and r.status='failed'),
    (select pg_catalog.count(*) from app.payment_disputes d
      where d.tenant_id=t.id and d.status in ('warning_needs_response','under_review'))
  from app.tenants t
  left join app.payment_accounts pa on pa.tenant_id=t.id
  order by t.created_at;
$$;

-- ---------------------------------------------------------------------------
-- 10. api_v1 surface
-- ---------------------------------------------------------------------------

create or replace function api_v1.request_refund_v1(
  p_tenant_id uuid, p_booking_id uuid, p_idempotency_key text,
  p_amount_minor_units bigint default null, p_reason text default 'requested_by_customer')
returns table (
  contract_version integer, refund_id uuid, status text,
  amount_minor_units bigint, currency text, replayed boolean)
language sql volatile security invoker set search_path = '' set statement_timeout = '5s'
as $$ select * from private.request_refund_v1(p_tenant_id,p_booking_id,p_idempotency_key,
  p_amount_minor_units,p_reason); $$;

create or replace function api_v1.resolve_payment_exception_v1(
  p_tenant_id uuid, p_exception_id uuid, p_resolution text, p_note text default null)
returns table (exception_id uuid, status text)
language sql volatile security invoker set search_path = ''
as $$ select * from private.resolve_payment_exception_v1(p_tenant_id,p_exception_id,
  p_resolution,p_note); $$;

create or replace function api_v1.record_commerce_event_v1(
  p_tenant_id uuid, p_provider text, p_provider_event_reference text,
  p_event_type text, p_object_kind text, p_provider_object_reference text,
  p_outcome text, p_amount_minor_units bigint default null,
  p_currency text default null, p_occurred_at timestamptz default null,
  p_related_reference text default null)
returns table (contract_version integer, outcome text, detail text)
language sql volatile security invoker set search_path = '' set statement_timeout = '10s'
as $$ select * from private.record_commerce_event_v1(p_tenant_id,p_provider,
  p_provider_event_reference,p_event_type,p_object_kind,p_provider_object_reference,
  p_outcome,p_amount_minor_units,p_currency,p_occurred_at,p_related_reference); $$;

create or replace function api_v1.claim_refund_batch_v1(
  p_limit integer default 10, p_visibility_seconds integer default 120)
returns table (
  refund_id uuid, tenant_id uuid, booking_id uuid, provider_charge_reference text,
  connected_account_reference text, amount_minor_units bigint, currency text,
  attempt integer, correlation_id uuid)
language sql volatile security invoker set search_path = '' set statement_timeout = '10s'
as $$ select * from private.claim_refund_batch_v1(p_limit,p_visibility_seconds); $$;

create or replace function api_v1.record_refund_result_v1(
  p_tenant_id uuid, p_refund_id uuid, p_outcome text,
  p_provider_refund_reference text default null, p_failure_code text default null)
returns table (refund_id uuid, status text)
language sql volatile security invoker set search_path = ''
as $$ select * from private.record_refund_result_v1(p_tenant_id,p_refund_id,p_outcome,
  p_provider_refund_reference,p_failure_code); $$;

create or replace function api_v1.reconcile_commerce_v1(
  p_tenant_id uuid default null, p_stale_minutes integer default 60)
returns table (checked integer, opened integer)
language sql volatile security invoker set search_path = '' set statement_timeout = '30s'
as $$ select * from private.reconcile_commerce_v1(p_tenant_id,p_stale_minutes); $$;

create or replace function api_v1.get_commerce_health_v1()
returns table (
  tenant_id uuid, account_status text, charges_enabled boolean,
  open_exceptions bigint, urgent_exceptions bigint, refunds_pending bigint,
  refunds_failed bigint, disputes_open bigint)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_commerce_health_v1(); $$;

-- ---------------------------------------------------------------------------
-- 11. Grants
-- ---------------------------------------------------------------------------

revoke all on function
  private.raise_payment_exception_v1(uuid,text,text,uuid,text,uuid,bigint,char,text,text),
  private.request_refund_v1(uuid,uuid,text,bigint,text),
  private.claim_refund_batch_v1(integer,integer),
  private.record_refund_result_v1(uuid,uuid,text,text,text),
  private.settle_refund_ledger_v1(uuid,uuid),
  private.record_commerce_event_v1(uuid,text,text,text,text,text,text,bigint,text,timestamptz,text),
  private.reconcile_commerce_v1(uuid,integer),
  private.resolve_payment_exception_v1(uuid,uuid,text,text),
  private.get_commerce_health_v1()
from public, anon, authenticated;

-- A tenant member may ask for a refund they are entitled to issue, and may work
-- their own queue. Nothing else here is reachable from a session.
grant execute on function
  private.request_refund_v1(uuid,uuid,text,bigint,text),
  private.resolve_payment_exception_v1(uuid,uuid,text,text)
to authenticated;

revoke all on function
  api_v1.request_refund_v1(uuid,uuid,text,bigint,text),
  api_v1.resolve_payment_exception_v1(uuid,uuid,text,text),
  api_v1.list_payment_exceptions_v1(uuid,text,integer),
  api_v1.list_refunds_v1(uuid,uuid,integer),
  api_v1.record_commerce_event_v1(uuid,text,text,text,text,text,text,bigint,text,timestamptz,text),
  api_v1.claim_refund_batch_v1(integer,integer),
  api_v1.record_refund_result_v1(uuid,uuid,text,text,text),
  api_v1.reconcile_commerce_v1(uuid,integer),
  api_v1.get_commerce_health_v1()
from public, anon, authenticated;

grant execute on function
  api_v1.request_refund_v1(uuid,uuid,text,bigint,text),
  api_v1.resolve_payment_exception_v1(uuid,uuid,text,text),
  api_v1.list_payment_exceptions_v1(uuid,text,integer),
  api_v1.list_refunds_v1(uuid,uuid,integer)
to authenticated;

-- The worker and the webhook run as the service role, because only they hold
-- the provider credential that makes their arguments trustworthy. Fleet health
-- is control-plane only for the same reason.
grant execute on function
  api_v1.record_commerce_event_v1(uuid,text,text,text,text,text,text,bigint,text,timestamptz,text),
  api_v1.claim_refund_batch_v1(integer,integer),
  api_v1.record_refund_result_v1(uuid,uuid,text,text,text),
  api_v1.reconcile_commerce_v1(uuid,integer),
  api_v1.get_commerce_health_v1()
to service_role;
