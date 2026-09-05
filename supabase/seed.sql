-- Local and CI seed entry point. Every identity and row below is synthetic,
-- deterministic, and reserved under example.invalid. No production-derived
-- values or provider credentials belong here.

select set_config('booking_platform.seed_class', 'synthetic-only', false);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'staff-a@example.invalid', '', '2026-09-05 00:00:00+00', '{"provider":"email","providers":["email"]}', '{}', '2026-09-05 00:00:00+00', '2026-09-05 00:00:00+00'),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'admin-a@example.invalid', '', '2026-09-05 00:00:00+00', '{"provider":"email","providers":["email"]}', '{}', '2026-09-05 00:00:00+00', '2026-09-05 00:00:00+00'),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'manager-a@example.invalid', '', '2026-09-05 00:00:00+00', '{"provider":"email","providers":["email"]}', '{}', '2026-09-05 00:00:00+00', '2026-09-05 00:00:00+00'),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'revoked-a@example.invalid', '', '2026-09-05 00:00:00+00', '{"provider":"email","providers":["email"]}', '{}', '2026-09-05 00:00:00+00', '2026-09-05 00:00:00+00'),
  ('00000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'staff-b@example.invalid', '', '2026-09-05 00:00:00+00', '{"provider":"email","providers":["email"]}', '{}', '2026-09-05 00:00:00+00', '2026-09-05 00:00:00+00'),
  ('00000000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'multi-tenant@example.invalid', '', '2026-09-05 00:00:00+00', '{"provider":"email","providers":["email"]}', '{}', '2026-09-05 00:00:00+00', '2026-09-05 00:00:00+00'),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'no-membership@example.invalid', '', '2026-09-05 00:00:00+00', '{"provider":"email","providers":["email"]}', '{}', '2026-09-05 00:00:00+00', '2026-09-05 00:00:00+00')
on conflict (id) do nothing;

insert into app.tenants (id, name, status, created_at, updated_at)
values
  ('a0000000-0000-0000-0000-000000000001', 'Synthetic Tenant A', 'active', '2026-09-05 00:00:00+00', '2026-09-05 00:00:00+00'),
  ('b0000000-0000-0000-0000-000000000001', 'Synthetic Tenant B', 'active', '2026-09-05 00:00:00+00', '2026-09-05 00:00:00+00');

insert into app.brands (id, tenant_id, key, status, created_at, updated_at)
values
  ('a4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'synthetic-a', 'active', '2026-09-05 00:00:00+00', '2026-09-05 00:00:00+00'),
  ('b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'synthetic-b', 'active', '2026-09-05 00:00:00+00', '2026-09-05 00:00:00+00');

insert into app.brand_revisions (
  id, tenant_id, brand_id, revision, state, config_version, created_at, published_at
)
values
  ('a4100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 1, 'published', 3, '2026-09-05 00:00:00+00', '2026-09-05 00:00:00+00'),
  ('b4100000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 1, 'published', 3, '2026-09-05 00:00:00+00', '2026-09-05 00:00:00+00');

insert into app.instances (
  id, tenant_id, brand_id, published_brand_revision_id, deployment_state,
  created_at, updated_at
)
values
  ('a4200000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'a4100000-0000-0000-0000-000000000001', 'active', '2026-09-05 00:00:00+00', '2026-09-05 00:00:00+00'),
  ('b4200000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'b4100000-0000-0000-0000-000000000001', 'active', '2026-09-05 00:00:00+00', '2026-09-05 00:00:00+00');

insert into app.tenant_domains (
  id, tenant_id, instance_id, hostname, application, kind,
  verification_status, verified_at, active, created_at, updated_at
)
values
  ('a4300000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a4200000-0000-0000-0000-000000000001', 'client.tenant-a.example.invalid', 'client', 'production', 'verified', '2026-09-05 00:00:00+00', true, '2026-09-05 00:00:00+00', '2026-09-05 00:00:00+00'),
  ('a4300000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a4200000-0000-0000-0000-000000000001', 'dashboard.tenant-a.example.invalid', 'dashboard', 'production', 'verified', '2026-09-05 00:00:00+00', true, '2026-09-05 00:00:00+00', '2026-09-05 00:00:00+00'),
  ('a4300000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'a4200000-0000-0000-0000-000000000001', 'preview.tenant-a.example.invalid', 'client', 'preview', 'pending', null, false, '2026-09-05 00:00:00+00', '2026-09-05 00:00:00+00'),
  ('b4300000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'b4200000-0000-0000-0000-000000000001', 'client.tenant-b.example.invalid', 'client', 'production', 'verified', '2026-09-05 00:00:00+00', true, '2026-09-05 00:00:00+00', '2026-09-05 00:00:00+00'),
  ('b4300000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'b4200000-0000-0000-0000-000000000001', 'dashboard.tenant-b.example.invalid', 'dashboard', 'production', 'verified', '2026-09-05 00:00:00+00', true, '2026-09-05 00:00:00+00', '2026-09-05 00:00:00+00');

insert into app.tenant_settings (
  tenant_id, default_locale, config_version, feature_version, revision, updated_at
)
values
  ('a0000000-0000-0000-0000-000000000001', 'en', 3, 1, 1, '2026-09-05 00:00:00+00'),
  ('b0000000-0000-0000-0000-000000000001', 'ar', 3, 1, 1, '2026-09-05 00:00:00+00');

insert into app.locations (id, tenant_id, key, name, time_zone, status, created_at, updated_at)
values
  ('a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'location-a-one', 'Synthetic Location A One', 'America/New_York', 'active', '2026-09-05 00:00:00+00', '2026-09-05 00:00:00+00'),
  ('a5000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'location-a-two', 'Synthetic Location A Two', 'America/Chicago', 'active', '2026-09-05 00:00:00+00', '2026-09-05 00:00:00+00'),
  ('b5000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'location-b-one', 'Synthetic Location B One', 'America/Denver', 'active', '2026-09-05 00:00:00+00', '2026-09-05 00:00:00+00');

insert into app.roles (id, tenant_id, key, location_scope_mode, created_at)
values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'staff', 'assigned', '2026-09-05 00:00:00+00'),
  ('a2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'scheduler', 'tenant', '2026-09-05 00:00:00+00'),
  ('a2000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'location_manager', 'assigned', '2026-09-05 00:00:00+00'),
  ('a2000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'tenant_admin', 'tenant', '2026-09-05 00:00:00+00'),
  ('b2000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'staff', 'assigned', '2026-09-05 00:00:00+00'),
  ('b2000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'scheduler', 'tenant', '2026-09-05 00:00:00+00'),
  ('b2000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'location_manager', 'assigned', '2026-09-05 00:00:00+00'),
  ('b2000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'tenant_admin', 'tenant', '2026-09-05 00:00:00+00');

insert into app.role_permissions (
  tenant_id, role_id, permission_key, grant_kind, scope_kind, created_at
)
select role.tenant_id, role.id, permission.permission_key, permission.grant_kind,
  permission.scope_kind, '2026-09-05 00:00:00+00'::timestamptz
from app.roles as role
join (
  values
    ('staff', 'booking.view.own', 'direct', 'own'),
    ('staff', 'booking.create_on_behalf', 'direct', 'own'),
    ('staff', 'booking.approve', 'direct', 'own'),
    ('staff', 'booking.reschedule', 'direct', 'own'),
    ('staff', 'booking.cancel', 'direct', 'own'),
    ('staff', 'refund.issue', 'approval', 'own'),
    ('staff', 'booking.check_in', 'direct', 'own'),
    ('staff', 'booking.mark_no_show', 'direct', 'own'),
    ('staff', 'booking.complete', 'direct', 'own'),
    ('staff', 'schedule.edit', 'direct', 'own'),
    ('staff', 'customer.pii.view', 'direct', 'own'),
    ('scheduler', 'booking.view.own', 'direct', 'tenant'),
    ('scheduler', 'booking.view.any', 'direct', 'tenant'),
    ('scheduler', 'booking.create_on_behalf', 'direct', 'tenant'),
    ('scheduler', 'booking.approve', 'direct', 'tenant'),
    ('scheduler', 'booking.reschedule', 'direct', 'tenant'),
    ('scheduler', 'booking.cancel', 'direct', 'tenant'),
    ('scheduler', 'refund.issue', 'approval', 'tenant'),
    ('scheduler', 'booking.check_in', 'direct', 'tenant'),
    ('scheduler', 'booking.check_in_override', 'direct', 'tenant'),
    ('scheduler', 'booking.mark_no_show', 'direct', 'tenant'),
    ('scheduler', 'booking.complete', 'direct', 'tenant'),
    ('scheduler', 'booking.correct_status', 'direct', 'tenant'),
    ('scheduler', 'catalog.edit', 'approval', 'tenant'),
    ('scheduler', 'schedule.edit', 'direct', 'tenant'),
    ('scheduler', 'customer.pii.view', 'direct', 'tenant'),
    ('location_manager', 'booking.view.own', 'direct', 'location'),
    ('location_manager', 'booking.view.any', 'direct', 'location'),
    ('location_manager', 'booking.create_on_behalf', 'direct', 'location'),
    ('location_manager', 'booking.approve', 'direct', 'location'),
    ('location_manager', 'booking.reschedule', 'direct', 'location'),
    ('location_manager', 'booking.cancel', 'direct', 'location'),
    ('location_manager', 'refund.issue', 'approval', 'location'),
    ('location_manager', 'booking.check_in', 'direct', 'location'),
    ('location_manager', 'booking.check_in_override', 'direct', 'location'),
    ('location_manager', 'booking.mark_no_show', 'direct', 'location'),
    ('location_manager', 'booking.complete', 'direct', 'location'),
    ('location_manager', 'booking.correct_status', 'direct', 'location'),
    ('location_manager', 'catalog.edit', 'approval', 'location'),
    ('location_manager', 'schedule.edit', 'direct', 'location'),
    ('location_manager', 'staff.manage', 'approval', 'location'),
    ('location_manager', 'policy.edit', 'direct', 'location'),
    ('location_manager', 'customer.pii.view', 'direct', 'location'),
    ('location_manager', 'audit.read', 'direct', 'location'),
    ('tenant_admin', 'booking.view.own', 'direct', 'tenant'),
    ('tenant_admin', 'booking.view.any', 'direct', 'tenant'),
    ('tenant_admin', 'booking.create_on_behalf', 'direct', 'tenant'),
    ('tenant_admin', 'booking.approve', 'direct', 'tenant'),
    ('tenant_admin', 'booking.reschedule', 'direct', 'tenant'),
    ('tenant_admin', 'booking.cancel', 'direct', 'tenant'),
    ('tenant_admin', 'refund.issue', 'direct', 'tenant'),
    ('tenant_admin', 'booking.check_in', 'direct', 'tenant'),
    ('tenant_admin', 'booking.check_in_override', 'direct', 'tenant'),
    ('tenant_admin', 'booking.mark_no_show', 'direct', 'tenant'),
    ('tenant_admin', 'booking.complete', 'direct', 'tenant'),
    ('tenant_admin', 'booking.correct_status', 'direct', 'tenant'),
    ('tenant_admin', 'catalog.edit', 'direct', 'tenant'),
    ('tenant_admin', 'schedule.edit', 'direct', 'tenant'),
    ('tenant_admin', 'staff.manage', 'direct', 'tenant'),
    ('tenant_admin', 'policy.edit', 'direct', 'tenant'),
    ('tenant_admin', 'customer.pii.view', 'direct', 'tenant'),
    ('tenant_admin', 'customer.data.export', 'approval', 'tenant'),
    ('tenant_admin', 'customer.data.export_on_behalf', 'approval', 'tenant'),
    ('tenant_admin', 'customer.data.correct', 'direct', 'tenant'),
    ('tenant_admin', 'brand.manage', 'direct', 'tenant'),
    ('tenant_admin', 'integration.manage', 'direct', 'tenant'),
    ('tenant_admin', 'billing.view', 'direct', 'tenant'),
    ('tenant_admin', 'billing.change_plan', 'approval', 'tenant'),
    ('tenant_admin', 'support.grant_access', 'direct', 'tenant'),
    ('tenant_admin', 'audit.read', 'direct', 'tenant'),
    ('tenant_admin', 'instance.request_update', 'direct', 'tenant'),
    ('tenant_admin', 'tenant.owner_transfer', 'approval', 'tenant')
) as permission(role_key, permission_key, grant_kind, scope_kind)
  on permission.role_key = role.key;

insert into app.memberships (
  id, tenant_id, auth_user_id, role_id, status, revision, joined_at, revoked_at
)
values
  ('a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'active', 1, '2026-09-05 00:00:00+00', null),
  ('a3000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000004', 'active', 1, '2026-09-05 00:00:00+00', null),
  ('a3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000003', 'active', 1, '2026-09-05 00:00:00+00', null),
  ('a3000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004', 'a2000000-0000-0000-0000-000000000001', 'revoked', 2, '2026-09-05 00:00:00+00', '2026-09-05 01:00:00+00'),
  ('b3000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'active', 1, '2026-09-05 00:00:00+00', null),
  ('a3000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'active', 1, '2026-09-05 00:00:00+00', null),
  ('b3000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'active', 1, '2026-09-05 00:00:00+00', null);

insert into app.membership_location_scopes (
  tenant_id, membership_id, location_id, created_at
)
values
  ('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', '2026-09-05 00:00:00+00'),
  ('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000003', 'a5000000-0000-0000-0000-000000000001', '2026-09-05 00:00:00+00'),
  ('b0000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001', '2026-09-05 00:00:00+00'),
  ('b0000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000002', 'b5000000-0000-0000-0000-000000000001', '2026-09-05 00:00:00+00');

insert into app.invitations (
  id, tenant_id, role_id, invited_by_membership_id, invitee_email, token_hash,
  status, expires_at, accepted_at, created_at, updated_at
)
values
  ('a6000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000002', 'pending-a@example.invalid', repeat('a', 64), 'pending', '2027-09-05 00:00:00+00', null, '2026-09-05 00:00:00+00', '2026-09-05 00:00:00+00'),
  ('b6000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', 'pending-b@example.invalid', repeat('b', 64), 'pending', '2027-09-05 00:00:00+00', null, '2026-09-05 00:00:00+00', '2026-09-05 00:00:00+00');

insert into app.invitation_location_scopes (
  tenant_id, invitation_id, location_id, created_at
)
values
  ('a0000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', '2026-09-05 00:00:00+00'),
  ('b0000000-0000-0000-0000-000000000001', 'b6000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001', '2026-09-05 00:00:00+00');

-- Published catalog fixtures are synthetic and deliberately bilingual.
insert into app.catalog_publications (id, tenant_id, revision, state, published_at, published_by)
values ('a7000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',1,'published','2026-09-05 00:00:00+00','a1000000-0000-0000-0000-000000000002'),
       ('b7000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001',1,'published','2026-09-05 00:00:00+00','b1000000-0000-0000-0000-000000000001');
insert into app.catalog_categories (id,tenant_id,key) values
 ('a7100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','consultations'),
 ('b7100000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','consultations');
insert into app.catalog_services (id,tenant_id,key,category_id) values
 ('a7200000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','initial-consultation','a7100000-0000-0000-0000-000000000001'),
 ('b7200000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','initial-consultation','b7100000-0000-0000-0000-000000000001');
insert into app.catalog_category_revisions (id,tenant_id,category_id,revision,locale,state,name,publication_id,published_at) values
 ('a7110000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a7100000-0000-0000-0000-000000000001',1,'en','published','Consultations','a7000000-0000-0000-0000-000000000001','2026-09-05 00:00:00+00'),
 ('a7110000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','a7100000-0000-0000-0000-000000000001',1,'ar','published','الاستشارات','a7000000-0000-0000-0000-000000000001','2026-09-05 00:00:00+00');
insert into app.catalog_service_revisions (id,tenant_id,service_id,revision,locale,state,name,description,canonical_path,duration_minutes,price_minor,currency,intake_schema,publication_id,published_at) values
 ('a7210000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001',1,'en','published','Initial consultation','A focused first conversation.','/services/initial-consultation',45,18000,'SAR','{"fields":[]}'::jsonb,'a7000000-0000-0000-0000-000000000001','2026-09-05 00:00:00+00'),
 ('a7210000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001',1,'ar','published','استشارة أولية','محادثة أولى مركّزة.','/services/initial-consultation',45,18000,'SAR','{"fields":[]}'::jsonb,'a7000000-0000-0000-0000-000000000001','2026-09-05 00:00:00+00');
insert into app.catalog_location_revisions (id,tenant_id,location_id,revision,locale,state,name,description,address,canonical_path,publication_id,published_at) values
 ('a7310000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',1,'en','published','Downtown','Our central location.','Main Street','/locations/location-a-one','a7000000-0000-0000-0000-000000000001','2026-09-05 00:00:00+00'),
 ('a7310000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',1,'ar','published','وسط المدينة','موقعنا الرئيسي.','الشارع الرئيسي','/locations/location-a-one','a7000000-0000-0000-0000-000000000001','2026-09-05 00:00:00+00');
insert into app.catalog_service_locations (tenant_id,service_id,location_id) values ('a0000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001');
