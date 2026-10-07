-- Platform Admin completion, part 5: releases and rollouts.
--
-- A release is a registered manifest (the same fields release-contracts.mjs
-- validates). A rollout is an intent to move a set of instances to it; starting
-- one changes desired_release and queues one publish_release job per target.
-- Only a worker reporting through report_rollout_target_v1 can say a target
-- succeeded, and only that report changes current_release. A failure pauses the
-- rollout (spec §21.5). Rollback re-targets the previous release and is refused
-- for releases registered as irreversible: code rollback does not undo a
-- destructive migration.

create table control_plane.releases (
  id uuid not null default pg_catalog.gen_random_uuid() primary key,
  version text not null unique check (version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'),
  channel text not null check (channel in ('internal','candidate','stable')),
  git_commit text not null check (git_commit ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'),
  config_schema_version integer not null check (config_schema_version > 0),
  backend_contract_min integer not null check (backend_contract_min > 0),
  backend_contract_max integer not null check (backend_contract_max >= backend_contract_min),
  migration_ids text[] not null default '{}',
  feature_notes text[] not null check (pg_catalog.cardinality(feature_notes) > 0),
  upgrade_notes text[] not null check (pg_catalog.cardinality(upgrade_notes) > 0),
  reversible boolean not null default true,
  status text not null default 'available' check (status in ('available','withdrawn')),
  registered_by uuid not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  updated_at timestamptz not null default pg_catalog.statement_timestamp()
);

alter table control_plane.releases add constraint releases_notes_no_secrets check (
  control_plane.contains_no_secret_v1(pg_catalog.jsonb_build_object('feature_notes',feature_notes,'upgrade_notes',upgrade_notes)));

create table control_plane.rollouts (
  id uuid not null default pg_catalog.gen_random_uuid() primary key,
  release_id uuid not null references control_plane.releases(id) on delete restrict,
  status text not null default 'draft' check (status in (
    'draft','running','paused','completed','failed','cancelled','rolled_back')),
  target_rings text[] not null default '{}',
  reason text not null check (pg_catalog.char_length(reason) between 5 and 500),
  created_by uuid not null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  updated_at timestamptz not null default pg_catalog.statement_timestamp()
);

alter table control_plane.rollouts add constraint rollouts_reason_no_secrets check (
  control_plane.contains_no_secret_v1(pg_catalog.jsonb_build_object('reason',reason)));

create table control_plane.rollout_targets (
  rollout_id uuid not null references control_plane.rollouts(id) on delete restrict,
  tenant_id uuid not null,
  instance_id uuid not null,
  ring text,
  from_release text,
  status text not null default 'pending' check (status in (
    'pending','queued','succeeded','failed','skipped','cancelled','rollback_queued','rolled_back')),
  job_id uuid references control_plane.jobs(id) on delete restrict,
  attempts integer not null default 0,
  error_code text check (error_code is null or error_code ~ '^[a-z][a-z0-9_]{2,60}$'),
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  primary key (rollout_id, instance_id),
  foreign key (tenant_id,instance_id) references app.instances(tenant_id,id) on delete restrict
);
create index rollout_targets_job_idx on control_plane.rollout_targets (job_id);

do $rls$
declare t text;
begin
  foreach t in array array['releases','rollouts','rollout_targets'] loop
    execute format('alter table control_plane.%I enable row level security',t);
    execute format('create policy %I on control_plane.%I for all to anon,authenticated using (false) with check (false)',t||'_no_application_access',t);
    execute format('revoke all on control_plane.%I from public,anon,authenticated',t);
  end loop;
end;
$rls$;

-- Fleet-level blockers for a release, read now rather than remembered.
create or replace function control_plane.release_prerequisites_v1(p_release_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_release control_plane.releases%rowtype;
  v_blocked text[] := '{}'::text[];
  v_missing boolean;
begin
  select * into v_release from control_plane.releases r where r.id = p_release_id;
  if v_release.status = 'withdrawn' then
    v_blocked := v_blocked || 'release_withdrawn'::text;
  end if;
  if control_plane.backend_contract_version_v1()
     not between v_release.backend_contract_min and v_release.backend_contract_max then
    v_blocked := v_blocked || 'backend_contract_incompatible'::text;
  end if;
  if pg_catalog.cardinality(v_release.migration_ids) > 0 then
    if pg_catalog.to_regclass('supabase_migrations.schema_migrations') is null then
      v_blocked := v_blocked || 'migration_state_unknown'::text;
    else
      execute 'select exists (select 1 from pg_catalog.unnest($1) m
               where not exists (select 1 from supabase_migrations.schema_migrations s
                                 where s.version = pg_catalog.left(m,14)))'
      into v_missing using v_release.migration_ids;
      if v_missing then
        v_blocked := v_blocked || 'migrations_missing'::text;
      end if;
    end if;
  end if;
  return v_blocked;
end;
$function$;

create or replace function control_plane.register_release_v1(
  p_version text, p_channel text, p_git_commit text, p_config_schema_version integer,
  p_backend_min integer, p_backend_max integer, p_migration_ids text[],
  p_feature_notes text[], p_upgrade_notes text[], p_reversible boolean, p_idempotency_key text)
returns table (release_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_prior jsonb;
  v_request jsonb := pg_catalog.jsonb_build_object('version',p_version,'channel',p_channel,'git_commit',p_git_commit,'config_schema_version',p_config_schema_version,'backend_min',p_backend_min,'backend_max',p_backend_max,'migration_ids',coalesce(p_migration_ids,'{}'),'feature_notes',p_feature_notes,'upgrade_notes',p_upgrade_notes,'reversible',coalesce(p_reversible,true));
  v_id uuid;
begin
  v_operator := control_plane.require_operator_v1('admin');
  v_prior := control_plane.replay_request_v1(p_idempotency_key,'release.register',v_request);
  if v_prior is not null then
    return query select (v_prior->>'release_id')::uuid;
    return;
  end if;
  if p_version is null or p_version !~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
     or p_channel is null or p_channel not in ('internal','candidate','stable')
     or p_git_commit is null or p_git_commit !~ '^([0-9a-f]{40}|[0-9a-f]{64})$'
     or coalesce(p_config_schema_version,0) <= 0
     or coalesce(p_backend_min,0) <= 0 or coalesce(p_backend_max,0) < coalesce(p_backend_min,1)
     or exists (select 1 from pg_catalog.unnest(coalesce(p_migration_ids,'{}')) m
                where m is null or m !~ '^[0-9]{14}_[a-z0-9]+(_[a-z0-9]+)*$')
     or pg_catalog.cardinality(coalesce(p_feature_notes,'{}')) = 0
     or pg_catalog.cardinality(coalesce(p_upgrade_notes,'{}')) = 0
     or exists (select 1 from pg_catalog.unnest(p_feature_notes || p_upgrade_notes) n
                where n is null or pg_catalog.btrim(n) = '' or pg_catalog.char_length(n) > 500) then
    raise exception using errcode='22023',message='release_invalid';
  end if;
  if not control_plane.contains_no_secret_v1(pg_catalog.jsonb_build_object(
      'feature_notes',p_feature_notes,'upgrade_notes',p_upgrade_notes)) then
    raise exception using errcode='22023',message='secret_rejected';
  end if;
  if exists (select 1 from control_plane.releases r where r.version = p_version) then
    raise exception using errcode='23505',message='release_exists';
  end if;
  insert into control_plane.releases(version,channel,git_commit,config_schema_version,
    backend_contract_min,backend_contract_max,migration_ids,feature_notes,upgrade_notes,
    reversible,registered_by)
  values (p_version,p_channel,p_git_commit,p_config_schema_version,p_backend_min,p_backend_max,
    coalesce(p_migration_ids,'{}'),p_feature_notes,p_upgrade_notes,coalesce(p_reversible,true),v_operator)
  returning id into v_id;
  perform control_plane.write_audit_v1(v_operator,'release.registered',null,null,'release',v_id::text,null,
    pg_catalog.jsonb_build_object('version',p_version,'channel',p_channel));
  perform control_plane.remember_request_v1(p_idempotency_key,'release.register',
    pg_catalog.jsonb_build_object('release_id',v_id),v_request);
  return query select v_id;
end;
$function$;

create or replace function control_plane.set_release_status_v1(p_release_id uuid, p_status text, p_reason text)
returns table (release_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_release control_plane.releases%rowtype;
begin
  v_operator := control_plane.require_operator_v1('admin');
  if p_status not in ('available','withdrawn') then
    raise exception using errcode='22023',message='settings_invalid';
  end if;
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  select * into v_release from control_plane.releases r where r.id = p_release_id for update;
  if v_release.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  update control_plane.releases r set status = p_status, updated_at = pg_catalog.statement_timestamp()
  where r.id = p_release_id;
  perform control_plane.write_audit_v1(v_operator,'release.status_changed',null,null,'release',
    p_release_id::text,p_reason,pg_catalog.jsonb_build_object('version',v_release.version,
      'from',v_release.status,'to',p_status));
  return query select p_release_id, p_status;
end;
$function$;

create or replace function control_plane.list_releases_v1(
  p_channel text default null, p_status text default null,
  p_limit integer default 25, p_offset integer default 0)
returns table (release_id uuid, version text, channel text, git_commit text, config_schema_version integer,
  backend_contract_min integer, backend_contract_max integer, migration_ids text[], reversible boolean,
  status text, instances_desired bigint, instances_current bigint, rollouts bigint,
  prerequisites text[], created_at timestamptz, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  select r.id, r.version, r.channel, r.git_commit, r.config_schema_version, r.backend_contract_min,
    r.backend_contract_max, r.migration_ids, r.reversible, r.status,
    (select pg_catalog.count(*) from control_plane.instance_release_state s where s.desired_release = r.version),
    (select pg_catalog.count(*) from control_plane.instance_release_state s where s.current_release = r.version),
    (select pg_catalog.count(*) from control_plane.rollouts o where o.release_id = r.id),
    control_plane.release_prerequisites_v1(r.id), r.created_at, pg_catalog.count(*) over ()
  from control_plane.releases r
  where (p_channel is null or r.channel = p_channel) and (p_status is null or r.status = p_status)
  order by pg_catalog.string_to_array(r.version,'.')::int[] desc
  limit least(greatest(coalesce(p_limit,25),1),100) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function control_plane.get_release_v1(p_release_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_doc jsonb;
begin
  perform control_plane.require_operator_v1('viewer');
  select pg_catalog.to_jsonb(r) - 'registered_by'
    || pg_catalog.jsonb_build_object(
      'registered_by_email',o.email,
      'prerequisites',pg_catalog.to_jsonb(control_plane.release_prerequisites_v1(r.id)),
      'backend_contract_version',control_plane.backend_contract_version_v1(),
      'versions',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'instance_id',s.instance_id,'tenant_id',s.tenant_id,'tenant_name',t.name,
          'desired_release',s.desired_release,'current_release',s.current_release,
          'config_schema_version',s.config_schema_version,'reported_at',s.reported_at) order by t.name)
        from control_plane.instance_release_state s join app.tenants t on t.id = s.tenant_id
        where s.desired_release = r.version or s.current_release = r.version),'[]'::jsonb),
      'rollouts',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'id',x.id,'status',x.status,'target_rings',x.target_rings,'created_at',x.created_at)
          order by x.created_at desc)
        from control_plane.rollouts x where x.release_id = r.id),'[]'::jsonb))
  into v_doc
  from control_plane.releases r
  left join control_plane.operators o on o.auth_user_id = r.registered_by
  where r.id = p_release_id;
  if v_doc is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  return v_doc;
end;
$function$;

create or replace function control_plane.create_rollout_v1(
  p_release_id uuid, p_rings text[], p_instance_ids uuid[], p_reason text, p_idempotency_key text)
returns table (rollout_id uuid, targets integer, skipped integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_prior jsonb;
  v_request jsonb := pg_catalog.jsonb_build_object('release_id',p_release_id,'rings',(select coalesce(pg_catalog.jsonb_agg(distinct x order by x),'[]'::jsonb) from pg_catalog.unnest(p_rings) x),'instance_ids',(select coalesce(pg_catalog.jsonb_agg(distinct x order by x),'[]'::jsonb) from pg_catalog.unnest(p_instance_ids) x),'reason',pg_catalog.btrim(p_reason));
  v_release control_plane.releases%rowtype;
  v_id uuid;
  v_targets integer;
  v_skipped integer;
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  v_prior := control_plane.replay_request_v1(p_idempotency_key,'rollout.create',v_request);
  if v_prior is not null then
    return query select (v_prior->>'rollout_id')::uuid,(v_prior->>'targets')::integer,(v_prior->>'skipped')::integer;
    return;
  end if;
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  if exists (select 1 from pg_catalog.unnest(coalesce(p_rings,'{}')) g where g not in ('canary','early','general')) then
    raise exception using errcode='22023',message='settings_invalid';
  end if;
  select * into v_release from control_plane.releases r where r.id = p_release_id;
  if v_release.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;

  insert into control_plane.rollouts(release_id,target_rings,reason,created_by)
  values (p_release_id,coalesce(p_rings,'{}'),pg_catalog.btrim(p_reason),v_operator)
  returning id into v_id;

  -- Active instances in the chosen rings or explicitly named, not already on
  -- this release. Ineligible ones are recorded as skipped with a reason, so the
  -- operator sees why an instance was left out rather than not seeing it.
  insert into control_plane.rollout_targets(rollout_id,tenant_id,instance_id,ring,from_release,status,error_code)
  select v_id, i.tenant_id, i.id, s.rollout_ring, rs.current_release,
    case when rs.config_schema_version > v_release.config_schema_version then 'skipped'
         when exists (select 1 from control_plane.rollout_targets ot
                      join control_plane.rollouts o on o.id = ot.rollout_id
                      where ot.instance_id = i.id and o.status in ('running','paused')
                        and ot.status in ('pending','queued')) then 'skipped'
         else 'pending' end,
    case when rs.config_schema_version > v_release.config_schema_version then 'config_schema_regression'
         when exists (select 1 from control_plane.rollout_targets ot
                      join control_plane.rollouts o on o.id = ot.rollout_id
                      where ot.instance_id = i.id and o.status in ('running','paused')
                        and ot.status in ('pending','queued')) then 'rollout_in_progress' end
  from app.instances i
  left join control_plane.subscriptions s on s.tenant_id = i.tenant_id
  left join control_plane.instance_release_state rs on rs.tenant_id = i.tenant_id and rs.instance_id = i.id
  where i.deployment_state = 'active'
    and rs.current_release is distinct from v_release.version
    and (s.rollout_ring = any(coalesce(p_rings,'{}')) or i.id = any(coalesce(p_instance_ids,'{}')));

  select pg_catalog.count(*) filter (where t.status = 'pending'),
         pg_catalog.count(*) filter (where t.status = 'skipped')
  into v_targets, v_skipped
  from control_plane.rollout_targets t where t.rollout_id = v_id;
  if v_targets = 0 then
    raise exception using errcode='22023',message='no_targets';
  end if;

  perform control_plane.write_audit_v1(v_operator,'rollout.created',null,null,'rollout',v_id::text,p_reason,
    pg_catalog.jsonb_build_object('version',v_release.version,'targets',v_targets,'rows',v_skipped));
  perform control_plane.remember_request_v1(p_idempotency_key,'rollout.create',
    pg_catalog.jsonb_build_object('rollout_id',v_id,'targets',v_targets,'skipped',v_skipped),v_request);
  return query select v_id, v_targets, v_skipped;
end;
$function$;

-- Queues every pending target. Shared by start, resume and retry.
create or replace function control_plane.queue_rollout_targets_v1(p_rollout_id uuid, p_operator uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_release control_plane.releases%rowtype;
  v_target record;
  v_job uuid;
  v_count integer := 0;
  v_rollback boolean;
begin
  for v_target in
    select t.* from control_plane.rollout_targets t
    where t.rollout_id = p_rollout_id and t.status = 'pending' for update
  loop
    select coalesce((j.parameters->>'rollback')::boolean,false) into v_rollback
    from control_plane.jobs j where j.id = v_target.job_id;
    v_rollback := coalesce(v_rollback,false);
    select r.* into v_release from control_plane.releases r
    join control_plane.rollouts o on o.id = p_rollout_id
    where (not v_rollback and r.id = o.release_id)
       or (v_rollback and r.version = v_target.from_release);
    insert into control_plane.instance_release_state(tenant_id,instance_id,desired_release,config_schema_version)
    values (v_target.tenant_id,v_target.instance_id,v_release.version,v_release.config_schema_version)
    on conflict (tenant_id,instance_id) do update
      set desired_release = excluded.desired_release, updated_at = pg_catalog.statement_timestamp();
    v_job := control_plane.enqueue_operator_job_v1(p_operator,'publish_release',v_target.tenant_id,
      v_target.instance_id,pg_catalog.jsonb_build_object('rollout_id',p_rollout_id,
        'release',v_release.version,'git_commit',v_release.git_commit,'rollback',v_rollback),
      case when v_rollback then 'rollback:' else 'rollout:' end || p_rollout_id::text || ':' || v_target.instance_id::text || ':' || (v_target.attempts + 1)::text);
    update control_plane.rollout_targets t set status = case when v_rollback then 'rollback_queued' else 'queued' end, job_id = v_job,
      attempts = t.attempts + 1, error_code = null, updated_at = pg_catalog.statement_timestamp()
    where t.rollout_id = p_rollout_id and t.instance_id = v_target.instance_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

-- Un-queues targets whose job no worker has claimed yet; claimed work finishes.
create or replace function control_plane.unqueue_rollout_targets_v1(
  p_rollout_id uuid, p_operator uuid, p_target_status text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_target record;
  v_count integer := 0;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  for v_target in
    select t.* from control_plane.rollout_targets t
    join control_plane.jobs j on j.id = t.job_id
    where t.rollout_id = p_rollout_id and t.status in ('queued','rollback_queued') and j.status = 'queued'
    for update of t
  loop
    update control_plane.jobs j set status = 'cancelled', cancelled_by = p_operator,
      cancelled_at = v_now, updated_at = v_now where j.id = v_target.job_id;
    insert into control_plane.job_events(job_id,event,actor_id) values (v_target.job_id,'cancelled',p_operator);
    update control_plane.instance_release_state s set desired_release = v_target.from_release, updated_at = v_now
    where s.tenant_id = v_target.tenant_id and s.instance_id = v_target.instance_id;
    update control_plane.rollout_targets t set status = p_target_status, updated_at = v_now
    where t.rollout_id = p_rollout_id and t.instance_id = v_target.instance_id;
    v_count := v_count + 1;
  end loop;
  if p_target_status = 'cancelled' then
    update control_plane.rollout_targets t set status = 'cancelled', updated_at = v_now
    where t.rollout_id = p_rollout_id and t.status = 'pending';
  end if;
  return v_count;
end;
$function$;

create or replace function control_plane.start_rollout_v1(p_rollout_id uuid)
returns table (rollout_id uuid, status text, blocked text[], queued integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_rollout control_plane.rollouts%rowtype;
  v_blocked text[];
  v_queued integer;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  select * into v_rollout from control_plane.rollouts o where o.id = p_rollout_id for update;
  if v_rollout.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if v_rollout.status not in ('draft','paused') then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  v_blocked := control_plane.release_prerequisites_v1(v_rollout.release_id);
  if pg_catalog.cardinality(v_blocked) > 0 then
    perform control_plane.write_audit_v1(v_operator,'rollout.started',null,null,'rollout',
      p_rollout_id::text,null,pg_catalog.jsonb_build_object('blocked',pg_catalog.to_jsonb(v_blocked)),'failed');
    return query select p_rollout_id, v_rollout.status, v_blocked, 0;
    return;
  end if;
  update control_plane.rollouts o set status = 'running', started_at = coalesce(o.started_at,v_now),
    updated_at = v_now where o.id = p_rollout_id;
  v_queued := control_plane.queue_rollout_targets_v1(p_rollout_id,v_operator);
  perform control_plane.write_audit_v1(v_operator,
    case when v_rollout.status = 'draft' then 'rollout.started' else 'rollout.resumed' end,
    null,null,'rollout',p_rollout_id::text,null,pg_catalog.jsonb_build_object('targets',v_queued));
  return query select p_rollout_id,'running'::text,'{}'::text[],v_queued;
end;
$function$;

create or replace function control_plane.pause_rollout_v1(p_rollout_id uuid, p_reason text)
returns table (rollout_id uuid, status text, unqueued integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_rollout control_plane.rollouts%rowtype;
  v_count integer;
begin
  v_operator := control_plane.require_operator_v1('operator');
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  select * into v_rollout from control_plane.rollouts o where o.id = p_rollout_id for update;
  if v_rollout.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if v_rollout.status <> 'running' then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  v_count := control_plane.unqueue_rollout_targets_v1(p_rollout_id,v_operator,'pending');
  update control_plane.rollouts o set status = 'paused', updated_at = pg_catalog.statement_timestamp()
  where o.id = p_rollout_id;
  perform control_plane.write_audit_v1(v_operator,'rollout.paused',null,null,'rollout',
    p_rollout_id::text,p_reason,pg_catalog.jsonb_build_object('targets',v_count));
  return query select p_rollout_id,'paused'::text,v_count;
end;
$function$;

create or replace function control_plane.cancel_rollout_v1(p_rollout_id uuid, p_reason text)
returns table (rollout_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_rollout control_plane.rollouts%rowtype;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_operator := control_plane.require_operator_v1('admin');
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  select * into v_rollout from control_plane.rollouts o where o.id = p_rollout_id for update;
  if v_rollout.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if v_rollout.status not in ('draft','running','paused') then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  perform control_plane.unqueue_rollout_targets_v1(p_rollout_id,v_operator,'cancelled');
  update control_plane.rollouts o set status = 'cancelled', finished_at = v_now, updated_at = v_now
  where o.id = p_rollout_id;
  perform control_plane.write_audit_v1(v_operator,'rollout.cancelled',null,null,'rollout',
    p_rollout_id::text,p_reason,pg_catalog.jsonb_build_object('from',v_rollout.status));
  return query select p_rollout_id,'cancelled'::text;
end;
$function$;

create or replace function control_plane.retry_rollout_targets_v1(p_rollout_id uuid)
returns table (rollout_id uuid, retried integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_rollout control_plane.rollouts%rowtype;
  v_count integer;
begin
  v_operator := control_plane.require_operator_v1('operator');
  select * into v_rollout from control_plane.rollouts o where o.id = p_rollout_id for update;
  if v_rollout.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if v_rollout.status not in ('running','paused','failed')
     or not exists (select 1 from control_plane.rollout_targets t
                    where t.rollout_id = p_rollout_id and t.status = 'failed') then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  update control_plane.rollout_targets t set status = 'pending', updated_at = pg_catalog.statement_timestamp()
  where t.rollout_id = p_rollout_id and t.status = 'failed';
  update control_plane.rollouts o set status = 'running', updated_at = pg_catalog.statement_timestamp()
  where o.id = p_rollout_id;
  v_count := control_plane.queue_rollout_targets_v1(p_rollout_id,v_operator);
  perform control_plane.write_audit_v1(v_operator,'rollout.retried',null,null,'rollout',
    p_rollout_id::text,null,pg_catalog.jsonb_build_object('targets',v_count));
  return query select p_rollout_id, v_count;
end;
$function$;

create or replace function control_plane.rollback_rollout_v1(p_rollout_id uuid, p_reason text)
returns table (rollout_id uuid, status text, targets integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_rollout control_plane.rollouts%rowtype;
  v_release control_plane.releases%rowtype;
  v_target record;
  v_previous control_plane.releases%rowtype;
  v_job uuid;
  v_count integer := 0;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 10 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  select * into v_rollout from control_plane.rollouts o where o.id = p_rollout_id for update;
  if v_rollout.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  select * into v_release from control_plane.releases r where r.id = v_rollout.release_id;
  if not v_release.reversible then
    raise exception using errcode='22023',message='rollback_not_supported';
  end if;
  if v_rollout.status not in ('running','paused','completed','failed') then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;

  if exists (select 1 from control_plane.rollout_targets t join control_plane.jobs j on j.id=t.job_id
      where t.rollout_id=p_rollout_id and j.status='running') then
    raise exception using errcode='22023',message='job_running';
  end if;
  if exists (select 1 from control_plane.rollout_targets t
      left join control_plane.releases r on r.version=t.from_release
      where t.rollout_id=p_rollout_id and t.status in ('succeeded','failed')
        and (r.id is null or pg_catalog.cardinality(control_plane.release_prerequisites_v1(r.id)) > 0)) then
    raise exception using errcode='22023',message='rollback_not_supported';
  end if;
  perform control_plane.unqueue_rollout_targets_v1(p_rollout_id,v_operator,'cancelled');
  for v_target in
    select t.* from control_plane.rollout_targets t
    where t.rollout_id = p_rollout_id and t.status in ('succeeded','failed') for update
  loop
    select * into v_previous from control_plane.releases r where r.version = v_target.from_release;
    if v_previous.id is null
       or control_plane.backend_contract_version_v1()
          not between v_previous.backend_contract_min and v_previous.backend_contract_max then
      update control_plane.rollout_targets t set error_code = 'previous_release_unknown', updated_at = v_now
      where t.rollout_id = p_rollout_id and t.instance_id = v_target.instance_id;
      continue;
    end if;
    update control_plane.instance_release_state s set desired_release = v_previous.version, updated_at = v_now
    where s.tenant_id = v_target.tenant_id and s.instance_id = v_target.instance_id;
    v_job := control_plane.enqueue_operator_job_v1(v_operator,'publish_release',v_target.tenant_id,
      v_target.instance_id,pg_catalog.jsonb_build_object('rollout_id',p_rollout_id,
        'release',v_previous.version,'git_commit',v_previous.git_commit,'rollback',true),
      'rollback:' || p_rollout_id::text || ':' || v_target.instance_id::text || ':' || (v_target.attempts+1)::text);
    update control_plane.rollout_targets t set status = 'rollback_queued', job_id = v_job, attempts = t.attempts+1, updated_at = v_now
    where t.rollout_id = p_rollout_id and t.instance_id = v_target.instance_id;
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception using errcode='22023',message='rollback_not_supported';
  end if;
  update control_plane.rollouts o set status = 'running', finished_at = null, updated_at = v_now
  where o.id = p_rollout_id;
  perform control_plane.write_audit_v1(v_operator,'rollout.rollback_requested',null,null,'rollout',
    p_rollout_id::text,p_reason,pg_catalog.jsonb_build_object('version',v_release.version,'targets',v_count));
  return query select p_rollout_id,'running'::text,v_count;
end;
$function$;

-- The worker's report. The only path that sets current_release.
create or replace function control_plane.report_rollout_target_v1(
  p_job_id uuid, p_outcome text, p_error_code text, p_observed_release text)
returns table (target_status text, rollout_status text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_target control_plane.rollout_targets%rowtype;
  v_job control_plane.jobs%rowtype;
  v_rollout control_plane.rollouts%rowtype;
  v_status text;
  v_rollout_status text;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  if not control_plane.is_worker_v1() then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  select * into v_target from control_plane.rollout_targets t where t.job_id = p_job_id;
  if v_target.rollout_id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  select * into v_rollout from control_plane.rollouts o where o.id = v_target.rollout_id for update;
  select * into v_target from control_plane.rollout_targets t where t.job_id = p_job_id for update;
  select * into v_job from control_plane.jobs j where j.id = p_job_id for update;
  if v_target.status not in ('queued','rollback_queued')
     or (p_outcome = 'succeeded' and p_observed_release is distinct from v_job.parameters->>'release') then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  perform control_plane.complete_job_v1(p_job_id,p_outcome,p_error_code);


  v_status := case
    when p_outcome = 'succeeded' and v_target.status = 'rollback_queued' then 'rolled_back'
    when p_outcome = 'succeeded' then 'succeeded'
    else 'failed' end;
  update control_plane.rollout_targets t set status = v_status,
    error_code = case when p_outcome = 'failed' then coalesce(p_error_code,'unknown_error') end,
    updated_at = v_now
  where t.rollout_id = v_target.rollout_id and t.instance_id = v_target.instance_id;
  if p_outcome = 'succeeded' and p_observed_release is not null then
    update control_plane.instance_release_state s set current_release = p_observed_release,
      reported_at = v_now, updated_at = v_now
    where s.tenant_id = v_target.tenant_id and s.instance_id = v_target.instance_id;
  end if;

  v_rollout_status := v_rollout.status;
  if v_rollout.status = 'running' and v_status = 'failed' then
    perform control_plane.unqueue_rollout_targets_v1(v_rollout.id,null,'pending');
    v_rollout_status := 'paused';
  elsif v_rollout.status = 'running' and not exists (
      select 1 from control_plane.rollout_targets t
      where t.rollout_id = v_rollout.id and t.status in ('pending','queued','rollback_queued','failed')) then
    v_rollout_status := case when exists (select 1 from control_plane.rollout_targets t
      where t.rollout_id=v_rollout.id and t.status='rolled_back') then 'rolled_back' else 'completed' end;
  end if;
  update control_plane.rollouts o set status = v_rollout_status,
    finished_at = case when v_rollout_status in ('completed','rolled_back') then v_now else o.finished_at end,
    updated_at = v_now
  where o.id = v_rollout.id;
  return query select v_status, v_rollout_status;
end;
$function$;

create or replace function control_plane.list_rollouts_v1(
  p_status text default null, p_release_id uuid default null,
  p_limit integer default 25, p_offset integer default 0)
returns table (rollout_id uuid, release_id uuid, version text, status text, target_rings text[],
  reason text, created_by_email text, targets_total bigint, targets_succeeded bigint,
  targets_failed bigint, targets_queued bigint, targets_skipped bigint,
  started_at timestamptz, finished_at timestamptz, created_at timestamptz, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  select o.id, o.release_id, r.version, o.status, o.target_rings, o.reason, op.email,
    (select pg_catalog.count(*) from control_plane.rollout_targets t where t.rollout_id = o.id),
    (select pg_catalog.count(*) from control_plane.rollout_targets t where t.rollout_id = o.id and t.status in ('succeeded','rolled_back')),
    (select pg_catalog.count(*) from control_plane.rollout_targets t where t.rollout_id = o.id and t.status = 'failed'),
    (select pg_catalog.count(*) from control_plane.rollout_targets t where t.rollout_id = o.id and t.status in ('queued','rollback_queued')),
    (select pg_catalog.count(*) from control_plane.rollout_targets t where t.rollout_id = o.id and t.status in ('skipped','cancelled')),
    o.started_at, o.finished_at, o.created_at, pg_catalog.count(*) over ()
  from control_plane.rollouts o
  join control_plane.releases r on r.id = o.release_id
  left join control_plane.operators op on op.auth_user_id = o.created_by
  where (p_status is null or o.status = p_status) and (p_release_id is null or o.release_id = p_release_id)
  order by o.created_at desc, o.id
  limit least(greatest(coalesce(p_limit,25),1),100) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function control_plane.get_rollout_v1(p_rollout_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_doc jsonb;
begin
  perform control_plane.require_operator_v1('viewer');
  select pg_catalog.jsonb_build_object(
    'id',o.id,'status',o.status,'target_rings',o.target_rings,'reason',o.reason,
    'created_by_email',op.email,'started_at',o.started_at,'finished_at',o.finished_at,
    'created_at',o.created_at,'updated_at',o.updated_at,
    'release',pg_catalog.jsonb_build_object('id',r.id,'version',r.version,'channel',r.channel,
      'reversible',r.reversible,'status',r.status),
    'blocked',pg_catalog.to_jsonb(control_plane.release_prerequisites_v1(r.id)),
    'counts',(select coalesce(pg_catalog.jsonb_object_agg(c.status,c.n),'{}'::jsonb)
      from (select t.status, pg_catalog.count(*) n from control_plane.rollout_targets t
            where t.rollout_id = o.id group by t.status) c),
    'targets',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'instance_id',t.instance_id,'tenant_id',t.tenant_id,'tenant_name',tn.name,'ring',t.ring,
        'from_release',t.from_release,'status',t.status,'attempts',t.attempts,'error_code',t.error_code,
        'job_id',t.job_id,'job_status',j.status,'current_release',s.current_release,
        'reported_at',s.reported_at,'updated_at',t.updated_at) order by tn.name)
      from control_plane.rollout_targets t
      join app.tenants tn on tn.id = t.tenant_id
      left join control_plane.jobs j on j.id = t.job_id
      left join control_plane.instance_release_state s on s.tenant_id = t.tenant_id and s.instance_id = t.instance_id
      where t.rollout_id = o.id),'[]'::jsonb),
    'history',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) - 'total_count')
      from (select * from control_plane.audit_rows_v1(null,'rollout',null,null,null,null,null,100,0) x
            where x.target_id = o.id::text) a),'[]'::jsonb))
  into v_doc
  from control_plane.rollouts o
  join control_plane.releases r on r.id = o.release_id
  left join control_plane.operators op on op.auth_user_id = o.created_by
  where o.id = p_rollout_id;
  if v_doc is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  return v_doc;
end;
$function$;

-- api_v1 pass-throughs
create or replace function api_v1.register_release_v1(p_version text, p_channel text, p_git_commit text,
  p_config_schema_version integer, p_backend_min integer, p_backend_max integer, p_migration_ids text[],
  p_feature_notes text[], p_upgrade_notes text[], p_reversible boolean, p_idempotency_key text)
returns table (release_id uuid)
language sql security definer set search_path to ''
as $$ select * from control_plane.register_release_v1(p_version,p_channel,p_git_commit,p_config_schema_version,p_backend_min,p_backend_max,p_migration_ids,p_feature_notes,p_upgrade_notes,p_reversible,p_idempotency_key); $$;

create or replace function api_v1.set_release_status_v1(p_release_id uuid, p_status text, p_reason text)
returns table (release_id uuid, status text)
language sql security definer set search_path to ''
as $$ select * from control_plane.set_release_status_v1(p_release_id,p_status,p_reason); $$;

create or replace function api_v1.list_releases_v1(p_channel text default null, p_status text default null,
  p_limit integer default 25, p_offset integer default 0)
returns table (release_id uuid, version text, channel text, git_commit text, config_schema_version integer,
  backend_contract_min integer, backend_contract_max integer, migration_ids text[], reversible boolean,
  status text, instances_desired bigint, instances_current bigint, rollouts bigint,
  prerequisites text[], created_at timestamptz, total_count bigint)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_releases_v1(p_channel,p_status,p_limit,p_offset); $$;

create or replace function api_v1.get_release_v1(p_release_id uuid) returns jsonb
language sql security definer set search_path to ''
as $$ select control_plane.get_release_v1(p_release_id); $$;

create or replace function api_v1.create_rollout_v1(p_release_id uuid, p_rings text[], p_instance_ids uuid[],
  p_reason text, p_idempotency_key text)
returns table (rollout_id uuid, targets integer, skipped integer)
language sql security definer set search_path to ''
as $$ select * from control_plane.create_rollout_v1(p_release_id,p_rings,p_instance_ids,p_reason,p_idempotency_key); $$;

create or replace function api_v1.start_rollout_v1(p_rollout_id uuid)
returns table (rollout_id uuid, status text, blocked text[], queued integer)
language sql security definer set search_path to ''
as $$ select * from control_plane.start_rollout_v1(p_rollout_id); $$;

create or replace function api_v1.pause_rollout_v1(p_rollout_id uuid, p_reason text)
returns table (rollout_id uuid, status text, unqueued integer)
language sql security definer set search_path to ''
as $$ select * from control_plane.pause_rollout_v1(p_rollout_id,p_reason); $$;

create or replace function api_v1.cancel_rollout_v1(p_rollout_id uuid, p_reason text)
returns table (rollout_id uuid, status text)
language sql security definer set search_path to ''
as $$ select * from control_plane.cancel_rollout_v1(p_rollout_id,p_reason); $$;

create or replace function api_v1.retry_rollout_targets_v1(p_rollout_id uuid)
returns table (rollout_id uuid, retried integer)
language sql security definer set search_path to ''
as $$ select * from control_plane.retry_rollout_targets_v1(p_rollout_id); $$;

create or replace function api_v1.rollback_rollout_v1(p_rollout_id uuid, p_reason text)
returns table (rollout_id uuid, status text, targets integer)
language sql security definer set search_path to ''
as $$ select * from control_plane.rollback_rollout_v1(p_rollout_id,p_reason); $$;

create or replace function api_v1.list_rollouts_v1(p_status text default null, p_release_id uuid default null,
  p_limit integer default 25, p_offset integer default 0)
returns table (rollout_id uuid, release_id uuid, version text, status text, target_rings text[],
  reason text, created_by_email text, targets_total bigint, targets_succeeded bigint,
  targets_failed bigint, targets_queued bigint, targets_skipped bigint,
  started_at timestamptz, finished_at timestamptz, created_at timestamptz, total_count bigint)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_rollouts_v1(p_status,p_release_id,p_limit,p_offset); $$;

create or replace function api_v1.get_rollout_v1(p_rollout_id uuid) returns jsonb
language sql security definer set search_path to ''
as $$ select control_plane.get_rollout_v1(p_rollout_id); $$;

create or replace function api_v1.report_rollout_target_v1(p_job_id uuid, p_outcome text,
  p_error_code text, p_observed_release text)
returns table (target_status text, rollout_status text)
language sql security definer set search_path to ''
as $$ select * from control_plane.report_rollout_target_v1(p_job_id,p_outcome,p_error_code,p_observed_release); $$;

revoke all on all functions in schema control_plane from public,anon,authenticated;
grant execute on function control_plane.contains_no_secret_v1(jsonb) to service_role;

revoke all on function
  api_v1.register_release_v1(text,text,text,integer,integer,integer,text[],text[],text[],boolean,text),
  api_v1.set_release_status_v1(uuid,text,text),
  api_v1.list_releases_v1(text,text,integer,integer),
  api_v1.get_release_v1(uuid),
  api_v1.create_rollout_v1(uuid,text[],uuid[],text,text),
  api_v1.start_rollout_v1(uuid),
  api_v1.pause_rollout_v1(uuid,text),
  api_v1.cancel_rollout_v1(uuid,text),
  api_v1.retry_rollout_targets_v1(uuid),
  api_v1.rollback_rollout_v1(uuid,text),
  api_v1.list_rollouts_v1(text,uuid,integer,integer),
  api_v1.get_rollout_v1(uuid),
  api_v1.report_rollout_target_v1(uuid,text,text,text)
from public, anon, authenticated;
grant execute on function
  api_v1.register_release_v1(text,text,text,integer,integer,integer,text[],text[],text[],boolean,text),
  api_v1.set_release_status_v1(uuid,text,text),
  api_v1.list_releases_v1(text,text,integer,integer),
  api_v1.get_release_v1(uuid),
  api_v1.create_rollout_v1(uuid,text[],uuid[],text,text),
  api_v1.start_rollout_v1(uuid),
  api_v1.pause_rollout_v1(uuid,text),
  api_v1.cancel_rollout_v1(uuid,text),
  api_v1.retry_rollout_targets_v1(uuid),
  api_v1.rollback_rollout_v1(uuid,text),
  api_v1.list_rollouts_v1(text,uuid,integer,integer),
  api_v1.get_rollout_v1(uuid)
to authenticated;
grant execute on function api_v1.report_rollout_target_v1(uuid,text,text,text) to service_role;
