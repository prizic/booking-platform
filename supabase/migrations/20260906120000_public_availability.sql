-- Issue #10: bounded, advisory public availability. Calendar-provider health is
-- deliberately not applicable until the Phase 2 calendar synchronization work.

create table app.availability_revisions (
  tenant_id uuid primary key references app.tenants(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default statement_timestamp()
);
alter table app.availability_revisions enable row level security;
revoke all on app.availability_revisions from public, anon, authenticated;

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
         coalesce(ar.revision,1),l.time_zone,s.assignment_mode
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
    select sp.id as staff_id,null::uuid as resource_id,
      coalesce((select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='staff' and o.staff_id=sp.id and o.policy_key='buffer_before_minutes'),
               (select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='service' and o.service_id=p_service_id and o.policy_key='buffer_before_minutes'),
               (select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='location' and o.location_id=p_location_id and o.policy_key='buffer_before_minutes'),
               sr.published_before) as before_minutes,
      coalesce((select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='staff' and o.staff_id=sp.id and o.policy_key='buffer_after_minutes'),
               (select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='service' and o.service_id=p_service_id and o.policy_key='buffer_after_minutes'),
               (select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='location' and o.location_id=p_location_id and o.policy_key='buffer_after_minutes'),
               sr.published_after) as after_minutes,
      coalesce((select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='service' and o.service_id=p_service_id and o.policy_key='slot_interval_minutes'),
               (select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='location' and o.location_id=p_location_id and o.policy_key='slot_interval_minutes'),
               (select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='tenant' and o.policy_key='slot_interval_minutes'),15) as interval_minutes,
      coalesce((select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='service' and o.service_id=p_service_id and o.policy_key='minimum_notice_minutes'),
               (select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='location' and o.location_id=p_location_id and o.policy_key='minimum_notice_minutes'),
               (select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='tenant' and o.policy_key='minimum_notice_minutes'),120) as notice_minutes,
      coalesce((select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='service' and o.service_id=p_service_id and o.policy_key='horizon_days'),
               (select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='location' and o.location_id=p_location_id and o.policy_key='horizon_days'),
               (select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='tenant' and o.policy_key='horizon_days'),60) as horizon_days,
      (select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='staff' and o.staff_id=sp.id and o.policy_key='daily_limit_per_staff') as daily_limit,
      sr.duration_minutes
    from service_rule sr
    join app.staff_service_locations ssl on ssl.tenant_id=v_tenant_id and ssl.service_id=p_service_id and ssl.location_id=p_location_id
    join app.staff_profiles sp on sp.tenant_id=ssl.tenant_id and sp.id=ssl.staff_id and sp.status='active'
    where (p_staff_preference_id is null or sp.id=p_staff_preference_id)
      and (sr.assignment_mode<>'fixed_staff' or sp.id=sr.fixed_staff_id)
      and sr.allocation_kind='appointment'
    union all
    select null::uuid,r.id,
      coalesce((select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='resource' and o.resource_id=r.id and o.policy_key='buffer_before_minutes'),
               (select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='service' and o.service_id=p_service_id and o.policy_key='buffer_before_minutes'),
               (select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='location' and o.location_id=p_location_id and o.policy_key='buffer_before_minutes'),sr.published_before),
      coalesce((select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='resource' and o.resource_id=r.id and o.policy_key='buffer_after_minutes'),
               (select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='service' and o.service_id=p_service_id and o.policy_key='buffer_after_minutes'),
               (select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='location' and o.location_id=p_location_id and o.policy_key='buffer_after_minutes'),sr.published_after),
      coalesce((select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='service' and o.service_id=p_service_id and o.policy_key='slot_interval_minutes'),
               (select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='location' and o.location_id=p_location_id and o.policy_key='slot_interval_minutes'),15),
      coalesce((select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='service' and o.service_id=p_service_id and o.policy_key='minimum_notice_minutes'),
               (select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='location' and o.location_id=p_location_id and o.policy_key='minimum_notice_minutes'),120),
      coalesce((select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='service' and o.service_id=p_service_id and o.policy_key='horizon_days'),
               (select (o.value#>>'{}')::integer from app.schedule_policy_overrides o where o.tenant_id=v_tenant_id and o.scope_kind='location' and o.location_id=p_location_id and o.policy_key='horizon_days'),60),
      null::integer,sr.duration_minutes
    from service_rule sr
    join app.resource_requirements rr on rr.tenant_id=v_tenant_id and rr.service_id=p_service_id
    join app.resources r on r.tenant_id=rr.tenant_id and r.resource_type_id=rr.resource_type_id and r.status='active'
    join app.resource_locations rl on rl.tenant_id=r.tenant_id and rl.resource_id=r.id and rl.location_id=p_location_id
    where sr.allocation_kind='exclusive_resource' and p_staff_preference_id is null
  ), generated as (
    select c.*,g as starts_at,g+make_interval(mins=>c.duration_minutes) as ends_at,
      g at time zone v_location_time_zone as location_start,
      (g+make_interval(mins=>c.duration_minutes)) at time zone v_location_time_zone as location_end,
      tsrange((g at time zone 'UTC')-make_interval(mins=>c.before_minutes),
              ((g+make_interval(mins=>c.duration_minutes)) at time zone 'UTC')+make_interval(mins=>c.after_minutes),'[)') as occupied
    from candidates c cross join lateral pg_catalog.generate_series(p_window_start,p_window_end,interval '5 minutes') g
    where g+make_interval(mins=>c.duration_minutes)<=p_window_end
      and g>=v_now+make_interval(mins=>c.notice_minutes)
      and g<v_now+make_interval(days=>c.horizon_days)
      and mod((extract(hour from g at time zone v_location_time_zone)::integer*60+
               extract(minute from g at time zone v_location_time_zone)::integer),c.interval_minutes)=0
  ), valid as (
    select g.*
    from generated g
    join app.schedule_scopes ls on ls.tenant_id=v_tenant_id and ls.scope_kind='location'
      and ls.location_id=p_location_id
    left join app.schedule_scopes ss on ss.tenant_id=v_tenant_id and ss.scope_kind='staff'
      and ss.location_id=p_location_id and ss.staff_id=g.staff_id
    left join app.schedule_scopes rs on rs.tenant_id=v_tenant_id and rs.scope_kind='resource'
      and rs.location_id=p_location_id and rs.resource_id=g.resource_id
    where (g.location_start::date=g.location_end::date)
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
        (not exists(select 1 from app.schedule_exceptions e where e.tenant_id=v_tenant_id and e.schedule_scope_id=ls.id and e.local_date=g.location_start::date)
          and exists(select 1 from app.weekly_schedules w where w.tenant_id=v_tenant_id and w.schedule_scope_id=ls.id
            and w.day_of_week=extract(dow from g.location_start)::integer
            and w.start_minute<=extract(hour from g.location_start)::integer*60+extract(minute from g.location_start)::integer
            and w.end_minute>=extract(hour from g.location_end)::integer*60+extract(minute from g.location_end)::integer))
        or exists(select 1 from app.schedule_exceptions e where e.tenant_id=v_tenant_id and e.schedule_scope_id=ls.id
          and e.local_date=g.location_start::date and e.exception_kind='override'
          and e.start_minute<=extract(hour from g.location_start)::integer*60+extract(minute from g.location_start)::integer
          and e.end_minute>=extract(hour from g.location_end)::integer*60+extract(minute from g.location_end)::integer)
      )
      and (g.staff_id is null or (
        (not exists(select 1 from app.schedule_exceptions e where e.tenant_id=v_tenant_id and e.schedule_scope_id=ss.id and e.local_date=g.location_start::date)
          and exists(select 1 from app.weekly_schedules w where w.tenant_id=v_tenant_id and w.schedule_scope_id=ss.id
            and w.day_of_week=extract(dow from g.location_start)::integer
            and w.start_minute<=extract(hour from g.location_start)::integer*60+extract(minute from g.location_start)::integer
            and w.end_minute>=extract(hour from g.location_end)::integer*60+extract(minute from g.location_end)::integer))
        or exists(select 1 from app.schedule_exceptions e where e.tenant_id=v_tenant_id and e.schedule_scope_id=ss.id
          and e.local_date=g.location_start::date and e.exception_kind='override'
          and e.start_minute<=extract(hour from g.location_start)::integer*60+extract(minute from g.location_start)::integer
          and e.end_minute>=extract(hour from g.location_end)::integer*60+extract(minute from g.location_end)::integer)
      ))
      and (g.resource_id is null or (
        (not exists(select 1 from app.schedule_exceptions e where e.tenant_id=v_tenant_id and e.schedule_scope_id=rs.id and e.local_date=g.location_start::date)
          and exists(select 1 from app.weekly_schedules w where w.tenant_id=v_tenant_id and w.schedule_scope_id=rs.id
            and w.day_of_week=extract(dow from g.location_start)::integer
            and w.start_minute<=extract(hour from g.location_start)::integer*60+extract(minute from g.location_start)::integer
            and w.end_minute>=extract(hour from g.location_end)::integer*60+extract(minute from g.location_end)::integer))
        or exists(select 1 from app.schedule_exceptions e where e.tenant_id=v_tenant_id and e.schedule_scope_id=rs.id
          and e.local_date=g.location_start::date and e.exception_kind='override'
          and e.start_minute<=extract(hour from g.location_start)::integer*60+extract(minute from g.location_start)::integer
          and e.end_minute>=extract(hour from g.location_end)::integer*60+extract(minute from g.location_end)::integer)
      ))
      and not exists(select 1 from app.schedule_breaks b where b.tenant_id=v_tenant_id
        and b.schedule_scope_id in (ls.id,coalesce(ss.id,rs.id)) and b.day_of_week=extract(dow from g.location_start)::integer
        and int4range(b.start_minute,b.end_minute,'[)') && int4range(
          extract(hour from g.location_start)::integer*60+extract(minute from g.location_start)::integer,
          extract(hour from g.location_end)::integer*60+extract(minute from g.location_end)::integer,'[)'))
  ), ranked as (
    select v.*,row_number() over(partition by v.starts_at order by
      (select count(*) from app.assignment_allocations a where a.tenant_id=v_tenant_id and a.staff_id=v.staff_id and a.state in ('confirmed','completed')),
      coalesce(v.staff_id,v.resource_id))::integer as slot_rank,
      (row_number() over(partition by v.location_start order by v.starts_at)-1)::smallint as slot_fold
    from valid v
  ), bounded as (
    select * from ranked order by starts_at,slot_rank,staff_id limit 500
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
    v_now,v_now+interval '30 seconds','no_matching_availability','not_applicable',
    concat('availability:',v_tenant_id,':',v_publication_revision,':',v_config_version,':',v_feature_version,':',v_availability_revision)
  where not exists(select 1 from rows);
end;
$function$;
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
