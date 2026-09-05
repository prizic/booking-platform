begin;

select plan(45);

select has_table('app', 'tenants');
select has_table('app', 'permissions');
select has_table('app', 'brands');
select has_table('app', 'brand_revisions');
select has_table('app', 'instances');
select has_table('app', 'tenant_domains');
select has_table('app', 'tenant_settings');
select has_table('app', 'locations');
select has_table('app', 'roles');
select has_table('app', 'role_permissions');
select has_table('app', 'memberships');
select has_table('app', 'membership_location_scopes');
select has_table('app', 'invitations');
select has_table('app', 'invitation_location_scopes');

select col_not_null('app', 'brands', 'tenant_id');
select col_not_null('app', 'brand_revisions', 'tenant_id');
select col_not_null('app', 'instances', 'tenant_id');
select col_not_null('app', 'tenant_domains', 'tenant_id');
select col_not_null('app', 'tenant_settings', 'tenant_id');
select col_not_null('app', 'locations', 'tenant_id');
select col_not_null('app', 'roles', 'tenant_id');
select col_not_null('app', 'role_permissions', 'tenant_id');
select col_not_null('app', 'memberships', 'tenant_id');
select col_not_null('app', 'membership_location_scopes', 'tenant_id');
select col_not_null('app', 'invitations', 'tenant_id');
select col_not_null('app', 'invitation_location_scopes', 'tenant_id');

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
  5,
  'exactly five narrow private policy helpers use SECURITY DEFINER'
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
select hasnt_table('api_v1', 'storage_objects', 'the API has no Storage placeholder table');
select hasnt_table('api_v1', 'realtime_messages', 'the API has no Realtime placeholder table');

select * from finish();
rollback;
