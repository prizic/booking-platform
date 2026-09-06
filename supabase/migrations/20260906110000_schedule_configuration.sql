-- Issue #9: civil-time schedules, exceptions, and bounded schedule policy.
-- Public callers never receive these normalized rows; issue #10 owns derived
-- availability.

create table app.schedule_scopes (
  id uuid not null,
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  scope_kind text not null check (scope_kind in ('location','staff','resource')),
  location_id uuid not null,
  staff_id uuid,
  resource_id uuid,
  time_zone text not null check (time_zone = btrim(time_zone) and time_zone ~ '^[A-Za-z_]+(?:/[A-Za-z0-9_+\-]+)+$'),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (id), unique (tenant_id,id),
  foreign key (tenant_id,location_id) references app.locations(tenant_id,id) on delete cascade,
  foreign key (tenant_id,staff_id) references app.staff_profiles(tenant_id,id) on delete cascade,
  foreign key (tenant_id,resource_id) references app.resources(tenant_id,id) on delete cascade,
  check (
    (scope_kind='location' and staff_id is null and resource_id is null)
    or (scope_kind='staff' and staff_id is not null and resource_id is null)
    or (scope_kind='resource' and staff_id is null and resource_id is not null)
  )
);
create unique index schedule_scopes_identity_idx on app.schedule_scopes (
  tenant_id, scope_kind, location_id, coalesce(staff_id,'00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(resource_id,'00000000-0000-0000-0000-000000000000'::uuid)
);

create table app.weekly_schedules (
  id uuid not null, tenant_id uuid not null, schedule_scope_id uuid not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_minute smallint not null check (start_minute between 0 and 1439),
  end_minute smallint not null check (end_minute between 1 and 1440),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (id), unique (tenant_id,id),
  foreign key (tenant_id,schedule_scope_id) references app.schedule_scopes(tenant_id,id) on delete cascade,
  check (end_minute > start_minute)
);

create table app.schedule_breaks (
  id uuid not null, tenant_id uuid not null, schedule_scope_id uuid not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_minute smallint not null check (start_minute between 0 and 1439),
  end_minute smallint not null check (end_minute between 1 and 1440),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (id), unique (tenant_id,id),
  foreign key (tenant_id,schedule_scope_id) references app.schedule_scopes(tenant_id,id) on delete cascade,
  check (end_minute > start_minute)
);

create table app.schedule_exceptions (
  id uuid not null, tenant_id uuid not null, schedule_scope_id uuid not null,
  local_date date not null,
  exception_kind text not null check (exception_kind in ('closed','override')),
  start_minute smallint, end_minute smallint,
  fold smallint check (fold is null or fold in (0,1)),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (id), unique (tenant_id,id),
  foreign key (tenant_id,schedule_scope_id) references app.schedule_scopes(tenant_id,id) on delete cascade,
  check ((exception_kind='closed' and start_minute is null and end_minute is null)
    or (exception_kind='override' and start_minute between 0 and 1439 and end_minute between 1 and 1440 and end_minute > start_minute))
);

create table app.time_off (
  id uuid not null, tenant_id uuid not null, staff_id uuid, resource_id uuid,
  location_id uuid, starts_at timestamptz not null, ends_at timestamptz not null,
  time_zone text not null check (time_zone = btrim(time_zone) and time_zone ~ '^[A-Za-z_]+(?:/[A-Za-z0-9_+\-]+)+$'),
  reason text not null default '' check (char_length(reason) <= 500),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default statement_timestamp(), updated_at timestamptz not null default statement_timestamp(),
  primary key (id), unique (tenant_id,id), check (ends_at > starts_at), check (num_nonnulls(staff_id,resource_id)=1),
  foreign key (tenant_id,staff_id) references app.staff_profiles(tenant_id,id) on delete cascade,
  foreign key (tenant_id,resource_id) references app.resources(tenant_id,id) on delete cascade,
  foreign key (tenant_id,location_id) references app.locations(tenant_id,id) on delete cascade
);

create table app.holidays (
  id uuid not null, tenant_id uuid not null, location_id uuid not null, local_date date not null,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 160),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default statement_timestamp(), updated_at timestamptz not null default statement_timestamp(),
  primary key (id), unique (tenant_id,id), unique (tenant_id,location_id,local_date),
  foreign key (tenant_id,location_id) references app.locations(tenant_id,id) on delete cascade
);

create table app.blackouts (
  id uuid not null, tenant_id uuid not null, location_id uuid not null,
  starts_at timestamptz not null, ends_at timestamptz not null,
  time_zone text not null check (time_zone = btrim(time_zone) and time_zone ~ '^[A-Za-z_]+(?:/[A-Za-z0-9_+\-]+)+$'),
  reason text not null default '' check (char_length(reason) <= 500),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default statement_timestamp(), updated_at timestamptz not null default statement_timestamp(),
  primary key (id), unique (tenant_id,id), check (ends_at > starts_at),
  foreign key (tenant_id,location_id) references app.locations(tenant_id,id) on delete cascade
);

create table app.resource_maintenance_blocks (
  id uuid not null, tenant_id uuid not null, resource_id uuid not null, location_id uuid not null,
  starts_at timestamptz not null, ends_at timestamptz not null,
  time_zone text not null check (time_zone = btrim(time_zone) and time_zone ~ '^[A-Za-z_]+(?:/[A-Za-z0-9_+\-]+)+$'),
  reason text not null default '' check (char_length(reason) <= 500),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default statement_timestamp(), updated_at timestamptz not null default statement_timestamp(),
  primary key (id), unique (tenant_id,id), check (ends_at > starts_at),
  foreign key (tenant_id,resource_id) references app.resources(tenant_id,id) on delete cascade,
  foreign key (tenant_id,location_id) references app.locations(tenant_id,id) on delete cascade,
  foreign key (tenant_id,resource_id,location_id) references app.resource_locations(tenant_id,resource_id,location_id) on delete cascade
);

create table app.schedule_policy_overrides (
  id uuid not null, tenant_id uuid not null,
  scope_kind text not null check (scope_kind in ('tenant','location','service','staff','resource')),
  location_id uuid, service_id uuid, staff_id uuid, resource_id uuid,
  policy_key text not null check (policy_key in (
    'minimum_notice_minutes','horizon_days','slot_interval_minutes','daily_limit_per_staff',
    'buffer_before_minutes','buffer_after_minutes','turnover_minutes','travel_minutes'
  )),
  value jsonb not null check (jsonb_typeof(value) in ('number','null')),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default statement_timestamp(), updated_at timestamptz not null default statement_timestamp(),
  primary key (id), unique (tenant_id,id),
  foreign key (tenant_id,location_id) references app.locations(tenant_id,id) on delete cascade,
  foreign key (tenant_id,service_id) references app.catalog_services(tenant_id,id) on delete cascade,
  foreign key (tenant_id,staff_id) references app.staff_profiles(tenant_id,id) on delete cascade,
  foreign key (tenant_id,resource_id) references app.resources(tenant_id,id) on delete cascade,
  check ((scope_kind='tenant' and num_nonnulls(location_id,service_id,staff_id,resource_id)=0)
    or (scope_kind='location' and num_nonnulls(location_id,service_id,staff_id,resource_id)=1 and location_id is not null)
    or (scope_kind='service' and num_nonnulls(location_id,service_id,staff_id,resource_id)=1 and service_id is not null)
    or (scope_kind='staff' and num_nonnulls(location_id,service_id,staff_id,resource_id)=1 and staff_id is not null)
    or (scope_kind='resource' and num_nonnulls(location_id,service_id,staff_id,resource_id)=1 and resource_id is not null))
);

create table app.schedule_audit_events (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  actor_auth_user_id uuid,
  target_id uuid not null,
  operation text not null,
  outcome text not null check (outcome in ('succeeded','rejected')),
  reason text not null default '' check (char_length(reason) <= 500),
  request_id uuid,
  redacted_diff jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  primary key (id), unique (tenant_id,id)
);
create unique index schedule_audit_request_idx on app.schedule_audit_events(tenant_id,request_id) where request_id is not null;
create or replace function app.prevent_schedule_audit_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='55000', message='schedule_audit_append_only'; end;
$$;
create trigger schedule_audit_append_only before update or delete on app.schedule_audit_events
  for each row execute function app.prevent_schedule_audit_mutation();

create index weekly_schedules_scope_idx on app.weekly_schedules(tenant_id,schedule_scope_id,day_of_week);
create index schedule_breaks_scope_idx on app.schedule_breaks(tenant_id,schedule_scope_id,day_of_week);
create index schedule_exceptions_date_idx on app.schedule_exceptions(tenant_id,schedule_scope_id,local_date);
create index time_off_subject_idx on app.time_off(tenant_id,staff_id,resource_id,starts_at);
create index blackouts_location_idx on app.blackouts(tenant_id,location_id,starts_at);
create index maintenance_resource_idx on app.resource_maintenance_blocks(tenant_id,resource_id,starts_at);
create index schedule_policy_scope_idx on app.schedule_policy_overrides(tenant_id,scope_kind,policy_key);
create unique index schedule_policy_identity_idx on app.schedule_policy_overrides (
  tenant_id,scope_kind,
  coalesce(location_id,'00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(service_id,'00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(staff_id,'00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(resource_id,'00000000-0000-0000-0000-000000000000'::uuid),policy_key
);

create or replace function private.can_manage_schedule_scope(
  p_tenant_id uuid, p_location_id uuid default null, p_staff_id uuid default null, p_resource_id uuid default null
)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from app.memberships m
    join app.role_permissions rp on rp.tenant_id=m.tenant_id and rp.role_id=m.role_id
    where m.tenant_id=p_tenant_id and m.auth_user_id=(select private.current_auth_user_id()) and m.status='active'
      and rp.permission_key='schedule.edit'
      and (rp.grant_kind='direct' or (rp.grant_kind='approval' and (select private.is_aal2())))
      and (
        rp.scope_kind='tenant'
        or (rp.scope_kind='location' and p_location_id is not null and (select private.can_access_location(p_tenant_id,p_location_id)))
        or (rp.scope_kind='own' and p_staff_id is not null and exists (
          select 1 from app.staff_profiles sp
          where sp.tenant_id=p_tenant_id and sp.id=p_staff_id and sp.membership_id=m.id
        ))
      )
  );
$$;
revoke execute on function private.can_manage_schedule_scope(uuid,uuid,uuid,uuid) from public;
grant execute on function private.can_manage_schedule_scope(uuid,uuid,uuid,uuid) to authenticated;

do $rls$
declare t text;
begin
  foreach t in array array['schedule_scopes','weekly_schedules','schedule_breaks','schedule_exceptions','time_off','holidays','blackouts','resource_maintenance_blocks','schedule_policy_overrides'] loop
    execute format('alter table app.%I enable row level security',t);
    execute format('create policy %I on app.%I for select to authenticated using (false)',t||'_select_denied',t);
    execute format('create policy %I on app.%I for insert to authenticated with check (false)',t||'_insert_denied',t);
    execute format('create policy %I on app.%I for update to authenticated using (false) with check (false)',t||'_update_denied',t);
    execute format('create policy %I on app.%I for delete to authenticated using (false)',t||'_delete_denied',t);
  end loop;
  alter table app.schedule_audit_events enable row level security;
  create policy schedule_audit_events_select_denied on app.schedule_audit_events for select to authenticated using (false);
  create policy schedule_audit_events_insert_denied on app.schedule_audit_events for insert to authenticated with check (false);
  create policy schedule_audit_events_update_denied on app.schedule_audit_events for update to authenticated using (false) with check (false);
  create policy schedule_audit_events_delete_denied on app.schedule_audit_events for delete to authenticated using (false);
end;
$rls$;

create policy schedule_scopes_select_scoped on app.schedule_scopes for select to authenticated using ((select private.can_manage_schedule_scope(tenant_id,location_id,staff_id,resource_id)));
create policy weekly_schedules_select_scoped on app.weekly_schedules for select to authenticated using (exists (select 1 from app.schedule_scopes s where s.tenant_id=weekly_schedules.tenant_id and s.id=weekly_schedules.schedule_scope_id and private.can_manage_schedule_scope(s.tenant_id,s.location_id,s.staff_id,s.resource_id)));
create policy schedule_breaks_select_scoped on app.schedule_breaks for select to authenticated using (exists (select 1 from app.schedule_scopes s where s.tenant_id=schedule_breaks.tenant_id and s.id=schedule_breaks.schedule_scope_id and private.can_manage_schedule_scope(s.tenant_id,s.location_id,s.staff_id,s.resource_id)));
create policy schedule_exceptions_select_scoped on app.schedule_exceptions for select to authenticated using (exists (select 1 from app.schedule_scopes s where s.tenant_id=schedule_exceptions.tenant_id and s.id=schedule_exceptions.schedule_scope_id and private.can_manage_schedule_scope(s.tenant_id,s.location_id,s.staff_id,s.resource_id)));
create policy time_off_select_scoped on app.time_off for select to authenticated using ((select private.can_manage_schedule_scope(tenant_id,location_id,staff_id,resource_id)));
create policy holidays_select_scoped on app.holidays for select to authenticated using ((select private.can_manage_schedule_scope(tenant_id,location_id,null,null)));
create policy blackouts_select_scoped on app.blackouts for select to authenticated using ((select private.can_manage_schedule_scope(tenant_id,location_id,null,null)));
create policy maintenance_select_scoped on app.resource_maintenance_blocks for select to authenticated using ((select private.can_manage_schedule_scope(tenant_id,location_id,null,resource_id)));
create policy schedule_policy_select_scoped on app.schedule_policy_overrides for select to authenticated using ((select private.can_manage_schedule_scope(tenant_id,location_id,staff_id,resource_id)) or (scope_kind='tenant' and (select private.can_manage_schedule_scope(tenant_id,null,null,null))));

revoke all on app.schedule_scopes,app.weekly_schedules,app.schedule_breaks,app.schedule_exceptions,app.time_off,app.holidays,app.blackouts,app.resource_maintenance_blocks,app.schedule_policy_overrides from anon,authenticated;
grant select on app.schedule_scopes,app.weekly_schedules,app.schedule_breaks,app.schedule_exceptions,app.time_off,app.holidays,app.blackouts,app.resource_maintenance_blocks,app.schedule_policy_overrides to authenticated;
revoke all on app.schedule_audit_events from anon,authenticated;

create or replace function private.can_manage_policy_scope(
  p_tenant_id uuid, p_location_id uuid default null, p_staff_id uuid default null, p_resource_id uuid default null
) returns boolean language sql stable security definer set search_path='' as $$
  select exists (select 1 from app.memberships m join app.role_permissions rp on rp.tenant_id=m.tenant_id and rp.role_id=m.role_id
    where m.tenant_id=p_tenant_id and m.auth_user_id=(select private.current_auth_user_id()) and m.status='active'
      and rp.permission_key='policy.edit' and (rp.grant_kind='direct' or (rp.grant_kind='approval' and (select private.is_aal2())))
      and (rp.scope_kind='tenant' or (rp.scope_kind='location' and p_location_id is not null and (select private.can_access_location(p_tenant_id,p_location_id)))
        or (rp.scope_kind='own' and p_staff_id is not null and exists (select 1 from app.staff_profiles sp where sp.tenant_id=p_tenant_id and sp.id=p_staff_id and sp.membership_id=m.id))));
$$;
revoke execute on function private.can_manage_policy_scope(uuid,uuid,uuid,uuid) from public;
grant execute on function private.can_manage_policy_scope(uuid,uuid,uuid,uuid) to authenticated;

create or replace function private.save_schedule_config_v1(
  p_tenant_id uuid, p_operation text, p_payload jsonb, p_expected_revision bigint, p_request_id uuid default null
)
returns table(target_id uuid, revision bigint)
language plpgsql security definer set search_path='' as $$
declare
  v_scope app.schedule_scopes%rowtype;
  v_scope_id uuid;
  v_target uuid;
  v_revision bigint;
  v_location uuid;
  v_staff uuid;
  v_resource uuid;
  v_service uuid;
  v_day smallint;
  v_start smallint;
  v_end smallint;
  v_date date;
  v_existing_revision bigint;
  v_value jsonb;
begin
  if p_tenant_id is null or p_payload is null or p_operation is null then
    raise exception using errcode='22023', message='schedule_request_invalid';
  end if;
  if p_request_id is not null then
    select target_id, revision into v_target, v_revision from app.schedule_audit_events
      where tenant_id=p_tenant_id and request_id=p_request_id and outcome='succeeded';
    if found then return query select v_target,v_revision; return; end if;
  end if;
  v_location := nullif(p_payload->>'location_id','')::uuid;
  v_staff := nullif(p_payload->>'staff_id','')::uuid;
  v_resource := nullif(p_payload->>'resource_id','')::uuid;
  if not coalesce((select private.can_manage_schedule_scope(p_tenant_id,v_location,v_staff,v_resource)),false) then
    raise exception using errcode='42501', message='schedule_authorization_required';
  end if;

  if p_operation='scope' then
    v_scope_id := nullif(p_payload->>'scope_id','')::uuid;
    if v_scope_id is null then
      if (p_payload->>'scope_kind') not in ('location','staff','resource') or v_location is null
        or (p_payload->>'scope_kind'='staff' and v_staff is null)
        or (p_payload->>'scope_kind'='resource' and v_resource is null)
        or (p_payload->>'scope_kind'='location' and (v_staff is not null or v_resource is not null)) then
        raise exception using errcode='22023', message='schedule_scope_invalid';
      end if;
      if not exists (select 1 from pg_catalog.pg_timezone_names where name=p_payload->>'time_zone') then
        raise exception using errcode='22023', message='invalid_time_zone';
      end if;
      v_scope_id := coalesce(nullif(p_payload->>'id','')::uuid,pg_catalog.gen_random_uuid());
      if exists (select 1 from app.schedule_scopes where id=v_scope_id and tenant_id<>p_tenant_id) then raise exception using errcode='42501',message='schedule_cross_tenant_target'; end if;
      insert into app.schedule_scopes(id,tenant_id,scope_kind,location_id,staff_id,resource_id,time_zone)
        values(v_scope_id,p_tenant_id,p_payload->>'scope_kind',v_location,v_staff,v_resource,p_payload->>'time_zone');
    else
      select * into v_scope from app.schedule_scopes where tenant_id=p_tenant_id and id=v_scope_id for update;
      if not found or p_expected_revision is null or p_expected_revision<>v_scope.revision then
        raise exception using errcode='40001', message='revision_conflict';
      end if;
      if not exists (select 1 from pg_catalog.pg_timezone_names where name=p_payload->>'time_zone') then
        raise exception using errcode='22023', message='invalid_time_zone';
      end if;
      update app.schedule_scopes set time_zone=p_payload->>'time_zone',revision=revision+1,updated_at=statement_timestamp()
        where tenant_id=p_tenant_id and id=v_scope_id;
    end if;
    v_revision := (select revision from app.schedule_scopes where tenant_id=p_tenant_id and id=v_scope_id);
    insert into app.schedule_audit_events(tenant_id,actor_auth_user_id,target_id,operation,outcome,reason,request_id,redacted_diff) values(p_tenant_id,(select private.current_auth_user_id()),v_scope_id,p_operation,'succeeded',coalesce(p_payload->>'reason',''),p_request_id,jsonb_build_object('time_zone',p_payload->>'time_zone'));
    return query select v_scope_id,v_revision;
    return;
  end if;

  -- These records do not belong to a weekly scope. Their own revision is the
  -- compare-and-swap token, and a null token is only valid for an insert.
  v_service := nullif(p_payload->>'service_id','')::uuid;
  if p_operation in ('time_off','holiday','blackout','maintenance','policy') then
    v_target := nullif(p_payload->>'id','')::uuid;
    if p_operation='time_off' then
      if num_nonnulls(v_staff,v_resource)<>1 or nullif(p_payload->>'starts_at','') is null or nullif(p_payload->>'ends_at','') is null
        or (p_payload->>'starts_at')::timestamptz >= (p_payload->>'ends_at')::timestamptz then
        raise exception using errcode='22023',message='schedule_time_off_invalid';
      end if;
      if not exists (select 1 from pg_catalog.pg_timezone_names where name=p_payload->>'time_zone') then raise exception using errcode='22023',message='invalid_time_zone'; end if;
      if v_target is not null then
        select revision into v_existing_revision from app.time_off where tenant_id=p_tenant_id and id=v_target for update;
        if not found or p_expected_revision is null or p_expected_revision<>v_existing_revision then raise exception using errcode='40001',message='revision_conflict'; end if;
      end if;
      v_target := coalesce(v_target,pg_catalog.gen_random_uuid());
      if exists (select 1 from app.time_off where id=v_target and tenant_id<>p_tenant_id) then raise exception using errcode='42501',message='schedule_cross_tenant_target'; end if;
      insert into app.time_off(id,tenant_id,staff_id,resource_id,location_id,starts_at,ends_at,time_zone,reason)
        values(v_target,p_tenant_id,v_staff,v_resource,v_location,(p_payload->>'starts_at')::timestamptz,(p_payload->>'ends_at')::timestamptz,p_payload->>'time_zone',coalesce(p_payload->>'reason',''))
        on conflict (id) do update set staff_id=excluded.staff_id,resource_id=excluded.resource_id,location_id=excluded.location_id,starts_at=excluded.starts_at,ends_at=excluded.ends_at,time_zone=excluded.time_zone,reason=excluded.reason,revision=time_off.revision+1,updated_at=statement_timestamp();
      v_revision := (select revision from app.time_off where tenant_id=p_tenant_id and id=v_target);
      insert into app.schedule_audit_events(tenant_id,actor_auth_user_id,target_id,operation,outcome,reason,request_id,redacted_diff) values(p_tenant_id,(select private.current_auth_user_id()),v_target,p_operation,'succeeded',coalesce(p_payload->>'reason',''),p_request_id,jsonb_build_object('starts_at',p_payload->>'starts_at','ends_at',p_payload->>'ends_at'));
      return query select v_target,v_revision; return;
    elsif p_operation='holiday' then
      if v_location is null or nullif(p_payload->>'local_date','') is null or btrim(coalesce(p_payload->>'name',''))='' then raise exception using errcode='22023',message='schedule_holiday_invalid'; end if;
      if v_target is not null then
        select revision into v_existing_revision from app.holidays where tenant_id=p_tenant_id and id=v_target for update;
        if not found or p_expected_revision is null or p_expected_revision<>v_existing_revision then raise exception using errcode='40001',message='revision_conflict'; end if;
      end if;
      v_target := coalesce(v_target,pg_catalog.gen_random_uuid());
      if exists (select 1 from app.holidays where id=v_target and tenant_id<>p_tenant_id) then raise exception using errcode='42501',message='schedule_cross_tenant_target'; end if;
      insert into app.holidays(id,tenant_id,location_id,local_date,name) values(v_target,p_tenant_id,v_location,(p_payload->>'local_date')::date,btrim(p_payload->>'name'))
        on conflict (id) do update set location_id=excluded.location_id,local_date=excluded.local_date,name=excluded.name,revision=holidays.revision+1,updated_at=statement_timestamp();
      v_revision := (select revision from app.holidays where tenant_id=p_tenant_id and id=v_target);
      insert into app.schedule_audit_events(tenant_id,actor_auth_user_id,target_id,operation,outcome,reason,request_id,redacted_diff) values(p_tenant_id,(select private.current_auth_user_id()),v_target,p_operation,'succeeded',coalesce(p_payload->>'reason',''),p_request_id,jsonb_build_object('local_date',p_payload->>'local_date'));
      return query select v_target,v_revision; return;
    elsif p_operation in ('blackout','maintenance') then
      if v_location is null or nullif(p_payload->>'starts_at','') is null or nullif(p_payload->>'ends_at','') is null
        or (p_payload->>'starts_at')::timestamptz >= (p_payload->>'ends_at')::timestamptz then raise exception using errcode='22023',message='schedule_blackout_invalid'; end if;
      if p_operation='maintenance' and v_resource is null then raise exception using errcode='22023',message='schedule_maintenance_invalid'; end if;
      if not exists (select 1 from pg_catalog.pg_timezone_names where name=p_payload->>'time_zone') then raise exception using errcode='22023',message='invalid_time_zone'; end if;
      if v_target is not null then
        if p_operation='blackout' then select revision into v_existing_revision from app.blackouts where tenant_id=p_tenant_id and id=v_target for update;
        else select revision into v_existing_revision from app.resource_maintenance_blocks where tenant_id=p_tenant_id and id=v_target for update; end if;
        if not found or p_expected_revision is null or p_expected_revision<>v_existing_revision then raise exception using errcode='40001',message='revision_conflict'; end if;
      end if;
      v_target := coalesce(v_target,pg_catalog.gen_random_uuid());
      if (p_operation='blackout' and exists (select 1 from app.blackouts where id=v_target and tenant_id<>p_tenant_id)) or (p_operation='maintenance' and exists (select 1 from app.resource_maintenance_blocks where id=v_target and tenant_id<>p_tenant_id)) then raise exception using errcode='42501',message='schedule_cross_tenant_target'; end if;
      if p_operation='blackout' then
        insert into app.blackouts(id,tenant_id,location_id,starts_at,ends_at,time_zone,reason) values(v_target,p_tenant_id,v_location,(p_payload->>'starts_at')::timestamptz,(p_payload->>'ends_at')::timestamptz,p_payload->>'time_zone',coalesce(p_payload->>'reason',''))
          on conflict (id) do update set location_id=excluded.location_id,starts_at=excluded.starts_at,ends_at=excluded.ends_at,time_zone=excluded.time_zone,reason=excluded.reason,revision=blackouts.revision+1,updated_at=statement_timestamp();
        v_revision := (select revision from app.blackouts where tenant_id=p_tenant_id and id=v_target);
        insert into app.schedule_audit_events(tenant_id,actor_auth_user_id,target_id,operation,outcome,reason,request_id,redacted_diff) values(p_tenant_id,(select private.current_auth_user_id()),v_target,p_operation,'succeeded',coalesce(p_payload->>'reason',''),p_request_id,jsonb_build_object('starts_at',p_payload->>'starts_at','ends_at',p_payload->>'ends_at'));
        return query select v_target,v_revision;
      else
        insert into app.resource_maintenance_blocks(id,tenant_id,resource_id,location_id,starts_at,ends_at,time_zone,reason) values(v_target,p_tenant_id,v_resource,v_location,(p_payload->>'starts_at')::timestamptz,(p_payload->>'ends_at')::timestamptz,p_payload->>'time_zone',coalesce(p_payload->>'reason',''))
          on conflict (id) do update set resource_id=excluded.resource_id,location_id=excluded.location_id,starts_at=excluded.starts_at,ends_at=excluded.ends_at,time_zone=excluded.time_zone,reason=excluded.reason,revision=resource_maintenance_blocks.revision+1,updated_at=statement_timestamp();
        v_revision := (select revision from app.resource_maintenance_blocks where tenant_id=p_tenant_id and id=v_target);
        insert into app.schedule_audit_events(tenant_id,actor_auth_user_id,target_id,operation,outcome,reason,request_id,redacted_diff) values(p_tenant_id,(select private.current_auth_user_id()),v_target,p_operation,'succeeded',coalesce(p_payload->>'reason',''),p_request_id,jsonb_build_object('starts_at',p_payload->>'starts_at','ends_at',p_payload->>'ends_at'));
        return query select v_target,v_revision;
      end if;
    else
      if not coalesce((select private.can_manage_policy_scope(p_tenant_id,v_location,v_staff,v_resource)),false) then raise exception using errcode='42501',message='policy_authorization_required'; end if;
      if (p_payload->>'policy_key') not in ('minimum_notice_minutes','horizon_days','slot_interval_minutes','daily_limit_per_staff','buffer_before_minutes','buffer_after_minutes','turnover_minutes','travel_minutes') then raise exception using errcode='22023',message='schedule_policy_invalid'; end if;
      v_value := p_payload->'value';
      if jsonb_typeof(v_value)<>'number' and jsonb_typeof(v_value)<>'null' then raise exception using errcode='22023',message='schedule_policy_invalid'; end if;
      if v_value='null'::jsonb and p_payload->>'policy_key'<>'daily_limit_per_staff' then raise exception using errcode='22023',message='schedule_policy_out_of_bounds'; end if;
      if v_value is not null and v_value<>'null'::jsonb and ((p_payload->>'policy_key')='minimum_notice_minutes' and (v_value#>>'{}')::numeric not between 0 and 43200 or (p_payload->>'policy_key')='horizon_days' and (v_value#>>'{}')::numeric not between 1 and 365 or (p_payload->>'policy_key')='slot_interval_minutes' and (v_value#>>'{}')::numeric not in (5,10,15,20,30,60) or (p_payload->>'policy_key')='daily_limit_per_staff' and (v_value#>>'{}')::numeric not between 1 and 50 or (p_payload->>'policy_key') in ('buffer_before_minutes','buffer_after_minutes') and (v_value#>>'{}')::numeric not between 0 and 120 or (p_payload->>'policy_key') in ('turnover_minutes','travel_minutes') and (v_value#>>'{}')::numeric not between 0 and 1440) then raise exception using errcode='22023',message='schedule_policy_out_of_bounds'; end if;
      if v_target is not null then select revision into v_existing_revision from app.schedule_policy_overrides where tenant_id=p_tenant_id and id=v_target for update; if not found or p_expected_revision is null or p_expected_revision<>v_existing_revision then raise exception using errcode='40001',message='revision_conflict'; end if; end if;
      v_target := coalesce(v_target,pg_catalog.gen_random_uuid());
      if exists (select 1 from app.schedule_policy_overrides where id=v_target and tenant_id<>p_tenant_id) then raise exception using errcode='42501',message='schedule_cross_tenant_target'; end if;
      insert into app.schedule_policy_overrides(id,tenant_id,scope_kind,location_id,service_id,staff_id,resource_id,policy_key,value) values(v_target,p_tenant_id,p_payload->>'scope_kind',v_location,v_service,v_staff,v_resource,p_payload->>'policy_key',v_value)
        on conflict (id) do update set value=excluded.value,revision=schedule_policy_overrides.revision+1,updated_at=statement_timestamp();
      v_revision := (select revision from app.schedule_policy_overrides where tenant_id=p_tenant_id and id=v_target);
      insert into app.schedule_audit_events(tenant_id,actor_auth_user_id,target_id,operation,outcome,reason,request_id,redacted_diff)
        values(p_tenant_id,(select private.current_auth_user_id()),v_target,p_operation,'succeeded',coalesce(p_payload->>'reason',''),p_request_id,jsonb_build_object('policy_key',p_payload->>'policy_key','value',v_value));
      return query select v_target,v_revision; return;
    end if;
  end if;

  v_scope_id := nullif(p_payload->>'scope_id','')::uuid;
  select * into v_scope from app.schedule_scopes where tenant_id=p_tenant_id and id=v_scope_id for update;
  if not found or p_expected_revision is null or p_expected_revision<>v_scope.revision then
    raise exception using errcode='40001', message='revision_conflict';
  end if;
  v_day := nullif(p_payload->>'day_of_week','')::smallint;
  v_start := nullif(p_payload->>'start_minute','')::smallint;
  v_end := nullif(p_payload->>'end_minute','')::smallint;

  if p_operation='weekly' then
    if v_day not between 0 and 6 or v_start not between 0 and 1439 or v_end not between 1 and 1440 or v_end<=v_start then
      raise exception using errcode='22023', message='schedule_interval_invalid';
    end if;
    v_target := coalesce(nullif(p_payload->>'id','')::uuid,pg_catalog.gen_random_uuid());
    if exists (select 1 from app.weekly_schedules where id=v_target and tenant_id<>p_tenant_id) then raise exception using errcode='42501',message='schedule_cross_tenant_target'; end if;
    if exists (select 1 from app.weekly_schedules w where w.tenant_id=p_tenant_id and w.id=v_target and w.schedule_scope_id<>v_scope_id) then
      raise exception using errcode='22023', message='schedule_scope_mismatch';
    end if;
    if exists (select 1 from app.weekly_schedules w where w.tenant_id=p_tenant_id and w.schedule_scope_id=v_scope_id and w.day_of_week=v_day and w.id<>v_target and w.start_minute<v_end and v_start<w.end_minute) then
      raise exception using errcode='22023', message='schedule_interval_overlap';
    end if;
    insert into app.weekly_schedules(id,tenant_id,schedule_scope_id,day_of_week,start_minute,end_minute)
      values(v_target,p_tenant_id,v_scope_id,v_day,v_start,v_end)
      on conflict (id) do update set day_of_week=excluded.day_of_week,start_minute=excluded.start_minute,end_minute=excluded.end_minute,revision=weekly_schedules.revision+1,updated_at=statement_timestamp();
    if exists (select 1 from app.schedule_breaks b where b.tenant_id=p_tenant_id and b.schedule_scope_id=v_scope_id and b.day_of_week=v_day and not exists (select 1 from app.weekly_schedules w where w.tenant_id=b.tenant_id and w.schedule_scope_id=b.schedule_scope_id and w.day_of_week=b.day_of_week and w.start_minute<=b.start_minute and w.end_minute>=b.end_minute)) then
      raise exception using errcode='22023',message='schedule_break_outside_hours';
    end if;
  elsif p_operation='break' then
    if v_day not between 0 and 6 or v_start not between 0 and 1439 or v_end not between 1 and 1440 or v_end<=v_start then
      raise exception using errcode='22023', message='schedule_interval_invalid';
    end if;
    v_target := coalesce(nullif(p_payload->>'id','')::uuid,pg_catalog.gen_random_uuid());
    if exists (select 1 from app.schedule_breaks where id=v_target and tenant_id<>p_tenant_id) then raise exception using errcode='42501',message='schedule_cross_tenant_target'; end if;
    if not exists (select 1 from app.weekly_schedules w where w.tenant_id=p_tenant_id and w.schedule_scope_id=v_scope_id and w.day_of_week=v_day and w.start_minute<=v_start and w.end_minute>=v_end) then
      raise exception using errcode='22023', message='schedule_break_outside_hours';
    end if;
    if exists (select 1 from app.schedule_breaks b where b.tenant_id=p_tenant_id and b.schedule_scope_id=v_scope_id and b.day_of_week=v_day and b.id<>v_target and b.start_minute<v_end and v_start<b.end_minute) then
      raise exception using errcode='22023', message='schedule_break_overlap';
    end if;
    insert into app.schedule_breaks(id,tenant_id,schedule_scope_id,day_of_week,start_minute,end_minute)
      values(v_target,p_tenant_id,v_scope_id,v_day,v_start,v_end)
      on conflict (id) do update set day_of_week=excluded.day_of_week,start_minute=excluded.start_minute,end_minute=excluded.end_minute,revision=schedule_breaks.revision+1,updated_at=statement_timestamp();
  elsif p_operation='exception' then
    v_date := nullif(p_payload->>'local_date','')::date;
    if v_date is null then raise exception using errcode='22023',message='schedule_date_invalid'; end if;
    if (p_payload->>'exception_kind') not in ('closed','override') then
      raise exception using errcode='22023',message='schedule_exception_invalid';
    end if;
    if p_payload->>'exception_kind'='override' and (v_start is null or v_end is null or v_start not between 0 and 1439 or v_end not between 1 and 1440 or v_end<=v_start) then
      raise exception using errcode='22023',message='schedule_interval_invalid';
    end if;
    v_target := coalesce(nullif(p_payload->>'id','')::uuid,pg_catalog.gen_random_uuid());
    if exists (select 1 from app.schedule_exceptions where id=v_target and tenant_id<>p_tenant_id) then raise exception using errcode='42501',message='schedule_cross_tenant_target'; end if;
    if exists (select 1 from app.schedule_exceptions e where e.tenant_id=p_tenant_id and e.schedule_scope_id=v_scope_id and e.local_date=v_date and e.id<>v_target and e.exception_kind<>p_payload->>'exception_kind') then
      raise exception using errcode='22023',message='schedule_exception_conflict';
    end if;
    if (p_payload->>'exception_kind')='override' and exists (select 1 from app.schedule_exceptions e where e.tenant_id=p_tenant_id and e.schedule_scope_id=v_scope_id and e.local_date=v_date and e.id<>v_target and e.exception_kind='override' and e.start_minute<v_end and v_start<e.end_minute) then
      raise exception using errcode='22023',message='schedule_exception_overlap';
    end if;
    insert into app.schedule_exceptions(id,tenant_id,schedule_scope_id,local_date,exception_kind,start_minute,end_minute,fold)
      values(v_target,p_tenant_id,v_scope_id,v_date,p_payload->>'exception_kind',case when p_payload->>'exception_kind'='closed' then null else v_start end,case when p_payload->>'exception_kind'='closed' then null else v_end end,nullif(p_payload->>'fold','')::smallint)
      on conflict (id) do update set local_date=excluded.local_date,exception_kind=excluded.exception_kind,start_minute=excluded.start_minute,end_minute=excluded.end_minute,fold=excluded.fold,revision=schedule_exceptions.revision+1,updated_at=statement_timestamp();
  else
    raise exception using errcode='22023',message='schedule_operation_invalid';
  end if;
  update app.schedule_scopes set revision=revision+1,updated_at=statement_timestamp() where tenant_id=p_tenant_id and id=v_scope_id returning revision into v_revision;
  insert into app.schedule_audit_events(tenant_id,actor_auth_user_id,target_id,operation,outcome,reason,request_id,redacted_diff) values(p_tenant_id,(select private.current_auth_user_id()),v_target,p_operation,'succeeded',coalesce(p_payload->>'reason',''),p_request_id,jsonb_build_object('day_of_week',v_day,'start_minute',v_start,'end_minute',v_end));
  return query select v_target,v_revision;
exception when others then
  if p_tenant_id is not null then
    insert into app.schedule_audit_events(tenant_id,actor_auth_user_id,target_id,operation,outcome,reason,request_id,redacted_diff)
      values(p_tenant_id,(select private.current_auth_user_id()),coalesce(v_target,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(p_operation,'unknown'),'rejected',left(sqlerrm,500),null,jsonb_build_object('error_code',sqlstate));
  end if;
  raise;
end;
$$;
revoke execute on function private.save_schedule_config_v1(uuid,text,jsonb,bigint,uuid) from public;
grant execute on function private.save_schedule_config_v1(uuid,text,jsonb,bigint,uuid) to authenticated;

create or replace function api_v1.save_schedule_config_v1(
  p_tenant_id uuid, p_operation text, p_payload jsonb, p_expected_revision bigint, p_request_id uuid default null
)
returns table(target_id uuid, revision bigint)
language sql security invoker set search_path='' as $$
  select * from private.save_schedule_config_v1(p_tenant_id,p_operation,p_payload,p_expected_revision,p_request_id);
$$;
revoke all on function api_v1.save_schedule_config_v1(uuid,text,jsonb,bigint,uuid) from public;
grant execute on function api_v1.save_schedule_config_v1(uuid,text,jsonb,bigint,uuid) to authenticated;

comment on function api_v1.save_schedule_config_v1(uuid,text,jsonb,bigint,uuid) is
  'Versioned tenant schedule authoring. Returns only the changed target and revision; public availability is a separate contract.';

create or replace function api_v1.get_schedule_workspace_v1(p_tenant_id uuid, p_location_id uuid default null)
returns table(kind text, id uuid, scope_id uuid, location_id uuid, staff_id uuid, resource_id uuid,
  local_date text, day_of_week smallint, start_minute smallint, end_minute smallint, starts_at timestamptz, ends_at timestamptz,
  exception_kind text, time_zone text, reason text, policy_key text, value numeric, revision bigint)
language sql security invoker set search_path='' as $$
  select 'scope', s.id, s.id, s.location_id, s.staff_id, s.resource_id, null, null, null, null, null, null, null, s.time_zone, null, null, null, s.revision
    from app.schedule_scopes s where s.tenant_id=p_tenant_id and (p_location_id is null or s.location_id=p_location_id)
  union all select 'weekly', w.id, w.schedule_scope_id, s.location_id, s.staff_id, s.resource_id, null, w.day_of_week, w.start_minute, w.end_minute, null, null, null, s.time_zone, null, null, null, w.revision
    from app.weekly_schedules w join app.schedule_scopes s on s.tenant_id=w.tenant_id and s.id=w.schedule_scope_id where w.tenant_id=p_tenant_id and (p_location_id is null or s.location_id=p_location_id)
  union all select 'break', b.id, b.schedule_scope_id, s.location_id, s.staff_id, s.resource_id, null, b.day_of_week, b.start_minute, b.end_minute, null, null, null, s.time_zone, null, null, null, b.revision
    from app.schedule_breaks b join app.schedule_scopes s on s.tenant_id=b.tenant_id and s.id=b.schedule_scope_id where b.tenant_id=p_tenant_id and (p_location_id is null or s.location_id=p_location_id)
  union all select 'exception', e.id, e.schedule_scope_id, s.location_id, s.staff_id, s.resource_id, e.local_date::text, null, e.start_minute, e.end_minute, null, null, e.exception_kind, s.time_zone, null, null, null, e.revision
    from app.schedule_exceptions e join app.schedule_scopes s on s.tenant_id=e.tenant_id and s.id=e.schedule_scope_id where e.tenant_id=p_tenant_id and (p_location_id is null or s.location_id=p_location_id)
  union all select 'time_off', t.id, null, t.location_id, t.staff_id, t.resource_id, null, null, null, null, t.starts_at, t.ends_at, null, t.time_zone, t.reason, null, null, t.revision from app.time_off t where t.tenant_id=p_tenant_id and (p_location_id is null or t.location_id=p_location_id)
  union all select 'holiday', h.id, null, h.location_id, null, null, h.local_date::text, null, null, null, null, null, null, null, h.name, null, null, h.revision from app.holidays h where h.tenant_id=p_tenant_id and (p_location_id is null or h.location_id=p_location_id)
  union all select 'blackout', b.id, null, b.location_id, null, null, null, null, null, null, b.starts_at, b.ends_at, null, b.time_zone, b.reason, null, null, b.revision from app.blackouts b where b.tenant_id=p_tenant_id and (p_location_id is null or b.location_id=p_location_id)
  union all select 'maintenance', m.id, null, m.location_id, null, m.resource_id, null, null, null, null, m.starts_at, m.ends_at, null, m.time_zone, m.reason, null, null, m.revision from app.resource_maintenance_blocks m where m.tenant_id=p_tenant_id and (p_location_id is null or m.location_id=p_location_id)
  union all select 'policy', p.id, null, p.location_id, p.staff_id, p.resource_id, null, null, null, null, null, null, null, null, null, p.policy_key, case when p.value='null'::jsonb then null else (p.value#>>'{}')::numeric end, p.revision from app.schedule_policy_overrides p where p.tenant_id=p_tenant_id and (p_location_id is null or p.location_id=p_location_id)
  order by revision, kind, id;
$$;
revoke all on function api_v1.get_schedule_workspace_v1(uuid,uuid) from public;
grant execute on function api_v1.get_schedule_workspace_v1(uuid,uuid) to authenticated;
