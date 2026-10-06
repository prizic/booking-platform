-- Platform Admin completion, part 1: the boundary every later operator RPC uses.
--
-- One function decides whether a caller may act: require_operator_v1. It keeps
-- is_operator_v1's live allow-list + aal2 check and adds an optional recency
-- check read from the JWT's amr timestamps, because an aal2 session that was
-- strong this morning is not consent for suspending a tenant this evening.
--
-- Audit gains outcome, reason and target so a reviewer can answer "who tried
-- what, against what, why, and did it work" without parsing detail blobs. A
-- failed action rolls back its own audit row with the transaction, so refused
-- and failed attempts are written afterwards by record_operator_failure_v1,
-- callable only by someone on the allow-list.
--
-- Create-type actions take an idempotency key; operator_requests remembers the
-- first result so a double-submitted form returns the same tenant rather than a
-- second one.

-- Inspect decoded string values too: JSON escapes tabs/newlines in its textual
-- representation, which otherwise hides a whitespace-separated Bearer value.
create or replace function control_plane.contains_no_secret_v1(p_document jsonb)
returns boolean language sql immutable security definer set search_path = ''
as $$
  select not (p_document::text ~* '(sk_[a-z0-9]|rk_[a-z0-9]|whsec_|ghp_|ghs_|github_pat_|xox[abpr]-|-----BEGIN|eyJ[A-Za-z0-9_-]{10}|Bearer\s)' or exists (
    select 1 from pg_catalog.jsonb_path_query(p_document,'$.**') v(value)
    where pg_catalog.jsonb_typeof(v.value) = 'string'
      and (v.value #>> '{}') ~* '(sk_[a-z0-9]|rk_[a-z0-9]|whsec_|ghp_|ghs_|github_pat_|xox[abpr]-|-----BEGIN|eyJ[A-Za-z0-9_-]{10}|Bearer\s)'));
$$;

-- ---------------------------------------------------------------------------
-- 1. Audit columns
-- ---------------------------------------------------------------------------
alter table control_plane.audit_events
  add column outcome text not null default 'succeeded'
    check (outcome in ('succeeded','failed','denied')),
  add column reason text
    check (reason is null or pg_catalog.char_length(reason) between 1 and 500),
  add column target_kind text
    check (target_kind is null or target_kind ~ '^[a-z][a-z_]{1,40}$'),
  add column target_id text
    check (target_id is null or pg_catalog.char_length(target_id) between 1 and 200);
alter table control_plane.audit_events
  add constraint audit_events_reason_no_secret check (reason is null
    or control_plane.contains_no_secret_v1(pg_catalog.jsonb_build_object('reason',reason)));
alter table control_plane.audit_events
  add constraint audit_events_text_no_secrets check (control_plane.contains_no_secret_v1(
    pg_catalog.jsonb_build_object('action',action,'target_kind',target_kind,'target_id',target_id)));
create index audit_events_recent_idx on control_plane.audit_events (created_at desc, id desc);
create index audit_events_tenant_recent_idx on control_plane.audit_events (tenant_id, created_at desc)
  where tenant_id is not null;
create index audit_events_target_idx on control_plane.audit_events (target_kind, target_id)
  where target_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Who may act, and how recently they proved it
-- ---------------------------------------------------------------------------
create or replace function control_plane.step_up_seconds_v1()
returns integer language sql immutable set search_path = '' as $$ select 900 $$;

-- Seconds since the most recent second-factor verification in this JWT, or
-- null when the token carries none.
create or replace function control_plane.aal2_age_seconds_v1()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (extract(epoch from pg_catalog.statement_timestamp())
          - pg_catalog.max((e.value->>'timestamp')::numeric))::integer
  from pg_catalog.jsonb_array_elements(
    case when pg_catalog.jsonb_typeof(auth.jwt()->'amr') = 'array'
         then auth.jwt()->'amr' else '[]'::jsonb end) e
  where e.value->>'method' in ('totp','webauthn','phone')
    and (e.value->>'timestamp') ~ '^[0-9]{1,10}$';
$$;

create or replace function control_plane.require_operator_v1(
  p_minimum text,
  p_recent_seconds integer default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_age integer;
begin
  if not control_plane.is_operator_v1(p_minimum) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if p_recent_seconds is not null then
    v_age := control_plane.aal2_age_seconds_v1();
    if v_age is null or v_age < 0 or v_age > p_recent_seconds then
      raise exception using errcode='42501',message='recent_authentication_required';
    end if;
  end if;
  return (select private.current_auth_user_id());
end;
$function$;

create or replace function control_plane.write_audit_v1(
  p_operator uuid,
  p_action text,
  p_tenant_id uuid default null,
  p_instance_id uuid default null,
  p_target_kind text default null,
  p_target_id text default null,
  p_reason text default null,
  p_detail jsonb default '{}'::jsonb,
  p_outcome text default 'succeeded'
)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  insert into control_plane.audit_events(
    operator_id,action,tenant_id,instance_id,target_kind,target_id,reason,detail,outcome)
  values (p_operator,p_action,p_tenant_id,p_instance_id,p_target_kind,p_target_id,
    nullif(pg_catalog.btrim(p_reason),''),coalesce(p_detail,'{}'::jsonb),p_outcome)
  returning id;
$$;

-- ---------------------------------------------------------------------------
-- 3. Idempotency ledger for create-type operator actions
-- ---------------------------------------------------------------------------
create table control_plane.operator_requests (
  idempotency_key text not null primary key
    check (idempotency_key ~ '^[A-Za-z0-9:_-]{16,200}$'),
  request_hash text not null,
  action text not null check (action ~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)+$'),
  operator_id uuid not null,
  result jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  check (control_plane.contains_no_secret_v1(result))
);
alter table control_plane.operator_requests enable row level security;
create policy operator_requests_no_application_access on control_plane.operator_requests
  for all to anon,authenticated using (false) with check (false);
revoke all on control_plane.operator_requests from public,anon,authenticated;

-- Returns the remembered result, or null for a new key. The advisory lock makes
-- two simultaneous submissions of one form queue behind each other, so the
-- second sees the first's row instead of racing it.
create or replace function control_plane.replay_request_v1(p_key text, p_action text, p_request jsonb default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_row control_plane.operator_requests%rowtype;
begin
  if not control_plane.contains_no_secret_v1(coalesce(p_request,'{}'::jsonb)) then
    raise exception using errcode='22023',message='secret_rejected';
  end if;
  if p_key is null or p_key !~ '^[A-Za-z0-9:_-]{16,200}$' then
    raise exception using errcode='22023',message='idempotency_key_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key,0));
  select * into v_row from control_plane.operator_requests r where r.idempotency_key = p_key;
  if v_row.idempotency_key is null then
    return null;
  end if;
  if v_row.request_hash is distinct from pg_catalog.encode(extensions.digest(
       pg_catalog.convert_to(coalesce(p_request,'{}'::jsonb)::text,'UTF8'),'sha256'),'hex')
     or v_row.action <> p_action
     or v_row.operator_id is distinct from (select private.current_auth_user_id()) then
    raise exception using errcode='23505',message='idempotency_conflict';
  end if;
  return v_row.result;
end;
$function$;

create or replace function control_plane.remember_request_v1(p_key text, p_action text, p_result jsonb, p_request jsonb default null)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into control_plane.operator_requests(idempotency_key,action,operator_id,result,request_hash)
  values (p_key,p_action,(select private.current_auth_user_id()),coalesce(p_result,'{}'::jsonb),
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce(p_request,'{}'::jsonb)::text,'UTF8'),'sha256'),'hex'));
$$;

-- ---------------------------------------------------------------------------
-- 4. Recording what did not happen
-- ---------------------------------------------------------------------------
create or replace function control_plane.record_operator_failure_v1(
  p_action text,
  p_error_code text,
  p_tenant_id uuid default null,
  p_target_kind text default null,
  p_target_id text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user uuid := (select private.current_auth_user_id());
begin
  -- Anyone on the allow-list, even disabled or at aal1, so refused attempts are
  -- visible; nobody else, so a tenant session cannot write audit noise.
  if v_user is null or not exists (
      select 1 from control_plane.operators o where o.auth_user_id = v_user) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if p_action is null or p_action !~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)+$'
     or p_error_code is null or p_error_code !~ '^[a-z][a-z0-9_]{2,60}$'
     or (p_target_kind is not null and p_target_kind !~ '^[a-z][a-z_]{1,40}$')
     or (p_target_id is not null and p_target_id !~ '^[A-Za-z0-9:_.-]{1,200}$') then
    raise exception using errcode='22023',message='settings_invalid';
  end if;
  perform control_plane.write_audit_v1(v_user,p_action,p_tenant_id,null,p_target_kind,p_target_id,
    null,pg_catalog.jsonb_build_object('error_code',p_error_code),
    case when p_error_code in ('policy_denied','recent_authentication_required')
         then 'denied' else 'failed' end);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. The caller's own standing
-- ---------------------------------------------------------------------------
create or replace function control_plane.get_operator_context_v1()
returns table (operator_id uuid, email text, role text, expires_at timestamptz,
  aal2_age_seconds integer, step_up_seconds integer)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_user uuid;
begin
  v_user := control_plane.require_operator_v1('viewer');
  return query
  select o.auth_user_id, o.email, o.role, o.expires_at,
    control_plane.aal2_age_seconds_v1(), control_plane.step_up_seconds_v1()
  from control_plane.operators o where o.auth_user_id = v_user;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Reading the audit trail
-- ---------------------------------------------------------------------------
-- Detail is already secret-free by constraint; this also keeps unreviewed keys
-- from reaching a screen or a CSV as new actions add them.
create or replace function control_plane.audit_detail_summary_v1(p_detail jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_object_agg(d.key,d.value),'{}'::jsonb)
  from pg_catalog.jsonb_each(coalesce(p_detail,'{}'::jsonb)) d
  where d.key in ('kind','job_id','plan','ring','grant_id','ticket','minutes','expires_at',
    'run_id','steps_reset','state','from','to','role','release','rollout_id','provider',
    'status','error_code','feature_key','granted','hostname','application','targets',
    'blocked','filters','rows','name','brand_key','added','removed','version','channel',
    'flag_key','enabled','job_ids','resources_deactivated');
$$;

-- Unchecked engine shared by list and export; never granted.
create or replace function control_plane.audit_rows_v1(
  p_search text, p_action text, p_tenant_id uuid, p_operator_id uuid, p_outcome text,
  p_from timestamptz, p_to timestamptz, p_limit integer, p_offset integer
)
returns table (event_id uuid, created_at timestamptz, operator_id uuid, operator_email text,
  action text, outcome text, tenant_id uuid, tenant_name text, instance_id uuid,
  target_kind text, target_id text, reason text, detail jsonb, total_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.created_at, e.operator_id, o.email, e.action, e.outcome, e.tenant_id, t.name,
    e.instance_id, e.target_kind, e.target_id, e.reason,
    control_plane.audit_detail_summary_v1(e.detail), pg_catalog.count(*) over ()
  from control_plane.audit_events e
  left join control_plane.operators o on o.auth_user_id = e.operator_id
  left join app.tenants t on t.id = e.tenant_id
  where (p_action is null or e.action = p_action or pg_catalog.left(e.action,pg_catalog.char_length(p_action)+1) = p_action || '.')
    and (p_tenant_id is null or e.tenant_id = p_tenant_id)
    and (p_operator_id is null or e.operator_id = p_operator_id)
    and (p_outcome is null or e.outcome = p_outcome)
    and (p_from is null or e.created_at >= p_from)
    and (p_to is null or e.created_at < p_to)
    and (coalesce(p_search,'') = '' or
      pg_catalog.strpos(pg_catalog.lower(e.action), pg_catalog.lower(p_search)) > 0 or
      pg_catalog.strpos(pg_catalog.lower(coalesce(o.email,'')), pg_catalog.lower(p_search)) > 0 or
      pg_catalog.strpos(pg_catalog.lower(coalesce(t.name,'')), pg_catalog.lower(p_search)) > 0 or
      pg_catalog.strpos(pg_catalog.lower(coalesce(e.target_id,'')), pg_catalog.lower(p_search)) > 0 or
      pg_catalog.strpos(pg_catalog.lower(coalesce(e.reason,'')), pg_catalog.lower(p_search)) > 0)
  order by e.created_at desc, e.id desc
  limit p_limit offset p_offset;
$$;

create or replace function control_plane.list_audit_events_v1(
  p_search text default null, p_action text default null, p_tenant_id uuid default null,
  p_operator_id uuid default null, p_outcome text default null,
  p_from timestamptz default null, p_to timestamptz default null,
  p_limit integer default 50, p_offset integer default 0
)
returns table (event_id uuid, created_at timestamptz, operator_id uuid, operator_email text,
  action text, outcome text, tenant_id uuid, tenant_name text, instance_id uuid,
  target_kind text, target_id text, reason text, detail jsonb, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform control_plane.require_operator_v1('viewer');
  if p_outcome is not null and p_outcome not in ('succeeded','failed','denied') then
    raise exception using errcode='22023',message='settings_invalid';
  end if;
  return query select * from control_plane.audit_rows_v1(
    nullif(pg_catalog.btrim(p_search),''), nullif(pg_catalog.btrim(p_action),''),
    p_tenant_id, p_operator_id, p_outcome, p_from, p_to,
    least(greatest(coalesce(p_limit,50),1),100), greatest(coalesce(p_offset,0),0));
end;
$function$;

create or replace function control_plane.export_audit_events_v1(
  p_search text default null, p_action text default null, p_tenant_id uuid default null,
  p_operator_id uuid default null, p_outcome text default null,
  p_from timestamptz default null, p_to timestamptz default null
)
returns table (event_id uuid, created_at timestamptz, operator_id uuid, operator_email text,
  action text, outcome text, tenant_id uuid, tenant_name text, instance_id uuid,
  target_kind text, target_id text, reason text, detail jsonb, total_count bigint)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_operator uuid;
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if p_outcome is not null and p_outcome not in ('succeeded','failed','denied') then
    raise exception using errcode='22023',message='settings_invalid';
  end if;
  -- Which filters were used, never their values: a search string is whatever an
  -- operator typed, and that is not something to copy into a permanent ledger.
  perform control_plane.write_audit_v1(v_operator,'audit.exported',p_tenant_id,null,null,null,null,
    pg_catalog.jsonb_build_object('filters',pg_catalog.jsonb_build_object(
      'search',p_search is not null,'action',p_action,'tenant',p_tenant_id is not null,
      'operator',p_operator_id is not null,'outcome',p_outcome,
      'from',p_from,'to',p_to)));
  return query select * from control_plane.audit_rows_v1(
    nullif(pg_catalog.btrim(p_search),''), nullif(pg_catalog.btrim(p_action),''),
    p_tenant_id, p_operator_id, p_outcome, p_from, p_to, 5000, 0);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 7. api_v1 pass-throughs and grants
-- ---------------------------------------------------------------------------
create or replace function api_v1.get_operator_context_v1()
returns table (operator_id uuid, email text, role text, expires_at timestamptz,
  aal2_age_seconds integer, step_up_seconds integer)
language sql security definer set search_path to ''
as $$ select * from control_plane.get_operator_context_v1(); $$;

create or replace function api_v1.record_operator_failure_v1(
  p_action text, p_error_code text, p_tenant_id uuid default null,
  p_target_kind text default null, p_target_id text default null)
returns void
language sql security definer set search_path to ''
as $$ select control_plane.record_operator_failure_v1(p_action,p_error_code,p_tenant_id,p_target_kind,p_target_id); $$;

create or replace function api_v1.list_audit_events_v1(
  p_search text default null, p_action text default null, p_tenant_id uuid default null,
  p_operator_id uuid default null, p_outcome text default null,
  p_from timestamptz default null, p_to timestamptz default null,
  p_limit integer default 50, p_offset integer default 0)
returns table (event_id uuid, created_at timestamptz, operator_id uuid, operator_email text,
  action text, outcome text, tenant_id uuid, tenant_name text, instance_id uuid,
  target_kind text, target_id text, reason text, detail jsonb, total_count bigint)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_audit_events_v1(p_search,p_action,p_tenant_id,p_operator_id,p_outcome,p_from,p_to,p_limit,p_offset); $$;

create or replace function api_v1.export_audit_events_v1(
  p_search text default null, p_action text default null, p_tenant_id uuid default null,
  p_operator_id uuid default null, p_outcome text default null,
  p_from timestamptz default null, p_to timestamptz default null)
returns table (event_id uuid, created_at timestamptz, operator_id uuid, operator_email text,
  action text, outcome text, tenant_id uuid, tenant_name text, instance_id uuid,
  target_kind text, target_id text, reason text, detail jsonb, total_count bigint)
language sql security definer set search_path to ''
as $$ select * from control_plane.export_audit_events_v1(p_search,p_action,p_tenant_id,p_operator_id,p_outcome,p_from,p_to); $$;

revoke all on all functions in schema control_plane from public,anon,authenticated;
grant execute on function control_plane.contains_no_secret_v1(jsonb) to service_role;

revoke all on function
  api_v1.get_operator_context_v1(),
  api_v1.record_operator_failure_v1(text,text,uuid,text,text),
  api_v1.list_audit_events_v1(text,text,uuid,uuid,text,timestamptz,timestamptz,integer,integer),
  api_v1.export_audit_events_v1(text,text,uuid,uuid,text,timestamptz,timestamptz)
from public, anon;
grant execute on function
  api_v1.get_operator_context_v1(),
  api_v1.record_operator_failure_v1(text,text,uuid,text,text),
  api_v1.list_audit_events_v1(text,text,uuid,uuid,text,timestamptz,timestamptz,integer,integer),
  api_v1.export_audit_events_v1(text,text,uuid,uuid,text,timestamptz,timestamptz)
to authenticated;
