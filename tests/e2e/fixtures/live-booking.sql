-- Issue #94's browser fixture is intentionally outside supabase/seed.sql. It
-- creates a third tenant after every local reset, so the existing deterministic
-- pgTAP counts and Tenant A/B permissions cannot be changed by the live journey.
-- `dashboard_password` is generated in memory by the test runner and is never
-- committed, printed, or passed into either application process.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change_token, reauthentication_token,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  'e1000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'live-dashboard@example.invalid',
  crypt(:'dashboard_password', gen_salt('bf')),
  statement_timestamp(),
  '', '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  statement_timestamp(),
  statement_timestamp()
)
on conflict (id) do update
set encrypted_password = excluded.encrypted_password,
    email_confirmed_at = excluded.email_confirmed_at,
    updated_at = excluded.updated_at;

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, created_at, updated_at
)
values (
  'e1100000-0000-0000-0000-000000000001',
  'live-dashboard@example.invalid',
  'e1000000-0000-0000-0000-000000000001',
  '{"sub":"e1000000-0000-0000-0000-000000000001","email":"live-dashboard@example.invalid"}'::jsonb,
  'email',
  statement_timestamp(),
  statement_timestamp()
)
on conflict (id) do update
set identity_data = excluded.identity_data,
    updated_at = excluded.updated_at;

insert into app.tenants (id, name, status)
values ('e0000000-0000-0000-0000-000000000001', 'Live booking E2E tenant', 'active');

insert into app.brands (id, tenant_id, key, status)
values ('e4000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'live-booking-e2e', 'active');

insert into app.brand_revisions (
  id, tenant_id, brand_id, revision, state, config_version, published_at
)
values (
  'e4100000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001',
  'e4000000-0000-0000-0000-000000000001',
  1, 'published', 3, statement_timestamp()
);

insert into app.instances (
  id, tenant_id, brand_id, published_brand_revision_id, deployment_state
)
values (
  'e4200000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001',
  'e4000000-0000-0000-0000-000000000001',
  'e4100000-0000-0000-0000-000000000001',
  'active'
);

insert into app.tenant_domains (
  id, tenant_id, instance_id, hostname, application, kind, verification_status,
  verified_at, active
)
values
  ('e4300000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'e4200000-0000-0000-0000-000000000001', 'client.live-booking.example.invalid', 'client', 'production', 'verified', statement_timestamp(), true),
  ('e4300000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 'e4200000-0000-0000-0000-000000000001', 'dashboard.live-booking.example.invalid', 'dashboard', 'production', 'verified', statement_timestamp(), true);

insert into app.tenant_settings (tenant_id, default_locale, config_version, feature_version, revision)
values ('e0000000-0000-0000-0000-000000000001', 'en', 3, 1, 1);

insert into app.locations (id, tenant_id, key, name, time_zone, status)
values ('e5000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'live-booking', 'Live booking suite', 'America/New_York', 'active');

insert into app.catalog_publications (id, tenant_id, revision, state, published_at, published_by)
values ('e7000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 1, 'published', statement_timestamp(), 'e1000000-0000-0000-0000-000000000001');

insert into app.catalog_categories (id, tenant_id, key)
values ('e7100000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'live-booking');

insert into app.catalog_category_revisions (id, tenant_id, category_id, revision, locale, state, name, publication_id, published_at)
values
  ('e7110000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'e7100000-0000-0000-0000-000000000001', 1, 'en', 'published', 'Live booking', 'e7000000-0000-0000-0000-000000000001', statement_timestamp()),
  ('e7110000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 'e7100000-0000-0000-0000-000000000001', 1, 'ar', 'published', 'حجز مباشر', 'e7000000-0000-0000-0000-000000000001', statement_timestamp());

insert into app.catalog_services (id, tenant_id, key, category_id)
values ('e7200000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'live-consultation', 'e7100000-0000-0000-0000-000000000001');

insert into app.catalog_service_revisions (
  id, tenant_id, service_id, revision, locale, state, name, description,
  canonical_path, duration_minutes, price_minor, currency, intake_schema, policy,
  publication_id, published_at
)
values
  ('e7210000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'e7200000-0000-0000-0000-000000000001', 1, 'en', 'published', 'Live consultation', 'Synthetic live browser journey.', '/services/live-consultation', 45, 18000, 'SAR', '{"fields":[{"key":"reason","label":"Reason for visit","maxLength":500,"required":true}]}'::jsonb, '{"consent":{"text":"Synthetic E2E policy.","version":"1"}}'::jsonb, 'e7000000-0000-0000-0000-000000000001', statement_timestamp()),
  ('e7210000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 'e7200000-0000-0000-0000-000000000001', 1, 'ar', 'published', 'استشارة مباشرة', 'رحلة متصفح اصطناعية.', '/services/live-consultation', 45, 18000, 'SAR', '{"fields":[{"key":"reason","label":"سبب الزيارة","maxLength":500,"required":true}]}'::jsonb, '{"consent":{"text":"سياسة اختبار اصطناعية.","version":"1"}}'::jsonb, 'e7000000-0000-0000-0000-000000000001', statement_timestamp());

insert into app.catalog_location_revisions (id, tenant_id, location_id, revision, locale, state, name, description, address, canonical_path, publication_id, published_at)
values
  ('e7310000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', 1, 'en', 'published', 'Live booking suite', 'Synthetic location.', 'Example Street', '/locations/live-booking', 'e7000000-0000-0000-0000-000000000001', statement_timestamp()),
  ('e7310000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', 1, 'ar', 'published', 'جناح الحجز المباشر', 'موقع اصطناعي.', 'شارع المثال', '/locations/live-booking', 'e7000000-0000-0000-0000-000000000001', statement_timestamp());

insert into app.catalog_service_locations (tenant_id, service_id, location_id)
values ('e0000000-0000-0000-0000-000000000001', 'e7200000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001');

insert into app.schedule_scopes (id, tenant_id, scope_kind, location_id, time_zone)
values ('e5600000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'location', 'e5000000-0000-0000-0000-000000000001', 'America/New_York');
insert into app.weekly_schedules (id, tenant_id, schedule_scope_id, day_of_week, start_minute, end_minute)
values
  ('e5700000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'e5600000-0000-0000-0000-000000000001', 0, 480, 1200),
  ('e5700000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 'e5600000-0000-0000-0000-000000000001', 1, 480, 1200),
  ('e5700000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000001', 'e5600000-0000-0000-0000-000000000001', 2, 480, 1200),
  ('e5700000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 'e5600000-0000-0000-0000-000000000001', 3, 480, 1200),
  ('e5700000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000001', 'e5600000-0000-0000-0000-000000000001', 4, 480, 1200),
  ('e5700000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000001', 'e5600000-0000-0000-0000-000000000001', 5, 480, 1200),
  ('e5700000-0000-0000-0000-000000000007', 'e0000000-0000-0000-0000-000000000001', 'e5600000-0000-0000-0000-000000000001', 6, 480, 1200);

insert into app.staff_profiles (id, tenant_id, public_name)
values ('e8000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'Live booking staff');
insert into app.staff_services (tenant_id, staff_id, service_id)
values ('e0000000-0000-0000-0000-000000000001', 'e8000000-0000-0000-0000-000000000001', 'e7200000-0000-0000-0000-000000000001');
insert into app.staff_locations (tenant_id, staff_id, location_id)
values ('e0000000-0000-0000-0000-000000000001', 'e8000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001');
insert into app.staff_service_locations (tenant_id, staff_id, service_id, location_id)
values ('e0000000-0000-0000-0000-000000000001', 'e8000000-0000-0000-0000-000000000001', 'e7200000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001');

insert into app.schedule_scopes (id, tenant_id, scope_kind, location_id, staff_id, time_zone)
values ('e8100000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'staff', 'e5000000-0000-0000-0000-000000000001', 'e8000000-0000-0000-0000-000000000001', 'America/New_York');
insert into app.weekly_schedules (id, tenant_id, schedule_scope_id, day_of_week, start_minute, end_minute)
values
  ('e8200000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'e8100000-0000-0000-0000-000000000001', 0, 480, 1200),
  ('e8200000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 'e8100000-0000-0000-0000-000000000001', 1, 480, 1200),
  ('e8200000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000001', 'e8100000-0000-0000-0000-000000000001', 2, 480, 1200),
  ('e8200000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 'e8100000-0000-0000-0000-000000000001', 3, 480, 1200),
  ('e8200000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000001', 'e8100000-0000-0000-0000-000000000001', 4, 480, 1200),
  ('e8200000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000001', 'e8100000-0000-0000-0000-000000000001', 5, 480, 1200),
  ('e8200000-0000-0000-0000-000000000007', 'e0000000-0000-0000-0000-000000000001', 'e8100000-0000-0000-0000-000000000001', 6, 480, 1200);

insert into app.roles (id, tenant_id, key, location_scope_mode)
values ('e2000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'tenant_admin', 'tenant');
insert into app.role_permissions (tenant_id, role_id, permission_key, grant_kind, scope_kind)
values ('e0000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'booking.view.any', 'direct', 'tenant');
insert into app.memberships (id, tenant_id, auth_user_id, role_id, status, revision, joined_at)
values ('e3000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'active', 1, statement_timestamp());

insert into app.tenant_entitlements (tenant_id, feature_key, granted, source)
values ('e0000000-0000-0000-0000-000000000001', 'booking.online', true, 'plan');
