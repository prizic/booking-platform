begin;
select plan(12);

select has_function(
  'api_v1'::name,
  'get_staff_resource_workspace_v1'::name,
  array['uuid']::name[]
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
  not has_table_privilege('authenticated', 'app.resources', 'insert'),
  'authenticated callers cannot insert resources outside a versioned RPC'
);
select ok(
  not has_table_privilege('authenticated', 'app.assignment_allocations', 'update'),
  'authenticated callers cannot mutate allocations outside a versioned RPC'
);

insert into app.staff_profiles (id, tenant_id, public_name, internal_notes)
values (
  'a8000000-0000-0000-0000-000000000011',
  'a0000000-0000-0000-0000-000000000001',
  'Workspace Staff',
  'must not escape'
);
insert into app.staff_services (tenant_id, staff_id, service_id)
values (
  'a0000000-0000-0000-0000-000000000001',
  'a8000000-0000-0000-0000-000000000011',
  'a7200000-0000-0000-0000-000000000001'
);
insert into app.staff_locations (tenant_id, staff_id, location_id)
values (
  'a0000000-0000-0000-0000-000000000001',
  'a8000000-0000-0000-0000-000000000011',
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
values (
  'a8200000-0000-0000-0000-000000000011',
  'a0000000-0000-0000-0000-000000000001',
  'a8100000-0000-0000-0000-000000000011',
  'workspace-room-one',
  'Workspace Room One',
  'must not escape'
);
insert into app.resource_locations (tenant_id, resource_id, location_id)
values (
  'a0000000-0000-0000-0000-000000000001',
  'a8200000-0000-0000-0000-000000000011',
  'a5000000-0000-0000-0000-000000000001'
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
  2,
  'tenant administrator receives staff and resource rows'
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
    where item_kind = 'staff'
  ),
  array['a5000000-0000-0000-0000-000000000001'::uuid],
  'staff location eligibility is explicit in the workspace DTO'
);
select ok(
  not exists (
    select 1
    from jsonb_object_keys(
      to_jsonb(
        (
          select row_value
          from api_v1.get_staff_resource_workspace_v1(
            'a0000000-0000-0000-0000-000000000001'
          ) as row_value
          limit 1
        )
      )
    ) as field(key)
    where field.key in ('internal_notes', 'membership_id')
  ),
  'workspace DTO excludes notes and Auth membership identifiers'
);
select throws_like(
  $$
    select *
    from api_v1.get_staff_resource_workspace_v1(
      'b0000000-0000-0000-0000-000000000001'
    )
  $$,
  '%staff_authorization_required%',
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
  '%staff_authorization_required%',
  'another tenant receives no staff or resource data'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal2"}',
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
  '%staff_authorization_required%',
  'location-scoped authority is not widened to tenant management'
);

reset role;
select * from finish();
rollback;
