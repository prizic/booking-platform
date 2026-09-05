begin;

select plan(31);

set local role anon;
select is((select count(*)::integer from app.tenant_domains), 4, 'anonymous sees only verified active production domains');
select throws_like(
  $$select * from app.locations$$,
  '%permission denied%',
  'anonymous has no private location-table grant'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*)::integer from app.locations), 1, 'assigned staff sees one assigned location');
select is((select count(*)::integer from app.locations where tenant_id = 'b0000000-0000-0000-0000-000000000001'), 0, 'Tenant A staff sees no Tenant B location');
select is((select count(*)::integer from app.memberships), 1, 'staff sees only their own membership');
select is((select count(*)::integer from app.invitations), 0, 'staff cannot read invitations');
select throws_like(
  $$insert into app.invitations (id, tenant_id, role_id, invited_by_membership_id, invitee_email, token_hash, expires_at)
    values ('a6000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'denied@example.invalid', repeat('d', 64), '2027-09-05 00:00:00+00')$$,
  '%row-level security%',
  'staff cannot create invitations'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*)::integer from app.locations), 1, 'location manager sees only the assigned location');
select is((select count(*)::integer from app.invitations), 0, 'approval-only staff.manage does not grant invitation access');
update app.tenant_settings
set revision = revision + 1
where tenant_id = 'a0000000-0000-0000-0000-000000000001';
select is(
  (select revision from app.tenant_settings where tenant_id = 'a0000000-0000-0000-0000-000000000001'),
  1,
  'location-scoped policy.edit cannot mutate tenant-wide settings'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is((select count(*)::integer from app.locations), 2, 'tenant admin sees every location in their tenant');
select is((select count(*)::integer from app.locations where tenant_id = 'b0000000-0000-0000-0000-000000000001'), 0, 'tenant admin sees no other-tenant locations');
select is((select count(*)::integer from app.memberships), 5, 'tenant admin can manage memberships only in their tenant');
select is((select count(*)::integer from app.invitations), 1, 'tenant admin sees their tenant invitation');
insert into app.invitations (id, tenant_id, role_id, invited_by_membership_id, invitee_email, token_hash, expires_at)
values ('a6000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000002', 'allowed@example.invalid', repeat('c', 64), '2027-09-05 00:00:00+00');
select is(
  (select count(*)::integer from app.invitations where id = 'a6000000-0000-0000-0000-000000000010'),
  1,
  'tenant admin can create a same-tenant invitation as themselves'
);
update app.invitations
set expires_at = '2027-10-05 00:00:00+00'
where id = 'a6000000-0000-0000-0000-000000000010';
select is(
  (select count(*)::integer from app.invitations where id = 'a6000000-0000-0000-0000-000000000010' and expires_at = '2027-10-05 00:00:00+00'),
  1,
  'tenant admin can update a same-tenant invitation'
);
insert into app.invitation_location_scopes (
  tenant_id, invitation_id, location_id
)
values (
  'a0000000-0000-0000-0000-000000000001',
  'a6000000-0000-0000-0000-000000000010',
  'a5000000-0000-0000-0000-000000000001'
);
select is(
  (select count(*)::integer from app.invitation_location_scopes where invitation_id = 'a6000000-0000-0000-0000-000000000010'),
  1,
  'tenant admin can add a same-tenant invitation location scope'
);
update app.invitation_location_scopes
set created_at = '2026-09-05 00:01:00+00'
where invitation_id = 'a6000000-0000-0000-0000-000000000010';
select is(
  (select count(*)::integer from app.invitation_location_scopes where invitation_id = 'a6000000-0000-0000-0000-000000000010' and created_at = '2026-09-05 00:01:00+00'),
  1,
  'tenant admin can update a same-tenant invitation location scope'
);
select throws_like(
  $$insert into app.invitation_location_scopes (tenant_id, invitation_id, location_id)
    values ('b0000000-0000-0000-0000-000000000001', 'b6000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001')$$,
  '%row-level security%',
  'Tenant A admin cannot create a Tenant B invitation scope'
);
delete from app.invitation_location_scopes
where invitation_id = 'a6000000-0000-0000-0000-000000000010';
select is(
  (select count(*)::integer from app.invitation_location_scopes where invitation_id = 'a6000000-0000-0000-0000-000000000010'),
  0,
  'tenant admin can delete a same-tenant invitation location scope'
);
delete from app.invitations
where id = 'a6000000-0000-0000-0000-000000000010';
select is(
  (select count(*)::integer from app.invitations where id = 'a6000000-0000-0000-0000-000000000010'),
  0,
  'tenant admin can delete a same-tenant invitation'
);
select throws_like(
  $$insert into app.invitations (id, tenant_id, role_id, invited_by_membership_id, invitee_email, token_hash, expires_at)
    values ('b6000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', 'cross-tenant@example.invalid', repeat('e', 64), '2027-09-05 00:00:00+00')$$,
  '%row-level security%',
  'Tenant A admin cannot create a Tenant B invitation'
);
update app.tenant_settings
set revision = revision + 1
where tenant_id = 'a0000000-0000-0000-0000-000000000001';
select is(
  (select revision from app.tenant_settings where tenant_id = 'a0000000-0000-0000-0000-000000000001'),
  2,
  'tenant-scoped policy.edit can mutate same-tenant settings'
);
update app.tenant_settings
set revision = revision + 1
where tenant_id = 'b0000000-0000-0000-0000-000000000001';
select is(
  (select revision from app.tenant_settings where tenant_id = 'b0000000-0000-0000-0000-000000000001'),
  1,
  'Tenant A admin cannot mutate Tenant B settings'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*)::integer from app.locations), 1, 'Tenant B staff sees the assigned Tenant B location');
select is((select count(*)::integer from app.locations where tenant_id = 'a0000000-0000-0000-0000-000000000001'), 0, 'Tenant B staff sees no Tenant A locations');

reset role;
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*)::integer from app.locations), 3, 'multi-tenant user receives the union of independently scoped memberships');

reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is((select count(*)::integer from app.locations), 0, 'revoked membership has no location access');
select is((select count(*)::integer from app.invitations), 0, 'revoked membership has no invitation access');

reset role;
set local role service_role;
select throws_like(
  $$select * from app.tenants$$,
  '%permission denied%',
  'generic service_role is not treated as an implicitly trusted worker'
);
select throws_like(
  $$select * from app.locations$$,
  '%permission denied%',
  'future workers require a narrow audited surface instead of RLS bypass access'
);

reset role;
select * from finish();
rollback;
