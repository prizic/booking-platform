-- Issue #8: tenant-scoped staff profiles, exclusive resources, assignment
-- candidates, and safe deactivation. Auth memberships remain identities and
-- authorization; a staff profile is operational domain data.

create extension if not exists btree_gist with schema extensions;

alter table app.catalog_services
  add column assignment_mode text not null default 'any_available'
    check (assignment_mode in ('fixed_staff', 'customer_choice', 'any_available', 'round_robin')),
  add column fixed_staff_id uuid,
  add constraint catalog_services_fixed_staff_mode
    check ((assignment_mode = 'fixed_staff') = (fixed_staff_id is not null));

create table app.staff_profiles (
  id uuid not null,
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  membership_id uuid,
  public_name text not null check (public_name = btrim(public_name) and char_length(public_name) between 1 and 160),
  public_bio text not null default '',
  internal_notes text not null default '',
  status text not null default 'active' check (status in ('active','inactive','deactivation_pending')),
  offered_hours_per_week numeric(6,2) not null default 40 check (offered_hours_per_week > 0 and offered_hours_per_week <= 168),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (id), unique (tenant_id,id), unique (tenant_id,membership_id),
  foreign key (tenant_id,membership_id) references app.memberships(tenant_id,id) on delete restrict
);

alter table app.catalog_services
  add constraint catalog_services_fixed_staff_tenant_fk
  foreign key (tenant_id,fixed_staff_id)
  references app.staff_profiles(tenant_id,id) on delete restrict;

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

create table app.staff_service_locations (
  tenant_id uuid not null, staff_id uuid not null, service_id uuid not null,
  location_id uuid not null, created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id,staff_id,service_id,location_id),
  foreign key (tenant_id,staff_id,service_id)
    references app.staff_services(tenant_id,staff_id,service_id) on delete cascade,
  foreign key (tenant_id,staff_id,location_id)
    references app.staff_locations(tenant_id,staff_id,location_id) on delete cascade,
  foreign key (tenant_id,service_id,location_id)
    references app.catalog_service_locations(tenant_id,service_id,location_id) on delete cascade
);

create table app.resource_types (
  id uuid not null, tenant_id uuid not null references app.tenants(id) on delete restrict,
  key text not null check (key = lower(key) and key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 160),
  exclusive boolean not null default true check (exclusive),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default statement_timestamp(),
  primary key (id), unique (tenant_id,id), unique (tenant_id,key)
);

create table app.resources (
  id uuid not null, tenant_id uuid not null, resource_type_id uuid not null,
  key text not null check (key = lower(key) and key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  public_name text not null check (public_name = btrim(public_name) and char_length(public_name) between 1 and 160),
  internal_notes text not null default '',
  status text not null default 'active' check (status in ('active','maintenance','inactive','deactivation_pending')),
  capacity integer not null default 1 check (capacity = 1),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default statement_timestamp(), updated_at timestamptz not null default statement_timestamp(),
  primary key (id), unique (tenant_id,id), unique (tenant_id,key),
  unique (tenant_id,id,resource_type_id),
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
  unique (tenant_id,service_id),
  foreign key (tenant_id,service_id) references app.catalog_services(tenant_id,id) on delete cascade,
  foreign key (tenant_id,resource_type_id) references app.resource_types(tenant_id,id) on delete restrict
);

-- This is the common allocation ledger used by deactivation checks and later
-- booking reservations. It is intentionally tenant-composite and half-open.
create table app.assignment_allocations (
  id uuid not null, tenant_id uuid not null, service_id uuid not null,
  location_id uuid not null, staff_id uuid, resource_id uuid, resource_type_id uuid,
  starts_at timestamptz not null, ends_at timestamptz not null,
  buffer_before_minutes integer not null default 0 check (buffer_before_minutes between 0 and 1440),
  buffer_after_minutes integer not null default 0 check (buffer_after_minutes between 0 and 1440),
  -- Converting each instant to UTC before interval arithmetic makes this a
  -- genuinely immutable generated expression; timestamptz +/- interval is
  -- timezone-sensitive and PostgreSQL correctly rejects it here.
  occupied_at tsrange generated always as (
    tsrange(
      (starts_at at time zone 'UTC') - make_interval(mins => buffer_before_minutes),
      (ends_at at time zone 'UTC') + make_interval(mins => buffer_after_minutes),
      '[)'
    )
  ) stored,
  state text not null default 'confirmed' check (state in ('held','confirmed','cancelled','completed')),
  primary key (id), unique (tenant_id,id),
  check (ends_at > starts_at),
  check (
    (staff_id is not null and resource_id is null and resource_type_id is null)
    or (staff_id is null and resource_id is not null and resource_type_id is not null)
  ),
  foreign key (tenant_id,service_id,location_id)
    references app.catalog_service_locations(tenant_id,service_id,location_id) on delete restrict,
  foreign key (tenant_id,staff_id,service_id,location_id)
    references app.staff_service_locations(tenant_id,staff_id,service_id,location_id) on delete restrict,
  foreign key (tenant_id,resource_id,resource_type_id)
    references app.resources(tenant_id,id,resource_type_id) on delete restrict,
  foreign key (tenant_id,resource_id,location_id)
    references app.resource_locations(tenant_id,resource_id,location_id) on delete restrict,
  foreign key (tenant_id,service_id,resource_type_id)
    references app.resource_requirements(tenant_id,service_id,resource_type_id) on delete restrict
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
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  action text not null check (action in (
    'staff_deactivated','resource_deactivated','staff_eligibility_changed',
    'resource_location_changed','staff_profile_saved','resource_type_saved',
    'resource_saved','resource_requirement_changed'
  )),
  target_id uuid not null, reason text not null check (char_length(btrim(reason)) between 1 and 500),
  location_id uuid,
  outcome text not null check (outcome in (
    'created','updated','removed','deactivated','reassigned','cancelled',
    'deferred','enabled','disabled','unchanged'
  )),
  redacted_diff jsonb not null default '{}'::jsonb check (jsonb_typeof(redacted_diff)='object'),
  created_at timestamptz not null default statement_timestamp(),
  primary key (id), unique (tenant_id,id), unique (tenant_id,request_id),
  foreign key (tenant_id,actor_membership_id) references app.memberships(tenant_id,id) on delete set null (actor_membership_id),
  foreign key (tenant_id,location_id) references app.locations(tenant_id,id) on delete restrict
);

create index staff_services_service_idx on app.staff_services(tenant_id,service_id,staff_id);
create index staff_locations_location_idx on app.staff_locations(tenant_id,location_id,staff_id);
create index staff_service_locations_candidate_idx on app.staff_service_locations(tenant_id,service_id,location_id,staff_id);
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
      and (rp.scope_kind='tenant' or (p_location_id is not null and rp.scope_kind='location' and (select private.can_access_location(p_tenant_id,p_location_id))))
  );
$$;
revoke execute on function private.can_manage_staff(uuid,uuid) from public;
grant execute on function private.can_manage_staff(uuid,uuid) to authenticated;

-- Keep location-scoped catalog authority exact. The original helper predated
-- this issue and treated every non-tenant scope as a location scope whenever a
-- location argument was supplied.
create or replace function private.can_manage_catalog(p_tenant_id uuid, p_location_id uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from app.memberships m
    join app.role_permissions rp
      on rp.tenant_id=m.tenant_id and rp.role_id=m.role_id
    where m.tenant_id=p_tenant_id
      and m.auth_user_id=(select private.current_auth_user_id())
      and m.status='active' and rp.permission_key='catalog.edit'
      and (rp.grant_kind='direct' or (rp.grant_kind='approval' and (select private.is_aal2())))
      and (
        rp.scope_kind='tenant'
        or (
          p_location_id is not null and rp.scope_kind='location'
          and (select private.can_access_location(p_tenant_id,p_location_id))
        )
      )
  );
$$;
revoke execute on function private.can_manage_catalog(uuid,uuid) from public;
grant execute on function private.can_manage_catalog(uuid,uuid) to authenticated;

do $rls$
declare t text;
begin
  foreach t in array array[
    'staff_profiles','staff_services','staff_locations','staff_service_locations',
    'resource_types','resources','resource_locations','resource_requirements',
    'assignment_allocations','staff_resource_audit_events'
  ] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('create policy %I on app.%I for insert to authenticated with check (false)', t||'_insert_denied',t);
    execute format('create policy %I on app.%I for update to authenticated using (false) with check (false)', t||'_update_denied',t);
    execute format('create policy %I on app.%I for delete to authenticated using (false)', t||'_delete_denied',t);
  end loop;
end;
$rls$;

create policy staff_profiles_select_scoped on app.staff_profiles for select to authenticated using (
  (select private.can_manage_staff(tenant_id,null)) or exists (
    select 1 from app.staff_service_locations e
    where e.tenant_id=staff_profiles.tenant_id and e.staff_id=staff_profiles.id
      and (select private.can_manage_staff(e.tenant_id,e.location_id))
  )
);
create policy staff_services_select_scoped on app.staff_services for select to authenticated using (
  (select private.can_manage_staff(tenant_id,null)) or exists (
    select 1 from app.staff_service_locations e
    where e.tenant_id=staff_services.tenant_id and e.staff_id=staff_services.staff_id
      and e.service_id=staff_services.service_id
      and (select private.can_manage_staff(e.tenant_id,e.location_id))
  )
);
create policy staff_locations_select_scoped on app.staff_locations for select to authenticated using (
  (select private.can_manage_staff(tenant_id,null))
  or (select private.can_manage_staff(tenant_id,location_id))
);
create policy staff_service_locations_select_scoped on app.staff_service_locations for select to authenticated using (
  (select private.can_manage_staff(tenant_id,null))
  or (select private.can_manage_staff(tenant_id,location_id))
);
create policy resource_types_select_scoped on app.resource_types for select to authenticated using (
  (select private.can_manage_catalog(tenant_id,null)) or exists (
    select 1 from app.resources r
    join app.resource_locations rl on rl.tenant_id=r.tenant_id and rl.resource_id=r.id
    where r.tenant_id=resource_types.tenant_id and r.resource_type_id=resource_types.id
      and (select private.can_manage_catalog(rl.tenant_id,rl.location_id))
  )
);
create policy resources_select_scoped on app.resources for select to authenticated using (
  (select private.can_manage_catalog(tenant_id,null)) or exists (
    select 1 from app.resource_locations rl
    where rl.tenant_id=resources.tenant_id and rl.resource_id=resources.id
      and (select private.can_manage_catalog(rl.tenant_id,rl.location_id))
  )
);
create policy resource_locations_select_scoped on app.resource_locations for select to authenticated using (
  (select private.can_manage_catalog(tenant_id,null))
  or (select private.can_manage_catalog(tenant_id,location_id))
);
create policy resource_requirements_select_scoped on app.resource_requirements for select to authenticated using (
  (select private.can_manage_catalog(tenant_id,null)) or exists (
    select 1 from app.catalog_service_locations csl
    where csl.tenant_id=resource_requirements.tenant_id
      and csl.service_id=resource_requirements.service_id
      and (select private.can_manage_catalog(csl.tenant_id,csl.location_id))
  )
);
create policy assignment_allocations_select_scoped on app.assignment_allocations for select to authenticated using (
  (
    staff_id is not null and (
      (select private.can_manage_staff(tenant_id,null))
      or (select private.can_manage_staff(tenant_id,location_id))
    )
  )
  or (
    resource_id is not null and (
      (select private.can_manage_catalog(tenant_id,null))
      or (select private.can_manage_catalog(tenant_id,location_id))
    )
  )
);
create policy staff_resource_audit_events_select_scoped on app.staff_resource_audit_events for select to authenticated using (
  (
    action in ('staff_deactivated','staff_eligibility_changed','staff_profile_saved') and (
      (select private.can_manage_staff(tenant_id,null))
      or (location_id is not null and (select private.can_manage_staff(tenant_id,location_id)))
    )
  )
  or (
    action in (
      'resource_deactivated','resource_location_changed','resource_type_saved',
      'resource_saved','resource_requirement_changed'
    ) and (
      (select private.can_manage_catalog(tenant_id,null))
      or (location_id is not null and (select private.can_manage_catalog(tenant_id,location_id)))
    )
  )
);

revoke all on app.staff_profiles,app.staff_services,app.staff_locations,
  app.staff_service_locations,app.resource_types,app.resources,
  app.resource_locations,app.resource_requirements,app.assignment_allocations,
  app.staff_resource_audit_events from anon,authenticated;
grant select on app.staff_profiles,app.staff_services,app.staff_locations,
  app.staff_service_locations,app.resource_types,app.resources,
  app.resource_locations,app.resource_requirements,app.assignment_allocations,
  app.staff_resource_audit_events to authenticated;

create or replace function private.get_assignment_candidates_v1(
  p_service_id uuid,
  p_location_id uuid
)
returns table(
  assignment_mode text,
  candidate_rank integer,
  staff_id uuid,
  staff_name text,
  resource_id uuid,
  resource_name text
)
language sql stable security definer set search_path='' as $$
  with eligible_service as (
    select s.id,s.tenant_id,s.assignment_mode,s.fixed_staff_id
    from app.catalog_services s
    join app.catalog_service_locations csl
      on csl.tenant_id=s.tenant_id and csl.service_id=s.id
     and csl.location_id=p_location_id
    join app.locations l
      on l.tenant_id=csl.tenant_id and l.id=csl.location_id and l.status='active'
    join app.catalog_publications p
      on p.tenant_id=s.tenant_id and p.state='published'
    where s.id=p_service_id and s.status='active'
      and (select private.is_public_tenant_context(s.tenant_id))
      and exists (
        select 1
        from app.catalog_service_revisions sr
        join app.catalog_location_revisions lr
          on lr.tenant_id=sr.tenant_id and lr.publication_id=sr.publication_id
         and lr.locale=sr.locale and lr.location_id=p_location_id
         and lr.state='published'
        where sr.tenant_id=s.tenant_id and sr.service_id=s.id
          and sr.publication_id=p.id and sr.state='published'
      )
  ),
  staff_load as (
    select es.assignment_mode,sp.id,sp.public_name,sp.offered_hours_per_week,
      count(a.id) filter (where a.state in ('confirmed','completed')) as assignment_count,
      max(a.starts_at) filter (where a.state in ('confirmed','completed')) as last_assignment_at
    from eligible_service es
    join app.staff_service_locations eligibility
      on eligibility.tenant_id=es.tenant_id and eligibility.service_id=es.id
     and eligibility.location_id=p_location_id
    join app.staff_profiles sp
      on sp.tenant_id=eligibility.tenant_id and sp.id=eligibility.staff_id
     and sp.status='active'
    left join app.assignment_allocations a
      on a.tenant_id=sp.tenant_id and a.staff_id=sp.id
    where es.assignment_mode<>'fixed_staff' or es.fixed_staff_id=sp.id
    group by es.assignment_mode,sp.id,sp.public_name,sp.offered_hours_per_week
  ),
  staff_candidates as (
    select sl.assignment_mode,
      row_number() over (
        order by
          case when sl.assignment_mode='round_robin'
            then sl.assignment_count::numeric/sl.offered_hours_per_week
            else 0::numeric end,
          case when sl.assignment_mode='round_robin' then sl.last_assignment_at end asc nulls first,
          case when sl.assignment_mode<>'round_robin' then sl.public_name end,
          sl.id
      )::integer as candidate_rank,
      sl.id as staff_id,sl.public_name as staff_name,
      null::uuid as resource_id,null::text as resource_name
    from staff_load sl
  ),
  resource_candidates as (
    select es.assignment_mode,
      row_number() over (order by r.public_name,r.id)::integer as candidate_rank,
      null::uuid as staff_id,null::text as staff_name,
      r.id as resource_id,r.public_name as resource_name
    from eligible_service es
    join app.resource_requirements rr
      on rr.tenant_id=es.tenant_id and rr.service_id=es.id
    join app.resources r
      on r.tenant_id=rr.tenant_id and r.resource_type_id=rr.resource_type_id
     and r.status='active'
    join app.resource_locations rl
      on rl.tenant_id=r.tenant_id and rl.resource_id=r.id
     and rl.location_id=p_location_id
  )
  select * from (
    select * from staff_candidates
    union all
    select * from resource_candidates
  ) candidates
  order by (staff_id is null),candidate_rank,staff_id,resource_id;
$$;
revoke all on function private.get_assignment_candidates_v1(uuid,uuid) from public;
grant execute on function private.get_assignment_candidates_v1(uuid,uuid) to anon,authenticated;

create or replace function api_v1.get_assignment_candidates_v1(
  p_service_id uuid,
  p_location_id uuid
)
returns table(
  assignment_mode text,
  candidate_rank integer,
  staff_id uuid,
  staff_name text,
  resource_id uuid,
  resource_name text
)
language sql stable security invoker set search_path='' as $$
  select * from private.get_assignment_candidates_v1(p_service_id,p_location_id);
$$;
revoke all on function api_v1.get_assignment_candidates_v1(uuid,uuid) from public;
grant execute on function api_v1.get_assignment_candidates_v1(uuid,uuid) to anon,authenticated;
comment on function api_v1.get_assignment_candidates_v1(uuid,uuid) is
  'Current-publication customer-safe assignment candidates; excludes operational fairness inputs and internal notes.';

create or replace function private.save_staff_profile_v1(
  p_tenant_id uuid,p_staff_id uuid,p_membership_id uuid,p_public_name text,
  p_public_bio text,p_internal_notes text,p_offered_hours_per_week numeric,
  p_expected_revision bigint,p_request_id uuid,p_reason text
)
returns table(staff_id uuid,revision bigint)
language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid;
  v_current app.staff_profiles%rowtype;
  v_existing app.staff_resource_audit_events%rowtype;
  v_hash text;
  v_id uuid;
  v_membership uuid;
  v_outcome text;
  v_revision bigint;
begin
  if not coalesce((select private.can_manage_staff(p_tenant_id,null)),false) then
    raise exception using errcode='42501',message='staff_authorization_required';
  end if;
  if p_request_id is null then
    raise exception using errcode='22023',message='request_id_required';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  if p_public_name is null or char_length(btrim(p_public_name)) not between 1 and 160
    or p_public_bio is null or p_internal_notes is null
    or p_offered_hours_per_week is null
    or p_offered_hours_per_week<=0 or p_offered_hours_per_week>168 then
    raise exception using errcode='22023',message='staff_profile_invalid';
  end if;

  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'operation','save_staff_profile_v1','staff_id',p_staff_id,
      'membership_id',p_membership_id,'public_name',btrim(p_public_name),
      'public_bio',p_public_bio,'internal_notes',p_internal_notes,
      'offered_hours_per_week',p_offered_hours_per_week,
      'expected_revision',p_expected_revision,'reason',btrim(p_reason)
    )::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_tenant_id::text||':'||p_request_id::text,0)
  );
  select * into v_existing from app.staff_resource_audit_events e
    where e.tenant_id=p_tenant_id and e.request_id=p_request_id;
  if found then
    if v_existing.request_hash<>v_hash then
      raise exception using errcode='22023',message='idempotency_conflict';
    end if;
    return query select v_existing.target_id,
      (v_existing.redacted_diff#>>'{after,revision}')::bigint;
    return;
  end if;

  v_id := coalesce(p_staff_id,pg_catalog.gen_random_uuid());
  select * into v_current from app.staff_profiles s
    where s.tenant_id=p_tenant_id and s.id=v_id for update;
  if found then
    if p_expected_revision is null or p_expected_revision<>v_current.revision then
      raise exception using errcode='40001',message='revision_conflict';
    end if;
    v_revision := v_current.revision+1;
    update app.staff_profiles set
      membership_id=p_membership_id,public_name=btrim(p_public_name),
      public_bio=p_public_bio,internal_notes=p_internal_notes,
      offered_hours_per_week=p_offered_hours_per_week,revision=v_revision,
      updated_at=statement_timestamp()
    where tenant_id=p_tenant_id and id=v_id;
    v_outcome := 'updated';
  else
    if p_expected_revision is not null then
      raise exception using errcode='40001',message='revision_conflict';
    end if;
    insert into app.staff_profiles(
      id,tenant_id,membership_id,public_name,public_bio,internal_notes,
      offered_hours_per_week
    ) values (
      v_id,p_tenant_id,p_membership_id,btrim(p_public_name),p_public_bio,
      p_internal_notes,p_offered_hours_per_week
    );
    v_revision := 1;
    v_outcome := 'created';
  end if;

  v_actor := (select private.current_auth_user_id());
  v_membership := (select private.current_membership_id(p_tenant_id));
  insert into app.staff_resource_audit_events(
    id,tenant_id,actor_membership_id,effective_actor_id,request_id,request_hash,
    action,target_id,reason,outcome,redacted_diff
  ) values (
    pg_catalog.gen_random_uuid(),p_tenant_id,v_membership,v_actor,p_request_id,v_hash,
    'staff_profile_saved',v_id,btrim(p_reason),v_outcome,
    pg_catalog.jsonb_build_object(
      'before',case when v_current.id is null then null else pg_catalog.jsonb_build_object(
        'membership_id',v_current.membership_id,'public_name',v_current.public_name,
        'offered_hours_per_week',v_current.offered_hours_per_week,'revision',v_current.revision
      ) end,
      'after',pg_catalog.jsonb_build_object(
        'membership_id',p_membership_id,'public_name',btrim(p_public_name),
        'offered_hours_per_week',p_offered_hours_per_week,'revision',v_revision
      ),
      'public_bio_changed',coalesce(v_current.public_bio,'')<>p_public_bio,
      'internal_notes_changed',coalesce(v_current.internal_notes,'')<>p_internal_notes
    )
  );
  return query select v_id,v_revision;
end;
$$;
revoke all on function private.save_staff_profile_v1(uuid,uuid,uuid,text,text,text,numeric,bigint,uuid,text) from public;
grant execute on function private.save_staff_profile_v1(uuid,uuid,uuid,text,text,text,numeric,bigint,uuid,text) to authenticated;

create or replace function api_v1.save_staff_profile_v1(
  p_tenant_id uuid,p_staff_id uuid,p_membership_id uuid,p_public_name text,
  p_public_bio text,p_internal_notes text,p_offered_hours_per_week numeric,
  p_expected_revision bigint,p_request_id uuid,p_reason text
)
returns table(staff_id uuid,revision bigint)
language sql security invoker set search_path='' as $$
  select * from private.save_staff_profile_v1(
    p_tenant_id,p_staff_id,p_membership_id,p_public_name,p_public_bio,
    p_internal_notes,p_offered_hours_per_week,p_expected_revision,p_request_id,p_reason
  );
$$;
revoke all on function api_v1.save_staff_profile_v1(uuid,uuid,uuid,text,text,text,numeric,bigint,uuid,text) from public;
grant execute on function api_v1.save_staff_profile_v1(uuid,uuid,uuid,text,text,text,numeric,bigint,uuid,text) to authenticated;

create or replace function private.save_resource_type_v1(
  p_tenant_id uuid,p_resource_type_id uuid,p_key text,p_name text,p_exclusive boolean,
  p_expected_revision bigint,p_request_id uuid,p_reason text
)
returns table(resource_type_id uuid,revision bigint)
language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid;
  v_current app.resource_types%rowtype;
  v_existing app.staff_resource_audit_events%rowtype;
  v_hash text;
  v_id uuid;
  v_membership uuid;
  v_outcome text;
  v_revision bigint;
begin
  if not coalesce((select private.can_manage_catalog(p_tenant_id,null)),false) then
    raise exception using errcode='42501',message='catalog_authorization_required';
  end if;
  if p_request_id is null then
    raise exception using errcode='22023',message='request_id_required';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  if p_key is null or btrim(p_key)<>lower(btrim(p_key))
    or btrim(p_key)!~'^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or p_name is null or char_length(btrim(p_name)) not between 1 and 160
    or p_exclusive is distinct from true then
    raise exception using errcode='22023',message='resource_type_invalid';
  end if;

  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'operation','save_resource_type_v1','resource_type_id',p_resource_type_id,
      'key',btrim(p_key),'name',btrim(p_name),'exclusive',p_exclusive,
      'expected_revision',p_expected_revision,'reason',btrim(p_reason)
    )::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_tenant_id::text||':'||p_request_id::text,0)
  );
  select * into v_existing from app.staff_resource_audit_events e
    where e.tenant_id=p_tenant_id and e.request_id=p_request_id;
  if found then
    if v_existing.request_hash<>v_hash then
      raise exception using errcode='22023',message='idempotency_conflict';
    end if;
    return query select v_existing.target_id,
      (v_existing.redacted_diff#>>'{after,revision}')::bigint;
    return;
  end if;

  v_id := coalesce(p_resource_type_id,pg_catalog.gen_random_uuid());
  select * into v_current from app.resource_types rt
    where rt.tenant_id=p_tenant_id and rt.id=v_id for update;
  if found then
    if p_expected_revision is null or p_expected_revision<>v_current.revision then
      raise exception using errcode='40001',message='revision_conflict';
    end if;
    v_revision := v_current.revision+1;
    update app.resource_types set key=btrim(p_key),name=btrim(p_name),
      exclusive=true,revision=v_revision
    where tenant_id=p_tenant_id and id=v_id;
    v_outcome := 'updated';
  else
    if p_expected_revision is not null then
      raise exception using errcode='40001',message='revision_conflict';
    end if;
    insert into app.resource_types(id,tenant_id,key,name,exclusive)
      values(v_id,p_tenant_id,btrim(p_key),btrim(p_name),true);
    v_revision := 1;
    v_outcome := 'created';
  end if;

  v_actor := (select private.current_auth_user_id());
  v_membership := (select private.current_membership_id(p_tenant_id));
  insert into app.staff_resource_audit_events(
    id,tenant_id,actor_membership_id,effective_actor_id,request_id,request_hash,
    action,target_id,reason,outcome,redacted_diff
  ) values (
    pg_catalog.gen_random_uuid(),p_tenant_id,v_membership,v_actor,p_request_id,v_hash,
    'resource_type_saved',v_id,btrim(p_reason),v_outcome,
    pg_catalog.jsonb_build_object(
      'before',case when v_current.id is null then null else pg_catalog.jsonb_build_object(
        'key',v_current.key,'name',v_current.name,'exclusive',v_current.exclusive,
        'revision',v_current.revision
      ) end,
      'after',pg_catalog.jsonb_build_object(
        'key',btrim(p_key),'name',btrim(p_name),'exclusive',true,'revision',v_revision
      )
    )
  );
  return query select v_id,v_revision;
end;
$$;
revoke all on function private.save_resource_type_v1(uuid,uuid,text,text,boolean,bigint,uuid,text) from public;
grant execute on function private.save_resource_type_v1(uuid,uuid,text,text,boolean,bigint,uuid,text) to authenticated;

create or replace function api_v1.save_resource_type_v1(
  p_tenant_id uuid,p_resource_type_id uuid,p_key text,p_name text,p_exclusive boolean,
  p_expected_revision bigint,p_request_id uuid,p_reason text
)
returns table(resource_type_id uuid,revision bigint)
language sql security invoker set search_path='' as $$
  select * from private.save_resource_type_v1(
    p_tenant_id,p_resource_type_id,p_key,p_name,p_exclusive,p_expected_revision,
    p_request_id,p_reason
  );
$$;
revoke all on function api_v1.save_resource_type_v1(uuid,uuid,text,text,boolean,bigint,uuid,text) from public;
grant execute on function api_v1.save_resource_type_v1(uuid,uuid,text,text,boolean,bigint,uuid,text) to authenticated;

create or replace function private.save_resource_v1(
  p_tenant_id uuid,p_resource_id uuid,p_resource_type_id uuid,p_key text,
  p_public_name text,p_internal_notes text,p_status text,p_expected_revision bigint,
  p_request_id uuid,p_reason text
)
returns table(resource_id uuid,revision bigint)
language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid;
  v_current app.resources%rowtype;
  v_existing app.staff_resource_audit_events%rowtype;
  v_hash text;
  v_id uuid;
  v_membership uuid;
  v_outcome text;
  v_revision bigint;
begin
  if not coalesce((select private.can_manage_catalog(p_tenant_id,null)),false) then
    raise exception using errcode='42501',message='catalog_authorization_required';
  end if;
  if p_request_id is null then
    raise exception using errcode='22023',message='request_id_required';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  if p_resource_type_id is null or p_key is null or btrim(p_key)<>lower(btrim(p_key))
    or btrim(p_key)!~'^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or p_public_name is null or char_length(btrim(p_public_name)) not between 1 and 160
    or p_internal_notes is null or p_status not in ('active','maintenance') then
    raise exception using errcode='22023',message='resource_invalid';
  end if;

  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'operation','save_resource_v1','resource_id',p_resource_id,
      'resource_type_id',p_resource_type_id,'key',btrim(p_key),
      'public_name',btrim(p_public_name),'internal_notes',p_internal_notes,
      'status',p_status,'expected_revision',p_expected_revision,'reason',btrim(p_reason)
    )::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_tenant_id::text||':'||p_request_id::text,0)
  );
  select * into v_existing from app.staff_resource_audit_events e
    where e.tenant_id=p_tenant_id and e.request_id=p_request_id;
  if found then
    if v_existing.request_hash<>v_hash then
      raise exception using errcode='22023',message='idempotency_conflict';
    end if;
    return query select v_existing.target_id,
      (v_existing.redacted_diff#>>'{after,revision}')::bigint;
    return;
  end if;

  v_id := coalesce(p_resource_id,pg_catalog.gen_random_uuid());
  select * into v_current from app.resources r
    where r.tenant_id=p_tenant_id and r.id=v_id for update;
  if found then
    if p_expected_revision is null or p_expected_revision<>v_current.revision then
      raise exception using errcode='40001',message='revision_conflict';
    end if;
    if v_current.status in ('inactive','deactivation_pending') then
      raise exception using errcode='23514',message='resource_inactive';
    end if;
    v_revision := v_current.revision+1;
    update app.resources set resource_type_id=p_resource_type_id,key=btrim(p_key),
      public_name=btrim(p_public_name),internal_notes=p_internal_notes,status=p_status,
      revision=v_revision,updated_at=statement_timestamp()
    where tenant_id=p_tenant_id and id=v_id;
    v_outcome := 'updated';
  else
    if p_expected_revision is not null then
      raise exception using errcode='40001',message='revision_conflict';
    end if;
    insert into app.resources(
      id,tenant_id,resource_type_id,key,public_name,internal_notes,status
    ) values (
      v_id,p_tenant_id,p_resource_type_id,btrim(p_key),btrim(p_public_name),
      p_internal_notes,p_status
    );
    v_revision := 1;
    v_outcome := 'created';
  end if;

  v_actor := (select private.current_auth_user_id());
  v_membership := (select private.current_membership_id(p_tenant_id));
  insert into app.staff_resource_audit_events(
    id,tenant_id,actor_membership_id,effective_actor_id,request_id,request_hash,
    action,target_id,reason,outcome,redacted_diff
  ) values (
    pg_catalog.gen_random_uuid(),p_tenant_id,v_membership,v_actor,p_request_id,v_hash,
    'resource_saved',v_id,btrim(p_reason),v_outcome,
    pg_catalog.jsonb_build_object(
      'before',case when v_current.id is null then null else pg_catalog.jsonb_build_object(
        'resource_type_id',v_current.resource_type_id,'key',v_current.key,
        'public_name',v_current.public_name,'status',v_current.status,'revision',v_current.revision
      ) end,
      'after',pg_catalog.jsonb_build_object(
        'resource_type_id',p_resource_type_id,'key',btrim(p_key),
        'public_name',btrim(p_public_name),'status',p_status,'revision',v_revision
      ),
      'internal_notes_changed',coalesce(v_current.internal_notes,'')<>p_internal_notes
    )
  );
  return query select v_id,v_revision;
end;
$$;
revoke all on function private.save_resource_v1(uuid,uuid,uuid,text,text,text,text,bigint,uuid,text) from public;
grant execute on function private.save_resource_v1(uuid,uuid,uuid,text,text,text,text,bigint,uuid,text) to authenticated;

create or replace function api_v1.save_resource_v1(
  p_tenant_id uuid,p_resource_id uuid,p_resource_type_id uuid,p_key text,
  p_public_name text,p_internal_notes text,p_status text,p_expected_revision bigint,
  p_request_id uuid,p_reason text
)
returns table(resource_id uuid,revision bigint)
language sql security invoker set search_path='' as $$
  select * from private.save_resource_v1(
    p_tenant_id,p_resource_id,p_resource_type_id,p_key,p_public_name,
    p_internal_notes,p_status,p_expected_revision,p_request_id,p_reason
  );
$$;
revoke all on function api_v1.save_resource_v1(uuid,uuid,uuid,text,text,text,text,bigint,uuid,text) from public;
grant execute on function api_v1.save_resource_v1(uuid,uuid,uuid,text,text,text,text,bigint,uuid,text) to authenticated;

create or replace function private.set_resource_requirement_v1(
  p_tenant_id uuid,p_service_id uuid,p_resource_type_id uuid,p_required boolean,
  p_request_id uuid,p_reason text
)
returns table(service_id uuid,resource_type_id uuid,required boolean)
language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid;
  v_before uuid;
  v_existing app.staff_resource_audit_events%rowtype;
  v_hash text;
  v_membership uuid;
  v_outcome text;
begin
  if not coalesce((select private.can_manage_catalog(p_tenant_id,null)),false) then
    raise exception using errcode='42501',message='catalog_authorization_required';
  end if;
  if p_request_id is null then
    raise exception using errcode='22023',message='request_id_required';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  if p_required is null or (p_required and p_resource_type_id is null) then
    raise exception using errcode='22023',message='resource_requirement_invalid';
  end if;

  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'operation','set_resource_requirement_v1','service_id',p_service_id,
      'resource_type_id',p_resource_type_id,'required',p_required,'reason',btrim(p_reason)
    )::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_tenant_id::text||':'||p_request_id::text,0)
  );
  select * into v_existing from app.staff_resource_audit_events e
    where e.tenant_id=p_tenant_id and e.request_id=p_request_id;
  if found then
    if v_existing.request_hash<>v_hash then
      raise exception using errcode='22023',message='idempotency_conflict';
    end if;
    return query select p_service_id,
      nullif(v_existing.redacted_diff#>>'{after,resource_type_id}','')::uuid,
      (v_existing.redacted_diff#>>'{after,required}')::boolean;
    return;
  end if;

  if not exists (
    select 1 from app.catalog_services s
    where s.tenant_id=p_tenant_id and s.id=p_service_id and s.status='active'
  ) then
    raise exception using errcode='22023',message='service_not_active';
  end if;
  if p_required and not exists (
    select 1 from app.resource_types rt
    where rt.tenant_id=p_tenant_id and rt.id=p_resource_type_id and rt.exclusive
  ) then
    raise exception using errcode='22023',message='resource_type_not_found';
  end if;

  select rr.resource_type_id into v_before from app.resource_requirements rr
    where rr.tenant_id=p_tenant_id and rr.service_id=p_service_id for update;
  if p_required then
    insert into app.resource_requirements(tenant_id,service_id,resource_type_id)
      values(p_tenant_id,p_service_id,p_resource_type_id)
      on conflict on constraint resource_requirements_tenant_id_service_id_key do update
        set resource_type_id=excluded.resource_type_id;
    v_outcome := case when v_before is null then 'created'
      when v_before=p_resource_type_id then 'unchanged' else 'updated' end;
  elsif v_before is not null then
    if exists (
      select 1 from app.assignment_allocations a
      where a.tenant_id=p_tenant_id and a.service_id=p_service_id
        and a.resource_id is not null and a.state in ('held','confirmed')
        and a.starts_at>statement_timestamp()
    ) then
      raise exception using errcode='23514',message='resource_requirement_has_future_allocations';
    end if;
    delete from app.resource_requirements rr
      where rr.tenant_id=p_tenant_id and rr.service_id=p_service_id;
    v_outcome := 'removed';
  else
    v_outcome := 'unchanged';
  end if;

  v_actor := (select private.current_auth_user_id());
  v_membership := (select private.current_membership_id(p_tenant_id));
  insert into app.staff_resource_audit_events(
    id,tenant_id,actor_membership_id,effective_actor_id,request_id,request_hash,
    action,target_id,reason,outcome,redacted_diff
  ) values (
    pg_catalog.gen_random_uuid(),p_tenant_id,v_membership,v_actor,p_request_id,v_hash,
    'resource_requirement_changed',p_service_id,btrim(p_reason),v_outcome,
    pg_catalog.jsonb_build_object(
      'before',pg_catalog.jsonb_build_object(
        'resource_type_id',v_before,'required',v_before is not null
      ),
      'after',pg_catalog.jsonb_build_object(
        'resource_type_id',case when p_required then p_resource_type_id else null end,
        'required',p_required
      )
    )
  );
  return query select p_service_id,
    case when p_required then p_resource_type_id else null end,p_required;
end;
$$;
revoke all on function private.set_resource_requirement_v1(uuid,uuid,uuid,boolean,uuid,text) from public;
grant execute on function private.set_resource_requirement_v1(uuid,uuid,uuid,boolean,uuid,text) to authenticated;

create or replace function api_v1.set_resource_requirement_v1(
  p_tenant_id uuid,p_service_id uuid,p_resource_type_id uuid,p_required boolean,
  p_request_id uuid,p_reason text
)
returns table(service_id uuid,resource_type_id uuid,required boolean)
language sql security invoker set search_path='' as $$
  select * from private.set_resource_requirement_v1(
    p_tenant_id,p_service_id,p_resource_type_id,p_required,p_request_id,p_reason
  );
$$;
revoke all on function api_v1.set_resource_requirement_v1(uuid,uuid,uuid,boolean,uuid,text) from public;
grant execute on function api_v1.set_resource_requirement_v1(uuid,uuid,uuid,boolean,uuid,text) to authenticated;

create or replace function private.set_staff_service_location_eligibility_v1(
  p_tenant_id uuid,p_staff_id uuid,p_service_id uuid,p_location_id uuid,
  p_eligible boolean,p_request_id uuid,p_reason text
)
returns table(staff_id uuid,service_id uuid,location_id uuid,eligible boolean)
language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid;
  v_membership uuid;
  v_before boolean;
  v_hash text;
  v_outcome text;
  v_existing app.staff_resource_audit_events%rowtype;
begin
  if not coalesce((select private.can_manage_staff(p_tenant_id,p_location_id)),false) then
    raise exception using errcode='42501',message='staff_authorization_required';
  end if;
  if p_request_id is null then
    raise exception using errcode='22023',message='request_id_required';
  end if;
  if p_eligible is null then
    raise exception using errcode='22023',message='eligibility_required';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception using errcode='22023',message='reason_required';
  end if;

  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'operation','set_staff_service_location_eligibility_v1',
      'staff_id',p_staff_id,'service_id',p_service_id,'location_id',p_location_id,
      'eligible',p_eligible,'reason',btrim(p_reason)
    )::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_tenant_id::text||':'||p_request_id::text,0)
  );
  select * into v_existing from app.staff_resource_audit_events e
    where e.tenant_id=p_tenant_id and e.request_id=p_request_id;
  if found then
    if v_existing.request_hash<>v_hash then
      raise exception using errcode='22023',message='idempotency_conflict';
    end if;
    return query select p_staff_id,p_service_id,p_location_id,
      (v_existing.redacted_diff#>>'{after,eligible}')::boolean;
    return;
  end if;

  if not exists (
    select 1 from app.staff_profiles s
    where s.tenant_id=p_tenant_id and s.id=p_staff_id and s.status='active'
  ) then
    raise exception using errcode='22023',message='staff_not_active';
  end if;
  if not exists (
    select 1 from app.catalog_service_locations csl
    join app.catalog_services s on s.tenant_id=csl.tenant_id and s.id=csl.service_id
    join app.locations l on l.tenant_id=csl.tenant_id and l.id=csl.location_id
    where csl.tenant_id=p_tenant_id and csl.service_id=p_service_id
      and csl.location_id=p_location_id and s.status='active' and l.status='active'
  ) then
    raise exception using errcode='22023',message='service_location_not_active';
  end if;

  select exists (
    select 1 from app.staff_service_locations e
    where e.tenant_id=p_tenant_id and e.staff_id=p_staff_id
      and e.service_id=p_service_id and e.location_id=p_location_id
  ) into v_before;

  if p_eligible and not v_before then
    insert into app.staff_services(tenant_id,staff_id,service_id)
      values(p_tenant_id,p_staff_id,p_service_id) on conflict do nothing;
    insert into app.staff_locations(tenant_id,staff_id,location_id)
      values(p_tenant_id,p_staff_id,p_location_id) on conflict do nothing;
    insert into app.staff_service_locations(tenant_id,staff_id,service_id,location_id)
      values(p_tenant_id,p_staff_id,p_service_id,p_location_id);
    v_outcome := 'enabled';
  elsif not p_eligible and v_before then
    if exists (
      select 1 from app.assignment_allocations a
      where a.tenant_id=p_tenant_id and a.staff_id=p_staff_id
        and a.service_id=p_service_id and a.location_id=p_location_id
        and a.state in ('held','confirmed') and a.starts_at>statement_timestamp()
    ) then
      raise exception using errcode='23514',message='staff_eligibility_has_future_allocations';
    end if;
    delete from app.staff_service_locations e
    where e.tenant_id=p_tenant_id and e.staff_id=p_staff_id
      and e.service_id=p_service_id and e.location_id=p_location_id;
    v_outcome := 'disabled';
  else
    v_outcome := 'unchanged';
  end if;

  v_actor := (select private.current_auth_user_id());
  v_membership := (select private.current_membership_id(p_tenant_id));
  insert into app.staff_resource_audit_events(
    id,tenant_id,actor_membership_id,effective_actor_id,request_id,request_hash,
    action,target_id,location_id,reason,outcome,redacted_diff
  ) values (
    pg_catalog.gen_random_uuid(),p_tenant_id,v_membership,v_actor,p_request_id,v_hash,
    'staff_eligibility_changed',p_staff_id,p_location_id,btrim(p_reason),v_outcome,
    pg_catalog.jsonb_build_object(
      'before',pg_catalog.jsonb_build_object('eligible',v_before),
      'after',pg_catalog.jsonb_build_object('eligible',p_eligible),
      'service_id',p_service_id,'location_id',p_location_id
    )
  );
  return query select p_staff_id,p_service_id,p_location_id,p_eligible;
end;
$$;
revoke all on function private.set_staff_service_location_eligibility_v1(uuid,uuid,uuid,uuid,boolean,uuid,text) from public;
grant execute on function private.set_staff_service_location_eligibility_v1(uuid,uuid,uuid,uuid,boolean,uuid,text) to authenticated;

create or replace function api_v1.set_staff_service_location_eligibility_v1(
  p_tenant_id uuid,p_staff_id uuid,p_service_id uuid,p_location_id uuid,
  p_eligible boolean,p_request_id uuid,p_reason text
)
returns table(staff_id uuid,service_id uuid,location_id uuid,eligible boolean)
language sql security invoker set search_path='' as $$
  select * from private.set_staff_service_location_eligibility_v1(
    p_tenant_id,p_staff_id,p_service_id,p_location_id,p_eligible,p_request_id,p_reason
  );
$$;
revoke all on function api_v1.set_staff_service_location_eligibility_v1(uuid,uuid,uuid,uuid,boolean,uuid,text) from public;
grant execute on function api_v1.set_staff_service_location_eligibility_v1(uuid,uuid,uuid,uuid,boolean,uuid,text) to authenticated;

create or replace function private.set_resource_location_eligibility_v1(
  p_tenant_id uuid,p_resource_id uuid,p_location_id uuid,p_eligible boolean,
  p_request_id uuid,p_reason text
)
returns table(resource_id uuid,location_id uuid,eligible boolean)
language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid;
  v_membership uuid;
  v_before boolean;
  v_hash text;
  v_outcome text;
  v_existing app.staff_resource_audit_events%rowtype;
begin
  if not coalesce((select private.can_manage_catalog(p_tenant_id,p_location_id)),false) then
    raise exception using errcode='42501',message='resource_authorization_required';
  end if;
  if p_request_id is null then
    raise exception using errcode='22023',message='request_id_required';
  end if;
  if p_eligible is null then
    raise exception using errcode='22023',message='eligibility_required';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception using errcode='22023',message='reason_required';
  end if;

  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'operation','set_resource_location_eligibility_v1','resource_id',p_resource_id,
      'location_id',p_location_id,'eligible',p_eligible,'reason',btrim(p_reason)
    )::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_tenant_id::text||':'||p_request_id::text,0)
  );
  select * into v_existing from app.staff_resource_audit_events e
    where e.tenant_id=p_tenant_id and e.request_id=p_request_id;
  if found then
    if v_existing.request_hash<>v_hash then
      raise exception using errcode='22023',message='idempotency_conflict';
    end if;
    return query select p_resource_id,p_location_id,
      (v_existing.redacted_diff#>>'{after,eligible}')::boolean;
    return;
  end if;

  if not exists (
    select 1 from app.resources r
    where r.tenant_id=p_tenant_id and r.id=p_resource_id
      and r.status in ('active','maintenance')
  ) then
    raise exception using errcode='22023',message='resource_not_manageable';
  end if;
  if not exists (
    select 1 from app.locations l
    where l.tenant_id=p_tenant_id and l.id=p_location_id and l.status='active'
  ) then
    raise exception using errcode='22023',message='location_not_active';
  end if;
  select exists (
    select 1 from app.resource_locations rl
    where rl.tenant_id=p_tenant_id and rl.resource_id=p_resource_id
      and rl.location_id=p_location_id
  ) into v_before;

  if p_eligible and not v_before then
    insert into app.resource_locations(tenant_id,resource_id,location_id)
      values(p_tenant_id,p_resource_id,p_location_id);
    v_outcome := 'enabled';
  elsif not p_eligible and v_before then
    if exists (
      select 1 from app.assignment_allocations a
      where a.tenant_id=p_tenant_id and a.resource_id=p_resource_id
        and a.location_id=p_location_id and a.state in ('held','confirmed')
        and a.starts_at>statement_timestamp()
    ) then
      raise exception using errcode='23514',message='resource_location_has_future_allocations';
    end if;
    delete from app.resource_locations rl
    where rl.tenant_id=p_tenant_id and rl.resource_id=p_resource_id
      and rl.location_id=p_location_id;
    v_outcome := 'disabled';
  else
    v_outcome := 'unchanged';
  end if;

  v_actor := (select private.current_auth_user_id());
  v_membership := (select private.current_membership_id(p_tenant_id));
  insert into app.staff_resource_audit_events(
    id,tenant_id,actor_membership_id,effective_actor_id,request_id,request_hash,
    action,target_id,location_id,reason,outcome,redacted_diff
  ) values (
    pg_catalog.gen_random_uuid(),p_tenant_id,v_membership,v_actor,p_request_id,v_hash,
    'resource_location_changed',p_resource_id,p_location_id,btrim(p_reason),v_outcome,
    pg_catalog.jsonb_build_object(
      'before',pg_catalog.jsonb_build_object('eligible',v_before),
      'after',pg_catalog.jsonb_build_object('eligible',p_eligible),
      'location_id',p_location_id
    )
  );
  return query select p_resource_id,p_location_id,p_eligible;
end;
$$;
revoke all on function private.set_resource_location_eligibility_v1(uuid,uuid,uuid,boolean,uuid,text) from public;
grant execute on function private.set_resource_location_eligibility_v1(uuid,uuid,uuid,boolean,uuid,text) to authenticated;

create or replace function api_v1.set_resource_location_eligibility_v1(
  p_tenant_id uuid,p_resource_id uuid,p_location_id uuid,p_eligible boolean,
  p_request_id uuid,p_reason text
)
returns table(resource_id uuid,location_id uuid,eligible boolean)
language sql security invoker set search_path='' as $$
  select * from private.set_resource_location_eligibility_v1(
    p_tenant_id,p_resource_id,p_location_id,p_eligible,p_request_id,p_reason
  );
$$;
revoke all on function api_v1.set_resource_location_eligibility_v1(uuid,uuid,uuid,boolean,uuid,text) from public;
grant execute on function api_v1.set_resource_location_eligibility_v1(uuid,uuid,uuid,boolean,uuid,text) to authenticated;

create or replace function private.deactivate_staff_v1(
  p_tenant_id uuid,p_staff_id uuid,p_resolution text,
  p_replacement_staff_id uuid,p_request_id uuid,p_reason text
)
returns table(staff_id uuid,outcome text,remaining_allocations integer)
language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid;
  v_after_status text;
  v_before_status text;
  v_existing app.staff_resource_audit_events%rowtype;
  v_hash text;
  v_membership uuid;
  v_outcome text;
  v_remaining integer;
  v_affected integer;
begin
  if not coalesce((select private.can_manage_staff(p_tenant_id,null)),false) then
    raise exception using errcode='42501',message='staff_authorization_required';
  end if;
  if p_request_id is null then
    raise exception using errcode='22023',message='request_id_required';
  end if;
  if p_resolution is null or p_resolution not in ('reassign','cancel','defer') then
    raise exception using errcode='22023',message='deactivation_resolution_required';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception using errcode='22023',message='reason_required';
  end if;

  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'operation','deactivate_staff_v1','staff_id',p_staff_id,
      'resolution',p_resolution,'replacement_staff_id',p_replacement_staff_id,
      'reason',btrim(p_reason)
    )::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_tenant_id::text||':'||p_request_id::text,0)
  );
  select * into v_existing from app.staff_resource_audit_events e
    where e.tenant_id=p_tenant_id and e.request_id=p_request_id;
  if found then
    if v_existing.request_hash<>v_hash then
      raise exception using errcode='22023',message='idempotency_conflict';
    end if;
    return query select p_staff_id,v_existing.outcome,
      (v_existing.redacted_diff->>'remaining_allocations')::integer;
    return;
  end if;

  select s.status into v_before_status from app.staff_profiles s
    where s.tenant_id=p_tenant_id and s.id=p_staff_id for update;
  if not found then
    raise exception using errcode='22023',message='staff_not_found';
  end if;
  select count(*)::integer into v_affected from app.assignment_allocations a
    where a.tenant_id=p_tenant_id and a.staff_id=p_staff_id
      and a.state in ('held','confirmed') and a.starts_at>statement_timestamp();

  if v_affected>0 and p_resolution='reassign' then
    if p_replacement_staff_id is null or p_replacement_staff_id=p_staff_id
      or not exists (
        select 1 from app.staff_profiles replacement
        where replacement.tenant_id=p_tenant_id
          and replacement.id=p_replacement_staff_id and replacement.status='active'
      ) then
      raise exception using errcode='22023',message='replacement_staff_required';
    end if;
    if exists (
      select 1 from app.assignment_allocations a
      where a.tenant_id=p_tenant_id and a.staff_id=p_staff_id
        and a.state in ('held','confirmed') and a.starts_at>statement_timestamp()
        and not exists (
          select 1 from app.staff_service_locations eligibility
          where eligibility.tenant_id=a.tenant_id
            and eligibility.staff_id=p_replacement_staff_id
            and eligibility.service_id=a.service_id
            and eligibility.location_id=a.location_id
        )
    ) then
      raise exception using errcode='23514',message='replacement_staff_ineligible';
    end if;
    update app.assignment_allocations a set staff_id=p_replacement_staff_id
      where a.tenant_id=p_tenant_id and a.staff_id=p_staff_id
        and a.state in ('held','confirmed') and a.starts_at>statement_timestamp();
    v_outcome := 'reassigned';
  elsif v_affected>0 and p_resolution='cancel' then
    update app.assignment_allocations a set state='cancelled'
      where a.tenant_id=p_tenant_id and a.staff_id=p_staff_id
        and a.state in ('held','confirmed') and a.starts_at>statement_timestamp();
    v_outcome := 'cancelled';
  elsif v_affected>0 then
    v_outcome := 'deferred';
  else
    v_outcome := 'deactivated';
  end if;

  v_after_status := case when v_outcome='deferred' then 'deactivation_pending' else 'inactive' end;
  update app.staff_profiles set status=v_after_status,revision=revision+1,
    updated_at=statement_timestamp()
    where tenant_id=p_tenant_id and id=p_staff_id;
  select count(*)::integer into v_remaining from app.assignment_allocations a
    where a.tenant_id=p_tenant_id and a.staff_id=p_staff_id
      and a.state in ('held','confirmed') and a.starts_at>statement_timestamp();
  v_actor := (select private.current_auth_user_id());
  v_membership := (select private.current_membership_id(p_tenant_id));
  insert into app.staff_resource_audit_events(
    id,tenant_id,actor_membership_id,effective_actor_id,request_id,request_hash,
    action,target_id,reason,outcome,redacted_diff
  ) values (
    pg_catalog.gen_random_uuid(),p_tenant_id,v_membership,v_actor,p_request_id,v_hash,
    'staff_deactivated',p_staff_id,btrim(p_reason),v_outcome,
    pg_catalog.jsonb_build_object(
      'before',pg_catalog.jsonb_build_object('status',v_before_status),
      'after',pg_catalog.jsonb_build_object('status',v_after_status),
      'affected_allocations',v_affected,'remaining_allocations',v_remaining,
      'replacement_staff_id',p_replacement_staff_id,'resolution',p_resolution
    )
  );
  return query select p_staff_id,v_outcome,v_remaining;
exception
  when exclusion_violation then
    raise exception using errcode='23P01',message='replacement_staff_unavailable';
end;
$$;
revoke all on function private.deactivate_staff_v1(uuid,uuid,text,uuid,uuid,text) from public;
grant execute on function private.deactivate_staff_v1(uuid,uuid,text,uuid,uuid,text) to authenticated;

create or replace function api_v1.deactivate_staff_v1(
  p_tenant_id uuid,p_staff_id uuid,p_resolution text,
  p_replacement_staff_id uuid,p_request_id uuid,p_reason text
)
returns table(staff_id uuid,outcome text,remaining_allocations integer)
language sql security invoker set search_path='' as $$
  select * from private.deactivate_staff_v1(
    p_tenant_id,p_staff_id,p_resolution,p_replacement_staff_id,p_request_id,p_reason
  );
$$;
revoke all on function api_v1.deactivate_staff_v1(uuid,uuid,text,uuid,uuid,text) from public;
grant execute on function api_v1.deactivate_staff_v1(uuid,uuid,text,uuid,uuid,text) to authenticated;

create or replace function private.deactivate_resource_v1(
  p_tenant_id uuid,p_resource_id uuid,p_resolution text,
  p_replacement_resource_id uuid,p_request_id uuid,p_reason text
)
returns table(resource_id uuid,outcome text,remaining_allocations integer)
language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid;
  v_after_status text;
  v_before_status text;
  v_existing app.staff_resource_audit_events%rowtype;
  v_hash text;
  v_membership uuid;
  v_outcome text;
  v_remaining integer;
  v_affected integer;
  v_resource_type_id uuid;
begin
  if not coalesce((select private.can_manage_staff(p_tenant_id,null)),false) then
    raise exception using errcode='42501',message='resource_authorization_required';
  end if;
  if p_request_id is null then
    raise exception using errcode='22023',message='request_id_required';
  end if;
  if p_resolution is null or p_resolution not in ('reassign','cancel','defer') then
    raise exception using errcode='22023',message='resource_deactivation_resolution_required';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception using errcode='22023',message='reason_required';
  end if;

  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'operation','deactivate_resource_v1','resource_id',p_resource_id,
      'resolution',p_resolution,'replacement_resource_id',p_replacement_resource_id,
      'reason',btrim(p_reason)
    )::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_tenant_id::text||':'||p_request_id::text,0)
  );
  select * into v_existing from app.staff_resource_audit_events e
    where e.tenant_id=p_tenant_id and e.request_id=p_request_id;
  if found then
    if v_existing.request_hash<>v_hash then
      raise exception using errcode='22023',message='idempotency_conflict';
    end if;
    return query select p_resource_id,v_existing.outcome,
      (v_existing.redacted_diff->>'remaining_allocations')::integer;
    return;
  end if;

  select r.status,r.resource_type_id into v_before_status,v_resource_type_id
    from app.resources r
    where r.tenant_id=p_tenant_id and r.id=p_resource_id for update;
  if not found then
    raise exception using errcode='22023',message='resource_not_found';
  end if;
  select count(*)::integer into v_affected from app.assignment_allocations a
    where a.tenant_id=p_tenant_id and a.resource_id=p_resource_id
      and a.state in ('held','confirmed') and a.starts_at>statement_timestamp();

  if v_affected>0 and p_resolution='reassign' then
    if p_replacement_resource_id is null or p_replacement_resource_id=p_resource_id
      or not exists (
        select 1 from app.resources replacement
        where replacement.tenant_id=p_tenant_id
          and replacement.id=p_replacement_resource_id
          and replacement.resource_type_id=v_resource_type_id
          and replacement.status='active'
      ) then
      raise exception using errcode='22023',message='replacement_resource_required';
    end if;
    if exists (
      select 1 from app.assignment_allocations a
      where a.tenant_id=p_tenant_id and a.resource_id=p_resource_id
        and a.state in ('held','confirmed') and a.starts_at>statement_timestamp()
        and (
          not exists (
            select 1 from app.resource_locations rl
            where rl.tenant_id=a.tenant_id and rl.resource_id=p_replacement_resource_id
              and rl.location_id=a.location_id
          )
          or not exists (
            select 1 from app.resource_requirements rr
            where rr.tenant_id=a.tenant_id and rr.service_id=a.service_id
              and rr.resource_type_id=v_resource_type_id
          )
        )
    ) then
      raise exception using errcode='23514',message='replacement_resource_ineligible';
    end if;
    update app.assignment_allocations a set resource_id=p_replacement_resource_id
      where a.tenant_id=p_tenant_id and a.resource_id=p_resource_id
        and a.state in ('held','confirmed') and a.starts_at>statement_timestamp();
    v_outcome := 'reassigned';
  elsif v_affected>0 and p_resolution='cancel' then
    update app.assignment_allocations a set state='cancelled'
      where a.tenant_id=p_tenant_id and a.resource_id=p_resource_id
        and a.state in ('held','confirmed') and a.starts_at>statement_timestamp();
    v_outcome := 'cancelled';
  elsif v_affected>0 then
    v_outcome := 'deferred';
  else
    v_outcome := 'deactivated';
  end if;

  v_after_status := case when v_outcome='deferred' then 'deactivation_pending' else 'inactive' end;
  update app.resources set status=v_after_status,updated_at=statement_timestamp()
    where tenant_id=p_tenant_id and id=p_resource_id;
  select count(*)::integer into v_remaining from app.assignment_allocations a
    where a.tenant_id=p_tenant_id and a.resource_id=p_resource_id
      and a.state in ('held','confirmed') and a.starts_at>statement_timestamp();
  v_actor := (select private.current_auth_user_id());
  v_membership := (select private.current_membership_id(p_tenant_id));
  insert into app.staff_resource_audit_events(
    id,tenant_id,actor_membership_id,effective_actor_id,request_id,request_hash,
    action,target_id,reason,outcome,redacted_diff
  ) values (
    pg_catalog.gen_random_uuid(),p_tenant_id,v_membership,v_actor,p_request_id,v_hash,
    'resource_deactivated',p_resource_id,btrim(p_reason),v_outcome,
    pg_catalog.jsonb_build_object(
      'before',pg_catalog.jsonb_build_object('status',v_before_status),
      'after',pg_catalog.jsonb_build_object('status',v_after_status),
      'affected_allocations',v_affected,'remaining_allocations',v_remaining,
      'replacement_resource_id',p_replacement_resource_id,'resolution',p_resolution
    )
  );
  return query select p_resource_id,v_outcome,v_remaining;
exception
  when exclusion_violation then
    raise exception using errcode='23P01',message='replacement_resource_unavailable';
end;
$$;
revoke all on function private.deactivate_resource_v1(uuid,uuid,text,uuid,uuid,text) from public;
grant execute on function private.deactivate_resource_v1(uuid,uuid,text,uuid,uuid,text) to authenticated;

create or replace function api_v1.deactivate_resource_v1(
  p_tenant_id uuid,p_resource_id uuid,p_resolution text,
  p_replacement_resource_id uuid,p_request_id uuid,p_reason text
)
returns table(resource_id uuid,outcome text,remaining_allocations integer)
language sql security invoker set search_path='' as $$
  select * from private.deactivate_resource_v1(
    p_tenant_id,p_resource_id,p_resolution,p_replacement_resource_id,p_request_id,p_reason
  );
$$;
revoke all on function api_v1.deactivate_resource_v1(uuid,uuid,text,uuid,uuid,text) from public;
grant execute on function api_v1.deactivate_resource_v1(uuid,uuid,text,uuid,uuid,text) to authenticated;
