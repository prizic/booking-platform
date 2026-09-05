-- Issue #8: tenant-scoped staff profiles, exclusive resources, assignment
-- candidates, and safe deactivation. Auth memberships remain identities and
-- authorization; a staff profile is operational domain data.

create extension if not exists btree_gist with schema extensions;

alter table app.catalog_services
  add column assignment_mode text not null default 'any'
    check (assignment_mode in ('fixed_staff', 'customer_choice', 'any', 'round_robin'));

create table app.staff_profiles (
  id uuid not null,
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  membership_id uuid,
  public_name text not null check (public_name = btrim(public_name) and char_length(public_name) between 1 and 160),
  public_bio text not null default '',
  internal_notes text not null default '',
  status text not null default 'active' check (status in ('active','inactive')),
  offered_hours_per_week numeric(6,2) not null default 40 check (offered_hours_per_week > 0 and offered_hours_per_week <= 168),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (id), unique (tenant_id,id), unique (tenant_id,membership_id),
  foreign key (tenant_id,membership_id) references app.memberships(tenant_id,id) on delete restrict
);

create table app.staff_services (
  tenant_id uuid not null, staff_id uuid not null, service_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id,staff_id,service_id),
  foreign key (tenant_id,staff_id) references app.staff_profiles(tenant_id,id) on delete cascade,
  foreign key (tenant_id,service_id) references app.catalog_services(tenant_id,id) on delete cascade
);

create table app.staff_locations (
  tenant_id uuid not null, staff_id uuid not null, location_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id,staff_id,location_id),
  foreign key (tenant_id,staff_id) references app.staff_profiles(tenant_id,id) on delete cascade,
  foreign key (tenant_id,location_id) references app.locations(tenant_id,id) on delete cascade
);

create table app.resource_types (
  id uuid not null, tenant_id uuid not null references app.tenants(id) on delete restrict,
  key text not null check (key = lower(key) and key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 160),
  exclusive boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  primary key (id), unique (tenant_id,id), unique (tenant_id,key)
);

create table app.resources (
  id uuid not null, tenant_id uuid not null, resource_type_id uuid not null,
  key text not null check (key = lower(key) and key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  public_name text not null check (public_name = btrim(public_name) and char_length(public_name) between 1 and 160),
  internal_notes text not null default '',
  status text not null default 'active' check (status in ('active','maintenance','inactive')),
  capacity integer not null default 1 check (capacity = 1),
  created_at timestamptz not null default statement_timestamp(), updated_at timestamptz not null default statement_timestamp(),
  primary key (id), unique (tenant_id,id), unique (tenant_id,key),
  foreign key (tenant_id,resource_type_id) references app.resource_types(tenant_id,id) on delete restrict
);

create table app.resource_locations (
  tenant_id uuid not null, resource_id uuid not null, location_id uuid not null,
  primary key (tenant_id,resource_id,location_id),
  foreign key (tenant_id,resource_id) references app.resources(tenant_id,id) on delete cascade,
  foreign key (tenant_id,location_id) references app.locations(tenant_id,id) on delete cascade
);

create table app.resource_requirements (
  tenant_id uuid not null, service_id uuid not null, resource_type_id uuid not null,
  quantity integer not null default 1 check (quantity = 1),
  primary key (tenant_id,service_id,resource_type_id),
  foreign key (tenant_id,service_id) references app.catalog_services(tenant_id,id) on delete cascade,
  foreign key (tenant_id,resource_type_id) references app.resource_types(tenant_id,id) on delete restrict
);

-- This is the common allocation ledger used by deactivation checks and later
-- booking reservations. It is intentionally tenant-composite and half-open.
create table app.assignment_allocations (
  id uuid not null, tenant_id uuid not null, staff_id uuid, resource_id uuid,
  starts_at timestamptz not null, ends_at timestamptz not null,
  buffer_before_minutes integer not null default 0 check (buffer_before_minutes between 0 and 1440),
  buffer_after_minutes integer not null default 0 check (buffer_after_minutes between 0 and 1440),
  occupied_at tstzrange generated always as (tstzrange(starts_at - make_interval(mins => buffer_before_minutes),ends_at + make_interval(mins => buffer_after_minutes),'[)')) stored,
  state text not null default 'confirmed' check (state in ('held','confirmed','cancelled','completed')),
  primary key (id), unique (tenant_id,id),
  check (ends_at > starts_at), check (num_nonnulls(staff_id,resource_id) = 1),
  foreign key (tenant_id,staff_id) references app.staff_profiles(tenant_id,id) on delete restrict,
  foreign key (tenant_id,resource_id) references app.resources(tenant_id,id) on delete restrict
);
create index assignment_allocations_staff_future on app.assignment_allocations(tenant_id,staff_id,starts_at) where state in ('held','confirmed');
create index assignment_allocations_resource_future on app.assignment_allocations(tenant_id,resource_id,starts_at) where state in ('held','confirmed');
alter table app.assignment_allocations add constraint assignment_staff_no_overlap
  exclude using gist (tenant_id with =, staff_id with =, occupied_at with &&)
  where (staff_id is not null and state in ('held','confirmed'));
alter table app.assignment_allocations add constraint assignment_resource_no_overlap
  exclude using gist (tenant_id with =, resource_id with =, occupied_at with &&)
  where (resource_id is not null and state in ('held','confirmed'));

create table app.staff_resource_audit_events (
  id uuid not null, tenant_id uuid not null references app.tenants(id) on delete restrict,
  actor_membership_id uuid, effective_actor_id uuid, request_id uuid not null,
  action text not null check (action in ('staff_deactivated','staff_reassigned','resource_deactivated')),
  target_id uuid not null, reason text not null check (char_length(btrim(reason)) between 1 and 500),
  outcome text not null check (outcome in ('deactivated','reassigned','cancelled','deferred')),
  redacted_diff jsonb not null default '{}'::jsonb check (jsonb_typeof(redacted_diff)='object'),
  created_at timestamptz not null default statement_timestamp(),
  primary key (id), unique (tenant_id,id),
  foreign key (tenant_id,actor_membership_id) references app.memberships(tenant_id,id) on delete set null (actor_membership_id)
);

create index staff_services_service_idx on app.staff_services(tenant_id,service_id,staff_id);
create index staff_locations_location_idx on app.staff_locations(tenant_id,location_id,staff_id);
create index resource_locations_location_idx on app.resource_locations(tenant_id,location_id,resource_id);
create index resource_requirements_service_idx on app.resource_requirements(tenant_id,service_id);

create or replace function private.can_manage_staff(p_tenant_id uuid, p_location_id uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from app.memberships m join app.roles r on r.tenant_id=m.tenant_id and r.id=m.role_id
    join app.role_permissions rp on rp.tenant_id=r.tenant_id and rp.role_id=r.id
    where m.tenant_id=p_tenant_id and m.auth_user_id=(select private.current_auth_user_id()) and m.status='active'
      and rp.permission_key='staff.manage'
      and (rp.grant_kind='direct' or (rp.grant_kind='approval' and (select private.is_aal2())))
      and (rp.scope_kind='tenant' or (p_location_id is not null and (select private.can_access_location(p_tenant_id,p_location_id))))
  );
$$;
revoke execute on function private.can_manage_staff(uuid,uuid) from public;
grant execute on function private.can_manage_staff(uuid,uuid) to authenticated;

do $rls$
declare t text;
begin
  foreach t in array array['staff_profiles','staff_services','staff_locations','resource_types','resources','resource_locations','resource_requirements','assignment_allocations','staff_resource_audit_events'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('create policy %I on app.%I for select to authenticated using ((select private.is_active_tenant_member(tenant_id)))', t||'_member',t);
    execute format('create policy %I on app.%I for insert to authenticated with check ((select private.can_manage_staff(tenant_id,null)))', t||'_insert',t);
    execute format('create policy %I on app.%I for update to authenticated using ((select private.can_manage_staff(tenant_id,null))) with check ((select private.can_manage_staff(tenant_id,null)))', t||'_update',t);
    execute format('create policy %I on app.%I for delete to authenticated using ((select private.can_manage_staff(tenant_id,null)))', t||'_delete',t);
  end loop;
end;
$rls$;

-- Internal notes, allocation rows, and audit metadata are not readable by an
-- ordinary tenant member. They require the live management capability.
drop policy staff_profiles_member on app.staff_profiles;
drop policy resources_member on app.resources;
drop policy assignment_allocations_member on app.assignment_allocations;
drop policy staff_resource_audit_events_member on app.staff_resource_audit_events;
create policy staff_profiles_member on app.staff_profiles for select to authenticated using ((select private.can_manage_staff(tenant_id,null)));
create policy resources_member on app.resources for select to authenticated using ((select private.can_manage_staff(tenant_id,null)));
create policy assignment_allocations_member on app.assignment_allocations for select to authenticated using ((select private.can_manage_staff(tenant_id,null)));
create policy staff_resource_audit_events_member on app.staff_resource_audit_events for select to authenticated using ((select private.can_manage_staff(tenant_id,null)));
drop policy staff_profiles_update on app.staff_profiles;
create policy staff_profiles_update on app.staff_profiles for update to authenticated using ((select private.can_manage_staff(tenant_id,null))) with check ((select private.can_manage_staff(tenant_id,null)) and status='active');

-- Anonymous callers receive only explicitly published, active, safe identity.
create policy staff_profiles_public on app.staff_profiles for select to anon using (
  status='active' and exists (select 1 from app.staff_services ss join app.catalog_service_revisions sr on sr.tenant_id=ss.tenant_id and sr.service_id=ss.service_id and sr.state='published' where ss.tenant_id=staff_profiles.tenant_id and ss.staff_id=staff_profiles.id)
);
create policy staff_services_public on app.staff_services for select to anon using (exists (select 1 from app.catalog_service_revisions sr where sr.tenant_id=staff_services.tenant_id and sr.service_id=staff_services.service_id and sr.state='published'));
create policy staff_locations_public on app.staff_locations for select to anon using (exists (select 1 from app.staff_profiles s join app.staff_services ss on ss.tenant_id=s.tenant_id and ss.staff_id=s.id join app.catalog_service_revisions sr on sr.tenant_id=ss.tenant_id and sr.service_id=ss.service_id and sr.state='published' where s.tenant_id=staff_locations.tenant_id and s.id=staff_locations.staff_id and s.status='active'));
create policy resource_types_public on app.resource_types for select to anon using (exists (select 1 from app.resources r join app.resource_locations rl on rl.tenant_id=r.tenant_id and rl.resource_id=r.id where r.tenant_id=resource_types.tenant_id and r.resource_type_id=resource_types.id and r.status='active'));
create policy resources_public on app.resources for select to anon using (status='active');
create policy resource_locations_public on app.resource_locations for select to anon using (exists (select 1 from app.resources r where r.tenant_id=resource_locations.tenant_id and r.id=resource_locations.resource_id and r.status='active'));
create policy resource_requirements_public on app.resource_requirements for select to anon using (exists (select 1 from app.catalog_service_revisions sr where sr.tenant_id=resource_requirements.tenant_id and sr.service_id=resource_requirements.service_id and sr.state='published'));

revoke all on app.staff_profiles,app.staff_services,app.staff_locations,app.resource_types,app.resources,app.resource_locations,app.resource_requirements,app.assignment_allocations,app.staff_resource_audit_events from anon,authenticated;
grant select on app.staff_profiles,app.staff_services,app.staff_locations,app.resource_types,app.resources,app.resource_locations,app.resource_requirements to authenticated;
grant select,insert,update,delete on app.staff_profiles,app.staff_services,app.staff_locations,app.resource_types,app.resources,app.resource_locations,app.resource_requirements,app.assignment_allocations to authenticated;
grant select on app.staff_resource_audit_events to authenticated;

create or replace function api_v1.get_assignment_candidates_v1(p_service_id uuid, p_location_id uuid)
returns table(assignment_mode text, staff_id uuid, staff_name text, resource_id uuid, resource_name text)
language sql stable security definer set search_path='' as $$
  with service as (select s.id,s.tenant_id,s.assignment_mode from app.catalog_services s where s.id=p_service_id and s.status='active' and exists(select 1 from app.catalog_service_revisions sr where sr.tenant_id=s.tenant_id and sr.service_id=s.id and sr.state='published'))
  select service.assignment_mode, sp.id, sp.public_name, null::uuid, null::text
  from service join app.staff_services ss on ss.tenant_id=service.tenant_id and ss.service_id=service.id
  join app.staff_profiles sp on sp.tenant_id=ss.tenant_id and sp.id=ss.staff_id and sp.status='active'
  join app.staff_locations sl on sl.tenant_id=sp.tenant_id and sl.staff_id=sp.id and sl.location_id=p_location_id
  union all
  select service.assignment_mode, null::uuid, null::text, r.id, r.public_name
  from service join app.resource_requirements rr on rr.tenant_id=service.tenant_id and rr.service_id=service.id
  join app.resources r on r.tenant_id=rr.tenant_id and r.resource_type_id=rr.resource_type_id and r.status='active'
  join app.resource_locations rl on rl.tenant_id=r.tenant_id and rl.resource_id=r.id and rl.location_id=p_location_id;
$$;
revoke all on function api_v1.get_assignment_candidates_v1(uuid,uuid) from public;
grant execute on function api_v1.get_assignment_candidates_v1(uuid,uuid) to anon,authenticated;

create or replace function api_v1.deactivate_staff_v1(p_tenant_id uuid,p_staff_id uuid,p_resolution text,p_replacement_staff_id uuid,p_request_id uuid,p_reason text)
returns table(staff_id uuid,outcome text,remaining_allocations integer)
language plpgsql security definer set search_path='' as $$
declare n integer; actor uuid; membership uuid; audit_outcome text;
begin
  if not (select private.can_manage_staff(p_tenant_id,null)) then raise exception using errcode='42501',message='staff_authorization_required'; end if;
  if p_resolution is null or p_resolution not in ('reassign','cancel','defer') then raise exception using errcode='22023',message='deactivation_resolution_required'; end if;
  select count(*)::integer into n from app.assignment_allocations a where a.tenant_id=p_tenant_id and a.staff_id=p_staff_id and a.state in ('held','confirmed') and a.starts_at > statement_timestamp();
  if n > 0 and p_resolution not in ('reassign','cancel','defer') then raise exception using errcode='22023',message='deactivation_resolution_required'; end if;
  if p_resolution='defer' and n > 0 then
    audit_outcome := 'deferred';
    actor := (select private.current_auth_user_id()); membership := (select private.current_membership_id(p_tenant_id));
    insert into app.staff_resource_audit_events(id,tenant_id,actor_membership_id,effective_actor_id,request_id,action,target_id,reason,outcome,redacted_diff)
    values(gen_random_uuid(),p_tenant_id,membership,actor,p_request_id,'staff_deactivated',p_staff_id,p_reason,audit_outcome,'{}'::jsonb);
    return query select p_staff_id,audit_outcome,n;
    return;
  elsif p_resolution='reassign' then
    if p_replacement_staff_id is null or not exists(select 1 from app.staff_profiles where tenant_id=p_tenant_id and id=p_replacement_staff_id and status='active') then raise exception using errcode='22023',message='replacement_staff_required'; end if;
    update app.assignment_allocations a set staff_id=p_replacement_staff_id where a.tenant_id=p_tenant_id and a.staff_id=p_staff_id and a.state in ('held','confirmed') and a.starts_at > statement_timestamp();
  elsif p_resolution='cancel' then update app.assignment_allocations a set state='cancelled' where a.tenant_id=p_tenant_id and a.staff_id=p_staff_id and a.state in ('held','confirmed') and a.starts_at > statement_timestamp();
  end if;
  audit_outcome := case when n = 0 then 'deactivated' when p_resolution='reassign' then 'reassigned' when p_resolution='cancel' then 'cancelled' else 'deferred' end;
  update app.staff_profiles set status='inactive',updated_at=statement_timestamp() where tenant_id=p_tenant_id and id=p_staff_id;
  actor := (select private.current_auth_user_id()); membership := (select private.current_membership_id(p_tenant_id));
  insert into app.staff_resource_audit_events(id,tenant_id,actor_membership_id,effective_actor_id,request_id,action,target_id,reason,outcome,redacted_diff)
  values(gen_random_uuid(),p_tenant_id,membership,actor,p_request_id,'staff_deactivated',p_staff_id,p_reason,audit_outcome,jsonb_build_object('status','inactive'));
  return query select p_staff_id,audit_outcome,(select count(*)::integer from app.assignment_allocations a where a.tenant_id=p_tenant_id and a.staff_id=p_staff_id and a.state in ('held','confirmed') and a.starts_at > statement_timestamp());
end;
$$;
revoke all on function api_v1.deactivate_staff_v1(uuid,uuid,text,uuid,uuid,text) from public;
grant execute on function api_v1.deactivate_staff_v1(uuid,uuid,text,uuid,uuid,text) to authenticated;

create or replace function api_v1.deactivate_resource_v1(p_tenant_id uuid,p_resource_id uuid,p_resolution text,p_request_id uuid,p_reason text)
returns table(resource_id uuid,outcome text,remaining_allocations integer)
language plpgsql security definer set search_path='' as $$
declare n integer; actor uuid; membership uuid; audit_outcome text;
begin
  if not (select private.can_manage_staff(p_tenant_id,null)) then raise exception using errcode='42501',message='resource_authorization_required'; end if;
  if p_resolution is null or p_resolution not in ('cancel','defer') then raise exception using errcode='22023',message='resource_deactivation_resolution_required'; end if;
  select count(*)::integer into n from app.assignment_allocations a where a.tenant_id=p_tenant_id and a.resource_id=p_resource_id and a.state in ('held','confirmed') and a.starts_at > statement_timestamp();
  actor := (select private.current_auth_user_id()); membership := (select private.current_membership_id(p_tenant_id));
  if p_resolution='defer' and n > 0 then audit_outcome := 'deferred';
  else
    if p_resolution='cancel' then update app.assignment_allocations a set state='cancelled' where a.tenant_id=p_tenant_id and a.resource_id=p_resource_id and a.state in ('held','confirmed') and a.starts_at > statement_timestamp(); end if;
    audit_outcome := case when n=0 then 'deactivated' else 'cancelled' end;
    update app.resources set status='inactive',updated_at=statement_timestamp() where tenant_id=p_tenant_id and id=p_resource_id;
  end if;
  insert into app.staff_resource_audit_events(id,tenant_id,actor_membership_id,effective_actor_id,request_id,action,target_id,reason,outcome,redacted_diff)
  values(gen_random_uuid(),p_tenant_id,membership,actor,p_request_id,'resource_deactivated',p_resource_id,p_reason,audit_outcome,jsonb_build_object('status',case when audit_outcome='deferred' then 'active' else 'inactive' end));
  return query select p_resource_id,audit_outcome,(select count(*)::integer from app.assignment_allocations a where a.tenant_id=p_tenant_id and a.resource_id=p_resource_id and a.state in ('held','confirmed') and a.starts_at > statement_timestamp());
end;
$$;
revoke all on function api_v1.deactivate_resource_v1(uuid,uuid,text,uuid,text) from public;
grant execute on function api_v1.deactivate_resource_v1(uuid,uuid,text,uuid,text) to authenticated;
