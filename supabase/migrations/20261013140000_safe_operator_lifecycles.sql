-- Private operator contracts. None of these DTOs enter api-contracts.
create table control_plane.instance_configuration (
  tenant_id uuid not null,
  instance_id uuid not null,
  display_name text check(display_name is null or char_length(btrim(display_name)) between 1 and 160),
  revision bigint not null default 1 check(revision>0),
  updated_at timestamptz not null default statement_timestamp(),
  primary key(instance_id),
  foreign key(tenant_id,instance_id) references app.instances(tenant_id,id) on delete restrict,
  check(control_plane.contains_no_secret_v1(jsonb_build_object('display_name',display_name)))
);
alter table control_plane.instance_configuration enable row level security;
create policy instance_configuration_denied on control_plane.instance_configuration
  for all to anon,authenticated using(false) with check(false);
revoke all on control_plane.instance_configuration from public,anon,authenticated;

alter table app.tenant_domains add column retired_at timestamptz;
alter table app.tenant_domains add column replacement_domain_id uuid;
alter table app.tenant_domains add constraint tenant_domains_replacement_fk
  foreign key(tenant_id,replacement_domain_id) references app.tenant_domains(tenant_id,id) on delete restrict;
alter table app.tenant_domains add constraint tenant_domains_retired_inactive check(retired_at is null or not active);
alter table app.tenant_domains add constraint tenant_domains_not_own_replacement check(replacement_domain_id is null or replacement_domain_id<>id);

alter table control_plane.jobs drop constraint jobs_kind_check;
alter table control_plane.jobs add constraint jobs_kind_check check(kind in (
  'provision_instance','seed_repository','provision_domains','publish_release','rotate_secret',
  'suspend_instance','close_instance','reconcile_drift','verify_domain','check_integration','retire_domain'));
alter table control_plane.jobs drop constraint jobs_destructive_approval_check;
alter table control_plane.jobs add constraint jobs_destructive_approval_check check(
  kind not in ('close_instance','rotate_secret','retire_domain') or approved_by is not null
  or status in ('queued','cancelled'));
alter table control_plane.jobs add constraint jobs_second_operator_check check(
  kind not in ('close_instance','rotate_secret','retire_domain') or approved_by is null or approved_by<>requested_by);

create or replace function control_plane.require_lifecycle_reason_v1(p_reason text)
returns void language plpgsql immutable security invoker set search_path = '' as $$
begin
  if char_length(btrim(coalesce(p_reason,''))) not between 10 and 500 then
    raise exception using errcode='22023',message='reason_required'; end if;
  if not control_plane.contains_no_secret_v1(jsonb_build_object('reason',p_reason)) then
    raise exception using errcode='22023',message='secret_rejected'; end if;
end;
$$;

create or replace function control_plane.get_instance_configuration_v1(p_instance_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform control_plane.require_operator_v1('viewer');
  select jsonb_build_object('instance_id',i.id,'tenant_id',i.tenant_id,
    'display_name',c.display_name,'revision',coalesce(c.revision,0),'deployment_state',i.deployment_state)
  into v_result from app.instances i left join control_plane.instance_configuration c on c.instance_id=i.id
  where i.id=p_instance_id;
  if v_result is null then raise exception using errcode='P0002',message='not_found'; end if;
  return v_result;
end;
$$;

create or replace function control_plane.update_instance_configuration_v1(
  p_instance_id uuid,p_display_name text,p_expected_revision bigint,p_reason text,p_idempotency_key text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_operator uuid; v_instance app.instances; v_revision bigint; v_prior jsonb; v_result jsonb;
  v_request jsonb:=jsonb_build_object('instance_id',p_instance_id,'display_name',nullif(btrim(p_display_name),''),
    'expected_revision',p_expected_revision,'reason',btrim(p_reason));
begin
  v_operator:=control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  perform control_plane.require_lifecycle_reason_v1(p_reason);
  v_prior:=control_plane.replay_request_v1(p_idempotency_key,'instance.config_update',v_request);
  if v_prior is not null then return v_prior; end if;
  if p_display_name is not null and char_length(btrim(p_display_name)) not between 1 and 160 then
    raise exception using errcode='22023',message='settings_invalid'; end if;
  select * into v_instance from app.instances where id=p_instance_id for update;
  if v_instance.id is null then raise exception using errcode='P0002',message='not_found'; end if;
  if v_instance.deployment_state='closed' then raise exception using errcode='22023',message='transition_not_allowed'; end if;
  select revision into v_revision from control_plane.instance_configuration where instance_id=p_instance_id;
  if coalesce(v_revision,0) is distinct from p_expected_revision then
    raise exception using errcode='40001',message='stale_revision'; end if;
  insert into control_plane.instance_configuration(tenant_id,instance_id,display_name,revision)
    values(v_instance.tenant_id,p_instance_id,nullif(btrim(p_display_name),''),1)
    on conflict(instance_id) do update set display_name=excluded.display_name,
      revision=instance_configuration.revision+1,updated_at=statement_timestamp();
  v_result:=control_plane.get_instance_configuration_v1(p_instance_id);
  perform control_plane.write_audit_v1(v_operator,'instance.configuration_updated',v_instance.tenant_id,p_instance_id,
    'instance',p_instance_id::text,p_reason,jsonb_build_object('changed_fields',jsonb_build_array('display_name')));
  perform control_plane.remember_request_v1(p_idempotency_key,'instance.config_update',v_result,v_request);
  return v_result;
end;
$$;

create or replace function control_plane.deactivate_instance_by_id_v1(
  p_instance_id uuid,p_reason text,p_expected_state text,p_idempotency_key text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_operator uuid; v_instance app.instances; v_run uuid; v_prior jsonb; v_result jsonb;
  v_request jsonb:=jsonb_build_object('instance_id',p_instance_id,'reason',btrim(p_reason),'expected_state',p_expected_state);
begin
  v_operator:=control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  perform control_plane.require_lifecycle_reason_v1(p_reason);
  v_prior:=control_plane.replay_request_v1(p_idempotency_key,'instance.deactivate',v_request);
  if v_prior is not null then return v_prior; end if;
  select * into v_instance from app.instances where id=p_instance_id for update;
  if v_instance.id is null then raise exception using errcode='P0002',message='not_found'; end if;
  if v_instance.deployment_state is distinct from p_expected_state then
    raise exception using errcode='40001',message='stale_revision'; end if;
  if v_instance.deployment_state not in ('active','provisioning') then
    raise exception using errcode='22023',message='transition_not_allowed'; end if;
  if exists(select 1 from control_plane.jobs where instance_id=p_instance_id and status='running') then
    raise exception using errcode='55000',message='unfinished_job_conflict'; end if;
  -- Reuse the provisioning lifecycle when one exists. Its events are retained.
  select id into v_run from control_plane.provisioning_runs where instance_id=p_instance_id
    order by created_at desc,id desc limit 1;
  if v_run is not null then
    perform control_plane.deactivate_provisioned_instance_v1(v_run,p_reason);
  else
    update control_plane.instance_infrastructure set desired_state=desired_state||'{"active":false}'::jsonb,
      updated_at=statement_timestamp() where tenant_id=v_instance.tenant_id and instance_id=p_instance_id;
    update app.instances set deployment_state='suspended',updated_at=statement_timestamp() where id=p_instance_id;
  end if;
  v_result:=jsonb_build_object('instance_id',p_instance_id,'deployment_state','suspended','run_id',v_run);
  perform control_plane.write_audit_v1(v_operator,'instance.deactivated',v_instance.tenant_id,p_instance_id,
    'instance',p_instance_id::text,p_reason,jsonb_build_object('run_id',v_run));
  perform control_plane.remember_request_v1(p_idempotency_key,'instance.deactivate',v_result,v_request);
  return v_result;
end;
$$;

create or replace function control_plane.request_instance_closure_v1(
  p_instance_id uuid,p_reason text,p_confirmation text,p_idempotency_key text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_operator uuid; v_instance app.instances; v_tenant app.tenants; v_prior jsonb; v_job uuid; v_result jsonb;
  v_request jsonb:=jsonb_build_object('instance_id',p_instance_id,'reason',btrim(p_reason),'confirmation',p_confirmation);
begin
  v_operator:=control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  perform control_plane.require_lifecycle_reason_v1(p_reason);
  v_prior:=control_plane.replay_request_v1(p_idempotency_key,'instance.closure',v_request);
  if v_prior is not null then return v_prior; end if;
  select * into v_tenant from app.tenants where id=(select tenant_id from app.instances where id=p_instance_id) for update;
  select * into v_instance from app.instances where id=p_instance_id for update;
  if v_instance.id is null then raise exception using errcode='P0002',message='not_found'; end if;
  if p_confirmation is distinct from p_instance_id::text then raise exception using errcode='22023',message='confirmation_mismatch'; end if;
  if v_tenant.status<>'suspended' or v_instance.deployment_state<>'suspended' then
    raise exception using errcode='22023',message='suspend_before_closure'; end if;
  if exists(select 1 from control_plane.jobs where instance_id=p_instance_id and status in ('queued','running')) then
    raise exception using errcode='55000',message='unfinished_job_conflict'; end if;
  v_job:=control_plane.enqueue_operator_job_v1(v_operator,'close_instance',v_instance.tenant_id,p_instance_id,
    '{"reason_recorded":true}'::jsonb,'instance-closure:'||encode(sha256(convert_to(p_idempotency_key,'UTF8')),'hex'),p_reason);
  v_result:=jsonb_build_object('job_id',v_job,'status','awaiting_approval');
  perform control_plane.remember_request_v1(p_idempotency_key,'instance.closure',v_result,v_request);
  return v_result;
end;
$$;

-- Validation is shared by request and decision: a replacement that was safe
-- when requested can have been retired, moved, or lost verification by review.
create or replace function control_plane.validate_domain_retirement_v1(p_domain_id uuid,p_replacement_domain_id uuid)
returns app.tenant_domains language plpgsql volatile security definer set search_path = '' as $$
declare v_domain app.tenant_domains; v_replacement app.tenant_domains; v_state text;
begin
  select deployment_state into v_state from app.instances
    where id=(select instance_id from app.tenant_domains where id=p_domain_id) for update;
  -- Deterministic domain locks avoid inverted retire/replace deadlocks.
  perform id from app.tenant_domains where id in (p_domain_id,p_replacement_domain_id) order by id for update;
  select * into v_domain from app.tenant_domains where id=p_domain_id;
  if v_domain.id is null then raise exception using errcode='P0002',message='not_found'; end if;
  if v_domain.retired_at is not null then raise exception using errcode='22023',message='transition_not_allowed'; end if;
  if p_replacement_domain_id is not null then
    select * into v_replacement from app.tenant_domains where id=p_replacement_domain_id;
    if v_replacement.id is null or v_replacement.id=v_domain.id
      or v_replacement.tenant_id<>v_domain.tenant_id or v_replacement.instance_id<>v_domain.instance_id
      or v_replacement.application<>v_domain.application or v_replacement.kind<>'production'
      or v_replacement.retired_at is not null or v_replacement.verification_status<>'verified'
      or v_replacement.verified_at is null then raise exception using errcode='22023',message='replacement_domain_invalid'; end if;
  elsif v_domain.active and v_state='active' then
    raise exception using errcode='22023',message='active_route_requires_replacement';
  end if;
  if exists(select 1 from control_plane.jobs j where j.status in ('queued','running') and j.kind='verify_domain'
    and j.parameters->>'domain_id' in (p_domain_id::text,p_replacement_domain_id::text)) then
    raise exception using errcode='55000',message='unfinished_job_conflict'; end if;
  return v_domain;
end;
$$;

create or replace function control_plane.request_domain_retirement_v1(
  p_domain_id uuid,p_replacement_domain_id uuid,p_reason text,p_idempotency_key text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_operator uuid; v_domain app.tenant_domains; v_prior jsonb; v_job uuid; v_result jsonb;
  v_request jsonb:=jsonb_build_object('domain_id',p_domain_id,'replacement_domain_id',p_replacement_domain_id,'reason',btrim(p_reason));
begin
  v_operator:=control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  perform control_plane.require_lifecycle_reason_v1(p_reason);
  v_prior:=control_plane.replay_request_v1(p_idempotency_key,'domain.retire',v_request);
  if v_prior is not null then return v_prior; end if;
  v_domain:=control_plane.validate_domain_retirement_v1(p_domain_id,p_replacement_domain_id);
  if exists(select 1 from control_plane.jobs j where j.kind='retire_domain' and j.status in ('queued','running')
    and j.parameters->>'domain_id'=p_domain_id::text) then raise exception using errcode='55000',message='unfinished_job_conflict'; end if;
  v_job:=control_plane.enqueue_operator_job_v1(v_operator,'retire_domain',v_domain.tenant_id,v_domain.instance_id,
    v_request-'reason','domain-retire:'||encode(sha256(convert_to(p_idempotency_key,'UTF8')),'hex'),p_reason);
  v_result:=jsonb_build_object('job_id',v_job,'status','awaiting_approval');
  perform control_plane.remember_request_v1(p_idempotency_key,'domain.retire',v_result,v_request);
  return v_result;
end;
$$;

-- Retired routes and closed instances are retained history, never revived by
-- an older verify/activate RPC. These checks cover forged direct RPC calls too.
create or replace function control_plane.guard_retired_domain_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and old.retired_at is not null and
    (new.retired_at is distinct from old.retired_at or new.active
      or new.replacement_domain_id is distinct from old.replacement_domain_id) then
    raise exception using errcode='22023',message='transition_not_allowed'; end if;
  if new.active and exists(select 1 from app.instances i join app.tenants t on t.id=i.tenant_id
    where i.id=new.instance_id and (i.deployment_state='closed' or t.status='closed')) then
    raise exception using errcode='22023',message='transition_not_allowed'; end if;
  return new;
end;
$$;
create trigger tenant_domains_guard_retired before insert or update on app.tenant_domains
  for each row execute function control_plane.guard_retired_domain_v1();

create or replace function control_plane.guard_instance_lifecycle_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.deployment_state='closed' and new.deployment_state<>'closed' then
    raise exception using errcode='22023',message='transition_not_allowed'; end if;
  if new.deployment_state='active' and old.deployment_state<>'active' and
    (not exists(select 1 from app.tenants t where t.id=new.tenant_id and t.status='active')
      or exists(select 1 from control_plane.jobs j where j.instance_id=new.id
        and j.kind='close_instance' and j.status in ('queued','running'))) then
    raise exception using errcode='22023',message='transition_not_allowed'; end if;
  if new.deployment_state='closed' and old.deployment_state<>'closed' and
    (not control_plane.is_worker_v1() or not exists(select 1 from control_plane.jobs j
      where j.tenant_id=new.tenant_id and j.instance_id=new.id and j.kind='close_instance'
        and j.status='running' and j.approved_by is not null and j.approved_by<>j.requested_by)) then
    raise exception using errcode='42501',message='second_operator_required'; end if;
  return new;
end;
$$;
create trigger instances_guard_lifecycle before update of deployment_state on app.instances
  for each row execute function control_plane.guard_instance_lifecycle_v1();

create or replace function control_plane.guard_job_tenant_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.instance_id is not null and not exists(select 1 from app.instances i
    where i.id=new.instance_id and i.tenant_id=new.tenant_id) then
    raise exception using errcode='42501',message='tenant_context_mismatch'; end if;
  if new.kind='close_instance' and new.status in ('queued','running') and not exists(
    select 1 from app.tenants t where t.id=new.tenant_id and t.status='suspended') then
    raise exception using errcode='22023',message='suspend_before_closure'; end if;
  return new;
end;
$$;
create trigger jobs_guard_tenant before insert or update on control_plane.jobs
  for each row execute function control_plane.guard_job_tenant_v1();

create or replace function control_plane.operator_review_rows_v1()
returns table(kind text,id uuid,tenant_id uuid,instance_id uuid,status text,requested_by uuid,
  requested_at timestamptz,reason text,action text)
language sql stable security definer set search_path = '' as $$
  select 'job'::text,j.id,j.tenant_id,j.instance_id,
    case when j.status='cancelled' then 'rejected' when j.approved_by is not null then 'approved'
      when j.status='queued' then 'pending' else j.status end,
    j.requested_by,j.created_at,j.reason,j.kind
  from control_plane.jobs j where j.kind in ('close_instance','rotate_secret','retire_domain')
  union all
  select 'support'::text,g.id,g.tenant_id,null::uuid,
    case when g.status='pending' then 'pending' when g.approved_by is not null then 'approved' else 'rejected' end,
    g.operator_id,g.requested_at,g.reason,'support_access'::text from control_plane.support_grants g;
$$;

create or replace function control_plane.list_operator_reviews_v1(
  p_status text default 'pending',p_kind text default null,p_limit integer default 25,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform control_plane.require_operator_v1('viewer');
  if p_status is not null and p_status not in ('pending','approved','rejected')
    or p_kind is not null and p_kind not in ('job','support') then raise exception using errcode='22023',message='settings_invalid'; end if;
  with filtered as (select r.*,t.name as tenant_name from control_plane.operator_review_rows_v1() r
    left join app.tenants t on t.id=r.tenant_id where (p_status is null or r.status=p_status) and (p_kind is null or r.kind=p_kind)),
  page as (select * from filtered order by requested_at,id limit least(greatest(coalesce(p_limit,25),1),100) offset greatest(coalesce(p_offset,0),0))
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p) order by p.requested_at,p.id) from page p),'[]'),
    'total_count',(select count(*) from filtered)) into v_result;
  return v_result;
end;
$$;

create or replace function control_plane.get_operator_review_v1(p_kind text,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_row record; v_detail jsonb; v_history jsonb;
begin
  perform control_plane.require_operator_v1('viewer');
  select * into v_row from control_plane.operator_review_rows_v1() where kind=p_kind and id=p_id;
  if v_row.id is null then raise exception using errcode='P0002',message='not_found'; end if;
  if p_kind='job' then v_detail:=control_plane.get_job_v1(p_id);
  else
    select jsonb_build_object('scope',g.scope,'location_id',g.location_id,'ticket_reference',g.ticket_reference,
      'approved_by',g.approved_by,'approved_at',g.approved_at,'expires_at',g.expires_at,'revoked_at',g.revoked_at)
    into v_detail from control_plane.support_grants g where g.id=p_id;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'operator_id',a.operator_id,
    'reason',coalesce(a.reason,case when a.action='support.requested' then v_row.reason end),
    'outcome',a.outcome,'created_at',a.created_at) order by a.created_at,a.id),'[]')
  into v_history from control_plane.audit_events a
  where (a.target_kind='operator_review' and a.target_id=p_kind||':'||p_id::text)
    or (p_kind='job' and a.target_kind='job' and a.target_id=p_id::text)
    or (p_kind='support' and a.detail->>'grant_id'=p_id::text);
  return to_jsonb(v_row)||jsonb_build_object('detail',v_detail,'history',v_history,
    'can_decide',v_row.status='pending' and v_row.requested_by<>(select private.current_auth_user_id())
      and control_plane.is_operator_v1('admin'));
end;
$$;

create or replace function control_plane.decide_operator_review_v1(
  p_kind text,p_id uuid,p_decision text,p_reason text,p_idempotency_key text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_operator uuid; v_prior jsonb; v_row record; v_job control_plane.jobs; v_grant control_plane.support_grants;
  v_domain app.tenant_domains; v_replacement uuid; v_result jsonb;
  v_request jsonb:=jsonb_build_object('kind',p_kind,'id',p_id,'decision',p_decision,'reason',btrim(p_reason));
begin
  v_operator:=control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  perform control_plane.require_lifecycle_reason_v1(p_reason);
  v_prior:=control_plane.replay_request_v1(p_idempotency_key,'review.decide',v_request);
  if v_prior is not null then return v_prior; end if;
  if p_kind is null or p_kind not in ('job','support') or p_decision is null or p_decision not in ('approve','reject') then
    raise exception using errcode='22023',message='settings_invalid'; end if;
  if p_kind='job' then
    select * into v_job from control_plane.jobs where id=p_id for update;
    if v_job.id is null or v_job.kind not in ('close_instance','rotate_secret','retire_domain') then
      raise exception using errcode='P0002',message='not_found'; end if;
    if v_job.status<>'queued' or v_job.approved_by is not null then raise exception using errcode='22023',message='transition_not_allowed'; end if;
    if v_job.requested_by=v_operator then raise exception using errcode='42501',message='second_operator_required'; end if;
    if p_decision='reject' then
      perform control_plane.cancel_job_v1(p_id,p_reason);
    elsif v_job.kind='retire_domain' then
      v_replacement:=(v_job.parameters->>'replacement_domain_id')::uuid;
      v_domain:=control_plane.validate_domain_retirement_v1((v_job.parameters->>'domain_id')::uuid,v_replacement);
      if v_domain.tenant_id is distinct from v_job.tenant_id or v_domain.instance_id is distinct from v_job.instance_id then
        raise exception using errcode='42501',message='policy_denied'; end if;
      -- The one-active-production-route index is immediate, not deferrable.
      -- Retire the outgoing route before activating its replacement. Both
      -- locked writes share this transaction, so any activation failure rolls
      -- back retirement too; readers never observe the intermediate state.
      update app.tenant_domains set active=false,retired_at=statement_timestamp(),replacement_domain_id=v_replacement,
        updated_at=statement_timestamp() where id=v_domain.id;
      if v_replacement is not null and v_domain.active then
        update app.tenant_domains set active=true,updated_at=statement_timestamp() where id=v_replacement;
      end if;
      -- This workflow retires database routing only. No provider resource is
      -- deleted. Approval executes the guarded cutover atomically.
      update control_plane.jobs set approved_by=v_operator,status='succeeded',completed_at=statement_timestamp(),
        updated_at=statement_timestamp() where id=p_id;
      insert into control_plane.job_events(job_id,event,actor_id) values(p_id,'approved',v_operator),(p_id,'succeeded',v_operator);
      perform control_plane.write_audit_v1(v_operator,'domain.retired',v_domain.tenant_id,v_domain.instance_id,
        'domain',v_domain.id::text,p_reason,jsonb_build_object('replacement_domain_id',v_replacement));
    else
      perform control_plane.approve_operator_job_v1(p_id);
    end if;
  else
    select * into v_grant from control_plane.support_grants where id=p_id for update;
    if v_grant.id is null then raise exception using errcode='P0002',message='not_found'; end if;
    if v_grant.status<>'pending' then raise exception using errcode='22023',message='transition_not_allowed'; end if;
    if v_grant.operator_id=v_operator then raise exception using errcode='42501',message='second_operator_required'; end if;
    if p_decision='approve' then perform control_plane.approve_support_access_v1(p_id,60);
    else perform control_plane.revoke_support_grant_v1(p_id,p_reason); end if;
  end if;
  select * into v_row from control_plane.operator_review_rows_v1() where kind=p_kind and id=p_id;
  v_result:=jsonb_build_object('kind',p_kind,'id',p_id,'status',v_row.status);
  perform control_plane.write_audit_v1(v_operator,'review.'||case when p_decision='approve' then 'approved' else 'rejected' end,
    v_row.tenant_id,v_row.instance_id,'operator_review',p_kind||':'||p_id::text,p_reason,
    jsonb_build_object('action',v_row.action));
  perform control_plane.remember_request_v1(p_idempotency_key,'review.decide',v_result,v_request);
  return v_result;
end;
$$;

-- Existing contracts: fresh write authority, guarded closure, review-owned retirement.

create or replace function control_plane.create_tenant_v1(p_name text, p_brand_key text)
returns table (brand_id uuid, instance_id uuid, tenant_id uuid)
language plpgsql
security definer
set search_path to ''
as $function$
#variable_conflict use_column
declare
  v_tenant_id uuid;
  v_brand_id uuid;
  v_instance_id uuid;
begin
  perform control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());

  if p_name is null or pg_catalog.btrim(p_name) = ''
     or pg_catalog.char_length(pg_catalog.btrim(p_name)) > 160 then
    raise exception using errcode='22023',message='tenant_name_invalid';
  end if;
  if p_brand_key is null
     or p_brand_key !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception using errcode='22023',message='brand_key_invalid';
  end if;

  insert into app.tenants(id,name,status)
  values (pg_catalog.gen_random_uuid(),pg_catalog.btrim(p_name),'active')
  returning id into v_tenant_id;

  -- Retain the October 8 custom-role provisioning contract.
  perform private.install_builtin_roles_v1(v_tenant_id);

  insert into app.brands(id,tenant_id,key,status)
  values (pg_catalog.gen_random_uuid(),v_tenant_id,p_brand_key,'active')
  returning id into v_brand_id;

  -- 'provisioning' until request_provisioning_v1 and its worker chain take
  -- this instance the rest of the way to 'active'; instances_check already
  -- refuses 'active' without a published brand revision.
  insert into app.instances(id,tenant_id,brand_id,deployment_state)
  values (pg_catalog.gen_random_uuid(),v_tenant_id,v_brand_id,'provisioning')
  returning id into v_instance_id;

  perform control_plane.write_audit_v1((select private.current_auth_user_id()),'tenant.created',
    v_tenant_id,v_instance_id,'tenant',v_tenant_id::text,null,
    pg_catalog.jsonb_build_object('name',pg_catalog.btrim(p_name),'brand_key',p_brand_key));
  return query select v_brand_id,v_instance_id,v_tenant_id;
end;
$function$;

create or replace function control_plane.create_tenant_v2(
  p_name text, p_brand_key text, p_idempotency_key text)
returns table (tenant_id uuid, brand_id uuid, instance_id uuid, replayed boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_prior jsonb;
  v_request jsonb := pg_catalog.jsonb_build_object('name',pg_catalog.btrim(p_name),'brand_key',p_brand_key);
  v_row record;
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  v_prior := control_plane.replay_request_v1(p_idempotency_key,'tenant.create',v_request);
  if v_prior is not null then
    return query select (v_prior->>'tenant_id')::uuid,(v_prior->>'brand_id')::uuid,
      (v_prior->>'instance_id')::uuid,true;
    return;
  end if;

  select c.tenant_id, c.brand_id, c.instance_id into v_row
  from control_plane.create_tenant_v1(p_name,p_brand_key) c;

  perform control_plane.remember_request_v1(p_idempotency_key,'tenant.create',
    pg_catalog.jsonb_build_object('tenant_id',v_row.tenant_id,'brand_id',v_row.brand_id,
      'instance_id',v_row.instance_id),v_request);
  return query select v_row.tenant_id,v_row.brand_id,v_row.instance_id,false;
end;
$function$;

create or replace function control_plane.update_tenant_v1(
  p_tenant_id uuid, p_name text, p_expected_updated_at timestamptz)
returns table (tenant_id uuid, updated_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_tenant app.tenants%rowtype;
  v_name text := pg_catalog.btrim(p_name);
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_operator := control_plane.require_operator_v1('operator',control_plane.step_up_seconds_v1());
  if v_name is null or v_name = '' or pg_catalog.char_length(v_name) > 160 then
    raise exception using errcode='22023',message='name_invalid';
  end if;
  select * into v_tenant from app.tenants t where t.id = p_tenant_id for update;
  if v_tenant.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if v_tenant.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode='40001',message='stale_revision';
  end if;
  update app.tenants t set name = v_name, updated_at = v_now where t.id = p_tenant_id;
  perform control_plane.write_audit_v1(v_operator,'tenant.renamed',p_tenant_id,null,'tenant',
    p_tenant_id::text,null,pg_catalog.jsonb_build_object('from',v_tenant.name,'to',v_name));
  return query select p_tenant_id, v_now;
end;
$function$;

create or replace function control_plane.retry_provisioning_run_v1(p_run_id uuid)
returns table (run_state text, steps_reset integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_operator uuid;
  v_run control_plane.provisioning_runs%rowtype;
  v_reset integer;
  v_state text;
begin
  perform control_plane.require_operator_v1('operator',control_plane.step_up_seconds_v1());
  v_operator := (select private.current_auth_user_id());

  select * into v_run from control_plane.provisioning_runs r where r.id = p_run_id for update;
  if v_run.id is null or v_run.state in ('active','deactivated') then
    raise exception using errcode='42501',message='transition_not_allowed';
  end if;

  -- The attempt counter goes back to zero because a human has looked at it. The
  -- attempts themselves are not lost: they are in the timeline.
  update control_plane.provisioning_steps s
  set status = 'pending', attempts = 0, retry_after = null, locked_until = null,
      last_error_code = null, waiting_reason = null, updated_at = v_now
  where s.run_id = p_run_id
    and (s.status = 'failed' or (s.status = 'running' and s.locked_until < v_now));
  get diagnostics v_reset = row_count;

  -- The run falls back to the furthest state its surviving successes justify,
  -- rather than to the beginning.
  select coalesce((
    select s.resulting_state from control_plane.provisioning_steps s
    where s.run_id = p_run_id and s.status = 'succeeded' and s.resulting_state is not null
    order by control_plane.provisioning_state_rank_v1(s.resulting_state) desc
    limit 1),'requested')
  into v_state;

  update control_plane.provisioning_runs r
  set state = v_state, last_error_code = null, waiting_reason = null, updated_at = v_now
  where r.id = p_run_id;

  insert into control_plane.provisioning_events(run_id,event,detail)
  values (p_run_id,'retried',jsonb_build_object('steps_reset',v_reset,'state',v_state));
  insert into control_plane.audit_events(operator_id,action,tenant_id,instance_id,detail)
  values (v_operator,'provisioning.retried',v_run.tenant_id,v_run.instance_id,
    jsonb_build_object('run_id',p_run_id,'steps_reset',v_reset));

  return query select v_state,v_reset;
end;
$function$;

create or replace function control_plane.request_provisioning_v1(
  p_tenant_id uuid,
  p_instance_id uuid,
  p_slug text,
  p_plan_key text,
  p_desired_release text,
  p_config_schema_version integer,
  p_backend_contract_min integer,
  p_backend_contract_max integer,
  p_request jsonb,
  p_idempotency_key text
)
returns table (run_id uuid, state text, rejected text[])
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_existing control_plane.provisioning_runs%rowtype;
  v_rejected text[] := '{}'::text[];
  v_run_id uuid;
  v_request jsonb := coalesce(p_request,'{}'::jsonb);
  v_locale text := v_request->>'default_locale';
  v_timezone text := v_request->>'timezone';
  v_currency text := v_request->>'currency';
  v_domain jsonb;
begin
  perform control_plane.require_operator_v1('operator',control_plane.step_up_seconds_v1());
  if not control_plane.contains_no_secret_v1(v_request) then
    raise exception using errcode='22023',message='secret_rejected';
  end if;
  v_operator := (select private.current_auth_user_id());

  -- Resuming is the common case, so it is the first thing checked. Re-sending
  -- the same request returns the same run; sending a different one for the same
  -- instance is a mistake worth refusing loudly.
  select * into v_existing from control_plane.provisioning_runs r
  where r.tenant_id = p_tenant_id and r.instance_id = p_instance_id;
  if v_existing.id is not null then
    if v_existing.idempotency_key is distinct from p_idempotency_key
       or v_existing.request is distinct from v_request
       or v_existing.requested_by is distinct from v_operator
       or v_existing.slug is distinct from p_slug
       or v_existing.plan_key is distinct from p_plan_key
       or v_existing.desired_release is distinct from p_desired_release
       or v_existing.config_schema_version is distinct from p_config_schema_version
       or v_existing.backend_contract_min is distinct from p_backend_contract_min
       or v_existing.backend_contract_max is distinct from p_backend_contract_max then
      raise exception using errcode='23505',message='idempotency_conflict';
    end if;
    return query select v_existing.id, v_existing.state, '{}'::text[];
    return;
  end if;

  -- ---- validation ---------------------------------------------------------
  if not exists (select 1 from app.instances i
      where i.tenant_id = p_tenant_id and i.id = p_instance_id) then
    v_rejected := v_rejected || 'instance_unknown'::text;
  elsif exists (select 1 from app.instances i
      where i.tenant_id = p_tenant_id and i.id = p_instance_id
        and i.deployment_state <> 'provisioning') then
    -- Provisioning an instance that is already serving traffic is not a retry.
    v_rejected := v_rejected || 'instance_not_provisioning'::text;
  end if;

  if not exists (select 1 from control_plane.plans p
      where p.key = p_plan_key and p.active) then
    v_rejected := v_rejected || 'plan_unknown'::text;
  end if;

  if p_slug is null or p_slug !~ '^[a-z][a-z0-9-]{1,38}[a-z0-9]$' then
    v_rejected := v_rejected || 'slug_invalid'::text;
  elsif exists (select 1 from control_plane.provisioning_runs r where r.slug = p_slug) then
    v_rejected := v_rejected || 'slug_taken'::text;
  end if;

  if v_locale is null or v_locale not in ('en','ar') then
    v_rejected := v_rejected || 'locale_invalid'::text;
  end if;
  if v_timezone is null or not exists (
      select 1 from pg_catalog.pg_timezone_names z where z.name = v_timezone) then
    v_rejected := v_rejected || 'timezone_invalid'::text;
  end if;
  if v_currency is null or v_currency !~ '^[A-Z]{3}$' then
    v_rejected := v_rejected || 'currency_invalid'::text;
  end if;

  if p_desired_release is null or p_desired_release !~ '^[0-9]+\.[0-9]+\.[0-9]+$' then
    v_rejected := v_rejected || 'release_invalid'::text;
  end if;
  if coalesce(p_config_schema_version,0) <= 0 then
    v_rejected := v_rejected || 'config_schema_invalid'::text;
  end if;
  -- The release must be able to talk to the backend this fleet actually runs.
  if coalesce(p_backend_contract_min,0) <= 0
     or coalesce(p_backend_contract_max,0) < coalesce(p_backend_contract_min,1)
     or control_plane.backend_contract_version_v1()
        not between p_backend_contract_min and p_backend_contract_max then
    v_rejected := v_rejected || 'backend_contract_incompatible'::text;
  end if;

  -- Domains are optional at request time (a config-only tenant can launch on a
  -- platform subdomain), but a malformed or already-claimed one is refused
  -- before any provider is called rather than after.
  if pg_catalog.jsonb_typeof(v_request->'domains') not in ('array','null')
     and v_request->'domains' is not null then
    v_rejected := v_rejected || 'domains_invalid'::text;
  else
    for v_domain in
      select value from pg_catalog.jsonb_array_elements(
        case when pg_catalog.jsonb_typeof(v_request->'domains') = 'array'
             then v_request->'domains' else '[]'::jsonb end)
    loop
      if coalesce(v_domain->>'hostname','') !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
         or coalesce(v_domain->>'application','') not in ('client','dashboard') then
        v_rejected := v_rejected || 'domains_invalid'::text;
      elsif exists (select 1 from app.tenant_domains d
          where d.hostname = v_domain->>'hostname' and d.tenant_id <> p_tenant_id) then
        v_rejected := v_rejected || 'domain_taken'::text;
      end if;
    end loop;
  end if;

  -- A provider whose app is not installed cannot be called, so it is a
  -- prerequisite rather than a step that will fail six times first.
  if not exists (select 1 from control_plane.instance_infrastructure f
      where f.tenant_id = p_tenant_id and f.provider = 'github'
        and f.resource_kind = 'app_installation') then
    v_rejected := v_rejected || 'github_installation_missing'::text;
  end if;

  if pg_catalog.array_length(v_rejected,1) > 0 then
    return query select null::uuid,'requested'::text,
      (select pg_catalog.array_agg(distinct x order by x) from unnest(v_rejected) x);
    return;
  end if;

  -- ---- the run ------------------------------------------------------------
  insert into control_plane.provisioning_runs(
    tenant_id,instance_id,slug,plan_key,idempotency_key,request,desired_release,
    config_schema_version,backend_contract_min,backend_contract_max,requested_by)
  values (p_tenant_id,p_instance_id,p_slug,p_plan_key,p_idempotency_key,v_request,
    p_desired_release,p_config_schema_version,p_backend_contract_min,
    p_backend_contract_max,v_operator)
  returning id into v_run_id;

  -- The step catalog. It is written here, once, as data on the rows: a step row
  -- that describes itself is a step row a resumption can act on without
  -- consulting code that may have changed since the run started.
  insert into control_plane.provisioning_steps(
    run_id,step_order,step_key,provider,resource_kind,required,resulting_state,
    waiting_state,idempotency_key,max_attempts)
  select v_run_id,c.step_order,c.step_key,c.provider,c.resource_kind,c.required,
    c.resulting_state,c.waiting_state,
    v_run_id::text || ':' || c.step_key,
    c.max_attempts
  from (values
    (1,'validate_request',  null::text,    null::text,           true, 'validated',              null::text, 3),
    (2,'create_tenant_records','supabase', 'database_project',   true, 'tenant_created',         null,       5),
    (3,'seed_repository',   'github',      'repository',         true, 'repository_seeded',      null,       5),
    (4,'commit_configuration','github',    'branch',             true, 'config_committed',       null,       5),
    (5,'protect_repository','github',      'ruleset',            true, null,                     null,       5),
    (6,'create_projects',   'vercel',      'project',            true, 'projects_created',       null,       5),
    (7,'configure_mail',    'resend',      'sending_domain',     false,null,                     null,       5),
    (8,'configure_environment','vercel',   'project',            true, 'environment_configured', null,       5),
    (9,'deploy_applications','vercel',     'deployment',         true, null,                     null,       5),
    -- The only step that waits on somebody outside the fleet, and therefore the
    -- only one with a waiting state of its own.
    (10,'verify_domains',   'vercel',      'domain',             true, 'domain_deployed',        'domain_pending', 60),
    (11,'health_check',     null,          null,                 true, 'health_checked',         null,       10),
    (12,'generate_agent_pack',null,        null,                 true, null,                     null,       3)
  ) as c(step_order,step_key,provider,resource_kind,required,resulting_state,waiting_state,max_attempts);

  -- What the instance should be running, recorded before anything runs it.
  insert into control_plane.instance_release_state(
    tenant_id,instance_id,desired_release,config_schema_version,
    supported_backend_min,supported_backend_max)
  values (p_tenant_id,p_instance_id,p_desired_release,p_config_schema_version,
    p_backend_contract_min,p_backend_contract_max)
  on conflict (tenant_id,instance_id) do update
    set desired_release = excluded.desired_release,
        config_schema_version = excluded.config_schema_version,
        supported_backend_min = excluded.supported_backend_min,
        supported_backend_max = excluded.supported_backend_max,
        updated_at = pg_catalog.statement_timestamp();

  insert into control_plane.provisioning_events(run_id,event,detail)
  values (v_run_id,'requested',jsonb_build_object('slug',p_slug,'plan',p_plan_key,
    'release',p_desired_release));

  -- Privileged work is a queued job, never a call from this transaction.
  perform control_plane.enqueue_job_v1('provision_instance',p_tenant_id,p_instance_id,
    jsonb_build_object('run_id',v_run_id,'slug',p_slug));

  return query select v_run_id,'requested'::text,'{}'::text[];
end;
$function$;

create or replace function control_plane.activate_provisioned_instance_v1(p_run_id uuid)
returns table (activated boolean, run_state text, blocked text[])
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_result record;
  v_run control_plane.provisioning_runs%rowtype;
begin
  v_operator := control_plane.require_operator_v1('operator',control_plane.step_up_seconds_v1());
  select * into v_run from control_plane.provisioning_runs r where r.id = p_run_id;
  if v_run.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  select a.activated, a.run_state, a.blocked into v_result
  from control_plane.activate_instance_v1(p_run_id) a;
  perform control_plane.write_audit_v1(v_operator,'provisioning.activation_requested',
    v_run.tenant_id,v_run.instance_id,'provisioning_run',p_run_id::text,null,
    pg_catalog.jsonb_build_object('blocked',pg_catalog.to_jsonb(v_result.blocked)),
    case when v_result.activated then 'succeeded' else 'failed' end);
  return query select v_result.activated, v_result.run_state, v_result.blocked;
end;
$function$;

create or replace function control_plane.add_tenant_domain_v1(
  p_tenant_id uuid, p_instance_id uuid, p_hostname text, p_application text, p_idempotency_key text)
returns table (domain_id uuid, job_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_prior jsonb;
  v_request jsonb := pg_catalog.jsonb_build_object('tenant_id',p_tenant_id,'instance_id',p_instance_id,'hostname',pg_catalog.lower(pg_catalog.btrim(p_hostname)),'application',p_application);
  v_hostname text := pg_catalog.lower(pg_catalog.btrim(p_hostname));
  v_id uuid := pg_catalog.gen_random_uuid();
  v_job uuid;
begin
  v_operator := control_plane.require_operator_v1('operator',control_plane.step_up_seconds_v1());
  v_prior := control_plane.replay_request_v1(p_idempotency_key,'domain.add',v_request);
  if v_prior is not null then
    return query select (v_prior->>'domain_id')::uuid,(v_prior->>'job_id')::uuid;
    return;
  end if;
  if v_hostname is null or pg_catalog.char_length(v_hostname) not between 4 and 253
     or v_hostname !~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$' then
    raise exception using errcode='22023',message='hostname_invalid';
  end if;
  if p_application not in ('client','dashboard') then
    raise exception using errcode='22023',message='settings_invalid';
  end if;
  if not exists (select 1 from app.instances i where i.tenant_id = p_tenant_id and i.id = p_instance_id) then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if exists (select 1 from app.tenant_domains d where d.hostname = v_hostname) then
    raise exception using errcode='23505',message='domain_taken';
  end if;

  insert into app.tenant_domains(id,tenant_id,instance_id,hostname,application,kind,verification_status,active)
  values (v_id,p_tenant_id,p_instance_id,v_hostname,p_application,'production','pending',false);
  v_job := control_plane.enqueue_operator_job_v1(v_operator,'verify_domain',p_tenant_id,p_instance_id,
    pg_catalog.jsonb_build_object('domain_id',v_id,'hostname',v_hostname),
    'verify_domain:' || v_id::text || ':1');
  perform control_plane.write_audit_v1(v_operator,'domain.added',p_tenant_id,p_instance_id,'domain',
    v_id::text,null,pg_catalog.jsonb_build_object('hostname',v_hostname,'application',p_application));
  perform control_plane.remember_request_v1(p_idempotency_key,'domain.add',
    pg_catalog.jsonb_build_object('domain_id',v_id,'job_id',v_job),v_request);
  return query select v_id, v_job;
end;
$function$;

create or replace function control_plane.request_domain_verification_v1(p_domain_id uuid)
returns table (job_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_domain app.tenant_domains%rowtype;
  v_existing uuid;
  v_attempt bigint;
begin
  v_operator := control_plane.require_operator_v1('operator',control_plane.step_up_seconds_v1());
  select * into v_domain from app.tenant_domains d where d.id = p_domain_id for update;
  if v_domain.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if v_domain.retired_at is not null then raise exception using errcode='22023',message='transition_not_allowed'; end if;
  select j.id into v_existing from control_plane.jobs j
  where j.kind = 'verify_domain' and j.status in ('queued','running')
    and j.parameters->>'domain_id' = p_domain_id::text
  limit 1;
  if v_existing is not null then
    return query select v_existing;
    return;
  end if;
  select pg_catalog.count(*) + 1 into v_attempt from control_plane.jobs j
  where j.kind = 'verify_domain' and j.parameters->>'domain_id' = p_domain_id::text;
  return query select control_plane.enqueue_operator_job_v1(v_operator,'verify_domain',
    v_domain.tenant_id,v_domain.instance_id,
    pg_catalog.jsonb_build_object('domain_id',p_domain_id,'hostname',v_domain.hostname),
    'verify_domain:' || p_domain_id::text || ':' || v_attempt::text);
end;
$function$;

create or replace function control_plane.cancel_job_v1(p_job_id uuid, p_reason text)
returns table (job_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_job control_plane.jobs%rowtype;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_operator := control_plane.require_operator_v1('operator',control_plane.step_up_seconds_v1());
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  select * into v_job from control_plane.jobs j where j.id = p_job_id for update;
  if v_job.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if v_job.status = 'running' then
    raise exception using errcode='22023',message='job_running';
  end if;
  if v_job.status not in ('queued','failed') then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  update control_plane.jobs j set status = 'cancelled', cancelled_by = v_operator,
    cancelled_at = v_now, locked_until = null, updated_at = v_now
  where j.id = p_job_id;
  insert into control_plane.job_events(job_id,event,actor_id) values (p_job_id,'cancelled',v_operator);
  perform control_plane.write_audit_v1(v_operator,'job.cancelled',v_job.tenant_id,v_job.instance_id,
    'job',p_job_id::text,p_reason,pg_catalog.jsonb_build_object('kind',v_job.kind,'from',v_job.status));
  return query select p_job_id,'cancelled'::text;
end;
$function$;

create or replace function control_plane.retry_job_v1(p_job_id uuid, p_reason text)
returns table (job_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_job control_plane.jobs%rowtype;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_operator := control_plane.require_operator_v1('operator',control_plane.step_up_seconds_v1());
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  select * into v_job from control_plane.jobs j where j.id = p_job_id for update;
  if v_job.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if v_job.status <> 'failed' then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  if v_job.attempts >= 20 then
    raise exception using errcode='22023',message='attempts_exhausted';
  end if;
  -- A destructive job that failed is re-approved, not silently re-run.
  update control_plane.jobs j set status = 'queued', locked_until = null, last_error_code = null,
    completed_at = null, updated_at = v_now,
    approved_by = case when j.kind in ('close_instance','rotate_secret','retire_domain') then null else j.approved_by end
  where j.id = p_job_id;
  insert into control_plane.job_events(job_id,event,actor_id,attempt) values (p_job_id,'retried',v_operator,v_job.attempts);
  perform control_plane.write_audit_v1(v_operator,'job.retried',v_job.tenant_id,v_job.instance_id,
    'job',p_job_id::text,p_reason,pg_catalog.jsonb_build_object('kind',v_job.kind));
  return query select p_job_id,'queued'::text;
end;
$function$;

create or replace function control_plane.approve_operator_job_v1(p_job_id uuid)
returns table (job_id uuid, status text)
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
  if exists(select 1 from control_plane.jobs where id=p_job_id and kind='retire_domain') then
    raise exception using errcode='22023',message='review_required'; end if;
  perform control_plane.approve_job_v1(p_job_id);
  insert into control_plane.job_events(job_id,event,actor_id) values (p_job_id,'approved',v_operator);
  return query select p_job_id,'queued'::text;
end;
$function$;

create or replace function control_plane.list_jobs_v1(
  p_status text default null, p_kind text default null, p_tenant_id uuid default null,
  p_limit integer default 25, p_offset integer default 0)
returns table (job_id uuid, kind text, status text, tenant_id uuid, tenant_name text,
  instance_id uuid, attempts integer, last_error_code text, requested_by_email text,
  approved_by_email text, needs_approval boolean, created_at timestamptz,
  updated_at timestamptz, completed_at timestamptz, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  select j.id, j.kind, j.status, j.tenant_id, t.name, j.instance_id, j.attempts, j.last_error_code,
    ro.email, ao.email,
    (j.kind in ('close_instance','rotate_secret','retire_domain') and j.approved_by is null and j.status = 'queued'),
    j.created_at, j.updated_at, j.completed_at, pg_catalog.count(*) over ()
  from control_plane.jobs j
  left join app.tenants t on t.id = j.tenant_id
  left join control_plane.operators ro on ro.auth_user_id = j.requested_by
  left join control_plane.operators ao on ao.auth_user_id = j.approved_by
  where (p_status is null or j.status = p_status
         or (p_status = 'awaiting_approval' and j.kind in ('close_instance','rotate_secret','retire_domain')
             and j.approved_by is null and j.status = 'queued'))
    and (p_kind is null or j.kind = p_kind)
    and (p_tenant_id is null or j.tenant_id = p_tenant_id)
  order by j.created_at desc, j.id
  limit least(greatest(coalesce(p_limit,25),1),100) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function control_plane.get_job_v1(p_job_id uuid)
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
    'id',j.id,'kind',j.kind,'status',j.status,'tenant_id',j.tenant_id,'tenant_name',t.name,
    'instance_id',j.instance_id,'attempts',j.attempts,'last_error_code',j.last_error_code,
    'parameters',control_plane.audit_detail_summary_v1(j.parameters),
    'requested_by_email',ro.email,'approved_by_email',ao.email,'reason',j.reason,
    'needs_approval',j.kind in ('close_instance','rotate_secret','retire_domain') and j.approved_by is null and j.status = 'queued',
    'locked_until',j.locked_until,'created_at',j.created_at,'started_at',j.started_at,
    'updated_at',j.updated_at,'completed_at',j.completed_at,'cancelled_at',j.cancelled_at,
    'events',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'event',e.event,'attempt',e.attempt,'error_code',e.error_code,
        'actor_email',eo.email,'at',e.occurred_at) order by e.id)
      from control_plane.job_events e
      left join control_plane.operators eo on eo.auth_user_id = e.actor_id
      where e.job_id = j.id),'[]'::jsonb))
  into v_doc
  from control_plane.jobs j
  left join app.tenants t on t.id = j.tenant_id
  left join control_plane.operators ro on ro.auth_user_id = j.requested_by
  left join control_plane.operators ao on ao.auth_user_id = j.approved_by
  where j.id = p_job_id;
  if v_doc is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  return v_doc;
end;
$function$;

create or replace function control_plane.claim_job_v1(p_kinds text[] default null, p_lock_seconds integer default 300)
returns table (job_id uuid, kind text, tenant_id uuid, instance_id uuid, parameters jsonb, attempt integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_job control_plane.jobs%rowtype;
begin
  if not control_plane.is_worker_v1() then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  select * into v_job from control_plane.jobs j
  where (j.status = 'queued' or (j.status = 'running' and j.locked_until < v_now))
    and (p_kinds is null or j.kind = any(p_kinds))
    and (j.kind not in ('close_instance','rotate_secret','retire_domain') or j.approved_by is not null)
    and j.kind<>'retire_domain'
    and (j.kind not in ('close_instance','rotate_secret') or exists(
      select 1 from control_plane.operators op where op.auth_user_id=j.approved_by
        and op.disabled_at is null and op.role in ('admin','break_glass')
        and (op.expires_at is null or op.expires_at>v_now)))
    and j.attempts < 20
  order by j.created_at
  for update skip locked
  limit 1;
  if v_job.id is null then
    return;
  end if;
  update control_plane.jobs j set status = 'running', attempts = j.attempts + 1,
    started_at = coalesce(j.started_at,v_now),
    locked_until = v_now + pg_catalog.make_interval(secs => greatest(coalesce(p_lock_seconds,300),30)),
    updated_at = v_now
  where j.id = v_job.id
  returning * into v_job;
  insert into control_plane.job_events(job_id,event,attempt) values (v_job.id,'claimed',v_job.attempts);
  return query select v_job.id,v_job.kind,v_job.tenant_id,v_job.instance_id,v_job.parameters,v_job.attempts;
end;
$function$;

create or replace function control_plane.complete_job_v1(p_job_id uuid, p_outcome text, p_error_code text default null)
returns table (job_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_job control_plane.jobs%rowtype;
begin
  if not control_plane.is_worker_v1() then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if p_outcome is null or p_outcome not in ('succeeded','failed')
     or (p_error_code is not null and p_error_code !~ '^[a-z][a-z0-9_]{2,60}$') then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  select * into v_job from control_plane.jobs j where j.id = p_job_id for update;
  if v_job.id is null or v_job.status <> 'running' then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  if p_outcome = 'succeeded' and v_job.kind = 'verify_domain' and not exists (
    select 1 from app.tenant_domains d where d.id::text = v_job.parameters->>'domain_id'
      and d.tenant_id = v_job.tenant_id and d.instance_id = v_job.instance_id
      and d.verification_status = 'verified' and d.verified_at is not null) then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  if v_job.kind='retire_domain' then raise exception using errcode='22023',message='review_required'; end if;
  if p_outcome='succeeded' and v_job.kind='close_instance' then
    perform id from app.tenants where id=v_job.tenant_id for update;
    perform id from app.instances where id=v_job.instance_id and tenant_id=v_job.tenant_id for update;
    if not exists(select 1 from app.tenants where id=v_job.tenant_id and status='suspended')
      or not exists(select 1 from app.instances where id=v_job.instance_id and tenant_id=v_job.tenant_id
        and deployment_state='suspended') then raise exception using errcode='22023',message='suspend_before_closure'; end if;
    if v_job.approved_by is null or v_job.approved_by=v_job.requested_by or not exists(
      select 1 from control_plane.operators op where op.auth_user_id=v_job.approved_by
        and op.disabled_at is null and op.role in ('admin','break_glass')
        and (op.expires_at is null or op.expires_at>v_now)) then
      raise exception using errcode='42501',message='second_operator_required'; end if;
    if exists(select 1 from control_plane.jobs where instance_id=v_job.instance_id
        and id<>v_job.id and status in ('queued','running'))
      or exists(select 1 from control_plane.provisioning_runs where instance_id=v_job.instance_id and state<>'deactivated') then
      raise exception using errcode='55000',message='unfinished_job_conflict'; end if;
    if exists(select 1 from control_plane.instance_infrastructure where tenant_id=v_job.tenant_id
      and instance_id=v_job.instance_id and (desired_state->>'active' is distinct from 'false'
        or observed_state->>'active' is distinct from 'false' or observed_at is null)) then
      raise exception using errcode='55000',message='infrastructure_not_deactivated'; end if;
    update app.tenant_domains set active=false,updated_at=v_now where tenant_id=v_job.tenant_id and instance_id=v_job.instance_id;
    update app.instances set deployment_state='closed',updated_at=v_now where tenant_id=v_job.tenant_id and id=v_job.instance_id;
    perform control_plane.write_audit_v1(v_job.approved_by,'instance.closed',v_job.tenant_id,v_job.instance_id,
      'instance',v_job.instance_id::text,v_job.reason,jsonb_build_object('job_id',v_job.id,'requested_by',v_job.requested_by));
    if not exists(select 1 from app.instances where tenant_id=v_job.tenant_id and deployment_state<>'closed') then
      update app.tenants set status='closed',updated_at=v_now where id=v_job.tenant_id;
      perform control_plane.write_audit_v1(v_job.approved_by,'tenant.closed',v_job.tenant_id,null,
        'tenant',v_job.tenant_id::text,v_job.reason,jsonb_build_object('job_id',v_job.id));
    end if;
  end if;
  update control_plane.jobs j set status = p_outcome, locked_until = null,
    last_error_code = case when p_outcome = 'failed' then coalesce(p_error_code,'unknown_error') end,
    completed_at = case when p_outcome = 'succeeded' then v_now end, updated_at = v_now
  where j.id = p_job_id;
  insert into control_plane.job_events(job_id,event,attempt,error_code)
  values (p_job_id,p_outcome,v_job.attempts,p_error_code);
  return query select p_job_id,p_outcome;
end;
$function$;

create or replace function control_plane.set_tenant_status_v1(
  p_tenant_id uuid, p_status text, p_reason text, p_expected_status text)
returns table (tenant_id uuid, status text, updated_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_tenant app.tenants%rowtype;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 10 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  select * into v_tenant from app.tenants t where t.id = p_tenant_id for update;
  if v_tenant.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if v_tenant.status is distinct from p_expected_status then
    raise exception using errcode='40001',message='stale_revision';
  end if;
  if not ((v_tenant.status = 'active' and p_status = 'suspended')
       or (v_tenant.status = 'suspended' and p_status = 'active')) then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;

  if p_status='active' and exists(select 1 from control_plane.jobs j
    where j.tenant_id=p_tenant_id and j.kind='close_instance' and j.status in ('queued','running')) then
    raise exception using errcode='55000',message='unfinished_job_conflict'; end if;
  update app.tenants t set status = p_status, updated_at = v_now where t.id = p_tenant_id;
  perform control_plane.write_audit_v1(v_operator,
    case p_status when 'suspended' then 'tenant.suspended' else 'tenant.reactivated' end,
    p_tenant_id,null,'tenant',p_tenant_id::text,p_reason,
    pg_catalog.jsonb_build_object('from',v_tenant.status,'to',p_status));
  return query select p_tenant_id, p_status, v_now;
end;
$function$;

-- Narrow exposed entry points; no control_plane schema usage for application roles.

create or replace function api_v1.get_instance_configuration_v1(p_instance_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select control_plane.get_instance_configuration_v1(p_instance_id);
$$;
revoke all on function api_v1.get_instance_configuration_v1(uuid) from public,anon,authenticated;
grant execute on function api_v1.get_instance_configuration_v1(uuid) to authenticated;
revoke all on function control_plane.get_instance_configuration_v1(uuid) from public,anon,authenticated;

create or replace function api_v1.update_instance_configuration_v1(p_instance_id uuid,p_display_name text,p_expected_revision bigint,p_reason text,p_idempotency_key text)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select control_plane.update_instance_configuration_v1(p_instance_id,p_display_name,p_expected_revision,p_reason,p_idempotency_key);
$$;
revoke all on function api_v1.update_instance_configuration_v1(uuid,text,bigint,text,text) from public,anon,authenticated;
grant execute on function api_v1.update_instance_configuration_v1(uuid,text,bigint,text,text) to authenticated;
revoke all on function control_plane.update_instance_configuration_v1(uuid,text,bigint,text,text) from public,anon,authenticated;

create or replace function api_v1.deactivate_instance_by_id_v1(p_instance_id uuid,p_reason text,p_expected_state text,p_idempotency_key text)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select control_plane.deactivate_instance_by_id_v1(p_instance_id,p_reason,p_expected_state,p_idempotency_key);
$$;
revoke all on function api_v1.deactivate_instance_by_id_v1(uuid,text,text,text) from public,anon,authenticated;
grant execute on function api_v1.deactivate_instance_by_id_v1(uuid,text,text,text) to authenticated;
revoke all on function control_plane.deactivate_instance_by_id_v1(uuid,text,text,text) from public,anon,authenticated;

create or replace function api_v1.request_instance_closure_v1(p_instance_id uuid,p_reason text,p_confirmation text,p_idempotency_key text)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select control_plane.request_instance_closure_v1(p_instance_id,p_reason,p_confirmation,p_idempotency_key);
$$;
revoke all on function api_v1.request_instance_closure_v1(uuid,text,text,text) from public,anon,authenticated;
grant execute on function api_v1.request_instance_closure_v1(uuid,text,text,text) to authenticated;
revoke all on function control_plane.request_instance_closure_v1(uuid,text,text,text) from public,anon,authenticated;

create or replace function api_v1.request_domain_retirement_v1(p_domain_id uuid,p_replacement_domain_id uuid,p_reason text,p_idempotency_key text)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select control_plane.request_domain_retirement_v1(p_domain_id,p_replacement_domain_id,p_reason,p_idempotency_key);
$$;
revoke all on function api_v1.request_domain_retirement_v1(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function api_v1.request_domain_retirement_v1(uuid,uuid,text,text) to authenticated;
revoke all on function control_plane.request_domain_retirement_v1(uuid,uuid,text,text) from public,anon,authenticated;

create or replace function api_v1.list_operator_reviews_v1(p_status text default 'pending',p_kind text default null,p_limit integer default 25,p_offset integer default 0)
returns jsonb language sql stable security definer set search_path = '' as $$
  select control_plane.list_operator_reviews_v1(p_status,p_kind,p_limit,p_offset);
$$;
revoke all on function api_v1.list_operator_reviews_v1(text,text,integer,integer) from public,anon,authenticated;
grant execute on function api_v1.list_operator_reviews_v1(text,text,integer,integer) to authenticated;
revoke all on function control_plane.list_operator_reviews_v1(text,text,integer,integer) from public,anon,authenticated;

create or replace function api_v1.get_operator_review_v1(p_kind text,p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select control_plane.get_operator_review_v1(p_kind,p_id);
$$;
revoke all on function api_v1.get_operator_review_v1(text,uuid) from public,anon,authenticated;
grant execute on function api_v1.get_operator_review_v1(text,uuid) to authenticated;
revoke all on function control_plane.get_operator_review_v1(text,uuid) from public,anon,authenticated;

create or replace function api_v1.decide_operator_review_v1(p_kind text,p_id uuid,p_decision text,p_reason text,p_idempotency_key text)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select control_plane.decide_operator_review_v1(p_kind,p_id,p_decision,p_reason,p_idempotency_key);
$$;
revoke all on function api_v1.decide_operator_review_v1(text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function api_v1.decide_operator_review_v1(text,uuid,text,text,text) to authenticated;
revoke all on function control_plane.decide_operator_review_v1(text,uuid,text,text,text) from public,anon,authenticated;

revoke all on function control_plane.require_lifecycle_reason_v1(text) from public,anon,authenticated;

revoke all on function control_plane.validate_domain_retirement_v1(uuid,uuid) from public,anon,authenticated;

revoke all on function control_plane.operator_review_rows_v1() from public,anon,authenticated;

revoke all on function control_plane.guard_retired_domain_v1() from public,anon,authenticated;

revoke all on function control_plane.guard_instance_lifecycle_v1() from public,anon,authenticated;

revoke all on function control_plane.guard_job_tenant_v1() from public,anon,authenticated;

-- Tenant closure keeps per-instance jobs workflow-owned and reviewable.
create or replace function control_plane.request_tenant_closure_v1(
  p_tenant_id uuid, p_reason text, p_confirmation text, p_idempotency_key text)
returns table (job_ids uuid[])
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_tenant app.tenants%rowtype;
  v_prior jsonb;
  v_request jsonb := pg_catalog.jsonb_build_object('tenant_id',p_tenant_id,'reason',pg_catalog.btrim(p_reason),'confirmation',p_confirmation);
  v_ids uuid[] := '{}'::uuid[];
  v_id uuid;
  v_instance record;
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  v_prior := control_plane.replay_request_v1(p_idempotency_key,'tenant.closure',v_request);
  if v_prior is not null then
    return query select (select pg_catalog.array_agg(x::uuid)
      from pg_catalog.jsonb_array_elements_text(v_prior->'job_ids') x);
    return;
  end if;
  perform control_plane.require_lifecycle_reason_v1(p_reason);
  select * into v_tenant from app.tenants t where t.id = p_tenant_id for update;
  if v_tenant.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if p_confirmation is distinct from v_tenant.name then
    raise exception using errcode='22023',message='confirmation_mismatch';
  end if;
  if v_tenant.status <> 'suspended' then
    raise exception using errcode='22023',message='suspend_before_closure';
  end if;

  for v_instance in
    select i.id from app.instances i
    where i.tenant_id = p_tenant_id and i.deployment_state <> 'closed'
    order by i.created_at
  loop
    if exists(select 1 from control_plane.jobs j where j.instance_id=v_instance.id and j.status in ('queued','running')) then
      raise exception using errcode='55000',message='unfinished_job_conflict'; end if;
    v_id:=control_plane.enqueue_operator_job_v1(v_operator,'close_instance',p_tenant_id,v_instance.id,
      jsonb_build_object('reason_recorded',true),
      'tenant-close:'||encode(sha256(convert_to(p_idempotency_key||':'||v_instance.id::text,'UTF8')),'hex'),p_reason);
    v_ids := v_ids || v_id;
  end loop;

  perform control_plane.write_audit_v1(v_operator,'tenant.closure_requested',p_tenant_id,null,
    'tenant',p_tenant_id::text,p_reason,pg_catalog.jsonb_build_object('job_ids',pg_catalog.to_jsonb(v_ids)));
  perform control_plane.remember_request_v1(p_idempotency_key,'tenant.closure',
    pg_catalog.jsonb_build_object('job_ids',pg_catalog.to_jsonb(v_ids)),v_request);
  return query select v_ids;
end;
$function$;

-- Older provisioning callers also retain state/reason idempotency and closed-state guards.
create or replace function control_plane.deactivate_instance_v1(
  p_run_id uuid,
  p_reason text
)
returns table (run_state text, resources_deactivated integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_operator uuid;
  v_run control_plane.provisioning_runs%rowtype;
  v_count integer;
begin
  perform control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  perform control_plane.require_lifecycle_reason_v1(p_reason);
  v_operator := (select private.current_auth_user_id());

  select * into v_run from control_plane.provisioning_runs r where r.id = p_run_id;
  if v_run.id is null then
    raise exception using errcode='42501',message='policy_denied';
  end if;

  perform i.id from app.instances i where i.tenant_id=v_run.tenant_id and i.id=v_run.instance_id for update;
  select * into v_run from control_plane.provisioning_runs r where r.id=p_run_id for update;
  if exists(select 1 from app.instances i where i.id=v_run.instance_id and i.deployment_state='closed') then
    raise exception using errcode='22023',message='transition_not_allowed'; end if;
  if v_run.state='deactivated' then
    if v_run.deactivation_reason is distinct from btrim(p_reason) then
      raise exception using errcode='22023',message='transition_not_allowed'; end if;
    return query select 'deactivated'::text,(select count(*)::int from control_plane.instance_infrastructure
      where tenant_id=v_run.tenant_id and instance_id=v_run.instance_id and desired_state->>'active'='false');
    return;
  end if;
  if exists(select 1 from control_plane.jobs j where j.instance_id=v_run.instance_id and j.status='running') then
    raise exception using errcode='55000',message='unfinished_job_conflict'; end if;
  update control_plane.instance_infrastructure f
  set desired_state = f.desired_state || jsonb_build_object('active',false),
      updated_at = v_now
  where f.tenant_id = v_run.tenant_id and f.instance_id = v_run.instance_id;
  get diagnostics v_count = row_count;

  -- Suspended, never closed: closing is an offboarding decision with its own
  -- sequence, not a consequence of a provisioning failure.
  update app.instances i
  set deployment_state = 'suspended', updated_at = v_now
  where i.tenant_id = v_run.tenant_id and i.id = v_run.instance_id
    and i.deployment_state <> 'closed';

  update control_plane.provisioning_runs r
  set state = 'deactivated', deactivated_at = v_now,
      deactivation_reason = pg_catalog.btrim(p_reason), updated_at = v_now
  where r.id = p_run_id;

  insert into control_plane.provisioning_events(run_id,event,detail)
  values (p_run_id,'deactivated',jsonb_build_object('reason',pg_catalog.btrim(p_reason),
    'resources_deactivated',v_count));
  insert into control_plane.audit_events(operator_id,action,tenant_id,instance_id,detail)
  values (v_operator,'provisioning.deactivated',v_run.tenant_id,v_run.instance_id,
    jsonb_build_object('run_id',p_run_id,'reason',pg_catalog.btrim(p_reason)));

  return query select 'deactivated'::text,v_count;
end;
$function$;

-- Additive private read metadata: old fields, arguments and filters remain.
-- TABLE results need explicit recreation to append OUT columns in PostgreSQL;
-- do not use CASCADE or change historical migrations. Grants are restored below.
create or replace function control_plane.get_tenant_v1(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_tenant app.tenants%rowtype;
begin
  perform control_plane.require_operator_v1('viewer');
  select * into v_tenant from app.tenants t where t.id = p_tenant_id;
  if v_tenant.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;

  return pg_catalog.jsonb_build_object(
    'tenant', pg_catalog.jsonb_build_object('id',v_tenant.id,'name',v_tenant.name,
      'status',v_tenant.status,'created_at',v_tenant.created_at,'updated_at',v_tenant.updated_at),
    'brands', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',b.id,'key',b.key,'status',b.status) order by b.created_at)
      from app.brands b where b.tenant_id = p_tenant_id),'[]'::jsonb),
    'subscription', (select pg_catalog.jsonb_build_object('plan_key',s.plan_key,'state',s.state,
        'rollout_ring',s.rollout_ring,'started_at',s.started_at,'ends_at',s.ends_at,'updated_at',s.updated_at)
      from control_plane.subscriptions s where s.tenant_id = p_tenant_id),
    'plan', (select pg_catalog.jsonb_build_object('key',p.key,'name',p.name,'entitlements',p.entitlements,'active',p.active)
      from control_plane.subscriptions s join control_plane.plans p on p.key = s.plan_key
      where s.tenant_id = p_tenant_id),
    'entitlements', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'feature_key',e.feature_key,'granted',e.granted,'source',e.source,
        'expires_at',e.expires_at,'updated_at',e.updated_at) order by e.feature_key)
      from app.tenant_entitlements e where e.tenant_id = p_tenant_id),'[]'::jsonb),
    'domains', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',d.id,'instance_id',d.instance_id,'hostname',d.hostname,'application',d.application,
        'kind',d.kind,'verification_status',d.verification_status,'verified_at',d.verified_at,
        'active',d.active,'retired_at',d.retired_at,'replacement_domain_id',d.replacement_domain_id,
        'pending_retirement_job_id',(select j.id from control_plane.jobs j
          where j.tenant_id=d.tenant_id and j.instance_id=d.instance_id and j.kind='retire_domain'
            and j.status in ('queued','running') and j.parameters->>'domain_id'=d.id::text
          order by j.created_at desc,j.id desc limit 1)) order by d.hostname)
      from app.tenant_domains d where d.tenant_id = p_tenant_id),'[]'::jsonb),
    'instances', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',i.id,'deployment_state',i.deployment_state,'brand_id',i.brand_id,
        'brand_published',i.published_brand_revision_id is not null,
        'desired_release',r.desired_release,'current_release',r.current_release,
        'reported_at',r.reported_at,'created_at',i.created_at) order by i.created_at)
      from app.instances i
      left join control_plane.instance_release_state r on r.tenant_id = i.tenant_id and r.instance_id = i.id
      where i.tenant_id = p_tenant_id),'[]'::jsonb),
    'provisioning_runs', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',r.id,'instance_id',r.instance_id,'slug',r.slug,'state',r.state,
        'waiting_reason',r.waiting_reason,'last_error_code',r.last_error_code,
        'created_at',r.created_at,'updated_at',r.updated_at) order by r.created_at desc)
      from control_plane.provisioning_runs r where r.tenant_id = p_tenant_id),'[]'::jsonb),
    'jobs', coalesce((select pg_catalog.jsonb_agg(x.j order by x.created_at desc) from (
        select j.created_at, pg_catalog.jsonb_build_object('id',j.id,'kind',j.kind,'status',j.status,
          'attempts',j.attempts,'last_error_code',j.last_error_code,
          'needs_approval',j.kind in ('close_instance','rotate_secret','retire_domain') and j.approved_by is null and j.status = 'queued',
          'created_at',j.created_at) as j
        from control_plane.jobs j where j.tenant_id = p_tenant_id
        order by j.created_at desc limit 20) x),'[]'::jsonb),
    'support_grants', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',g.id,'status',case when g.status = 'active' and g.expires_at <= pg_catalog.statement_timestamp()
          then 'expired' else g.status end,
        'ticket_reference',g.ticket_reference,'scope',g.scope,'expires_at',g.expires_at,
        'requested_at',g.requested_at) order by g.requested_at desc)
      from control_plane.support_grants g where g.tenant_id = p_tenant_id),'[]'::jsonb),
    'audit', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) - 'total_count')
      from control_plane.audit_rows_v1(null,null,p_tenant_id,null,null,null,null,20,0) a),'[]'::jsonb)
  );
end;
$function$;

drop function api_v1.list_domains_v1(text,text,integer,integer);
drop function control_plane.list_domains_v1(text,text,integer,integer);
create or replace function control_plane.list_domains_v1(
  p_search text default null, p_status text default null,
  p_limit integer default 25, p_offset integer default 0)
returns table (domain_id uuid, hostname text, tenant_id uuid, tenant_name text, instance_id uuid,
  application text, kind text, verification_status text, verified_at timestamptz, active boolean,
  certificate_status text, certificate_observed_at timestamptz, pending_job_id uuid,
  created_at timestamptz, total_count bigint, retired_at timestamptz, replacement_domain_id uuid,
  pending_retirement_job_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  select d.id, d.hostname, d.tenant_id, t.name, d.instance_id, d.application, d.kind,
    d.verification_status, d.verified_at, d.active,
    -- Only what a worker reported. Null renders as "Not reported".
    f.observed_state->>'certificate_status', f.observed_at,
    (select j.id from control_plane.jobs j where j.kind = 'verify_domain'
       and j.status in ('queued','running') and j.parameters->>'domain_id' = d.id::text
       order by j.created_at desc limit 1),
    d.created_at, pg_catalog.count(*) over (), d.retired_at, d.replacement_domain_id,
    (select j.id from control_plane.jobs j where j.tenant_id=d.tenant_id and j.instance_id=d.instance_id
       and j.kind='retire_domain' and j.status in ('queued','running')
       and j.parameters->>'domain_id'=d.id::text order by j.created_at desc,j.id desc limit 1)
  from app.tenant_domains d
  join app.tenants t on t.id = d.tenant_id
  left join control_plane.instance_infrastructure f
    on f.provider = 'vercel' and f.resource_kind = 'domain' and f.tenant_id = d.tenant_id
   and f.observed_state->>'hostname' = d.hostname
  where (p_status is null or d.verification_status = p_status)
    and (coalesce(pg_catalog.btrim(p_search),'') = ''
      or pg_catalog.strpos(d.hostname, pg_catalog.lower(pg_catalog.btrim(p_search))) > 0
      or pg_catalog.strpos(pg_catalog.lower(t.name), pg_catalog.lower(pg_catalog.btrim(p_search))) > 0)
  order by d.hostname
  limit least(greatest(coalesce(p_limit,25),1),100) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function api_v1.list_domains_v1(p_search text default null, p_status text default null,
  p_limit integer default 25, p_offset integer default 0)
returns table (domain_id uuid, hostname text, tenant_id uuid, tenant_name text, instance_id uuid,
  application text, kind text, verification_status text, verified_at timestamptz, active boolean,
  certificate_status text, certificate_observed_at timestamptz, pending_job_id uuid,
  created_at timestamptz, total_count bigint, retired_at timestamptz, replacement_domain_id uuid,
  pending_retirement_job_id uuid)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_domains_v1(p_search,p_status,p_limit,p_offset); $$;

revoke all on function control_plane.get_tenant_v1(uuid),
  control_plane.list_domains_v1(text,text,integer,integer),
  api_v1.list_domains_v1(text,text,integer,integer) from public,anon,authenticated;
grant execute on function api_v1.list_domains_v1(text,text,integer,integer) to authenticated;
