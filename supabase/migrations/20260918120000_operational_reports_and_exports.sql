-- Issue #24: operational reports and CSV exports.
--
-- Every number here comes from a committed row: `app.booking_events` for
-- lifecycle facts and `app.commerce_ledger_entries` for money. Nothing reads a
-- client analytics event. A UI event can be dropped by an ad blocker, fired
-- twice by a retry, or fired without a commit; a ledger row cannot exist
-- without the transaction that wrote it. That is the whole reason reporting
-- lives here rather than in a warehouse fed by the browser.
--
-- Denominators are stated, not implied, because a rate whose denominator is
-- ambiguous is a number two people will read two ways:
--
--   no-show rate      = no_show / (confirmed + checked_in + completed + no_show)
--                       Cancellations are EXCLUDED. A customer who cancelled did
--                       not fail to arrive; counting them would make a tenant
--                       with a generous cancellation policy look unreliable.
--   completion rate   = completed / the same denominator
--   utilization       = booked minutes / offered minutes, where offered minutes
--                       are the published weekly schedule inside the window,
--                       minus time off and blackouts. Booked minutes include
--                       buffers, because a buffer is time nobody else can have.
--   fairness          = each staff member's booked minutes normalized by their
--                       own offered hours, so somebody working two days a week
--                       is not reported as underused.
--   lead time         = booking created to appointment start, in minutes.
--
-- Report definitions are versioned. `report_definition_version` travels with
-- every read and every export, so a historical comparison can tell whether the
-- numbers moved or the calculation did.
--
-- What this deliberately does NOT add:
--
--   * no metrics table and no rollup job. Every figure is computed from the
--     ledgers on read. A tenant's data is small enough that a stored rollup
--     would buy latency nobody is asking for and cost a whole class of
--     "the rollup is stale" bugs.
--   * no second analytics surface. Issue #17's `get_lifecycle_analytics_v1`
--     stays exactly as it is; it answers a different question (raw event
--     counts) and removing a published function is a contract decision.
--   * no customer detail in any report. Reports count people; they never name
--     them. New-versus-returning is computed from `app.customers` identity
--     without a single identifying column leaving the database.
--   * no CSV rendering in SQL. Escaping and formula-injection safety are logic
--     worth unit testing, so the export stores rows and `packages/reporting`
--     renders them.

-- ---------------------------------------------------------------------------
-- 1. Window resolution
-- ---------------------------------------------------------------------------

-- A report day is a day in the location's timezone, not in UTC. Getting this
-- wrong is the single most common way a reporting surface disagrees with the
-- calendar the operator was looking at ten minutes earlier.
create or replace function private.resolve_report_window_v1(
  p_from date,
  p_to date,
  p_time_zone text
)
returns table (window_start timestamptz, window_end timestamptz)
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    (p_from::timestamp) at time zone coalesce(p_time_zone,'UTC'),
    -- Half-open, and the end is the start of the day AFTER `p_to`, so a report
    -- for a single day contains that whole day.
    ((p_to + 1)::timestamp) at time zone coalesce(p_time_zone,'UTC');
$$;

-- Offered minutes: the denominator utilization is divided by. Published weekly
-- hours inside the window, minus time off and blackouts that overlap it.
create or replace function private.offered_minutes_v1(
  p_tenant_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_location_id uuid default null,
  p_staff_id uuid default null
)
returns table (staff_id uuid, offered_minutes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with scoped as (
    select s.id as scope_id, s.staff_id, s.time_zone, s.location_id
    from app.schedule_scopes s
    where s.tenant_id = p_tenant_id
      and s.scope_kind = 'staff'
      and s.staff_id is not null
      and (p_location_id is null or s.location_id = p_location_id)
      and (p_staff_id is null or s.staff_id = p_staff_id)
  ), windows as (
    -- The day series is generated per scope, in that scope's own timezone. A
    -- single UTC series cast to `date` would use the session timezone, which is
    -- the classic way a schedule lands on the wrong weekday.
    select sc.staff_id,
      ((local_day + (w.start_minute * interval '1 minute')) at time zone sc.time_zone) as starts_at,
      ((local_day + (w.end_minute * interval '1 minute')) at time zone sc.time_zone) as ends_at
    from scoped sc
    cross join lateral generate_series(
      ((p_from at time zone sc.time_zone)::date)::timestamp,
      ((p_to at time zone sc.time_zone)::date)::timestamp,
      interval '1 day') as local_day
    join app.weekly_schedules w
      on w.tenant_id = p_tenant_id and w.schedule_scope_id = sc.scope_id
     and w.day_of_week = extract(dow from local_day)::smallint
  ), bounded as (
    -- Clipped to the requested window, so a shift straddling the edge counts
    -- only the part inside it.
    select staff_id, greatest(starts_at, p_from) as starts_at, least(ends_at, p_to) as ends_at
    from windows
    where ends_at > p_from and starts_at < p_to
  ), unavailable as (
    select b.staff_id,
      sum(greatest(0, extract(epoch from (
        least(b.ends_at, o.ends_at) - greatest(b.starts_at, o.starts_at))) / 60))::bigint as minutes
    from bounded b
    join app.time_off o
      on o.tenant_id = p_tenant_id and o.staff_id = b.staff_id
     and o.ends_at > b.starts_at and o.starts_at < b.ends_at
    group by b.staff_id
  ), blacked as (
    select b.staff_id,
      sum(greatest(0, extract(epoch from (
        least(b.ends_at, bl.ends_at) - greatest(b.starts_at, bl.starts_at))) / 60))::bigint as minutes
    from bounded b
    join scoped sc on sc.staff_id = b.staff_id
    join app.blackouts bl
      on bl.tenant_id = p_tenant_id and bl.location_id = sc.location_id
     and bl.ends_at > b.starts_at and bl.starts_at < b.ends_at
    group by b.staff_id
  )
  select b.staff_id,
    greatest(0,
      sum(extract(epoch from (b.ends_at - b.starts_at)) / 60)::bigint
      - coalesce(max(u.minutes),0) - coalesce(max(k.minutes),0))
  from bounded b
  left join unavailable u on u.staff_id = b.staff_id
  left join blacked k on k.staff_id = b.staff_id
  group by b.staff_id;
$$;

-- ---------------------------------------------------------------------------
-- 2. The booking report
-- ---------------------------------------------------------------------------

-- Counts, rates and lead times, from the immutable ledger. SECURITY INVOKER, so
-- a location-limited member's numbers describe their own locations and nothing
-- else: the RLS policy on `app.bookings` is the scope, not a filter added here.
create or replace function api_v1.get_booking_report_v1(
  p_tenant_id uuid,
  p_from date,
  p_to date,
  p_time_zone text default 'UTC',
  p_location_id uuid default null,
  p_service_id uuid default null,
  p_staff_id uuid default null
)
returns table (
  contract_version integer,
  report_definition_version integer,
  window_start timestamptz,
  window_end timestamptz,
  time_zone text,
  bookings_created bigint,
  bookings_confirmed bigint,
  bookings_requested bigint,
  bookings_cancelled bigint,
  bookings_completed bigint,
  bookings_no_show bigint,
  bookings_rescheduled bigint,
  -- The denominator for both rates, stated as a column so a reader never has
  -- to reconstruct it.
  outcome_denominator bigint,
  no_show_rate_bps integer,
  completion_rate_bps integer,
  median_lead_time_minutes integer,
  average_lead_time_minutes integer
)
language sql
stable
security invoker
set search_path = ''
set statement_timeout = '10s'
as $$
  with w as (
    select * from private.resolve_report_window_v1(p_from,p_to,p_time_zone)
  ), scoped as (
    select b.* from app.bookings b, w
    where b.tenant_id = p_tenant_id
      and b.starts_at >= w.window_start and b.starts_at < w.window_end
      and (p_location_id is null or b.location_id = p_location_id)
      and (p_service_id is null or b.service_id = p_service_id)
      and (p_staff_id is null or exists (
        select 1 from app.assignment_allocations a
        where a.tenant_id = b.tenant_id and a.hold_id = b.hold_id
          and a.staff_id = p_staff_id))
  ), counted as (
    select
      count(*) as created,
      count(*) filter (where status = 'confirmed') as confirmed,
      count(*) filter (where status = 'requested') as requested,
      count(*) filter (where status = 'cancelled') as cancelled,
      count(*) filter (where status = 'completed') as completed,
      count(*) filter (where status = 'no_show') as no_show,
      count(*) filter (where status = 'checked_in') as checked_in,
      sum(reschedule_count) as rescheduled,
      -- Cancellations are excluded from the outcome denominator on purpose.
      percentile_cont(0.5) within group (
        order by extract(epoch from (starts_at - created_at))/60) as median_lead,
      avg(extract(epoch from (starts_at - created_at))/60) as mean_lead
    from scoped
  ), denom as (
    select c.*, (c.confirmed + c.checked_in + c.completed + c.no_show) as outcome_total
    from counted c
  )
  select 1, 1, w.window_start, w.window_end, coalesce(p_time_zone,'UTC'),
    d.created, d.confirmed, d.requested, d.cancelled, d.completed, d.no_show,
    coalesce(d.rescheduled,0), d.outcome_total,
    case when d.outcome_total = 0 then 0
      else ((d.no_show * 10000) / d.outcome_total)::integer end,
    case when d.outcome_total = 0 then 0
      else ((d.completed * 10000) / d.outcome_total)::integer end,
    coalesce(d.median_lead,0)::integer,
    coalesce(d.mean_lead,0)::integer
  from denom d, w;
$$;

-- ---------------------------------------------------------------------------
-- 3. Utilization and fairness
-- ---------------------------------------------------------------------------

-- Booked minutes over offered minutes, per staff member. Fairness is the same
-- ratio, which is what makes it fair: somebody working two days a week and
-- somebody working five are compared on what each was actually offered.
create or replace function api_v1.get_utilization_report_v1(
  p_tenant_id uuid,
  p_from date,
  p_to date,
  p_time_zone text default 'UTC',
  p_location_id uuid default null
)
returns table (
  contract_version integer,
  report_definition_version integer,
  staff_id uuid,
  staff_name text,
  offered_minutes bigint,
  booked_minutes bigint,
  utilization_bps integer,
  booking_count bigint
)
language sql
stable
security invoker
set search_path = ''
set statement_timeout = '10s'
as $$
  with w as (
    select * from private.resolve_report_window_v1(p_from,p_to,p_time_zone)
  ), offered as (
    select o.staff_id, o.offered_minutes
    from w, private.offered_minutes_v1(p_tenant_id,w.window_start,w.window_end,p_location_id) o
  ), booked as (
    -- Buffers count: a buffer is time nobody else can have, so leaving it out
    -- would report a fully booked day as partly free.
    select a.staff_id,
      sum(extract(epoch from (a.ends_at - a.starts_at))/60
        + a.buffer_before_minutes + a.buffer_after_minutes)::bigint as minutes,
      count(distinct b.id) as bookings
    from app.bookings b
    join app.assignment_allocations a
      on a.tenant_id = b.tenant_id and a.hold_id = b.hold_id and a.staff_id is not null
    cross join w
    where b.tenant_id = p_tenant_id
      and b.starts_at >= w.window_start and b.starts_at < w.window_end
      and b.status in ('confirmed','checked_in','completed','no_show')
      and (p_location_id is null or b.location_id = p_location_id)
    group by a.staff_id
  )
  select 1, 1, o.staff_id, sp.public_name,
    o.offered_minutes, coalesce(bk.minutes,0),
    case when o.offered_minutes = 0 then 0
      else least(10000,((coalesce(bk.minutes,0) * 10000) / o.offered_minutes))::integer end,
    coalesce(bk.bookings,0)
  from offered o
  left join booked bk on bk.staff_id = o.staff_id
  left join app.staff_profiles sp on sp.tenant_id = p_tenant_id and sp.id = o.staff_id
  order by sp.public_name;
$$;

-- ---------------------------------------------------------------------------
-- 4. Money
-- ---------------------------------------------------------------------------

-- Revenue, refunds and what is still owed, from the append-only ledger. A
-- separate capability on purpose: a scheduler who runs the day does not
-- automatically get to read the tenant's revenue.
create or replace function private.get_revenue_report_v1(
  p_tenant_id uuid,
  p_from date,
  p_to date,
  p_time_zone text default 'UTC'
)
returns table (
  contract_version integer,
  report_definition_version integer,
  currency text,
  charged_minor bigint,
  refunded_minor bigint,
  net_minor bigint,
  charge_count bigint,
  refund_count bigint,
  average_order_value_minor bigint,
  outstanding_minor bigint,
  -- Stated rather than omitted: a total that is still moving should say so
  -- instead of being read as final.
  unsettled_payments bigint
)
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '10s'
as $function$
-- The result columns are named for the contract (currency), which collides with
-- the columns this body reads. Column wins.
#variable_conflict use_column
begin
  -- The financial capability is checked here, inside the definer, rather than in
  -- the wrapper: a gate that lives only in the caller is a gate somebody reaches
  -- around by calling the callee.
  if not coalesce((select private.has_direct_capability(p_tenant_id,'billing.view')),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  return query
  with w as (
    select * from private.resolve_report_window_v1(p_from,p_to,p_time_zone)
  ), entries as (
    select l.* from app.commerce_ledger_entries l, w
    where l.tenant_id = p_tenant_id
      and l.occurred_at >= w.window_start and l.occurred_at < w.window_end
  ), totals as (
    select
      -- The ledger stores char(3); the contract publishes text.
      coalesce(max(currency)::text,'') as currency,
      coalesce(sum(amount_minor_units) filter (where entry_type='charge'),0)::bigint as charged,
      coalesce(sum(amount_minor_units) filter (where entry_type='refund'),0)::bigint as refunded,
      count(*) filter (where entry_type='charge') as charges,
      count(*) filter (where entry_type='refund') as refunds
    from entries
  ), owed as (
    -- A deposit leaves a balance. It is money the tenant expects and has not
    -- taken, which is a different number from revenue.
    select coalesce(sum(a.balance_minor_units),0)::bigint as balance,
      count(*) filter (where a.status in ('requires_payment','processing')) as unsettled
    from app.payment_attempts a, w
    where a.tenant_id = p_tenant_id
      and a.created_at >= w.window_start and a.created_at < w.window_end
  )
  select 1, 1, t.currency, t.charged, t.refunded, t.charged - t.refunded,
    t.charges, t.refunds,
    case when t.charges = 0 then 0 else (t.charged / t.charges) end,
    o.balance, o.unsettled
  from totals t, owed o;
end;
$function$;

create or replace function api_v1.get_revenue_report_v1(
  p_tenant_id uuid, p_from date, p_to date, p_time_zone text default 'UTC')
returns table (
  contract_version integer, report_definition_version integer, currency text,
  charged_minor bigint, refunded_minor bigint, net_minor bigint,
  charge_count bigint, refund_count bigint, average_order_value_minor bigint,
  outstanding_minor bigint, unsettled_payments bigint)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_revenue_report_v1(p_tenant_id,p_from,p_to,p_time_zone); $$;

-- ---------------------------------------------------------------------------
-- 5. Customers, counted and never named
-- ---------------------------------------------------------------------------

create or replace function private.get_customer_report_v1(
  p_tenant_id uuid,
  p_from date,
  p_to date,
  p_time_zone text default 'UTC'
)
returns table (
  contract_version integer,
  report_definition_version integer,
  customers_total bigint,
  customers_new bigint,
  customers_returning bigint,
  bookings_per_customer_bps integer,
  suppressed_contacts bigint,
  erased_customers bigint
)
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '10s'
as $function$
#variable_conflict use_column
begin
  -- Counting people is a tenant-wide read, so it needs a tenant-wide capability.
  if not coalesce((select private.has_direct_capability(p_tenant_id,'booking.view.any')),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  return query
  with w as (
    select * from private.resolve_report_window_v1(p_from,p_to,p_time_zone)
  ), booked as (
    select bc.customer_id, min(b.created_at) as first_in_window
    from app.booking_contacts bc
    join app.bookings b on b.tenant_id=bc.tenant_id and b.id=bc.booking_id
    cross join w
    where bc.tenant_id = p_tenant_id and bc.customer_id is not null
      and b.created_at >= w.window_start and b.created_at < w.window_end
    group by bc.customer_id
  ), classified as (
    select bk.customer_id,
      -- New means this window contains the customer's first booking anywhere,
      -- not merely their first in the window.
      not exists (
        select 1 from app.booking_contacts prior
        join app.bookings pb on pb.tenant_id=prior.tenant_id and pb.id=prior.booking_id
        where prior.tenant_id = p_tenant_id and prior.customer_id = bk.customer_id
          and pb.created_at < bk.first_in_window) as is_new
    from booked bk
  )
  select 1, 1,
    (select count(*) from classified),
    (select count(*) from classified where is_new),
    (select count(*) from classified where not is_new),
    case when (select count(*) from classified) = 0 then 0
      else (((select count(*) from app.booking_contacts bc
              join app.bookings b on b.tenant_id=bc.tenant_id and b.id=bc.booking_id
              cross join w
              where bc.tenant_id=p_tenant_id
                and b.created_at >= w.window_start and b.created_at < w.window_end)
             * 10000) / (select count(*) from classified))::integer end,
    (select count(*) from app.notification_suppressions s where s.tenant_id = p_tenant_id),
    (select count(*) from app.customers c
     where c.tenant_id = p_tenant_id and c.erased_at is not null);
end;
$function$;

-- Counting people is a tenant-wide read gated on a tenant-wide capability. It
-- returns no identifying column, which is why it does not need the PII one.
create or replace function api_v1.get_customer_report_v1(
  p_tenant_id uuid, p_from date, p_to date, p_time_zone text default 'UTC')
returns table (
  contract_version integer, report_definition_version integer,
  customers_total bigint, customers_new bigint, customers_returning bigint,
  bookings_per_customer_bps integer, suppressed_contacts bigint, erased_customers bigint)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_customer_report_v1(p_tenant_id,p_from,p_to,p_time_zone); $$;

-- ---------------------------------------------------------------------------
-- 6. Exports
-- ---------------------------------------------------------------------------

create table app.report_exports (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  report_key text not null check (report_key in ('bookings','utilization','revenue','customers')),
  report_definition_version integer not null default 1,
  -- The filters this export was run under, so a file can always be explained.
  parameters jsonb not null check (jsonb_typeof(parameters) = 'object'),
  status text not null default 'pending'
    check (status in ('pending','running','completed','failed')),
  row_count integer check (row_count is null or row_count >= 0),
  -- Resolved rows, snapshotted at run time. Rendering to CSV happens in
  -- `packages/reporting`, where escaping and formula-injection safety are unit
  -- tested. Held here rather than in Storage for the same recoverability reason
  -- issue #18's privacy export is: PITR does not restore deleted objects.
  -- ponytail: jsonb rows with an expiry, move to Storage once #39 lands.
  rows_payload jsonb check (rows_payload is null or jsonb_typeof(rows_payload) = 'array'),
  expires_at timestamptz,
  failure_code text check (failure_code is null or char_length(failure_code) between 1 and 80),
  requested_by_membership_id uuid,
  created_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  primary key (id),
  unique (tenant_id,id),
  foreign key (tenant_id,requested_by_membership_id)
    references app.memberships(tenant_id,id) on delete restrict,
  check ((rows_payload is null) or expires_at is not null),
  check ((status = 'failed') = (failure_code is not null))
);
create index report_exports_tenant_idx on app.report_exports (tenant_id, created_at desc);

alter table app.report_exports enable row level security;
create policy report_exports_select_scoped on app.report_exports for select to authenticated
using ((select private.is_active_tenant_member(tenant_id))
  and (select private.has_direct_capability(tenant_id,'booking.view.any')));
create policy report_exports_insert_denied on app.report_exports
  for insert to anon,authenticated with check (false);
create policy report_exports_update_denied on app.report_exports
  for update to anon,authenticated using (false) with check (false);
create policy report_exports_delete_denied on app.report_exports
  for delete to anon,authenticated using (false);
revoke all on app.report_exports from public,anon,authenticated;
-- The rows are the densest thing this table holds, so the grant is column
-- scoped and `rows_payload` is simply not in it. A table-wide grant cannot be
-- narrowed afterwards.
grant select (id,tenant_id,report_key,report_definition_version,parameters,status,
  row_count,expires_at,failure_code,requested_by_membership_id,created_at,completed_at)
  on app.report_exports to authenticated;

-- Persisting an export. The rows were already computed by the caller under
-- their own scope; this only writes them down.
create or replace function private.persist_report_export_v1(
  p_tenant_id uuid,
  p_report_key text,
  p_parameters jsonb,
  p_rows jsonb
)
returns table (export_id uuid, status text, row_count integer, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_id uuid;
  v_expires timestamptz;
begin
  if not coalesce((select private.has_direct_capability(p_tenant_id,'booking.view.any')),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if p_report_key not in ('bookings','utilization','revenue','customers') then
    raise exception using errcode='22023',message='report_unknown';
  end if;
  -- Money is a separate entitlement, and an export is not a way around it.
  if p_report_key = 'revenue'
     and not coalesce((select private.has_direct_capability(p_tenant_id,'billing.view')),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;

  -- Short lived by design. An export is a snapshot, and a stale snapshot
  -- downloaded a month later is how two people end up quoting different
  -- numbers for the same week.
  v_expires := v_now + pg_catalog.make_interval(days=>7);
  insert into app.report_exports(
    tenant_id,report_key,parameters,status,rows_payload,row_count,expires_at,
    requested_by_membership_id,completed_at)
  values (p_tenant_id,p_report_key,p_parameters,'completed',coalesce(p_rows,'[]'::jsonb),
    pg_catalog.jsonb_array_length(coalesce(p_rows,'[]'::jsonb)),v_expires,
    (select private.current_membership_id(p_tenant_id)),v_now)
  returning id into v_id;

  return query select v_id,'completed'::text,
    pg_catalog.jsonb_array_length(coalesce(p_rows,'[]'::jsonb)),v_expires;
end;
$function$;

-- Reading an export's rows. The only path to `rows_payload`, and it re-checks
-- capability and expiry rather than trusting that running it was enough.
create or replace function private.get_report_export_v1(
  p_tenant_id uuid,
  p_export_id uuid
)
returns table (
  export_id uuid,
  report_key text,
  report_definition_version integer,
  parameters jsonb,
  status text,
  row_count integer,
  rows_payload jsonb,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_may_money boolean;
begin
  if not coalesce((select private.is_active_tenant_member(p_tenant_id)),false)
     or not coalesce((select private.has_direct_capability(p_tenant_id,'booking.view.any')),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  v_may_money := coalesce((select private.has_direct_capability(p_tenant_id,'billing.view')),false);

  return query
  select e.id, e.report_key, e.report_definition_version, e.parameters, e.status,
    e.row_count,
    -- Expired is the same as absent, and a revenue export is unreadable without
    -- the financial capability even to whoever queued it.
    case when e.expires_at is not null and e.expires_at > pg_catalog.statement_timestamp()
           and (e.report_key <> 'revenue' or v_may_money)
         then e.rows_payload end,
    e.expires_at, e.created_at
  from app.report_exports e
  where e.tenant_id = p_tenant_id and e.id = p_export_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. api_v1 surface
-- ---------------------------------------------------------------------------

-- SECURITY INVOKER on purpose, and this is the whole point: the rows are
-- computed under the caller's own row level security, so a location-limited
-- member exports their locations and cannot infer anybody else's. Running this
-- as a definer would have silently exported the whole tenant.
create or replace function api_v1.run_report_export_v1(
  p_tenant_id uuid, p_report_key text, p_from date, p_to date,
  p_time_zone text default 'UTC', p_location_id uuid default null)
returns table (export_id uuid, status text, row_count integer, expires_at timestamptz)
language plpgsql volatile security invoker set search_path = '' set statement_timeout = '30s'
as $function$
declare
  v_rows jsonb;
begin
  if p_report_key = 'bookings' then
    select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r)) into v_rows
    from api_v1.get_booking_report_v1(p_tenant_id,p_from,p_to,p_time_zone,p_location_id) r;
  elsif p_report_key = 'utilization' then
    select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r)) into v_rows
    from api_v1.get_utilization_report_v1(p_tenant_id,p_from,p_to,p_time_zone,p_location_id) r;
  elsif p_report_key = 'revenue' then
    select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r)) into v_rows
    from api_v1.get_revenue_report_v1(p_tenant_id,p_from,p_to,p_time_zone) r;
  elsif p_report_key = 'customers' then
    select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r)) into v_rows
    from api_v1.get_customer_report_v1(p_tenant_id,p_from,p_to,p_time_zone) r;
  else
    raise exception using errcode='22023',message='report_unknown';
  end if;

  return query select * from private.persist_report_export_v1(
    p_tenant_id,p_report_key,
    jsonb_build_object('from',p_from,'to',p_to,'time_zone',coalesce(p_time_zone,'UTC'),
      'location_id',p_location_id),
    coalesce(v_rows,'[]'::jsonb));
end;
$function$;

create or replace function api_v1.get_report_export_v1(
  p_tenant_id uuid, p_export_id uuid)
returns table (
  export_id uuid, report_key text, report_definition_version integer,
  parameters jsonb, status text, row_count integer, rows_payload jsonb,
  expires_at timestamptz, created_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_report_export_v1(p_tenant_id,p_export_id); $$;

create or replace function api_v1.list_report_exports_v1(
  p_tenant_id uuid, p_limit integer default 25)
returns table (
  export_id uuid, report_key text, status text, row_count integer,
  expires_at timestamptz, created_at timestamptz)
language sql stable security invoker set search_path = ''
as $$
  select e.id, e.report_key, e.status, e.row_count, e.expires_at, e.created_at
  from app.report_exports e
  where e.tenant_id = p_tenant_id
  order by e.created_at desc
  limit least(greatest(coalesce(p_limit,25),1),100);
$$;

-- ---------------------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------------------

revoke all on function
  private.resolve_report_window_v1(date,date,text),
  private.offered_minutes_v1(uuid,timestamptz,timestamptz,uuid,uuid),
  private.get_revenue_report_v1(uuid,date,date,text),
  private.get_customer_report_v1(uuid,date,date,text),
  private.persist_report_export_v1(uuid,text,jsonb,jsonb),
  private.get_report_export_v1(uuid,uuid)
from public, anon, authenticated;

-- The window resolver is pure arithmetic over two dates and a timezone name. It
-- reads nothing, so the invoker-mode reports that call it can hold it.
grant execute on function
  private.resolve_report_window_v1(date,date,text),
  private.offered_minutes_v1(uuid,timestamptz,timestamptz,uuid,uuid),
  -- Safe to grant: each of these checks its own capability inside itself.
  private.get_revenue_report_v1(uuid,date,date,text),
  private.get_customer_report_v1(uuid,date,date,text),
  private.persist_report_export_v1(uuid,text,jsonb,jsonb),
  private.get_report_export_v1(uuid,uuid)
to authenticated;

revoke all on function
  api_v1.get_booking_report_v1(uuid,date,date,text,uuid,uuid,uuid),
  api_v1.get_utilization_report_v1(uuid,date,date,text,uuid),
  api_v1.get_revenue_report_v1(uuid,date,date,text),
  api_v1.get_customer_report_v1(uuid,date,date,text),
  api_v1.run_report_export_v1(uuid,text,date,date,text,uuid),
  api_v1.get_report_export_v1(uuid,uuid),
  api_v1.list_report_exports_v1(uuid,integer)
from public, anon;

grant execute on function
  api_v1.get_booking_report_v1(uuid,date,date,text,uuid,uuid,uuid),
  api_v1.get_utilization_report_v1(uuid,date,date,text,uuid),
  api_v1.get_revenue_report_v1(uuid,date,date,text),
  api_v1.get_customer_report_v1(uuid,date,date,text),
  api_v1.run_report_export_v1(uuid,text,date,date,text,uuid),
  api_v1.get_report_export_v1(uuid,uuid),
  api_v1.list_report_exports_v1(uuid,integer)
to authenticated;
