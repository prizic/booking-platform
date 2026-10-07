-- Dashboard completion: isolated synthetic stack only; never run on a retained database.
begin;
-- This synthetic tenant is created after the transactional database suites,
-- so deterministic pgTAP counts and Tenant A/B permissions remain independent.
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
  'd1010000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'completion-admin@example.invalid',
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
  'd1110000-0000-0000-0000-000000000001',
  'completion-admin@example.invalid',
  'd1010000-0000-0000-0000-000000000001',
  '{"sub":"d1010000-0000-0000-0000-000000000001","email":"completion-admin@example.invalid"}'::jsonb,
  'email',
  statement_timestamp(),
  statement_timestamp()
)
on conflict (id) do update
set identity_data = excluded.identity_data,
    updated_at = excluded.updated_at;

insert into app.tenants (id, name, status)
values ('d0000000-0000-0000-0000-000000000001', 'Dashboard completion synthetic tenant', 'active');

insert into app.brands (id, tenant_id, key, status)
values ('d4000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'live-booking-e2e', 'active');

insert into app.brand_revisions (
  id, tenant_id, brand_id, revision, state, config_version, published_at, config, content, content_hash
)
values (
  'd4100000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001',
  'd4000000-0000-0000-0000-000000000001',
  1, 'published', 3, statement_timestamp(),'{"name":"Example Booking","assets":{"logoLight":"/assets/logo-light.png","logoDark":"/assets/logo-dark.png","icon":"/assets/icon.png","favicon":"/assets/favicon.png","socialImage":"/assets/social.png"},"tokens":{"color":{"background":"#f3efe5","surface":"#fffdf8","text":"#17332e","muted":"#50645f","border":"#747d78","primary":"#106b5a","onPrimary":"#ffffff","success":"#137333","onSuccess":"#ffffff","warning":"#7a4300","onWarning":"#ffffff","danger":"#9f251d","onDanger":"#ffffff","focus":"#9b3d0c"},"typography":{"bodyFamily":"Inter, \"Noto Sans Arabic\", sans-serif","displayFamily":"Inter, \"Noto Sans Arabic\", sans-serif","arabicBodyFamily":"\"Noto Sans Arabic\", sans-serif","arabicDisplayFamily":"\"Noto Naskh Arabic\", sans-serif","size":{"caption":"0.75rem","body":"1rem","label":"0.875rem","title":"1.5rem","display":"4.5rem"},"weight":{"regular":"400","medium":"500","semibold":"600","bold":"700"},"lineHeight":{"compact":"1.2","body":"1.55","relaxed":"1.7"}},"radius":{"control":"1.5rem","surface":"1.75rem","pill":"999rem"},"borderWidth":{"default":"0.0625rem","strong":"0.125rem"},"spacing":{"xxs":"0.25rem","xs":"0.5rem","sm":"0.75rem","md":"1rem","lg":"1.5rem","xl":"2rem","xxl":"3rem"},"contentWidth":{"form":"40rem","reading":"70ch","wide":"78rem"},"motion":{"fast":"120ms","standard":"180ms","slow":"300ms","reducedFast":"0ms","reduced":"0ms","reducedSlow":"0ms","easingStandard":"cubic-bezier(0.16, 1, 0.3, 1)","easingExit":"ease-in"}}}'::jsonb,'{"title":{"en":"Completion studio","ar":"\u0627\u0633\u062a\u0648\u062f\u064a\u0648 \u0627\u0644\u0625\u0646\u062c\u0627\u0632"},"contact":{"email":"hello@example.invalid"},"legal":{"privacyUrl":"https://example.invalid/privacy","termsUrl":"https://example.invalid/terms"}}'::jsonb,encode(extensions.digest('{"name":"Example Booking","assets":{"logoLight":"/assets/logo-light.png","logoDark":"/assets/logo-dark.png","icon":"/assets/icon.png","favicon":"/assets/favicon.png","socialImage":"/assets/social.png"},"tokens":{"color":{"background":"#f3efe5","surface":"#fffdf8","text":"#17332e","muted":"#50645f","border":"#747d78","primary":"#106b5a","onPrimary":"#ffffff","success":"#137333","onSuccess":"#ffffff","warning":"#7a4300","onWarning":"#ffffff","danger":"#9f251d","onDanger":"#ffffff","focus":"#9b3d0c"},"typography":{"bodyFamily":"Inter, \"Noto Sans Arabic\", sans-serif","displayFamily":"Inter, \"Noto Sans Arabic\", sans-serif","arabicBodyFamily":"\"Noto Sans Arabic\", sans-serif","arabicDisplayFamily":"\"Noto Naskh Arabic\", sans-serif","size":{"caption":"0.75rem","body":"1rem","label":"0.875rem","title":"1.5rem","display":"4.5rem"},"weight":{"regular":"400","medium":"500","semibold":"600","bold":"700"},"lineHeight":{"compact":"1.2","body":"1.55","relaxed":"1.7"}},"radius":{"control":"1.5rem","surface":"1.75rem","pill":"999rem"},"borderWidth":{"default":"0.0625rem","strong":"0.125rem"},"spacing":{"xxs":"0.25rem","xs":"0.5rem","sm":"0.75rem","md":"1rem","lg":"1.5rem","xl":"2rem","xxl":"3rem"},"contentWidth":{"form":"40rem","reading":"70ch","wide":"78rem"},"motion":{"fast":"120ms","standard":"180ms","slow":"300ms","reducedFast":"0ms","reduced":"0ms","reducedSlow":"0ms","easingStandard":"cubic-bezier(0.16, 1, 0.3, 1)","easingExit":"ease-in"}}}'||'{"title":{"en":"Completion studio","ar":"\u0627\u0633\u062a\u0648\u062f\u064a\u0648 \u0627\u0644\u0625\u0646\u062c\u0627\u0632"},"contact":{"email":"hello@example.invalid"},"legal":{"privacyUrl":"https://example.invalid/privacy","termsUrl":"https://example.invalid/terms"}}','sha256'),'hex')
);

insert into app.instances (
  id, tenant_id, brand_id, published_brand_revision_id, deployment_state
)
values (
  'd4200000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001',
  'd4000000-0000-0000-0000-000000000001',
  'd4100000-0000-0000-0000-000000000001',
  'active'
);

insert into app.tenant_domains (
  id, tenant_id, instance_id, hostname, application, kind, verification_status,
  verified_at, active
)
values
  ('d4300000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'd4200000-0000-0000-0000-000000000001', 'client.dashboard-completion.example.invalid', 'client', 'production', 'verified', statement_timestamp(), true),
  ('d4300000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'd4200000-0000-0000-0000-000000000001', 'dashboard.dashboard-completion.example.invalid', 'dashboard', 'production', 'verified', statement_timestamp(), true);

insert into app.tenant_settings (tenant_id, default_locale, config_version, feature_version, revision)
values ('d0000000-0000-0000-0000-000000000001', 'en', 3, 1, 1);

insert into app.locations (id, tenant_id, key, name, time_zone, status)
values ('d5000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'live-booking', 'Live booking suite', 'America/New_York', 'active');

insert into app.catalog_publications (id, tenant_id, revision, state, published_at, published_by)
values ('d7000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 1, 'published', statement_timestamp(), 'd1010000-0000-0000-0000-000000000001');

insert into app.catalog_categories (id, tenant_id, key)
values ('d7100000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'live-booking');

insert into app.catalog_category_revisions (id, tenant_id, category_id, revision, locale, state, name, publication_id, published_at)
values
  ('d7110000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'd7100000-0000-0000-0000-000000000001', 1, 'en', 'published', 'Live booking', 'd7000000-0000-0000-0000-000000000001', statement_timestamp()),
  ('d7110000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'd7100000-0000-0000-0000-000000000001', 1, 'ar', 'published', 'حجز مباشر', 'd7000000-0000-0000-0000-000000000001', statement_timestamp());

insert into app.catalog_services (id, tenant_id, key, category_id)
values ('d7200000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'live-consultation', 'd7100000-0000-0000-0000-000000000001');

insert into app.catalog_service_revisions (
  id, tenant_id, service_id, revision, locale, state, name, description,
  canonical_path, duration_minutes, price_minor, currency, intake_schema, policy,
  publication_id, published_at
)
values
  ('d7210000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'd7200000-0000-0000-0000-000000000001', 1, 'en', 'published', 'Completion consultation', 'Synthetic live browser journey.', '/services/live-consultation', 45, 18000, 'USD', '{"fields":[{"key":"reason","label":"Reason for visit","maxLength":500,"required":true}]}'::jsonb, '{"consent":{"text":"Synthetic E2E policy.","version":"1"}}'::jsonb, 'd7000000-0000-0000-0000-000000000001', statement_timestamp()),
  ('d7210000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'd7200000-0000-0000-0000-000000000001', 1, 'ar', 'published', 'استشارة مباشرة', 'رحلة متصفح اصطناعية.', '/services/live-consultation', 45, 18000, 'USD', '{"fields":[{"key":"reason","label":"سبب الزيارة","maxLength":500,"required":true}]}'::jsonb, '{"consent":{"text":"سياسة اختبار اصطناعية.","version":"1"}}'::jsonb, 'd7000000-0000-0000-0000-000000000001', statement_timestamp());

insert into app.catalog_location_revisions (id, tenant_id, location_id, revision, locale, state, name, description, address, canonical_path, publication_id, published_at)
values
  ('d7310000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', 1, 'en', 'published', 'Live booking suite', 'Synthetic location.', 'Example Street', '/locations/live-booking', 'd7000000-0000-0000-0000-000000000001', statement_timestamp()),
  ('d7310000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', 1, 'ar', 'published', 'جناح الحجز المباشر', 'موقع اصطناعي.', 'شارع المثال', '/locations/live-booking', 'd7000000-0000-0000-0000-000000000001', statement_timestamp());

insert into app.catalog_service_locations (tenant_id, service_id, location_id)
values ('d0000000-0000-0000-0000-000000000001', 'd7200000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001');

insert into app.schedule_scopes (id, tenant_id, scope_kind, location_id, time_zone)
values ('d5600000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'location', 'd5000000-0000-0000-0000-000000000001', 'America/New_York');
insert into app.weekly_schedules (id, tenant_id, schedule_scope_id, day_of_week, start_minute, end_minute)
values
  ('d5700000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'd5600000-0000-0000-0000-000000000001', 0, 480, 1200),
  ('d5700000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'd5600000-0000-0000-0000-000000000001', 1, 480, 1200),
  ('d5700000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', 'd5600000-0000-0000-0000-000000000001', 2, 480, 1200),
  ('d5700000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000001', 'd5600000-0000-0000-0000-000000000001', 3, 480, 1200),
  ('d5700000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000001', 'd5600000-0000-0000-0000-000000000001', 4, 480, 1200),
  ('d5700000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000001', 'd5600000-0000-0000-0000-000000000001', 5, 480, 1200),
  ('d5700000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000001', 'd5600000-0000-0000-0000-000000000001', 6, 480, 1200);

insert into app.staff_profiles (id, tenant_id, public_name)
values ('d8000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Completion staff');
insert into app.staff_services (tenant_id, staff_id, service_id)
values ('d0000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000001', 'd7200000-0000-0000-0000-000000000001');
insert into app.staff_locations (tenant_id, staff_id, location_id)
values ('d0000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001');
insert into app.staff_service_locations (tenant_id, staff_id, service_id, location_id)
values ('d0000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000001', 'd7200000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001');

insert into app.schedule_scopes (id, tenant_id, scope_kind, location_id, staff_id, time_zone)
values ('d8100000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'staff', 'd5000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000001', 'America/New_York');
insert into app.weekly_schedules (id, tenant_id, schedule_scope_id, day_of_week, start_minute, end_minute)
values
  ('d8200000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'd8100000-0000-0000-0000-000000000001', 0, 480, 1200),
  ('d8200000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'd8100000-0000-0000-0000-000000000001', 1, 480, 1200),
  ('d8200000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', 'd8100000-0000-0000-0000-000000000001', 2, 480, 1200),
  ('d8200000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000001', 'd8100000-0000-0000-0000-000000000001', 3, 480, 1200),
  ('d8200000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000001', 'd8100000-0000-0000-0000-000000000001', 4, 480, 1200),
  ('d8200000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000001', 'd8100000-0000-0000-0000-000000000001', 5, 480, 1200),
  ('d8200000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000001', 'd8100000-0000-0000-0000-000000000001', 6, 480, 1200);

insert into app.roles (id, tenant_id, key, location_scope_mode)
values ('d2000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'tenant_admin', 'tenant');
insert into app.role_permissions (tenant_id, role_id, permission_key, grant_kind, scope_kind)
values ('d0000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'booking.view.any', 'direct', 'tenant');
insert into app.memberships (id, tenant_id, auth_user_id, role_id, status, revision, joined_at)
values ('d3000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'd1010000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'active', 1, statement_timestamp());

insert into app.tenant_entitlements (tenant_id, feature_key, granted, source)
values ('d0000000-0000-0000-0000-000000000001', 'booking.online', true, 'plan');

-- Clone immutable built-in permission definitions, rather than invent test-only authority.
insert into app.role_permissions(tenant_id,role_id,permission_key,grant_kind,scope_kind)
select 'd0000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001',permission_key,grant_kind,scope_kind
from app.role_permissions where tenant_id='a0000000-0000-0000-0000-000000000001' and role_id='a2000000-0000-0000-0000-000000000004' on conflict do nothing;
insert into app.roles(id,tenant_id,key,location_scope_mode)
values ('d2000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000001','scheduler','tenant'),('d2000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000001','staff','assigned'),('d2000000-0000-0000-0000-000000000004','d0000000-0000-0000-0000-000000000001','location_manager','assigned');
insert into app.role_permissions(tenant_id,role_id,permission_key,grant_kind,scope_kind)
select target.tenant_id,target.id,source.permission_key,source.grant_kind,source.scope_kind
from app.roles target join app.roles base on base.tenant_id='a0000000-0000-0000-0000-000000000001' and base.key=target.key join app.role_permissions source on source.tenant_id=base.tenant_id and source.role_id=base.id where target.tenant_id='d0000000-0000-0000-0000-000000000001' on conflict do nothing;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change_token, reauthentication_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select u.instance_id, 'd1010000-0000-0000-0000-000000000002', u.aud, u.role, 'completion-scheduler@example.invalid', u.encrypted_password, u.email_confirmed_at, u.confirmation_token, u.recovery_token, u.email_change_token_new, u.email_change, u.email_change_token_current, u.phone_change_token, u.reauthentication_token, u.raw_app_meta_data, u.raw_user_meta_data, u.created_at, u.updated_at from auth.users u where u.id='d1010000-0000-0000-0000-000000000001';
insert into auth.identities(id,provider_id,user_id,identity_data,provider,created_at,updated_at) values('d1110000-0000-0000-0000-000000000002','completion-scheduler@example.invalid','d1010000-0000-0000-0000-000000000002',jsonb_build_object('sub','d1010000-0000-0000-0000-000000000002','email','completion-scheduler@example.invalid'),'email',statement_timestamp(),statement_timestamp());
insert into app.memberships(id,tenant_id,auth_user_id,role_id,status,joined_at,revoked_at) values('d3000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000001','d1010000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000002','active',statement_timestamp(),null);
insert into app.membership_location_scopes(tenant_id,membership_id,location_id) values('d0000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000002','d5000000-0000-0000-0000-000000000001');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change_token, reauthentication_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select u.instance_id, 'd1010000-0000-0000-0000-000000000003', u.aud, u.role, 'completion-staff@example.invalid', u.encrypted_password, u.email_confirmed_at, u.confirmation_token, u.recovery_token, u.email_change_token_new, u.email_change, u.email_change_token_current, u.phone_change_token, u.reauthentication_token, u.raw_app_meta_data, u.raw_user_meta_data, u.created_at, u.updated_at from auth.users u where u.id='d1010000-0000-0000-0000-000000000001';
insert into auth.identities(id,provider_id,user_id,identity_data,provider,created_at,updated_at) values('d1110000-0000-0000-0000-000000000003','completion-staff@example.invalid','d1010000-0000-0000-0000-000000000003',jsonb_build_object('sub','d1010000-0000-0000-0000-000000000003','email','completion-staff@example.invalid'),'email',statement_timestamp(),statement_timestamp());
insert into app.memberships(id,tenant_id,auth_user_id,role_id,status,joined_at,revoked_at) values('d3000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000001','d1010000-0000-0000-0000-000000000003','d2000000-0000-0000-0000-000000000003','active',statement_timestamp(),null);
insert into app.membership_location_scopes(tenant_id,membership_id,location_id) values('d0000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000003','d5000000-0000-0000-0000-000000000001');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change_token, reauthentication_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select u.instance_id, 'd1010000-0000-0000-0000-000000000004', u.aud, u.role, 'completion-manager@example.invalid', u.encrypted_password, u.email_confirmed_at, u.confirmation_token, u.recovery_token, u.email_change_token_new, u.email_change, u.email_change_token_current, u.phone_change_token, u.reauthentication_token, u.raw_app_meta_data, u.raw_user_meta_data, u.created_at, u.updated_at from auth.users u where u.id='d1010000-0000-0000-0000-000000000001';
insert into auth.identities(id,provider_id,user_id,identity_data,provider,created_at,updated_at) values('d1110000-0000-0000-0000-000000000004','completion-manager@example.invalid','d1010000-0000-0000-0000-000000000004',jsonb_build_object('sub','d1010000-0000-0000-0000-000000000004','email','completion-manager@example.invalid'),'email',statement_timestamp(),statement_timestamp());
insert into app.memberships(id,tenant_id,auth_user_id,role_id,status,joined_at,revoked_at) values('d3000000-0000-0000-0000-000000000004','d0000000-0000-0000-0000-000000000001','d1010000-0000-0000-0000-000000000004','d2000000-0000-0000-0000-000000000004','active',statement_timestamp(),null);
insert into app.membership_location_scopes(tenant_id,membership_id,location_id) values('d0000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000004','d5000000-0000-0000-0000-000000000001');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change_token, reauthentication_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select u.instance_id, 'd1010000-0000-0000-0000-000000000005', u.aud, u.role, 'completion-revoked@example.invalid', u.encrypted_password, u.email_confirmed_at, u.confirmation_token, u.recovery_token, u.email_change_token_new, u.email_change, u.email_change_token_current, u.phone_change_token, u.reauthentication_token, u.raw_app_meta_data, u.raw_user_meta_data, u.created_at, u.updated_at from auth.users u where u.id='d1010000-0000-0000-0000-000000000001';
insert into auth.identities(id,provider_id,user_id,identity_data,provider,created_at,updated_at) values('d1110000-0000-0000-0000-000000000005','completion-revoked@example.invalid','d1010000-0000-0000-0000-000000000005',jsonb_build_object('sub','d1010000-0000-0000-0000-000000000005','email','completion-revoked@example.invalid'),'email',statement_timestamp(),statement_timestamp());
insert into app.memberships(id,tenant_id,auth_user_id,role_id,status,joined_at,revoked_at) values('d3000000-0000-0000-0000-000000000005','d0000000-0000-0000-0000-000000000001','d1010000-0000-0000-0000-000000000005','d2000000-0000-0000-0000-000000000003','revoked',statement_timestamp(),statement_timestamp());
insert into app.membership_location_scopes(tenant_id,membership_id,location_id) values('d0000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000005','d5000000-0000-0000-0000-000000000001');
update app.staff_profiles set membership_id='d3000000-0000-0000-0000-000000000003' where id='d8000000-0000-0000-0000-000000000001';
insert into app.tenant_entitlements(tenant_id,feature_key,granted,source) select 'd0000000-0000-0000-0000-000000000001',feature_key,granted,source from app.tenant_entitlements where tenant_id='a0000000-0000-0000-0000-000000000001' on conflict do nothing;
insert into app.catalog_services(id,tenant_id,key,category_id) values('d7200000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000001','completion-request','d7100000-0000-0000-0000-000000000001');
insert into app.catalog_service_revisions select (jsonb_populate_record(null::app.catalog_service_revisions,to_jsonb(r)||jsonb_build_object('id',gen_random_uuid(),'service_id','d7200000-0000-0000-0000-000000000002','name','Completion request','canonical_path','/services/completion-request','booking_mode','appointment','approval_required',true))).* from app.catalog_service_revisions r where r.service_id='d7200000-0000-0000-0000-000000000001';
insert into app.catalog_service_locations(tenant_id,service_id,location_id) values('d0000000-0000-0000-0000-000000000001','d7200000-0000-0000-0000-000000000002','d5000000-0000-0000-0000-000000000001');
insert into app.staff_services(tenant_id,staff_id,service_id) values('d0000000-0000-0000-0000-000000000001','d8000000-0000-0000-0000-000000000001','d7200000-0000-0000-0000-000000000002');
insert into app.staff_service_locations(tenant_id,staff_id,service_id,location_id) values('d0000000-0000-0000-0000-000000000001','d8000000-0000-0000-0000-000000000001','d7200000-0000-0000-0000-000000000002','d5000000-0000-0000-0000-000000000001');
insert into app.catalog_services(id,tenant_id,key,category_id) values('d7200000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000001','completion-room','d7100000-0000-0000-0000-000000000001');
insert into app.catalog_service_revisions select (jsonb_populate_record(null::app.catalog_service_revisions,to_jsonb(r)||jsonb_build_object('id',gen_random_uuid(),'service_id','d7200000-0000-0000-0000-000000000003','name','Completion room','canonical_path','/services/completion-room','booking_mode','exclusive_resource','approval_required',false))).* from app.catalog_service_revisions r where r.service_id='d7200000-0000-0000-0000-000000000001';
insert into app.catalog_service_locations(tenant_id,service_id,location_id) values('d0000000-0000-0000-0000-000000000001','d7200000-0000-0000-0000-000000000003','d5000000-0000-0000-0000-000000000001');
insert into app.resource_types(id,tenant_id,key,name) values('d8400000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','completion-room','Completion room type');
insert into app.resources(id,tenant_id,resource_type_id,key,public_name) values('d8500000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','d8400000-0000-0000-0000-000000000001','completion-room','Completion room');
insert into app.resource_locations(tenant_id,resource_id,location_id) values('d0000000-0000-0000-0000-000000000001','d8500000-0000-0000-0000-000000000001','d5000000-0000-0000-0000-000000000001');
insert into app.resource_requirements(tenant_id,service_id,resource_type_id) values('d0000000-0000-0000-0000-000000000001','d7200000-0000-0000-0000-000000000003','d8400000-0000-0000-0000-000000000001');
insert into app.schedule_scopes(id,tenant_id,scope_kind,location_id,resource_id,time_zone) values('d8600000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','resource','d5000000-0000-0000-0000-000000000001','d8500000-0000-0000-0000-000000000001','America/New_York');
insert into app.weekly_schedules(id,tenant_id,schedule_scope_id,day_of_week,start_minute,end_minute) select gen_random_uuid(),'d0000000-0000-0000-0000-000000000001','d8600000-0000-0000-0000-000000000001',day,480,1200 from generate_series(0,6) day;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change_token, reauthentication_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select u.instance_id, 'd1010000-0000-0000-0000-000000000006', u.aud, u.role, 'completion-foreign@example.invalid', u.encrypted_password, u.email_confirmed_at, u.confirmation_token, u.recovery_token, u.email_change_token_new, u.email_change, u.email_change_token_current, u.phone_change_token, u.reauthentication_token, u.raw_app_meta_data, u.raw_user_meta_data, u.created_at, u.updated_at from auth.users u where u.id='d1010000-0000-0000-0000-000000000001';
insert into auth.identities(id,provider_id,user_id,identity_data,provider,created_at,updated_at)
values('d1110000-0000-0000-0000-000000000006','completion-foreign@example.invalid','d1010000-0000-0000-0000-000000000006',jsonb_build_object('sub','d1010000-0000-0000-0000-000000000006','email','completion-foreign@example.invalid'),'email',statement_timestamp(),statement_timestamp());
insert into app.memberships(id,tenant_id,auth_user_id,role_id)
select 'd3010000-0000-0000-0000-000000000006','b0000000-0000-0000-0000-000000000001','d1010000-0000-0000-0000-000000000006',id from app.roles where tenant_id='b0000000-0000-0000-0000-000000000001' and key='tenant_admin';

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change_token, reauthentication_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select u.instance_id, 'd1010000-0000-0000-0000-000000000007', u.aud, u.role, 'completion-recovery@example.invalid', u.encrypted_password, u.email_confirmed_at, u.confirmation_token, u.recovery_token, u.email_change_token_new, u.email_change, u.email_change_token_current, u.phone_change_token, u.reauthentication_token, u.raw_app_meta_data, u.raw_user_meta_data, u.created_at, u.updated_at from auth.users u where u.id='d1010000-0000-0000-0000-000000000001';
insert into auth.identities(id,provider_id,user_id,identity_data,provider,created_at,updated_at)
values('d1110000-0000-0000-0000-000000000007','completion-recovery@example.invalid','d1010000-0000-0000-0000-000000000007',jsonb_build_object('sub','d1010000-0000-0000-0000-000000000007','email','completion-recovery@example.invalid'),'email',statement_timestamp(),statement_timestamp());

-- One booking that belongs to seeded Tenant A, so the scoped-authority cases can
-- prove a completion actor is refused a foreign record on a fresh stack instead
-- of depending on whichever earlier suite happened to leave one behind. Like the
-- reports database fixture, the released hold stands in for capacity a real
-- journey would have claimed before booking.
insert into app.booking_holds(
  id,tenant_id,service_id,location_id,publication_id,allocation_kind,starts_at,ends_at,
  state,expires_at,ttl_seconds,price_minor,tax_rate_bps,currency,session_hash,
  correlation_id,released_at)
values ('d9400000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
  'a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',
  'a7000000-0000-0000-0000-000000000001','appointment',
  '2026-12-29 16:00:00+00','2026-12-29 17:00:00+00','released','2026-12-29 16:00:00+00',
  900,18000,0,'USD',repeat('d',64),gen_random_uuid(),statement_timestamp());
insert into app.bookings(
  id,tenant_id,public_reference,service_id,location_id,hold_id,publication_id,
  status,payment_status,notification_status,calendar_status,approval_status,
  starts_at,ends_at,party_size,duration_minutes,buffer_before_minutes,buffer_after_minutes,
  price_minor,tax_rate_bps,currency,policy_snapshot,consent_text,consent_version,consented_at,
  intake_schema_snapshot,service_name,location_name,locale,location_time_zone,
  customer_time_zone,correlation_id)
values ('d9500000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
  'FRGNBKNGXB','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',
  'd9400000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000001',
  'confirmed','not_required','queued','pending','not_required',
  '2026-12-29 16:00:00+00','2026-12-29 17:00:00+00',1,60,0,0,18000,0,'USD','{}'::jsonb,
  'Synthetic terms.','1',statement_timestamp(),'{"fields":[]}'::jsonb,
  'Synthetic foreign consultation','Synthetic Location A One','en','America/New_York',
  'America/New_York',gen_random_uuid());

commit;
