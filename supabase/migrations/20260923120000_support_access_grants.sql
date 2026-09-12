-- Issue #28: audited, scoped, expiring support access.
--
-- The shape of the problem: an operator sometimes has to see a tenant's data to
-- diagnose something, and must never be able to do it quietly, indefinitely, or
-- at a scope nobody agreed to.
--
-- How this works, and why it is one line rather than a parallel access system:
--
--   Every read policy in this product already asks
--   `private.is_active_tenant_member(tenant_id)`. That function learns one more
--   way to be true — a live, approved, unexpired support grant for the calling
--   operator. Nothing else changes, so support access is exactly the read a
--   member has and cannot drift from it as new tables are added.
--
--   Writes do not follow, and that is not an accident of this design but the
--   point of it. Every write path asks `has_direct_capability` or
--   `can_decide_booking`, and both read `app.memberships` joined to
--   `app.role_permissions`. A support operator has no membership row, so they
--   hold no capability, so they can change nothing. Read support is therefore
--   the default because it is the only thing this grant can produce.
--
-- Consequences that follow for free, rather than needing their own enforcement:
--
--   * owner transfer, payout changes, refunds, provider keys and policy edits
--     are all capability-gated, so none of them are reachable under support.
--   * expiry and revocation are read from current database state on every
--     single call, so a grant that ends mid-session ends mid-session.
--   * removing somebody from `control_plane.operators` removes their support
--     access on their next statement, not on their next login.
--
-- What this deliberately does NOT add:
--
--   * no impersonation. There is no way to become a member. The operator stays
--     themselves, and the audit trail says so in both `actor` and
--     `effective_actor`, which issue #8 already put on every audit row.
--   * no write support. The ticket allows it behind a step-up; nothing in the
--     first release needs it, and a capability an operator can assume is a
--     capability somebody eventually assumes by accident. The grant models the
--     scope so it can be added, and refuses it today.
--   * no second audit ledger. Support use lands in the control-plane audit,
--     which is already append-only.
--
-- Error vocabulary. Published strings reused; this migration adds two:
--   support_grant_required  42501  no live grant for this tenant
--   self_approval_denied    42501  the requester cannot approve their own grant

-- ---------------------------------------------------------------------------
-- 1. The grant
-- ---------------------------------------------------------------------------

create table control_plane.support_grants (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  operator_id uuid not null,
  -- Why, and against what. A grant with no external reference is a grant
  -- nobody can review afterwards.
  reason text not null check (char_length(btrim(reason)) between 10 and 500),
  ticket_reference text not null check (char_length(btrim(ticket_reference)) between 1 and 120),
  -- Modelled so write support can be added later; refused today.
  scope text not null default 'read' check (scope in ('read','write')),
  -- Narrowing to one location is allowed. Widening inside a session is not:
  -- there is no function that edits a granted scope.
  location_id uuid,
  status text not null default 'pending'
    check (status in ('pending','active','expired','revoked')),
  requested_at timestamptz not null default statement_timestamp(),
  approved_by uuid,
  approved_at timestamptz,
  starts_at timestamptz,
  -- Bounded by construction. A grant that never ends is a role.
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  primary key (id),
  foreign key (tenant_id,location_id) references app.locations(tenant_id,id) on delete restrict,
  -- One-directional. Being active requires an approval and a window; keeping
  -- them afterwards is the history a reviewer reads, so a revoked or expired
  -- grant does not have to forget when it ran or who approved it.
  check (status <> 'active' or (approved_by is not null and starts_at is not null
    and expires_at is not null)),
  check (expires_at is null or starts_at is null or expires_at > starts_at),
  check ((revoked_at is null) = (revoked_by is null)),
  -- The whole point of two-person control.
  check (approved_by is null or approved_by <> operator_id)
);
create index support_grants_live_idx on control_plane.support_grants (tenant_id,operator_id)
  where status = 'active';

alter table control_plane.support_grants enable row level security;
create policy support_grants_no_application_access on control_plane.support_grants
  for all to anon,authenticated using (false) with check (false);
revoke all on control_plane.support_grants from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 2. The one question every policy will end up asking
-- ---------------------------------------------------------------------------

-- Read from current state on every call. Not cached, not carried in a claim: a
-- grant that ends mid-session has to end mid-session, and an operator removed
-- from the allow-list has to lose access on their next statement.
create or replace function private.active_support_grant_v1(p_tenant_id uuid)
returns table (grant_id uuid, scope text, location_id uuid, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.scope, g.location_id, g.expires_at
  from control_plane.support_grants g
  join control_plane.operators o on o.auth_user_id = g.operator_id
  where g.tenant_id = p_tenant_id
    and g.operator_id = (select private.current_auth_user_id())
    and g.status = 'active'
    and g.revoked_at is null
    and g.starts_at <= pg_catalog.statement_timestamp()
    and g.expires_at > pg_catalog.statement_timestamp()
    -- The operator must still be an operator. Removing somebody from the
    -- allow-list revokes every grant they hold, without touching the grants.
    and o.disabled_at is null
    and (o.expires_at is null or o.expires_at > pg_catalog.statement_timestamp())
    -- And still recently authenticated. A session that was strong an hour ago
    -- is not a session that is strong now.
    and (select private.is_aal2())
  limit 1;
$$;

-- `is_active_tenant_member` learns one more way to be true. Every read policy in
-- the product already calls it, so support access is exactly the read a member
-- has and cannot drift from it as new tables are added.
--
-- Writes deliberately do not follow: every write path asks
-- `has_direct_capability` or `can_decide_booking`, both of which read
-- `app.memberships`. A support operator has no membership row, so they hold no
-- capability and can change nothing. Read-only is not a rule enforced somewhere
-- — it is the only thing this grant can produce.
create or replace function private.is_active_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.current_auth_user_id()) is not null
    and (
      exists (
        select 1
        from app.memberships as membership
        where membership.tenant_id = p_tenant_id
          and membership.auth_user_id = (select private.current_auth_user_id())
          and membership.status = 'active'
      )
      or exists (select 1 from private.active_support_grant_v1(p_tenant_id))
    );
$$;

-- Location scope narrows a support grant the same way it narrows a membership.
-- A grant scoped to one location sees that location and no other.
create or replace function private.can_access_location(
  p_tenant_id uuid,
  p_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when exists (
        select 1 from app.memberships m
        where m.tenant_id = p_tenant_id
          and m.auth_user_id = (select private.current_auth_user_id())
          and m.status = 'active'
      ) then
        -- A member's own scope, unchanged from issue #6: no location scope rows
        -- means the whole tenant, otherwise exactly the listed locations.
        not exists (
          select 1 from app.membership_location_scopes s
          join app.memberships m on m.tenant_id = s.tenant_id and m.id = s.membership_id
          where s.tenant_id = p_tenant_id
            and m.auth_user_id = (select private.current_auth_user_id())
            and m.status = 'active'
        )
        or exists (
          select 1 from app.membership_location_scopes s
          join app.memberships m on m.tenant_id = s.tenant_id and m.id = s.membership_id
          where s.tenant_id = p_tenant_id
            and m.auth_user_id = (select private.current_auth_user_id())
            and m.status = 'active'
            and s.location_id = p_location_id
        )
      else
        -- A support grant: whole tenant, or exactly the one location it names.
        exists (
          select 1 from private.active_support_grant_v1(p_tenant_id) g
          where g.location_id is null or g.location_id = p_location_id
        )
    end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Requesting, approving, using and revoking
-- ---------------------------------------------------------------------------

create or replace function control_plane.request_support_grant_v1(
  p_tenant_id uuid,
  p_reason text,
  p_ticket_reference text,
  p_location_id uuid default null,
  p_minutes integer default 60
)
returns table (grant_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_operator uuid;
  v_id uuid;
begin
  if not control_plane.is_operator_v1('operator') then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  v_operator := (select private.current_auth_user_id());

  insert into control_plane.support_grants(
    tenant_id,operator_id,reason,ticket_reference,location_id)
  values (p_tenant_id,v_operator,p_reason,p_ticket_reference,p_location_id)
  returning id into v_id;

  insert into control_plane.audit_events(operator_id,action,tenant_id,detail)
  values (v_operator,'support.requested',p_tenant_id,
    jsonb_build_object('grant_id',v_id,'ticket',p_ticket_reference,
      'minutes',least(greatest(coalesce(p_minutes,60),5),480)));

  return query select v_id,'pending'::text;
end;
$function$;

create or replace function control_plane.approve_support_grant_v1(
  p_grant_id uuid,
  p_minutes integer default 60
)
returns table (grant_id uuid, status text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_grant control_plane.support_grants%rowtype;
  v_operator uuid;
  v_expires timestamptz;
begin
  if not control_plane.is_operator_v1('admin') then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  v_operator := (select private.current_auth_user_id());

  select * into v_grant from control_plane.support_grants g
  where g.id = p_grant_id for update;
  if v_grant.id is null or v_grant.status <> 'pending' then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if v_grant.operator_id = v_operator then
    raise exception using errcode='42501',message='self_approval_denied';
  end if;
  -- Write support is modelled so it can be added later. It is not approvable
  -- today: a capability an operator can assume is one somebody eventually
  -- assumes by accident.
  if v_grant.scope <> 'read' then
    raise exception using errcode='42501',message='policy_denied';
  end if;

  -- Bounded by construction: eight hours is the ceiling, whatever was asked.
  v_expires := v_now + pg_catalog.make_interval(
    mins => least(greatest(coalesce(p_minutes,60),5),480));

  update control_plane.support_grants g set
    status='active', approved_by=v_operator, approved_at=v_now,
    starts_at=v_now, expires_at=v_expires
  where g.id = p_grant_id;

  insert into control_plane.audit_events(operator_id,action,tenant_id,detail)
  values (v_operator,'support.approved',v_grant.tenant_id,
    jsonb_build_object('grant_id',p_grant_id,'expires_at',v_expires));

  return query select p_grant_id,'active'::text,v_expires;
end;
$function$;

create or replace function control_plane.revoke_support_grant_v1(
  p_grant_id uuid,
  p_reason text default null
)
returns table (grant_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_grant control_plane.support_grants%rowtype;
  v_operator uuid;
begin
  if not control_plane.is_operator_v1('operator') then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  v_operator := (select private.current_auth_user_id());

  select * into v_grant from control_plane.support_grants g
  where g.id = p_grant_id for update;
  if v_grant.id is null then
    raise exception using errcode='42501',message='policy_denied';
  end if;

  -- Anybody may end a session early, including the operator using it. Ending
  -- access should never need an approval round trip.
  update control_plane.support_grants g set
    status='revoked', revoked_at=pg_catalog.statement_timestamp(), revoked_by=v_operator
  where g.id = p_grant_id;

  insert into control_plane.audit_events(operator_id,action,tenant_id,detail)
  values (v_operator,'support.revoked',v_grant.tenant_id,
    jsonb_build_object('grant_id',p_grant_id,'reason',coalesce(p_reason,'ended')));

  return query select p_grant_id,'revoked'::text;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. The banner
-- ---------------------------------------------------------------------------

-- What an interface renders so support mode is unmistakable: which tenant, what
-- scope, when it ends. Callable by any authenticated session because the answer
-- for somebody who is not in a support session is simply nothing.
create or replace function private.get_support_context_v1()
returns table (
  grant_id uuid,
  tenant_id uuid,
  tenant_name text,
  scope text,
  location_id uuid,
  expires_at timestamptz,
  ticket_reference text
)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.tenant_id, t.name, g.scope, g.location_id, g.expires_at,
    g.ticket_reference
  from control_plane.support_grants g
  join app.tenants t on t.id = g.tenant_id
  join control_plane.operators o on o.auth_user_id = g.operator_id
  where g.operator_id = (select private.current_auth_user_id())
    and g.status = 'active'
    and g.revoked_at is null
    and g.starts_at <= pg_catalog.statement_timestamp()
    and g.expires_at > pg_catalog.statement_timestamp()
    and o.disabled_at is null
    and (select private.is_aal2())
  order by g.expires_at
  limit 1;
$$;

create or replace function api_v1.get_support_context_v1()
returns table (
  grant_id uuid, tenant_id uuid, tenant_name text, scope text,
  location_id uuid, expires_at timestamptz, ticket_reference text)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_support_context_v1(); $$;

-- The operator history a reviewer reads afterwards.
create or replace function control_plane.list_support_grants_v1(
  p_tenant_id uuid default null,
  p_limit integer default 50
)
returns table (
  grant_id uuid, tenant_id uuid, operator_id uuid, ticket_reference text,
  reason text, scope text, status text, requested_at timestamptz,
  approved_by uuid, expires_at timestamptz, revoked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not control_plane.is_operator_v1('viewer') then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  return query
  select g.id, g.tenant_id, g.operator_id, g.ticket_reference, g.reason, g.scope,
    g.status, g.requested_at, g.approved_by, g.expires_at, g.revoked_at
  from control_plane.support_grants g
  where (p_tenant_id is null or g.tenant_id = p_tenant_id)
  order by g.requested_at desc
  limit least(greatest(coalesce(p_limit,50),1),200);
end;
$function$;

-- Expiry is already enforced on read, so this is bookkeeping rather than
-- enforcement: it moves finished grants out of `active` so a list reads
-- honestly. Safe to run on any schedule.
create or replace function control_plane.expire_support_grants_v1()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  update control_plane.support_grants g set status='expired'
  where g.status = 'active' and g.expires_at <= pg_catalog.statement_timestamp();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------

revoke all on function
  private.active_support_grant_v1(uuid),
  private.get_support_context_v1(),
  control_plane.request_support_grant_v1(uuid,text,text,uuid,integer),
  control_plane.approve_support_grant_v1(uuid,integer),
  control_plane.revoke_support_grant_v1(uuid,text),
  control_plane.list_support_grants_v1(uuid,integer),
  control_plane.expire_support_grants_v1()
from public, anon, authenticated;

-- `active_support_grant_v1` is called from inside `is_active_tenant_member`,
-- which runs as its definer, so it needs no application grant of its own. The
-- banner does: an interface has to be able to ask whether it is in support mode.
grant execute on function private.get_support_context_v1() to authenticated;
grant execute on function api_v1.get_support_context_v1() to authenticated;
revoke all on function api_v1.get_support_context_v1() from public, anon;

grant execute on function
  control_plane.request_support_grant_v1(uuid,text,text,uuid,integer),
  control_plane.approve_support_grant_v1(uuid,integer),
  control_plane.revoke_support_grant_v1(uuid,text),
  control_plane.list_support_grants_v1(uuid,integer),
  control_plane.expire_support_grants_v1()
to service_role;
