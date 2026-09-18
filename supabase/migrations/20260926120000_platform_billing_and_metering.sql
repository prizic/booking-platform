-- Issue #37: platform billing, separate from booking money.
--
-- The separation is the feature, so it is structural rather than a convention.
-- Nothing in this file references `app.payment_attempts`, `app.payment_charges`,
-- `app.payment_refunds` or `app.commerce_ledger_entries`, and nothing there will
-- ever reference these tables. A tenant's customers pay the tenant through the
-- tenant's own connected account; the tenant pays us. Those are two different
-- flows of money between four different parties, and a schema that lets one
-- read the other is a schema where a refund can accidentally settle a
-- subscription.
--
-- Everything lives in `control_plane`, which `anon` and `authenticated` cannot
-- name. The one thing that crosses outward is a narrow tenant-facing overview
-- behind the `billing.view` capability: plan, period, usage against what the
-- plan includes, invoice totals and any restriction. No customer appears in it,
-- because no customer is involved.
--
-- Three properties worth naming:
--
--   * Entitlements are decided here and read there. `app.tenant_entitlements`
--     has no INSERT, UPDATE or DELETE grant for any application role (issue
--     #26), so a tenant cannot turn on a feature it has not bought by editing
--     its own configuration. Instance configuration may narrow an entitlement;
--     it can never widen one.
--
--   * A meter is versioned. "Bookings" meant something in January and may mean
--     something else in June, and an invoice that cannot say which definition
--     it billed is an invoice nobody can reconcile.
--
--   * A closed period stays closed. A usage event that arrives after its period
--     was invoiced does not rewrite the invoice; it lands as an adjustment in
--     the next one. Silently changing a number somebody has already paid is
--     worse than billing it late.

-- ---------------------------------------------------------------------------
-- 1. Who is billed
-- ---------------------------------------------------------------------------

create table control_plane.billing_accounts (
  tenant_id uuid not null primary key references app.tenants(id) on delete restrict,
  -- The platform's own provider customer, never a tenant's connected account.
  -- A reference, never a credential.
  provider_customer_reference text
    check (provider_customer_reference is null
      or pg_catalog.char_length(provider_customer_reference) between 1 and 120),
  currency character(3) not null default 'SAR' check (currency = upper(currency)),
  -- The billing contact is a membership, not an address. We already know who
  -- the tenant's people are, and copying an email here would be a second place
  -- to keep it correct.
  billing_contact_membership_id uuid,
  state text not null default 'active'
    check (state in ('active','past_due','restricted','cancelled')),
  balance_minor bigint not null default 0,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  foreign key (tenant_id,billing_contact_membership_id)
    references app.memberships(tenant_id,id) on delete set null
);

-- ---------------------------------------------------------------------------
-- 2. What a plan costs, as of when
-- ---------------------------------------------------------------------------

-- Prices change. An invoice that says "Launch plan" without saying which Launch
-- plan is an invoice that cannot be recomputed a year later, which is the only
-- interesting time to recompute one.
create table control_plane.plan_revisions (
  plan_key text not null references control_plane.plans(key) on delete restrict,
  revision integer not null check (revision > 0),
  effective_from timestamptz not null,
  currency character(3) not null check (currency = upper(currency)),
  base_price_minor bigint not null check (base_price_minor >= 0),
  -- meter key -> quantity included before anything is charged per unit.
  included jsonb not null default '{}'::jsonb check (jsonb_typeof(included) = 'object'),
  -- meter key -> minor units per unit over the included quantity.
  unit_prices jsonb not null default '{}'::jsonb check (jsonb_typeof(unit_prices) = 'object'),
  entitlements text[] not null default '{}'::text[],
  -- meter key -> hard ceiling, projected into the tenant's quotas.
  quotas jsonb not null default '{}'::jsonb check (jsonb_typeof(quotas) = 'object'),
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  primary key (plan_key,revision)
);
-- A price somebody has been billed against cannot be edited afterwards.
create trigger plan_revisions_append_only
  before update or delete on control_plane.plan_revisions
  for each row execute function private.enforce_append_only();

alter table control_plane.subscriptions
  add column plan_revision integer,
  add column trial_ends_at timestamptz,
  add column current_period_start timestamptz,
  add column current_period_end timestamptz,
  add column cancel_at timestamptz,
  add column reactivated_at timestamptz;

alter table control_plane.subscriptions
  add constraint subscriptions_period_order
    check (current_period_end is null or current_period_start is null
      or current_period_end > current_period_start);

-- ---------------------------------------------------------------------------
-- 3. What is measured
-- ---------------------------------------------------------------------------

create table control_plane.meters (
  key text not null,
  definition_version integer not null check (definition_version > 0),
  unit text not null check (unit in ('count','seat','location','instance','megabyte','message','build')),
  -- How a period's events become one number. A seat count is the high-water
  -- mark; bookings are a sum. Getting this wrong is a wrong invoice, so it is a
  -- column rather than an assumption in a query.
  aggregation text not null check (aggregation in ('sum','max','last')),
  description_en text not null check (pg_catalog.btrim(description_en) <> ''),
  description_ar text not null check (pg_catalog.btrim(description_ar) <> ''),
  active boolean not null default true,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  primary key (key,definition_version)
);

-- The raw events. Idempotent by construction: a source that retries sends the
-- same `event_key` and the second delivery is free.
create table control_plane.usage_events (
  id bigint generated always as identity,
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  meter_key text not null,
  meter_version integer not null,
  event_key text not null check (pg_catalog.char_length(event_key) between 1 and 200),
  quantity bigint not null check (quantity >= 0),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default pg_catalog.statement_timestamp(),
  source text not null check (source in ('booking','workspace','provisioning','storage','email','build','manual')),
  -- Set when the event arrived after its own period was already invoiced.
  late boolean not null default false,
  primary key (id),
  unique (tenant_id,meter_key,event_key),
  foreign key (meter_key,meter_version) references control_plane.meters(key,definition_version)
);
create index usage_events_period_idx
  on control_plane.usage_events (tenant_id,meter_key,occurred_at);
-- Raw usage is evidence. An invoice that disagrees with it should lose.
create trigger usage_events_append_only
  before update or delete on control_plane.usage_events
  for each row execute function private.enforce_append_only();

create table control_plane.usage_counters (
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  meter_key text not null,
  meter_version integer not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  quantity bigint not null default 0 check (quantity >= 0),
  event_count integer not null default 0 check (event_count >= 0),
  closed_at timestamptz,
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  primary key (tenant_id,meter_key,period_start),
  check (period_end > period_start),
  foreign key (meter_key,meter_version) references control_plane.meters(key,definition_version)
);

-- ---------------------------------------------------------------------------
-- 4. What is owed
-- ---------------------------------------------------------------------------

create table control_plane.invoices (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  number text not null check (number ~ '^INV-[0-9]{8}-[0-9]{4}$'),
  period_start timestamptz not null,
  period_end timestamptz not null,
  currency character(3) not null check (currency = upper(currency)),
  subtotal_minor bigint not null default 0 check (subtotal_minor >= 0),
  credit_minor bigint not null default 0 check (credit_minor >= 0),
  total_minor bigint not null default 0 check (total_minor >= 0),
  state text not null default 'draft' check (state in ('draft','issued','paid','void')),
  plan_key text not null,
  plan_revision integer not null,
  issued_at timestamptz,
  paid_at timestamptz,
  -- The platform's own provider invoice. A reference, never a credential.
  provider_invoice_reference text,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  primary key (id),
  unique (number),
  -- One invoice per tenant per period. Running the biller twice does not bill
  -- twice.
  unique (tenant_id,period_start),
  foreign key (plan_key,plan_revision) references control_plane.plan_revisions(plan_key,revision),
  check (period_end > period_start),
  check (state = 'draft' or issued_at is not null),
  check (state <> 'paid' or paid_at is not null),
  check (total_minor = greatest(subtotal_minor - credit_minor,0))
);

create table control_plane.invoice_lines (
  id bigint generated always as identity,
  invoice_id uuid not null references control_plane.invoices(id) on delete restrict,
  kind text not null check (kind in ('base','usage','adjustment','credit')),
  meter_key text,
  meter_version integer,
  quantity bigint not null default 0 check (quantity >= 0),
  unit_price_minor bigint not null default 0 check (unit_price_minor >= 0),
  amount_minor bigint not null check (amount_minor >= 0),
  description_en text not null check (pg_catalog.btrim(description_en) <> ''),
  description_ar text not null check (pg_catalog.btrim(description_ar) <> ''),
  primary key (id),
  -- A usage line without a meter is a number nobody can check.
  check (kind <> 'usage' or (meter_key is not null and meter_version is not null))
);
create index invoice_lines_invoice_idx on control_plane.invoice_lines (invoice_id,id);

create table control_plane.billing_credits (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  amount_minor bigint not null check (amount_minor > 0),
  currency character(3) not null check (currency = upper(currency)),
  reason text not null check (pg_catalog.char_length(reason) between 3 and 200),
  issued_by uuid not null,
  consumed_invoice_id uuid references control_plane.invoices(id) on delete restrict,
  consumed_minor bigint not null default 0 check (consumed_minor >= 0),
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  primary key (id),
  check (consumed_minor <= amount_minor)
);

-- ---------------------------------------------------------------------------
-- 5. What happens when a tenant stops paying
-- ---------------------------------------------------------------------------

-- Restriction is a policy, not a switch that corrupts a service. Every kind here
-- preserves the tenant's data and their customers' existing bookings; what
-- changes is what new work the tenant can start. A tenant who cannot export
-- their own data is a tenant we are holding hostage, so there is no kind that
-- does that.
create table control_plane.tenant_restrictions (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  kind text not null check (kind in ('new_bookings_paused','staff_seats_frozen','exports_only')),
  reason text not null check (pg_catalog.char_length(reason) between 3 and 200),
  applied_by uuid not null,
  effective_from timestamptz not null default pg_catalog.statement_timestamp(),
  effective_to timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  primary key (id),
  check (effective_to is null or effective_to > effective_from),
  check ((revoked_at is null) = (revoked_by is null))
);
create index tenant_restrictions_active_idx
  on control_plane.tenant_restrictions (tenant_id,effective_from)
  where revoked_at is null;

-- Quotas the product reads, projected from the plan. Same arrangement as
-- entitlements: written only by the control plane, readable through a function.
create table app.tenant_quotas (
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  meter_key text not null,
  limit_quantity bigint not null check (limit_quantity >= 0),
  source text not null default 'plan' check (source in ('plan','override')),
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  primary key (tenant_id,meter_key)
);

do $rls$
declare t text;
begin
  foreach t in array array['billing_accounts','plan_revisions','meters','usage_events',
                           'usage_counters','invoices','invoice_lines','billing_credits',
                           'tenant_restrictions'] loop
    execute format('alter table control_plane.%I enable row level security',t);
    execute format('create policy %I on control_plane.%I for all to anon,authenticated using (false) with check (false)',t||'_no_application_access',t);
    execute format('revoke all on control_plane.%I from public,anon,authenticated',t);
  end loop;
end;
$rls$;

alter table app.tenant_quotas enable row level security;
-- Readable by a member of the tenant, writable by nobody inside it: a tenant
-- that could edit its own ceiling would not have one.
create policy tenant_quotas_read on app.tenant_quotas
  for select to authenticated
  using (private.is_active_tenant_member(tenant_id));
-- One refusal per command rather than a single FOR ALL, so the contract test
-- that requires an explicit policy for every operation can see each of them.
create policy tenant_quotas_no_insert on app.tenant_quotas
  for insert to authenticated with check (false);
create policy tenant_quotas_no_update on app.tenant_quotas
  for update to authenticated using (false) with check (false);
create policy tenant_quotas_no_delete on app.tenant_quotas
  for delete to authenticated using (false);
revoke all on app.tenant_quotas from public, anon, authenticated;
grant select on app.tenant_quotas to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Metering
-- ---------------------------------------------------------------------------

-- One event, however many times it is delivered. A usage pipeline that cannot
-- be retried is a usage pipeline that loses events the first time a network
-- blips, so the contract is: send the same `event_key` and we will count it
-- once.
create or replace function control_plane.record_usage_event_v1(
  p_tenant_id uuid,
  p_meter_key text,
  p_event_key text,
  p_quantity bigint,
  p_occurred_at timestamptz default null,
  p_source text default 'manual'
)
returns table (recorded boolean, duplicate boolean, late boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_occurred timestamptz := coalesce(p_occurred_at,v_now);
  v_version integer;
  v_late boolean;
  v_inserted bigint;
begin
  if not control_plane.is_operator_v1('operator') and not control_plane.is_worker_v1() then
    raise exception using errcode='42501',message='policy_denied';
  end if;

  select m.definition_version into v_version
  from control_plane.meters m
  where m.key = p_meter_key and m.active
  order by m.definition_version desc
  limit 1;
  if v_version is null then
    raise exception using errcode='22023',message='meter_unknown';
  end if;

  -- Late means "its period was already invoiced". It is recorded either way and
  -- flagged, because the honest place to correct a closed period is the next
  -- invoice rather than the one somebody has already paid.
  v_late := exists (
    select 1 from control_plane.invoices i
    where i.tenant_id = p_tenant_id
      and i.state in ('issued','paid')
      and v_occurred >= i.period_start and v_occurred < i.period_end);

  insert into control_plane.usage_events(
    tenant_id,meter_key,meter_version,event_key,quantity,occurred_at,source,late)
  values (p_tenant_id,p_meter_key,v_version,p_event_key,greatest(coalesce(p_quantity,0),0),
    v_occurred,p_source,v_late)
  on conflict (tenant_id,meter_key,event_key) do nothing
  returning id into v_inserted;

  return query select v_inserted is not null, v_inserted is null, v_late;
end;
$function$;

-- Aggregation is a separate step from recording, because a counter is a
-- derivable opinion and the events are the fact. Re-running this recomputes;
-- it never accumulates.
create or replace function control_plane.aggregate_usage_v1(
  p_tenant_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns table (meter_key text, quantity bigint, event_count integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  if not control_plane.is_operator_v1('operator') and not control_plane.is_worker_v1() then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if p_period_end <= p_period_start then
    raise exception using errcode='22023',message='settings_invalid';
  end if;

  insert into control_plane.usage_counters(
    tenant_id,meter_key,meter_version,period_start,period_end,quantity,event_count,updated_at)
  select e.tenant_id, e.meter_key, pg_catalog.max(e.meter_version),
    p_period_start, p_period_end,
    -- The meter says how its events combine. A seat count is a high-water mark
    -- and a booking count is a sum; using one rule for both is a wrong invoice.
    case m.aggregation
      when 'sum' then pg_catalog.sum(e.quantity)
      when 'max' then pg_catalog.max(e.quantity)
      else (pg_catalog.array_agg(e.quantity order by e.occurred_at desc))[1]
    end::bigint,
    pg_catalog.count(*)::integer,
    v_now
  from control_plane.usage_events e
  join control_plane.meters m
    on m.key = e.meter_key and m.definition_version = e.meter_version
  where e.tenant_id = p_tenant_id
    and e.occurred_at >= p_period_start and e.occurred_at < p_period_end
    -- A late event belongs to the period it is billed in, not the one it
    -- happened in, so it is excluded here and picked up as an adjustment.
    and not e.late
  group by e.tenant_id, e.meter_key, m.aggregation
  on conflict (tenant_id,meter_key,period_start) do update
    set quantity = excluded.quantity,
        event_count = excluded.event_count,
        meter_version = excluded.meter_version,
        period_end = excluded.period_end,
        updated_at = v_now
  where control_plane.usage_counters.closed_at is null;

  return query
    select c.meter_key, c.quantity, c.event_count
    from control_plane.usage_counters c
    where c.tenant_id = p_tenant_id and c.period_start = p_period_start
    order by c.meter_key;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Plans, and what they entitle
-- ---------------------------------------------------------------------------

-- The one place a tenant's feature set changes. It projects into
-- `app.tenant_entitlements` and `app.tenant_quotas`, neither of which any
-- application role may write — so a tenant cannot switch on a feature it has
-- not bought by editing its own configuration, and cannot raise its own
-- ceiling. Instance configuration may narrow what is here; it can never widen
-- it (issue #26).
create or replace function control_plane.change_plan_v1(
  p_tenant_id uuid,
  p_plan_key text,
  p_plan_revision integer default null,
  p_period_start timestamptz default null,
  p_period_end timestamptz default null,
  p_trial_ends_at timestamptz default null
)
returns table (plan_key text, plan_revision integer, features_granted integer, features_revoked integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_operator uuid;
  v_revision control_plane.plan_revisions%rowtype;
  v_granted integer;
  v_revoked integer;
begin
  if not control_plane.is_operator_v1('operator') then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  v_operator := (select private.current_auth_user_id());

  select * into v_revision from control_plane.plan_revisions r
  where r.plan_key = p_plan_key
    and (p_plan_revision is null or r.revision = p_plan_revision)
    and r.effective_from <= v_now
  order by r.revision desc
  limit 1;
  if v_revision.plan_key is null then
    raise exception using errcode='22023',message='plan_unknown';
  end if;

  insert into control_plane.billing_accounts(tenant_id,currency)
  values (p_tenant_id,v_revision.currency)
  on conflict (tenant_id) do nothing;

  insert into control_plane.subscriptions(
    tenant_id,plan_key,plan_revision,state,trial_ends_at,
    current_period_start,current_period_end)
  values (p_tenant_id,p_plan_key,v_revision.revision,
    case when p_trial_ends_at is not null and p_trial_ends_at > v_now
      then 'trialing' else 'active' end,
    p_trial_ends_at,
    coalesce(p_period_start,v_now),
    coalesce(p_period_end,v_now + interval '1 month'))
  on conflict (tenant_id) do update
    set plan_key = excluded.plan_key,
        plan_revision = excluded.plan_revision,
        state = excluded.state,
        trial_ends_at = excluded.trial_ends_at,
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        cancel_at = null,
        reactivated_at = case when control_plane.subscriptions.state in ('cancelled','past_due')
          then v_now else control_plane.subscriptions.reactivated_at end,
        updated_at = v_now;

  -- A downgrade has to actually remove what the new plan does not include.
  -- Failing to add is not the same as revoking.
  with wanted as (select unnest(v_revision.entitlements) as feature_key),
  upserted as (
    insert into app.tenant_entitlements(tenant_id,feature_key,granted,source)
    select p_tenant_id,w.feature_key,true,'plan' from wanted w
    on conflict (tenant_id,feature_key) do update
      set granted = true, source = 'plan', updated_at = v_now
    returning 1)
  select pg_catalog.count(*)::integer into v_granted from upserted;

  update app.tenant_entitlements e
  set granted = false, updated_at = v_now
  where e.tenant_id = p_tenant_id and e.granted and e.source = 'plan'
    and not (e.feature_key = any (v_revision.entitlements));
  get diagnostics v_revoked = row_count;

  -- Quotas are replaced rather than merged: a plan's ceilings are the plan's,
  -- and a leftover ceiling from the previous one is somebody's incident.
  delete from app.tenant_quotas q
  where q.tenant_id = p_tenant_id and q.source = 'plan'
    and not (v_revision.quotas ? q.meter_key);
  insert into app.tenant_quotas(tenant_id,meter_key,limit_quantity,source,updated_at)
  select p_tenant_id, quota.key, (quota.value #>> '{}')::bigint, 'plan', v_now
  from pg_catalog.jsonb_each(v_revision.quotas) as quota
  on conflict (tenant_id,meter_key) do update
    set limit_quantity = excluded.limit_quantity, updated_at = v_now;

  insert into control_plane.audit_events(operator_id,action,tenant_id,detail)
  values (v_operator,'billing.plan_changed',p_tenant_id,
    jsonb_build_object('plan',p_plan_key,'revision',v_revision.revision,
      'granted',v_granted,'revoked',v_revoked));

  return query select p_plan_key,v_revision.revision,v_granted,v_revoked;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 8. Invoicing
-- ---------------------------------------------------------------------------

-- Idempotent per (tenant, period) by a unique constraint rather than by a
-- flag: running the biller twice cannot bill twice, even if two workers run it
-- at the same moment.
create or replace function control_plane.issue_invoice_v1(
  p_tenant_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns table (invoice_id uuid, number text, total_minor bigint, replayed boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_existing control_plane.invoices%rowtype;
  v_subscription control_plane.subscriptions%rowtype;
  v_revision control_plane.plan_revisions%rowtype;
  v_invoice_id uuid;
  v_number text;
  v_subtotal bigint := 0;
  v_credit bigint := 0;
  v_available bigint;
begin
  if not control_plane.is_operator_v1('operator') and not control_plane.is_worker_v1() then
    raise exception using errcode='42501',message='policy_denied';
  end if;

  select * into v_existing from control_plane.invoices i
  where i.tenant_id = p_tenant_id and i.period_start = p_period_start;
  if v_existing.id is not null then
    return query select v_existing.id, v_existing.number, v_existing.total_minor, true;
    return;
  end if;

  select * into v_subscription from control_plane.subscriptions s
  where s.tenant_id = p_tenant_id;
  if v_subscription.tenant_id is null then
    raise exception using errcode='22023',message='plan_unknown';
  end if;
  select * into v_revision from control_plane.plan_revisions r
  where r.plan_key = v_subscription.plan_key
    and r.revision = coalesce(v_subscription.plan_revision,1);
  if v_revision.plan_key is null then
    raise exception using errcode='22023',message='plan_unknown';
  end if;

  v_number := 'INV-' || pg_catalog.to_char(p_period_start,'YYYYMMDD') || '-' ||
    pg_catalog.lpad(((pg_catalog.count(*) + 1)::text), 4, '0')
    from control_plane.invoices i where i.period_start = p_period_start;

  insert into control_plane.invoices(
    tenant_id,number,period_start,period_end,currency,plan_key,plan_revision,state)
  values (p_tenant_id,v_number,p_period_start,p_period_end,v_revision.currency,
    v_revision.plan_key,v_revision.revision,'draft')
  returning id into v_invoice_id;

  -- A trial owes nothing for the base, but still shows the line, because an
  -- invoice that hides what a plan costs teaches nobody what renewal will cost.
  insert into control_plane.invoice_lines(
    invoice_id,kind,quantity,unit_price_minor,amount_minor,description_en,description_ar)
  values (v_invoice_id,'base',1,v_revision.base_price_minor,
    case when v_subscription.state = 'trialing' then 0 else v_revision.base_price_minor end,
    'Subscription — ' || v_revision.plan_key,
    'الاشتراك — ' || v_revision.plan_key);
  v_subtotal := case when v_subscription.state = 'trialing' then 0 else v_revision.base_price_minor end;

  -- Usage over what the plan includes.
  insert into control_plane.invoice_lines(
    invoice_id,kind,meter_key,meter_version,quantity,unit_price_minor,amount_minor,
    description_en,description_ar)
  select v_invoice_id,'usage',c.meter_key,c.meter_version,
    greatest(c.quantity - coalesce((v_revision.included ->> c.meter_key)::bigint,0),0),
    coalesce((v_revision.unit_prices ->> c.meter_key)::bigint,0),
    greatest(c.quantity - coalesce((v_revision.included ->> c.meter_key)::bigint,0),0)
      * coalesce((v_revision.unit_prices ->> c.meter_key)::bigint,0),
    m.description_en, m.description_ar
  from control_plane.usage_counters c
  join control_plane.meters m
    on m.key = c.meter_key and m.definition_version = c.meter_version
  where c.tenant_id = p_tenant_id and c.period_start = p_period_start
    and greatest(c.quantity - coalesce((v_revision.included ->> c.meter_key)::bigint,0),0) > 0;

  -- Everything that arrived after an earlier period closed, billed here rather
  -- than by rewriting an invoice somebody has already paid.
  insert into control_plane.invoice_lines(
    invoice_id,kind,meter_key,meter_version,quantity,unit_price_minor,amount_minor,
    description_en,description_ar)
  select v_invoice_id,'adjustment',e.meter_key,pg_catalog.max(e.meter_version),
    pg_catalog.sum(e.quantity)::bigint,
    coalesce((v_revision.unit_prices ->> e.meter_key)::bigint,0),
    pg_catalog.sum(e.quantity)::bigint * coalesce((v_revision.unit_prices ->> e.meter_key)::bigint,0),
    'Late usage — ' || e.meter_key,
    'استخدام متأخر — ' || e.meter_key
  from control_plane.usage_events e
  where e.tenant_id = p_tenant_id and e.late
    and e.occurred_at < p_period_start
    and not exists (
      select 1 from control_plane.invoice_lines l
      join control_plane.invoices i on i.id = l.invoice_id
      where i.tenant_id = p_tenant_id and l.kind = 'adjustment'
        and l.meter_key = e.meter_key and i.period_start < p_period_start)
  group by e.meter_key
  having pg_catalog.sum(e.quantity) > 0;

  select coalesce(pg_catalog.sum(l.amount_minor),0) into v_subtotal
  from control_plane.invoice_lines l where l.invoice_id = v_invoice_id;

  -- Credits, oldest first, never more than is owed.
  select coalesce(pg_catalog.sum(c.amount_minor - c.consumed_minor),0) into v_available
  from control_plane.billing_credits c
  where c.tenant_id = p_tenant_id and c.amount_minor > c.consumed_minor;
  v_credit := least(v_available,v_subtotal);

  if v_credit > 0 then
    with ordered as (
      select c.id, c.amount_minor - c.consumed_minor as remaining,
        pg_catalog.sum(c.amount_minor - c.consumed_minor)
          over (order by c.created_at, c.id) as running
      from control_plane.billing_credits c
      where c.tenant_id = p_tenant_id and c.amount_minor > c.consumed_minor)
    update control_plane.billing_credits c
    set consumed_minor = c.consumed_minor + least(o.remaining, v_credit - (o.running - o.remaining)),
        consumed_invoice_id = v_invoice_id
    from ordered o
    where c.id = o.id and (o.running - o.remaining) < v_credit;

    insert into control_plane.invoice_lines(
      invoice_id,kind,quantity,unit_price_minor,amount_minor,description_en,description_ar)
    values (v_invoice_id,'credit',1,v_credit,v_credit,'Credit applied','رصيد مطبَّق');
  end if;

  update control_plane.invoices i
  set subtotal_minor = v_subtotal,
      credit_minor = v_credit,
      total_minor = greatest(v_subtotal - v_credit,0),
      state = 'issued',
      issued_at = v_now,
      updated_at = v_now
  where i.id = v_invoice_id;

  -- Closing the period is what makes a later event "late".
  update control_plane.usage_counters c
  set closed_at = v_now
  where c.tenant_id = p_tenant_id and c.period_start = p_period_start and c.closed_at is null;

  return query select v_invoice_id, v_number, greatest(v_subtotal - v_credit,0), false;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 9. Credits and restrictions
-- ---------------------------------------------------------------------------

create or replace function control_plane.apply_credit_v1(
  p_tenant_id uuid,
  p_amount_minor bigint,
  p_reason text
)
returns table (credit_id uuid, amount_minor bigint)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_currency character(3);
  v_id uuid;
begin
  if not control_plane.is_operator_v1('admin') then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if coalesce(p_amount_minor,0) <= 0 or pg_catalog.char_length(coalesce(pg_catalog.btrim(p_reason),'')) < 3 then
    raise exception using errcode='22023',message='settings_invalid';
  end if;
  v_operator := (select private.current_auth_user_id());

  select a.currency into v_currency from control_plane.billing_accounts a
  where a.tenant_id = p_tenant_id;
  if v_currency is null then
    raise exception using errcode='22023',message='plan_unknown';
  end if;

  insert into control_plane.billing_credits(tenant_id,amount_minor,currency,reason,issued_by)
  values (p_tenant_id,p_amount_minor,v_currency,pg_catalog.btrim(p_reason),v_operator)
  returning id into v_id;

  insert into control_plane.audit_events(operator_id,action,tenant_id,detail)
  values (v_operator,'billing.credit_issued',p_tenant_id,
    jsonb_build_object('credit_id',v_id,'amount_minor',p_amount_minor,
      'reason',pg_catalog.btrim(p_reason)));

  return query select v_id,p_amount_minor;
end;
$function$;

-- Restricting a tenant is the most damaging ordinary thing an operator does, so
-- it carries a reason, an actor, an effective period and an audit row, and none
-- of those is optional.
create or replace function control_plane.set_tenant_restriction_v1(
  p_tenant_id uuid,
  p_kind text,
  p_reason text,
  p_effective_to timestamptz default null
)
returns table (restriction_id uuid, kind text, effective_from timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_operator uuid;
  v_id uuid;
begin
  if not control_plane.is_operator_v1('admin') then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if pg_catalog.char_length(coalesce(pg_catalog.btrim(p_reason),'')) < 3 then
    raise exception using errcode='22023',message='settings_invalid';
  end if;
  v_operator := (select private.current_auth_user_id());

  insert into control_plane.tenant_restrictions(
    tenant_id,kind,reason,applied_by,effective_from,effective_to)
  values (p_tenant_id,p_kind,pg_catalog.btrim(p_reason),v_operator,v_now,p_effective_to)
  returning id into v_id;

  update control_plane.billing_accounts a
  set state = 'restricted', updated_at = v_now
  where a.tenant_id = p_tenant_id;

  insert into control_plane.audit_events(operator_id,action,tenant_id,detail)
  values (v_operator,'billing.restriction_applied',p_tenant_id,
    jsonb_build_object('restriction_id',v_id,'kind',p_kind,
      'reason',pg_catalog.btrim(p_reason),'effective_to',p_effective_to));

  return query select v_id,p_kind,v_now;
end;
$function$;

create or replace function control_plane.revoke_tenant_restriction_v1(
  p_restriction_id uuid,
  p_reason text
)
returns table (restriction_id uuid, revoked boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_operator uuid;
  v_tenant uuid;
begin
  if not control_plane.is_operator_v1('admin') then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  v_operator := (select private.current_auth_user_id());

  update control_plane.tenant_restrictions r
  set revoked_at = v_now, revoked_by = v_operator
  where r.id = p_restriction_id and r.revoked_at is null
  returning r.tenant_id into v_tenant;
  if v_tenant is null then
    raise exception using errcode='42501',message='transition_not_allowed';
  end if;

  -- Reactivation is only automatic when nothing else is still holding the
  -- tenant down.
  update control_plane.billing_accounts a
  set state = 'active', updated_at = v_now
  where a.tenant_id = v_tenant
    and not exists (
      select 1 from control_plane.tenant_restrictions other
      where other.tenant_id = v_tenant and other.revoked_at is null
        and other.effective_from <= v_now
        and (other.effective_to is null or other.effective_to > v_now));

  insert into control_plane.audit_events(operator_id,action,tenant_id,detail)
  values (v_operator,'billing.restriction_revoked',v_tenant,
    jsonb_build_object('restriction_id',p_restriction_id,
      'reason',pg_catalog.btrim(coalesce(p_reason,''))));

  return query select p_restriction_id,true;
end;
$function$;

-- What the product needs to know, and nothing else. A restriction is a policy
-- the booking path consults; it is not a kill switch, and no kind here touches
-- a tenant's data or a customer's existing booking.
create or replace function private.active_tenant_restrictions_v1(p_tenant_id uuid)
returns table (kind text, effective_to timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select restriction.kind, restriction.effective_to
  from control_plane.tenant_restrictions as restriction
  where restriction.tenant_id = p_tenant_id
    and restriction.revoked_at is null
    and restriction.effective_from <= pg_catalog.statement_timestamp()
    and (restriction.effective_to is null
      or restriction.effective_to > pg_catalog.statement_timestamp())
  order by restriction.kind;
$$;

-- ---------------------------------------------------------------------------
-- 10. What a tenant's billing administrator may see
-- ---------------------------------------------------------------------------

-- Deliberately narrow. Plan, period, usage against what the plan includes,
-- invoice totals, restrictions. No booking payment, no charge, no refund, no
-- customer — none of which this function can reach, because none of it is
-- selected from anywhere near here.
create or replace function private.get_billing_overview_v1(p_tenant_id uuid)
returns table (
  contract_version integer,
  plan_key text,
  plan_revision integer,
  subscription_state text,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  currency character(3),
  account_state text,
  usage jsonb,
  invoices jsonb,
  restrictions jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  -- Reading what a tenant owes is a capability, not a side effect of being a
  -- member. Nothing here grants sight of a customer's payment.
  if not (select private.has_direct_capability(p_tenant_id,'billing.view')) then
    raise exception using errcode='42501',message='policy_denied';
  end if;

  return query
  select 1,
    subscription.plan_key,
    subscription.plan_revision,
    subscription.state,
    subscription.trial_ends_at,
    subscription.current_period_start,
    subscription.current_period_end,
    account.currency,
    account.state,
    coalesce((
      select jsonb_agg(jsonb_build_object(
          'meter', counter.meter_key,
          'quantity', counter.quantity,
          'included', coalesce((revision.included ->> counter.meter_key)::bigint,0),
          'limit', (select quota.limit_quantity from app.tenant_quotas as quota
            where quota.tenant_id = p_tenant_id and quota.meter_key = counter.meter_key))
        order by counter.meter_key)
      from control_plane.usage_counters as counter
      where counter.tenant_id = p_tenant_id
        and counter.period_start = subscription.current_period_start),'[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
          'number', invoice.number,
          'period_start', invoice.period_start,
          'period_end', invoice.period_end,
          'total_minor', invoice.total_minor,
          'currency', invoice.currency,
          'state', invoice.state)
        order by invoice.period_start desc)
      from control_plane.invoices as invoice
      where invoice.tenant_id = p_tenant_id and invoice.state <> 'draft'),'[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object('kind',active.kind,'until',active.effective_to))
      from private.active_tenant_restrictions_v1(p_tenant_id) as active),'[]'::jsonb)
  from control_plane.subscriptions as subscription
  join control_plane.billing_accounts as account
    on account.tenant_id = subscription.tenant_id
  left join control_plane.plan_revisions as revision
    on revision.plan_key = subscription.plan_key
   and revision.revision = subscription.plan_revision
  where subscription.tenant_id = p_tenant_id;
end;
$function$;

create or replace function api_v1.get_billing_overview_v1(p_tenant_id uuid)
returns table (
  contract_version integer, plan_key text, plan_revision integer,
  subscription_state text, trial_ends_at timestamptz,
  current_period_start timestamptz, current_period_end timestamptz,
  currency character(3), account_state text,
  usage jsonb, invoices jsonb, restrictions jsonb)
language sql stable security invoker set search_path = '' set statement_timeout = '10s'
as $$ select * from private.get_billing_overview_v1(p_tenant_id); $$;

-- ---------------------------------------------------------------------------
-- 11. Grants
-- ---------------------------------------------------------------------------

revoke all on function
  control_plane.record_usage_event_v1(uuid,text,text,bigint,timestamptz,text),
  control_plane.aggregate_usage_v1(uuid,timestamptz,timestamptz),
  control_plane.change_plan_v1(uuid,text,integer,timestamptz,timestamptz,timestamptz),
  control_plane.issue_invoice_v1(uuid,timestamptz,timestamptz),
  control_plane.apply_credit_v1(uuid,bigint,text),
  control_plane.set_tenant_restriction_v1(uuid,text,text,timestamptz),
  control_plane.revoke_tenant_restriction_v1(uuid,text)
from public, anon, authenticated;

grant execute on function
  control_plane.record_usage_event_v1(uuid,text,text,bigint,timestamptz,text),
  control_plane.aggregate_usage_v1(uuid,timestamptz,timestamptz),
  control_plane.change_plan_v1(uuid,text,integer,timestamptz,timestamptz,timestamptz),
  control_plane.issue_invoice_v1(uuid,timestamptz,timestamptz),
  control_plane.apply_credit_v1(uuid,bigint,text),
  control_plane.set_tenant_restriction_v1(uuid,text,text,timestamptz),
  control_plane.revoke_tenant_restriction_v1(uuid,text)
to service_role;

revoke all on function
  private.active_tenant_restrictions_v1(uuid),
  private.get_billing_overview_v1(uuid),
  api_v1.get_billing_overview_v1(uuid)
from public, anon, authenticated;
grant execute on function
  private.active_tenant_restrictions_v1(uuid),
  private.get_billing_overview_v1(uuid),
  api_v1.get_billing_overview_v1(uuid)
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 12. The first-release meters and prices
-- ---------------------------------------------------------------------------

insert into control_plane.meters(key,definition_version,unit,aggregation,description_en,description_ar)
values
  ('bookings.committed',1,'count','sum','Committed bookings','الحجوزات المؤكدة'),
  ('staff.active',1,'seat','max','Active staff seats','مقاعد الفريق النشطة'),
  ('locations.active',1,'location','max','Active locations','المواقع النشطة'),
  ('email.sent',1,'message','sum','Notification emails sent','رسائل الإشعارات المرسلة'),
  ('storage.used',1,'megabyte','max','Stored media','الوسائط المخزّنة')
on conflict do nothing;

insert into control_plane.plan_revisions(
  plan_key,revision,effective_from,currency,base_price_minor,included,unit_prices,entitlements,quotas)
select 'launch',1,'2026-01-01T00:00:00Z'::timestamptz,'SAR',49900,
  '{"bookings.committed":500,"staff.active":5,"locations.active":2,"email.sent":2000}'::jsonb,
  '{"bookings.committed":50,"staff.active":9900,"locations.active":19900,"email.sent":5}'::jsonb,
  p.entitlements,
  '{"staff.active":25,"locations.active":10}'::jsonb
from control_plane.plans p where p.key = 'launch'
on conflict do nothing;
