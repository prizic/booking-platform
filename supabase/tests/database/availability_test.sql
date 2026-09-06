begin;
select no_plan();

select has_table('app'::name, 'availability_revisions'::name);
select is((select count(*)::integer from app.availability_revisions), (select count(*)::integer from app.tenants), 'existing tenants receive availability revision rows during migration');
select ok((select relrowsecurity from pg_class where oid='app.availability_revisions'::regclass), 'availability revisions require RLS');
select ok(not has_table_privilege('anon','app.availability_revisions','select'), 'anonymous callers cannot read availability revisions');
select has_function('api_v1'::name, 'get_availability_v1'::name, array['text','text','uuid','uuid','uuid','timestamp with time zone','timestamp with time zone','integer','text']);
select ok(has_function_privilege('anon','api_v1.get_availability_v1(text,text,uuid,uuid,uuid,timestamptz,timestamptz,integer,text)','execute'), 'anonymous Client callers can request availability');
select ok(has_function_privilege('authenticated','api_v1.get_availability_v1(text,text,uuid,uuid,uuid,timestamptz,timestamptz,integer,text)','execute'), 'authenticated Dashboard callers can request availability');
select ok(not (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='api_v1' and p.proname='get_availability_v1'), 'public availability wrapper is security invoker');
select ok(not has_function_privilege('anon','private.resolve_availability_policy_v1(uuid,uuid,uuid,uuid,uuid,text,integer)','execute'), 'anonymous callers cannot execute the private policy resolver');
select ok(not has_function_privilege('authenticated','private.resolve_availability_policy_v1(uuid,uuid,uuid,uuid,uuid,text,integer)','execute'), 'authenticated callers cannot execute the private policy resolver');

select throws_ok(
  $$select * from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,'2026-09-07 12:00+00','2026-10-09 12:00+00',1,'America/New_York')$$,
  '22023','availability_window_too_large','availability windows are bounded'
);
select throws_ok(
  $$select * from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,'2026-09-07 12:00+00','2026-09-08 12:00+00',2,'America/New_York')$$,
  '22023','availability_party_size_out_of_bounds','v1 rejects unsupported party sizes'
);
select throws_ok(
  $$select * from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,'2026-09-07 12:00+00','2026-09-08 12:00+00',1,'Mars/Olympus')$$,
  '22023','availability_invalid_timezone','unknown timezones are rejected'
);
select throws_ok(
  $$select * from api_v1.get_availability_v1('preview.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,'2026-09-07 12:00+00','2026-09-08 12:00+00',1,'America/New_York')$$,
  '42501','availability_context_required','unverified preview hosts fail closed'
);

-- A bookable staff member and matching civil-time schedule make the seeded
-- published service available on Monday 2026-09-07 in New York.
insert into app.staff_profiles(id,tenant_id,public_name)
values ('a8000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Available staff');
insert into app.staff_services(tenant_id,staff_id,service_id)
values ('a0000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001');
insert into app.staff_locations(tenant_id,staff_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001');
insert into app.staff_service_locations(tenant_id,staff_id,service_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001');
insert into app.schedule_scopes(id,tenant_id,scope_kind,location_id,staff_id,time_zone)
values ('a8100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','staff','a5000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001','America/New_York');
insert into app.weekly_schedules(id,tenant_id,schedule_scope_id,day_of_week,start_minute,end_minute)
values ('a8200000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a8100000-0000-0000-0000-000000000001',1,540,1020);

select set_config('test.availability_revision',(select revision::text from app.availability_revisions where tenant_id='a0000000-0000-0000-0000-000000000001'),true);
select is(
  (select count(*)::integer from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,'2026-09-07 13:00+00','2026-09-07 22:00+00',1,'America/New_York') where result_kind='slot'),
  30,
  'duration, opening hours, staff schedule, and 15-minute interval produce bounded slots'
);
update app.schedule_scopes set time_zone='America/Chicago'
where id='a5600000-0000-0000-0000-000000000001';
update app.weekly_schedules set start_minute=480,end_minute=540
where schedule_scope_id='a5600000-0000-0000-0000-000000000001' and day_of_week=1;
select is(
  (select count(*)::integer from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,'2026-09-07 13:00+00','2026-09-07 14:00+00',1,'America/New_York') where result_kind='slot' and location_time_zone='America/Chicago'),
  2,
  'location civil hours and returned zone use the authoritative location schedule scope timezone'
);
update app.schedule_scopes set time_zone='America/New_York'
where id='a5600000-0000-0000-0000-000000000001';
update app.weekly_schedules set start_minute=540,end_minute=1020
where schedule_scope_id='a5600000-0000-0000-0000-000000000001' and day_of_week=1;
update app.schedule_scopes set time_zone='America/Chicago'
where id='a8100000-0000-0000-0000-000000000001';
update app.weekly_schedules set start_minute=480,end_minute=960
where id='a8200000-0000-0000-0000-000000000001';
select is(
  (select count(*)::integer from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,'2026-09-07 13:00+00','2026-09-07 22:00+00',1,'America/New_York') where result_kind='slot'),
  30,
  'subject working hours are interpreted in the subject schedule timezone'
);
update app.schedule_scopes set time_zone='America/New_York'
where id='a8100000-0000-0000-0000-000000000001';
update app.weekly_schedules set start_minute=540,end_minute=1020
where id='a8200000-0000-0000-0000-000000000001';
insert into app.schedule_exceptions(id,tenant_id,schedule_scope_id,local_date,exception_kind,start_minute,end_minute,fold) values
 ('a8900000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a5600000-0000-0000-0000-000000000001','2026-11-01','override',60,120,1),
 ('a8900000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','a8100000-0000-0000-0000-000000000001','2026-11-01','override',60,120,1);
select is(
  (select count(*)::integer from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,'2026-11-01 05:00+00','2026-11-01 07:00+00',1,'America/New_York') where result_kind='slot' and fold=1),
  2,
  'an explicit exception fold exposes only the selected repeated civil-time occurrence'
);
select is(
  (select no_slot_code from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,'2026-09-08 13:00+00','2026-09-08 14:00+00',1,'America/New_York') where result_kind='summary'),
  'no_matching_availability',
  'missing subject schedule is minimized to no matching availability'
);
select is(
  (select no_slot_code from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,'2027-01-04 14:00+00','2027-01-04 15:00+00',1,'America/New_York') where result_kind='summary'),
  'outside_booking_window',
  'notice and horizon rejection use the coarse outside-window code'
);

-- Every policy dimension uses tenant -> location -> service -> subject
-- precedence. Travel expands the leading occupied range and turnover expands
-- the trailing range, both of which must remain inside schedules and breaks.
insert into app.schedule_policy_overrides(id,tenant_id,scope_kind,location_id,service_id,staff_id,policy_key,value) values
 ('a8800000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','tenant',null,null,null,'slot_interval_minutes','60'),
 ('a8800000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','location','a5000000-0000-0000-0000-000000000001',null,null,'slot_interval_minutes','30'),
 ('a8800000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','service',null,'a7200000-0000-0000-0000-000000000001',null,'slot_interval_minutes','20'),
 ('a8800000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','staff',null,null,'a8000000-0000-0000-0000-000000000001','slot_interval_minutes','15'),
 ('a8800000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','tenant',null,null,null,'travel_minutes','5'),
 ('a8800000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001','location','a5000000-0000-0000-0000-000000000001',null,null,'travel_minutes','10'),
 ('a8800000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000001','service',null,'a7200000-0000-0000-0000-000000000001',null,'travel_minutes','15'),
 ('a8800000-0000-0000-0000-000000000008','a0000000-0000-0000-0000-000000000001','staff',null,null,'a8000000-0000-0000-0000-000000000001','travel_minutes','20'),
 ('a8800000-0000-0000-0000-000000000009','a0000000-0000-0000-0000-000000000001','tenant',null,null,null,'turnover_minutes','5'),
 ('a8800000-0000-0000-0000-000000000010','a0000000-0000-0000-0000-000000000001','location','a5000000-0000-0000-0000-000000000001',null,null,'turnover_minutes','10'),
 ('a8800000-0000-0000-0000-000000000011','a0000000-0000-0000-0000-000000000001','service',null,'a7200000-0000-0000-0000-000000000001',null,'turnover_minutes','20'),
 ('a8800000-0000-0000-0000-000000000012','a0000000-0000-0000-0000-000000000001','staff',null,null,'a8000000-0000-0000-0000-000000000001','turnover_minutes','30');
select is(
  (select count(*)::integer from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,'2026-09-07 13:00+00','2026-09-07 22:00+00',1,'America/New_York') where result_kind='slot'),
  26,
  'subject policy precedence drives interval and occupied travel/turnover containment'
);

insert into app.catalog_services(id,tenant_id,key,category_id)
values ('a7200000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','room-booking','a7100000-0000-0000-0000-000000000001');
insert into app.catalog_service_revisions(
  id,tenant_id,service_id,revision,locale,state,name,canonical_path,duration_minutes,
  price_minor,currency,capacity_mode,booking_mode,publication_id,published_at
) values (
  'a7210000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001',
  'a7200000-0000-0000-0000-000000000002',1,'en','published','Room booking',
  '/services/room-booking',45,1000,'SAR','exclusive','exclusive_resource',
  'a7000000-0000-0000-0000-000000000001','2026-09-05 00:00+00'
);
insert into app.catalog_service_locations(tenant_id,service_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000002','a5000000-0000-0000-0000-000000000001');
insert into app.resource_types(id,tenant_id,key,name)
values ('a8400000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','room','Room');
insert into app.resources(id,tenant_id,resource_type_id,key,public_name)
values ('a8500000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a8400000-0000-0000-0000-000000000001','room-one','Room one');
insert into app.resource_locations(tenant_id,resource_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','a8500000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001');
insert into app.resource_requirements(tenant_id,service_id,resource_type_id)
values ('a0000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000002','a8400000-0000-0000-0000-000000000001');
insert into app.schedule_scopes(id,tenant_id,scope_kind,location_id,resource_id,time_zone)
values ('a8600000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','resource','a5000000-0000-0000-0000-000000000001','a8500000-0000-0000-0000-000000000001','America/New_York');
insert into app.weekly_schedules(id,tenant_id,schedule_scope_id,day_of_week,start_minute,end_minute)
values ('a8700000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a8600000-0000-0000-0000-000000000001',1,540,1020);
select is(
  (select count(*)::integer from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000002','a5000000-0000-0000-0000-000000000001',null,'2026-09-07 13:00+00','2026-09-07 22:00+00',1,'America/New_York') where result_kind='slot' and allocation_kind='exclusive_resource' and staff_id is null),
  14,
  'exclusive-resource slots expose their kind while resource identity remains private'
);
insert into app.catalog_services(id,tenant_id,key,category_id)
values ('a7200000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','group-session','a7100000-0000-0000-0000-000000000001');
insert into app.catalog_service_revisions(
  id,tenant_id,service_id,revision,locale,state,name,canonical_path,duration_minutes,
  price_minor,currency,capacity_mode,booking_mode,publication_id,published_at
) values (
  'a7210000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001',
  'a7200000-0000-0000-0000-000000000003',1,'en','published','Group session',
  '/services/group-session',45,1000,'SAR','group','appointment',
  'a7000000-0000-0000-0000-000000000001','2026-09-05 00:00+00'
);
insert into app.catalog_service_locations(tenant_id,service_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000003','a5000000-0000-0000-0000-000000000001');
select throws_ok(
  $$select * from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000003','a5000000-0000-0000-0000-000000000001',null,'2026-09-07 13:00+00','2026-09-07 22:00+00',1,'America/New_York')$$,
  '22023','availability_selection_unavailable','deferred group capacity fails closed even for party size one'
);

-- More than 128 eligible subjects must not silently discard the only subject
-- whose schedule can satisfy the requested window.
insert into app.catalog_services(id,tenant_id,key,category_id)
values ('a7200000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','large-candidate-set','a7100000-0000-0000-0000-000000000001');
insert into app.catalog_service_revisions(id,tenant_id,service_id,revision,locale,state,name,canonical_path,duration_minutes,price_minor,currency,publication_id,published_at)
values ('a7210000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000004',1,'en','published','Large candidate set','/services/large-candidate-set',45,1000,'SAR','a7000000-0000-0000-0000-000000000001','2026-09-05 00:00+00');
insert into app.catalog_service_locations(tenant_id,service_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000004','a5000000-0000-0000-0000-000000000001');
insert into app.staff_profiles(id,tenant_id,public_name)
select ('10000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'a0000000-0000-0000-0000-000000000001'::uuid,'Unavailable '||i from generate_series(1,128) i
union all select 'f9000000-0000-0000-0000-000000000001'::uuid,'a0000000-0000-0000-0000-000000000001'::uuid,'Only available';
insert into app.staff_services(tenant_id,staff_id,service_id)
select 'a0000000-0000-0000-0000-000000000001',id,'a7200000-0000-0000-0000-000000000004' from app.staff_profiles where id::text like '10000000-%' or id='f9000000-0000-0000-0000-000000000001';
insert into app.staff_locations(tenant_id,staff_id,location_id)
select 'a0000000-0000-0000-0000-000000000001',id,'a5000000-0000-0000-0000-000000000001' from app.staff_profiles where id::text like '10000000-%' or id='f9000000-0000-0000-0000-000000000001';
insert into app.staff_service_locations(tenant_id,staff_id,service_id,location_id)
select 'a0000000-0000-0000-0000-000000000001',id,'a7200000-0000-0000-0000-000000000004','a5000000-0000-0000-0000-000000000001' from app.staff_profiles where id::text like '10000000-%' or id='f9000000-0000-0000-0000-000000000001';
insert into app.schedule_scopes(id,tenant_id,scope_kind,location_id,staff_id,time_zone)
select ('20000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'a0000000-0000-0000-0000-000000000001'::uuid,'staff','a5000000-0000-0000-0000-000000000001'::uuid,('10000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'America/New_York' from generate_series(1,128) i
union all select 'f9100000-0000-0000-0000-000000000001'::uuid,'a0000000-0000-0000-0000-000000000001'::uuid,'staff','a5000000-0000-0000-0000-000000000001'::uuid,'f9000000-0000-0000-0000-000000000001'::uuid,'America/New_York';
insert into app.weekly_schedules(id,tenant_id,schedule_scope_id,day_of_week,start_minute,end_minute)
select ('30000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'a0000000-0000-0000-0000-000000000001'::uuid,('20000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,2,540,1020 from generate_series(1,128) i
union all select 'f9200000-0000-0000-0000-000000000001'::uuid,'a0000000-0000-0000-0000-000000000001'::uuid,'f9100000-0000-0000-0000-000000000001'::uuid,1,540,1020;
select ok(
  exists(select 1 from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000004','a5000000-0000-0000-0000-000000000001',null,'2026-09-07 13:00+00','2026-09-07 15:00+00',1,'America/New_York') where result_kind='slot' and staff_id='f9000000-0000-0000-0000-000000000001'),
  'availability evaluates the valid later subject beyond the former 128-candidate truncation'
);
select is(
  (select provider_health_code from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,'2026-09-07 13:00+00','2026-09-07 22:00+00',1,'America/New_York') limit 1),
  'not_applicable',
  'external calendar health remains explicitly deferred'
);
select is(
  (select allocation_kind from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,'2026-09-07 13:00+00','2026-09-07 22:00+00',1,'America/New_York') where result_kind='slot' limit 1),
  'appointment',
  'slot DTO identifies appointment versus exclusive-resource allocation without leaking resource IDs'
);
select ok(
  (select bool_and(cache_tag like 'availability:a0000000-0000-0000-0000-000000000001:1:3:1:%') from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,'2026-09-07 13:00+00','2026-09-07 22:00+00',1,'America/New_York')),
  'cache tag includes tenant, publication, config, feature, and availability revisions'
);

insert into app.assignment_allocations(id,tenant_id,service_id,location_id,staff_id,starts_at,ends_at)
values ('a8300000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001','2026-09-07 13:00+00','2026-09-07 13:45+00');
select cmp_ok(
  (select revision from app.availability_revisions where tenant_id='a0000000-0000-0000-0000-000000000001'),
  '>',current_setting('test.availability_revision')::bigint,
  'allocation mutations invalidate tenant availability cache tags'
);
select is(
  (select count(*)::integer from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,'2026-09-07 13:00+00','2026-09-07 22:00+00',1,'America/New_York') where result_kind='slot'),
  23,
  'active allocation occupied ranges remove overlapping advisory slots'
);
select is(
  (select no_slot_code from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,'2026-09-07 13:00+00','2026-09-07 13:45+00',1,'America/New_York') where result_kind='summary'),
  'capacity_unavailable',
  'allocation conflicts use a coarse capacity code without conflict details'
);
insert into app.schedule_policy_overrides(id,tenant_id,scope_kind,staff_id,policy_key,value)
values ('a8800000-0000-0000-0000-000000000013','a0000000-0000-0000-0000-000000000001','staff','a8000000-0000-0000-0000-000000000001','daily_limit_per_staff','1');
select is(
  (select no_slot_code from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,'2026-09-07 18:00+00','2026-09-07 19:00+00',1,'America/New_York') where result_kind='summary'),
  'policy_restricted',
  'daily limits use a coarse policy code'
);
insert into app.schedule_policy_overrides(id,tenant_id,scope_kind,location_id,service_id,staff_id,policy_key,value) values
 ('a8810000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','tenant',null,null,null,'buffer_before_minutes','1'),
 ('a8810000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','location','a5000000-0000-0000-0000-000000000001',null,null,'buffer_before_minutes','2'),
 ('a8810000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','service',null,'a7200000-0000-0000-0000-000000000001',null,'buffer_before_minutes','3'),
 ('a8810000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','staff',null,null,'a8000000-0000-0000-0000-000000000001','buffer_before_minutes','4'),
 ('a8810000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','tenant',null,null,null,'buffer_after_minutes','5'),
 ('a8810000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001','location','a5000000-0000-0000-0000-000000000001',null,null,'buffer_after_minutes','6'),
 ('a8810000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000001','service',null,'a7200000-0000-0000-0000-000000000001',null,'buffer_after_minutes','7'),
 ('a8810000-0000-0000-0000-000000000008','a0000000-0000-0000-0000-000000000001','staff',null,null,'a8000000-0000-0000-0000-000000000001','buffer_after_minutes','8'),
 ('a8810000-0000-0000-0000-000000000009','a0000000-0000-0000-0000-000000000001','tenant',null,null,null,'minimum_notice_minutes','60'),
 ('a8810000-0000-0000-0000-000000000010','a0000000-0000-0000-0000-000000000001','location','a5000000-0000-0000-0000-000000000001',null,null,'minimum_notice_minutes','90'),
 ('a8810000-0000-0000-0000-000000000011','a0000000-0000-0000-0000-000000000001','service',null,'a7200000-0000-0000-0000-000000000001',null,'minimum_notice_minutes','120'),
 ('a8810000-0000-0000-0000-000000000012','a0000000-0000-0000-0000-000000000001','staff',null,null,'a8000000-0000-0000-0000-000000000001','minimum_notice_minutes','150'),
 ('a8810000-0000-0000-0000-000000000013','a0000000-0000-0000-0000-000000000001','tenant',null,null,null,'horizon_days','30'),
 ('a8810000-0000-0000-0000-000000000014','a0000000-0000-0000-0000-000000000001','location','a5000000-0000-0000-0000-000000000001',null,null,'horizon_days','40'),
 ('a8810000-0000-0000-0000-000000000015','a0000000-0000-0000-0000-000000000001','service',null,'a7200000-0000-0000-0000-000000000001',null,'horizon_days','50'),
 ('a8810000-0000-0000-0000-000000000016','a0000000-0000-0000-0000-000000000001','staff',null,null,'a8000000-0000-0000-0000-000000000001','horizon_days','55'),
 ('a8810000-0000-0000-0000-000000000017','a0000000-0000-0000-0000-000000000001','tenant',null,null,null,'daily_limit_per_staff','4'),
 ('a8810000-0000-0000-0000-000000000018','a0000000-0000-0000-0000-000000000001','location','a5000000-0000-0000-0000-000000000001',null,null,'daily_limit_per_staff','3'),
 ('a8810000-0000-0000-0000-000000000019','a0000000-0000-0000-0000-000000000001','service',null,'a7200000-0000-0000-0000-000000000001',null,'daily_limit_per_staff','2');
select is(private.resolve_availability_policy_v1('a0000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001',null,'buffer_before_minutes',0),4,'buffer-before uses subject precedence');
select is(private.resolve_availability_policy_v1('a0000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001',null,'buffer_after_minutes',0),8,'buffer-after uses subject precedence');
select is(private.resolve_availability_policy_v1('a0000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001',null,'minimum_notice_minutes',0),150,'notice uses subject precedence');
select is(private.resolve_availability_policy_v1('a0000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001',null,'horizon_days',1),55,'horizon uses subject precedence');
select is(private.resolve_availability_policy_v1('a0000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001',null,'daily_limit_per_staff',null),1,'daily limit uses subject precedence');

select ok(
  (select count(*) <= 500 from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,'2026-09-07 00:00+00','2026-10-08 00:00+00',1,'America/New_York')),
  'a maximum-size request cannot return more than 500 rows'
);
select lives_ok(
  $$explain (analyze,buffers,format json) select * from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,'2026-09-07 00:00+00','2026-10-08 00:00+00',1,'America/New_York')$$,
  'representative maximum-window plan completes within the RPC statement timeout'
);

select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select lives_ok(
  $$select * from api_v1.get_availability_v1('dashboard.tenant-a.example.invalid','dashboard','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,'2026-09-07 13:00+00','2026-09-07 22:00+00',1,'America/New_York')$$,
  'a live tenant member receives the same Dashboard availability semantics'
);
select throws_ok(
  $$select * from api_v1.get_availability_v1('dashboard.tenant-b.example.invalid','dashboard','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,'2026-09-07 13:00+00','2026-09-07 22:00+00',1,'America/New_York')$$,
  '42501','availability_context_required','Dashboard context requires a live membership in the resolved tenant'
);
reset role;

rollback;
