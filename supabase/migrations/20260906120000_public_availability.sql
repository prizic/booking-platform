-- Issue #10: bounded, advisory public availability. Calendar-provider health is
-- deliberately not applicable until the Phase 2 calendar synchronization work.

create table app.availability_revisions (
  tenant_id uuid primary key references app.tenants(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default statement_timestamp()
);
alter table app.availability_revisions enable row level security;
revoke all on app.availability_revisions from public, anon, authenticated;
insert into app.availability_revisions(tenant_id)
select id from app.tenants
on conflict (tenant_id) do nothing;

create or replace function private.bump_availability_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := coalesce(new.tenant_id, old.tenant_id);
begin
  insert into app.availability_revisions(tenant_id,revision,updated_at)
  values (v_tenant_id,1,statement_timestamp())
  on conflict (tenant_id) do update
    set revision=app.availability_revisions.revision+1,
        updated_at=excluded.updated_at;
  return coalesce(new,old);
end;
$$;
revoke all on function private.bump_availability_revision() from public,anon,authenticated;

create or replace function private.initialize_availability_revision()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into app.availability_revisions(tenant_id) values (new.id)
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;
revoke all on function private.initialize_availability_revision() from public,anon,authenticated;
create trigger tenant_initialize_availability_revision
after insert on app.tenants for each row execute function private.initialize_availability_revision();

do $triggers$
declare
  v_table text;
begin
  foreach v_table in array array[
    'catalog_publications','catalog_services','catalog_service_revisions','catalog_service_locations',
    'locations','staff_profiles','staff_services','staff_locations','staff_service_locations',
    'resources','resource_locations','resource_requirements','schedule_scopes','weekly_schedules',
    'schedule_breaks','schedule_exceptions','time_off','holidays','blackouts',
    'resource_maintenance_blocks','schedule_policy_overrides','assignment_allocations'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on app.%I for each row execute function private.bump_availability_revision()',
      v_table || '_availability_revision', v_table
    );
  end loop;
end;
$triggers$;

-- Range indexes support the bounded overlap anti-joins. UTC tsrange matches the
-- immutable representation already used by assignment_allocations. Separate
-- indexes are required for nullable staff/resource subjects.
create index time_off_staff_occupied_idx on app.time_off using gist (
  tenant_id, staff_id,
  tsrange(starts_at at time zone 'UTC',ends_at at time zone 'UTC','[)')
) where staff_id is not null;
create index time_off_resource_occupied_idx on app.time_off using gist (
  tenant_id, resource_id,
  tsrange(starts_at at time zone 'UTC',ends_at at time zone 'UTC','[)')
) where resource_id is not null;
create index blackouts_location_occupied_idx on app.blackouts using gist (
  tenant_id, location_id,
  tsrange(starts_at at time zone 'UTC',ends_at at time zone 'UTC','[)')
);
create index maintenance_resource_occupied_idx on app.resource_maintenance_blocks using gist (
  tenant_id, resource_id,
  tsrange(starts_at at time zone 'UTC',ends_at at time zone 'UTC','[)')
);
create index assignment_allocations_staff_daily_idx
  on app.assignment_allocations(tenant_id,staff_id,starts_at)
  where staff_id is not null and state in ('confirmed','completed');

create or replace function private.resolve_availability_policy_v1(
  p_tenant_id uuid,p_location_id uuid,p_service_id uuid,p_staff_id uuid,
  p_resource_id uuid,p_policy_key text,p_default integer
)
returns integer language sql stable security definer set search_path='' as $$
  select coalesce(
    (select (o.value#>>'{}')::integer from app.schedule_policy_overrides o
      where o.tenant_id=p_tenant_id and o.scope_kind='staff' and o.staff_id=p_staff_id and o.policy_key=p_policy_key),
    (select (o.value#>>'{}')::integer from app.schedule_policy_overrides o
      where o.tenant_id=p_tenant_id and o.scope_kind='resource' and o.resource_id=p_resource_id and o.policy_key=p_policy_key),
    (select (o.value#>>'{}')::integer from app.schedule_policy_overrides o
      where o.tenant_id=p_tenant_id and o.scope_kind='service' and o.service_id=p_service_id and o.policy_key=p_policy_key),
    (select (o.value#>>'{}')::integer from app.schedule_policy_overrides o
      where o.tenant_id=p_tenant_id and o.scope_kind='location' and o.location_id=p_location_id and o.policy_key=p_policy_key),
    (select (o.value#>>'{}')::integer from app.schedule_policy_overrides o
      where o.tenant_id=p_tenant_id and o.scope_kind='tenant' and o.policy_key=p_policy_key),
    p_default
  );
$$;
revoke all on function private.resolve_availability_policy_v1(uuid,uuid,uuid,uuid,uuid,text,integer) from public,anon,authenticated;

create or replace function private.get_availability_v1(
  p_hostname text,
  p_application text,
  p_service_id uuid,
  p_location_id uuid,
  p_staff_preference_id uuid default null,
  p_window_start timestamptz default null,
  p_window_end timestamptz default null,
  p_party_size integer default 1,
  p_customer_time_zone text default null
)
returns table(
  contract_version integer,
  result_kind text,
  allocation_kind text,
  slot_start timestamptz,
  slot_end timestamptz,
  staff_id uuid,
  candidate_rank integer,
  location_time_zone text,
  customer_time_zone text,
  local_start timestamp,
  utc_offset_seconds integer,
  fold smallint,
  advisory_as_of timestamptz,
  advisory_until timestamptz,
  no_slot_code text,
  provider_health_code text,
  cache_tag text
)
language plpgsql
stable
security definer
set search_path=''
set statement_timeout='2s'
as $function$
declare
  v_now timestamptz := statement_timestamp();
  v_tenant_id uuid;
  v_publication_id uuid;
  v_publication_revision bigint;
  v_config_version bigint;
  v_feature_version bigint;
  v_availability_revision bigint;
  v_location_time_zone text;
  v_customer_time_zone text;
  v_assignment_mode text;
  v_capacity_mode text;
  v_allocation_kind text;
  v_fixed_staff_id uuid;
  v_candidate_count bigint;
  v_grid_point_count bigint;
  v_grid_start timestamptz;
  v_grid_end timestamptz;
  -- Bounds the candidate/grid cross product before generate_series. This is a
  -- correctness-preserving rejection limit: eligible subjects are never truncated.
  v_max_candidate_grid_work constant bigint := 250000;
begin
  if p_hostname is null or p_hostname<>lower(btrim(p_hostname))
     or char_length(p_hostname) not between 4 and 253
     or p_hostname !~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$' then
    raise exception using errcode='22023',message='availability_invalid_hostname';
  end if;
  if p_application not in ('client','dashboard') then
    raise exception using errcode='22023',message='availability_invalid_application';
  end if;
  if p_window_start is null or p_window_end is null or p_window_end<=p_window_start then
    raise exception using errcode='22023',message='availability_invalid_window';
  end if;
  if p_window_end-p_window_start>interval '31 days' then
    raise exception using errcode='22023',message='availability_window_too_large';
  end if;
  if p_party_size is distinct from 1 then
    raise exception using errcode='22023',message='availability_party_size_out_of_bounds';
  end if;
  if p_customer_time_zone is not null and not exists(
    select 1 from pg_catalog.pg_timezone_names where name=p_customer_time_zone
  ) then
    raise exception using errcode='22023',message='availability_invalid_timezone';
  end if;

  select d.tenant_id,p.id,p.revision,ts.config_version,ts.feature_version,
         coalesce(ar.revision,1),location_scope.time_zone,s.assignment_mode
  into v_tenant_id,v_publication_id,v_publication_revision,v_config_version,
       v_feature_version,v_availability_revision,v_location_time_zone,v_assignment_mode
  from app.tenant_domains d
  join app.instances i on i.tenant_id=d.tenant_id and i.id=d.instance_id and i.deployment_state='active'
  join app.brands b on b.tenant_id=i.tenant_id and b.id=i.brand_id and b.status='active'
  join app.brand_revisions br on br.tenant_id=i.tenant_id and br.id=i.published_brand_revision_id and br.state='published'
  join app.tenants t on t.id=d.tenant_id and t.status='active'
  join app.tenant_settings ts on ts.tenant_id=t.id
  join app.catalog_publications p on p.tenant_id=t.id and p.state='published'
  join app.catalog_services s on s.tenant_id=t.id and s.id=p_service_id and s.status='active'
  join app.catalog_service_locations sl on sl.tenant_id=s.tenant_id and sl.service_id=s.id and sl.location_id=p_location_id
  join app.locations l on l.tenant_id=sl.tenant_id and l.id=sl.location_id and l.status='active'
  join app.schedule_scopes location_scope on location_scope.tenant_id=l.tenant_id
    and location_scope.scope_kind='location' and location_scope.location_id=l.id
  left join app.availability_revisions ar on ar.tenant_id=t.id
  where d.hostname=p_hostname and d.application=p_application and d.kind='production'
    and d.verification_status='verified' and d.verified_at is not null and d.active
    and exists(select 1 from app.catalog_service_revisions sr where sr.tenant_id=s.tenant_id
      and sr.service_id=s.id and sr.publication_id=p.id and sr.state='published')
  limit 1;

  if v_tenant_id is null or (p_application='dashboard' and not coalesce(
    (select private.is_active_tenant_member(v_tenant_id)),false)) then
    raise exception using errcode='42501',message='availability_context_required';
  end if;
  if p_application='dashboard' and not coalesce(
    (select private.can_access_location(v_tenant_id,p_location_id)),false) then
    raise exception using errcode='42501',message='availability_context_required';
  end if;
  v_customer_time_zone := coalesce(p_customer_time_zone,v_location_time_zone);
  select sr.capacity_mode,sr.booking_mode,s.fixed_staff_id
    into v_capacity_mode,v_allocation_kind,v_fixed_staff_id
    from app.catalog_service_revisions sr
    join app.catalog_services s on s.tenant_id=sr.tenant_id and s.id=sr.service_id
    where sr.tenant_id=v_tenant_id and sr.service_id=p_service_id
      and sr.publication_id=v_publication_id and sr.state='published'
    order by (sr.locale='en') desc,sr.locale limit 1;
  if v_capacity_mode<>'exclusive' then
    raise exception using errcode='22023',message='availability_selection_unavailable';
  end if;

  if v_assignment_mode='customer_choice' and p_staff_preference_id is null then
    raise exception using errcode='22023',message='availability_staff_preference_required';
  end if;
  if p_staff_preference_id is not null and not exists(
    select 1 from app.staff_service_locations ssl join app.staff_profiles sp
      on sp.tenant_id=ssl.tenant_id and sp.id=ssl.staff_id and sp.status='active'
    where ssl.tenant_id=v_tenant_id and ssl.service_id=p_service_id
      and ssl.location_id=p_location_id and ssl.staff_id=p_staff_preference_id
  ) then
    raise exception using errcode='22023',message='availability_selection_unavailable';
  end if;

  select count(*) into v_candidate_count from (
    select sp.id
    from app.staff_service_locations ssl
    join app.staff_profiles sp on sp.tenant_id=ssl.tenant_id and sp.id=ssl.staff_id and sp.status='active'
    join app.schedule_scopes subject_scope on subject_scope.tenant_id=sp.tenant_id
      and subject_scope.scope_kind='staff' and subject_scope.location_id=p_location_id
      and subject_scope.staff_id=sp.id
    where ssl.tenant_id=v_tenant_id and ssl.service_id=p_service_id and ssl.location_id=p_location_id
      and v_allocation_kind='appointment'
      and (p_staff_preference_id is null or sp.id=p_staff_preference_id)
      and (v_assignment_mode<>'fixed_staff' or sp.id=v_fixed_staff_id)
    union all
    select r.id
    from app.resource_requirements rr
    join app.resources r on r.tenant_id=rr.tenant_id and r.resource_type_id=rr.resource_type_id and r.status='active'
    join app.resource_locations rl on rl.tenant_id=r.tenant_id and rl.resource_id=r.id and rl.location_id=p_location_id
    join app.schedule_scopes subject_scope on subject_scope.tenant_id=r.tenant_id
      and subject_scope.scope_kind='resource' and subject_scope.location_id=p_location_id
      and subject_scope.resource_id=r.id
    where rr.tenant_id=v_tenant_id and rr.service_id=p_service_id
      and v_allocation_kind='exclusive_resource' and p_staff_preference_id is null
  ) eligible_candidates;
  -- Floor the instant using its location civil minute, preserving the UTC
  -- occurrence during a fold instead of converting an ambiguous local time.
  v_grid_start := p_window_start
    - make_interval(secs=>extract(second from p_window_start at time zone v_location_time_zone)::double precision)
    - make_interval(mins=>mod(extract(minute from p_window_start at time zone v_location_time_zone)::integer,5));
  -- Include both occurrences before computing folds. The 28-hour context
  -- covers the full difference between supported IANA UTC offsets (-14..+14),
  -- independent of request bounds, notice, buffers, and slot interval. Charge
  -- every padded point to the same workload bound before generating anything.
  v_grid_start := v_grid_start-interval '28 hours';
  v_grid_end := p_window_end+interval '28 hours';
  v_grid_point_count := floor(extract(epoch from (v_grid_end-v_grid_start))/300)::bigint+1;
  if v_candidate_count>v_max_candidate_grid_work/v_grid_point_count then
    raise exception using errcode='54000',message='availability_query_too_complex';
  end if;

  return query
  with service_rule as (
    select sr.duration_minutes,sr.buffer_before_minutes as published_before,
           sr.buffer_after_minutes as published_after,s.fixed_staff_id,s.assignment_mode,
           sr.booking_mode as allocation_kind
    from app.catalog_services s
    join app.catalog_service_revisions sr on sr.tenant_id=s.tenant_id and sr.service_id=s.id
      and sr.publication_id=v_publication_id and sr.state='published'
    where s.tenant_id=v_tenant_id and s.id=p_service_id
    order by (sr.locale='en') desc,sr.locale limit 1
  ), candidates as (
    select sp.id as staff_id,null::uuid as resource_id,subject_scope.id as subject_scope_id,subject_scope.time_zone as subject_time_zone,
      private.resolve_availability_policy_v1(v_tenant_id,p_location_id,p_service_id,sp.id,null,'buffer_before_minutes',sr.published_before) as before_minutes,
      private.resolve_availability_policy_v1(v_tenant_id,p_location_id,p_service_id,sp.id,null,'buffer_after_minutes',sr.published_after) as after_minutes,
      private.resolve_availability_policy_v1(v_tenant_id,p_location_id,p_service_id,sp.id,null,'slot_interval_minutes',15) as interval_minutes,
      private.resolve_availability_policy_v1(v_tenant_id,p_location_id,p_service_id,sp.id,null,'minimum_notice_minutes',120) as notice_minutes,
      private.resolve_availability_policy_v1(v_tenant_id,p_location_id,p_service_id,sp.id,null,'horizon_days',60) as horizon_days,
      private.resolve_availability_policy_v1(v_tenant_id,p_location_id,p_service_id,sp.id,null,'daily_limit_per_staff',null) as daily_limit,
      private.resolve_availability_policy_v1(v_tenant_id,p_location_id,p_service_id,sp.id,null,'turnover_minutes',0) as turnover_minutes,
      private.resolve_availability_policy_v1(v_tenant_id,p_location_id,p_service_id,sp.id,null,'travel_minutes',0) as travel_minutes,
      sr.duration_minutes
    from service_rule sr
    join app.staff_service_locations ssl on ssl.tenant_id=v_tenant_id and ssl.service_id=p_service_id and ssl.location_id=p_location_id
    join app.staff_profiles sp on sp.tenant_id=ssl.tenant_id and sp.id=ssl.staff_id and sp.status='active'
    join app.schedule_scopes subject_scope on subject_scope.tenant_id=sp.tenant_id and subject_scope.scope_kind='staff'
      and subject_scope.location_id=p_location_id and subject_scope.staff_id=sp.id
    where (p_staff_preference_id is null or sp.id=p_staff_preference_id)
      and (sr.assignment_mode<>'fixed_staff' or sp.id=sr.fixed_staff_id)
      and sr.allocation_kind='appointment'
    union all
    select null::uuid,r.id,subject_scope.id,subject_scope.time_zone,
      private.resolve_availability_policy_v1(v_tenant_id,p_location_id,p_service_id,null,r.id,'buffer_before_minutes',sr.published_before),
      private.resolve_availability_policy_v1(v_tenant_id,p_location_id,p_service_id,null,r.id,'buffer_after_minutes',sr.published_after),
      private.resolve_availability_policy_v1(v_tenant_id,p_location_id,p_service_id,null,r.id,'slot_interval_minutes',15),
      private.resolve_availability_policy_v1(v_tenant_id,p_location_id,p_service_id,null,r.id,'minimum_notice_minutes',120),
      private.resolve_availability_policy_v1(v_tenant_id,p_location_id,p_service_id,null,r.id,'horizon_days',60),
      private.resolve_availability_policy_v1(v_tenant_id,p_location_id,p_service_id,null,r.id,'daily_limit_per_staff',null),
      private.resolve_availability_policy_v1(v_tenant_id,p_location_id,p_service_id,null,r.id,'turnover_minutes',0),
      private.resolve_availability_policy_v1(v_tenant_id,p_location_id,p_service_id,null,r.id,'travel_minutes',0),
      sr.duration_minutes
    from service_rule sr
    join app.resource_requirements rr on rr.tenant_id=v_tenant_id and rr.service_id=p_service_id
    join app.resources r on r.tenant_id=rr.tenant_id and r.resource_type_id=rr.resource_type_id and r.status='active'
    join app.resource_locations rl on rl.tenant_id=r.tenant_id and rl.resource_id=r.id and rl.location_id=p_location_id
    join app.schedule_scopes subject_scope on subject_scope.tenant_id=r.tenant_id and subject_scope.scope_kind='resource'
      and subject_scope.location_id=p_location_id and subject_scope.resource_id=r.id
    where sr.allocation_kind='exclusive_resource' and p_staff_preference_id is null
  ), generated_raw as (
    select c.*,g as starts_at,g+make_interval(mins=>c.duration_minutes) as ends_at,
      g at time zone v_location_time_zone as location_start,
      (g+make_interval(mins=>c.duration_minutes)) at time zone v_location_time_zone as location_end,
      g-make_interval(mins=>c.before_minutes+c.travel_minutes) as occupied_starts_at,
      g+make_interval(mins=>c.duration_minutes+c.after_minutes+c.turnover_minutes) as occupied_ends_at,
      (g-make_interval(mins=>c.before_minutes+c.travel_minutes)) at time zone v_location_time_zone as occupied_location_start,
      (g+make_interval(mins=>c.duration_minutes+c.after_minutes+c.turnover_minutes)) at time zone v_location_time_zone as occupied_location_end,
      (g-make_interval(mins=>c.before_minutes+c.travel_minutes)) at time zone c.subject_time_zone as occupied_subject_start,
      (g+make_interval(mins=>c.duration_minutes+c.after_minutes+c.turnover_minutes)) at time zone c.subject_time_zone as occupied_subject_end,
      tsrange((g at time zone 'UTC')-make_interval(mins=>c.before_minutes+c.travel_minutes),
              ((g+make_interval(mins=>c.duration_minutes)) at time zone 'UTC')+make_interval(mins=>c.after_minutes+c.turnover_minutes),'[)') as occupied
    from candidates c cross join lateral pg_catalog.generate_series(v_grid_start,v_grid_end,interval '5 minutes') g
  ), generated_folds as (
    select r.*,
      (row_number() over(partition by coalesce(r.staff_id,r.resource_id),r.location_start order by r.starts_at)-1)::smallint as slot_fold,
      (row_number() over(partition by coalesce(r.staff_id,r.resource_id),r.occupied_location_start order by r.occupied_starts_at)-1)::smallint as location_fold,
      (row_number() over(partition by coalesce(r.staff_id,r.resource_id),r.occupied_subject_start order by r.occupied_starts_at)-1)::smallint as subject_fold
    from generated_raw r
  ), generated as (
    select f.* from generated_folds f
    where f.starts_at>=p_window_start and f.ends_at<=p_window_end
      and f.starts_at>=v_now+make_interval(mins=>f.notice_minutes)
      and f.starts_at<v_now+make_interval(days=>f.horizon_days)
      and mod((extract(hour from f.location_start)::integer*60+
               extract(minute from f.location_start)::integer),f.interval_minutes)=0
  ), valid as (
    select g.*
    from generated g
    join app.schedule_scopes ls on ls.tenant_id=v_tenant_id and ls.scope_kind='location'
      and ls.location_id=p_location_id
    left join app.schedule_scopes ss on ss.id=g.subject_scope_id and g.staff_id is not null
    left join app.schedule_scopes rs on rs.id=g.subject_scope_id and g.resource_id is not null
    where g.occupied_location_start::date=g.occupied_location_end::date
      and g.occupied_subject_start::date=g.occupied_subject_end::date
      and ((g.staff_id is not null and ss.id is not null) or (g.resource_id is not null and rs.id is not null))
      and not exists(select 1 from app.holidays h where h.tenant_id=v_tenant_id and h.location_id=p_location_id and h.local_date=g.location_start::date)
      and not exists(select 1 from app.blackouts b where b.tenant_id=v_tenant_id and b.location_id=p_location_id
        and tsrange(b.starts_at at time zone 'UTC',b.ends_at at time zone 'UTC','[)') && g.occupied)
      and not exists(select 1 from app.time_off x where x.tenant_id=v_tenant_id
        and ((g.staff_id is not null and x.staff_id=g.staff_id) or (g.resource_id is not null and x.resource_id=g.resource_id))
        and (x.location_id is null or x.location_id=p_location_id)
        and tsrange(x.starts_at at time zone 'UTC',x.ends_at at time zone 'UTC','[)') && g.occupied)
      and not exists(select 1 from app.resource_maintenance_blocks m where g.resource_id is not null
        and m.tenant_id=v_tenant_id and m.resource_id=g.resource_id and m.location_id=p_location_id
        and tsrange(m.starts_at at time zone 'UTC',m.ends_at at time zone 'UTC','[)') && g.occupied)
      and not exists(select 1 from app.assignment_allocations a where a.tenant_id=v_tenant_id
        and ((g.staff_id is not null and a.staff_id=g.staff_id) or (g.resource_id is not null and a.resource_id=g.resource_id))
        and a.state in ('held','confirmed') and a.occupied_at && g.occupied)
      and (g.daily_limit is null or g.daily_limit>(select count(*) from app.assignment_allocations a
        where a.tenant_id=v_tenant_id and a.staff_id=g.staff_id and a.state in ('confirmed','completed')
          and (a.starts_at at time zone v_location_time_zone)::date=g.location_start::date))
      and (
        (not exists(select 1 from app.schedule_exceptions e where e.tenant_id=v_tenant_id and e.schedule_scope_id=ls.id and e.local_date=g.occupied_location_start::date)
          and exists(select 1 from app.weekly_schedules w where w.tenant_id=v_tenant_id and w.schedule_scope_id=ls.id
            and w.day_of_week=extract(dow from g.occupied_location_start)::integer
            and w.start_minute<=extract(hour from g.occupied_location_start)::integer*60+extract(minute from g.occupied_location_start)::integer
            and w.end_minute>=extract(hour from g.occupied_location_end)::integer*60+extract(minute from g.occupied_location_end)::integer))
        or exists(select 1 from app.schedule_exceptions e where e.tenant_id=v_tenant_id and e.schedule_scope_id=ls.id
          and e.local_date=g.occupied_location_start::date and e.exception_kind='override'
          and (e.fold is null or e.fold=g.location_fold)
          and e.start_minute<=extract(hour from g.occupied_location_start)::integer*60+extract(minute from g.occupied_location_start)::integer
          and e.end_minute>=extract(hour from g.occupied_location_end)::integer*60+extract(minute from g.occupied_location_end)::integer)
      )
      and (g.staff_id is null or (
        (not exists(select 1 from app.schedule_exceptions e where e.tenant_id=v_tenant_id and e.schedule_scope_id=ss.id and e.local_date=g.occupied_subject_start::date)
          and exists(select 1 from app.weekly_schedules w where w.tenant_id=v_tenant_id and w.schedule_scope_id=ss.id
            and w.day_of_week=extract(dow from g.occupied_subject_start)::integer
            and w.start_minute<=extract(hour from g.occupied_subject_start)::integer*60+extract(minute from g.occupied_subject_start)::integer
            and w.end_minute>=extract(hour from g.occupied_subject_end)::integer*60+extract(minute from g.occupied_subject_end)::integer))
        or exists(select 1 from app.schedule_exceptions e where e.tenant_id=v_tenant_id and e.schedule_scope_id=ss.id
          and e.local_date=g.occupied_subject_start::date and e.exception_kind='override'
          and (e.fold is null or e.fold=g.subject_fold)
          and e.start_minute<=extract(hour from g.occupied_subject_start)::integer*60+extract(minute from g.occupied_subject_start)::integer
          and e.end_minute>=extract(hour from g.occupied_subject_end)::integer*60+extract(minute from g.occupied_subject_end)::integer)
      ))
      and (g.resource_id is null or (
        (not exists(select 1 from app.schedule_exceptions e where e.tenant_id=v_tenant_id and e.schedule_scope_id=rs.id and e.local_date=g.occupied_subject_start::date)
          and exists(select 1 from app.weekly_schedules w where w.tenant_id=v_tenant_id and w.schedule_scope_id=rs.id
            and w.day_of_week=extract(dow from g.occupied_subject_start)::integer
            and w.start_minute<=extract(hour from g.occupied_subject_start)::integer*60+extract(minute from g.occupied_subject_start)::integer
            and w.end_minute>=extract(hour from g.occupied_subject_end)::integer*60+extract(minute from g.occupied_subject_end)::integer))
        or exists(select 1 from app.schedule_exceptions e where e.tenant_id=v_tenant_id and e.schedule_scope_id=rs.id
          and e.local_date=g.occupied_subject_start::date and e.exception_kind='override'
          and (e.fold is null or e.fold=g.subject_fold)
          and e.start_minute<=extract(hour from g.occupied_subject_start)::integer*60+extract(minute from g.occupied_subject_start)::integer
          and e.end_minute>=extract(hour from g.occupied_subject_end)::integer*60+extract(minute from g.occupied_subject_end)::integer)
      ))
      and not exists(select 1 from app.schedule_breaks b where b.tenant_id=v_tenant_id
        and ((b.schedule_scope_id=ls.id and b.day_of_week=extract(dow from g.occupied_location_start)::integer
          and int4range(b.start_minute,b.end_minute,'[)') && int4range(
            extract(hour from g.occupied_location_start)::integer*60+extract(minute from g.occupied_location_start)::integer,
            extract(hour from g.occupied_location_end)::integer*60+extract(minute from g.occupied_location_end)::integer,'[)'))
          or (b.schedule_scope_id=coalesce(ss.id,rs.id) and b.day_of_week=extract(dow from g.occupied_subject_start)::integer
          and int4range(b.start_minute,b.end_minute,'[)') && int4range(
            extract(hour from g.occupied_subject_start)::integer*60+extract(minute from g.occupied_subject_start)::integer,
            extract(hour from g.occupied_subject_end)::integer*60+extract(minute from g.occupied_subject_end)::integer,'[)'))))
  ), ranked as (
    select v.*,row_number() over(partition by v.starts_at,v.ends_at order by
      (select count(*) from app.assignment_allocations a where a.tenant_id=v_tenant_id and a.staff_id=v.staff_id and a.state in ('confirmed','completed')),
      coalesce(v.staff_id,v.resource_id))::integer as slot_rank
    from valid v
  ), bounded as (
    -- Resource identities are private: interchangeable candidates are one
    -- public offer. Issue #11 selects the actual resource transactionally.
    -- Appointments keep every distinct public staff choice.
    select * from ranked where resource_id is null or slot_rank=1
    order by starts_at,slot_rank,staff_id limit 500
  ), rows as (
    select 1::integer,'slot'::text,
      (select service_rule.allocation_kind from service_rule)::text,
      b.starts_at,b.ends_at,b.staff_id,b.slot_rank,
      v_location_time_zone,v_customer_time_zone,b.starts_at at time zone v_customer_time_zone,
      extract(epoch from ((b.starts_at at time zone v_location_time_zone)-(b.starts_at at time zone 'UTC')))::integer,
      b.slot_fold,v_now,v_now+interval '30 seconds',null::text,'not_applicable'::text,
      concat('availability:',v_tenant_id,':',v_publication_revision,':',v_config_version,':',v_feature_version,':',v_availability_revision)
    from bounded b
  )
  select * from rows
  union all
  select 1,'summary',(select service_rule.allocation_kind from service_rule),null,null,null,null,v_location_time_zone,v_customer_time_zone,null,null,null,
    v_now,v_now+interval '30 seconds',case
      when not exists(select 1 from candidates) then 'no_matching_availability'
      when not exists(select 1 from generated) then 'outside_booking_window'
      when exists(select 1 from generated g where g.daily_limit is not null and g.daily_limit<=(
        select count(*) from app.assignment_allocations a where a.tenant_id=v_tenant_id
          and a.staff_id=g.staff_id and a.state in ('confirmed','completed')
          and (a.starts_at at time zone v_location_time_zone)::date=g.location_start::date
      )) then 'policy_restricted'
      when exists(select 1 from generated g join app.assignment_allocations a
        on a.tenant_id=v_tenant_id and a.state in ('held','confirmed') and a.occupied_at&&g.occupied
        and ((g.staff_id is not null and a.staff_id=g.staff_id) or (g.resource_id is not null and a.resource_id=g.resource_id)))
        then 'capacity_unavailable'
      else 'no_matching_availability'
    end,'not_applicable',
    concat('availability:',v_tenant_id,':',v_publication_revision,':',v_config_version,':',v_feature_version,':',v_availability_revision)
  where not exists(select 1 from rows);
end;
$function$;
comment on function private.get_availability_v1(text,text,uuid,uuid,uuid,timestamptz,timestamptz,integer,text) is
  'Availability v1 engine. Before generating slots it rejects candidate count x inclusive five-minute grid points (including 28-hour fold context on both sides) above 250000 with availability_query_too_complex; it never truncates eligible candidates.';
revoke all on function private.get_availability_v1(text,text,uuid,uuid,uuid,timestamptz,timestamptz,integer,text) from public;
grant execute on function private.get_availability_v1(text,text,uuid,uuid,uuid,timestamptz,timestamptz,integer,text) to anon,authenticated;

create or replace function api_v1.get_availability_v1(
  p_hostname text,p_application text,p_service_id uuid,p_location_id uuid,
  p_staff_preference_id uuid default null,p_window_start timestamptz default null,
  p_window_end timestamptz default null,p_party_size integer default 1,
  p_customer_time_zone text default null
)
returns table(
  contract_version integer,result_kind text,allocation_kind text,slot_start timestamptz,slot_end timestamptz,
  staff_id uuid,candidate_rank integer,location_time_zone text,customer_time_zone text,
  local_start timestamp,utc_offset_seconds integer,fold smallint,advisory_as_of timestamptz,
  advisory_until timestamptz,no_slot_code text,provider_health_code text,cache_tag text
)
language sql stable security invoker set search_path='' as $$
  select * from private.get_availability_v1(
    p_hostname,p_application,p_service_id,p_location_id,p_staff_preference_id,
    p_window_start,p_window_end,p_party_size,p_customer_time_zone
  );
$$;
revoke all on function api_v1.get_availability_v1(text,text,uuid,uuid,uuid,timestamptz,timestamptz,integer,text) from public;
grant execute on function api_v1.get_availability_v1(text,text,uuid,uuid,uuid,timestamptz,timestamptz,integer,text) to anon,authenticated;
