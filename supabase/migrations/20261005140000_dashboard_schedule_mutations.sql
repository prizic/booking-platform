-- Task 10: authoritative rendered revisions and authenticated replay.
alter table app.schedule_audit_events add column request_hash text;
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
  v_request_hash text;
  v_prior app.schedule_audit_events%rowtype;
  v_target_scope record;
begin
  if p_tenant_id is null or p_payload is null or p_operation is null then
    raise exception using errcode='22023', message='schedule_request_invalid';
  end if;
  v_location := nullif(p_payload->>'location_id','')::uuid;
  v_staff := nullif(p_payload->>'staff_id','')::uuid;
  v_resource := nullif(p_payload->>'resource_id','')::uuid;
  perform 1 from app.tenants t where t.id=p_tenant_id and t.status='active' for update;
  if not found or not coalesce(private.can_manage_schedule_scope(p_tenant_id,v_location,v_staff,v_resource),false) then
    raise exception using errcode='42501',message='schedule_authorization_required';
  end if;
  if p_operation='policy' and not coalesce(private.can_manage_policy_scope(p_tenant_id,v_location,v_staff,v_resource),false) then
    raise exception using errcode='42501',message='policy_authorization_required';
  end if;
  -- Supplied scope fields must never authorize a different existing target.
  if nullif(p_payload->>'id','') is not null and p_operation in ('time_off','holiday','blackout','maintenance','policy') then
    select x.location_id,x.staff_id,x.resource_id into v_target_scope from (
      select t.location_id,t.staff_id,t.resource_id from app.time_off t where p_operation='time_off' and t.tenant_id=p_tenant_id and t.id=(p_payload->>'id')::uuid
      union all select t.location_id,null::uuid,null::uuid from app.holidays t where p_operation='holiday' and t.tenant_id=p_tenant_id and t.id=(p_payload->>'id')::uuid
      union all select t.location_id,null::uuid,null::uuid from app.blackouts t where p_operation='blackout' and t.tenant_id=p_tenant_id and t.id=(p_payload->>'id')::uuid
      union all select t.location_id,null::uuid,t.resource_id from app.resource_maintenance_blocks t where p_operation='maintenance' and t.tenant_id=p_tenant_id and t.id=(p_payload->>'id')::uuid
      union all select t.location_id,t.staff_id,t.resource_id from app.schedule_policy_overrides t where p_operation='policy' and t.tenant_id=p_tenant_id and t.id=(p_payload->>'id')::uuid
    ) x;
    if found and (not coalesce(private.can_manage_schedule_scope(p_tenant_id,v_target_scope.location_id,v_target_scope.staff_id,v_target_scope.resource_id),false)
      or (p_operation='policy' and not coalesce(private.can_manage_policy_scope(p_tenant_id,v_target_scope.location_id,v_target_scope.staff_id,v_target_scope.resource_id),false))) then raise exception using errcode='42501',message='schedule_authorization_required'; end if;
  end if;
  v_request_hash:=encode(extensions.digest(convert_to(jsonb_build_array(p_operation,p_payload,p_expected_revision,private.current_auth_user_id())::text,'UTF8'),'sha256'),'hex');
  if p_request_id is not null then
    select * into v_prior from app.schedule_audit_events e where e.tenant_id=p_tenant_id and e.request_id=p_request_id and e.outcome='succeeded';
    if found then
      if v_prior.actor_auth_user_id is distinct from private.current_auth_user_id() or v_prior.request_hash is distinct from v_request_hash then raise exception using errcode='22023',message='idempotency_conflict'; end if;
      return query select v_prior.target_id,v_prior.revision; return;
    end if;
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
      if found and not coalesce(private.can_manage_schedule_scope(p_tenant_id,v_scope.location_id,v_scope.staff_id,v_scope.resource_id),false) then raise exception using errcode='42501',message='schedule_authorization_required'; end if;
      if not found or p_expected_revision is null or p_expected_revision<>v_scope.revision then
        raise exception using errcode='40001', message='revision_conflict';
      end if;
      if not exists (select 1 from pg_catalog.pg_timezone_names where name=p_payload->>'time_zone') then
        raise exception using errcode='22023', message='invalid_time_zone';
      end if;
      update app.schedule_scopes as s set time_zone=p_payload->>'time_zone',revision=s.revision+1,updated_at=statement_timestamp()
        where s.tenant_id=p_tenant_id and s.id=v_scope_id;
    end if;
    v_revision := (select s.revision from app.schedule_scopes s where s.tenant_id=p_tenant_id and s.id=v_scope_id);
    insert into app.schedule_audit_events(tenant_id,actor_auth_user_id,target_id,revision,operation,outcome,reason,request_id,request_hash,redacted_diff) values(p_tenant_id,(select private.current_auth_user_id()),v_scope_id,v_revision,p_operation,'succeeded',coalesce(p_payload->>'reason',''),p_request_id,v_request_hash,jsonb_build_object('time_zone',p_payload->>'time_zone'));
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
        select t.revision into v_existing_revision from app.time_off t where t.tenant_id=p_tenant_id and t.id=v_target for update;
        if not found or p_expected_revision is null or p_expected_revision<>v_existing_revision then raise exception using errcode='40001',message='revision_conflict'; end if;
      end if;
      v_target := coalesce(v_target,pg_catalog.gen_random_uuid());
      if exists (select 1 from app.time_off where id=v_target and tenant_id<>p_tenant_id) then raise exception using errcode='42501',message='schedule_cross_tenant_target'; end if;
      insert into app.time_off(id,tenant_id,staff_id,resource_id,location_id,starts_at,ends_at,time_zone,reason)
        values(v_target,p_tenant_id,v_staff,v_resource,v_location,(p_payload->>'starts_at')::timestamptz,(p_payload->>'ends_at')::timestamptz,p_payload->>'time_zone',coalesce(p_payload->>'reason',''))
        on conflict (id) do update set staff_id=excluded.staff_id,resource_id=excluded.resource_id,location_id=excluded.location_id,starts_at=excluded.starts_at,ends_at=excluded.ends_at,time_zone=excluded.time_zone,reason=excluded.reason,revision=time_off.revision+1,updated_at=statement_timestamp();
      v_revision := (select t.revision from app.time_off t where t.tenant_id=p_tenant_id and t.id=v_target);
      insert into app.schedule_audit_events(tenant_id,actor_auth_user_id,target_id,revision,operation,outcome,reason,request_id,request_hash,redacted_diff) values(p_tenant_id,(select private.current_auth_user_id()),v_target,v_revision,p_operation,'succeeded',coalesce(p_payload->>'reason',''),p_request_id,v_request_hash,jsonb_build_object('starts_at',p_payload->>'starts_at','ends_at',p_payload->>'ends_at'));
      return query select v_target,v_revision; return;
    elsif p_operation='holiday' then
      if v_location is null or nullif(p_payload->>'local_date','') is null or btrim(coalesce(p_payload->>'name',''))='' then raise exception using errcode='22023',message='schedule_holiday_invalid'; end if;
      if v_target is not null then
        select h.revision into v_existing_revision from app.holidays h where h.tenant_id=p_tenant_id and h.id=v_target for update;
        if not found or p_expected_revision is null or p_expected_revision<>v_existing_revision then raise exception using errcode='40001',message='revision_conflict'; end if;
      end if;
      v_target := coalesce(v_target,pg_catalog.gen_random_uuid());
      if exists (select 1 from app.holidays where id=v_target and tenant_id<>p_tenant_id) then raise exception using errcode='42501',message='schedule_cross_tenant_target'; end if;
      insert into app.holidays(id,tenant_id,location_id,local_date,name) values(v_target,p_tenant_id,v_location,(p_payload->>'local_date')::date,btrim(p_payload->>'name'))
        on conflict (id) do update set location_id=excluded.location_id,local_date=excluded.local_date,name=excluded.name,revision=holidays.revision+1,updated_at=statement_timestamp();
      v_revision := (select h.revision from app.holidays h where h.tenant_id=p_tenant_id and h.id=v_target);
      insert into app.schedule_audit_events(tenant_id,actor_auth_user_id,target_id,revision,operation,outcome,reason,request_id,request_hash,redacted_diff) values(p_tenant_id,(select private.current_auth_user_id()),v_target,v_revision,p_operation,'succeeded',coalesce(p_payload->>'reason',''),p_request_id,v_request_hash,jsonb_build_object('local_date',p_payload->>'local_date'));
      return query select v_target,v_revision; return;
    elsif p_operation in ('blackout','maintenance') then
      if v_location is null or nullif(p_payload->>'starts_at','') is null or nullif(p_payload->>'ends_at','') is null
        or (p_payload->>'starts_at')::timestamptz >= (p_payload->>'ends_at')::timestamptz then raise exception using errcode='22023',message='schedule_blackout_invalid'; end if;
      if p_operation='maintenance' and v_resource is null then raise exception using errcode='22023',message='schedule_maintenance_invalid'; end if;
      if not exists (select 1 from pg_catalog.pg_timezone_names where name=p_payload->>'time_zone') then raise exception using errcode='22023',message='invalid_time_zone'; end if;
      if v_target is not null then
        if p_operation='blackout' then select b.revision into v_existing_revision from app.blackouts b where b.tenant_id=p_tenant_id and b.id=v_target for update;
        else select m.revision into v_existing_revision from app.resource_maintenance_blocks m where m.tenant_id=p_tenant_id and m.id=v_target for update; end if;
        if not found or p_expected_revision is null or p_expected_revision<>v_existing_revision then raise exception using errcode='40001',message='revision_conflict'; end if;
      end if;
      v_target := coalesce(v_target,pg_catalog.gen_random_uuid());
      if (p_operation='blackout' and exists (select 1 from app.blackouts where id=v_target and tenant_id<>p_tenant_id)) or (p_operation='maintenance' and exists (select 1 from app.resource_maintenance_blocks where id=v_target and tenant_id<>p_tenant_id)) then raise exception using errcode='42501',message='schedule_cross_tenant_target'; end if;
      if p_operation='blackout' then
        insert into app.blackouts(id,tenant_id,location_id,starts_at,ends_at,time_zone,reason) values(v_target,p_tenant_id,v_location,(p_payload->>'starts_at')::timestamptz,(p_payload->>'ends_at')::timestamptz,p_payload->>'time_zone',coalesce(p_payload->>'reason',''))
          on conflict (id) do update set location_id=excluded.location_id,starts_at=excluded.starts_at,ends_at=excluded.ends_at,time_zone=excluded.time_zone,reason=excluded.reason,revision=blackouts.revision+1,updated_at=statement_timestamp();
        v_revision := (select b.revision from app.blackouts b where b.tenant_id=p_tenant_id and b.id=v_target);
        insert into app.schedule_audit_events(tenant_id,actor_auth_user_id,target_id,revision,operation,outcome,reason,request_id,request_hash,redacted_diff) values(p_tenant_id,(select private.current_auth_user_id()),v_target,v_revision,p_operation,'succeeded',coalesce(p_payload->>'reason',''),p_request_id,v_request_hash,jsonb_build_object('starts_at',p_payload->>'starts_at','ends_at',p_payload->>'ends_at'));
        return query select v_target,v_revision; return;
      else
        insert into app.resource_maintenance_blocks(id,tenant_id,resource_id,location_id,starts_at,ends_at,time_zone,reason) values(v_target,p_tenant_id,v_resource,v_location,(p_payload->>'starts_at')::timestamptz,(p_payload->>'ends_at')::timestamptz,p_payload->>'time_zone',coalesce(p_payload->>'reason',''))
          on conflict (id) do update set resource_id=excluded.resource_id,location_id=excluded.location_id,starts_at=excluded.starts_at,ends_at=excluded.ends_at,time_zone=excluded.time_zone,reason=excluded.reason,revision=resource_maintenance_blocks.revision+1,updated_at=statement_timestamp();
        v_revision := (select m.revision from app.resource_maintenance_blocks m where m.tenant_id=p_tenant_id and m.id=v_target);
        insert into app.schedule_audit_events(tenant_id,actor_auth_user_id,target_id,revision,operation,outcome,reason,request_id,request_hash,redacted_diff) values(p_tenant_id,(select private.current_auth_user_id()),v_target,v_revision,p_operation,'succeeded',coalesce(p_payload->>'reason',''),p_request_id,v_request_hash,jsonb_build_object('starts_at',p_payload->>'starts_at','ends_at',p_payload->>'ends_at'));
        return query select v_target,v_revision; return;
      end if;
    else
      if not coalesce((select private.can_manage_policy_scope(p_tenant_id,v_location,v_staff,v_resource)),false) then raise exception using errcode='42501',message='policy_authorization_required'; end if;
      if (p_payload->>'policy_key') not in ('minimum_notice_minutes','horizon_days','slot_interval_minutes','daily_limit_per_staff','buffer_before_minutes','buffer_after_minutes','turnover_minutes','travel_minutes') then raise exception using errcode='22023',message='schedule_policy_invalid'; end if;
      v_value := p_payload->'value';
      if jsonb_typeof(v_value)<>'number' and jsonb_typeof(v_value)<>'null' then raise exception using errcode='22023',message='schedule_policy_invalid'; end if;
      if v_value='null'::jsonb and p_payload->>'policy_key'<>'daily_limit_per_staff' then raise exception using errcode='22023',message='schedule_policy_out_of_bounds'; end if;
      if v_value is not null and v_value<>'null'::jsonb and ((p_payload->>'policy_key')='minimum_notice_minutes' and (v_value#>>'{}')::numeric not between 0 and 43200 or (p_payload->>'policy_key')='horizon_days' and (v_value#>>'{}')::numeric not between 1 and 365 or (p_payload->>'policy_key')='slot_interval_minutes' and (v_value#>>'{}')::numeric not in (5,10,15,20,30,60) or (p_payload->>'policy_key')='daily_limit_per_staff' and (v_value#>>'{}')::numeric not between 1 and 50 or (p_payload->>'policy_key') in ('buffer_before_minutes','buffer_after_minutes') and (v_value#>>'{}')::numeric not between 0 and 120 or (p_payload->>'policy_key') in ('turnover_minutes','travel_minutes') and (v_value#>>'{}')::numeric not between 0 and 1440) then raise exception using errcode='22023',message='schedule_policy_out_of_bounds'; end if;
      if v_target is not null then select p.revision into v_existing_revision from app.schedule_policy_overrides p where p.tenant_id=p_tenant_id and p.id=v_target for update; if not found or p_expected_revision is null or p_expected_revision<>v_existing_revision then raise exception using errcode='40001',message='revision_conflict'; end if; end if;
      v_target := coalesce(v_target,pg_catalog.gen_random_uuid());
      if exists (select 1 from app.schedule_policy_overrides where id=v_target and tenant_id<>p_tenant_id) then raise exception using errcode='42501',message='schedule_cross_tenant_target'; end if;
      insert into app.schedule_policy_overrides(id,tenant_id,scope_kind,location_id,service_id,staff_id,resource_id,policy_key,value) values(v_target,p_tenant_id,p_payload->>'scope_kind',v_location,v_service,v_staff,v_resource,p_payload->>'policy_key',v_value)
        on conflict (id) do update set value=excluded.value,revision=schedule_policy_overrides.revision+1,updated_at=statement_timestamp();
      v_revision := (select p.revision from app.schedule_policy_overrides p where p.tenant_id=p_tenant_id and p.id=v_target);
      insert into app.schedule_audit_events(tenant_id,actor_auth_user_id,target_id,revision,operation,outcome,reason,request_id,request_hash,redacted_diff)
        values(p_tenant_id,(select private.current_auth_user_id()),v_target,v_revision,p_operation,'succeeded',coalesce(p_payload->>'reason',''),p_request_id,v_request_hash,jsonb_build_object('policy_key',p_payload->>'policy_key','value',v_value));
      return query select v_target,v_revision; return;
    end if;
  end if;

  v_scope_id := nullif(p_payload->>'scope_id','')::uuid;
  select * into v_scope from app.schedule_scopes where tenant_id=p_tenant_id and id=v_scope_id for update;
  if found and not coalesce(private.can_manage_schedule_scope(p_tenant_id,v_scope.location_id,v_scope.staff_id,v_scope.resource_id),false) then raise exception using errcode='42501',message='schedule_authorization_required'; end if;
  if not found or p_expected_revision is null or p_expected_revision<>v_scope.revision then
    raise exception using errcode='40001', message='revision_conflict';
  end if;
  v_day := nullif(p_payload->>'day_of_week','')::smallint;
  v_start := nullif(p_payload->>'start_minute','')::smallint;
  v_end := nullif(p_payload->>'end_minute','')::smallint;

  if nullif(p_payload->>'id','') is not null and p_operation in ('weekly','break','exception') then
    if exists(select 1 from app.weekly_schedules x where p_operation='weekly' and x.tenant_id=p_tenant_id and x.id=(p_payload->>'id')::uuid and x.schedule_scope_id<>v_scope_id)
      or exists(select 1 from app.schedule_breaks x where p_operation='break' and x.tenant_id=p_tenant_id and x.id=(p_payload->>'id')::uuid and x.schedule_scope_id<>v_scope_id)
      or exists(select 1 from app.schedule_exceptions x where p_operation='exception' and x.tenant_id=p_tenant_id and x.id=(p_payload->>'id')::uuid and x.schedule_scope_id<>v_scope_id) then raise exception using errcode='42501',message='schedule_scope_mismatch'; end if;
  end if;
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
  update app.schedule_scopes as s set revision=s.revision+1,updated_at=statement_timestamp() where s.tenant_id=p_tenant_id and s.id=v_scope_id returning s.revision into v_revision;
  insert into app.schedule_audit_events(tenant_id,actor_auth_user_id,target_id,revision,operation,outcome,reason,request_id,request_hash,redacted_diff) values(p_tenant_id,(select private.current_auth_user_id()),v_target,v_revision,p_operation,'succeeded',coalesce(p_payload->>'reason',''),p_request_id,v_request_hash,jsonb_build_object('day_of_week',v_day,'start_minute',v_start,'end_minute',v_end));
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

-- Named authoring choices contain no membership, customer, or private-note data.
create or replace function private.get_schedule_choices_v1(p_tenant_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('kind',q.kind,'id',q.id,'name',q.name,'locationId',q.location_id,'timeZone',q.time_zone) order by q.kind,q.name),'[]'::jsonb)
 from (
 select 'location'::text kind,l.id,l.name,l.id location_id,l.time_zone from app.locations l
 where l.tenant_id=p_tenant_id and l.status='active' and (private.can_manage_schedule_scope(l.tenant_id,l.id,null,null) or exists(select 1 from app.staff_profiles sp join app.staff_locations sl on sl.tenant_id=sp.tenant_id and sl.staff_id=sp.id where sl.location_id=l.id and sp.tenant_id=l.tenant_id and private.can_manage_schedule_scope(sp.tenant_id,l.id,sp.id,null)))
 union all select 'staff',sp.id,sp.public_name,sl.location_id,l.time_zone from app.staff_profiles sp join app.staff_locations sl on sl.tenant_id=sp.tenant_id and sl.staff_id=sp.id join app.locations l on l.tenant_id=sl.tenant_id and l.id=sl.location_id where sp.tenant_id=p_tenant_id and sp.status='active' and private.can_manage_schedule_scope(sp.tenant_id,sl.location_id,sp.id,null)
 union all select 'resource',r.id,r.public_name,rl.location_id,l.time_zone from app.resources r join app.resource_locations rl on rl.tenant_id=r.tenant_id and rl.resource_id=r.id join app.locations l on l.tenant_id=rl.tenant_id and l.id=rl.location_id where r.tenant_id=p_tenant_id and r.status in ('active','maintenance') and private.can_manage_schedule_scope(r.tenant_id,rl.location_id,null,r.id)
 union all select 'service',s.id,s.key,sl.location_id,l.time_zone from app.catalog_services s join app.catalog_service_locations sl on sl.tenant_id=s.tenant_id and sl.service_id=s.id join app.locations l on l.tenant_id=sl.tenant_id and l.id=sl.location_id where s.tenant_id=p_tenant_id and s.status='active' and private.can_manage_schedule_scope(s.tenant_id,sl.location_id,null,null)
 ) q where exists(select 1 from app.tenants t where t.id=p_tenant_id and t.status='active');
$$;
revoke all on function private.get_schedule_choices_v1(uuid) from public,anon;
grant execute on function private.get_schedule_choices_v1(uuid) to authenticated;
create or replace function api_v1.get_schedule_choices_v1(p_tenant_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_schedule_choices_v1(p_tenant_id); $$;
revoke all on function api_v1.get_schedule_choices_v1(uuid) from public,anon;
grant execute on function api_v1.get_schedule_choices_v1(uuid) to authenticated;

-- The original read stays compatible. Extra editor fields use a separate narrow
-- projection with the same row policies, rather than changing its return type.
create or replace function api_v1.get_schedule_editor_details_v1(p_tenant_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(d),'[]'::jsonb) from (
 select jsonb_build_object('id',e.id,'fold',e.fold,'serviceId',null) d from app.schedule_exceptions e where e.tenant_id=p_tenant_id
 union all select jsonb_build_object('id',p.id,'fold',null,'serviceId',p.service_id) from app.schedule_policy_overrides p where p.tenant_id=p_tenant_id
 ) q;
$$;
revoke all on function api_v1.get_schedule_editor_details_v1(uuid) from public,anon;
grant execute on function api_v1.get_schedule_editor_details_v1(uuid) to authenticated;

create or replace function private.remove_schedule_record_v1(p_tenant_id uuid,p_kind text,p_target_id uuid,p_expected_revision bigint,p_expected_scope_revision bigint,p_request_id uuid)
returns table(target_id uuid,revision bigint) language plpgsql security definer set search_path='' as $$
declare v_table text; v_row jsonb; v_scope app.schedule_scopes%rowtype; v_hash text; v_prior app.schedule_audit_events%rowtype; v_revision bigint;
begin
 if p_request_id is null then raise exception using errcode='22023',message='schedule_request_invalid'; end if;
 perform 1 from app.tenants where id=p_tenant_id and status='active' for update;
 if not found then raise exception using errcode='42501',message='schedule_not_authorized'; end if;
 -- Resolve before replay and authorize the actor on the stored target. A prior
 -- replay can use its redacted scope identity after the row has been removed.
 v_table:=case p_kind when 'scope' then 'schedule_scopes' when 'weekly' then 'weekly_schedules' when 'break' then 'schedule_breaks' when 'exception' then 'schedule_exceptions' when 'time_off' then 'time_off' when 'holiday' then 'holidays' when 'blackout' then 'blackouts' when 'maintenance' then 'resource_maintenance_blocks' when 'policy' then 'schedule_policy_overrides' end;
 if v_table is null then raise exception using errcode='22023',message='schedule_operation_invalid'; end if;
 select * into v_prior from app.schedule_audit_events e where e.tenant_id=p_tenant_id and e.request_id=p_request_id and e.outcome='succeeded';
 execute pg_catalog.format('select to_jsonb(r) from app.%I r where tenant_id=$1 and id=$2 for update',v_table) into v_row using p_tenant_id,p_target_id;
 if v_row is null and v_prior.id is not null then v_row:=v_prior.redacted_diff; end if;
 if v_row is null then raise exception using errcode='22023',message='schedule_target_unavailable'; end if;
 if v_row->>'schedule_scope_id' is not null then
  select * into v_scope from app.schedule_scopes where tenant_id=p_tenant_id and id=(v_row->>'schedule_scope_id')::uuid for update;
  if v_scope.id is null then raise exception using errcode='22023',message='schedule_scope_invalid'; end if;
  v_row:=v_row||jsonb_build_object('location_id',v_scope.location_id,'staff_id',v_scope.staff_id,'resource_id',v_scope.resource_id);
 end if;
 if not coalesce(private.can_manage_schedule_scope(p_tenant_id,(v_row->>'location_id')::uuid,(v_row->>'staff_id')::uuid,(v_row->>'resource_id')::uuid),false) or (p_kind='policy' and not coalesce(private.can_manage_policy_scope(p_tenant_id,(v_row->>'location_id')::uuid,(v_row->>'staff_id')::uuid,(v_row->>'resource_id')::uuid),false)) then raise exception using errcode='42501',message='schedule_not_authorized'; end if;
 v_hash:=encode(extensions.digest(jsonb_build_object('operation','remove:'||p_kind,'target',p_target_id,'revision',p_expected_revision,'scopeRevision',p_expected_scope_revision,'actor',private.current_auth_user_id())::text,'sha256'),'hex');
 if v_prior.id is not null then
  if v_prior.actor_auth_user_id is distinct from private.current_auth_user_id() or v_prior.request_hash is distinct from v_hash then raise exception using errcode='22023',message='schedule_idempotency_conflict'; end if;
  return query select v_prior.target_id,v_prior.revision; return;
 end if;
 if (v_row->>'revision')::bigint is distinct from p_expected_revision or (v_scope.id is not null and v_scope.revision is distinct from p_expected_scope_revision) then raise exception using errcode='40001',message='schedule_revision_conflict'; end if;
 if p_kind='scope' and (exists(select 1 from app.weekly_schedules where tenant_id=p_tenant_id and schedule_scope_id=p_target_id) or exists(select 1 from app.schedule_breaks where tenant_id=p_tenant_id and schedule_scope_id=p_target_id) or exists(select 1 from app.schedule_exceptions where tenant_id=p_tenant_id and schedule_scope_id=p_target_id)) then raise exception using errcode='22023',message='schedule_scope_not_empty'; end if;
 execute pg_catalog.format('delete from app.%I where tenant_id=$1 and id=$2',v_table) using p_tenant_id,p_target_id;
 if p_kind='weekly' and exists(select 1 from app.schedule_breaks b where b.tenant_id=p_tenant_id and b.schedule_scope_id=v_scope.id and not exists(select 1 from app.weekly_schedules w where w.tenant_id=b.tenant_id and w.schedule_scope_id=b.schedule_scope_id and w.day_of_week=b.day_of_week and w.start_minute<=b.start_minute and w.end_minute>=b.end_minute)) then raise exception using errcode='22023',message='schedule_break_outside_hours'; end if;
 v_revision:=p_expected_revision+1;
 if v_scope.id is not null then update app.schedule_scopes s set revision=s.revision+1,updated_at=statement_timestamp() where s.tenant_id=p_tenant_id and s.id=v_scope.id returning s.revision into v_revision; end if;
 insert into app.schedule_audit_events(tenant_id,actor_auth_user_id,target_id,revision,operation,outcome,reason,request_id,request_hash,redacted_diff) values(p_tenant_id,private.current_auth_user_id(),p_target_id,v_revision,'remove:'||p_kind,'succeeded','',p_request_id,v_hash,jsonb_build_object('location_id',v_row->'location_id','staff_id',v_row->'staff_id','resource_id',v_row->'resource_id','schedule_scope_id',v_row->'schedule_scope_id','revision',p_expected_revision));
 return query select p_target_id,v_revision;
end; $$;
revoke all on function private.remove_schedule_record_v1(uuid,text,uuid,bigint,bigint,uuid) from public,anon;
grant execute on function private.remove_schedule_record_v1(uuid,text,uuid,bigint,bigint,uuid) to authenticated;
create or replace function api_v1.remove_schedule_record_v1(p_tenant_id uuid,p_kind text,p_target_id uuid,p_expected_revision bigint,p_expected_scope_revision bigint,p_request_id uuid)
returns table(target_id uuid,revision bigint) language sql security invoker set search_path='' as $$ select * from private.remove_schedule_record_v1(p_tenant_id,p_kind,p_target_id,p_expected_revision,p_expected_scope_revision,p_request_id); $$;
revoke all on function api_v1.remove_schedule_record_v1(uuid,text,uuid,bigint,bigint,uuid) from public,anon;
grant execute on function api_v1.remove_schedule_record_v1(uuid,text,uuid,bigint,bigint,uuid) to authenticated;
