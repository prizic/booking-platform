-- Tenant custom roles (ADR-0019): the data model, the role RPCs, idempotency,
-- revisions, the append-only ledger and its RLS, in both directions and across
-- tenants.
begin;
select no_plan();

do $$ begin
  execute format('grant usage on schema %I to authenticated', pg_my_temp_schema()::regnamespace::text);
end $$;

-- Claims for a user. p_age is how long ago the TOTP step-up happened; null
-- means a single-factor (aal1) session.
create function pg_temp.claims(p_user uuid, p_age integer default 0) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user, 'role', 'authenticated',
    'aal', case when p_age is null then 'aal1' else 'aal2' end,
    'amr', case when p_age is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'method', 'totp', 'timestamp', extract(epoch from statement_timestamp())::bigint - p_age)) end)::text, true);
$$;

-- The error a statement raises, as sqlstate:message:detail.
create function pg_temp.error_of(p_sql text) returns text
language plpgsql as $$
declare v_detail text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return sqlstate || ':' || sqlerrm || ':' || coalesce(v_detail, '');
end $$;

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
select has_table('app'::name, 'permission_meta'::name);
select has_table('app'::name, 'role_change_events'::name);
select col_not_null('app'::name, 'role_change_events'::name, 'tenant_id'::name);
select ok((select relrowsecurity from pg_class where oid = 'app.permission_meta'::regclass), 'permission catalog has RLS');
select ok((select relrowsecurity from pg_class where oid = 'app.role_change_events'::regclass), 'role ledger has RLS');
select is((select attgenerated::text from pg_attribute where attrelid = 'app.roles'::regclass and attname = 'is_builtin'),
  's', 'is_builtin is a stored generated column, never written by a caller');
select is((select count(*)::integer from app.permissions p where not exists (
    select 1 from app.permission_meta m where m.permission_key = p.key)), 0, 'every permission has catalog metadata');
select is((select array_agg(permission_key order by permission_key) from app.permission_meta where reserved),
  array['billing.change_plan','billing.view','role.manage','support.grant_access','tenant.owner_transfer','tenant.read_other_tenant'],
  'exactly the owner-level keys are reserved');
select ok(exists (select 1 from app.permissions where key = 'role.manage'), 'role.manage is a catalog permission');

-- Built-ins and custom keys.
select is((select count(*)::integer from app.roles where tenant_id = 'a0000000-0000-0000-0000-000000000001' and is_builtin), 4,
  'Tenant A has its four built-in roles');
select throws_like($$insert into app.roles (id, tenant_id, key, location_scope_mode, name_en, name_ar)
  values ('a2c00000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'owner', 'tenant', 'Owner', 'مالك')$$,
  '%roles_key_check%', 'a free-form role key is refused');
select throws_like($$insert into app.roles (id, tenant_id, key, location_scope_mode)
  values ('a2c00000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'custom_0123456789abcdef', 'tenant')$$,
  '%roles_custom_named%', 'a custom role needs a name in both languages');
select throws_like($$update app.roles set name_en = 'Boss' where id = 'a2000000-0000-0000-0000-000000000004'$$,
  '%roles_builtin_unnamed%', 'a built-in role carries no tenant-authored name');
select throws_like($$update app.roles set key = 'scheduler' where id = 'a2000000-0000-0000-0000-000000000001'$$,
  '%role_key_immutable%', 'a role key never changes');
insert into app.roles (id, tenant_id, key, location_scope_mode, name_en, name_ar)
values ('a2c00000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'custom_0123456789abcdef', 'tenant', 'Raw', 'خام');
select is((select is_builtin from app.roles where id = 'a2c00000-0000-4000-8000-000000000001'), false, 'a custom key is not built-in');
select is((select is_builtin from app.roles where id = 'a2000000-0000-0000-0000-000000000002'), true, 'scheduler is built-in');

-- Grant consistency below every write path.
select throws_like($$insert into app.role_permissions (tenant_id, role_id, permission_key, grant_kind, scope_kind)
  values ('a0000000-0000-0000-0000-000000000001', 'a2c00000-0000-4000-8000-000000000001', 'role.manage', 'approval', 'tenant')$$,
  '%permission_reserved%', 'a custom role can never hold role.manage');
select throws_like($$insert into app.role_permissions (tenant_id, role_id, permission_key, grant_kind, scope_kind)
  values ('a0000000-0000-0000-0000-000000000001', 'a2c00000-0000-4000-8000-000000000001', 'billing.view', 'direct', 'tenant')$$,
  '%permission_reserved%', 'a custom role can never hold billing');
select throws_like($$insert into app.role_permissions (tenant_id, role_id, permission_key, grant_kind, scope_kind)
  values ('a0000000-0000-0000-0000-000000000001', 'a2c00000-0000-4000-8000-000000000001', 'booking.view.any', 'direct', 'location')$$,
  '%scope_mode_mismatch%', 'a tenant-mode role holds no location-scoped grant');
select throws_like($$insert into app.role_permissions (tenant_id, role_id, permission_key, grant_kind, scope_kind)
  values ('a0000000-0000-0000-0000-000000000001', 'a2c00000-0000-4000-8000-000000000001', 'booking.view.any', 'approval', 'tenant')$$,
  '%grant_not_allowed%', 'a view grant has no approval kind');
select throws_like($$insert into app.role_permissions (tenant_id, role_id, permission_key, grant_kind, scope_kind)
  values ('a0000000-0000-0000-0000-000000000001', 'a2c00000-0000-4000-8000-000000000001', 'brand.manage', 'direct', 'own')$$,
  '%grant_not_allowed%', 'a tenant-only permission has no own scope');
select throws_like($$insert into app.role_permissions (tenant_id, role_id, permission_key, grant_kind, scope_kind)
  values ('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'booking.view.any', 'direct', 'tenant')$$,
  '%scope_mode_mismatch%', 'an assigned-mode built-in holds no tenant-scoped grant');
insert into app.role_permissions (tenant_id, role_id, permission_key, grant_kind, scope_kind)
values ('a0000000-0000-0000-0000-000000000001', 'a2c00000-0000-4000-8000-000000000001', 'booking.view.any', 'direct', 'tenant');
select throws_like($$update app.roles set location_scope_mode = 'assigned' where id = 'a2c00000-0000-4000-8000-000000000001'$$,
  '%scope_mode_mismatch%', 'a mode change that strands a grant is refused');

-- ---------------------------------------------------------------------------
-- Who may manage roles
-- ---------------------------------------------------------------------------
select pg_temp.claims('a1000000-0000-0000-0000-000000000001');
set local role authenticated;
select throws_like($$select api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => 'a9c00000-0000-4000-8000-000000000001',
  p_name_en => 'Front desk', p_name_ar => 'الاستقبال', p_grants => '[{"permission_key":"booking.view.any","grant_kind":"direct","scope_kind":"tenant"}]')$$,
  '%not_authorized%', 'staff cannot define roles');
select throws_like($$select api_v1.list_roles_v1('a0000000-0000-0000-0000-000000000001')$$, '%not_authorized%', 'staff cannot list roles');
select throws_like($$select api_v1.get_role_catalog_v1('a0000000-0000-0000-0000-000000000001')$$, '%not_authorized%', 'staff cannot read the role catalog');
select is((select count(*)::integer from app.role_change_events), 0, 'staff reads no role ledger');
select is((select count(*)::integer from app.permission_meta), 32, 'any authenticated member reads the global catalog');
select throws_like($$insert into app.permission_meta values ('booking.view.own', 'bookings', array['own'], array['direct'], false, 9999)$$,
  '%permission denied%', 'nobody writes the catalog');
reset role;

select pg_temp.claims('a1000000-0000-0000-0000-000000000003');
set local role authenticated;
select throws_like($$select api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => 'a9c00000-0000-4000-8000-000000000001',
  p_name_en => 'Front desk', p_name_ar => 'الاستقبال', p_grants => '[{"permission_key":"booking.view.any","grant_kind":"direct","scope_kind":"tenant"}]')$$,
  '%not_authorized%', 'a location manager cannot define roles');
reset role;

select pg_temp.claims('a1000000-0000-0000-0000-000000000004');
set local role authenticated;
select throws_like($$select api_v1.list_roles_v1('a0000000-0000-0000-0000-000000000001')$$, '%not_authorized%', 'a revoked admin-era member cannot list roles');
reset role;

-- An administrator without a recent second factor must step up.
select pg_temp.claims('a1000000-0000-0000-0000-000000000002', 3600);
set local role authenticated;
select throws_like($$select api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => 'a9c00000-0000-4000-8000-000000000001',
  p_name_en => 'Front desk', p_name_ar => 'الاستقبال', p_grants => '[{"permission_key":"booking.view.any","grant_kind":"direct","scope_kind":"tenant"}]')$$,
  '%step_up_required%', 'a stale step-up cannot define roles');
reset role;
select pg_temp.claims('a1000000-0000-0000-0000-000000000002', null);
set local role authenticated;
select throws_like($$select api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => 'a9c00000-0000-4000-8000-000000000001',
  p_name_en => 'Front desk', p_name_ar => 'الاستقبال', p_grants => '[{"permission_key":"booking.view.any","grant_kind":"direct","scope_kind":"tenant"}]')$$,
  '%step_up_required%', 'a single-factor session cannot define roles');
select is((api_v1.list_roles_v1('a0000000-0000-0000-0000-000000000001') ->> 'can_manage_roles')::boolean, true,
  'an administrator can read roles without stepping up');
reset role;

-- ---------------------------------------------------------------------------
-- Create, replay, conflict
-- ---------------------------------------------------------------------------
select pg_temp.claims('a1000000-0000-0000-0000-000000000002');
set local role authenticated;
select set_config('test.front_desk', api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001',
  p_request_id => 'a9c00000-0000-4000-8000-000000000001', p_name_en => ' Front desk ', p_name_ar => 'الاستقبال',
  p_description_en => 'Greets and checks in', p_location_scope_mode => 'tenant',
  p_grants => '[{"permission_key":"booking.view.any","grant_kind":"direct","scope_kind":"tenant"},{"permission_key":"booking.check_in","grant_kind":"direct","scope_kind":"tenant"}]') ->> 'role_id', true);
select is((api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001',
  p_request_id => 'a9c00000-0000-4000-8000-000000000001', p_name_en => ' Front desk ', p_name_ar => 'الاستقبال',
  p_description_en => 'Greets and checks in', p_location_scope_mode => 'tenant',
  p_grants => '[{"permission_key":"booking.view.any","grant_kind":"direct","scope_kind":"tenant"},{"permission_key":"booking.check_in","grant_kind":"direct","scope_kind":"tenant"}]') ->> 'replayed')::boolean,
  true, 'the same request replays');
select throws_like($$select api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001',
  p_request_id => 'a9c00000-0000-4000-8000-000000000001', p_name_en => 'Another', p_name_ar => 'آخر',
  p_grants => '[{"permission_key":"booking.view.any","grant_kind":"direct","scope_kind":"tenant"}]')$$,
  '%idempotency_conflict%', 'a different payload cannot reuse a request id');
reset role;
select is((select count(*)::integer from app.role_change_events where request_id = 'a9c00000-0000-4000-8000-000000000001'), 1,
  'the replay wrote one ledger row');
select ok((select key ~ '^custom_[0-9a-f]{16}$' and name_en = 'Front desk' and revision = 1 and not is_builtin
    and created_by_membership_id = 'a3000000-0000-0000-0000-000000000002'
  from app.roles where id = current_setting('test.front_desk')::uuid), 'the server generated the key, trimmed the name and recorded the author');
select is((select count(*)::integer from app.role_permissions where role_id = current_setting('test.front_desk')::uuid), 2, 'both grants were stored');

-- Validation.
select pg_temp.claims('a1000000-0000-0000-0000-000000000002');
set local role authenticated;
select throws_like($$select api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => gen_random_uuid(),
  p_name_en => 'Owner-ish', p_name_ar => 'مالك', p_grants => '[{"permission_key":"role.manage","grant_kind":"approval","scope_kind":"tenant"}]')$$,
  '%permission_reserved%', 'reserved keys are refused by the RPC');
select throws_like($$select api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => gen_random_uuid(),
  p_name_en => 'Mystery', p_name_ar => 'غامض', p_grants => '[{"permission_key":"booking.teleport","grant_kind":"direct","scope_kind":"tenant"}]')$$,
  '%invalid_request%', 'unknown keys are refused');
select throws_like($$select api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => gen_random_uuid(),
  p_name_en => 'Twice', p_name_ar => 'مرتين', p_grants => '[{"permission_key":"booking.cancel","grant_kind":"direct","scope_kind":"tenant"},{"permission_key":"booking.cancel","grant_kind":"approval","scope_kind":"tenant"}]')$$,
  '%invalid_request%', 'a key appears at most once');
select throws_like($$select api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => gen_random_uuid(),
  p_name_en => 'Empty', p_name_ar => 'فارغ', p_grants => '[]')$$,
  '%invalid_request%', 'a role grants at least one permission');
select throws_like($$select api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => gen_random_uuid(),
  p_name_en => 'Extra', p_name_ar => 'إضافي', p_grants => '[{"permission_key":"booking.cancel","grant_kind":"direct","scope_kind":"tenant","note":"x"}]')$$,
  '%invalid_request%', 'a grant has exactly three fields');
select throws_like($$select api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => gen_random_uuid(),
  p_name_en => 'English only', p_name_ar => '  ', p_grants => '[{"permission_key":"booking.cancel","grant_kind":"direct","scope_kind":"tenant"}]')$$,
  '%invalid_request%', 'a role is named in both languages');
select throws_like($$select api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => gen_random_uuid(),
  p_name_en => repeat('x', 81), p_name_ar => 'طويل', p_grants => '[{"permission_key":"booking.cancel","grant_kind":"direct","scope_kind":"tenant"}]')$$,
  '%invalid_request%', 'names are at most 80 characters');
select throws_like($$select api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => gen_random_uuid(),
  p_name_en => 'Wrong mode', p_name_ar => 'وضع', p_location_scope_mode => 'assigned', p_grants => '[{"permission_key":"booking.cancel","grant_kind":"direct","scope_kind":"tenant"}]')$$,
  '%scope_mode_mismatch%', 'an assigned role holds no tenant-scoped grant');
select throws_like($$select api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => gen_random_uuid(),
  p_name_en => 'Bad scope', p_name_ar => 'نطاق', p_grants => '[{"permission_key":"customer.data.correct","grant_kind":"direct","scope_kind":"own"}]')$$,
  '%grant_not_allowed%', 'a scope outside the catalog is refused');
select throws_like($$select api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => gen_random_uuid(),
  p_name_en => 'Exporter', p_name_ar => 'مصدر', p_grants => '[{"permission_key":"customer.data.export","grant_kind":"direct","scope_kind":"tenant"}]')$$,
  '%escalation_denied%', 'an administrator who holds export only as approval cannot grant it directly');
select throws_like($$select api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => gen_random_uuid(),
  p_name_en => 'front DESK', p_name_ar => 'اسم آخر', p_grants => '[{"permission_key":"booking.cancel","grant_kind":"direct","scope_kind":"tenant"}]')$$,
  '%role_name_taken%', 'active English names are unique regardless of case');
select throws_like($$select api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => gen_random_uuid(),
  p_role_id => 'a2000000-0000-0000-0000-000000000002', p_expected_revision => 1,
  p_name_en => 'Scheduler', p_name_ar => 'مجدول', p_grants => '[{"permission_key":"booking.cancel","grant_kind":"direct","scope_kind":"tenant"}]')$$,
  '%role_locked%', 'built-in roles are locked');
select throws_like($$select api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => gen_random_uuid(),
  p_role_id => 'b2000000-0000-0000-0000-000000000002', p_expected_revision => 1,
  p_name_en => 'Foreign', p_name_ar => 'أجنبي', p_grants => '[{"permission_key":"booking.cancel","grant_kind":"direct","scope_kind":"tenant"}]')$$,
  '%not_authorized%', 'another tenant''s role is not addressable');
select throws_like($$select api_v1.save_role_v1(p_tenant_id => 'b0000000-0000-0000-0000-000000000001', p_request_id => gen_random_uuid(),
  p_name_en => 'Cross', p_name_ar => 'عابر', p_grants => '[{"permission_key":"booking.cancel","grant_kind":"direct","scope_kind":"tenant"}]')$$,
  '%not_authorized%', 'an administrator of A cannot define roles in B');
select throws_like($$select api_v1.list_roles_v1('b0000000-0000-0000-0000-000000000001')$$, '%not_authorized%', 'nor list B''s roles');
select throws_like($$select api_v1.get_staff_access_workspace_v2('b0000000-0000-0000-0000-000000000001')$$, '%not_authorized%', 'nor read B''s workspace');

-- Update: revision and conflict.
select throws_like(format($$select api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => gen_random_uuid(),
  p_role_id => %L, p_expected_revision => 7, p_name_en => 'Front desk', p_name_ar => 'الاستقبال',
  p_grants => '[{"permission_key":"booking.view.any","grant_kind":"direct","scope_kind":"tenant"}]')$$, current_setting('test.front_desk')),
  '%revision_conflict%', 'a stale revision is refused');
select is((api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => 'a9c00000-0000-4000-8000-000000000002',
  p_role_id => current_setting('test.front_desk')::uuid, p_expected_revision => 1, p_name_en => 'Front desk', p_name_ar => 'الاستقبال',
  p_grants => '[{"permission_key":"booking.view.any","grant_kind":"direct","scope_kind":"tenant"}]') ->> 'revision')::integer,
  2, 'an update bumps the revision');
reset role;
select is((select count(*)::integer from app.role_permissions where role_id = current_setting('test.front_desk')::uuid), 1, 'grants are replaced, not merged');

-- Duplicate a built-in.
select pg_temp.claims('a1000000-0000-0000-0000-000000000002');
set local role authenticated;
select set_config('test.dup', api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001',
  p_request_id => 'a9c00000-0000-4000-8000-000000000003', p_source_role_id => 'a2000000-0000-0000-0000-000000000002',
  p_name_en => 'Scheduler (no catalog)', p_name_ar => 'مجدول بلا كتالوج', p_location_scope_mode => 'tenant',
  p_grants => (select jsonb_agg(jsonb_build_object('permission_key', permission_key, 'grant_kind', grant_kind, 'scope_kind', scope_kind))
    from app.role_permissions where role_id = 'a2000000-0000-0000-0000-000000000002' and permission_key <> 'catalog.edit')) ->> 'role_id', true);
reset role;
select ok((select duplicated_from_role_id = 'a2000000-0000-0000-0000-000000000002' from app.roles where id = current_setting('test.dup')::uuid),
  'a duplicate remembers its source');
select is((select action from app.role_change_events where request_id = 'a9c00000-0000-4000-8000-000000000003'), 'duplicate', 'and is recorded as a duplicate');
select is((select count(*)::integer from app.role_permissions where role_id = current_setting('test.dup')::uuid), 14, 'it holds the scheduler grants minus catalog.edit');

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------
select pg_temp.claims('a1000000-0000-0000-0000-000000000002');
set local role authenticated;
select is(jsonb_array_length(api_v1.get_role_catalog_v1('a0000000-0000-0000-0000-000000000001') -> 'permissions'), 32, 'the catalog lists every permission');
select is((select array_agg(r ->> 'key' order by ord) from jsonb_array_elements(api_v1.list_roles_v1('a0000000-0000-0000-0000-000000000001') -> 'roles')
    with ordinality as x(r, ord) where (r ->> 'is_builtin')::boolean),
  array['tenant_admin','location_manager','scheduler','staff'], 'built-ins come first in a fixed order');
select ok((select (r ->> 'administrator')::boolean and (r ->> 'assignable')::boolean
  from jsonb_array_elements(api_v1.list_roles_v1('a0000000-0000-0000-0000-000000000001') -> 'roles') r where r ->> 'key' = 'tenant_admin'),
  'Tenant admin is reported as an administrator role');
select is((select (r ->> 'active_members')::integer from jsonb_array_elements(api_v1.list_roles_v1('a0000000-0000-0000-0000-000000000001') -> 'roles') r
  where r ->> 'key' = 'staff'), 1, 'member counts exclude revoked memberships');
select is((select (r ->> 'pending_invitations')::integer from jsonb_array_elements(api_v1.list_roles_v1('a0000000-0000-0000-0000-000000000001') -> 'roles') r
  where r ->> 'key' = 'staff'), 1, 'pending invitations are counted');
select is((select r ->> 'name_ar' from jsonb_array_elements(api_v1.list_roles_v1('a0000000-0000-0000-0000-000000000001') -> 'roles') r
  where r ->> 'id' = current_setting('test.front_desk')), 'الاستقبال', 'custom roles carry both names');
select is((select count(*)::integer from jsonb_array_elements(api_v1.list_roles_v1('a0000000-0000-0000-0000-000000000001') -> 'roles') r
  where r ->> 'key' like 'custom_%'), 3, 'custom roles are listed');
select is((select count(*)::integer from jsonb_array_elements(api_v1.get_staff_access_workspace_v1('a0000000-0000-0000-0000-000000000001') -> 'roles')),
  4, 'the N-1 workspace still lists only the four built-ins');
select is((api_v1.get_staff_access_workspace_v2('a0000000-0000-0000-0000-000000000001') ->> 'version')::integer, 2, 'v2 is versioned');
select is(jsonb_array_length(api_v1.get_staff_access_workspace_v2('a0000000-0000-0000-0000-000000000001') -> 'roles'), 7, 'v2 lists every role');
select is(jsonb_array_length(api_v1.get_staff_access_workspace_v2('a0000000-0000-0000-0000-000000000001') -> 'members'),
  jsonb_array_length(api_v1.get_staff_access_workspace_v1('a0000000-0000-0000-0000-000000000001') -> 'members'), 'v2 keeps the v1 members');
reset role;

-- ---------------------------------------------------------------------------
-- Archive
-- ---------------------------------------------------------------------------
select pg_temp.claims('a1000000-0000-0000-0000-000000000002');
set local role authenticated;
-- Assign the front desk role to staff-a, then try to archive it.
select is((api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', 'a9c00000-0000-4000-8000-000000000010', 'edit_membership',
  'a3000000-0000-0000-0000-000000000001', 1, current_setting('test.front_desk')::uuid, array['a5000000-0000-0000-0000-000000000001'::uuid]) ->> 'revision')::integer,
  2, 'a custom role is assignable');
select is(pg_temp.error_of(format($$select api_v1.archive_role_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), %L, 2)$$, current_setting('test.front_desk'))),
  '22023:role_in_use:{"members": 1, "invitations": 0}', 'a role in use is not archived, and the counts say why');
select throws_like($$select api_v1.archive_role_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'a2000000-0000-0000-0000-000000000001', 1)$$,
  '%role_locked%', 'built-ins are never archived');
select is((api_v1.archive_role_v1('a0000000-0000-0000-0000-000000000001', 'a9c00000-0000-4000-8000-000000000011', current_setting('test.dup')::uuid, 1) ->> 'revision')::integer,
  2, 'an unused custom role is archived');
select is((api_v1.archive_role_v1('a0000000-0000-0000-0000-000000000001', 'a9c00000-0000-4000-8000-000000000011', current_setting('test.dup')::uuid, 1) ->> 'replayed')::boolean,
  true, 'archive replays');
select throws_like(format($$select api_v1.archive_role_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), %L, 2)$$, current_setting('test.dup')),
  '%role_archived%', 'an archived role stays archived');
select throws_like(format($$select api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => gen_random_uuid(),
  p_role_id => %L, p_expected_revision => 2, p_name_en => 'Back', p_name_ar => 'عودة',
  p_grants => '[{"permission_key":"booking.view.any","grant_kind":"direct","scope_kind":"tenant"}]')$$, current_setting('test.dup')),
  '%role_archived%', 'an archived role cannot be edited');
select throws_like(format($$select api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'invite', null, null, %L, '{}', 'late@example.invalid')$$, current_setting('test.dup')),
  '%role_archived%', 'nobody can be invited to an archived role');
select throws_like(format($$select api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'edit_membership', 'a3000000-0000-0000-0000-000000000001', 2, %L, '{}')$$, current_setting('test.dup')),
  '%role_archived%', 'nobody can be moved onto an archived role');
select ok((api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => gen_random_uuid(),
  p_name_en => 'Scheduler (no catalog)', p_name_ar => 'مجدول بلا كتالوج',
  p_grants => '[{"permission_key":"booking.view.any","grant_kind":"direct","scope_kind":"tenant"}]') ->> 'role_id') is not null,
  'an archived role''s name is free again');
reset role;
select is((select array_agg(action order by created_at, action) from app.role_change_events
  where tenant_id = 'a0000000-0000-0000-0000-000000000001' and role_id = current_setting('test.dup')::uuid),
  array['duplicate','archive'], 'the ledger tells the role''s story');

-- An invitation to a role archived underneath it can no longer be accepted.
insert into app.invitations (id, tenant_id, role_id, invited_by_membership_id, invitee_email, token_hash, status, expires_at)
values ('a6c00000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('test.dup')::uuid,
  'a3000000-0000-0000-0000-000000000002', 'no-membership@example.invalid', repeat('f', 64), 'pending', now() + interval '1 day');
select pg_temp.claims('d1000000-0000-0000-0000-000000000001', null);
set local role authenticated;
select throws_like($$select api_v1.accept_staff_invitation_v1('a6c00000-0000-4000-8000-000000000001')$$,
  '%invitation_unavailable%', 'an invitation to an archived role is unavailable');
reset role;

-- ---------------------------------------------------------------------------
-- The ledger: append-only, audit.read, tenant-bound
-- ---------------------------------------------------------------------------
select throws_like($$update app.role_change_events set action = 'update'$$, '%booking_immutable%', 'the role ledger is append-only');
select throws_like($$delete from app.role_change_events$$, '%booking_immutable%', 'and cannot be deleted');
select ok(not exists (select 1 from app.role_change_events where result::text like '%@%'), 'the ledger holds no email');

select pg_temp.claims('a1000000-0000-0000-0000-000000000002');
set local role authenticated;
select ok((select count(*) from app.role_change_events) >= 4, 'an auditor reads the tenant''s role ledger');
select is((select count(*)::integer from app.role_change_events where tenant_id <> 'a0000000-0000-0000-0000-000000000001'), 0, 'and only that tenant''s');
reset role;
select pg_temp.claims('a1000000-0000-0000-0000-000000000003');
set local role authenticated;
select is((select count(*)::integer from app.role_change_events), 0, 'location-scoped audit.read does not reach the tenant-wide role ledger');
reset role;
select pg_temp.claims('b1000000-0000-0000-0000-000000000001');
set local role authenticated;
select is((select count(*)::integer from app.role_change_events), 0, 'another tenant''s member reads nothing');
reset role;
set local role anon;
select throws_like($$select * from app.role_change_events$$, '%permission denied%', 'anonymous has no ledger grant');
select throws_like($$select api_v1.list_roles_v1('a0000000-0000-0000-0000-000000000001')$$, '%permission denied%', 'anonymous cannot call the role API');
reset role;

select ok(not has_function_privilege('anon', 'api_v1.save_role_v1(uuid,uuid,uuid,bigint,uuid,text,text,text,text,text,jsonb)', 'execute'), 'anonymous cannot save roles');
select ok(not has_function_privilege('service_role', 'api_v1.save_role_v1(uuid,uuid,uuid,bigint,uuid,text,text,text,text,text,jsonb)', 'execute'), 'the generic service role cannot save roles');
select ok(not has_function_privilege('authenticated', 'private.install_builtin_roles_v1(uuid)', 'execute'), 'members cannot run the installer');
select ok(not has_function_privilege('authenticated', 'private.actor_dominates_grants(uuid,jsonb,uuid[])', 'execute'), 'members cannot probe dominance directly');

select * from finish();
rollback;
