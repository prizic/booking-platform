-- Issue #16: the Dashboard's daily operating centre. Two scoped reads — the
-- Today queues and the calendar — plus the private tenant broadcast that tells
-- an open workspace when to refetch.
--
-- Both reads are SECURITY INVOKER over RLS, so a member sees exactly the
-- locations, bookings, and customer fields its role already grants and nothing
-- else. Neither read performs an action: every change still goes through the
-- booking RPCs, which re-check capability, state, and revision themselves.

-- The Today queues. One row per item of work, with the kind an operator sorts
-- by, so the Dashboard renders queues without a query per queue.
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
  -- Null unless this member may read customer personal data: the contact row
  -- is behind its own capability policy, and this DTO does not widen it.
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
        -- A request waiting for a decision is the most time-bound work, so it
        -- is classified before anything about its scheduled time.
        when s.status='requested' then 'requests'
        -- Recently cancelled is about when the cancellation happened, not
        -- when the booking would have been: a booking cancelled this morning
        -- for next month is still today's news.
        when s.status='cancelled'
          and s.cancelled_at is not null
          and s.cancelled_at >= statement_timestamp() - interval '24 hours' then 'cancellations'
        when s.status='confirmed'
          and s.payment_status in ('requires_payment','failed','disputed') then 'payments'
        when s.notification_status in ('bounced','complained','failed') then 'exceptions'
        when s.status='confirmed'
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

-- The calendar. Day, week, and resource views are the same rows read over a
-- different window and grouped differently in the client, so there is one read
-- rather than three that could disagree.
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
  -- The allocation is what actually occupies a person or a room, so the
  -- resource view reads the same row the capacity guard does.
  left join app.assignment_allocations a
    on a.tenant_id=b.tenant_id and a.hold_id=b.hold_id
   and a.state in ('held','confirmed')
   and a.starts_at=b.starts_at
  where b.tenant_id=p_tenant_id
    and b.status in ('requested','confirmed','completed','no_show')
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

-- Private tenant broadcast. It carries identifiers and status only: an open
-- workspace learns that something changed and refetches through RLS. Nothing
-- confirms, locks, or displays a booking from the wire, so a lost, duplicated,
-- or reordered message can never create false state.
--
-- Realtime's broadcast surface is created by the Supabase stack rather than by
-- this repository, so everything below is guarded: where the schema is absent
-- the trigger is simply not installed, and no migration fails because of it.
do $realtime$
begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then
    raise notice 'realtime.send is unavailable; the workspace broadcast is not installed';
    return;
  end if;

  execute $fn$
    create or replace function private.broadcast_booking_change_v1()
    returns trigger
    language plpgsql
    security definer
    set search_path = ''
    as $body$
    declare
      v_booking app.bookings%rowtype := coalesce(new,old);
    begin
      -- Minimal payload. No customer field, no intake, no reason text: a
      -- listener is told what to refetch, never what the booking says.
      perform realtime.send(
        jsonb_build_object(
          'booking_id',v_booking.id,
          'booking_revision',v_booking.revision,
          'location_id',v_booking.location_id,
          'starts_at',v_booking.starts_at,
          'status',v_booking.status),
        'booking_changed',
        'tenant:'||v_booking.tenant_id::text,
        true);
      return null;
    exception when others then
      -- A broadcast is an accelerator. If it fails, the booking transaction
      -- that triggered it must still commit.
      return null;
    end;
    $body$;
  $fn$;

  execute $trg$
    create trigger bookings_broadcast_change
      after insert or update on app.bookings
      for each row execute function private.broadcast_booking_change_v1()
  $trg$;

  -- Authorization: a member may read its own tenant's private topic and no
  -- other, and nobody may write to a topic from a client.
  if to_regclass('realtime.messages') is not null then
    execute 'alter table realtime.messages enable row level security';
    execute $pol$
      create policy tenant_workspace_broadcast_read on realtime.messages
      for select to authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and exists (
          select 1 from app.tenants t
          where realtime.topic() = 'tenant:'||t.id::text
            and (select private.is_active_tenant_member(t.id))))
    $pol$;
  end if;
end;
$realtime$;
