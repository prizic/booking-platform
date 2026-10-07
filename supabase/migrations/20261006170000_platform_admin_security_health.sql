-- Free text can never be used to persist a provider credential.
alter table control_plane.support_grants add constraint support_grants_text_no_secrets
  check (control_plane.contains_no_secret_v1(pg_catalog.jsonb_build_object('reason',reason,'ticket_reference',ticket_reference)));
alter table control_plane.platform_flags add constraint platform_flags_text_no_secrets
  check (control_plane.contains_no_secret_v1(pg_catalog.jsonb_build_object('message_en',message_en,'message_ar',message_ar)));

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
#variable_conflict use_column
declare
  v_grant control_plane.support_grants%rowtype;
  v_operator uuid;
begin
  perform control_plane.require_operator_v1('operator');
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
#variable_conflict use_column
declare
  v_operator uuid;
  v_id uuid;
begin
  perform control_plane.require_operator_v1('operator');
  v_operator := (select private.current_auth_user_id());

  if not control_plane.contains_no_secret_v1(pg_catalog.jsonb_build_object('reason',p_reason,'ticket_reference',p_ticket_reference)) then
    raise exception using errcode='22023',message='secret_rejected';
  end if;
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

-- Platform Admin completion, part 6: operators, support, health, integrations,
-- flags, alerts and the overview.
--
-- Operators: a "usable" admin is listed, enabled, unexpired, role admin, and has
-- a verified second factor. No change may leave zero usable admins; the check
-- runs after the change inside the same transaction, under a table lock so two
-- simultaneous demotions cannot each believe the other admin remains.
-- Break-glass is bounded to eight hours and never self-granted.
--
-- Health and integrations show only what a worker reported. "Configured",
-- "reachable" and "verified" are three different facts with three different
-- sources, and an integration nobody reported on is "not_configured", never ok.

-- ---------------------------------------------------------------------------
-- 1. Operators
-- ---------------------------------------------------------------------------
create or replace function control_plane.assert_usable_admin_remains_v1()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1 from control_plane.operators o
    where o.role = 'admin' and o.disabled_at is null
      and (o.expires_at is null or o.expires_at > pg_catalog.statement_timestamp())
      and exists (select 1 from auth.mfa_factors f
                  where f.user_id = o.auth_user_id and f.status = 'verified')) then
    raise exception using errcode='42501',message='last_admin_protected';
  end if;
end;
$function$;

create or replace function control_plane.validate_operator_role_v1(
  p_operator uuid, p_target uuid, p_role text, p_expires_at timestamptz)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_role not in ('viewer','operator','admin','break_glass') then
    raise exception using errcode='22023',message='settings_invalid';
  end if;
  if p_role = 'break_glass' then
    if p_target = p_operator then
      raise exception using errcode='42501',message='self_grant_denied';
    end if;
    if p_expires_at is null or p_expires_at <= pg_catalog.statement_timestamp()
       or p_expires_at > pg_catalog.statement_timestamp() + interval '8 hours' then
      raise exception using errcode='22023',message='expiry_invalid';
    end if;
  elsif p_expires_at is not null and p_expires_at <= pg_catalog.statement_timestamp() then
    raise exception using errcode='22023',message='expiry_invalid';
  end if;
end;
$function$;

create or replace function control_plane.list_operators_v1()
returns table (operator_id uuid, email text, role text, expires_at timestamptz,
  disabled_at timestamptz, mfa_verified boolean, last_sign_in_at timestamptz,
  created_at timestamptz, updated_at timestamptz, usable_admin boolean)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  select o.auth_user_id, o.email, o.role, o.expires_at, o.disabled_at,
    exists (select 1 from auth.mfa_factors f where f.user_id = o.auth_user_id and f.status = 'verified'),
    u.last_sign_in_at, o.created_at, o.updated_at,
    (o.role = 'admin' and o.disabled_at is null
      and (o.expires_at is null or o.expires_at > pg_catalog.statement_timestamp())
      and exists (select 1 from auth.mfa_factors f where f.user_id = o.auth_user_id and f.status = 'verified'))
  from control_plane.operators o
  left join auth.users u on u.id = o.auth_user_id
  order by o.disabled_at nulls first, o.role, o.email;
end;
$function$;

create or replace function control_plane.add_operator_v1(
  p_email text, p_role text, p_expires_at timestamptz, p_reason text)
returns table (operator_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_user uuid;
  v_email text := pg_catalog.lower(pg_catalog.btrim(p_email));
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  lock table control_plane.operators in share row exclusive mode;
  select u.id into v_user from auth.users u where pg_catalog.lower(u.email) = v_email;
  if v_user is null then
    raise exception using errcode='P0002',message='account_not_found';
  end if;
  perform control_plane.validate_operator_role_v1(v_operator,v_user,p_role,p_expires_at);
  if exists (select 1 from control_plane.operators o where o.auth_user_id = v_user) then
    raise exception using errcode='23505',message='operator_exists';
  end if;
  insert into control_plane.operators(auth_user_id,email,role,expires_at)
  values (v_user,v_email,p_role,p_expires_at);
  perform control_plane.write_audit_v1(v_operator,'operator.added',null,null,'operator',v_user::text,
    p_reason,pg_catalog.jsonb_build_object('role',p_role,'expires_at',p_expires_at));
  return query select v_user;
end;
$function$;

create or replace function control_plane.set_operator_role_v1(
  p_operator_id uuid, p_role text, p_expires_at timestamptz, p_reason text)
returns table (operator_id uuid, role text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_before control_plane.operators%rowtype;
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  lock table control_plane.operators in share row exclusive mode;
  select * into v_before from control_plane.operators o where o.auth_user_id = p_operator_id;
  if v_before.auth_user_id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  perform control_plane.validate_operator_role_v1(v_operator,p_operator_id,p_role,p_expires_at);
  update control_plane.operators o set role = p_role, expires_at = p_expires_at,
    updated_at = pg_catalog.statement_timestamp()
  where o.auth_user_id = p_operator_id;
  perform control_plane.assert_usable_admin_remains_v1();
  perform control_plane.write_audit_v1(v_operator,'operator.role_changed',null,null,'operator',
    p_operator_id::text,p_reason,pg_catalog.jsonb_build_object('from',v_before.role,'to',p_role,
      'expires_at',p_expires_at));
  return query select p_operator_id, p_role;
end;
$function$;

create or replace function control_plane.disable_operator_v1(p_operator_id uuid, p_reason text)
returns table (operator_id uuid, disabled_at timestamptz, grants_revoked integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_revoked integer;
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  lock table control_plane.operators in share row exclusive mode;
  update control_plane.operators o set disabled_at = v_now, updated_at = v_now
  where o.auth_user_id = p_operator_id and o.disabled_at is null;
  if not found then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  perform control_plane.assert_usable_admin_remains_v1();
  -- Access already ends on the next statement; this makes the list say so too.
  update control_plane.support_grants g set status = 'revoked', revoked_at = v_now, revoked_by = v_operator
  where g.operator_id = p_operator_id and g.status in ('pending','active');
  get diagnostics v_revoked = row_count;
  perform control_plane.write_audit_v1(v_operator,'operator.disabled',null,null,'operator',
    p_operator_id::text,p_reason,pg_catalog.jsonb_build_object('rows',v_revoked));
  return query select p_operator_id, v_now, v_revoked;
end;
$function$;

create or replace function control_plane.enable_operator_v1(p_operator_id uuid, p_reason text)
returns table (operator_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  update control_plane.operators o set disabled_at = null, updated_at = pg_catalog.statement_timestamp()
  where o.auth_user_id = p_operator_id and o.disabled_at is not null
    -- An expired break-glass row stays expired; re-enabling is not re-granting.
    and (o.expires_at is null or o.expires_at > pg_catalog.statement_timestamp());
  if not found then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  perform control_plane.write_audit_v1(v_operator,'operator.enabled',null,null,'operator',
    p_operator_id::text,p_reason,'{}'::jsonb);
  return query select p_operator_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Support access
-- ---------------------------------------------------------------------------
create or replace function control_plane.list_support_grants_v2(
  p_status text default null, p_tenant_id uuid default null,
  p_limit integer default 25, p_offset integer default 0)
returns table (grant_id uuid, tenant_id uuid, tenant_name text, requested_by_email text,
  approved_by_email text, revoked_by_email text, ticket_reference text, reason text, scope text,
  location_id uuid, status text, requested_at timestamptz, approved_at timestamptz,
  expires_at timestamptz, revoked_at timestamptz, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  with g as (
    select g.*, case when g.status = 'active' and g.expires_at <= pg_catalog.statement_timestamp()
                     then 'expired' else g.status end as effective
    from control_plane.support_grants g)
  select g.id, g.tenant_id, t.name, ro.email, ao.email, vo.email, g.ticket_reference, g.reason,
    g.scope, g.location_id, g.effective, g.requested_at, g.approved_at, g.expires_at, g.revoked_at,
    pg_catalog.count(*) over ()
  from g
  join app.tenants t on t.id = g.tenant_id
  left join control_plane.operators ro on ro.auth_user_id = g.operator_id
  left join control_plane.operators ao on ao.auth_user_id = g.approved_by
  left join control_plane.operators vo on vo.auth_user_id = g.revoked_by
  where (p_status is null or g.effective = p_status) and (p_tenant_id is null or g.tenant_id = p_tenant_id)
  order by case g.effective when 'active' then 1 when 'pending' then 2 else 3 end, g.requested_at desc
  limit least(greatest(coalesce(p_limit,25),1),100) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function control_plane.approve_support_access_v1(p_grant_id uuid, p_minutes integer)
returns table (grant_id uuid, status text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  return query select * from control_plane.approve_support_grant_v1(p_grant_id,p_minutes);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Health reads and alerts
-- ---------------------------------------------------------------------------
create or replace function control_plane.list_health_v1(
  p_status text default null, p_subject_kind text default null,
  p_limit integer default 50, p_offset integer default 0)
returns table (subject_kind text, tenant_id uuid, tenant_name text, instance_id uuid,
  subject_key text, signal text, status text, freshness text, error_code text,
  observed_at timestamptz, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  with latest as (
    select distinct on (h.subject_kind,h.instance_id,h.subject_key,h.signal)
      h.subject_kind, h.tenant_id, h.instance_id, h.subject_key, h.signal, h.status,
      h.error_code, h.observed_at
    from control_plane.health_observations h
    order by h.subject_kind,h.instance_id,h.subject_key,h.signal,h.observed_at desc),
  rows as (
    select l.subject_kind, l.tenant_id, l.instance_id, l.subject_key, l.signal, l.status,
      case when l.observed_at < pg_catalog.statement_timestamp() - interval '30 minutes'
           then 'stale' else 'fresh' end as freshness, l.error_code, l.observed_at
    from latest l
    union all
    -- Instances that should be observed and are not: an explicit unknown.
    select 'instance', i.tenant_id, i.id, 'instance', 'any', 'unknown', 'never', null, null
    from app.instances i
    where i.deployment_state in ('provisioning','active')
      and not exists (select 1 from control_plane.health_observations h
                      where h.subject_kind = 'instance' and h.instance_id = i.id))
  select r.subject_kind, r.tenant_id, t.name, r.instance_id, r.subject_key, r.signal, r.status,
    r.freshness, r.error_code, r.observed_at, pg_catalog.count(*) over ()
  from rows r left join app.tenants t on t.id = r.tenant_id
  where (p_status is null or r.status = p_status or (p_status = 'stale' and r.freshness = 'stale'))
    and (p_subject_kind is null or r.subject_kind = p_subject_kind)
  order by case r.status when 'failing' then 1 when 'unknown' then 2 when 'degraded' then 3 else 4 end,
    r.observed_at nulls first, t.name
  limit least(greatest(coalesce(p_limit,50),1),100) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

-- Every row is derived from stored evidence; no thresholds on invented metrics.
create or replace function control_plane.list_alerts_v1()
returns table (severity text, kind text, tenant_id uuid, tenant_name text, subject_id text,
  code text, observed_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  select * from (
    select 'critical'::text, 'provisioning_failed'::text, r.tenant_id, t.name, r.id::text, r.last_error_code, r.updated_at
    from control_plane.provisioning_runs r join app.tenants t on t.id = r.tenant_id where r.state = 'failed'
    union all
    select 'critical', 'job_failed', j.tenant_id, t.name, j.id::text, j.last_error_code, j.updated_at
    from control_plane.jobs j left join app.tenants t on t.id = j.tenant_id where j.status = 'failed'
    union all
    select 'critical', 'health_failing', h.tenant_id, t.name, h.instance_id::text, h.error_code, h.observed_at
    from (select distinct on (x.instance_id,x.subject_key,x.signal) x.* from control_plane.health_observations x
          where x.subject_kind = 'instance' order by x.instance_id,x.subject_key,x.signal,x.observed_at desc) h
    left join app.tenants t on t.id = h.tenant_id where h.status = 'failing'
    union all
    select 'warning', 'rollout_paused', null, null, o.id::text,
      (select pg_catalog.min(rt.error_code) from control_plane.rollout_targets rt where rt.rollout_id = o.id and rt.status = 'failed'),
      o.updated_at
    from control_plane.rollouts o where o.status = 'paused'
    union all
    select 'warning', 'stale_observation', h.tenant_id, t.name, h.instance_id::text, h.signal, h.observed_at
    from (select distinct on (x.instance_id,x.subject_key,x.signal) x.* from control_plane.health_observations x
          where x.subject_kind = 'instance' order by x.instance_id,x.subject_key,x.signal,x.observed_at desc) h
    left join app.tenants t on t.id = h.tenant_id where h.observed_at < v_now - interval '30 minutes'
    union all
    select 'warning', 'drift', f.tenant_id, t.name, f.instance_id::text, f.provider || ':' || f.resource_kind, f.observed_at
    from control_plane.instance_infrastructure f join app.tenants t on t.id = f.tenant_id
    where f.observed_at is not null and exists (select 1 from pg_catalog.jsonb_each(f.desired_state) d where f.observed_state -> d.key is distinct from d.value)
    union all
    select 'warning', 'approval_pending', j.tenant_id, t.name, j.id::text, j.kind, j.created_at
    from control_plane.jobs j left join app.tenants t on t.id = j.tenant_id
    where j.kind in ('close_instance','rotate_secret') and j.approved_by is null and j.status = 'queued'
    union all
    select 'warning', 'support_pending', g.tenant_id, t.name, g.id::text, g.ticket_reference, g.requested_at
    from control_plane.support_grants g join app.tenants t on t.id = g.tenant_id where g.status = 'pending'
    union all
    select 'critical', 'break_glass_active', null, null, o.auth_user_id::text, o.email, o.expires_at
    from control_plane.operators o
    where o.role = 'break_glass' and o.disabled_at is null and o.expires_at > v_now
  ) a(severity,kind,tenant_id,tenant_name,subject_id,code,observed_at)
  order by case a.severity when 'critical' then 1 else 2 end, a.observed_at desc nulls last;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Integrations
-- ---------------------------------------------------------------------------
-- Names of secrets in the worker's environment, never their values. A check
-- constraint cannot hold a subquery, so the per-element rule is a function.
create or replace function control_plane.valid_secret_references_v1(p_refs text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(r is not null and r ~ '^[A-Z][A-Z0-9_]{2,80}$'
    and control_plane.contains_no_secret_v1(pg_catalog.jsonb_build_object('r',r))), true)
  from pg_catalog.unnest(coalesce(p_refs,'{}')) r;
$$;

create table control_plane.integrations (
  provider text not null primary key check (provider in ('github','vercel','resend','stripe','supabase')),
  secret_references text[] not null default '{}' check (control_plane.valid_secret_references_v1(secret_references)),
  configured_fingerprint text check (configured_fingerprint is null or configured_fingerprint ~ '^[a-f0-9]{64}$'),
  configured_reported_at timestamptz,
  last_check_at timestamptz,
  last_check_outcome text check (last_check_outcome is null
    or last_check_outcome in ('reachable','unreachable','unauthorized')),
  last_check_error_code text check (last_check_error_code is null or last_check_error_code ~ '^[a-z][a-z0-9_]{2,60}$'),
  verified_at timestamptz,
  updated_at timestamptz not null default pg_catalog.statement_timestamp()
);
alter table control_plane.integrations enable row level security;
create policy integrations_no_application_access on control_plane.integrations
  for all to anon,authenticated using (false) with check (false);
revoke all on control_plane.integrations from public,anon,authenticated;

insert into control_plane.integrations(provider,secret_references) values
  ('github',array['GITHUB_APP_ID','GITHUB_APP_PRIVATE_KEY','GITHUB_APP_INSTALLATION_ID','GITHUB_APP_WEBHOOK_SECRET']),
  ('vercel',array['VERCEL_API_TOKEN','VERCEL_TEAM_ID']),
  ('resend',array['RESEND_API_KEY','RESEND_WEBHOOK_SECRET']),
  ('stripe',array['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET']),
  ('supabase',array['SUPABASE_SERVICE_ROLE_KEY'])
on conflict do nothing;

create or replace function control_plane.list_integrations_v1()
returns table (provider text, secret_references text[], status text, configured_reported_at timestamptz,
  last_check_at timestamptz, last_check_outcome text, last_check_error_code text,
  verified_at timestamptz, pending_check_job_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  select i.provider, i.secret_references,
    case when i.verified_at is not null and (i.last_check_outcome is null or i.last_check_outcome = 'reachable') then 'verified'
         when i.last_check_outcome = 'reachable' then 'reachable'
         when i.last_check_outcome in ('unreachable','unauthorized') then 'failing'
         when i.configured_fingerprint is not null then 'configured'
         else 'not_configured' end,
    i.configured_reported_at, i.last_check_at, i.last_check_outcome, i.last_check_error_code, i.verified_at,
    (select j.id from control_plane.jobs j where j.kind = 'check_integration'
       and j.status in ('queued','running') and j.parameters->>'provider' = i.provider limit 1)
  from control_plane.integrations i order by i.provider;
end;
$function$;

create or replace function control_plane.save_integration_references_v1(p_provider text, p_secret_references text[])
returns table (provider text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
begin
  v_operator := control_plane.require_operator_v1('admin');
  if not control_plane.valid_secret_references_v1(p_secret_references) then
    raise exception using errcode='22023',message='reference_invalid';
  end if;
  update control_plane.integrations i set secret_references = coalesce(p_secret_references,'{}'),
    updated_at = pg_catalog.statement_timestamp()
  where i.provider = p_provider;
  if not found then
    raise exception using errcode='P0002',message='not_found';
  end if;
  perform control_plane.write_audit_v1(v_operator,'integration.references_saved',null,null,'integration',
    p_provider,null,pg_catalog.jsonb_build_object('provider',p_provider,'rows',pg_catalog.cardinality(p_secret_references)));
  return query select p_provider;
end;
$function$;

create or replace function control_plane.request_integration_check_v1(p_provider text)
returns table (job_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_existing uuid;
  v_attempt bigint;
begin
  v_operator := control_plane.require_operator_v1('operator');
  if not exists (select 1 from control_plane.integrations i where i.provider = p_provider) then
    raise exception using errcode='P0002',message='not_found';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('check_integration:' || p_provider,0));
  select j.id into v_existing from control_plane.jobs j where j.kind = 'check_integration'
    and j.status in ('queued','running') and j.parameters->>'provider' = p_provider limit 1;
  if v_existing is not null then
    return query select v_existing;
    return;
  end if;
  select pg_catalog.count(*) + 1 into v_attempt from control_plane.jobs j
  where j.kind = 'check_integration' and j.parameters->>'provider' = p_provider;
  return query select control_plane.enqueue_operator_job_v1(v_operator,'check_integration',null,null,
    pg_catalog.jsonb_build_object('provider',p_provider),
    'check_integration:' || p_provider || ':' || v_attempt::text);
end;
$function$;

create or replace function control_plane.record_integration_status_v1(
  p_provider text, p_fingerprint text, p_check_outcome text, p_error_code text, p_verified boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  if not control_plane.is_worker_v1() then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  update control_plane.integrations i set
    configured_fingerprint = coalesce(p_fingerprint,i.configured_fingerprint),
    configured_reported_at = case when p_fingerprint is not null then v_now else i.configured_reported_at end,
    last_check_at = case when p_check_outcome is not null then v_now else i.last_check_at end,
    last_check_outcome = coalesce(p_check_outcome,i.last_check_outcome),
    last_check_error_code = case when p_check_outcome is not null then p_error_code else i.last_check_error_code end,
    verified_at = case when p_verified then v_now else i.verified_at end,
    updated_at = v_now
  where i.provider = p_provider;
  if not found then
    raise exception using errcode='P0002',message='not_found';
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Platform flags
-- ---------------------------------------------------------------------------
create or replace function control_plane.list_platform_flags_v1()
returns table (key text, enabled boolean, kind text, message_en text, message_ar text,
  starts_at timestamptz, ends_at timestamptz, updated_by_email text, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  select f.key, f.enabled, f.kind, f.message_en, f.message_ar, f.starts_at, f.ends_at, o.email, f.updated_at
  from control_plane.platform_flags f
  left join control_plane.operators o on o.auth_user_id = f.updated_by
  order by f.kind, f.key;
end;
$function$;

create or replace function control_plane.save_platform_flag_v1(
  p_key text, p_kind text, p_enabled boolean, p_message_en text, p_message_ar text,
  p_starts_at timestamptz, p_ends_at timestamptz, p_reason text)
returns table (key text, enabled boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_before control_plane.platform_flags%rowtype;
  v_en text := nullif(pg_catalog.btrim(p_message_en),'');
  v_ar text := nullif(pg_catalog.btrim(p_message_ar),'');
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  if p_key is null or p_key !~ '^[a-z][a-z0-9_.]{1,60}$'
     or p_kind not in ('feature','incident_banner','maintenance_window','kill_switch')
     or (v_en is null) <> (v_ar is null)
     or (p_kind = 'incident_banner' and v_en is null)
     or pg_catalog.char_length(coalesce(v_en,'')) > 500 or pg_catalog.char_length(coalesce(v_ar,'')) > 500
     or (p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at) then
    raise exception using errcode='22023',message='flag_invalid';
  end if;
  if not control_plane.contains_no_secret_v1(pg_catalog.jsonb_build_object('message_en',v_en,'message_ar',v_ar)) then
    raise exception using errcode='22023',message='secret_rejected';
  end if;
  select * into v_before from control_plane.platform_flags f where f.key = p_key for update;
  insert into control_plane.platform_flags(key,enabled,kind,message_en,message_ar,starts_at,ends_at,updated_by)
  values (p_key,coalesce(p_enabled,false),p_kind,v_en,v_ar,p_starts_at,p_ends_at,v_operator)
  on conflict (key) do update set enabled = excluded.enabled, kind = excluded.kind,
    message_en = excluded.message_en, message_ar = excluded.message_ar,
    starts_at = excluded.starts_at, ends_at = excluded.ends_at,
    updated_by = excluded.updated_by, updated_at = pg_catalog.statement_timestamp();
  perform control_plane.write_audit_v1(v_operator,'platform_flag.saved',null,null,'platform_flag',p_key,
    p_reason,pg_catalog.jsonb_build_object('flag_key',p_key,'kind',p_kind,
      'from',v_before.enabled,'enabled',coalesce(p_enabled,false)));
  return query select p_key, coalesce(p_enabled,false);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Overview
-- ---------------------------------------------------------------------------
create or replace function control_plane.get_overview_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  perform control_plane.require_operator_v1('viewer');
  return pg_catalog.jsonb_build_object(
    'generated_at',v_now,
    'tenant_total',(select pg_catalog.count(*) from app.tenants),
    'tenants',coalesce((select pg_catalog.jsonb_object_agg(x.status,x.n) from
      (select t.status, pg_catalog.count(*) n from app.tenants t group by t.status) x),'{}'::jsonb),
    'instance_total',(select pg_catalog.count(*) from app.instances),
    'instances',coalesce((select pg_catalog.jsonb_object_agg(x.deployment_state,x.n) from
      (select i.deployment_state, pg_catalog.count(*) n from app.instances i group by i.deployment_state) x),'{}'::jsonb),
    'subscriptions',coalesce((select pg_catalog.jsonb_object_agg(x.state,x.n) from
      (select coalesce(s.state,'none') state, pg_catalog.count(*) n from app.tenants t
       left join control_plane.subscriptions s on s.tenant_id = t.id group by coalesce(s.state,'none')) x),'{}'::jsonb),
    'provisioning',pg_catalog.jsonb_build_object(
      'in_progress',(select pg_catalog.count(*) from control_plane.provisioning_runs r
                     where r.state not in ('active','failed','deactivated') and r.waiting_reason is null),
      'waiting',(select pg_catalog.count(*) from control_plane.provisioning_runs r where r.waiting_reason is not null),
      'failed',(select pg_catalog.count(*) from control_plane.provisioning_runs r where r.state = 'failed'),
      'active',(select pg_catalog.count(*) from control_plane.provisioning_runs r where r.state = 'active')),
    'jobs',coalesce((select pg_catalog.jsonb_object_agg(x.status,x.n) from
      (select j.status, pg_catalog.count(*) n from control_plane.jobs j group by j.status) x),'{}'::jsonb),
    'health',(select pg_catalog.jsonb_build_object(
        'failing',pg_catalog.count(*) filter (where h.status = 'failing'),
        'degraded',pg_catalog.count(*) filter (where h.status = 'degraded'),
        'healthy',pg_catalog.count(*) filter (where h.status = 'healthy' and h.observed_at >= v_now - interval '30 minutes'),
        'stale',pg_catalog.count(*) filter (where h.status is not null and h.observed_at < v_now - interval '30 minutes'),
        'unobserved',pg_catalog.count(*) filter (where h.status is null),
        'stale_after_minutes',30)
      from app.instances i
      left join lateral control_plane.instance_health_v1(i.id) h on true
      where i.deployment_state in ('provisioning','active')),
    'pending',pg_catalog.jsonb_build_object(
      'job_approvals',(select pg_catalog.count(*) from control_plane.jobs j
        where j.kind in ('close_instance','rotate_secret') and j.approved_by is null and j.status = 'queued'),
      'support_requests',(select pg_catalog.count(*) from control_plane.support_grants g where g.status = 'pending'),
      'support_active',(select pg_catalog.count(*) from control_plane.support_grants g
        where g.status = 'active' and g.expires_at > v_now),
      'rollouts_paused',(select pg_catalog.count(*) from control_plane.rollouts o where o.status = 'paused'),
      'rollouts_running',(select pg_catalog.count(*) from control_plane.rollouts o where o.status = 'running'),
      'domains_pending',(select pg_catalog.count(*) from app.tenant_domains d where d.verification_status = 'pending'),
      'break_glass_active',(select pg_catalog.count(*) from control_plane.operators o
        where o.role = 'break_glass' and o.disabled_at is null and o.expires_at > v_now)),
    'recent_activity',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) - 'total_count')
      from control_plane.audit_rows_v1(null,null,null,null,null,null,null,8,0) a),'[]'::jsonb));
end;
$function$;

-- ---------------------------------------------------------------------------
-- 7. api_v1 pass-throughs and grants
-- ---------------------------------------------------------------------------
create or replace function api_v1.list_operators_v1()
returns table (operator_id uuid, email text, role text, expires_at timestamptz,
  disabled_at timestamptz, mfa_verified boolean, last_sign_in_at timestamptz,
  created_at timestamptz, updated_at timestamptz, usable_admin boolean)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_operators_v1(); $$;

create or replace function api_v1.add_operator_v1(p_email text, p_role text, p_expires_at timestamptz, p_reason text)
returns table (operator_id uuid)
language sql security definer set search_path to ''
as $$ select * from control_plane.add_operator_v1(p_email,p_role,p_expires_at,p_reason); $$;

create or replace function api_v1.set_operator_role_v1(p_operator_id uuid, p_role text, p_expires_at timestamptz, p_reason text)
returns table (operator_id uuid, role text)
language sql security definer set search_path to ''
as $$ select * from control_plane.set_operator_role_v1(p_operator_id,p_role,p_expires_at,p_reason); $$;

create or replace function api_v1.disable_operator_v1(p_operator_id uuid, p_reason text)
returns table (operator_id uuid, disabled_at timestamptz, grants_revoked integer)
language sql security definer set search_path to ''
as $$ select * from control_plane.disable_operator_v1(p_operator_id,p_reason); $$;

create or replace function api_v1.enable_operator_v1(p_operator_id uuid, p_reason text)
returns table (operator_id uuid)
language sql security definer set search_path to ''
as $$ select * from control_plane.enable_operator_v1(p_operator_id,p_reason); $$;

create or replace function api_v1.list_support_grants_v2(p_status text default null, p_tenant_id uuid default null,
  p_limit integer default 25, p_offset integer default 0)
returns table (grant_id uuid, tenant_id uuid, tenant_name text, requested_by_email text,
  approved_by_email text, revoked_by_email text, ticket_reference text, reason text, scope text,
  location_id uuid, status text, requested_at timestamptz, approved_at timestamptz,
  expires_at timestamptz, revoked_at timestamptz, total_count bigint)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_support_grants_v2(p_status,p_tenant_id,p_limit,p_offset); $$;

create or replace function api_v1.request_support_grant_v1(p_tenant_id uuid, p_reason text,
  p_ticket_reference text, p_location_id uuid default null, p_minutes integer default 60)
returns table (grant_id uuid, status text)
language sql security definer set search_path to ''
as $$ select * from control_plane.request_support_grant_v1(p_tenant_id,p_reason,p_ticket_reference,p_location_id,p_minutes); $$;

create or replace function api_v1.approve_support_access_v1(p_grant_id uuid, p_minutes integer)
returns table (grant_id uuid, status text, expires_at timestamptz)
language sql security definer set search_path to ''
as $$ select * from control_plane.approve_support_access_v1(p_grant_id,p_minutes); $$;

create or replace function api_v1.revoke_support_grant_v1(p_grant_id uuid, p_reason text default null)
returns table (grant_id uuid, status text)
language sql security definer set search_path to ''
as $$ select * from control_plane.revoke_support_grant_v1(p_grant_id,p_reason); $$;

create or replace function api_v1.list_health_v1(p_status text default null, p_subject_kind text default null,
  p_limit integer default 50, p_offset integer default 0)
returns table (subject_kind text, tenant_id uuid, tenant_name text, instance_id uuid,
  subject_key text, signal text, status text, freshness text, error_code text,
  observed_at timestamptz, total_count bigint)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_health_v1(p_status,p_subject_kind,p_limit,p_offset); $$;

create or replace function api_v1.list_alerts_v1()
returns table (severity text, kind text, tenant_id uuid, tenant_name text, subject_id text,
  code text, observed_at timestamptz)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_alerts_v1(); $$;

create or replace function api_v1.list_integrations_v1()
returns table (provider text, secret_references text[], status text, configured_reported_at timestamptz,
  last_check_at timestamptz, last_check_outcome text, last_check_error_code text,
  verified_at timestamptz, pending_check_job_id uuid)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_integrations_v1(); $$;

create or replace function api_v1.save_integration_references_v1(p_provider text, p_secret_references text[])
returns table (provider text)
language sql security definer set search_path to ''
as $$ select * from control_plane.save_integration_references_v1(p_provider,p_secret_references); $$;

create or replace function api_v1.request_integration_check_v1(p_provider text)
returns table (job_id uuid)
language sql security definer set search_path to ''
as $$ select * from control_plane.request_integration_check_v1(p_provider); $$;

create or replace function api_v1.record_integration_status_v1(p_provider text, p_fingerprint text,
  p_check_outcome text, p_error_code text, p_verified boolean)
returns void
language sql security definer set search_path to ''
as $$ select control_plane.record_integration_status_v1(p_provider,p_fingerprint,p_check_outcome,p_error_code,p_verified); $$;

create or replace function api_v1.list_platform_flags_v1()
returns table (key text, enabled boolean, kind text, message_en text, message_ar text,
  starts_at timestamptz, ends_at timestamptz, updated_by_email text, updated_at timestamptz)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_platform_flags_v1(); $$;

create or replace function api_v1.save_platform_flag_v1(p_key text, p_kind text, p_enabled boolean,
  p_message_en text, p_message_ar text, p_starts_at timestamptz, p_ends_at timestamptz, p_reason text)
returns table (key text, enabled boolean)
language sql security definer set search_path to ''
as $$ select * from control_plane.save_platform_flag_v1(p_key,p_kind,p_enabled,p_message_en,p_message_ar,p_starts_at,p_ends_at,p_reason); $$;

create or replace function api_v1.get_overview_v1() returns jsonb
language sql security definer set search_path to ''
as $$ select control_plane.get_overview_v1(); $$;

revoke all on all functions in schema control_plane from public,anon,authenticated;
grant execute on function control_plane.contains_no_secret_v1(jsonb) to service_role;

revoke all on function
  api_v1.list_operators_v1(), api_v1.add_operator_v1(text,text,timestamptz,text),
  api_v1.set_operator_role_v1(uuid,text,timestamptz,text), api_v1.disable_operator_v1(uuid,text),
  api_v1.enable_operator_v1(uuid,text), api_v1.list_support_grants_v2(text,uuid,integer,integer),
  api_v1.request_support_grant_v1(uuid,text,text,uuid,integer), api_v1.approve_support_access_v1(uuid,integer),
  api_v1.revoke_support_grant_v1(uuid,text), api_v1.list_health_v1(text,text,integer,integer),
  api_v1.list_alerts_v1(), api_v1.list_integrations_v1(), api_v1.save_integration_references_v1(text,text[]),
  api_v1.request_integration_check_v1(text), api_v1.record_integration_status_v1(text,text,text,text,boolean),
  api_v1.list_platform_flags_v1(),
  api_v1.save_platform_flag_v1(text,text,boolean,text,text,timestamptz,timestamptz,text),
  api_v1.get_overview_v1()
from public, anon, authenticated;
grant execute on function
  api_v1.list_operators_v1(), api_v1.add_operator_v1(text,text,timestamptz,text),
  api_v1.set_operator_role_v1(uuid,text,timestamptz,text), api_v1.disable_operator_v1(uuid,text),
  api_v1.enable_operator_v1(uuid,text), api_v1.list_support_grants_v2(text,uuid,integer,integer),
  api_v1.request_support_grant_v1(uuid,text,text,uuid,integer), api_v1.approve_support_access_v1(uuid,integer),
  api_v1.revoke_support_grant_v1(uuid,text), api_v1.list_health_v1(text,text,integer,integer),
  api_v1.list_alerts_v1(), api_v1.list_integrations_v1(), api_v1.save_integration_references_v1(text,text[]),
  api_v1.request_integration_check_v1(text), api_v1.list_platform_flags_v1(),
  api_v1.save_platform_flag_v1(text,text,boolean,text,text,timestamptz,timestamptz,text),
  api_v1.get_overview_v1()
to authenticated;
grant execute on function api_v1.record_integration_status_v1(text,text,text,text,boolean) to service_role;
