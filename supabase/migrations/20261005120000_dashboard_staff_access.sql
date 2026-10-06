-- Completion Task 7. Login access is separate from staff allocation state.
alter table app.invitations add column revision bigint not null default 1 check (revision > 0);

create table app.staff_access_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  actor_id uuid not null, effective_actor_id uuid not null,
  request_id uuid not null, request_hash text not null,
  action text not null, target_id uuid not null,
  result jsonb not null, created_at timestamptz not null default statement_timestamp(),
  unique (tenant_id, request_id)
);
alter table app.staff_access_events enable row level security;
create policy staff_access_events_read on app.staff_access_events for select to authenticated
  using ((select private.has_direct_capability(tenant_id,'audit.read')));
create trigger staff_access_events_append_only before update or delete on app.staff_access_events
  for each row execute function private.enforce_append_only();
revoke all on app.staff_access_events from public,anon,authenticated;
grant select on app.staff_access_events to authenticated;

create table private.staff_invitation_deliveries (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null, invitation_id uuid not null, invitation_revision bigint not null,
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','superseded')),
  attempt integer not null default 0, lease_until timestamptz,
  available_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  unique (tenant_id,invitation_id,invitation_revision),
  foreign key (tenant_id,invitation_id) references app.invitations(tenant_id,id)
);
alter table private.staff_invitation_deliveries enable row level security;
revoke all on private.staff_invitation_deliveries from public,anon,authenticated,service_role;

create function private.dashboard_recent_aal2()
returns boolean language sql stable security invoker set search_path='' as $$
  select coalesce((select private.is_aal2()),false) and exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(auth.jwt()->'amr')='array' then auth.jwt()->'amr' else '[]'::jsonb end) a
    where a->>'method' in ('totp','phone','webauthn')
      and jsonb_typeof(a->'timestamp')='number'
      and case when a->>'timestamp' ~ '^[0-9]{1,12}$' then
        (a->>'timestamp')::bigint between extract(epoch from statement_timestamp())::bigint-300 and extract(epoch from statement_timestamp())::bigint
        else false end
  );
$$;
revoke all on function private.dashboard_recent_aal2() from public;
grant execute on function private.dashboard_recent_aal2() to authenticated;

create function private.guard_last_tenant_administrator()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status='active' and exists(select 1 from app.roles r where r.tenant_id=old.tenant_id and r.id=old.role_id and r.key='tenant_admin') then
    -- A version write also makes repeatable-read racers serialize/fail instead
    -- of judging the last-admin count from a stale transaction snapshot.
    update app.tenants t set updated_at=statement_timestamp() where t.id=old.tenant_id;
    if tg_op='DELETE' or new.status<>'active' or new.role_id<>old.role_id then
      if not exists(select 1 from app.memberships m join app.roles r on r.tenant_id=m.tenant_id and r.id=m.role_id
        where m.tenant_id=old.tenant_id and m.id<>old.id and m.status='active' and r.key='tenant_admin') then
        raise exception using errcode='22023',message='last_administrator_required';
      end if;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.guard_last_tenant_administrator() from public,anon,authenticated,service_role;
create trigger memberships_last_administrator before update of status,role_id or delete on app.memberships
  for each row execute function private.guard_last_tenant_administrator();

create function private.get_staff_access_workspace_v1(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not coalesce(private.has_direct_capability(p_tenant_id,'staff.manage'),false) then
    raise exception using errcode='42501',message='not_authorized';
  end if;
  return jsonb_build_object('version',1,'tenant_id',p_tenant_id,
    'roles',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'key',r.key) order by r.key) from app.roles r where r.tenant_id=p_tenant_id),'[]'::jsonb),
    'locations',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name) order by l.name) from app.locations l where l.tenant_id=p_tenant_id and l.status='active'),'[]'::jsonb),
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',coalesce(s.public_name,u.email),'email',u.email,
      'role_id',m.role_id,'status',m.status,'revision',m.revision,'location_ids',coalesce((select jsonb_agg(x.location_id order by x.location_id) from app.membership_location_scopes x where x.tenant_id=m.tenant_id and x.membership_id=m.id),'[]'::jsonb)) order by m.joined_at,m.id)
      from app.memberships m join auth.users u on u.id=m.auth_user_id left join app.staff_profiles s on s.tenant_id=m.tenant_id and s.membership_id=m.id where m.tenant_id=p_tenant_id),'[]'::jsonb),
    'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.invitee_email,'role_id',i.role_id,
      'status',case when i.status='pending' and i.expires_at<=statement_timestamp() then 'expired' else i.status end,'expires_at',i.expires_at,'revision',i.revision,
      'location_ids',coalesce((select jsonb_agg(x.location_id order by x.location_id) from app.invitation_location_scopes x where x.tenant_id=i.tenant_id and x.invitation_id=i.id),'[]'::jsonb),
      'delivery_status',coalesce((select j.status from private.staff_invitation_deliveries j where j.tenant_id=i.tenant_id and j.invitation_id=i.id order by j.invitation_revision desc limit 1),'unconfigured')) order by i.created_at desc,i.id)
      from app.invitations i where i.tenant_id=p_tenant_id),'[]'::jsonb));
end;
$$;

create function private.change_staff_access_v1(p_tenant_id uuid,p_request_id uuid,p_action text,p_target_id uuid,p_expected_revision bigint,p_role_id uuid,p_location_ids uuid[],p_email text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_hash text; v_prior app.staff_access_events%rowtype; v_member app.memberships%rowtype;
  v_invite app.invitations%rowtype; v_id uuid; v_revision bigint; v_result jsonb; v_role text; v_old_role text;
begin
  perform 1 from app.tenants t where t.id=p_tenant_id and t.status='active' for update;
  if not found or not coalesce(private.has_direct_capability(p_tenant_id,'staff.manage'),false) then
    raise exception using errcode='42501',message='not_authorized';
  end if;
  if p_request_id is null or p_action not in ('invite','resend','revoke_invitation','edit_membership','revoke_membership') or p_action is null then
    raise exception using errcode='22023',message='invalid_request';
  end if;
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_array(p_tenant_id,p_request_id,p_action,p_target_id,p_expected_revision,p_role_id,p_location_ids,lower(btrim(p_email)))::text,'UTF8'),'sha256'),'hex');
  select * into v_prior from app.staff_access_events e where e.tenant_id=p_tenant_id and e.request_id=p_request_id;
  if found then
    if v_prior.actor_id<>private.current_auth_user_id() or v_prior.request_hash<>v_hash then raise exception using errcode='22023',message='idempotency_conflict'; end if;
    return v_prior.result || jsonb_build_object('replayed',true);
  end if;
  if p_action in ('invite','edit_membership') then
    select r.key into v_role from app.roles r where r.tenant_id=p_tenant_id and r.id=p_role_id;
    if not found or coalesce(cardinality(p_location_ids),0)>100 or exists(select 1 from unnest(p_location_ids) l where not exists(select 1 from app.locations x where x.tenant_id=p_tenant_id and x.id=l and x.status='active'))
      or (v_role='location_manager' and coalesce(cardinality(p_location_ids),0)=0) then raise exception using errcode='22023',message='invalid_request'; end if;
  end if;
  if p_action in ('edit_membership','revoke_membership') then
    select * into v_member from app.memberships m where m.tenant_id=p_tenant_id and m.id=p_target_id for update;
    if not found then raise exception using errcode='42501',message='not_authorized'; end if;
    if p_expected_revision is null or v_member.revision<>p_expected_revision then raise exception using errcode='40001',message='revision_conflict'; end if;
    select r.key into v_old_role from app.roles r where r.tenant_id=p_tenant_id and r.id=v_member.role_id;
  elsif p_action in ('resend','revoke_invitation') then
    select * into v_invite from app.invitations i where i.tenant_id=p_tenant_id and i.id=p_target_id for update;
    if not found then raise exception using errcode='42501',message='not_authorized'; end if;
    if p_expected_revision is null or v_invite.revision<>p_expected_revision then raise exception using errcode='40001',message='revision_conflict'; end if;
    if v_invite.status not in ('pending','expired') then raise exception using errcode='22023',message='invitation_not_pending'; end if;
    select r.key into v_old_role from app.roles r where r.tenant_id=p_tenant_id and r.id=v_invite.role_id;
  end if;
  if v_role='tenant_admin' or v_old_role='tenant_admin' then
    if not exists(select 1 from app.memberships m join app.role_permissions rp on rp.tenant_id=m.tenant_id and rp.role_id=m.role_id where m.tenant_id=p_tenant_id and m.auth_user_id=private.current_auth_user_id() and m.status='active' and rp.permission_key='tenant.owner_transfer' and rp.scope_kind='tenant' and rp.grant_kind in ('direct','approval')) or not private.dashboard_recent_aal2() then
      raise exception using errcode='42501',message='step_up_required';
    end if;
  end if;
  if p_action='invite' then
    if p_email is null or length(p_email)>254 or lower(btrim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception using errcode='22023',message='invalid_request'; end if;
    update app.invitations i set status='expired',revision=i.revision+1,updated_at=statement_timestamp() where i.tenant_id=p_tenant_id and i.invitee_email=lower(btrim(p_email)) and i.status='pending' and i.expires_at<=statement_timestamp();
    if exists(select 1 from app.memberships m join auth.users u on u.id=m.auth_user_id where m.tenant_id=p_tenant_id and m.status='active' and lower(u.email)=lower(btrim(p_email))) then raise exception using errcode='22023',message='member_already_active'; end if;
    v_id:=pg_catalog.gen_random_uuid(); v_revision:=1;
    insert into app.invitations(id,tenant_id,role_id,invited_by_membership_id,invitee_email,token_hash,expires_at)
      values(v_id,p_tenant_id,p_role_id,private.current_membership_id(p_tenant_id),lower(btrim(p_email)),encode(extensions.digest(pg_catalog.gen_random_uuid()::text,'sha256'),'hex'),statement_timestamp()+interval '7 days');
    insert into app.invitation_location_scopes(tenant_id,invitation_id,location_id) select p_tenant_id,v_id,l from (select distinct unnest(p_location_ids) l) s;
  elsif p_action in ('edit_membership','revoke_membership') then
    v_id:=v_member.id; v_revision:=v_member.revision+1;
    update app.memberships m set role_id=case when p_action='edit_membership' then p_role_id else m.role_id end,
      status=case when p_action='revoke_membership' then 'revoked' else m.status end,
      revoked_at=case when p_action='revoke_membership' then statement_timestamp() else m.revoked_at end,revision=v_revision where m.tenant_id=p_tenant_id and m.id=v_id;
    if p_action='edit_membership' then
      delete from app.membership_location_scopes x where x.tenant_id=p_tenant_id and x.membership_id=v_id;
      insert into app.membership_location_scopes(tenant_id,membership_id,location_id) select p_tenant_id,v_id,l from (select distinct unnest(p_location_ids) l) s;
    end if;
  else
    v_id:=v_invite.id; v_revision:=v_invite.revision+1;
    update app.invitations i set status=case when p_action='resend' then 'pending' else 'revoked' end,
      expires_at=case when p_action='resend' then statement_timestamp()+interval '7 days' else i.expires_at end,
      revision=v_revision,updated_at=statement_timestamp() where i.tenant_id=p_tenant_id and i.id=v_id;
  end if;
  if p_action in ('invite','resend') then
    insert into private.staff_invitation_deliveries(tenant_id,invitation_id,invitation_revision) values(p_tenant_id,v_id,v_revision);
  end if;
  v_result:=jsonb_build_object('version',1,'id',v_id,'revision',v_revision,'replayed',false,'action',p_action);
  insert into app.staff_access_events(tenant_id,actor_id,effective_actor_id,request_id,request_hash,action,target_id,result)
    values(p_tenant_id,private.current_auth_user_id(),private.current_auth_user_id(),p_request_id,v_hash,p_action,v_id,v_result);
  return v_result;
end;
$$;

create function private.accept_staff_invitation_v1(p_invitation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_invite app.invitations%rowtype; v_user auth.users%rowtype; v_id uuid; v_replayed boolean:=false;
begin
  select * into v_user from auth.users u where u.id=private.current_auth_user_id() and u.email_confirmed_at is not null;
  if not found then raise exception using errcode='42501',message='invitation_unavailable'; end if;
  select * into v_invite from app.invitations i where i.id=p_invitation_id and i.invitee_email=lower(v_user.email);
  if not found then raise exception using errcode='42501',message='invitation_unavailable'; end if;
  perform 1 from app.tenants t where t.id=v_invite.tenant_id and t.status='active' for update;
  if not found then raise exception using errcode='42501',message='invitation_unavailable'; end if;
  select * into v_invite from app.invitations i where i.id=p_invitation_id for update;
  if v_invite.status='accepted' then
    select m.id into v_id from app.memberships m where m.tenant_id=v_invite.tenant_id and m.auth_user_id=v_user.id and m.status='active';
    if v_id is null then raise exception using errcode='42501',message='invitation_unavailable'; end if;
    return jsonb_build_object('version',1,'membership_id',v_id,'tenant_id',v_invite.tenant_id,'replayed',true);
  end if;
  if v_invite.status<>'pending' or v_invite.expires_at<=statement_timestamp() then raise exception using errcode='42501',message='invitation_unavailable'; end if;
  select m.id into v_id from app.memberships m where m.tenant_id=v_invite.tenant_id and m.auth_user_id=v_user.id for update;
  if v_id is null then
    v_id:=pg_catalog.gen_random_uuid();
    insert into app.memberships(id,tenant_id,auth_user_id,role_id) values(v_id,v_invite.tenant_id,v_user.id,v_invite.role_id);
  else
    update app.memberships m set role_id=v_invite.role_id,status='active',revoked_at=null,revision=m.revision+1 where m.tenant_id=v_invite.tenant_id and m.id=v_id and m.status<>'active';
    if not found then raise exception using errcode='22023',message='member_already_active'; end if;
  end if;
  delete from app.membership_location_scopes x where x.tenant_id=v_invite.tenant_id and x.membership_id=v_id;
  insert into app.membership_location_scopes(tenant_id,membership_id,location_id)
    select x.tenant_id,v_id,x.location_id from app.invitation_location_scopes x where x.tenant_id=v_invite.tenant_id and x.invitation_id=v_invite.id;
  update app.invitations i set status='accepted',accepted_at=statement_timestamp(),revision=i.revision+1,updated_at=statement_timestamp() where i.id=v_invite.id;
  insert into app.staff_access_events(tenant_id,actor_id,effective_actor_id,request_id,request_hash,action,target_id,result)
    values(v_invite.tenant_id,v_user.id,v_user.id,pg_catalog.gen_random_uuid(),'', 'accept_invitation',v_invite.id,jsonb_build_object('membership_id',v_id));
  return jsonb_build_object('version',1,'membership_id',v_id,'tenant_id',v_invite.tenant_id,'replayed',v_replayed);
end;
$$;

create function api_v1.get_staff_access_workspace_v1(p_tenant_id uuid) returns jsonb
  language sql security invoker set search_path='' as $$ select private.get_staff_access_workspace_v1(p_tenant_id); $$;
create function api_v1.change_staff_access_v1(p_tenant_id uuid,p_request_id uuid,p_action text,p_target_id uuid default null,p_expected_revision bigint default null,p_role_id uuid default null,p_location_ids uuid[] default '{}',p_email text default null) returns jsonb
  language sql security invoker set search_path='' as $$ select private.change_staff_access_v1(p_tenant_id,p_request_id,p_action,p_target_id,p_expected_revision,p_role_id,p_location_ids,p_email); $$;
create function api_v1.accept_staff_invitation_v1(p_invitation_id uuid) returns jsonb
  language sql security invoker set search_path='' as $$ select private.accept_staff_invitation_v1(p_invitation_id); $$;
revoke all on function private.get_staff_access_workspace_v1(uuid),private.change_staff_access_v1(uuid,uuid,text,uuid,bigint,uuid,uuid[],text),private.accept_staff_invitation_v1(uuid) from public,anon,service_role;
revoke all on function api_v1.get_staff_access_workspace_v1(uuid),api_v1.change_staff_access_v1(uuid,uuid,text,uuid,bigint,uuid,uuid[],text),api_v1.accept_staff_invitation_v1(uuid) from public,anon,service_role;
grant execute on function private.get_staff_access_workspace_v1(uuid),private.change_staff_access_v1(uuid,uuid,text,uuid,bigint,uuid,uuid[],text),private.accept_staff_invitation_v1(uuid) to authenticated;
grant execute on function api_v1.get_staff_access_workspace_v1(uuid),api_v1.change_staff_access_v1(uuid,uuid,text,uuid,bigint,uuid,uuid[],text),api_v1.accept_staff_invitation_v1(uuid) to authenticated;

create function private.claim_staff_invitation_delivery_v1()
returns table(job_id uuid,attempt integer,invitation_id uuid,recipient_email text,dashboard_hostname text,brand_name text)
language plpgsql security definer set search_path='' as $$
declare v_job private.staff_invitation_deliveries%rowtype;
begin
  if auth.role() is distinct from 'service_role' or private.current_auth_user_id() is not null then raise exception using errcode='42501',message='worker_required'; end if;
  update private.staff_invitation_deliveries j set status='failed',lease_until=null where j.status='sending' and j.attempt>=5 and j.lease_until<=statement_timestamp();
  update private.staff_invitation_deliveries j set status='superseded',lease_until=null where j.status in ('queued','sending','failed') and exists(select 1 from app.invitations i where i.tenant_id=j.tenant_id and i.id=j.invitation_id and (i.status<>'pending' or i.expires_at<=statement_timestamp() or i.revision<>j.invitation_revision));
  select j.* into v_job from private.staff_invitation_deliveries j where j.status in ('queued','sending') and j.available_at<=statement_timestamp() and (j.lease_until is null or j.lease_until<=statement_timestamp()) and j.attempt<5 order by j.created_at,j.id limit 1 for update skip locked;
  if not found then return; end if;
  update private.staff_invitation_deliveries j set status='sending',attempt=j.attempt+1,lease_until=statement_timestamp()+interval '120 seconds' where j.id=v_job.id;
  return query select v_job.id,v_job.attempt+1,i.id,i.invitee_email,d.hostname,t.name
    from app.invitations i join app.tenants t on t.id=i.tenant_id
    join lateral (select td.hostname from app.tenant_domains td where td.tenant_id=i.tenant_id and td.application='dashboard' and td.kind='production' and td.active and td.verification_status='verified' order by td.hostname limit 1) d on true
    where i.tenant_id=v_job.tenant_id and i.id=v_job.invitation_id and t.status='active';
end;
$$;
create function private.complete_staff_invitation_delivery_v1(p_job_id uuid,p_attempt integer,p_sent boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' or private.current_auth_user_id() is not null then raise exception using errcode='42501',message='worker_required'; end if;
  update private.staff_invitation_deliveries j set status=case when p_sent then 'sent' when j.attempt>=5 then 'failed' else 'queued' end,
    available_at=statement_timestamp()+make_interval(secs=>least(3600,30*power(2,j.attempt)::integer)),lease_until=null
    where j.id=p_job_id and j.attempt=p_attempt and j.status='sending';
  return found;
end;
$$;
create function api_v1.claim_staff_invitation_delivery_v1()
returns table(job_id uuid,attempt integer,invitation_id uuid,recipient_email text,dashboard_hostname text,brand_name text)
language sql security invoker set search_path='' as $$ select * from private.claim_staff_invitation_delivery_v1(); $$;
create function api_v1.complete_staff_invitation_delivery_v1(p_job_id uuid,p_attempt integer,p_sent boolean)
returns boolean language sql security invoker set search_path='' as $$ select private.complete_staff_invitation_delivery_v1(p_job_id,p_attempt,p_sent); $$;
revoke all on function private.claim_staff_invitation_delivery_v1(),private.complete_staff_invitation_delivery_v1(uuid,integer,boolean),api_v1.claim_staff_invitation_delivery_v1(),api_v1.complete_staff_invitation_delivery_v1(uuid,integer,boolean) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.claim_staff_invitation_delivery_v1(),private.complete_staff_invitation_delivery_v1(uuid,integer,boolean),api_v1.claim_staff_invitation_delivery_v1(),api_v1.complete_staff_invitation_delivery_v1(uuid,integer,boolean) to service_role;
