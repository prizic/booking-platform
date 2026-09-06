begin;
select no_plan();

select has_table('app'::name, 'staff_profiles'::name);
select has_table('app'::name, 'staff_service_locations'::name);
select has_table('app'::name, 'resources'::name);
select has_table('app'::name, 'assignment_allocations'::name);
select col_not_null('app'::name, 'assignment_allocations'::name, 'service_id'::name);
select col_not_null('app'::name, 'assignment_allocations'::name, 'location_id'::name);
select ok(
  (
    select count(*)::integer
    from pg_constraint
    where conname in ('assignment_staff_no_overlap', 'assignment_resource_no_overlap')
  ) = 2,
  'active allocations have half-open GiST overlap protection'
);
select ok(
  not exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'api_v1'
      and procedure.proname in (
        'get_assignment_candidates_v1',
        'set_staff_service_location_eligibility_v1',
        'set_resource_location_eligibility_v1',
        'deactivate_staff_v1',
        'deactivate_resource_v1'
      )
      and procedure.prosecdef
  ),
  'every issue 8 api_v1 function is SECURITY INVOKER'
);

-- Fixtures are installed as the migration owner. Application roles have no
-- direct write grant and exercise only the versioned RPC surface below.
reset role;
insert into app.staff_profiles (
  id, tenant_id, public_name, offered_hours_per_week
) values
  ('a8000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Alex Staff', 10),
  ('a8000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Basma Staff', 40),
  ('a8000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Casey Staff', 40);
insert into app.staff_services (tenant_id, staff_id, service_id) values
  ('a0000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001', 'a7200000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000002', 'a7200000-0000-0000-0000-000000000001');
insert into app.staff_locations (tenant_id, staff_id, location_id) values
  ('a0000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000001');
insert into app.staff_service_locations (
  tenant_id, staff_id, service_id, location_id
) values
  ('a0000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001', 'a7200000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000002', 'a7200000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001');

insert into app.resource_types (id, tenant_id, key, name) values
  ('a8100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'room', 'Room');
insert into app.resources (
  id, tenant_id, resource_type_id, key, public_name, status
) values
  ('a8200000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a8100000-0000-0000-0000-000000000001', 'room-one', 'Room One', 'active'),
  ('a8200000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a8100000-0000-0000-0000-000000000001', 'room-two', 'Room Two', 'active'),
  ('a8200000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'a8100000-0000-0000-0000-000000000001', 'room-three', 'Room Three', 'maintenance');
insert into app.resource_locations (tenant_id, resource_id, location_id) values
  ('a0000000-0000-0000-0000-000000000001', 'a8200000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000001', 'a8200000-0000-0000-0000-000000000003', 'a5000000-0000-0000-0000-000000000001');
insert into app.resource_requirements (
  tenant_id, service_id, resource_type_id
) values (
  'a0000000-0000-0000-0000-000000000001',
  'a7200000-0000-0000-0000-000000000001',
  'a8100000-0000-0000-0000-000000000001'
);

insert into app.assignment_allocations (
  id, tenant_id, service_id, location_id, staff_id, starts_at, ends_at, state
) values
  ('a8300000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'a7200000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001', '2026-01-01 10:00:00+00', '2026-01-01 11:00:00+00', 'completed'),
  ('a8300000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'a7200000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000002', '2026-01-02 10:00:00+00', '2026-01-02 11:00:00+00', 'completed'),
  ('a8300000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000001', 'a7200000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000002', '2026-01-03 10:00:00+00', '2026-01-03 11:00:00+00', 'completed');

select is(
  (
    select count(*)::integer
    from api_v1.get_assignment_candidates_v1(
      'a7200000-0000-0000-0000-000000000001',
      'a5000000-0000-0000-0000-000000000001'
    )
    where staff_id is not null
  ),
  2,
  'any_available returns every eligible staff choice'
);
select is(
  (
    select count(*)::integer
    from api_v1.get_assignment_candidates_v1(
      'a7200000-0000-0000-0000-000000000001',
      'a5000000-0000-0000-0000-000000000002'
    )
  ),
  0,
  'an unpublished service/location pairing returns no candidates'
);

update app.catalog_services
set assignment_mode = 'customer_choice'
where id = 'a7200000-0000-0000-0000-000000000001';
select is(
  (
    select count(*)::integer
    from api_v1.get_assignment_candidates_v1(
      'a7200000-0000-0000-0000-000000000001',
      'a5000000-0000-0000-0000-000000000001'
    )
    where staff_id is not null
  ),
  2,
  'customer_choice returns all valid customer-safe staff choices'
);

update app.catalog_services
set assignment_mode = 'round_robin'
where id = 'a7200000-0000-0000-0000-000000000001';
select results_eq(
  $$
    select staff_id, candidate_rank
    from api_v1.get_assignment_candidates_v1(
      'a7200000-0000-0000-0000-000000000001',
      'a5000000-0000-0000-0000-000000000001'
    )
    where staff_id is not null
    order by candidate_rank
  $$,
  $$ values
    ('a8000000-0000-0000-0000-000000000002'::uuid, 1),
    ('a8000000-0000-0000-0000-000000000001'::uuid, 2)
  $$,
  'round_robin ranks 2/40 ahead of 1/10 instead of comparing raw counts'
);

insert into app.staff_profiles (
  id, tenant_id, public_name, offered_hours_per_week
) values
  ('a8000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'Zed Staff', 40),
  ('a8000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'Aaron Staff', 40);
insert into app.staff_services (tenant_id, staff_id, service_id) values
  ('a0000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000010', 'a7200000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000011', 'a7200000-0000-0000-0000-000000000001');
insert into app.staff_locations (tenant_id, staff_id, location_id) values
  ('a0000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000010', 'a5000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000011', 'a5000000-0000-0000-0000-000000000001');
insert into app.staff_service_locations (
  tenant_id, staff_id, service_id, location_id
) values
  ('a0000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000010', 'a7200000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000011', 'a7200000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001');
select results_eq(
  $$
    select staff_id, candidate_rank
    from api_v1.get_assignment_candidates_v1(
      'a7200000-0000-0000-0000-000000000001',
      'a5000000-0000-0000-0000-000000000001'
    )
    where staff_id in (
      'a8000000-0000-0000-0000-000000000010',
      'a8000000-0000-0000-0000-000000000011'
    )
    order by candidate_rank
  $$,
  $$ values
    ('a8000000-0000-0000-0000-000000000010'::uuid, 1),
    ('a8000000-0000-0000-0000-000000000011'::uuid, 2)
  $$,
  'round_robin breaks equal normalized load and assignment age by staff UUID'
);

update app.catalog_services
set assignment_mode = 'fixed_staff',
    fixed_staff_id = 'a8000000-0000-0000-0000-000000000001'
where id = 'a7200000-0000-0000-0000-000000000001';
select results_eq(
  $$
    select staff_id
    from api_v1.get_assignment_candidates_v1(
      'a7200000-0000-0000-0000-000000000001',
      'a5000000-0000-0000-0000-000000000001'
    )
    where staff_id is not null
  $$,
  $$ values ('a8000000-0000-0000-0000-000000000001'::uuid) $$,
  'fixed_staff exposes only the configured eligible staff profile'
);
select is(
  (
    select count(*)::integer
    from api_v1.get_assignment_candidates_v1(
      'a7200000-0000-0000-0000-000000000001',
      'a5000000-0000-0000-0000-000000000001'
    )
    where resource_id = 'a8200000-0000-0000-0000-000000000003'
  ),
  0,
  'maintenance resources are never public candidates'
);

-- This is a genuinely signed-out database role and JWT context.
reset role;
select set_config('request.jwt.claims', '{}', true);
set local role anon;
select is(
  (
    select count(*)::integer
    from api_v1.get_assignment_candidates_v1(
      'a7200000-0000-0000-0000-000000000001',
      'a5000000-0000-0000-0000-000000000001'
    )
    where staff_name = 'Alex Staff'
  ),
  1,
  'anonymous caller receives the minimal current-publication candidate DTO'
);
select throws_like(
  $$ select * from app.staff_profiles $$,
  '%permission denied%',
  'anonymous caller cannot read the raw staff table'
);
select throws_like(
  $$ select * from app.resources $$,
  '%permission denied%',
  'anonymous caller cannot read the raw resource table'
);
select throws_like(
  $$ select * from app.assignment_allocations $$,
  '%permission denied%',
  'anonymous caller cannot read allocation history or fairness inputs'
);

-- Location managers can change exact eligibility only inside their assigned
-- location. Tenant-wide deactivation remains an administrator operation.
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal2"}',
  true
);
set local role authenticated;
select lives_ok(
  $$
    select * from api_v1.set_staff_service_location_eligibility_v1(
      'a0000000-0000-0000-0000-000000000001',
      'a8000000-0000-0000-0000-000000000003',
      'a7200000-0000-0000-0000-000000000001',
      'a5000000-0000-0000-0000-000000000001',
      true,
      'a8400000-0000-0000-0000-000000000001',
      'Assign to Downtown'
    )
  $$,
  'location manager can enable staff eligibility in an assigned location'
);
select lives_ok(
  $$
    select * from api_v1.set_staff_service_location_eligibility_v1(
      'a0000000-0000-0000-0000-000000000001',
      'a8000000-0000-0000-0000-000000000003',
      'a7200000-0000-0000-0000-000000000001',
      'a5000000-0000-0000-0000-000000000001',
      false,
      'a8400000-0000-0000-0000-000000000009',
      'Remove temporary Downtown assignment'
    )
  $$,
  'location manager can disable unused staff eligibility in an assigned location'
);
select throws_like(
  $$
    select * from api_v1.set_staff_service_location_eligibility_v1(
      'a0000000-0000-0000-0000-000000000001',
      'a8000000-0000-0000-0000-000000000003',
      'a7200000-0000-0000-0000-000000000001',
      'a5000000-0000-0000-0000-000000000002',
      true,
      'a8400000-0000-0000-0000-000000000002',
      'Out of scope'
    )
  $$,
  '%staff_authorization_required%',
  'location manager cannot change eligibility outside assigned locations'
);
select throws_like(
  $$
    select * from api_v1.deactivate_staff_v1(
      'a0000000-0000-0000-0000-000000000001',
      'a8000000-0000-0000-0000-000000000003',
      'defer',
      null,
      'a8400000-0000-0000-0000-000000000003',
      'Tenant-wide action'
    )
  $$,
  '%staff_authorization_required%',
  'location manager cannot invoke tenant-wide staff deactivation'
);
select throws_like(
  $$ insert into app.staff_profiles(id, tenant_id, public_name) values
     ('a8000000-0000-0000-0000-000000000099', 'a0000000-0000-0000-0000-000000000001', 'Bypass') $$,
  '%permission denied%',
  'authenticated clients cannot bypass management RPCs with direct writes'
);

-- Administrator deactivation checks exact service/location eligibility, uses
-- lock-safe payload-aware idempotency, and records complete redacted evidence.
reset role;
insert into app.assignment_allocations (
  id, tenant_id, service_id, location_id, staff_id, starts_at, ends_at, state
) values (
  'a8300000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',
  'a8000000-0000-0000-0000-000000000001',
  statement_timestamp() + interval '1 day',
  statement_timestamp() + interval '1 day 1 hour',
  'confirmed'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',
  true
);
set local role authenticated;
select throws_like(
  $$
    select * from api_v1.deactivate_staff_v1(
      'a0000000-0000-0000-0000-000000000001',
      'a8000000-0000-0000-0000-000000000001',
      'reassign',
      'a8000000-0000-0000-0000-000000000003',
      'a8400000-0000-0000-0000-000000000004',
      'No matching eligibility'
    )
  $$,
  '%replacement_staff_ineligible%',
  'staff reassignment rejects a replacement missing exact service/location eligibility'
);
select is(
  (
    select outcome
    from api_v1.deactivate_staff_v1(
      'a0000000-0000-0000-0000-000000000001',
      'a8000000-0000-0000-0000-000000000001',
      'reassign',
      'a8000000-0000-0000-0000-000000000002',
      'a8400000-0000-0000-0000-000000000005',
      'Planned leave'
    )
  ),
  'reassigned',
  'eligible staff replacement resolves every future allocation'
);
select is(
  (
    select outcome
    from api_v1.deactivate_staff_v1(
      'a0000000-0000-0000-0000-000000000001',
      'a8000000-0000-0000-0000-000000000001',
      'reassign',
      'a8000000-0000-0000-0000-000000000002',
      'a8400000-0000-0000-0000-000000000005',
      'Planned leave'
    )
  ),
  'reassigned',
  'same request key and payload returns the original result'
);
select throws_like(
  $$
    select * from api_v1.deactivate_staff_v1(
      'a0000000-0000-0000-0000-000000000001',
      'a8000000-0000-0000-0000-000000000001',
      'cancel',
      null,
      'a8400000-0000-0000-0000-000000000005',
      'Changed payload'
    )
  $$,
  '%idempotency_conflict%',
  'same request key with a different payload fails closed'
);
select ok(
  (
    select redacted_diff ?& array[
      'before',
      'after',
      'affected_allocations',
      'remaining_allocations',
      'replacement_staff_id',
      'resolution'
    ]
    from app.staff_resource_audit_events
    where request_id = 'a8400000-0000-0000-0000-000000000005'
  ),
  'staff deactivation audit contains complete redacted before/after evidence'
);
select ok(
  (
    select not (redacted_diff::text ilike '%internal_notes%')
    from app.staff_resource_audit_events
    where request_id = 'a8400000-0000-0000-0000-000000000005'
  ),
  'staff deactivation audit excludes internal notes'
);

reset role;
insert into app.assignment_allocations (
  id, tenant_id, service_id, location_id, resource_id, resource_type_id,
  starts_at, ends_at, state
) values (
  'a8300000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',
  'a8200000-0000-0000-0000-000000000001',
  'a8100000-0000-0000-0000-000000000001',
  statement_timestamp() + interval '2 days',
  statement_timestamp() + interval '2 days 1 hour',
  'confirmed'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',
  true
);
set local role authenticated;
select throws_like(
  $$
    select * from api_v1.deactivate_resource_v1(
      'a0000000-0000-0000-0000-000000000001',
      'a8200000-0000-0000-0000-000000000001',
      'reassign',
      'a8200000-0000-0000-0000-000000000002',
      'a8400000-0000-0000-0000-000000000006',
      'Missing location eligibility'
    )
  $$,
  '%replacement_resource_ineligible%',
  'resource reassignment rejects a replacement outside the allocation location'
);
select lives_ok(
  $$
    select * from api_v1.set_resource_location_eligibility_v1(
      'a0000000-0000-0000-0000-000000000001',
      'a8200000-0000-0000-0000-000000000002',
      'a5000000-0000-0000-0000-000000000001',
      true,
      'a8400000-0000-0000-0000-000000000007',
      'Enable replacement room'
    )
  $$,
  'tenant administrator can enable resource eligibility through the scoped RPC'
);
select is(
  (
    select outcome
    from api_v1.deactivate_resource_v1(
      'a0000000-0000-0000-0000-000000000001',
      'a8200000-0000-0000-0000-000000000001',
      'reassign',
      'a8200000-0000-0000-0000-000000000002',
      'a8400000-0000-0000-0000-000000000008',
      'Replace unavailable room'
    )
  ),
  'reassigned',
  'eligible resource replacement resolves every future allocation'
);
select ok(
  (
    select redacted_diff ?& array[
      'before',
      'after',
      'affected_allocations',
      'remaining_allocations',
      'replacement_resource_id',
      'resolution'
    ]
    from app.staff_resource_audit_events
    where request_id = 'a8400000-0000-0000-0000-000000000008'
  ),
  'resource reassignment audit contains complete redacted evidence'
);

reset role;
select throws_like(
  $$
    insert into app.assignment_allocations (
      id, tenant_id, service_id, location_id, staff_id, starts_at, ends_at
    ) values (
      'a8300000-0000-0000-0000-000000000099',
      'a0000000-0000-0000-0000-000000000001',
      'b7200000-0000-0000-0000-000000000001',
      'a5000000-0000-0000-0000-000000000001',
      'a8000000-0000-0000-0000-000000000002',
      statement_timestamp() + interval '3 days',
      statement_timestamp() + interval '3 days 1 hour'
    )
  $$,
  '%violates foreign key constraint%',
  'allocation service/location identity rejects cross-tenant links structurally'
);

select * from finish();
rollback;
