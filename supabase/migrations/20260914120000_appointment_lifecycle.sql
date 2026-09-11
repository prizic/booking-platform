-- Issue #17: the full appointment lifecycle after confirmation. One transition
-- engine, one ledger, one set of reads. Everything an operator does to a
-- confirmed booking goes through `transition_booking_v1`; nothing here invents
-- a second way to occupy time, release capacity, or authorize an actor.
--
-- The permitted transitions are exactly §7.1, no more:
--
--   confirmed  -> checked_in   booking.check_in      (+ check_in_override off-window)
--   checked_in -> completed    booking.complete
--   confirmed  -> no_show      booking.mark_no_show
--   checked_in -> confirmed    booking.correct_status
--   completed  -> confirmed    booking.correct_status
--   no_show    -> confirmed    booking.correct_status
--
-- `cancelled` is deliberately not correctable. Cancellation released the
-- allocation (issue #15); re-confirming from here would need capacity nobody
-- is holding any more, so the honest recovery is a new booking.
--
-- Payment, refund, notification, and calendar states are untouched by every
-- transition below (invariant 9): a booking completes while a refund is still
-- pending, and an operator never has to repair an email to close out a day.
--
-- Error vocabulary. The published strings are reused; this migration adds one
-- because "you asked for a transition this booking cannot make" is genuinely
-- not "your read was stale" and not "policy forbids you":
--   transition_not_allowed 42501  the action does not exist from this status
--   policy_denied          42501  capability, location scope, or window denial
--   revision_conflict      23505  the caller acted on a superseded revision
--   idempotency_conflict   23505  key reused with a different normalized request
--
-- Scheduling blocks, maintenance, and time off are NOT re-implemented here.
-- They are `save_schedule_config_v1` operations from issue #9 and already feed
-- the availability engine, which is the only thing that decides what can be
-- allocated. Staff/resource deactivation already demands an explicit
-- reassign/cancel/defer decision in `deactivate_staff_v1` (issue #8); this
-- migration adds tests for that contract rather than a second copy of it.

alter table app.bookings drop constraint bookings_status_check;
alter table app.bookings add constraint bookings_status_check
  check (status in ('requested','confirmed','checked_in','cancelled','completed','no_show','rejected','expired'));

alter table app.booking_events drop constraint booking_events_event_type_check;
alter table app.booking_events add constraint booking_events_event_type_check
  check (event_type in (
    'booking_requested','booking_confirmed','booking_cancelled','booking_completed',
    'booking_no_show','booking_rejected','booking_request_expired',
    'booking_proposal_created','booking_proposal_declined','booking_rescheduled',
    -- Issue #17. Operational transitions and the administrative actions that
    -- are not transitions both land in this one ledger: a second audit table
    -- would be a second version of the truth, and the analytics read below
    -- would then have to pick one.
    'booking_checked_in','booking_status_corrected',
    'booking_created_on_behalf','booking_note_added'));

alter table app.idempotency_keys drop constraint idempotency_keys_operation_check;
alter table app.idempotency_keys add constraint idempotency_keys_operation_check
  check (operation in ('create_hold_v1','confirm_booking_v1','cancel_booking_v1',
    'reschedule_booking_v1','transition_booking_v1'));

-- Operational notes and sensitive notes are one table with two visibilities,
-- because they are the same kind of record with different audiences — but the
-- read policies are separate and the sensitive one is gated on exactly the
-- capability that already gates intake answers and contact rows. Seeing the
-- calendar never reveals a sensitive note.
create table app.booking_notes (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  booking_id uuid not null,
  visibility text not null check (visibility in ('operational','sensitive')),
  body text not null check (body = btrim(body) and char_length(body) between 1 and 2000),
  author_membership_id uuid,
  created_at timestamptz not null default statement_timestamp(),
  primary key (id),
  foreign key (tenant_id,booking_id) references app.bookings(tenant_id,id) on delete restrict,
  foreign key (tenant_id,author_membership_id) references app.memberships(tenant_id,id) on delete restrict
);
create index booking_notes_booking_idx on app.booking_notes(tenant_id,booking_id,created_at);

-- A note is a record of what someone observed at a moment. Editing it in place
-- would rewrite history, so it reuses the append-only guard the ledger uses.
create trigger booking_notes_append_only
  before update or delete on app.booking_notes
  for each row execute function private.enforce_append_only();

alter table app.booking_notes enable row level security;
create policy booking_notes_select_operational on app.booking_notes for select to authenticated
using (visibility = 'operational' and exists (
  select 1 from app.bookings b
  where b.tenant_id = booking_notes.tenant_id and b.id = booking_notes.booking_id
    and (select private.is_active_tenant_member(b.tenant_id))
    and (select private.can_access_location(b.tenant_id,b.location_id))));
create policy booking_notes_select_sensitive on app.booking_notes for select to authenticated
using (visibility = 'sensitive' and exists (
  select 1 from app.bookings b
  where b.tenant_id = booking_notes.tenant_id and b.id = booking_notes.booking_id
    and (select private.is_active_tenant_member(b.tenant_id))
    and (select private.can_access_location(b.tenant_id,b.location_id))
    and (select private.has_direct_capability(b.tenant_id,'customer.pii.view'))));
create policy booking_notes_insert_denied on app.booking_notes for insert to anon,authenticated with check (false);
create policy booking_notes_update_denied on app.booking_notes for update to anon,authenticated using (false) with check (false);
create policy booking_notes_delete_denied on app.booking_notes for delete to anon,authenticated using (false);
revoke all on app.booking_notes from public,anon,authenticated;
grant select on app.booking_notes to authenticated;

-- The transition engine. Every operational status change in the product goes
-- through here, so the permitted-transition table exists once.
create or replace function private.transition_booking_v1(
  p_tenant_id uuid,
  p_booking_id uuid,
  p_action text,
  p_expected_revision bigint,
  p_reason text default null,
  p_request_id uuid default null,
  p_idempotency_key text default null
)
returns table(
  contract_version integer,
  booking_id uuid,
  status text,
  booking_revision bigint,
  replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
declare
  v_now timestamptz := statement_timestamp();
  v_correlation_id uuid := coalesce(p_request_id,pg_catalog.gen_random_uuid());
  v_booking app.bookings%rowtype;
  v_membership_id uuid;
  v_target text;
  v_capability text;
  v_event text;
  v_sequence bigint;
  v_window integer;
  v_in_window boolean;
  v_request_hash text;
  v_existing app.idempotency_keys%rowtype;
begin
  -- The permitted-transition table, stated once as data rather than as nested
  -- branches, so "which transitions exist" is readable in six lines.
  v_target := case p_action
    when 'check_in' then 'checked_in'
    when 'complete' then 'completed'
    when 'no_show' then 'no_show'
    when 'correct' then 'confirmed'
  end;
  v_capability := case p_action
    when 'check_in' then 'booking.check_in'
    when 'complete' then 'booking.complete'
    when 'no_show' then 'booking.mark_no_show'
    when 'correct' then 'booking.correct_status'
  end;
  v_event := case p_action
    when 'check_in' then 'booking_checked_in'
    when 'complete' then 'booking_completed'
    when 'no_show' then 'booking_no_show'
    when 'correct' then 'booking_status_corrected'
  end;
  if v_target is null then
    raise exception using errcode='22023',message='booking_invalid_action';
  end if;
  -- A correction overrides a recorded outcome, so it must say why. The reason
  -- is internal: it lands in the ledger, never on a guest-facing surface.
  if p_action = 'correct'
     and (p_reason is null or char_length(btrim(p_reason)) not between 1 and 500) then
    raise exception using errcode='22023',message='booking_reason_required';
  end if;

  v_request_hash := encode(pg_catalog.sha256(pg_catalog.convert_to(
    p_booking_id::text||':'||p_action,'UTF8')),'hex');
  if p_idempotency_key is not null then
    -- Double-clicking "check in" is one check-in. A retry of the same action on
    -- the same booking returns the settled result instead of a conflict.
    insert into app.idempotency_keys(
      tenant_id,operation,idempotency_key,request_hash,state,correlation_id,expires_at)
    values (p_tenant_id,'transition_booking_v1',p_idempotency_key,v_request_hash,
      'in_progress',v_correlation_id,v_now+interval '24 hours')
    on conflict (tenant_id,operation,idempotency_key) do nothing;
    if not found then
      select * into v_existing from app.idempotency_keys k
      where k.tenant_id=p_tenant_id and k.operation='transition_booking_v1'
        and k.idempotency_key=p_idempotency_key
      for update;
      if v_existing.request_hash is distinct from v_request_hash then
        raise exception using errcode='23505',message='idempotency_conflict';
      end if;
      select * into v_booking from app.bookings b
      where b.tenant_id=p_tenant_id and b.id=v_existing.result_id;
      if v_booking.id is null then
        raise exception using errcode='23505',message='idempotency_conflict';
      end if;
      return query select 1,v_booking.id,v_booking.status,v_booking.revision,true;
      return;
    end if;
  end if;

  select * into v_booking from app.bookings b
  where b.tenant_id=p_tenant_id and b.id=p_booking_id
  for update;
  -- A booking in another tenant is indistinguishable from one that does not
  -- exist: a cross-tenant probe learns nothing from the error.
  if v_booking.id is null then
    raise exception using errcode='42501',message='booking_context_required';
  end if;

  -- Authority is re-read now, against this booking's location, so a revoked
  -- grant or a narrowed location scope cannot act on a page loaded earlier.
  if not coalesce((select private.is_active_tenant_member(p_tenant_id)),false)
     or not coalesce((select private.can_access_location(p_tenant_id,v_booking.location_id)),false)
     or not coalesce((select private.can_decide_booking(
          p_tenant_id,v_booking.location_id,v_capability)),false) then
    raise log 'booking_transition_denied code=policy_denied action=% correlation=% tenant=%',
      p_action,v_correlation_id,p_tenant_id;
    raise exception using errcode='42501',message='policy_denied';
  end if;
  v_membership_id := (select private.current_membership_id(p_tenant_id));

  -- A stale revision is answered first, because it is the more useful fact: the
  -- loser of a race between two operators must refresh, and the status it would
  -- otherwise be told about is the status the winner just created, not the one
  -- it acted on. The transition table is then judged against the state the
  -- caller genuinely read, so "confirmed cannot complete" stays its own answer.
  if v_booking.revision is distinct from p_expected_revision then
    raise log 'booking_transition_denied code=revision_conflict action=% correlation=% tenant=%',
      p_action,v_correlation_id,p_tenant_id;
    raise exception using errcode='23505',message='revision_conflict';
  end if;
  if not (
       (p_action='check_in' and v_booking.status='confirmed')
    or (p_action='complete' and v_booking.status='checked_in')
    or (p_action='no_show' and v_booking.status='confirmed')
    or (p_action='correct' and v_booking.status in ('checked_in','completed','no_show'))
  ) then
    raise log 'booking_transition_denied code=transition_not_allowed action=% from=% correlation=% tenant=%',
      p_action,v_booking.status,v_correlation_id,p_tenant_id;
    raise exception using errcode='42501',message='transition_not_allowed';
  end if;

  -- Check-in has an operational window read from the booking's own snapshot
  -- (invariant 5), not from the tenant's current settings. Outside it, arriving
  -- early or closing out yesterday is a separate, separately granted authority.
  if p_action='check_in' then
    v_window := coalesce((v_booking.policy_snapshot->>'check_in_window_minutes')::integer,60);
    v_in_window := v_now >= v_booking.starts_at - pg_catalog.make_interval(mins=>v_window)
               and v_now <= v_booking.ends_at + pg_catalog.make_interval(mins=>v_window);
    if not v_in_window and not coalesce((select private.can_decide_booking(
         p_tenant_id,v_booking.location_id,'booking.check_in_override')),false) then
      raise log 'booking_transition_denied code=policy_denied reason=window correlation=% tenant=%',
        v_correlation_id,p_tenant_id;
      raise exception using errcode='42501',message='policy_denied';
    end if;
  end if;

  -- Only the operational status and the revision move. Payment, refund,
  -- notification, and calendar states are somebody else's column.
  update app.bookings b
  set status=v_target, revision=b.revision+1, updated_at=v_now
  where b.tenant_id=p_tenant_id and b.id=v_booking.id;

  select max(e.sequence)+1 into v_sequence from app.booking_events e
  where e.tenant_id=p_tenant_id and e.booking_id=v_booking.id;
  insert into app.booking_events(
    tenant_id,booking_id,sequence,event_type,actor_kind,actor_membership_id,
    effective_actor_id,reason,outcome,request_id,booking_revision,metadata)
  values (p_tenant_id,v_booking.id,coalesce(v_sequence,2),v_event,'member',
    v_membership_id,(select private.current_auth_user_id()),
    nullif(btrim(coalesce(p_reason,'')),''),'succeeded',v_correlation_id,
    v_booking.revision+1,
    -- Redacted by construction: the transition, not the person it was about.
    jsonb_build_object('from_status',v_booking.status,'to_status',v_target,
      'action',p_action,'off_window',p_action='check_in' and not coalesce(v_in_window,true)));

  if p_idempotency_key is not null then
    update app.idempotency_keys k
    set state='succeeded',result_kind='booking',result_id=v_booking.id,updated_at=v_now
    where k.tenant_id=p_tenant_id and k.operation='transition_booking_v1'
      and k.idempotency_key=p_idempotency_key;
  end if;

  raise log 'booking_transitioned booking=% action=% from=% to=% correlation=% tenant=%',
    v_booking.id,p_action,v_booking.status,v_target,v_correlation_id,p_tenant_id;
  return query select 1,v_booking.id,v_target,v_booking.revision+1,false;
end;
$function$;
comment on function private.transition_booking_v1(uuid,uuid,text,bigint,text,uuid,text) is
  'Appointment lifecycle v1 engine (§7.1). Locks the booking, re-reads capability and location scope, rejects invalid transitions before stale ones, enforces the snapshotted check-in window, and appends one immutable ledger event. Payment, refund, notification, and calendar states are never touched.';
revoke all on function private.transition_booking_v1(uuid,uuid,text,bigint,text,uuid,text) from public,anon;
grant execute on function private.transition_booking_v1(uuid,uuid,text,bigint,text,uuid,text) to authenticated;

create or replace function api_v1.transition_booking_v1(
  p_tenant_id uuid,
  p_booking_id uuid,
  p_action text,
  p_expected_revision bigint,
  p_reason text default null,
  p_request_id uuid default null,
  p_idempotency_key text default null
)
returns table(
  contract_version integer, booking_id uuid, status text,
  booking_revision bigint, replayed boolean
)
language sql volatile security invoker set search_path = '' set statement_timeout = '5s' as $$
  select * from private.transition_booking_v1(
    p_tenant_id,p_booking_id,p_action,p_expected_revision,p_reason,p_request_id,p_idempotency_key);
$$;
revoke all on function api_v1.transition_booking_v1(uuid,uuid,text,bigint,text,uuid,text) from public,anon;
grant execute on function api_v1.transition_booking_v1(uuid,uuid,text,bigint,text,uuid,text) to authenticated;

-- A staff-created booking is a customer booking made by somebody else. It is
-- deliberately the same hold and the same confirmation engine: the capability
-- check and the authorship record are the only things this wrapper adds. There
-- is no second allocation path to overbook through, no second snapshot to
-- drift, and no second outbox to forget.
create or replace function private.create_booking_on_behalf_v1(
  p_tenant_id uuid,
  p_hostname text,
  p_hold_id uuid,
  p_session_token text,
  p_idempotency_key text,
  p_contact jsonb,
  p_consent_version text,
  p_locale text default 'en',
  p_intake jsonb default '{}'::jsonb,
  p_customer_time_zone text default null,
  p_request_id uuid default null
)
returns table(
  contract_version integer, booking_id uuid, public_reference text, status text,
  approval_status text, starts_at timestamptz, ends_at timestamptz,
  booking_revision bigint, replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '10s'
as $function$
declare
  v_correlation_id uuid := coalesce(p_request_id,pg_catalog.gen_random_uuid());
  v_hold app.booking_holds%rowtype;
  v_membership_id uuid;
  v_result record;
  v_sequence bigint;
begin
  select * into v_hold from app.booking_holds h
  where h.tenant_id=p_tenant_id and h.id=p_hold_id;
  if v_hold.id is null then
    raise exception using errcode='42501',message='booking_context_required';
  end if;
  if not coalesce((select private.is_active_tenant_member(p_tenant_id)),false)
     or not coalesce((select private.can_access_location(p_tenant_id,v_hold.location_id)),false)
     or not coalesce((select private.can_decide_booking(
          p_tenant_id,v_hold.location_id,'booking.create_on_behalf')),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  v_membership_id := (select private.current_membership_id(p_tenant_id));

  select * into v_result from private.confirm_booking_v1(
    p_hostname,'dashboard',p_hold_id,p_session_token,p_idempotency_key,p_contact,
    p_consent_version,p_locale,p_intake,p_customer_time_zone);

  -- Authorship is a separate ledger entry rather than a rewritten confirmation
  -- event: the confirmation is what happened to the booking, and this is who
  -- made it happen. A replay appends nothing, so a retry stays one record.
  if not v_result.replayed then
    select max(e.sequence)+1 into v_sequence from app.booking_events e
    where e.tenant_id=p_tenant_id and e.booking_id=v_result.booking_id;
    insert into app.booking_events(
      tenant_id,booking_id,sequence,event_type,actor_kind,actor_membership_id,
      effective_actor_id,outcome,request_id,booking_revision,metadata)
    values (p_tenant_id,v_result.booking_id,coalesce(v_sequence,2),
      'booking_created_on_behalf','member',v_membership_id,
      (select private.current_auth_user_id()),'succeeded',v_correlation_id,
      v_result.booking_revision,jsonb_build_object('application','dashboard'));
  end if;

  return query select 1,v_result.booking_id,v_result.public_reference,v_result.status,
    v_result.approval_status,v_result.starts_at,v_result.ends_at,
    v_result.booking_revision,v_result.replayed;
end;
$function$;
comment on function private.create_booking_on_behalf_v1(uuid,text,uuid,text,text,jsonb,text,text,jsonb,text,uuid) is
  'Staff-created booking v1. Adds a booking.create_on_behalf check and an authorship ledger entry to the unchanged customer confirmation engine, so a staff booking cannot overbook, skip the snapshot, skip idempotency, or skip the outbox.';
revoke all on function private.create_booking_on_behalf_v1(uuid,text,uuid,text,text,jsonb,text,text,jsonb,text,uuid) from public,anon;
grant execute on function private.create_booking_on_behalf_v1(uuid,text,uuid,text,text,jsonb,text,text,jsonb,text,uuid) to authenticated;

create or replace function api_v1.create_booking_on_behalf_v1(
  p_tenant_id uuid,
  p_hostname text,
  p_hold_id uuid,
  p_session_token text,
  p_idempotency_key text,
  p_contact jsonb,
  p_consent_version text,
  p_locale text default 'en',
  p_intake jsonb default '{}'::jsonb,
  p_customer_time_zone text default null,
  p_request_id uuid default null
)
returns table(
  contract_version integer, booking_id uuid, public_reference text, status text,
  approval_status text, starts_at timestamptz, ends_at timestamptz,
  booking_revision bigint, replayed boolean
)
language sql volatile security invoker set search_path = '' set statement_timeout = '10s' as $$
  select * from private.create_booking_on_behalf_v1(
    p_tenant_id,p_hostname,p_hold_id,p_session_token,p_idempotency_key,p_contact,
    p_consent_version,p_locale,p_intake,p_customer_time_zone,p_request_id);
$$;
revoke all on function api_v1.create_booking_on_behalf_v1(uuid,text,uuid,text,text,jsonb,text,text,jsonb,text,uuid) from public,anon;
grant execute on function api_v1.create_booking_on_behalf_v1(uuid,text,uuid,text,text,jsonb,text,text,jsonb,text,uuid) to authenticated;

-- Notes. The write gate is the read gate: whoever may read a class of note may
-- add one, and nobody earns a sensitive note by being able to see a calendar.
create or replace function private.add_booking_note_v1(
  p_tenant_id uuid,
  p_booking_id uuid,
  p_visibility text,
  p_body text,
  p_request_id uuid default null
)
returns table(contract_version integer, note_id uuid, visibility text)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
declare
  v_booking app.bookings%rowtype;
  v_membership_id uuid;
  v_note_id uuid;
  v_sequence bigint;
  v_authorized boolean;
begin
  if p_visibility is null or p_visibility not in ('operational','sensitive') then
    raise exception using errcode='22023',message='booking_invalid_note_visibility';
  end if;
  if p_body is null or btrim(p_body) <> p_body
     or char_length(p_body) not between 1 and 2000 then
    raise exception using errcode='22023',message='booking_invalid_note';
  end if;

  select * into v_booking from app.bookings b
  where b.tenant_id=p_tenant_id and b.id=p_booking_id;
  if v_booking.id is null then
    raise exception using errcode='42501',message='booking_context_required';
  end if;
  if not coalesce((select private.is_active_tenant_member(p_tenant_id)),false)
     or not coalesce((select private.can_access_location(p_tenant_id,v_booking.location_id)),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  v_authorized := case p_visibility
    when 'sensitive' then coalesce((select private.has_direct_capability(
      p_tenant_id,'customer.pii.view')),false)
    else coalesce((select private.can_decide_booking(
      p_tenant_id,v_booking.location_id,'booking.view.any')),false)
  end;
  if not v_authorized then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  v_membership_id := (select private.current_membership_id(p_tenant_id));

  insert into app.booking_notes(tenant_id,booking_id,visibility,body,author_membership_id)
  values (p_tenant_id,p_booking_id,p_visibility,p_body,v_membership_id)
  returning id into v_note_id;

  -- The ledger records that a note exists, never what it says: history stays
  -- readable to an operator who is not entitled to the note itself.
  select max(e.sequence)+1 into v_sequence from app.booking_events e
  where e.tenant_id=p_tenant_id and e.booking_id=p_booking_id;
  insert into app.booking_events(
    tenant_id,booking_id,sequence,event_type,actor_kind,actor_membership_id,
    effective_actor_id,outcome,request_id,booking_revision,metadata)
  values (p_tenant_id,p_booking_id,coalesce(v_sequence,2),'booking_note_added','member',
    v_membership_id,(select private.current_auth_user_id()),'succeeded',
    coalesce(p_request_id,pg_catalog.gen_random_uuid()),v_booking.revision,
    jsonb_build_object('visibility',p_visibility));

  return query select 1,v_note_id,p_visibility;
end;
$function$;
revoke all on function private.add_booking_note_v1(uuid,uuid,text,text,uuid) from public,anon;
grant execute on function private.add_booking_note_v1(uuid,uuid,text,text,uuid) to authenticated;

create or replace function api_v1.add_booking_note_v1(
  p_tenant_id uuid,
  p_booking_id uuid,
  p_visibility text,
  p_body text,
  p_request_id uuid default null
)
returns table(contract_version integer, note_id uuid, visibility text)
language sql volatile security invoker set search_path = '' set statement_timeout = '5s' as $$
  select * from private.add_booking_note_v1(p_tenant_id,p_booking_id,p_visibility,p_body,p_request_id);
$$;
revoke all on function api_v1.add_booking_note_v1(uuid,uuid,text,text,uuid) from public,anon;
grant execute on function api_v1.add_booking_note_v1(uuid,uuid,text,text,uuid) to authenticated;

-- The searchable booking list. Security invoker, so the filters narrow what RLS
-- already permits and never widen it — including the customer-name match, which
-- simply finds nothing for a member who may not read contact rows.
create or replace function api_v1.search_bookings_v1(
  p_tenant_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_query text default null,
  p_status text default null,
  p_location_id uuid default null,
  p_staff_id uuid default null
)
returns table(
  contract_version integer, booking_id uuid, public_reference text, status text,
  approval_status text, payment_status text, notification_status text,
  service_name text, location_id uuid, location_name text, location_time_zone text,
  staff_id uuid, starts_at timestamptz, ends_at timestamptz, price_minor bigint,
  currency text, locale text, booking_revision bigint, customer_display_name text,
  has_intake boolean, note_count integer
)
language sql stable security invoker set search_path = '' set statement_timeout = '5s' as $$
  with scoped as (
    select b.*,
      (select a.staff_id from app.assignment_allocations a
        where a.tenant_id=b.tenant_id and a.hold_id=b.hold_id and a.staff_id is not null
        limit 1) as allocated_staff_id,
      (select c.full_name from app.booking_contacts c
        where c.tenant_id=b.tenant_id and c.booking_id=b.id) as customer_display_name
    from app.bookings b
    where b.tenant_id=p_tenant_id
      and (p_from is null or b.starts_at>=p_from)
      and (p_to is null or b.starts_at<p_to)
      and (p_status is null or b.status=p_status)
      and (p_location_id is null or b.location_id=p_location_id)
  )
  select 1,s.id,s.public_reference,s.status,s.approval_status,s.payment_status,
    s.notification_status,s.service_name,s.location_id,s.location_name,
    s.location_time_zone,s.allocated_staff_id,s.starts_at,s.ends_at,s.price_minor,
    s.currency,s.locale,s.revision,s.customer_display_name,
    exists (select 1 from app.booking_intake_answers i
      where i.tenant_id=s.tenant_id and i.booking_id=s.id),
    (select count(*)::integer from app.booking_notes n
      where n.tenant_id=s.tenant_id and n.booking_id=s.id)
  from scoped s
  where (p_staff_id is null or s.allocated_staff_id=p_staff_id)
    and (p_query is null or btrim(p_query)='' or
      s.public_reference ilike '%'||btrim(p_query)||'%' or
      s.service_name ilike '%'||btrim(p_query)||'%' or
      coalesce(s.customer_display_name,'') ilike '%'||btrim(p_query)||'%')
  order by s.starts_at desc,s.id
  limit 200;
$$;
revoke all on function api_v1.search_bookings_v1(uuid,timestamptz,timestamptz,text,text,uuid,uuid) from public,anon;
grant execute on function api_v1.search_bookings_v1(uuid,timestamptz,timestamptz,text,text,uuid,uuid) to authenticated;

-- One booking, everything an operator needs to act on it, in one round trip.
-- Each nested list is an ordinary RLS-governed read, so a calendar-only member
-- gets the same row with the customer, intake, and sensitive notes absent
-- rather than a different, wider DTO.
create or replace function api_v1.get_booking_detail_v1(
  p_tenant_id uuid,
  p_booking_id uuid
)
returns table(
  contract_version integer, booking_id uuid, public_reference text, status text,
  approval_status text, payment_status text, notification_status text,
  calendar_status text, service_name text, location_id uuid, location_name text,
  location_time_zone text, staff_id uuid, starts_at timestamptz, ends_at timestamptz,
  duration_minutes integer, price_minor bigint, tax_rate_bps integer, currency text,
  locale text, booking_revision bigint, reschedule_count integer,
  cancelled_at timestamptz, refund_percent_bps integer, refund_eligible_minor bigint,
  policy_snapshot jsonb, customer_full_name text, customer_email text,
  customer_phone text, intake_answers jsonb, history jsonb, notes jsonb
)
language sql stable security invoker set search_path = '' set statement_timeout = '5s' as $$
  select 1,b.id,b.public_reference,b.status,b.approval_status,b.payment_status,
    b.notification_status,b.calendar_status,b.service_name,b.location_id,b.location_name,
    b.location_time_zone,
    (select a.staff_id from app.assignment_allocations a
      where a.tenant_id=b.tenant_id and a.hold_id=b.hold_id and a.staff_id is not null limit 1),
    b.starts_at,b.ends_at,b.duration_minutes,b.price_minor,b.tax_rate_bps,b.currency,
    b.locale,b.revision,b.reschedule_count,b.cancelled_at,b.refund_percent_bps,
    b.refund_eligible_minor,b.policy_snapshot,
    (select c.full_name from app.booking_contacts c
      where c.tenant_id=b.tenant_id and c.booking_id=b.id),
    (select c.email from app.booking_contacts c
      where c.tenant_id=b.tenant_id and c.booking_id=b.id),
    (select c.phone from app.booking_contacts c
      where c.tenant_id=b.tenant_id and c.booking_id=b.id),
    (select i.answers from app.booking_intake_answers i
      where i.tenant_id=b.tenant_id and i.booking_id=b.id),
    -- Status history from the ledger, not from a status column read twice.
    coalesce((select jsonb_agg(jsonb_build_object(
        'sequence',e.sequence,'eventType',e.event_type,'actorKind',e.actor_kind,
        'reason',e.reason,'outcome',e.outcome,'bookingRevision',e.booking_revision,
        'metadata',e.metadata,'createdAt',e.created_at) order by e.sequence)
      from app.booking_events e
      where e.tenant_id=b.tenant_id and e.booking_id=b.id),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
        'noteId',n.id,'visibility',n.visibility,'body',n.body,'createdAt',n.created_at)
        order by n.created_at)
      from app.booking_notes n
      where n.tenant_id=b.tenant_id and n.booking_id=b.id),'[]'::jsonb)
  from app.bookings b
  where b.tenant_id=p_tenant_id and b.id=p_booking_id;
$$;
revoke all on function api_v1.get_booking_detail_v1(uuid,uuid) from public,anon;
grant execute on function api_v1.get_booking_detail_v1(uuid,uuid) to authenticated;

-- Lifecycle analytics read straight off the committed ledger. A UI event can be
-- dropped, replayed, or fired without a commit; a ledger row cannot exist
-- without the transition that wrote it in the same transaction.
create or replace function api_v1.get_lifecycle_analytics_v1(
  p_tenant_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table(
  contract_version integer, event_type text, event_count bigint, booking_count bigint
)
language sql stable security invoker set search_path = '' set statement_timeout = '5s' as $$
  select 1,e.event_type,count(*),count(distinct e.booking_id)
  from app.booking_events e
  where e.tenant_id=p_tenant_id
    and e.outcome='succeeded'
    and (p_from is null or e.created_at>=p_from)
    and (p_to is null or e.created_at<p_to)
  group by e.event_type
  order by e.event_type;
$$;
revoke all on function api_v1.get_lifecycle_analytics_v1(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function api_v1.get_lifecycle_analytics_v1(uuid,timestamptz,timestamptz) to authenticated;

-- The workspace reads from issue #16 learn the new status. A checked-in
-- appointment is still today's arrival and still occupies its place on the
-- calendar; leaving it out of either read would make the same booking appear
-- to vanish the moment an operator acted on it.
create or replace function api_v1.get_today_workspace_v1(
  p_tenant_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  contract_version integer,
  queue text,
  booking_id uuid,
  public_reference text,
  service_name text,
  location_id uuid,
  location_name text,
  location_time_zone text,
  staff_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  approval_status text,
  payment_status text,
  notification_status text,
  approval_deadline timestamptz,
  booking_revision bigint,
  customer_display_name text,
  has_intake boolean,
  price_minor bigint,
  currency text,
  locale text
)
language sql stable security invoker set search_path = '' set statement_timeout = '5s' as $$
  with scoped as (
    select b.*,
      (select a.staff_id from app.assignment_allocations a
        where a.tenant_id=b.tenant_id and a.hold_id=b.hold_id and a.staff_id is not null
        limit 1) as staff_id,
      (select c.full_name from app.booking_contacts c
        where c.tenant_id=b.tenant_id and c.booking_id=b.id) as customer_display_name,
      exists (select 1 from app.booking_intake_answers i
        where i.tenant_id=b.tenant_id and i.booking_id=b.id) as has_intake
    from app.bookings b
    where b.tenant_id=p_tenant_id
  ), classified as (
    select s.*,
      case
        when s.status='requested' then 'requests'
        when s.status='cancelled'
          and s.cancelled_at is not null
          and s.cancelled_at >= statement_timestamp() - interval '24 hours' then 'cancellations'
        when s.status in ('confirmed','checked_in')
          and s.payment_status in ('requires_payment','failed','disputed') then 'payments'
        when s.notification_status in ('bounced','complained','failed') then 'exceptions'
        when s.status in ('confirmed','checked_in')
          and s.starts_at >= coalesce(p_from,s.starts_at)
          and s.starts_at < coalesce(p_to,s.starts_at + interval '1 second') then 'arrivals'
        when s.status='confirmed' and s.starts_at >= coalesce(p_to,s.starts_at) then 'upcoming'
      end as queue
    from scoped s
  )
  select 1,c.queue,c.id,c.public_reference,c.service_name,c.location_id,c.location_name,
    c.location_time_zone,c.staff_id,c.starts_at,c.ends_at,c.status,c.approval_status,
    c.payment_status,c.notification_status,c.approval_deadline,c.revision,
    c.customer_display_name,c.has_intake,c.price_minor,c.currency,c.locale
  from classified c
  where c.queue is not null
  order by
    case c.queue
      when 'requests' then 1 when 'exceptions' then 2 when 'payments' then 3
      when 'arrivals' then 4 when 'cancellations' then 5 else 6 end,
    coalesce(c.approval_deadline,c.starts_at),
    c.id
  limit 500;
$$;
revoke all on function api_v1.get_today_workspace_v1(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function api_v1.get_today_workspace_v1(uuid,timestamptz,timestamptz) to authenticated;

create or replace function api_v1.list_calendar_v1(
  p_tenant_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_location_id uuid default null,
  p_staff_id uuid default null,
  p_service_id uuid default null
)
returns table(
  contract_version integer,
  booking_id uuid,
  public_reference text,
  service_id uuid,
  service_name text,
  location_id uuid,
  location_name text,
  location_time_zone text,
  staff_id uuid,
  resource_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  buffer_before_minutes integer,
  buffer_after_minutes integer,
  status text,
  approval_status text,
  payment_status text,
  notification_status text,
  booking_revision bigint,
  customer_display_name text,
  has_intake boolean,
  locale text
)
language sql stable security invoker set search_path = '' set statement_timeout = '5s' as $$
  select 1,b.id,b.public_reference,b.service_id,b.service_name,b.location_id,b.location_name,
    b.location_time_zone,a.staff_id,a.resource_id,b.starts_at,b.ends_at,
    a.buffer_before_minutes,a.buffer_after_minutes,b.status,b.approval_status,
    b.payment_status,b.notification_status,b.revision,
    (select c.full_name from app.booking_contacts c
      where c.tenant_id=b.tenant_id and c.booking_id=b.id),
    exists (select 1 from app.booking_intake_answers i
      where i.tenant_id=b.tenant_id and i.booking_id=b.id),
    b.locale
  from app.bookings b
  left join app.assignment_allocations a
    on a.tenant_id=b.tenant_id and a.hold_id=b.hold_id
   and a.state in ('held','confirmed')
   and a.starts_at=b.starts_at
  where b.tenant_id=p_tenant_id
    and b.status in ('requested','confirmed','checked_in','completed','no_show')
    and (p_from is null or b.ends_at > p_from)
    and (p_to is null or b.starts_at < p_to)
    and (p_location_id is null or b.location_id=p_location_id)
    and (p_staff_id is null or a.staff_id=p_staff_id)
    and (p_service_id is null or b.service_id=p_service_id)
  order by b.starts_at,b.id
  limit 1000;
$$;
revoke all on function api_v1.list_calendar_v1(uuid,timestamptz,timestamptz,uuid,uuid,uuid) from public,anon;
grant execute on function api_v1.list_calendar_v1(uuid,timestamptz,timestamptz,uuid,uuid,uuid) to authenticated;
