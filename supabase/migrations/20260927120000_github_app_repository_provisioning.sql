-- Issue #31. GitHub App repository provisioning needs durable evidence that a
-- signed delivery arrived, without retaining the body that may contain data we
-- have no reason to keep. The provisioning run remains the state machine; this
-- table is only the canonical ingress/deduplication ledger.

create table control_plane.github_webhook_deliveries (
  id bigint generated always as identity primary key,
  delivery_id text not null unique
    check (delivery_id ~ '^[A-Za-z0-9-]{8,200}$'),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  event_name text not null check (event_name in (
    'installation','installation_repositories','repository','repository_vulnerability_alert',
    'repository_dispatch','check_run','check_suite','deployment','deployment_status',
    'meta','ping','push','security_advisory','status','workflow_job','workflow_run')),
  repository_external_id text check (repository_external_id is null
    or repository_external_id ~ '^[A-Za-z0-9_-]{3,200}$'),
  action text check (action is null or action ~ '^[a-z_]{2,80}$'),
  received_at timestamptz not null default pg_catalog.statement_timestamp(),
  check (delivery_id <> payload_sha256)
);

alter table control_plane.github_webhook_deliveries enable row level security;
create policy github_webhook_deliveries_no_application_access
  on control_plane.github_webhook_deliveries
  for all to anon,authenticated using (false) with check (false);
revoke all on control_plane.github_webhook_deliveries from public,anon,authenticated;

create or replace function control_plane.record_github_webhook_delivery_v1(
  p_delivery_id text,
  p_payload_sha256 text,
  p_event_name text,
  p_repository_external_id text default null,
  p_action text default null
)
returns table (duplicate boolean, reconciliation_queued boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_infrastructure control_plane.instance_infrastructure%rowtype;
  v_inserted boolean := false;
begin
  if not control_plane.is_worker_v1() then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if p_delivery_id !~ '^[A-Za-z0-9-]{8,200}$'
     or p_payload_sha256 !~ '^[a-f0-9]{64}$'
     or p_event_name not in (
       'installation','installation_repositories','repository','repository_vulnerability_alert',
       'repository_dispatch','check_run','check_suite','deployment','deployment_status',
       'meta','ping','push','security_advisory','status','workflow_job','workflow_run')
     or (p_repository_external_id is not null and p_repository_external_id !~ '^[A-Za-z0-9_-]{3,200}$')
     or (p_action is not null and p_action !~ '^[a-z_]{2,80}$') then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;

  insert into control_plane.github_webhook_deliveries(
    delivery_id,payload_sha256,event_name,repository_external_id,action)
  values (p_delivery_id,p_payload_sha256,p_event_name,p_repository_external_id,p_action)
  on conflict (delivery_id) do nothing;
  get diagnostics v_inserted = row_count;

  if not v_inserted then
    return query select true,false;
    return;
  end if;

  if p_repository_external_id is not null then
    select f.* into v_infrastructure
    from control_plane.instance_infrastructure f
    where f.provider='github' and f.resource_kind='repository'
      and f.external_id=p_repository_external_id;
    if v_infrastructure.id is not null then
      perform control_plane.enqueue_job_v1(
        'reconcile_drift',v_infrastructure.tenant_id,v_infrastructure.instance_id,
        jsonb_build_object(
          'provider','github',
          'repository_external_id',p_repository_external_id,
          'delivery_id',p_delivery_id,
          'event',p_event_name,
          'action',p_action));
      return query select false,true;
      return;
    end if;
  end if;

  return query select false,false;
end;
$function$;

revoke all on function control_plane.record_github_webhook_delivery_v1(text,text,text,text,text)
  from public,anon,authenticated;
