begin;

select plan(45);

select has_table('app'::name, 'tenants'::name);
select has_table('app'::name, 'permissions'::name);
select has_table('app'::name, 'brands'::name);
select has_table('app'::name, 'brand_revisions'::name);
select has_table('app'::name, 'instances'::name);
select has_table('app'::name, 'tenant_domains'::name);
select has_table('app'::name, 'tenant_settings'::name);
select has_table('app'::name, 'locations'::name);
select has_table('app'::name, 'roles'::name);
select has_table('app'::name, 'role_permissions'::name);
select has_table('app'::name, 'memberships'::name);
select has_table('app'::name, 'membership_location_scopes'::name);
select has_table('app'::name, 'invitations'::name);
select has_table('app'::name, 'invitation_location_scopes'::name);

select col_not_null('app'::name, 'brands'::name, 'tenant_id'::name);
select col_not_null('app'::name, 'brand_revisions'::name, 'tenant_id'::name);
select col_not_null('app'::name, 'instances'::name, 'tenant_id'::name);
select col_not_null('app'::name, 'tenant_domains'::name, 'tenant_id'::name);
select col_not_null('app'::name, 'tenant_settings'::name, 'tenant_id'::name);
select col_not_null('app'::name, 'locations'::name, 'tenant_id'::name);
select col_not_null('app'::name, 'roles'::name, 'tenant_id'::name);
select col_not_null('app'::name, 'role_permissions'::name, 'tenant_id'::name);
select col_not_null('app'::name, 'memberships'::name, 'tenant_id'::name);
select col_not_null('app'::name, 'membership_location_scopes'::name, 'tenant_id'::name);
select col_not_null('app'::name, 'invitations'::name, 'tenant_id'::name);
select col_not_null('app'::name, 'invitation_location_scopes'::name, 'tenant_id'::name);

select ok(
  not exists (
    select 1
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'app'
      and relation.relkind in ('r', 'p')
      and not relation.relrowsecurity
  ),
  'every app table has RLS enabled'
);

select ok(
  not exists (
    select 1
    from (
      select relation.relname as table_name, command.cmd
      from pg_class as relation
      join pg_namespace as namespace on namespace.oid = relation.relnamespace
      cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as command(cmd)
      where namespace.nspname = 'app'
        and relation.relkind in ('r', 'p')
    ) as required
    where not exists (
      select 1
      from pg_policies as policy
      where policy.schemaname = 'app'
        and policy.tablename = required.table_name
        and policy.cmd = required.cmd
    )
  ),
  'every app table has an explicit policy for every CRUD operation'
);

select ok(
  not exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'api_v1'
      and procedure.proname <> 'get_public_catalog_v1'
      and procedure.prosecdef
  ),
  'no exposed api_v1 function is SECURITY DEFINER'
);

select is(
  (
    select count(*)::integer
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'private'
      and procedure.prosecdef
  ),
  7,
  'exactly seven narrow private policy helpers use SECURITY DEFINER'
);

select ok(
  not exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('private', 'api_v1')
      and coalesce(array_to_string(procedure.proconfig, ','), '') not like '%search_path=%'
  ),
  'all private and api_v1 functions pin their search path'
);

select ok(
  has_function_privilege('anon', 'api_v1.resolve_public_tenant_v1(text,text)', 'EXECUTE'),
  'anonymous can execute only the public tenant resolver'
);
select ok(
  not has_function_privilege('anon', 'api_v1.list_tenant_choices_v1()', 'EXECUTE')
    and not has_function_privilege('anon', 'api_v1.get_dashboard_context_v1(uuid)', 'EXECUTE'),
  'anonymous cannot execute authenticated tenant-context functions'
);
select ok(
  has_function_privilege('authenticated', 'api_v1.resolve_public_tenant_v1(text,text)', 'EXECUTE')
    and has_function_privilege('authenticated', 'api_v1.list_tenant_choices_v1()', 'EXECUTE')
    and has_function_privilege('authenticated', 'api_v1.get_dashboard_context_v1(uuid)', 'EXECUTE'),
  'authenticated callers have the three intended api_v1 execute grants'
);
select ok(
  not has_function_privilege('service_role', 'api_v1.resolve_public_tenant_v1(text,text)', 'EXECUTE')
    and not has_function_privilege('service_role', 'api_v1.list_tenant_choices_v1()', 'EXECUTE')
    and not has_function_privilege('service_role', 'api_v1.get_dashboard_context_v1(uuid)', 'EXECUTE'),
  'generic service_role receives no implicit tenant RPC surface'
);
select ok(
  (select role.rolbypassrls from pg_roles as role where role.rolname = 'service_role'),
  'service_role is recognized as a trusted bypass boundary, not an application worker identity'
);
select ok(
  not exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'api_v1'
      and procedure.proname like '%worker%'
  ),
  'issue 6 exposes no worker-facing RPC before a narrow audited worker contract exists'
);

select ok(
  not has_table_privilege('anon', 'app.memberships', 'SELECT'),
  'anonymous has no membership table grant'
);
select ok(
  not has_schema_privilege('service_role', 'app', 'USAGE')
    and not has_table_privilege('service_role', 'app.memberships', 'SELECT')
    and not has_table_privilege('service_role', 'app.memberships', 'INSERT')
    and not has_table_privilege('service_role', 'app.memberships', 'UPDATE')
    and not has_table_privilege('service_role', 'app.memberships', 'DELETE'),
  'generic service_role receives no implicit tenant-table access'
);
select ok(
  has_table_privilege('authenticated', 'app.memberships', 'SELECT')
    and not has_table_privilege('authenticated', 'app.memberships', 'INSERT')
    and not has_table_privilege('authenticated', 'app.memberships', 'UPDATE')
    and not has_table_privilege('authenticated', 'app.memberships', 'DELETE'),
  'authenticated membership access is read-only beneath the API layer'
);
select ok(
  has_table_privilege('authenticated', 'app.invitations', 'SELECT')
    and has_table_privilege('authenticated', 'app.invitations', 'INSERT')
    and has_table_privilege('authenticated', 'app.invitations', 'UPDATE')
    and has_table_privilege('authenticated', 'app.invitations', 'DELETE'),
  'invitation CRUD has an explicit authenticated grant and remains RLS constrained'
);
select ok(
  has_table_privilege('authenticated', 'app.tenant_settings', 'SELECT')
    and has_table_privilege('authenticated', 'app.tenant_settings', 'UPDATE')
    and not has_table_privilege('authenticated', 'app.tenant_settings', 'INSERT')
    and not has_table_privilege('authenticated', 'app.tenant_settings', 'DELETE'),
  'tenant settings expose only read and constrained update grants'
);

select ok(
  not exists (
    select 1
    from pg_publication_tables
    where schemaname = 'app'
  ),
  'no tenant table is published to Realtime by the identity foundation'
);
select hasnt_table('api_v1'::name, 'storage_objects'::name, 'the API has no Storage placeholder table');
select hasnt_table('api_v1'::name, 'realtime_messages'::name, 'the API has no Realtime placeholder table');

select * from finish();
rollback;
