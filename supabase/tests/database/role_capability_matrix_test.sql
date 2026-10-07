-- Role x capability matrix (ADR-0019). One data-driven table: each row is an
-- actor, a helper, a permission, a location and the answer the helper must
-- give. It covers the four built-ins, three shapes of custom role, an assigned
-- custom role with no location (fails closed), a member of another tenant, a
-- revoked member, a non-member and a user who belongs to two tenants. The
-- helpers are the ones every RLS policy and RPC already calls, which is what
-- makes a custom role behave exactly like a built-in with the same grants.
begin;
select no_plan();

-- Actors that hold custom roles in Tenant A.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
from (values
  ('e1c00000-0000-4000-8000-000000000001'::uuid, 'matrix-narrow@example.invalid'),
  ('e1c00000-0000-4000-8000-000000000002'::uuid, 'matrix-dup@example.invalid'),
  ('e1c00000-0000-4000-8000-000000000003'::uuid, 'matrix-location@example.invalid'),
  ('e1c00000-0000-4000-8000-000000000004'::uuid, 'matrix-unplaced@example.invalid'),
  ('e1c00000-0000-4000-8000-000000000005'::uuid, 'matrix-pinned@example.invalid')) as u(id, email);

insert into app.roles (id, tenant_id, key, location_scope_mode, name_en, name_ar)
values
  -- A narrow tenant-wide reader.
  ('aac00000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'custom_00000000000000a1', 'tenant', 'Viewer', 'مشاهد'),
  -- The scheduler, duplicated, without catalog.edit.
  ('aac00000-0000-4000-8000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'custom_00000000000000a2', 'tenant', 'Scheduler lite', 'مجدول مخفف'),
  -- A location-scoped front desk.
  ('aac00000-0000-4000-8000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'custom_00000000000000a3', 'assigned', 'Front desk', 'الاستقبال');
insert into app.role_permissions (tenant_id, role_id, permission_key, grant_kind, scope_kind)
values
  ('a0000000-0000-0000-0000-000000000001', 'aac00000-0000-4000-8000-000000000001', 'booking.view.any', 'direct', 'tenant'),
  ('a0000000-0000-0000-0000-000000000001', 'aac00000-0000-4000-8000-000000000003', 'booking.view.any', 'direct', 'location'),
  ('a0000000-0000-0000-0000-000000000001', 'aac00000-0000-4000-8000-000000000003', 'booking.check_in', 'direct', 'location'),
  ('a0000000-0000-0000-0000-000000000001', 'aac00000-0000-4000-8000-000000000003', 'booking.view.own', 'direct', 'own');
insert into app.role_permissions (tenant_id, role_id, permission_key, grant_kind, scope_kind)
select tenant_id, 'aac00000-0000-4000-8000-000000000002', permission_key, grant_kind, scope_kind
from app.role_permissions
where role_id = 'a2000000-0000-0000-0000-000000000002' and permission_key <> 'catalog.edit';

insert into app.memberships (id, tenant_id, auth_user_id, role_id)
values
  ('a3c00000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'e1c00000-0000-4000-8000-000000000001', 'aac00000-0000-4000-8000-000000000001'),
  ('a3c00000-0000-4000-8000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'e1c00000-0000-4000-8000-000000000002', 'aac00000-0000-4000-8000-000000000002'),
  ('a3c00000-0000-4000-8000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'e1c00000-0000-4000-8000-000000000003', 'aac00000-0000-4000-8000-000000000003'),
  -- Assigned mode with no location row: written beneath the RPCs, which refuse it.
  ('a3c00000-0000-4000-8000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'e1c00000-0000-4000-8000-000000000004', 'aac00000-0000-4000-8000-000000000003'),
  -- Tenant mode pinned to one location.
  ('a3c00000-0000-4000-8000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'e1c00000-0000-4000-8000-000000000005', 'aac00000-0000-4000-8000-000000000001');
insert into app.membership_location_scopes (tenant_id, membership_id, location_id)
values
  ('a0000000-0000-0000-0000-000000000001', 'a3c00000-0000-4000-8000-000000000003', 'a5000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000001', 'a3c00000-0000-4000-8000-000000000005', 'a5000000-0000-0000-0000-000000000001');

create temp table matrix_actor (name text primary key, id uuid not null);
insert into matrix_actor values
  ('admin',     'a1000000-0000-0000-0000-000000000002'),
  ('staff',     'a1000000-0000-0000-0000-000000000001'),
  ('manager',   'a1000000-0000-0000-0000-000000000003'),
  ('revoked',   'a1000000-0000-0000-0000-000000000004'),
  ('staff_b',   'b1000000-0000-0000-0000-000000000001'),
  ('multi',     'c1000000-0000-0000-0000-000000000001'),
  ('nobody',    'd1000000-0000-0000-0000-000000000001'),
  ('viewer',    'e1c00000-0000-4000-8000-000000000001'),
  ('dup',       'e1c00000-0000-4000-8000-000000000002'),
  ('desk',      'e1c00000-0000-4000-8000-000000000003'),
  ('unplaced',  'e1c00000-0000-4000-8000-000000000004'),
  ('pinned',    'e1c00000-0000-4000-8000-000000000005');
create temp table matrix_place (name text primary key, id uuid);
insert into matrix_place values
  ('A', 'a0000000-0000-0000-0000-000000000001'), ('B', 'b0000000-0000-0000-0000-000000000001'),
  ('L1', 'a5000000-0000-0000-0000-000000000001'), ('L2', 'a5000000-0000-0000-0000-000000000002'),
  ('LB', 'b5000000-0000-0000-0000-000000000001'), ('-', null);

-- helper: direct = has_direct_capability, decide = can_decide_booking,
-- catalog = can_manage_catalog, staff = can_manage_staff, location = can_access_location.
create temp table matrix (ord serial, actor text, tenant text, aal text, helper text,
  permission text, location text, expected boolean);
insert into matrix (actor, tenant, aal, helper, permission, location, expected) values
  ('admin',    'A', 'aal1', 'direct',   'booking.view.any',      '-',  true),
  ('admin',    'A', 'aal1', 'direct',   'staff.manage',          '-',  true),
  ('admin',    'A', 'aal1', 'direct',   'role.manage',           '-',  false),
  ('admin',    'A', 'aal1', 'direct',   'tenant.owner_transfer', '-',  false),
  ('admin',    'A', 'aal1', 'decide',   'refund.issue',          'L1', true),
  ('admin',    'A', 'aal1', 'decide',   'customer.data.delete',  'L1', false),
  ('admin',    'A', 'aal2', 'decide',   'customer.data.delete',  'L1', true),
  ('admin',    'A', 'aal1', 'location', null,                    'L1', true),
  ('admin',    'A', 'aal1', 'location', null,                    'L2', true),
  ('admin',    'A', 'aal1', 'catalog',  null,                    'L2', true),
  ('admin',    'A', 'aal1', 'staff',    null,                    'L2', true),
  ('admin',    'B', 'aal2', 'direct',   'booking.view.any',      '-',  false),
  ('admin',    'B', 'aal2', 'location', null,                    'LB', false),
  ('staff',    'A', 'aal1', 'direct',   'booking.view.own',      '-',  false),
  ('staff',    'A', 'aal1', 'decide',   'booking.check_in',      'L1', false),
  ('staff',    'A', 'aal1', 'location', null,                    'L1', true),
  ('staff',    'A', 'aal1', 'location', null,                    'L2', false),
  ('staff',    'A', 'aal1', 'catalog',  null,                    'L1', false),
  ('staff',    'A', 'aal1', 'direct',   'staff.manage',          '-',  false),
  ('manager',  'A', 'aal1', 'decide',   'booking.view.any',      'L1', true),
  ('manager',  'A', 'aal1', 'decide',   'booking.view.any',      'L2', false),
  ('manager',  'A', 'aal1', 'catalog',  null,                    'L1', false),
  ('manager',  'A', 'aal2', 'catalog',  null,                    'L1', true),
  ('manager',  'A', 'aal2', 'catalog',  null,                    'L2', false),
  ('manager',  'A', 'aal1', 'staff',    null,                    'L1', false),
  ('manager',  'A', 'aal2', 'staff',    null,                    'L1', true),
  ('manager',  'A', 'aal1', 'direct',   'audit.read',            '-',  false),
  ('manager',  'A', 'aal1', 'location', null,                    'L2', false),
  ('manager',  'A', 'aal1', 'decide',   'refund.issue',          'L1', false),
  ('manager',  'A', 'aal2', 'decide',   'refund.issue',          'L1', true),
  ('revoked',  'A', 'aal2', 'location', null,                    'L1', false),
  ('revoked',  'A', 'aal2', 'direct',   'booking.view.own',      '-',  false),
  ('revoked',  'A', 'aal2', 'decide',   'booking.check_in',      'L1', false),
  ('staff_b',  'A', 'aal1', 'location', null,                    'L1', false),
  ('staff_b',  'A', 'aal1', 'direct',   'booking.view.any',      '-',  false),
  ('staff_b',  'B', 'aal1', 'location', null,                    'LB', true),
  ('multi',    'A', 'aal1', 'location', null,                    'L1', true),
  ('multi',    'A', 'aal1', 'location', null,                    'L2', true),
  ('multi',    'A', 'aal1', 'direct',   'booking.view.any',      '-',  true),
  ('multi',    'A', 'aal1', 'catalog',  null,                    'L1', false),
  ('multi',    'A', 'aal2', 'catalog',  null,                    'L1', true),
  ('multi',    'B', 'aal1', 'direct',   'booking.view.any',      '-',  false),
  ('multi',    'B', 'aal1', 'location', null,                    'LB', true),
  ('multi',    'B', 'aal1', 'decide',   'booking.view.any',      'LB', false),
  ('nobody',   'A', 'aal2', 'location', null,                    'L1', false),
  ('nobody',   'A', 'aal2', 'direct',   'booking.view.any',      '-',  false),
  ('viewer',   'A', 'aal1', 'direct',   'booking.view.any',      '-',  true),
  ('viewer',   'A', 'aal1', 'decide',   'booking.view.any',      'L2', true),
  ('viewer',   'A', 'aal1', 'decide',   'booking.cancel',        'L1', false),
  ('viewer',   'A', 'aal1', 'location', null,                    'L2', true),
  ('viewer',   'A', 'aal1', 'direct',   'staff.manage',          '-',  false),
  ('viewer',   'A', 'aal2', 'catalog',  null,                    'L1', false),
  ('viewer',   'B', 'aal1', 'direct',   'booking.view.any',      '-',  false),
  ('dup',      'A', 'aal1', 'direct',   'booking.view.any',      '-',  true),
  ('dup',      'A', 'aal1', 'decide',   'booking.cancel',        'L2', true),
  ('dup',      'A', 'aal1', 'decide',   'refund.issue',          'L1', false),
  ('dup',      'A', 'aal2', 'decide',   'refund.issue',          'L1', true),
  ('dup',      'A', 'aal2', 'catalog',  null,                    'L1', false),
  ('dup',      'A', 'aal1', 'direct',   'role.manage',           '-',  false),
  ('desk',     'A', 'aal1', 'decide',   'booking.view.any',      'L2', true),
  ('desk',     'A', 'aal1', 'decide',   'booking.view.any',      'L1', false),
  ('desk',     'A', 'aal1', 'decide',   'booking.check_in',      'L2', true),
  ('desk',     'A', 'aal1', 'decide',   'booking.cancel',        'L2', false),
  ('desk',     'A', 'aal1', 'direct',   'booking.view.any',      '-',  false),
  ('desk',     'A', 'aal1', 'location', null,                    'L1', false),
  ('desk',     'A', 'aal1', 'location', null,                    'L2', true),
  ('unplaced', 'A', 'aal1', 'location', null,                    'L1', false),
  ('unplaced', 'A', 'aal1', 'location', null,                    'L2', false),
  ('unplaced', 'A', 'aal1', 'decide',   'booking.view.any',      'L1', false),
  ('unplaced', 'A', 'aal1', 'decide',   'booking.check_in',      'L2', false),
  ('pinned',   'A', 'aal1', 'location', null,                    'L1', true),
  ('pinned',   'A', 'aal1', 'location', null,                    'L2', false),
  ('pinned',   'A', 'aal1', 'direct',   'booking.view.any',      '-',  true);

create function pg_temp.matrix_eval(p_actor uuid, p_aal text, p_tenant uuid, p_helper text, p_permission text, p_location uuid)
returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_actor, 'role', 'authenticated', 'aal', p_aal)::text, true);
  return coalesce(case p_helper
    when 'direct' then private.has_direct_capability(p_tenant, p_permission)
    when 'decide' then private.can_decide_booking(p_tenant, p_location, p_permission)
    when 'catalog' then private.can_manage_catalog(p_tenant, p_location)
    when 'staff' then private.can_manage_staff(p_tenant, p_location)
    when 'location' then private.can_access_location(p_tenant, p_location)
  end, false);
end $$;

select is(
  pg_temp.matrix_eval(a.id, m.aal, t.id, m.helper, m.permission, l.id),
  m.expected,
  format('%s in %s (%s): %s %s at %s -> %s', m.actor, m.tenant, m.aal, m.helper, coalesce(m.permission, ''), m.location,
    case when m.expected then 'allow' else 'deny' end))
from matrix m
join matrix_actor a on a.name = m.actor
join matrix_place t on t.name = m.tenant
join matrix_place l on l.name = m.location
order by m.ord;

select is((select count(*)::integer from matrix m where not exists (select 1 from matrix_actor a where a.name = m.actor)
  or not exists (select 1 from matrix_place l where l.name = m.location)), 0, 'every matrix row resolves to a real actor and place');

-- Through RLS: the same answers reach real reads.
select set_config('request.jwt.claims', '{"sub":"e1c00000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select array_agg(id order by id) from app.locations), array['a5000000-0000-0000-0000-000000000002'::uuid],
  'a location-scoped custom member reads exactly its location');
reset role;
select set_config('request.jwt.claims', '{"sub":"e1c00000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*)::integer from app.locations), 0, 'an assigned custom member with no location reads none');
reset role;
select set_config('request.jwt.claims', '{"sub":"e1c00000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*)::integer from app.locations), 2, 'a tenant-mode custom member with no rows reads every location');
reset role;

-- Shrinking a role's grants is effective on the very next check.
delete from app.role_permissions where role_id = 'aac00000-0000-4000-8000-000000000001' and permission_key = 'booking.view.any';
select is(pg_temp.matrix_eval('e1c00000-0000-4000-8000-000000000001', 'aal1', 'a0000000-0000-0000-0000-000000000001', 'direct', 'booking.view.any', null),
  false, 'a removed grant stops authorizing immediately');

select * from finish();
rollback;
