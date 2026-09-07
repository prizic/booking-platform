begin;
select no_plan();

-- Issue #11. Single-session contract, constraint, RLS, and lifecycle coverage.
-- Real contention runs in tests/concurrency, which needs parallel sessions.

-- Same derived Monday the availability suite uses, so notice and horizon hold
-- regardless of the run date or the current New York offset.
select set_config('test.hold_day',
  (date_trunc('week',statement_timestamp() at time zone 'America/New_York')::date+14)::text,true);
create function pg_temp.hold_time(p_time time)
returns timestamptz language sql stable as $$
  select (current_setting('test.hold_day')::date+p_time) at time zone 'America/New_York';
$$;
do $$ begin
  execute format('grant usage on schema %I to authenticated',pg_my_temp_schema()::regnamespace::text);
end $$;

select has_table('app'::name,'booking_holds'::name);
select has_table('app'::name,'idempotency_keys'::name);
select has_column('app'::name,'tenant_settings'::name,'hold_ttl_seconds'::name,'hold TTL is tenant configuration');
select has_column('app'::name,'assignment_allocations'::name,'hold_id'::name,'allocations carry the owning hold');
select ok((select relrowsecurity from pg_class where oid='app.booking_holds'::regclass),'holds require RLS');
select ok((select relrowsecurity from pg_class where oid='app.idempotency_keys'::regclass),'idempotency claims require RLS');
select ok(not exists(
  select 1 from (values ('anon'),('authenticated')) principals(role_name)
  cross join (values ('app.booking_holds'),('app.idempotency_keys')) tables(table_name)
  cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) commands(privilege)
  where has_table_privilege(principals.role_name,tables.table_name,commands.privilege)
),'application roles have no direct hold or idempotency CRUD grants');
select ok(not has_function_privilege('anon','private.expire_holds_v1(uuid,integer)','execute'),
  'anonymous callers cannot run the expiry job');
select ok(not has_function_privilege('authenticated','private.expire_holds_v1(uuid,integer)','execute'),
  'authenticated callers cannot run the expiry job');

select has_function('api_v1'::name,'create_hold_v1'::name,
  array['text','text','uuid','uuid','timestamp with time zone','text','text','uuid','integer','text','text']);
select has_function('api_v1'::name,'release_hold_v1'::name,array['text','text','uuid','text']);
select ok(has_function_privilege('anon','api_v1.create_hold_v1(text,text,uuid,uuid,timestamptz,text,text,uuid,integer,text,text)','execute'),
  'anonymous Client callers can create a hold');
select ok(has_function_privilege('authenticated','api_v1.create_hold_v1(text,text,uuid,uuid,timestamptz,text,text,uuid,integer,text,text)','execute'),
  'authenticated Dashboard callers can create a hold');
select ok(not (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='api_v1' and p.proname='create_hold_v1'),'the exposed hold wrapper is security invoker');
select ok((select p.proconfig @> array['statement_timeout=5s'] from pg_proc p
  where p.oid='api_v1.create_hold_v1(text,text,uuid,uuid,timestamptz,text,text,uuid,integer,text,text)'::regprocedure),
  'exposed hold RPC declares the timeout PostgREST hoists');

-- The final concurrency guard is the database, and it must stay keyed by tenant
-- and exclusive subject over the buffered half-open range.
select is((select count(*)::integer from pg_constraint
  where conrelid='app.assignment_allocations'::regclass and contype='x'
    and pg_get_constraintdef(oid) like '%occupied_at WITH &&%'
    and pg_get_constraintdef(oid) like '%state = ANY (ARRAY[''held''::text, ''confirmed''::text])%'),
  2,'staff and resource overlap are both refused by exclusion constraints over held and confirmed state');
select throws_ok(
  $$update app.tenant_settings set hold_ttl_seconds=30 where tenant_id='a0000000-0000-0000-0000-000000000001'$$,
  '23514',null,'a TTL below the platform floor is refused');
select throws_ok(
  $$update app.tenant_settings set hold_ttl_seconds=3600 where tenant_id='a0000000-0000-0000-0000-000000000001'$$,
  '23514',null,'a TTL above the platform ceiling is refused');

savepoint hold_rls;
-- Grant only inside this rolled-back fixture to prove RLS independently of the
-- production privilege denial.
grant select,insert,update,delete on app.booking_holds,app.idempotency_keys to anon,authenticated;
set local role anon;
select is((select count(*)::integer from app.booking_holds),0,'anonymous RLS hides every hold');
select throws_ok($$insert into app.booking_holds(tenant_id,service_id,location_id,publication_id,allocation_kind,starts_at,ends_at,expires_at,ttl_seconds,price_minor,tax_rate_bps,currency,session_hash,correlation_id) values ('a0000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000001','appointment',statement_timestamp(),statement_timestamp()+interval '1 hour',statement_timestamp()+interval '10 minutes',600,0,0,'SAR',repeat('a',64),pg_catalog.gen_random_uuid())$$,
  '42501','new row violates row-level security policy for table "booking_holds"','anonymous RLS denies hold insertion');
select is((select count(*)::integer from app.idempotency_keys),0,'anonymous RLS hides every idempotency claim');
reset role;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select count(*)::integer from app.booking_holds),0,'tenant admin RLS hides same-tenant and other-tenant holds');
select is((select count(*)::integer from app.idempotency_keys),0,'tenant admin RLS hides idempotency claims');
with changed as (update app.booking_holds set state='released' returning 1)
  select is((select count(*)::integer from changed),0,'tenant admin RLS denies hold updates');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint hold_rls;

-- A bookable staff member and matching civil-time schedule make the seeded
-- published 45-minute service holdable on the derived Monday in New York.
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

select is(
  (select count(*)::integer from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.hold_time('09:00'),pg_temp.hold_time('18:00'),1,'America/New_York') where result_kind='slot'),
  30,'the fixture offers the same thirty advisory slots the availability suite asserts');

select throws_ok(
  format($$select * from api_v1.create_hold_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',%L,'short','idempotency-key-aaaa-0001')$$,pg_temp.hold_time('10:00')),
  '22023','hold_invalid_session','a session token below the minimum length is rejected');
select throws_ok(
  format($$select * from api_v1.create_hold_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',%L,'session-token-aaaa-0001','short-key')$$,pg_temp.hold_time('10:00')),
  '22023','hold_invalid_idempotency_key','an idempotency key below the minimum length is rejected');
select throws_ok(
  format($$select * from api_v1.create_hold_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',%L,'session-token-aaaa-0001','idempotency-key-aaaa-0001',null,2)$$,pg_temp.hold_time('10:00')),
  '22023','hold_party_size_out_of_bounds','group party sizes are refused until issue #42');
select throws_ok(
  format($$select * from api_v1.create_hold_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',%L,'session-token-aaaa-0001','idempotency-key-aaaa-0001')$$,pg_temp.hold_time('10:00')+interval '30 seconds'),
  '22023','hold_invalid_slot','a sub-minute slot instant is rejected');
select throws_ok(
  format($$select * from api_v1.create_hold_v1('preview.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',%L,'session-token-aaaa-0001','idempotency-key-aaaa-0001')$$,pg_temp.hold_time('10:00')),
  '42501','hold_context_required','an unverified preview host cannot create a hold');
select throws_ok(
  format($$select * from api_v1.create_hold_v1('client.tenant-b.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',%L,'session-token-aaaa-0001','idempotency-key-aaaa-0001')$$,pg_temp.hold_time('10:00')),
  '42501','hold_context_required','another tenant cannot hold this tenant catalog');
select throws_ok(
  format($$select * from api_v1.create_hold_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',%L,'session-token-aaaa-0001','idempotency-key-aaaa-0001',null,1,'availability:stale')$$,pg_temp.hold_time('10:00')),
  '23505','revision_conflict','a superseded availability read is refused before any allocation');
select throws_ok(
  format($$select * from api_v1.create_hold_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',%L,'session-token-aaaa-0001','idempotency-key-aaaa-0001')$$,pg_temp.hold_time('10:07')),
  '23P01','slot_unavailable','an instant that availability never offered is refused');
select is((select count(*)::integer from app.booking_holds),0,'no rejected attempt left a hold behind');

-- First accepted hold.
select set_config('test.hold_id',(select h.hold_id::text from api_v1.create_hold_v1(
  'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.hold_time('10:00'),
  'session-token-aaaa-0001','idempotency-key-aaaa-0001') h),true);
select is((select array[h.state,h.allocation_kind,h.currency,h.attempts::text,h.ttl_seconds::text,
    (h.expires_at-h.created_at)::text,h.price_minor::text]
  from app.booking_holds h where h.id=current_setting('test.hold_id')::uuid),
  array['active','appointment','SAR','1','600','00:10:00','18000'],
  'the hold snapshots the published price, currency, and bounded tenant TTL');
select is((select array[a.state,a.staff_id::text,a.buffer_before_minutes::text,a.buffer_after_minutes::text]
  from app.assignment_allocations a where a.hold_id=current_setting('test.hold_id')::uuid),
  array['held','a8000000-0000-0000-0000-000000000001','0','0'],
  'the hold allocates its subject as held capacity with the resolved buffers');
select is(
  (select count(*)::integer from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.hold_time('09:00'),pg_temp.hold_time('18:00'),1,'America/New_York') where result_kind='slot'),
  25,'a held slot and its four overlapping neighbours leave availability, adjacent slots do not');

-- Idempotency: same key and same normalized request replays, a changed request
-- for the same key fails.
select is((select array[h.hold_id::text,h.replayed::text] from api_v1.create_hold_v1(
    'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
    'a5000000-0000-0000-0000-000000000001',pg_temp.hold_time('10:00'),
    'session-token-aaaa-0001','idempotency-key-aaaa-0001') h),
  array[current_setting('test.hold_id'),'true'],
  'an identical retry replays the original hold instead of allocating again');
select throws_ok(
  format($$select * from api_v1.create_hold_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',%L,'session-token-aaaa-0001','idempotency-key-aaaa-0001')$$,pg_temp.hold_time('11:00')),
  '23505','idempotency_conflict','reusing a key with a different normalized request fails');
select is((select count(*)::integer from app.booking_holds),1,'neither replay nor conflict created a second hold');

-- Overlap and adjacency at the database boundary.
select throws_ok(
  format($$select * from api_v1.create_hold_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',%L,'session-token-bbbb-0001','idempotency-key-bbbb-0001')$$,pg_temp.hold_time('10:30')),
  '23P01','slot_unavailable','a true overlap from another session is refused without naming the holder');
select lives_ok(
  format($$select * from api_v1.create_hold_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',%L,'session-token-bbbb-0001','idempotency-key-bbbb-0002')$$,pg_temp.hold_time('10:45')),
  'the adjacent half-open slot is still holdable');
select lives_ok(
  format($$select * from api_v1.create_hold_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',%L,'session-token-bbbb-0001','idempotency-key-bbbb-0003')$$,pg_temp.hold_time('09:15')),
  'the preceding half-open slot is still holdable');

-- Abuse limits deny without disclosing the threshold.
select lives_ok(
  format($$select * from api_v1.create_hold_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',%L,'session-token-bbbb-0001','idempotency-key-bbbb-0004')$$,pg_temp.hold_time('12:00')),
  'a session may hold several distinct slots at once');
select throws_ok(
  format($$select * from api_v1.create_hold_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',%L,'session-token-bbbb-0001','idempotency-key-bbbb-0005')$$,pg_temp.hold_time('14:00')),
  '42501','policy_denied','a session holding the maximum active slots is denied with a stable opaque error');

-- Release returns capacity and is safe to repeat.
savepoint hold_release;
select throws_ok(
  format($$select * from api_v1.release_hold_v1('client.tenant-a.example.invalid','client',%L,'session-token-wrong-001')$$,current_setting('test.hold_id')),
  '42501','hold_context_required','a hold cannot be released by another session');
select is((select array[r.state] from api_v1.release_hold_v1('client.tenant-a.example.invalid','client',
    current_setting('test.hold_id')::uuid,'session-token-aaaa-0001') r),
  array['released'],'the owning session releases its hold');
select is((select array[r.state] from api_v1.release_hold_v1('client.tenant-a.example.invalid','client',
    current_setting('test.hold_id')::uuid,'session-token-aaaa-0001') r),
  array['released'],'releasing an already released hold is idempotent');
select is((select count(*)::integer from app.assignment_allocations a
  where a.hold_id=current_setting('test.hold_id')::uuid and a.state='held'),0,
  'release cancels the held allocation exactly once');
select lives_ok(
  format($$select * from api_v1.create_hold_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',%L,'session-token-cccc-0001','idempotency-key-cccc-0001')$$,pg_temp.hold_time('10:00')),
  'released capacity is immediately holdable again');
rollback to savepoint hold_release;

-- Expiry releases capacity exactly once, and a creating transaction clears a
-- stale conflict synchronously.
savepoint hold_expiry;
update app.booking_holds set expires_at=statement_timestamp()-interval '1 second'
where id=current_setting('test.hold_id')::uuid;
select is((select array[e.expired_holds,e.released_allocations] from private.expire_holds_v1() e),
  array[1,1],'the batched job expires the stale hold and releases its allocation');
select is((select array[e.expired_holds,e.released_allocations] from private.expire_holds_v1() e),
  array[0,0],'a second job run releases the same capacity a second time for nobody');
select is((select array[h.state,(h.released_at is not null)::text] from app.booking_holds h
  where h.id=current_setting('test.hold_id')::uuid),array['expired','true'],
  'the expired hold records when it stopped holding capacity');
select lives_ok(
  format($$select * from api_v1.create_hold_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',%L,'session-token-dddd-0001','idempotency-key-dddd-0001')$$,pg_temp.hold_time('10:00')),
  'capacity released by expiry is holdable again');
rollback to savepoint hold_expiry;

savepoint hold_stale_conflict;
update app.booking_holds set expires_at=statement_timestamp()-interval '1 second'
where id=current_setting('test.hold_id')::uuid;
select lives_ok(
  format($$select * from api_v1.create_hold_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',%L,'session-token-eeee-0001','idempotency-key-eeee-0001')$$,pg_temp.hold_time('10:00')),
  'a creating transaction synchronously expires the conflicting stale hold before allocating');
select is((select h.state from app.booking_holds h where h.id=current_setting('test.hold_id')::uuid),
  'expired','the stale hold is recorded as expired rather than silently overwritten');
rollback to savepoint hold_stale_conflict;

savepoint hold_ttl;
update app.tenant_settings set hold_ttl_seconds=60 where tenant_id='a0000000-0000-0000-0000-000000000001';
select set_config('test.ttl_hold_id',(select c.hold_id::text from api_v1.create_hold_v1(
  'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.hold_time('15:00'),
  'session-token-ffff-0001','idempotency-key-ffff-0001') c),true);
select is((select (h.expires_at-h.created_at)::text from app.booking_holds h
  where h.id=current_setting('test.ttl_hold_id')::uuid),'00:01:00',
  'a tenant TTL at the platform floor is honoured exactly');
rollback to savepoint hold_ttl;

savepoint idempotency_retention;
select set_config('test.claim_count',(select count(*)::text from app.idempotency_keys),true);
update app.idempotency_keys set expires_at=statement_timestamp()-interval '1 second';
select is((select e.purged_idempotency_keys from private.expire_holds_v1() e),
  current_setting('test.claim_count')::integer,
  'elapsed idempotency claims are purged by the same batched job');
rollback to savepoint idempotency_retention;

-- Exclusive-resource services keep resource identity private while the hold
-- allocates a concrete resource in ascending order.
savepoint resource_holds;
insert into app.catalog_services(id,tenant_id,key,category_id)
values ('a7200000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','room-booking','a7100000-0000-0000-0000-000000000001');
insert into app.catalog_service_revisions(
  id,tenant_id,service_id,revision,locale,state,name,canonical_path,duration_minutes,
  price_minor,currency,capacity_mode,booking_mode,publication_id,published_at
) values (
  'a7210000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001',
  'a7200000-0000-0000-0000-000000000002',1,'en','published','Room booking',
  '/services/room-booking',45,1000,'SAR','exclusive','exclusive_resource',
  'a7000000-0000-0000-0000-000000000001','2026-09-05 00:00+00');
insert into app.catalog_service_locations(tenant_id,service_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000002','a5000000-0000-0000-0000-000000000001');
insert into app.resource_types(id,tenant_id,key,name)
values ('a8400000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','room','Room');
insert into app.resources(id,tenant_id,resource_type_id,key,public_name) values
  ('a8500000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a8400000-0000-0000-0000-000000000001','room-one','Room one'),
  ('a8500000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','a8400000-0000-0000-0000-000000000001','room-two','Room two');
insert into app.resource_locations(tenant_id,resource_id,location_id) values
  ('a0000000-0000-0000-0000-000000000001','a8500000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000001','a8500000-0000-0000-0000-000000000002','a5000000-0000-0000-0000-000000000001');
insert into app.resource_requirements(tenant_id,service_id,resource_type_id)
values ('a0000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000002','a8400000-0000-0000-0000-000000000001');
insert into app.schedule_scopes(id,tenant_id,scope_kind,location_id,resource_id,time_zone) values
  ('a8600000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','resource','a5000000-0000-0000-0000-000000000001','a8500000-0000-0000-0000-000000000001','America/New_York'),
  ('a8600000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','resource','a5000000-0000-0000-0000-000000000001','a8500000-0000-0000-0000-000000000002','America/New_York');
insert into app.weekly_schedules(id,tenant_id,schedule_scope_id,day_of_week,start_minute,end_minute) values
  ('a8700000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a8600000-0000-0000-0000-000000000001',1,540,1020),
  ('a8700000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','a8600000-0000-0000-0000-000000000002',1,540,1020);
select is((select array[c.allocation_kind,(c.staff_id is null)::text] from api_v1.create_hold_v1(
    'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000002',
    'a5000000-0000-0000-0000-000000000001',pg_temp.hold_time('13:00'),
    'session-token-gggg-0001','idempotency-key-gggg-0001') c),
  array['exclusive_resource','true'],'a resource hold never returns the resource it allocated');
select is((select a.resource_id from app.assignment_allocations a
  join app.booking_holds h on h.id=a.hold_id where h.starts_at=pg_temp.hold_time('13:00')),
  'a8500000-0000-0000-0000-000000000001'::uuid,
  'the first resource is taken in ascending resource-id order');
select set_config('test.second_room_hold_id',(select c.hold_id::text from api_v1.create_hold_v1(
  'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000002',
  'a5000000-0000-0000-0000-000000000001',pg_temp.hold_time('13:00'),
  'session-token-hhhh-0001','idempotency-key-hhhh-0001') c),true);
select is((select a.resource_id from app.assignment_allocations a
  where a.hold_id=current_setting('test.second_room_hold_id')::uuid),
  'a8500000-0000-0000-0000-000000000002'::uuid,
  'a second caller for the same instant takes the next interchangeable resource');
select throws_ok(
  format($$select * from api_v1.create_hold_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000002','a5000000-0000-0000-0000-000000000001',%L,'session-token-iiii-0001','idempotency-key-iiii-0001')$$,pg_temp.hold_time('13:00')),
  '23P01','slot_unavailable','once every interchangeable resource is held the instant is refused');
rollback to savepoint resource_holds;

-- Savepoint rollbacks revert pgTAP's counter, which lives in a temporary table,
-- but not the test numbering, which comes from a temporary sequence. Re-sync the
-- count so the emitted plan matches the tests that actually ran.
select _set('curr_test',(select last_value::integer from __tresults___numb_seq));
select * from finish();

rollback;
