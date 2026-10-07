-- Custom roles must not change anybody's access (ADR-0019). Every seeded member,
-- and every member shape of the e2e completion fixture, is checked against
-- explicit values written down from the seed data as it stood before custom
-- roles: the locations each one reaches and the grants each one holds. The
-- one addition is role.manage, which only the tenant administrators gain.
begin;
select no_plan();

create function pg_temp.reach(p_user uuid, p_tenant uuid) returns uuid[]
language plpgsql as $$
declare v uuid[];
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select coalesce(array_agg(l.id order by l.id), '{}') into v
  from app.locations l where l.tenant_id = p_tenant and private.can_access_location(p_tenant, l.id);
  perform set_config('request.jwt.claims', null, true);
  return v;
end $$;

create function pg_temp.grants(p_membership uuid) returns text[]
language sql as $$
  select coalesce(array_agg(rp.permission_key || ':' || rp.grant_kind || ':' || rp.scope_kind order by rp.permission_key), '{}')
  from app.memberships m join app.role_permissions rp on rp.tenant_id = m.tenant_id and rp.role_id = m.role_id
  where m.id = p_membership and rp.permission_key <> 'role.manage';
$$;

-- The grant tables of supabase/seed.sql, as they were before this change.
create temp table expected_grants (role_key text primary key, grants text[]);
insert into expected_grants values
  ('staff', array['booking.approve:direct:own','booking.cancel:direct:own','booking.check_in:direct:own','booking.complete:direct:own','booking.create_on_behalf:direct:own','booking.mark_no_show:direct:own','booking.reschedule:direct:own','booking.view.own:direct:own','customer.pii.view:direct:own','refund.issue:approval:own','schedule.edit:direct:own']),
  ('scheduler', array['booking.approve:direct:tenant','booking.cancel:direct:tenant','booking.check_in:direct:tenant','booking.check_in_override:direct:tenant','booking.complete:direct:tenant','booking.correct_status:direct:tenant','booking.create_on_behalf:direct:tenant','booking.mark_no_show:direct:tenant','booking.reschedule:direct:tenant','booking.view.any:direct:tenant','booking.view.own:direct:tenant','catalog.edit:approval:tenant','customer.pii.view:direct:tenant','refund.issue:approval:tenant','schedule.edit:direct:tenant']),
  ('location_manager', array['audit.read:direct:location','booking.approve:direct:location','booking.cancel:direct:location','booking.check_in:direct:location','booking.check_in_override:direct:location','booking.complete:direct:location','booking.correct_status:direct:location','booking.create_on_behalf:direct:location','booking.mark_no_show:direct:location','booking.reschedule:direct:location','booking.view.any:direct:location','booking.view.own:direct:location','catalog.edit:approval:location','customer.pii.view:direct:location','policy.edit:direct:location','refund.issue:approval:location','schedule.edit:direct:location','staff.manage:approval:location']),
  ('tenant_admin', array['audit.read:direct:tenant','billing.change_plan:approval:tenant','billing.view:direct:tenant','booking.approve:direct:tenant','booking.cancel:direct:tenant','booking.check_in:direct:tenant','booking.check_in_override:direct:tenant','booking.complete:direct:tenant','booking.correct_status:direct:tenant','booking.create_on_behalf:direct:tenant','booking.mark_no_show:direct:tenant','booking.reschedule:direct:tenant','booking.view.any:direct:tenant','booking.view.own:direct:tenant','brand.manage:direct:tenant','catalog.edit:direct:tenant','customer.data.correct:direct:tenant','customer.data.delete:approval:tenant','customer.data.export:approval:tenant','customer.data.export_on_behalf:approval:tenant','customer.data.restrict:direct:tenant','customer.pii.view:direct:tenant','instance.request_update:direct:tenant','integration.manage:direct:tenant','policy.edit:direct:tenant','refund.issue:direct:tenant','schedule.edit:direct:tenant','staff.manage:direct:tenant','support.grant_access:direct:tenant','tenant.owner_transfer:approval:tenant']);

-- Every seeded membership: who, where they reached before, what they held.
create temp table expected_access (membership uuid, auth_user uuid, tenant uuid, role_key text, reach uuid[], administrator boolean, label text);
insert into expected_access values
  ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'staff',
    array['a5000000-0000-0000-0000-000000000001']::uuid[], false, 'Tenant A staff'),
  ('a3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'tenant_admin',
    array['a5000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000002']::uuid[], true, 'Tenant A admin'),
  ('a3000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'location_manager',
    array['a5000000-0000-0000-0000-000000000001']::uuid[], false, 'Tenant A location manager'),
  ('a3000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'staff',
    array[]::uuid[], false, 'Tenant A revoked member'),
  ('a3000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'scheduler',
    array['a5000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000002']::uuid[], false, 'multi-tenant user in A (scheduler)'),
  ('b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'staff',
    array['b5000000-0000-0000-0000-000000000001']::uuid[], false, 'Tenant B staff'),
  ('b3000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'staff',
    array['b5000000-0000-0000-0000-000000000001']::uuid[], false, 'multi-tenant user in B (staff)');

select is((select count(*)::integer from app.memberships where tenant_id in ('a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001')),
  (select count(*)::integer from expected_access), 'every seeded membership is covered');
select is((select r.key from app.memberships m join app.roles r on r.tenant_id = m.tenant_id and r.id = m.role_id where m.id = e.membership),
  e.role_key, e.label || ': still holds the same role') from expected_access e;
select is(pg_temp.reach(e.auth_user, e.tenant), e.reach, e.label || ': reaches exactly the same locations') from expected_access e;
select is(pg_temp.grants(e.membership), g.grants, e.label || ': holds exactly the same grants')
from expected_access e join expected_grants g on g.role_key = e.role_key;
select is(exists (select 1 from app.memberships m join app.role_permissions rp on rp.tenant_id = m.tenant_id and rp.role_id = m.role_id
    where m.id = e.membership and rp.permission_key = 'role.manage' and rp.grant_kind = 'approval' and rp.scope_kind = 'tenant'),
  e.administrator, e.label || ': gains role.manage only as an administrator') from expected_access e;

-- ---------------------------------------------------------------------------
-- The e2e completion fixture's member shapes (tests/e2e/fixtures/
-- dashboard-completion.sql): Tenant admin with no location row, a scheduler
-- pinned to one location, staff and a location manager on that location, and a
-- revoked staff member. Recreated here exactly as the fixture writes them.
-- ---------------------------------------------------------------------------
insert into app.tenants (id, name) values ('d0c00000-0000-4000-8000-000000000001', 'Completion shape');
insert into app.locations (id, tenant_id, key, name, time_zone)
values ('d5c00000-0000-4000-8000-000000000001', 'd0c00000-0000-4000-8000-000000000001', 'one', 'One', 'America/New_York'),
       ('d5c00000-0000-4000-8000-000000000002', 'd0c00000-0000-4000-8000-000000000001', 'two', 'Two', 'America/New_York');
insert into app.roles (id, tenant_id, key, location_scope_mode)
values ('d2c00000-0000-4000-8000-000000000001', 'd0c00000-0000-4000-8000-000000000001', 'tenant_admin', 'tenant'),
       ('d2c00000-0000-4000-8000-000000000002', 'd0c00000-0000-4000-8000-000000000001', 'scheduler', 'tenant'),
       ('d2c00000-0000-4000-8000-000000000003', 'd0c00000-0000-4000-8000-000000000001', 'staff', 'assigned'),
       ('d2c00000-0000-4000-8000-000000000004', 'd0c00000-0000-4000-8000-000000000001', 'location_manager', 'assigned');
-- The fixture clones Tenant A's built-in grants role by role.
insert into app.role_permissions (tenant_id, role_id, permission_key, grant_kind, scope_kind)
select target.tenant_id, target.id, source.permission_key, source.grant_kind, source.scope_kind
from app.roles target
join app.roles base on base.tenant_id = 'a0000000-0000-0000-0000-000000000001' and base.key = target.key
join app.role_permissions source on source.tenant_id = base.tenant_id and source.role_id = base.id
where target.tenant_id = 'd0c00000-0000-4000-8000-000000000001';
insert into app.memberships (id, tenant_id, auth_user_id, role_id, status, revoked_at)
values ('d3c00000-0000-4000-8000-000000000001', 'd0c00000-0000-4000-8000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'd2c00000-0000-4000-8000-000000000001', 'active', null),
       ('d3c00000-0000-4000-8000-000000000002', 'd0c00000-0000-4000-8000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'd2c00000-0000-4000-8000-000000000002', 'active', null),
       ('d3c00000-0000-4000-8000-000000000003', 'd0c00000-0000-4000-8000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'd2c00000-0000-4000-8000-000000000003', 'active', null),
       ('d3c00000-0000-4000-8000-000000000004', 'd0c00000-0000-4000-8000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'd2c00000-0000-4000-8000-000000000004', 'active', null),
       ('d3c00000-0000-4000-8000-000000000005', 'd0c00000-0000-4000-8000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'd2c00000-0000-4000-8000-000000000003', 'revoked', now());
insert into app.membership_location_scopes (tenant_id, membership_id, location_id)
select 'd0c00000-0000-4000-8000-000000000001', m, 'd5c00000-0000-4000-8000-000000000001'
from unnest(array['d3c00000-0000-4000-8000-000000000002','d3c00000-0000-4000-8000-000000000003',
  'd3c00000-0000-4000-8000-000000000004','d3c00000-0000-4000-8000-000000000005']::uuid[]) m;

create temp table expected_fixture (membership uuid, auth_user uuid, role_key text, reach uuid[], label text);
insert into expected_fixture values
  ('d3c00000-0000-4000-8000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'tenant_admin',
    array['d5c00000-0000-4000-8000-000000000001','d5c00000-0000-4000-8000-000000000002']::uuid[], 'fixture admin'),
  ('d3c00000-0000-4000-8000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'scheduler',
    array['d5c00000-0000-4000-8000-000000000001']::uuid[], 'fixture scheduler (tenant mode, one row)'),
  ('d3c00000-0000-4000-8000-000000000003', 'a1000000-0000-0000-0000-000000000003', 'staff',
    array['d5c00000-0000-4000-8000-000000000001']::uuid[], 'fixture staff'),
  ('d3c00000-0000-4000-8000-000000000004', 'b1000000-0000-0000-0000-000000000001', 'location_manager',
    array['d5c00000-0000-4000-8000-000000000001']::uuid[], 'fixture manager'),
  ('d3c00000-0000-4000-8000-000000000005', 'c1000000-0000-0000-0000-000000000001', 'staff',
    array[]::uuid[], 'fixture revoked');
select is(pg_temp.reach(f.auth_user, 'd0c00000-0000-4000-8000-000000000001'), f.reach, f.label || ': reaches exactly the same locations')
from expected_fixture f;
select is(pg_temp.grants(f.membership), g.grants, f.label || ': holds exactly the same grants')
from expected_fixture f join expected_grants g on g.role_key = f.role_key;

-- The fail-closed rule only bites a shape that no RPC can create any more:
-- assigned mode with no row. The backfill gives exactly that shape every
-- location, so it keeps reaching what it reached before.
insert into app.memberships (id, tenant_id, auth_user_id, role_id)
values ('d3c00000-0000-4000-8000-000000000006', 'd0c00000-0000-4000-8000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'd2c00000-0000-4000-8000-000000000003');
select is(pg_temp.reach('d1000000-0000-0000-0000-000000000001', 'd0c00000-0000-4000-8000-000000000001'), array[]::uuid[],
  'an unplaced assigned member reaches nothing (fail closed)');
select ok((select members = 1 and member_rows = 2 from private.backfill_assigned_location_scopes_v1()), 'the backfill places exactly that member');
select is(pg_temp.reach('d1000000-0000-0000-0000-000000000001', 'd0c00000-0000-4000-8000-000000000001'),
  array['d5c00000-0000-4000-8000-000000000001','d5c00000-0000-4000-8000-000000000002']::uuid[],
  'and it reaches the whole tenant again, as it did before custom roles');

select * from finish();
rollback;
