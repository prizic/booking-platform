-- Issue #15: reschedule and cancel, from either entry point, without losing
-- correctness. Rescheduling is booking lineage plus a new revision (§6.3), not
-- an overloaded terminal status: the new capacity is secured before the old is
-- released, in one transaction, and both times stay in history.
--
-- Policy is ADR-0005 and is read from the snapshot the booking was made under
-- (ADR-0006), never from the tenant's current configuration:
--   18 cancellation.cutoff_minutes        1440   who may cancel in the Client
--   19 cancellation.customer_self_service true
--   20 reschedule.cutoff_minutes          1440
--   21 reschedule.max_per_booking         2      customer-initiated only
--   22 refund.schedule                    tiers  evaluated at cancellation
--   23 refund.deposit_non_refundable      false
--
-- Money is a separate action. Cancellation records refund eligibility and its
-- amount; the provider refund itself is asynchronous and belongs to issue #23.
--
-- Errors stay in the published vocabulary: slot_unavailable, policy_denied,
-- revision_conflict, payment_pending, idempotency_conflict.

alter table app.bookings
  add column reschedule_count integer not null default 0
    check (reschedule_count between 0 and 10),
  add column cancelled_at timestamptz,
  add column cancellation_actor_kind text
    check (cancellation_actor_kind is null or cancellation_actor_kind in ('guest','member','system')),
  -- Refund eligibility is booking-side bookkeeping. The refund itself lives in
  -- the commerce tables and is executed asynchronously (issue #23).
  add column refund_eligible_minor bigint
    check (refund_eligible_minor is null or refund_eligible_minor >= 0),
  add column refund_percent_bps integer
    check (refund_percent_bps is null or refund_percent_bps between 0 and 10000);
alter table app.bookings
  add constraint bookings_cancelled_fields
    check ((status = 'cancelled') = (cancelled_at is not null));

alter table app.booking_events drop constraint booking_events_event_type_check;
alter table app.booking_events add constraint booking_events_event_type_check
  check (event_type in (
    'booking_requested','booking_confirmed','booking_cancelled','booking_completed',
    'booking_no_show','booking_rejected','booking_request_expired',
    'booking_proposal_created','booking_proposal_declined','booking_rescheduled'));

alter table app.outbox_events drop constraint outbox_events_topic_check;
alter table app.outbox_events add constraint outbox_events_topic_check
  check (topic in ('booking.confirmed','booking.requested','booking.rejected',
    'booking.request_expired','booking.proposal_created','booking.proposal_declined',
    'management.otp_requested','booking.rescheduled','booking.cancelled'));
-- One intent per booking, topic, and revision, so a stale duplicate can never
-- update the wrong version of a booking and a retry of the same revision
-- collapses onto the same row.
alter table app.outbox_events add column booking_revision bigint not null default 0
  check (booking_revision >= 0);
alter table app.outbox_events drop constraint outbox_events_tenant_id_booking_id_topic_key;
alter table app.outbox_events add constraint outbox_events_intent_key
  unique (tenant_id,booking_id,topic,booking_revision);

-- The snapshot guard learns the new lifecycle columns. Everything the booking
-- snapshotted still cannot move (invariant 5).
create or replace function private.enforce_booking_snapshot_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_mutable constant text[] := array[
    'status','payment_status','notification_status','calendar_status',
    'approval_status','approval_deadline','decision_reason_public','revision',
    'updated_at','starts_at','ends_at','reschedule_count','cancelled_at',
    'cancellation_actor_kind','refund_eligible_minor','refund_percent_bps'];
begin
  if tg_op = 'DELETE' then
    raise exception using errcode='42501',message='booking_immutable';
  end if;
  if (select jsonb_object_agg(key,value) from jsonb_each(to_jsonb(old))
        where key <> all(v_mutable))
     is distinct from
     (select jsonb_object_agg(key,value) from jsonb_each(to_jsonb(new))
        where key <> all(v_mutable)) then
    raise exception using errcode='42501',message='booking_immutable';
  end if;
  -- A moved booking is a new revision, never a silent edit of the old one.
  if (new.starts_at,new.ends_at) is distinct from (old.starts_at,old.ends_at)
     and new.revision <= old.revision then
    raise exception using errcode='42501',message='booking_immutable';
  end if;
  return new;
end;
$$;

alter table app.idempotency_keys drop constraint idempotency_keys_operation_check;
alter table app.idempotency_keys add constraint idempotency_keys_operation_check
  check (operation in ('create_hold_v1','confirm_booking_v1','cancel_booking_v1','reschedule_booking_v1'));

-- Refund eligibility from the snapshotted tier list (ADR-0005 row 22). Tiers
-- are ordered by minutes-before-start, descending; the first tier the booking
-- still qualifies for wins, and anything past the last tier refunds nothing.
create or replace function private.resolve_refund_percent_bps_v1(
  p_policy jsonb,
  p_starts_at timestamptz,
  p_now timestamptz
)
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  with tiers as (
    select coalesce(
      p_policy->'refund_schedule',
      '[{"minutes_before":1440,"percent_bps":10000},
        {"minutes_before":240,"percent_bps":5000},
        {"minutes_before":0,"percent_bps":0}]'::jsonb) as list
  ), rows as (
    select (t->>'minutes_before')::integer as minutes_before,
           (t->>'percent_bps')::integer as percent_bps
    from tiers, jsonb_array_elements(tiers.list) t
  )
  select coalesce((
    select r.percent_bps from rows r
    where extract(epoch from (p_starts_at - p_now))/60 >= r.minutes_before
    order by r.minutes_before desc
    limit 1
  ),0);
$$;

create or replace function private.cancel_booking_v1(
  p_tenant_id uuid,
  p_booking_id uuid,
  p_expected_revision bigint,
  p_actor_kind text,
  p_reason_public text default null,
  p_reason_internal text default null,
  p_request_id uuid default null,
  p_idempotency_key text default null
)
returns table(
  contract_version integer,
  booking_id uuid,
  status text,
  booking_revision bigint,
  cancelled_at timestamptz,
  refund_percent_bps integer,
  refund_eligible_minor bigint,
  replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
#variable_conflict use_column
declare
  v_now timestamptz := statement_timestamp();
  v_correlation_id uuid := coalesce(p_request_id,pg_catalog.gen_random_uuid());
  v_booking app.bookings%rowtype;
  v_membership_id uuid;
  v_sequence bigint;
  v_cutoff integer;
  v_percent integer;
  v_refund bigint;
  v_released integer;
  v_existing app.idempotency_keys%rowtype;
begin
  if p_actor_kind is null or p_actor_kind not in ('guest','member','system') then
    raise exception using errcode='22023',message='booking_invalid_actor';
  end if;

  if p_idempotency_key is not null then
    -- A retry of the same cancellation returns the established result rather
    -- than a conflict: cancelling twice is one cancellation.
    insert into app.idempotency_keys(
      tenant_id,operation,idempotency_key,request_hash,state,correlation_id,expires_at)
    values (p_tenant_id,'cancel_booking_v1',p_idempotency_key,
      encode(pg_catalog.sha256(pg_catalog.convert_to(p_booking_id::text,'UTF8')),'hex'),
      'in_progress',v_correlation_id,v_now+interval '24 hours')
    on conflict (tenant_id,operation,idempotency_key) do nothing;
    if not found then
      select * into v_existing from app.idempotency_keys k
      where k.tenant_id=p_tenant_id and k.operation='cancel_booking_v1'
        and k.idempotency_key=p_idempotency_key
      for update;
      if v_existing.request_hash is distinct from
         encode(pg_catalog.sha256(pg_catalog.convert_to(p_booking_id::text,'UTF8')),'hex') then
        raise exception using errcode='23505',message='idempotency_conflict';
      end if;
      select * into v_booking from app.bookings b
      where b.tenant_id=p_tenant_id and b.id=v_existing.result_id;
      if v_booking.id is null then
        raise exception using errcode='23505',message='idempotency_conflict';
      end if;
      return query select 1,v_booking.id,v_booking.status,v_booking.revision,
        v_booking.cancelled_at,v_booking.refund_percent_bps,
        v_booking.refund_eligible_minor,true;
      return;
    end if;
  end if;

  select * into v_booking from app.bookings b
  where b.tenant_id=p_tenant_id and b.id=p_booking_id
  for update;
  if v_booking.id is null then
    raise exception using errcode='42501',message='booking_context_required';
  end if;
  if p_actor_kind='member' then
    -- Staff authority is re-read now, so a revoked grant cannot cancel.
    if not coalesce((select private.is_active_tenant_member(p_tenant_id)),false)
       or not coalesce((select private.can_access_location(p_tenant_id,v_booking.location_id)),false)
       or not coalesce((select private.can_decide_booking(
            p_tenant_id,v_booking.location_id,'booking.cancel')),false) then
      raise exception using errcode='42501',message='policy_denied';
    end if;
    v_membership_id := (select private.current_membership_id(p_tenant_id));
  end if;

  if v_booking.status not in ('confirmed','requested')
     or v_booking.revision is distinct from p_expected_revision then
    raise log 'booking_cancel_denied code=revision_conflict correlation=% tenant=%',v_correlation_id,p_tenant_id;
    raise exception using errcode='23505',message='revision_conflict';
  end if;

  -- The cutoff governs the customer only; staff may cancel at any time
  -- (ADR-0005 row 18 with ADR-0007).
  if p_actor_kind='guest' then
    v_cutoff := coalesce((v_booking.policy_snapshot->>'cancellation_cutoff_minutes')::integer,1440);
    if not coalesce((v_booking.policy_snapshot->>'cancellation_customer_self_service')::boolean,true)
       or v_booking.starts_at - make_interval(mins=>v_cutoff) <= v_now then
      raise log 'booking_cancel_denied code=policy_denied correlation=% tenant=%',v_correlation_id,p_tenant_id;
      raise exception using errcode='42501',message='policy_denied';
    end if;
  end if;

  -- Refund eligibility is evaluated now against the snapshotted schedule, and
  -- is recorded separately from the booking's own state.
  v_percent := private.resolve_refund_percent_bps_v1(
    v_booking.policy_snapshot,v_booking.starts_at,v_now);
  v_refund := (v_booking.price_minor * v_percent) / 10000;

  update app.assignment_allocations a set state='cancelled'
  where a.tenant_id=p_tenant_id and a.hold_id=v_booking.hold_id
    and a.state in ('held','confirmed');
  get diagnostics v_released = row_count;
  update app.booking_holds h set state='released',released_at=v_now,updated_at=v_now
  where h.tenant_id=p_tenant_id and h.id=v_booking.hold_id and h.state='active';

  update app.bookings b
  set status='cancelled', approval_status=case when b.approval_status='pending'
        then 'declined' else b.approval_status end,
      approval_deadline=null, cancelled_at=v_now,
      cancellation_actor_kind=p_actor_kind,
      decision_reason_public=coalesce(p_reason_public,b.decision_reason_public),
      refund_percent_bps=v_percent, refund_eligible_minor=v_refund,
      revision=b.revision+1, updated_at=v_now
  where b.tenant_id=p_tenant_id and b.id=v_booking.id;

  select max(e.sequence)+1 into v_sequence from app.booking_events e
  where e.tenant_id=p_tenant_id and e.booking_id=v_booking.id;
  insert into app.booking_events(
    tenant_id,booking_id,sequence,event_type,actor_kind,actor_membership_id,
    reason,outcome,request_id,booking_revision,metadata)
  values (p_tenant_id,v_booking.id,coalesce(v_sequence,2),'booking_cancelled',
    p_actor_kind,v_membership_id,p_reason_internal,'succeeded',v_correlation_id,
    v_booking.revision+1,
    jsonb_build_object('refund_percent_bps',v_percent,'released_allocations',v_released,
      'has_public_reason',p_reason_public is not null));

  -- The revision is part of the intent key, so a stale duplicate can never
  -- update the wrong version of this booking.
  insert into app.outbox_events(
    tenant_id,booking_id,topic,payload,correlation_id,booking_revision)
  values (p_tenant_id,v_booking.id,'booking.cancelled',
    jsonb_build_object('booking_id',v_booking.id,'locale',v_booking.locale,
      'public_reference',v_booking.public_reference,'refund_percent_bps',v_percent),
    v_correlation_id,v_booking.revision+1)
  on conflict do nothing;

  if p_idempotency_key is not null then
    update app.idempotency_keys k
    set state='succeeded',result_kind='booking',result_id=v_booking.id,updated_at=v_now
    where k.tenant_id=p_tenant_id and k.operation='cancel_booking_v1'
      and k.idempotency_key=p_idempotency_key;
  end if;

  raise log 'booking_cancelled booking=% actor=% correlation=% tenant=%',
    v_booking.id,p_actor_kind,v_correlation_id,p_tenant_id;
  return query select 1,v_booking.id,'cancelled'::text,v_booking.revision+1,v_now,
    v_percent,v_refund,false;
end;
$function$;
comment on function private.cancel_booking_v1(uuid,uuid,bigint,text,text,text,uuid,text) is
  'Cancellation v1 engine. Locks the booking revision, re-reads actor authority and the snapshotted policy, releases capacity exactly once, records refund eligibility separately from booking state, and leaves the provider refund to issue #23.';
revoke all on function private.cancel_booking_v1(uuid,uuid,bigint,text,text,text,uuid,text) from public;
grant execute on function private.cancel_booking_v1(uuid,uuid,bigint,text,text,text,uuid,text) to anon,authenticated;

create or replace function private.reschedule_booking_v1(
  p_tenant_id uuid,
  p_booking_id uuid,
  p_expected_revision bigint,
  p_new_start timestamptz,
  p_actor_kind text,
  p_reason_internal text default null,
  p_request_id uuid default null
)
returns table(
  contract_version integer,
  booking_id uuid,
  status text,
  booking_revision bigint,
  starts_at timestamptz,
  ends_at timestamptz,
  reschedule_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
#variable_conflict use_column
declare
  v_now timestamptz := statement_timestamp();
  v_correlation_id uuid := coalesce(p_request_id,pg_catalog.gen_random_uuid());
  v_booking app.bookings%rowtype;
  v_membership_id uuid;
  v_sequence bigint;
  v_cutoff integer;
  v_allowance integer;
  v_new_end timestamptz;
  v_moved integer;
  v_matched bigint;
  v_no_slot_code text;
  v_staff_id uuid;
begin
  if p_actor_kind is null or p_actor_kind not in ('guest','member','system') then
    raise exception using errcode='22023',message='booking_invalid_actor';
  end if;
  if p_new_start is null or p_new_start <> pg_catalog.date_trunc('minute',p_new_start) then
    raise exception using errcode='22023',message='booking_invalid_slot';
  end if;

  select * into v_booking from app.bookings b
  where b.tenant_id=p_tenant_id and b.id=p_booking_id
  for update;
  if v_booking.id is null then
    raise exception using errcode='42501',message='booking_context_required';
  end if;
  if p_actor_kind='member' then
    if not coalesce((select private.is_active_tenant_member(p_tenant_id)),false)
       or not coalesce((select private.can_access_location(p_tenant_id,v_booking.location_id)),false)
       or not coalesce((select private.can_decide_booking(
            p_tenant_id,v_booking.location_id,'booking.reschedule')),false) then
      raise exception using errcode='42501',message='policy_denied';
    end if;
    v_membership_id := (select private.current_membership_id(p_tenant_id));
  end if;
  if v_booking.status <> 'confirmed'
     or v_booking.revision is distinct from p_expected_revision then
    raise log 'booking_reschedule_denied code=revision_conflict correlation=% tenant=%',v_correlation_id,p_tenant_id;
    raise exception using errcode='23505',message='revision_conflict';
  end if;

  -- The cutoff and the allowance govern the customer only. A staff move is
  -- never blocked by an exhausted customer allowance (ADR-0005 rows 20-21).
  if p_actor_kind='guest' then
    v_cutoff := coalesce((v_booking.policy_snapshot->>'reschedule_cutoff_minutes')::integer,1440);
    v_allowance := coalesce((v_booking.policy_snapshot->>'reschedule_max_per_booking')::integer,2);
    if not coalesce((v_booking.policy_snapshot->>'reschedule_customer_self_service')::boolean,true)
       or v_booking.starts_at - make_interval(mins=>v_cutoff) <= v_now
       or v_booking.reschedule_count >= v_allowance then
      raise log 'booking_reschedule_denied code=policy_denied correlation=% tenant=%',v_correlation_id,p_tenant_id;
      raise exception using errcode='42501',message='policy_denied';
    end if;
  end if;

  -- The new time must be one the availability engine actually offers now, read
  -- inside this transaction, with the booking's own allocation ignored so a
  -- move within its own slot is not blocked by itself.
  v_new_end := p_new_start + make_interval(mins=>v_booking.duration_minutes);
  select count(*) filter (where a.result_kind='slot' and a.slot_start=p_new_start),
         max(a.no_slot_code),
         (array_agg(a.staff_id order by a.candidate_rank)
           filter (where a.result_kind='slot' and a.slot_start=p_new_start))[1]
  into v_matched,v_no_slot_code,v_staff_id
  from private.get_availability_v1(
    (select d.hostname from app.tenant_domains d
     where d.tenant_id=p_tenant_id and d.application='client' and d.kind='production'
       and d.verification_status='verified' and d.active limit 1),
    'client',v_booking.service_id,v_booking.location_id,null,p_new_start,v_new_end,1,
    v_booking.customer_time_zone) a;
  if coalesce(v_matched,0)=0 then
    if v_no_slot_code='policy_restricted' then
      raise log 'booking_reschedule_denied code=policy_denied correlation=% tenant=%',v_correlation_id,p_tenant_id;
      raise exception using errcode='42501',message='policy_denied';
    end if;
    raise log 'booking_reschedule_denied code=slot_unavailable correlation=% tenant=%',v_correlation_id,p_tenant_id;
    raise exception using errcode='23P01',message='slot_unavailable';
  end if;

  -- Secure the new capacity before releasing the old, in this transaction. The
  -- exclusion constraints stay the final guard, so a race raises
  -- slot_unavailable and this whole statement rolls back — leaving the original
  -- booking and its allocation exactly as they were.
  insert into app.assignment_allocations(
    id,tenant_id,service_id,location_id,staff_id,resource_id,resource_type_id,
    starts_at,ends_at,buffer_before_minutes,buffer_after_minutes,state,hold_id)
  select pg_catalog.gen_random_uuid(),p_tenant_id,a.service_id,a.location_id,
    case when a.staff_id is null then null else coalesce(v_staff_id,a.staff_id) end,
    a.resource_id,a.resource_type_id,p_new_start,v_new_end,
    a.buffer_before_minutes,a.buffer_after_minutes,'confirmed',
    -- The hold is the booking's capacity handle for its whole life, so a moved
    -- allocation keeps it and cancellation can still find and release it.
    v_booking.hold_id
  from app.assignment_allocations a
  where a.tenant_id=p_tenant_id and a.hold_id=v_booking.hold_id and a.state='confirmed'
  order by a.id;
  get diagnostics v_moved = row_count;
  if v_moved = 0 then
    raise log 'booking_reschedule_denied code=slot_unavailable correlation=% tenant=% reason=no_allocation',v_correlation_id,p_tenant_id;
    raise exception using errcode='23P01',message='slot_unavailable';
  end if;
  -- Release only the allocation the booking is moving away from: the new one
  -- shares its hold, and cancelling by hold alone would undo the move.
  update app.assignment_allocations a set state='cancelled'
  where a.tenant_id=p_tenant_id and a.hold_id=v_booking.hold_id and a.state='confirmed'
    and a.starts_at=v_booking.starts_at and a.ends_at=v_booking.ends_at;

  update app.bookings b
  set starts_at=p_new_start, ends_at=v_new_end,
      reschedule_count=b.reschedule_count + case when p_actor_kind='guest' then 1 else 0 end,
      revision=b.revision+1, updated_at=v_now
  where b.tenant_id=p_tenant_id and b.id=v_booking.id;

  select max(e.sequence)+1 into v_sequence from app.booking_events e
  where e.tenant_id=p_tenant_id and e.booking_id=v_booking.id;
  insert into app.booking_events(
    tenant_id,booking_id,sequence,event_type,actor_kind,actor_membership_id,
    reason,outcome,request_id,booking_revision,metadata)
  values (p_tenant_id,v_booking.id,coalesce(v_sequence,2),'booking_rescheduled',
    p_actor_kind,v_membership_id,p_reason_internal,'succeeded',v_correlation_id,
    v_booking.revision+1,
    -- Both times, the timezone they are read in, and the price snapshot the
    -- booking keeps, so history explains the move without the current row.
    jsonb_build_object('previous_starts_at',v_booking.starts_at,
      'previous_ends_at',v_booking.ends_at,'starts_at',p_new_start,
      'customer_time_zone',v_booking.customer_time_zone,
      'location_time_zone',v_booking.location_time_zone,
      'price_minor',v_booking.price_minor,'currency',v_booking.currency));

  insert into app.outbox_events(
    tenant_id,booking_id,topic,payload,correlation_id,booking_revision)
  values (p_tenant_id,v_booking.id,'booking.rescheduled',
    jsonb_build_object('booking_id',v_booking.id,'locale',v_booking.locale,
      'public_reference',v_booking.public_reference,'starts_at',p_new_start),
    v_correlation_id,v_booking.revision+1)
  on conflict do nothing;

  raise log 'booking_rescheduled booking=% actor=% correlation=% tenant=%',
    v_booking.id,p_actor_kind,v_correlation_id,p_tenant_id;
  return query select 1,v_booking.id,'confirmed'::text,v_booking.revision+1,
    p_new_start,v_new_end,
    v_booking.reschedule_count + case when p_actor_kind='guest' then 1 else 0 end;
end;
$function$;
comment on function private.reschedule_booking_v1(uuid,uuid,bigint,timestamptz,text,text,uuid) is
  'Reschedule v1 engine. Locks the booking revision, re-reads authority, snapshotted policy, and live availability, secures the new allocation before releasing the old one in the same transaction, and records both times in immutable history.';
revoke all on function private.reschedule_booking_v1(uuid,uuid,bigint,timestamptz,text,text,uuid) from public;
grant execute on function private.reschedule_booking_v1(uuid,uuid,bigint,timestamptz,text,text,uuid) to anon,authenticated;

-- Staff entry point. The Dashboard calls these; both re-read live authority.
create or replace function api_v1.cancel_booking_v1(
  p_tenant_id uuid,
  p_booking_id uuid,
  p_expected_revision bigint,
  p_reason_public text default null,
  p_reason_internal text default null,
  p_request_id uuid default null
)
returns table(
  contract_version integer, booking_id uuid, status text, booking_revision bigint,
  cancelled_at timestamptz, refund_percent_bps integer, refund_eligible_minor bigint,
  replayed boolean
)
language sql volatile security invoker set search_path = '' set statement_timeout = '5s' as $$
  select * from private.cancel_booking_v1(p_tenant_id,p_booking_id,p_expected_revision,
    'member',p_reason_public,p_reason_internal,p_request_id,null);
$$;
revoke all on function api_v1.cancel_booking_v1(uuid,uuid,bigint,text,text,uuid) from public,anon;
grant execute on function api_v1.cancel_booking_v1(uuid,uuid,bigint,text,text,uuid) to authenticated;

create or replace function api_v1.reschedule_booking_v1(
  p_tenant_id uuid,
  p_booking_id uuid,
  p_expected_revision bigint,
  p_new_start timestamptz,
  p_reason_internal text default null,
  p_request_id uuid default null
)
returns table(
  contract_version integer, booking_id uuid, status text, booking_revision bigint,
  starts_at timestamptz, ends_at timestamptz, reschedule_count integer
)
language sql volatile security invoker set search_path = '' set statement_timeout = '5s' as $$
  select * from private.reschedule_booking_v1(p_tenant_id,p_booking_id,p_expected_revision,
    p_new_start,'member',p_reason_internal,p_request_id);
$$;
revoke all on function api_v1.reschedule_booking_v1(uuid,uuid,bigint,timestamptz,text,uuid) from public,anon;
grant execute on function api_v1.reschedule_booking_v1(uuid,uuid,bigint,timestamptz,text,uuid) to authenticated;

-- Customer entry point. The management link establishes which booking, its
-- intent decides which action, and its verified step-up is required before
-- either one runs (ADR-0004 decisions 6 and 9).
create or replace function private.act_on_management_link_v1(
  p_hostname text,
  p_application text,
  p_token text,
  p_action text,
  p_expected_revision bigint,
  p_new_start timestamptz default null,
  p_reason_public text default null
)
returns table(
  contract_version integer,
  outcome text,
  booking_id uuid,
  status text,
  booking_revision bigint,
  starts_at timestamptz,
  ends_at timestamptz,
  refund_percent_bps integer,
  refund_eligible_minor bigint,
  currency text
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
#variable_conflict use_column
declare
  v_now timestamptz := statement_timestamp();
  v_request_id uuid := pg_catalog.gen_random_uuid();
  v_tenant_id uuid;
  v_token app.management_tokens%rowtype;
  v_verified boolean;
  v_cancel record;
  v_move record;
  v_currency text;
begin
  if p_action is null or p_action not in ('cancel','reschedule') then
    return query select 1,'unavailable'::text,null::uuid,null::text,null::bigint,
      null::timestamptz,null::timestamptz,null::integer,null::bigint,null::text;
    return;
  end if;
  select r.tenant_id into v_tenant_id
  from api_v1.resolve_public_tenant_v1(p_hostname,p_application) r;
  if v_tenant_id is null or p_token is null or p_token !~ '^[a-f0-9]{64}$' then
    return query select 1,'unavailable'::text,null::uuid,null::text,null::bigint,
      null::timestamptz,null::timestamptz,null::integer,null::bigint,null::text;
    return;
  end if;

  select * into v_token from app.management_tokens t
  where t.tenant_id=v_tenant_id
    and t.token_hash=encode(pg_catalog.sha256(
      pg_catalog.convert_to(v_tenant_id::text||':'||p_token,'UTF8')),'hex')
  for update;
  select exists (
    select 1 from app.management_otps o
    where o.token_id=v_token.id and o.verified_at is not null
      and o.verified_at > v_now - interval '15 minutes')
  into v_verified;

  -- A link that is not live, not for this action, or not stepped up is refused
  -- exactly like an unknown one.
  if v_token.id is null or v_token.intent is distinct from p_action
     or v_token.expires_at <= v_now or v_token.revoked_at is not null
     or v_token.consumed_at is not null or not v_verified then
    insert into app.management_access_events(
      tenant_id,booking_id,token_id,intent,action,outcome,request_id)
    values (v_tenant_id,v_token.booking_id,v_token.id,p_action,'denied','failed',v_request_id);
    return query select 1,'unavailable'::text,null::uuid,null::text,null::bigint,
      null::timestamptz,null::timestamptz,null::integer,null::bigint,null::text;
    return;
  end if;

  -- An action link is single use: it is consumed before the action runs, so a
  -- replay of the same link cannot repeat the action even on retry.
  update app.management_tokens t set consumed_at=v_now where t.id=v_token.id;

  select b.currency into v_currency from app.bookings b
  where b.tenant_id=v_tenant_id and b.id=v_token.booking_id;

  if p_action='cancel' then
    select * into v_cancel from private.cancel_booking_v1(
      v_tenant_id,v_token.booking_id,p_expected_revision,'guest',p_reason_public,
      null,v_request_id,null) c;
    return query select 1,'applied'::text,v_cancel.booking_id,v_cancel.status,
      v_cancel.booking_revision,null::timestamptz,null::timestamptz,
      v_cancel.refund_percent_bps,v_cancel.refund_eligible_minor,v_currency;
    return;
  end if;

  select * into v_move from private.reschedule_booking_v1(
    v_tenant_id,v_token.booking_id,p_expected_revision,p_new_start,'guest',null,v_request_id) r;
  return query select 1,'applied'::text,v_move.booking_id,v_move.status,
    v_move.booking_revision,v_move.starts_at,v_move.ends_at,null::integer,null::bigint,
    v_currency;
end;
$function$;
revoke all on function private.act_on_management_link_v1(text,text,text,text,bigint,timestamptz,text) from public;
grant execute on function private.act_on_management_link_v1(text,text,text,text,bigint,timestamptz,text) to anon,authenticated;

create or replace function api_v1.act_on_management_link_v1(
  p_hostname text,
  p_application text,
  p_token text,
  p_action text,
  p_expected_revision bigint,
  p_new_start timestamptz default null,
  p_reason_public text default null
)
returns table(
  contract_version integer, outcome text, booking_id uuid, status text,
  booking_revision bigint, starts_at timestamptz, ends_at timestamptz,
  refund_percent_bps integer, refund_eligible_minor bigint, currency text
)
language sql volatile security invoker set search_path = '' set statement_timeout = '5s' as $$
  select * from private.act_on_management_link_v1(
    p_hostname,p_application,p_token,p_action,p_expected_revision,p_new_start,p_reason_public);
$$;
revoke all on function api_v1.act_on_management_link_v1(text,text,text,text,bigint,timestamptz,text) from public;
grant execute on function api_v1.act_on_management_link_v1(text,text,text,text,bigint,timestamptz,text) to anon,authenticated;

-- The outbox key now includes the revision an intent describes, so the three
-- functions that upsert an intent are re-emitted with the wider conflict
-- target. Their behaviour is otherwise unchanged.
create or replace function private.decide_booking_request_v1(
  p_tenant_id uuid,
  p_booking_id uuid,
  p_action text,
  p_expected_revision bigint,
  p_reason_public text default null,
  p_reason_internal text default null,
  p_proposed_start timestamptz default null,
  p_request_id uuid default null
)
returns table(
  contract_version integer,
  booking_id uuid,
  status text,
  approval_status text,
  booking_revision bigint,
  proposal_expires_at timestamptz,
  proposal_action_token text
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
-- The result columns are named for the contract (booking_id, status), which
-- collides with the columns of the tables this body writes. Column wins.
#variable_conflict use_column
declare
  v_now timestamptz := statement_timestamp();
  v_correlation_id uuid := coalesce(p_request_id,pg_catalog.gen_random_uuid());
  v_booking app.bookings%rowtype;
  v_membership_id uuid;
  v_revision app.catalog_service_revisions%rowtype;
  v_status text;
  v_approval text;
  v_sequence bigint;
  v_promoted integer;
  v_token text;
  v_expires_at timestamptz;
  v_proposal_end timestamptz;
begin
  if p_action is null or p_action not in ('accept','reject','propose') then
    raise exception using errcode='22023',message='booking_invalid_action';
  end if;
  if p_reason_public is not null and char_length(p_reason_public) not between 1 and 500 then
    raise exception using errcode='22023',message='booking_invalid_reason';
  end if;
  if p_action='propose' and (p_proposed_start is null
     or p_proposed_start <> pg_catalog.date_trunc('minute',p_proposed_start)) then
    raise exception using errcode='22023',message='booking_invalid_slot';
  end if;

  -- Lock the request before reading anything derived from it, so two staff
  -- decisions serialize instead of both reading `requested`.
  select * into v_booking from app.bookings b
  where b.tenant_id=p_tenant_id and b.id=p_booking_id
  for update;
  if v_booking.id is null
     or not coalesce((select private.is_active_tenant_member(p_tenant_id)),false)
     or not coalesce((select private.can_access_location(p_tenant_id,v_booking.location_id)),false) then
    raise exception using errcode='42501',message='booking_context_required';
  end if;
  -- Authority is re-read at decision time, so a revoked grant cannot decide.
  if not coalesce((select private.can_decide_booking(
       p_tenant_id,v_booking.location_id,'booking.approve')),false) then
    raise log 'booking_decision_denied code=not_authorized correlation=% tenant=%',v_correlation_id,p_tenant_id;
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if v_booking.status <> 'requested' or v_booking.revision is distinct from p_expected_revision then
    raise log 'booking_decision_denied code=revision_conflict correlation=% tenant=% booking=%',
      v_correlation_id,p_tenant_id,v_booking.id;
    raise exception using errcode='23505',message='revision_conflict';
  end if;
  if v_booking.approval_deadline <= v_now then
    -- The SLA already elapsed. Expiry is the terminal decision; a late accept
    -- must not resurrect the request behind the customer's back.
    raise log 'booking_decision_denied code=revision_conflict correlation=% tenant=% reason=sla_elapsed',v_correlation_id,p_tenant_id;
    raise exception using errcode='23505',message='revision_conflict';
  end if;

  v_membership_id := (select private.current_membership_id(p_tenant_id));
  select max(e.sequence)+1 into v_sequence from app.booking_events e
  where e.tenant_id=p_tenant_id and e.booking_id=v_booking.id;

  if p_action='accept' then
    -- Re-read the publication the request snapshotted. Acceptance uses the same
    -- final capacity guard as instant booking: the allocation rows and the
    -- exclusion constraints decide, not this function.
    select * into v_revision from app.catalog_service_revisions sr
    where sr.tenant_id=p_tenant_id and sr.publication_id=v_booking.publication_id
      and sr.service_id=v_booking.service_id and sr.state='published'
    order by (sr.locale=v_booking.locale) desc,sr.locale limit 1;
    if v_revision.id is null then
      raise exception using errcode='23505',message='revision_conflict';
    end if;
    if v_revision.payment_mode <> 'none' then
      -- A deposit or full payment after acceptance is issue #22. Until it ships
      -- the request stays open rather than confirming an unpaid booking.
      raise log 'booking_decision_denied code=payment_pending correlation=% tenant=%',v_correlation_id,p_tenant_id;
      raise exception using errcode='23505',message='payment_pending';
    end if;

    update app.assignment_allocations a set state='confirmed'
    where a.tenant_id=p_tenant_id and a.hold_id=v_booking.hold_id and a.state='held';
    get diagnostics v_promoted = row_count;
    if v_promoted = 0 then
      -- Either the request never reserved capacity (ADR-0005 row 34 default) or
      -- its provisional hold has gone. Allocate now, and let the constraints
      -- refuse if the slot was taken meanwhile.
      insert into app.assignment_allocations(
        id,tenant_id,service_id,location_id,staff_id,resource_id,resource_type_id,
        starts_at,ends_at,buffer_before_minutes,buffer_after_minutes,state,hold_id)
      select pg_catalog.gen_random_uuid(),p_tenant_id,a.service_id,a.location_id,a.staff_id,
        a.resource_id,a.resource_type_id,a.starts_at,a.ends_at,a.buffer_before_minutes,
        a.buffer_after_minutes,'confirmed',v_booking.hold_id
      from app.assignment_allocations a
      where a.tenant_id=p_tenant_id and a.hold_id=v_booking.hold_id
      order by a.id;
      get diagnostics v_promoted = row_count;
      if v_promoted = 0 then
        raise log 'booking_decision_denied code=slot_unavailable correlation=% tenant=% reason=no_allocation',v_correlation_id,p_tenant_id;
        raise exception using errcode='23P01',message='slot_unavailable';
      end if;
    end if;
    update app.booking_holds h set state='released',released_at=v_now,updated_at=v_now
    where h.tenant_id=p_tenant_id and h.id=v_booking.hold_id and h.state='active';
    v_status := 'confirmed';
    v_approval := 'approved';
  elsif p_action='reject' then
    update app.assignment_allocations a set state='cancelled'
    where a.tenant_id=p_tenant_id and a.hold_id=v_booking.hold_id and a.state='held';
    update app.booking_holds h set state='released',released_at=v_now,updated_at=v_now
    where h.tenant_id=p_tenant_id and h.id=v_booking.hold_id and h.state='active';
    v_status := 'rejected';
    v_approval := 'declined';
  else
    -- A proposal leaves the request pending (ADR-0005 row 40) and does not
    -- extend its SLA. The customer receives an intent-scoped expiring link.
    v_proposal_end := p_proposed_start
      + make_interval(mins => v_booking.duration_minutes);
    v_expires_at := least(
      v_now + make_interval(hours =>
        private.resolve_request_policy_v1(v_booking.policy_snapshot,'proposal_ttl_hours')),
      v_booking.approval_deadline,
      p_proposed_start);
    if v_expires_at <= v_now then
      raise exception using errcode='42501',message='policy_denied';
    end if;
    -- Two random UUIDs give a 64-character hex bearer token from the built-in
    -- generator, so the token needs no extension the platform does not already
    -- depend on.
    v_token := pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','')
      || pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','');
    -- Only the digest is stored, so a database read never yields a usable link.
    begin
      insert into app.booking_proposals(
        tenant_id,booking_id,starts_at,ends_at,expires_at,action_token_hash,
        proposed_by_membership_id,message_public,correlation_id)
      values (p_tenant_id,v_booking.id,p_proposed_start,v_proposal_end,v_expires_at,
        encode(pg_catalog.sha256(pg_catalog.convert_to(p_tenant_id::text||':'||v_token,'UTF8')),'hex'),
        v_membership_id,p_reason_public,v_correlation_id);
    exception when unique_violation then
      -- A live proposal already exists, so this staff member decided from a
      -- stale read. The caller learns that, and never a constraint name.
      raise log 'booking_decision_denied code=revision_conflict correlation=% tenant=% reason=proposal_exists',v_correlation_id,p_tenant_id;
      raise exception using errcode='23505',message='revision_conflict';
    end;
    v_status := v_booking.status;
    v_approval := v_booking.approval_status;
  end if;

  if p_action <> 'propose' then
    update app.bookings b
    set status=v_status, approval_status=v_approval,
        approval_deadline=case when v_approval='pending' then b.approval_deadline end,
        decision_reason_public=coalesce(p_reason_public,b.decision_reason_public),
        revision=b.revision+1, updated_at=v_now
    where b.tenant_id=p_tenant_id and b.id=v_booking.id;
    v_booking.revision := v_booking.revision+1;
  end if;

  insert into app.booking_events(
    tenant_id,booking_id,sequence,event_type,actor_kind,actor_membership_id,
    reason,outcome,request_id,booking_revision,metadata)
  values (p_tenant_id,v_booking.id,coalesce(v_sequence,2),
    case p_action when 'accept' then 'booking_confirmed'
      when 'reject' then 'booking_rejected' else 'booking_proposal_created' end,
    'member',v_membership_id,
    -- The internal reason is lineage, never customer-facing text.
    p_reason_internal,'succeeded',v_correlation_id,v_booking.revision,
    jsonb_build_object('action',p_action,'has_public_reason',p_reason_public is not null));

  insert into app.outbox_events(
    tenant_id,booking_id,topic,payload,correlation_id,booking_revision)
  values (p_tenant_id,v_booking.id,
    case p_action when 'accept' then 'booking.confirmed'
      when 'reject' then 'booking.rejected' else 'booking.proposal_created' end,
    jsonb_build_object('booking_id',v_booking.id,'locale',v_booking.locale,
      'public_reference',v_booking.public_reference),
    v_correlation_id,v_booking.revision)
  on conflict (tenant_id,booking_id,topic,booking_revision) do update
    set state='pending',available_at=statement_timestamp(),updated_at=statement_timestamp();

  raise log 'booking_decided booking=% action=% correlation=% tenant=% membership=%',
    v_booking.id,p_action,v_correlation_id,p_tenant_id,v_membership_id;
  return query select 1,v_booking.id,v_status,v_approval,v_booking.revision,
    v_expires_at,v_token;
end;
$function$;
create or replace function private.respond_to_proposal_v1(
  p_hostname text,
  p_application text,
  p_action_token text,
  p_action text
)
returns table(
  contract_version integer,
  booking_id uuid,
  public_reference text,
  status text,
  approval_status text,
  starts_at timestamptz,
  ends_at timestamptz,
  proposal_state text
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
-- The result columns are named for the contract (booking_id, status), which
-- collides with the columns of the tables this body writes. Column wins.
#variable_conflict use_column
declare
  v_now timestamptz := statement_timestamp();
  v_correlation_id uuid := pg_catalog.gen_random_uuid();
  v_tenant_id uuid;
  v_proposal app.booking_proposals%rowtype;
  v_booking app.bookings%rowtype;
  v_sequence bigint;
  v_moved integer;
begin
  if p_action is null or p_action not in ('accept','decline') then
    raise exception using errcode='22023',message='booking_invalid_action';
  end if;
  if p_action_token is null or p_action_token !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='22023',message='booking_invalid_token';
  end if;
  select r.tenant_id into v_tenant_id
  from api_v1.resolve_public_tenant_v1(p_hostname,p_application) r;
  if v_tenant_id is null then
    raise exception using errcode='42501',message='booking_context_required';
  end if;

  select * into v_proposal from app.booking_proposals p
  where p.tenant_id=v_tenant_id
    and p.action_token_hash=encode(pg_catalog.sha256(
      pg_catalog.convert_to(v_tenant_id::text||':'||p_action_token,'UTF8')),'hex')
  for update;
  -- An unknown token and someone else's token are indistinguishable here.
  if v_proposal.id is null then
    raise exception using errcode='42501',message='booking_context_required';
  end if;
  if v_proposal.state <> 'pending' or v_proposal.expires_at <= v_now then
    raise log 'proposal_denied code=revision_conflict correlation=% tenant=%',v_correlation_id,v_tenant_id;
    raise exception using errcode='23505',message='revision_conflict';
  end if;

  select * into v_booking from app.bookings b
  where b.tenant_id=v_tenant_id and b.id=v_proposal.booking_id
  for update;
  if v_booking.status <> 'requested' or v_booking.approval_deadline <= v_now then
    raise exception using errcode='23505',message='revision_conflict';
  end if;
  select max(e.sequence)+1 into v_sequence from app.booking_events e
  where e.tenant_id=v_tenant_id and e.booking_id=v_booking.id;

  if p_action='decline' then
    -- Declining returns the request to its original pending decision without
    -- extending the response SLA (ADR-0005 row 40).
    update app.booking_proposals p set state='declined',updated_at=v_now where p.id=v_proposal.id;
    insert into app.booking_events(
      tenant_id,booking_id,sequence,event_type,actor_kind,outcome,request_id,
      booking_revision,metadata)
    values (v_tenant_id,v_booking.id,coalesce(v_sequence,2),'booking_proposal_declined',
      'guest','succeeded',v_correlation_id,v_booking.revision,
      jsonb_build_object('proposal_id',v_proposal.id));
    insert into app.outbox_events(
      tenant_id,booking_id,topic,payload,correlation_id,booking_revision)
    values (v_tenant_id,v_booking.id,'booking.proposal_declined',
      jsonb_build_object('booking_id',v_booking.id,'proposal_id',v_proposal.id),
      v_correlation_id,v_booking.revision)
    on conflict (tenant_id,booking_id,topic,booking_revision) do update
      set state='pending',available_at=statement_timestamp(),updated_at=statement_timestamp();
    return query select 1,v_booking.id,v_booking.public_reference,v_booking.status,
      v_booking.approval_status,v_booking.starts_at,v_booking.ends_at,'declined'::text;
    return;
  end if;

  -- Secure the proposed capacity before releasing the requested one, in this
  -- transaction. The exclusion constraints remain the final guard.
  insert into app.assignment_allocations(
    id,tenant_id,service_id,location_id,staff_id,resource_id,resource_type_id,
    starts_at,ends_at,buffer_before_minutes,buffer_after_minutes,state,hold_id)
  select pg_catalog.gen_random_uuid(),v_tenant_id,a.service_id,a.location_id,a.staff_id,
    a.resource_id,a.resource_type_id,v_proposal.starts_at,v_proposal.ends_at,
    a.buffer_before_minutes,a.buffer_after_minutes,'confirmed',v_booking.hold_id
  from app.assignment_allocations a
  where a.tenant_id=v_tenant_id and a.hold_id=v_booking.hold_id
  order by a.id;
  get diagnostics v_moved = row_count;
  if v_moved = 0 then
    raise log 'proposal_denied code=slot_unavailable correlation=% tenant=% reason=no_allocation',v_correlation_id,v_tenant_id;
    raise exception using errcode='23P01',message='slot_unavailable';
  end if;
  -- Release only what the booking is moving away from: the new allocation
  -- shares the same hold, and cancelling by hold alone would undo the move.
  update app.assignment_allocations a set state='cancelled'
  where a.tenant_id=v_tenant_id and a.hold_id=v_booking.hold_id
    and a.state in ('held','confirmed')
    and a.starts_at=v_booking.starts_at and a.ends_at=v_booking.ends_at;
  update app.booking_holds h set state='released',released_at=v_now,updated_at=v_now
  where h.tenant_id=v_tenant_id and h.id=v_booking.hold_id and h.state='active';

  update app.bookings b
  set status='confirmed', approval_status='approved', approval_deadline=null,
      starts_at=v_proposal.starts_at, ends_at=v_proposal.ends_at,
      revision=b.revision+1, updated_at=v_now
  where b.tenant_id=v_tenant_id and b.id=v_booking.id;
  update app.booking_proposals p set state='accepted',updated_at=v_now where p.id=v_proposal.id;

  insert into app.booking_events(
    tenant_id,booking_id,sequence,event_type,actor_kind,outcome,request_id,
    booking_revision,metadata)
  values (v_tenant_id,v_booking.id,coalesce(v_sequence,2),'booking_confirmed','guest',
    'succeeded',v_correlation_id,v_booking.revision+1,
    -- Both times stay in history, so the move is auditable without reading the
    -- current row.
    jsonb_build_object('proposal_id',v_proposal.id,
      'previous_starts_at',v_booking.starts_at,'starts_at',v_proposal.starts_at));
  insert into app.outbox_events(
    tenant_id,booking_id,topic,payload,correlation_id,booking_revision)
  values (v_tenant_id,v_booking.id,'booking.confirmed',
    jsonb_build_object('booking_id',v_booking.id,'locale',v_booking.locale,
      'public_reference',v_booking.public_reference,'starts_at',v_proposal.starts_at),
    v_correlation_id,v_booking.revision+1)
  on conflict (tenant_id,booking_id,topic,booking_revision) do update
    set state='pending',available_at=statement_timestamp(),updated_at=statement_timestamp();

  raise log 'proposal_accepted booking=% proposal=% correlation=% tenant=%',
    v_booking.id,v_proposal.id,v_correlation_id,v_tenant_id;
  return query select 1,v_booking.id,v_booking.public_reference,'confirmed'::text,
    'approved'::text,v_proposal.starts_at,v_proposal.ends_at,'accepted'::text;
end;
$function$;
create or replace function private.request_management_otp_v1(
  p_hostname text,
  p_application text,
  p_token text
)
returns table(contract_version integer, outcome text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
#variable_conflict use_column
declare
  v_now timestamptz := statement_timestamp();
  v_request_id uuid := pg_catalog.gen_random_uuid();
  v_tenant_id uuid;
  v_token app.management_tokens%rowtype;
  v_otp_id uuid;
  v_expires_at timestamptz := statement_timestamp() + interval '10 minutes';
  v_recent integer;
begin
  select r.tenant_id into v_tenant_id
  from api_v1.resolve_public_tenant_v1(p_hostname,p_application) r;
  if v_tenant_id is null or p_token is null or p_token !~ '^[a-f0-9]{64}$' then
    return query select 1,'unavailable'::text,null::timestamptz;
    return;
  end if;
  select * into v_token from app.management_tokens t
  where t.tenant_id=v_tenant_id
    and t.token_hash=encode(pg_catalog.sha256(
      pg_catalog.convert_to(v_tenant_id::text||':'||p_token,'UTF8')),'hex');
  select count(*) into v_recent from app.management_access_events e
  where e.token_id=v_token.id and e.action='otp_requested'
    and e.created_at > v_now - interval '10 minutes';
  if v_token.id is null or v_token.intent='view' or v_token.expires_at <= v_now
     or v_token.revoked_at is not null or v_token.consumed_at is not null
     or coalesce(v_recent,0) >= 3 then
    insert into app.management_access_events(
      tenant_id,booking_id,token_id,intent,action,outcome,request_id)
    values (v_tenant_id,v_token.booking_id,v_token.id,v_token.intent,'denied','failed',v_request_id);
    return query select 1,'unavailable'::text,null::timestamptz;
    return;
  end if;

  -- The challenge is created without a code. The notification worker mints one
  -- when it sends the email, so no code plaintext is ever written here.
  delete from app.management_otps o where o.token_id=v_token.id and o.verified_at is null;
  insert into app.management_otps(tenant_id,token_id,expires_at)
  values (v_tenant_id,v_token.id,v_expires_at)
  returning id into v_otp_id;

  insert into app.outbox_events(tenant_id,booking_id,topic,payload,correlation_id)
  values (v_tenant_id,v_token.booking_id,'management.otp_requested',
    jsonb_build_object('otp_id',v_otp_id,'expires_at',v_expires_at),
    v_request_id)
  on conflict (tenant_id,booking_id,topic,booking_revision) do update
    set payload=excluded.payload, state='pending',
        available_at=statement_timestamp(), updated_at=statement_timestamp();

  insert into app.management_access_events(
    tenant_id,booking_id,token_id,intent,action,outcome,request_id)
  values (v_tenant_id,v_token.booking_id,v_token.id,v_token.intent,'otp_requested','succeeded',v_request_id);
  raise log 'management_otp_requested booking=% intent=% tenant=%',v_token.booking_id,v_token.intent,v_tenant_id;
  return query select 1,'sent'::text,v_expires_at;
end;
$function$;

-- The expiry job writes an intent too, so it is re-emitted with the wider
-- conflict target as well.
create or replace function private.expire_booking_requests_v1(
  p_tenant_id uuid default null,
  p_limit integer default 500
)
returns table(expired_requests integer, expired_proposals integer)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_ids uuid[];
  v_expired integer;
  v_proposals integer;
begin
  if p_limit is null or p_limit not between 1 and 5000 then
    raise exception using errcode='22023',message='booking_invalid_batch';
  end if;
  select coalesce(array_agg(candidate.id),'{}'::uuid[]) into v_ids from (
    select b.id from app.bookings b
    where b.status='requested' and b.approval_deadline<=v_now
      and (p_tenant_id is null or b.tenant_id=p_tenant_id)
    order by b.approval_deadline
    limit p_limit
    for update skip locked
  ) candidate;

  update app.assignment_allocations a set state='cancelled'
  where a.hold_id in (select b.hold_id from app.bookings b where b.id = any(v_ids))
    and a.state='held';
  update app.booking_holds h set state='released',released_at=v_now,updated_at=v_now
  where h.id in (select b.hold_id from app.bookings b where b.id = any(v_ids))
    and h.state='active';

  insert into app.booking_events(
    tenant_id,booking_id,sequence,event_type,actor_kind,reason,outcome,request_id,
    booking_revision,metadata)
  select b.tenant_id,b.id,
    coalesce((select max(e.sequence)+1 from app.booking_events e
      where e.tenant_id=b.tenant_id and e.booking_id=b.id),2),
    'booking_request_expired','system','response_sla_elapsed','succeeded',
    b.correlation_id,b.revision+1,jsonb_build_object('deadline',b.approval_deadline)
  from app.bookings b where b.id = any(v_ids);
  insert into app.outbox_events(
    tenant_id,booking_id,topic,payload,correlation_id,booking_revision)
  select b.tenant_id,b.id,'booking.request_expired',
    jsonb_build_object('booking_id',b.id,'locale',b.locale,
      'public_reference',b.public_reference),b.correlation_id,b.revision+1
  from app.bookings b where b.id = any(v_ids)
  on conflict (tenant_id,booking_id,topic,booking_revision) do nothing;

  with expired as (
    update app.bookings b
    set status='expired', approval_status='expired', approval_deadline=null,
        revision=b.revision+1, updated_at=v_now
    where b.id = any(v_ids) and b.status='requested'
    returning 1
  ) select count(*)::integer into v_expired from expired;

  with lapsed as (
    update app.booking_proposals p set state='expired',updated_at=v_now
    where p.state='pending' and p.expires_at<=v_now
      and (p_tenant_id is null or p.tenant_id=p_tenant_id)
    returning 1
  ) select count(*)::integer into v_proposals from lapsed;

  if v_expired > 0 or v_proposals > 0 then
    raise log 'booking_request_expiry_batch requests=% proposals=% tenant=%',
      v_expired,v_proposals,coalesce(p_tenant_id::text,'all');
  end if;
  return query select v_expired,v_proposals;
end;
$$;
