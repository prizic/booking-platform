begin;
select no_plan();

select has_function(
  'api_v1'::name,
  'get_staff_resource_workspace_v1'::name,
  array['uuid']::name[]
);
select has_function(
  'api_v1'::name,
  'get_staff_resource_choices_v1'::name,
  array['uuid', 'text']::name[]
);
select has_function(
  'private'::name,
  'get_staff_resource_choices_v1'::name,
  array['uuid', 'text']::name[]
);
select ok(
  not (
    select procedure.prosecdef
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'api_v1'
      and procedure.proname = 'get_staff_resource_choices_v1'
  ),
  'the exposed choices RPC is SECURITY INVOKER'
);
select ok(
  (
    select procedure.prosecdef
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'private'
      and procedure.proname = 'get_staff_resource_choices_v1'
  ),
  'the narrow choice projector is SECURITY DEFINER'
);
select ok(
  has_function_privilege(
    'authenticated',
    'api_v1.get_staff_resource_workspace_v1(uuid)',
    'execute'
  ),
  'authenticated operators may call the workspace RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'api_v1.get_staff_resource_workspace_v1(uuid)',
    'execute'
  ),
  'anonymous callers cannot call the management workspace RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'private.get_staff_resource_choices_v1(uuid,text)',
    'execute'
  ),
  'anonymous callers cannot execute the private choice projector'
);
select ok(
  not has_table_privilege('authenticated', 'app.resources', 'insert'),
  'authenticated callers cannot insert resources outside a versioned RPC'
);
select ok(
  not has_table_privilege('authenticated', 'app.assignment_allocations', 'update'),
  'authenticated callers cannot mutate allocations outside a versioned RPC'
);

insert into app.staff_profiles (id, tenant_id, public_name, internal_notes)
values
  (
    'a8000000-0000-0000-0000-000000000011',
    'a0000000-0000-0000-0000-000000000001',
    'Workspace Staff',
    'editable tenant note'
  ),
  (
    'a8000000-0000-0000-0000-000000000012',
    'a0000000-0000-0000-0000-000000000001',
    'Other Location Staff',
    'out of location scope'
  );
insert into app.staff_services (tenant_id, staff_id, service_id)
values (
  'a0000000-0000-0000-0000-000000000001',
  'a8000000-0000-0000-0000-000000000011',
  'a7200000-0000-0000-0000-000000000001'
);
insert into app.staff_locations (tenant_id, staff_id, location_id)
values
  (
    'a0000000-0000-0000-0000-000000000001',
    'a8000000-0000-0000-0000-000000000011',
    'a5000000-0000-0000-0000-000000000001'
  ),
  (
    'a0000000-0000-0000-0000-000000000001',
    'a8000000-0000-0000-0000-000000000012',
    'a5000000-0000-0000-0000-000000000002'
  );
insert into app.staff_service_locations (
  tenant_id, staff_id, service_id, location_id
) values (
  'a0000000-0000-0000-0000-000000000001',
  'a8000000-0000-0000-0000-000000000011',
  'a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001'
);
insert into app.resource_types (id, tenant_id, key, name)
values (
  'a8100000-0000-0000-0000-000000000011',
  'a0000000-0000-0000-0000-000000000001',
  'workspace-room',
  'Workspace Room'
);
insert into app.resources (
  id,
  tenant_id,
  resource_type_id,
  key,
  public_name,
  internal_notes
)
values
  (
    'a8200000-0000-0000-0000-000000000011',
    'a0000000-0000-0000-0000-000000000001',
    'a8100000-0000-0000-0000-000000000011',
    'workspace-room-one',
    'Workspace Room One',
    'editable tenant note'
  ),
  (
    'a8200000-0000-0000-0000-000000000012',
    'a0000000-0000-0000-0000-000000000001',
    'a8100000-0000-0000-0000-000000000011',
    'workspace-room-two',
    'Workspace Room Two',
    'out of location scope'
  );
insert into app.resource_locations (tenant_id, resource_id, location_id)
values
  (
    'a0000000-0000-0000-0000-000000000001',
    'a8200000-0000-0000-0000-000000000011',
    'a5000000-0000-0000-0000-000000000001'
  ),
  (
    'a0000000-0000-0000-0000-000000000001',
    'a8200000-0000-0000-0000-000000000012',
    'a5000000-0000-0000-0000-000000000002'
  );

insert into app.catalog_service_revisions (
  id, tenant_id, service_id, revision, locale, state, name, description,
  canonical_path, duration_minutes, price_minor, currency, intake_schema
) values (
  'a7210000-0000-0000-0000-000000000099',
  'a0000000-0000-0000-0000-000000000001',
  'a7200000-0000-0000-0000-000000000001',
  2,
  'en',
  'draft',
  'Unpublished service name',
  '',
  '/services/initial-consultation',
  45,
  18000,
  'SAR',
  '{"fields":[]}'::jsonb
);
insert into app.resource_requirements (tenant_id, service_id, resource_type_id)
values (
  'a0000000-0000-0000-0000-000000000001',
  'a7200000-0000-0000-0000-000000000001',
  'a8100000-0000-0000-0000-000000000011'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',
  true
);
set local role authenticated;

select is(
  (
    select count(*)::integer
    from api_v1.get_staff_resource_workspace_v1(
      'a0000000-0000-0000-0000-000000000001'
    )
  ),
  5,
  'tenant administrator receives staff and resource rows across the tenant'
);
select is(
  (
    select count(*)::integer
    from api_v1.get_staff_resource_workspace_v1(
      'a0000000-0000-0000-0000-000000000001'
    )
    where tenant_id <> 'a0000000-0000-0000-0000-000000000001'
  ),
  0,
  'the RPC never returns a different tenant'
);
select is(
  (
    select location_ids
    from api_v1.get_staff_resource_workspace_v1(
      'a0000000-0000-0000-0000-000000000001'
    )
    where item_id = 'a8000000-0000-0000-0000-000000000011'
  ),
  array['a5000000-0000-0000-0000-000000000001'::uuid],
  'staff location eligibility is explicit in the workspace DTO'
);
select ok(
  (
    select revision = 1 and internal_notes = 'editable tenant note'
    from api_v1.get_staff_resource_workspace_v1(
      'a0000000-0000-0000-0000-000000000001'
    )
    where item_id = 'a8000000-0000-0000-0000-000000000011'
  ),
  'tenant editors receive current revision and editable values'
);
select ok(
  (
    select revision = 1
      and item_key = 'workspace-room-one'
      and internal_notes = 'editable tenant note'
      and resource_type_id = 'a8100000-0000-0000-0000-000000000011'
    from api_v1.get_staff_resource_workspace_v1(
      'a0000000-0000-0000-0000-000000000001'
    )
    where item_id = 'a8200000-0000-0000-0000-000000000011'
  ),
  'tenant catalog editors receive current resource edit values'
);
select is(
  (
    select choice_name
    from api_v1.get_staff_resource_choices_v1(
      'a0000000-0000-0000-0000-000000000001',
      'en'
    )
    where choice_kind = 'service'
      and choice_id = 'a7200000-0000-0000-0000-000000000001'
  ),
  'Initial consultation',
  'service choices use the current published localized name, never a draft'
);
select throws_like(
  $$
    select *
    from api_v1.get_staff_resource_workspace_v1(
      'b0000000-0000-0000-0000-000000000001'
    )
  $$,
  '%staff_resource_authorization_required%',
  'a tenant administrator cannot select another tenant workspace'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;
select throws_like(
  $$
    select *
    from api_v1.get_staff_resource_workspace_v1(
      'a0000000-0000-0000-0000-000000000001'
    )
  $$,
  '%staff_resource_authorization_required%',
  'another tenant receives no staff or resource data'
);
select throws_like(
  $$
    select *
    from private.get_staff_resource_choices_v1(
      'a0000000-0000-0000-0000-000000000001',
      'en'
    )
  $$,
  '%staff_resource_authorization_required%',
  'the private choice helper independently rejects another tenant'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal2"}',
  true
);
set local role authenticated;
select is(
  (
    select count(*)::integer
    from api_v1.get_staff_resource_workspace_v1(
      'a0000000-0000-0000-0000-000000000001'
    )
  ),
  2,
  'location manager receives only staff and resources linked to the assigned location'
);
select ok(
  not exists (
    select 1
    from api_v1.get_staff_resource_workspace_v1(
      'a0000000-0000-0000-0000-000000000001'
    )
    where item_id in (
      'a8000000-0000-0000-0000-000000000012',
      'a8200000-0000-0000-0000-000000000012'
    )
  ),
  'location manager cannot read rows linked only to another location'
);
select ok(
  not exists (
    select 1
    from api_v1.get_staff_resource_workspace_v1(
      'a0000000-0000-0000-0000-000000000001'
    )
    where item_kind = 'staff'
      and (
        revision is not null
        or membership_id is not null
        or public_bio is not null
        or internal_notes is not null
        or offered_hours_per_week is not null
      )
  ),
  'location manager receives no tenant-only staff edit values'
);
select ok(
  not exists (
    select 1
    from api_v1.get_staff_resource_workspace_v1(
      'a0000000-0000-0000-0000-000000000001'
    )
    where item_kind = 'resource'
      and (
        revision is not null
        or item_key is not null
        or internal_notes is not null
        or resource_type_id is not null
      )
  ),
  'location manager receives no tenant-only resource edit values'
);
select is(
  (
    select count(*)::integer
    from private.get_staff_resource_choices_v1(
      'a0000000-0000-0000-0000-000000000001',
      'en'
    )
    where choice_kind = 'resource_type'
  ),
  0,
  'location manager receives no tenant-only resource type edit choices'
);
select results_eq(
  $$
    select choice_id
    from private.get_staff_resource_choices_v1(
      'a0000000-0000-0000-0000-000000000001',
      'en'
    )
    where choice_kind = 'location'
    order by choice_id
  $$,
  $$ values ('a5000000-0000-0000-0000-000000000001'::uuid) $$,
  'the private helper returns only exact assigned location choices'
);
select throws_like(
  $$
    select *
    from private.deactivate_staff_v1(
      'a0000000-0000-0000-0000-000000000001',
      'a8000000-0000-0000-0000-000000000011',
      'defer',
      null,
      gen_random_uuid(),
      'location manager must not mutate tenant-wide'
    )
  $$,
  '%staff_authorization_required%',
  'the private staff helper independently rejects location-scoped callers'
);
select throws_like(
  $$
    select *
    from private.deactivate_resource_v1(
      'a0000000-0000-0000-0000-000000000001',
      'a8200000-0000-0000-0000-000000000011',
      'defer',
      null,
      gen_random_uuid(),
      'location manager must not mutate tenant-wide'
    )
  $$,
  '%resource_authorization_required%',
  'the private resource helper independently rejects location-scoped callers'
);

reset role;
set local role anon;
select is(
  (
    select count(*)::integer
    from api_v1.get_assignment_candidates_v1(
      'a7200000-0000-0000-0000-000000000001',
      'a5000000-0000-0000-0000-000000000001'
    )
    where staff_id = 'a8000000-0000-0000-0000-000000000011'
  ),
  1,
  'the invoker API wrapper still returns published assignment candidates to anonymous callers'
);

reset role;
select * from finish();
rollback;
