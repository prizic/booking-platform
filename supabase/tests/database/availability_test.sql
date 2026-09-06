begin;
select no_plan();

select has_table('app'::name, 'availability_revisions'::name);
select ok((select relrowsecurity from pg_class where oid='app.availability_revisions'::regclass), 'availability revisions require RLS');
select ok(not has_table_privilege('anon','app.availability_revisions','select'), 'anonymous callers cannot read availability revisions');
select has_function('api_v1'::name, 'get_availability_v1'::name, array['text','text','uuid','uuid','uuid','timestamp with time zone','timestamp with time zone','integer','text']);
select ok(has_function_privilege('anon','api_v1.get_availability_v1(text,text,uuid,uuid,uuid,timestamptz,timestamptz,integer,text)','execute'), 'anonymous Client callers can request availability');
select ok(has_function_privilege('authenticated','api_v1.get_availability_v1(text,text,uuid,uuid,uuid,timestamptz,timestamptz,integer,text)','execute'), 'authenticated Dashboard callers can request availability');
select ok(not (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='api_v1' and p.proname='get_availability_v1'), 'public availability wrapper is security invoker');

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
  30,
  'exclusive-resource slots expose their kind while resource identity remains private'
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
  27,
  'active allocation occupied ranges remove overlapping advisory slots'
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
