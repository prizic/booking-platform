-- Built-in roles at provisioning (ADR-0013, ADR-0019). A new tenant gets the
-- four built-in roles from the platform template; installing is idempotent;
-- every tenant's built-ins match the template exactly (no drift); and the
-- template itself obeys the catalog it is checked against.
begin;
select no_plan();

do $$ begin
  execute format('grant usage on schema %I to authenticated', pg_my_temp_schema()::regnamespace::text);
end $$;

create function pg_temp.as_operator(p_user uuid) returns void
language plpgsql as $$
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_user, 'authenticated', 'authenticated',
    'op-' || p_user::text || '@example.invalid', '', now(), '{}', '{}', now(), now())
  on conflict (id) do nothing;
  insert into control_plane.operators (auth_user_id, email, role)
  values (p_user, 'op-' || p_user::text || '@example.invalid', 'admin')
  on conflict (auth_user_id) do update set role = 'admin', disabled_at = null;
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
      'timestamp', extract(epoch from statement_timestamp())::bigint)))::text, true);
end $$;

-- Grants of one tenant's built-in role, as key:kind:scope.
create function pg_temp.builtin_grants(p_tenant uuid, p_key text) returns text[]
language sql as $$
  select coalesce(array_agg(rp.permission_key || ':' || rp.grant_kind || ':' || rp.scope_kind order by rp.permission_key), '{}')
  from app.roles r join app.role_permissions rp on rp.tenant_id = r.tenant_id and rp.role_id = r.id
  where r.tenant_id = p_tenant and r.key = p_key;
$$;
create function pg_temp.template_grants(p_key text) returns text[]
language sql as $$
  select coalesce(array_agg(g.permission_key || ':' || g.grant_kind || ':' || g.scope_kind order by g.permission_key), '{}')
  from private.builtin_role_template_grants g where g.role_key = p_key;
$$;

-- ---------------------------------------------------------------------------
-- 1. The template obeys the catalog and the mode rules.
-- ---------------------------------------------------------------------------
select is((select array_agg(role_key || ':' || location_scope_mode order by role_key) from private.builtin_role_templates),
  array['location_manager:assigned','scheduler:tenant','staff:assigned','tenant_admin:tenant'], 'four built-in templates with their modes');
select is((select count(*)::integer from private.builtin_role_template_grants g
  join app.permission_meta m on m.permission_key = g.permission_key
  where not (g.scope_kind = any (m.allowed_scopes)) or not (g.grant_kind = any (m.allowed_grant_kinds))), 0,
  'every template grant uses a scope and kind its catalog entry allows');
select is((select count(*)::integer from private.builtin_role_template_grants g
  join private.builtin_role_templates t on t.role_key = g.role_key
  where (t.location_scope_mode = 'tenant' and g.scope_kind = 'location')
     or (t.location_scope_mode = 'assigned' and g.scope_kind = 'tenant')), 0, 'every template grant fits its role''s mode');
select is((select array_agg(role_key) from private.builtin_role_template_grants where permission_key = 'role.manage'),
  array['tenant_admin'], 'only Tenant admin holds role.manage');
select is((select grant_kind || ':' || scope_kind from private.builtin_role_template_grants where permission_key = 'role.manage'),
  'approval:tenant', 'and holds it as an approval grant at tenant scope');
select is((select count(*)::integer from private.builtin_role_template_grants g join app.permission_meta m on m.permission_key = g.permission_key
  where m.reserved and g.role_key <> 'tenant_admin'), 0, 'reserved keys appear only on the administrator template');
select is((select array_agg(role_key || '=' || n order by role_key) from (
  select role_key, count(*) n from private.builtin_role_template_grants group by role_key) x),
  array['location_manager=18','scheduler=15','staff=11','tenant_admin=31'], 'template sizes');

-- ---------------------------------------------------------------------------
-- 2. No drift: every seeded tenant's built-ins equal the template.
-- ---------------------------------------------------------------------------
select is(pg_temp.builtin_grants(t.id, b.role_key), pg_temp.template_grants(b.role_key),
  format('tenant %s: %s matches the template', t.name, b.role_key))
from app.tenants t cross join private.builtin_role_templates b
where t.id in ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001')
order by t.name, b.role_key;
select is((select array_agg(r.tenant_id::text || ':' || r.key || ':' || r.location_scope_mode order by r.tenant_id, r.key) from app.roles r
  join private.builtin_role_templates b on b.role_key = r.key and b.location_scope_mode <> r.location_scope_mode), null,
  'no tenant''s built-in role has drifted from its template mode');

-- ---------------------------------------------------------------------------
-- 3. A newly created tenant gets the template.
-- ---------------------------------------------------------------------------
select pg_temp.as_operator('c0000000-0000-0000-0000-0000000000f1');
set local role authenticated;
select set_config('test.t1', (select tenant_id::text from api_v1.create_tenant_v2('Roles Clinic', 'roles-clinic', 'roles-clinic-create-0001')), true);
reset role;
select is((select array_agg(key || ':' || location_scope_mode order by key) from app.roles where tenant_id = current_setting('test.t1')::uuid),
  array['location_manager:assigned','scheduler:tenant','staff:assigned','tenant_admin:tenant'], 'a new tenant has the four built-in roles');
select is(pg_temp.builtin_grants(current_setting('test.t1')::uuid, b.role_key), pg_temp.template_grants(b.role_key),
  'new tenant: ' || b.role_key || ' matches the template')
from private.builtin_role_templates b order by b.role_key;
select ok((select bool_and(is_builtin and revision = 1 and archived_at is null and name_en is null) from app.roles
  where tenant_id = current_setting('test.t1')::uuid), 'its built-ins are locked, unnamed and unarchived');
select is((select count(*)::integer from app.role_change_events where tenant_id = current_setting('test.t1')::uuid), 0,
  'installing is not a tenant role change');
select is(private.install_builtin_roles_v1(current_setting('test.t1')::uuid), 0, 'installing again changes nothing');
select is((select count(*)::integer from app.role_permissions where tenant_id = current_setting('test.t1')::uuid), 75, 'and leaves exactly the template');
select is(private.install_builtin_roles_v1('f0000000-0000-4000-8000-00000000dead'), 0, 'an unknown tenant installs nothing');

-- create_tenant_v1 (the operator API's first path) installs too.
select pg_temp.as_operator('c0000000-0000-0000-0000-0000000000f1');
set local role authenticated;
select set_config('test.t2', (select tenant_id::text from api_v1.create_tenant_v1('Roles Clinic Two', 'roles-clinic-two')), true);
reset role;
select is((select count(*)::integer from app.roles where tenant_id = current_setting('test.t2')::uuid and is_builtin), 4, 'create_tenant_v1 installs the built-ins');

-- ---------------------------------------------------------------------------
-- 4. Installing on an existing tenant preserves access: a pre-existing built-in
--    keeps its grants and only gains role.manage where the template has it.
-- ---------------------------------------------------------------------------
insert into app.tenants (id, name) values ('f0e00000-0000-4000-8000-000000000001', 'Legacy tenant');
insert into app.roles (id, tenant_id, key, location_scope_mode)
values ('f2e00000-0000-4000-8000-000000000001', 'f0e00000-0000-4000-8000-000000000001', 'tenant_admin', 'tenant'),
       ('f2e00000-0000-4000-8000-000000000002', 'f0e00000-0000-4000-8000-000000000001', 'staff', 'assigned');
insert into app.role_permissions (tenant_id, role_id, permission_key, grant_kind, scope_kind)
values ('f0e00000-0000-4000-8000-000000000001', 'f2e00000-0000-4000-8000-000000000001', 'booking.view.any', 'direct', 'tenant'),
       ('f0e00000-0000-4000-8000-000000000001', 'f2e00000-0000-4000-8000-000000000001', 'staff.manage', 'direct', 'tenant');
select is(private.install_builtin_roles_v1('f0e00000-0000-4000-8000-000000000001'), 1 + 15 + 18, 'missing roles get their template, the admin gets role.manage');
select is(pg_temp.builtin_grants('f0e00000-0000-4000-8000-000000000001', 'tenant_admin'),
  array['booking.view.any:direct:tenant','role.manage:approval:tenant','staff.manage:direct:tenant'],
  'an existing administrator role gains role.manage and nothing else');
select is(pg_temp.builtin_grants('f0e00000-0000-4000-8000-000000000001', 'staff'), array[]::text[],
  'an existing built-in keeps exactly the grants it had');
select is(pg_temp.builtin_grants('f0e00000-0000-4000-8000-000000000001', 'scheduler'), pg_temp.template_grants('scheduler'),
  'a missing built-in is created from the template');

select * from finish();
rollback;
