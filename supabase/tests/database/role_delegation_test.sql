-- No escalation (ADR-0019). A grant covers another of the same key when its
-- scope is at least as wide and its kind at least as strong; a caller may only
-- hand out, change or take away a role whose every grant it covers. Tenant
-- administrators are the role.manage holders, and the last of them stays.
begin;
select no_plan();

do $$ begin
  execute format('grant usage on schema %I to authenticated', pg_my_temp_schema()::regnamespace::text);
end $$;

create function pg_temp.claims(p_user uuid, p_age integer default 0) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user, 'role', 'authenticated',
    'aal', case when p_age is null then 'aal1' else 'aal2' end,
    'amr', case when p_age is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'method', 'totp', 'timestamp', extract(epoch from statement_timestamp())::bigint - p_age)) end)::text, true);
$$;

-- ---------------------------------------------------------------------------
-- 1. grant_covers, exhaustively: actor kind x actor scope x target kind x target scope.
-- ---------------------------------------------------------------------------
create temp table covers (actor_kind text, actor_scope text, target_kind text, target_scope text, expected boolean);
insert into covers values
  ('direct','tenant','direct','tenant',true),     ('direct','tenant','direct','location',true),     ('direct','tenant','direct','own',true),
  ('direct','tenant','approval','tenant',true),   ('direct','tenant','approval','location',true),   ('direct','tenant','approval','own',true),
  ('direct','location','direct','tenant',false),  ('direct','location','direct','location',true),   ('direct','location','direct','own',true),
  ('direct','location','approval','tenant',false),('direct','location','approval','location',true), ('direct','location','approval','own',true),
  ('direct','own','direct','tenant',false),       ('direct','own','direct','location',false),       ('direct','own','direct','own',true),
  ('direct','own','approval','tenant',false),     ('direct','own','approval','location',false),     ('direct','own','approval','own',true),
  ('approval','tenant','direct','tenant',false),  ('approval','tenant','direct','location',false),  ('approval','tenant','direct','own',false),
  ('approval','tenant','approval','tenant',true), ('approval','tenant','approval','location',true), ('approval','tenant','approval','own',true),
  ('approval','location','direct','tenant',false),('approval','location','direct','location',false),('approval','location','direct','own',false),
  ('approval','location','approval','tenant',false),('approval','location','approval','location',true),('approval','location','approval','own',true),
  ('approval','own','direct','tenant',false),     ('approval','own','direct','location',false),     ('approval','own','direct','own',false),
  ('approval','own','approval','tenant',false),   ('approval','own','approval','location',false),   ('approval','own','approval','own',true);
select is((select count(*)::integer from covers), 36, 'the truth table is complete');
select is(private.grant_covers(actor_kind, actor_scope, target_kind, target_scope), expected,
  format('%s/%s covers %s/%s: %s', actor_kind, actor_scope, target_kind, target_scope, expected))
from covers order by actor_kind desc, actor_scope desc, target_kind desc, target_scope desc;
select is(private.grant_covers('direct', 'tenant', 'direct', 'galaxy'), false, 'an unknown scope is never covered');

-- ---------------------------------------------------------------------------
-- 2. Dominance below tenant scope is bounded by the caller's locations.
--    The location manager is scoped to L1.
-- ---------------------------------------------------------------------------
select pg_temp.claims('a1000000-0000-0000-0000-000000000003', null);
create temp table dominance (grants jsonb, locations uuid[], expected boolean, label text);
insert into dominance values
  ('[{"permission_key":"booking.view.any","grant_kind":"direct","scope_kind":"location"}]', array['a5000000-0000-0000-0000-000000000001'::uuid], true, 'own location'),
  ('[{"permission_key":"booking.view.any","grant_kind":"direct","scope_kind":"location"}]', array['a5000000-0000-0000-0000-000000000002'::uuid], false, 'another location'),
  ('[{"permission_key":"booking.view.any","grant_kind":"direct","scope_kind":"location"}]', array['a5000000-0000-0000-0000-000000000001'::uuid,'a5000000-0000-0000-0000-000000000002'::uuid], false, 'a superset of locations'),
  ('[{"permission_key":"booking.view.any","grant_kind":"direct","scope_kind":"location"}]', null, true, 'no location context'),
  ('[{"permission_key":"booking.view.any","grant_kind":"direct","scope_kind":"tenant"}]', null, false, 'a wider scope'),
  ('[{"permission_key":"catalog.edit","grant_kind":"direct","scope_kind":"location"}]', array['a5000000-0000-0000-0000-000000000001'::uuid], false, 'a stronger kind'),
  ('[{"permission_key":"catalog.edit","grant_kind":"approval","scope_kind":"location"}]', array['a5000000-0000-0000-0000-000000000001'::uuid], true, 'the same approval grant'),
  ('[{"permission_key":"refund.issue","grant_kind":"approval","scope_kind":"own"}]', array['a5000000-0000-0000-0000-000000000001'::uuid], true, 'a narrower scope'),
  ('[{"permission_key":"brand.manage","grant_kind":"direct","scope_kind":"tenant"}]', null, false, 'a key the caller lacks'),
  ('[]', null, true, 'nothing at all'),
  ('{}', null, false, 'a malformed grant list');
select is(private.actor_dominates_grants('a0000000-0000-0000-0000-000000000001', grants, locations), expected, 'location manager dominance: ' || label)
from dominance;
select is(private.actor_dominates_grants('b0000000-0000-0000-0000-000000000001',
  '[{"permission_key":"booking.view.any","grant_kind":"direct","scope_kind":"location"}]', null), false,
  'a caller dominates nothing in a tenant it does not belong to');
select pg_temp.claims('a1000000-0000-0000-0000-000000000004', 0);
select is(private.actor_dominates_grants('a0000000-0000-0000-0000-000000000001', '[]', null), false, 'a revoked member dominates nothing');

-- ---------------------------------------------------------------------------
-- 3. A custom staff lead: staff.manage, booking.view.any and check-in, all
--    tenant-wide and direct, and nothing else.
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
from (values
  ('e1d00000-0000-4000-8000-000000000001'::uuid, 'delegation-lead@example.invalid'),
  ('e1d00000-0000-4000-8000-000000000002'::uuid, 'delegation-admin@example.invalid'),
  ('e1d00000-0000-4000-8000-000000000003'::uuid, 'delegation-viewer@example.invalid')) as u(id, email);
insert into app.roles (id, tenant_id, key, location_scope_mode, name_en, name_ar)
values
  ('aad00000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'custom_00000000000000d1', 'tenant', 'Staff lead', 'قائد الفريق'),
  ('aad00000-0000-4000-8000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'custom_00000000000000d2', 'tenant', 'Viewer', 'مشاهد'),
  ('aad00000-0000-4000-8000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'custom_00000000000000d3', 'assigned', 'Desk', 'مكتب');
insert into app.role_permissions (tenant_id, role_id, permission_key, grant_kind, scope_kind)
values
  ('a0000000-0000-0000-0000-000000000001', 'aad00000-0000-4000-8000-000000000001', 'staff.manage', 'direct', 'tenant'),
  ('a0000000-0000-0000-0000-000000000001', 'aad00000-0000-4000-8000-000000000001', 'booking.view.any', 'direct', 'tenant'),
  ('a0000000-0000-0000-0000-000000000001', 'aad00000-0000-4000-8000-000000000001', 'booking.check_in', 'direct', 'tenant'),
  ('a0000000-0000-0000-0000-000000000001', 'aad00000-0000-4000-8000-000000000002', 'booking.view.any', 'direct', 'tenant'),
  ('a0000000-0000-0000-0000-000000000001', 'aad00000-0000-4000-8000-000000000003', 'booking.view.any', 'direct', 'location'),
  ('a0000000-0000-0000-0000-000000000001', 'aad00000-0000-4000-8000-000000000003', 'booking.check_in', 'approval', 'location');
insert into app.memberships (id, tenant_id, auth_user_id, role_id)
values
  ('a3d00000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'e1d00000-0000-4000-8000-000000000001', 'aad00000-0000-4000-8000-000000000001'),
  ('a3d00000-0000-4000-8000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'e1d00000-0000-4000-8000-000000000003', 'aad00000-0000-4000-8000-000000000002');

select is(private.role_is_administrator('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000004'), true, 'Tenant admin is an administrator role');
select is(private.role_is_administrator('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002'), false, 'scheduler is not');
select is(private.role_is_administrator('a0000000-0000-0000-0000-000000000001', 'aad00000-0000-4000-8000-000000000001'), false, 'a staff lead is not');

select pg_temp.claims('e1d00000-0000-4000-8000-000000000001', null);
set local role authenticated;
select throws_like($$select api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'invite', null, null,
  'a2000000-0000-0000-0000-000000000002', '{}', 'up1@example.invalid')$$, '%escalation_denied%', 'a lead cannot invite a scheduler (more power than it holds)');
select throws_like($$select api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'invite', null, null,
  'a2000000-0000-0000-0000-000000000004', '{}', 'up2@example.invalid')$$, '%step_up_required%', 'a lead cannot invite an administrator');
select throws_like($$select api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'invite', null, null,
  'a2000000-0000-0000-0000-000000000001', array['a5000000-0000-0000-0000-000000000001'::uuid], 'up3@example.invalid')$$, '%escalation_denied%',
  'a lead cannot invite built-in staff (own-scope grants it does not hold)');
select ok((api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'invite', null, null,
  'aad00000-0000-4000-8000-000000000002', '{}', 'viewer@example.invalid') ->> 'id') is not null, 'a lead invites a viewer');
select ok((api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'invite', null, null,
  'aad00000-0000-4000-8000-000000000003', array['a5000000-0000-0000-0000-000000000002'::uuid], 'desk@example.invalid') ->> 'id') is not null,
  'a lead invites a narrower location-scoped desk anywhere (its own grants are tenant-wide)');
select ok((api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'invite', null, null,
  'aad00000-0000-4000-8000-000000000001', '{}', 'peer@example.invalid') ->> 'id') is not null, 'a lead invites a peer with exactly its own grants');
select throws_like($$select api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'edit_membership',
  'a3000000-0000-0000-0000-000000000005', 1, 'aad00000-0000-4000-8000-000000000002', '{}')$$, '%escalation_denied%',
  'a lead cannot demote a scheduler it does not dominate');
select throws_like($$select api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'revoke_membership',
  'a3000000-0000-0000-0000-000000000001', 1)$$, '%escalation_denied%', 'nor revoke a member whose role it does not dominate');
select throws_like($$select api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'edit_membership',
  'a3d00000-0000-4000-8000-000000000001', 1, 'a2000000-0000-0000-0000-000000000002', '{}')$$, '%escalation_denied%', 'a lead cannot promote itself');
select throws_like($$select api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'revoke_membership',
  'a3000000-0000-0000-0000-000000000002', 1)$$, '%step_up_required%', 'a lead cannot revoke an administrator');
select throws_like($$select api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'revoke_invitation',
  'a6000000-0000-0000-0000-000000000001', 1)$$, '%escalation_denied%', 'nor revoke an invitation to a role it does not dominate');
select is((api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'edit_membership',
  'a3d00000-0000-4000-8000-000000000003', 1, 'aad00000-0000-4000-8000-000000000003', array['a5000000-0000-0000-0000-000000000001'::uuid]) ->> 'revision')::integer,
  2, 'a lead moves a viewer it dominates onto the desk role');
select throws_like($$select api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => gen_random_uuid(),
  p_name_en => 'Self made', p_name_ar => 'صنع ذاتي', p_grants => '[{"permission_key":"booking.view.any","grant_kind":"direct","scope_kind":"tenant"}]')$$,
  '%not_authorized%', 'staff.manage alone does not define roles');
select ok((api_v1.list_roles_v1('a0000000-0000-0000-0000-000000000001') -> 'roles') is not null, 'but a staff manager reads the roles it assigns');
select is((select (r ->> 'assignable')::boolean from jsonb_array_elements(api_v1.list_roles_v1('a0000000-0000-0000-0000-000000000001') -> 'roles') r
  where r ->> 'key' = 'scheduler'), false, 'and sees the scheduler as not assignable');
select is((select (r ->> 'assignable')::boolean from jsonb_array_elements(api_v1.list_roles_v1('a0000000-0000-0000-0000-000000000001') -> 'roles') r
  where r ->> 'id' = 'aad00000-0000-4000-8000-000000000003'), true, 'and the desk role as assignable');
reset role;

-- A custom role can never be made an administrator, even beneath the RPCs.
select throws_like($$insert into app.role_permissions (tenant_id, role_id, permission_key, grant_kind, scope_kind)
  values ('a0000000-0000-0000-0000-000000000001', 'aad00000-0000-4000-8000-000000000001', 'tenant.owner_transfer', 'approval', 'tenant')$$,
  '%permission_reserved%', 'owner transfer is reserved to the built-in administrator');

-- ---------------------------------------------------------------------------
-- 4. Administrators: step-up, demotion through custom roles, the last one.
-- ---------------------------------------------------------------------------
insert into app.memberships (id, tenant_id, auth_user_id, role_id)
values ('a3d00000-0000-4000-8000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'e1d00000-0000-4000-8000-000000000002', 'a2000000-0000-0000-0000-000000000004');

select pg_temp.claims('a1000000-0000-0000-0000-000000000002', 3600);
set local role authenticated;
select throws_like($$select api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'edit_membership',
  'a3d00000-0000-4000-8000-000000000002', 1, 'aad00000-0000-4000-8000-000000000002', '{}')$$, '%step_up_required%',
  'demoting an administrator needs a recent second factor');
reset role;
select pg_temp.claims('a1000000-0000-0000-0000-000000000002');
set local role authenticated;
select throws_like($$select api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => gen_random_uuid(),
  p_name_en => 'Direct exporter', p_name_ar => 'مصدر مباشر', p_grants => '[{"permission_key":"customer.data.export","grant_kind":"direct","scope_kind":"tenant"}]')$$,
  '%escalation_denied%', 'an administrator cannot mint a stronger grant than it holds');
select ok((api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => gen_random_uuid(),
  p_name_en => 'Approved exporter', p_name_ar => 'مصدر معتمد', p_grants => '[{"permission_key":"customer.data.export","grant_kind":"approval","scope_kind":"tenant"}]')
  ->> 'role_id') is not null, 'but can hand out the approval grant it holds');
select ok((api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => gen_random_uuid(),
  p_source_role_id => 'a2000000-0000-0000-0000-000000000003', p_name_en => 'Manager copy', p_name_ar => 'نسخة المدير', p_location_scope_mode => 'assigned',
  p_grants => (select jsonb_agg(jsonb_build_object('permission_key', permission_key, 'grant_kind', grant_kind, 'scope_kind', scope_kind))
    from app.role_permissions where role_id = 'a2000000-0000-0000-0000-000000000003')) ->> 'role_id') is not null,
  'an administrator duplicates the location manager');
select is((api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'edit_membership',
  'a3d00000-0000-4000-8000-000000000002', 1, 'aad00000-0000-4000-8000-000000000002', '{}') ->> 'revision')::integer,
  2, 'with a recent second factor an administrator demotes another onto a custom role');
select throws_like($$select api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'edit_membership',
  'a3000000-0000-0000-0000-000000000002', 1, 'aad00000-0000-4000-8000-000000000002', '{}')$$, '%last_administrator_required%',
  'the last administrator cannot demote itself');
select throws_like($$select api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'revoke_membership',
  'a3000000-0000-0000-0000-000000000002', 1)$$, '%last_administrator_required%', 'nor revoke itself');
reset role;
select is((select count(*)::integer from app.memberships m where m.tenant_id = 'a0000000-0000-0000-0000-000000000001' and m.status = 'active'
  and private.role_is_administrator(m.tenant_id, m.role_id)), 1, 'exactly one administrator remains');
select throws_like($$update app.memberships set role_id = 'a2000000-0000-0000-0000-000000000002' where id = 'a3000000-0000-0000-0000-000000000002'$$,
  '%last_administrator_required%', 'the trigger guards the last administrator beneath the RPCs too');

select * from finish();
rollback;
