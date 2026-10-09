-- Issue #94's browser fixture is intentionally outside supabase/seed.sql. It
-- creates a third tenant after every local reset, so the existing deterministic
-- pgTAP counts and Tenant A/B permissions cannot be changed by the live journey.
-- `dashboard_password` is generated in memory by the test runner and is never
-- committed, printed, or passed into either application process.
--
-- The fixture is atomic and repeatable. Everything runs in one transaction, so
-- a retry after a mid-file failure (for example a duplicate primary key on
-- app.tenants) rolls back the whole attempt, including the dashboard-password
-- rotation below. On a rerun the existing synthetic tenant is reused as-is:
-- bookings, holds, and history from an earlier live run are preserved and only
-- the dashboard password is regenerated. Pre-existing rows that collide with
-- the synthetic identity but carry unexpected values fail closed instead of
-- being overwritten or silently adopted. App-table inserts are gated on the
-- pre-transaction presence of the synthetic tenant, never on ON CONFLICT
-- healing, so a partial setup cannot be silently completed by a rerun.

begin;

-- Snapshot whether the synthetic tenant already exists. The statements below
-- run in the same transaction, so this pre-state must be captured before the
-- fresh-run inserts become visible to the reuse gates.
drop table if exists pg_temp.live_booking_reuse;
create temporary table live_booking_reuse on commit drop as
select exists (
  select 1 from app.tenants where id = 'e0000000-0000-0000-0000-000000000001'
) as present;

-- Fail closed on identity collisions before any write can commit. A foreign
-- row reusing a synthetic id, a synthetic hostname owned by another tenant, or
-- a synthetic tenant/brand/role/membership carrying unexpected values raises
-- here and rolls back the whole fixture, including the password rotation.
do $$
begin
  if exists (
    select 1 from auth.users
    where id = 'e1000000-0000-0000-0000-000000000001'
      and email <> 'live-dashboard@example.invalid'
  ) then
    raise exception 'live-booking fixture: auth user identity collision';
  end if;
  if exists (
    select 1 from auth.identities
    where id = 'e1100000-0000-0000-0000-000000000001'
      and (
        user_id <> 'e1000000-0000-0000-0000-000000000001'
        or provider_id <> 'live-dashboard@example.invalid'
      )
  ) then
    raise exception 'live-booking fixture: auth identity collision';
  end if;
  if exists (
    select 1 from app.tenants
    where id = 'e0000000-0000-0000-0000-000000000001'
      and (name <> 'Live booking E2E tenant' or status <> 'active')
  ) then
    raise exception 'live-booking fixture: tenant identity collision';
  end if;
  if exists (
    select 1 from app.brands
    where id = 'e4000000-0000-0000-0000-000000000001'
      and (
        tenant_id <> 'e0000000-0000-0000-0000-000000000001'
        or key <> 'live-booking-e2e'
        or status <> 'active'
      )
  ) then
    raise exception 'live-booking fixture: brand identity collision';
  end if;
  if exists (
    select 1 from app.tenant_domains
    where hostname in (
      'client.live-booking.example.invalid',
      'dashboard.live-booking.example.invalid'
    )
      and tenant_id <> 'e0000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'live-booking fixture: domain owned by another tenant';
  end if;
  if exists (
    select 1 from app.tenant_domains
    where id in (
      'e4300000-0000-0000-0000-000000000001',
      'e4300000-0000-0000-0000-000000000002'
    )
      and tenant_id <> 'e0000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'live-booking fixture: domain identity collision';
  end if;
  if exists (
    select 1 from app.roles
    where id = 'e2000000-0000-0000-0000-000000000001'
      and (
        tenant_id <> 'e0000000-0000-0000-0000-000000000001'
        or key <> 'tenant_admin'
      )
  ) then
    raise exception 'live-booking fixture: role identity collision';
  end if;
  if exists (
    select 1 from app.memberships
    where id = 'e3000000-0000-0000-0000-000000000001'
      and (
        tenant_id <> 'e0000000-0000-0000-0000-000000000001'
        or auth_user_id <> 'e1000000-0000-0000-0000-000000000001'
        or role_id <> 'e2000000-0000-0000-0000-000000000001'
        or status <> 'active'
      )
  ) then
    raise exception 'live-booking fixture: membership identity collision';
  end if;
end
$$;

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
select 'e0000000-0000-0000-0000-000000000001', 'Live booking E2E tenant', 'active'
where not (select present from live_booking_reuse);

insert into app.brands (id, tenant_id, key, status)
select 'e4000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'live-booking-e2e', 'active'
where not (select present from live_booking_reuse);

insert into app.brand_revisions (
  id, tenant_id, brand_id, revision, state, config_version, published_at
)
select
  'e4100000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001',
  'e4000000-0000-0000-0000-000000000001',
  1, 'published', 3, statement_timestamp()
where not (select present from live_booking_reuse);

insert into app.instances (
  id, tenant_id, brand_id, published_brand_revision_id, deployment_state
)
select
  'e4200000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001',
  'e4000000-0000-0000-0000-000000000001',
  'e4100000-0000-0000-0000-000000000001',
  'active'
where not (select present from live_booking_reuse);

insert into app.tenant_domains (
  id, tenant_id, instance_id, hostname, application, kind, verification_status,
  verified_at, active
)
select * from (values
  ('e4300000-0000-0000-0000-000000000001'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'e4200000-0000-0000-0000-000000000001'::uuid, 'client.live-booking.example.invalid', 'client', 'production', 'verified', statement_timestamp(), true),
  ('e4300000-0000-0000-0000-000000000002'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'e4200000-0000-0000-0000-000000000001'::uuid, 'dashboard.live-booking.example.invalid', 'dashboard', 'production', 'verified', statement_timestamp(), true)
) as v(id, tenant_id, instance_id, hostname, application, kind, verification_status, verified_at, active)
where not (select present from live_booking_reuse);

insert into app.tenant_settings (tenant_id, default_locale, config_version, feature_version, revision)
select 'e0000000-0000-0000-0000-000000000001', 'en', 3, 1, 1
where not (select present from live_booking_reuse);

insert into app.locations (id, tenant_id, key, name, time_zone, status)
select 'e5000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'live-booking', 'Live booking suite', 'America/New_York', 'active'
where not (select present from live_booking_reuse);

insert into app.catalog_publications (id, tenant_id, revision, state, published_at, published_by)
select 'e7000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 1, 'published', statement_timestamp(), 'e1000000-0000-0000-0000-000000000001'
where not (select present from live_booking_reuse);

insert into app.catalog_categories (id, tenant_id, key)
select 'e7100000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'live-booking'
where not (select present from live_booking_reuse);

insert into app.catalog_category_revisions (id, tenant_id, category_id, revision, locale, state, name, publication_id, published_at)
select * from (values
  ('e7110000-0000-0000-0000-000000000001'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'e7100000-0000-0000-0000-000000000001'::uuid, 1, 'en', 'published', 'Live booking', 'e7000000-0000-0000-0000-000000000001'::uuid, statement_timestamp()),
  ('e7110000-0000-0000-0000-000000000002'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'e7100000-0000-0000-0000-000000000001'::uuid, 1, 'ar', 'published', 'حجز مباشر', 'e7000000-0000-0000-0000-000000000001'::uuid, statement_timestamp())
) as v(id, tenant_id, category_id, revision, locale, state, name, publication_id, published_at)
where not (select present from live_booking_reuse);

insert into app.catalog_services (id, tenant_id, key, category_id)
select 'e7200000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'live-consultation', 'e7100000-0000-0000-0000-000000000001'
where not (select present from live_booking_reuse);

insert into app.catalog_service_revisions (
  id, tenant_id, service_id, revision, locale, state, name, description,
  canonical_path, duration_minutes, price_minor, currency, intake_schema, policy,
  publication_id, published_at
)
select * from (values
  ('e7210000-0000-0000-0000-000000000001'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'e7200000-0000-0000-0000-000000000001'::uuid, 1, 'en', 'published', 'Live consultation', 'Synthetic live browser journey.', '/services/live-consultation', 45, 18000, 'SAR', '{"fields":[{"key":"reason","label":"Reason for visit","maxLength":500,"required":true}]}'::jsonb, '{"consent":{"text":"Synthetic E2E policy.","version":"1"}}'::jsonb, 'e7000000-0000-0000-0000-000000000001'::uuid, statement_timestamp()),
  ('e7210000-0000-0000-0000-000000000002'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'e7200000-0000-0000-0000-000000000001'::uuid, 1, 'ar', 'published', 'استشارة مباشرة', 'رحلة متصفح اصطناعية.', '/services/live-consultation', 45, 18000, 'SAR', '{"fields":[{"key":"reason","label":"سبب الزيارة","maxLength":500,"required":true}]}'::jsonb, '{"consent":{"text":"سياسة اختبار اصطناعية.","version":"1"}}'::jsonb, 'e7000000-0000-0000-0000-000000000001'::uuid, statement_timestamp())
) as v(id, tenant_id, service_id, revision, locale, state, name, description, canonical_path, duration_minutes, price_minor, currency, intake_schema, policy, publication_id, published_at)
where not (select present from live_booking_reuse);

insert into app.catalog_location_revisions (id, tenant_id, location_id, revision, locale, state, name, description, address, canonical_path, publication_id, published_at)
select * from (values
  ('e7310000-0000-0000-0000-000000000001'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'e5000000-0000-0000-0000-000000000001'::uuid, 1, 'en', 'published', 'Live booking suite', 'Synthetic location.', 'Example Street', '/locations/live-booking', 'e7000000-0000-0000-0000-000000000001'::uuid, statement_timestamp()),
  ('e7310000-0000-0000-0000-000000000002'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'e5000000-0000-0000-0000-000000000001'::uuid, 1, 'ar', 'published', 'جناح الحجز المباشر', 'موقع اصطناعي.', 'شارع المثال', '/locations/live-booking', 'e7000000-0000-0000-0000-000000000001'::uuid, statement_timestamp())
) as v(id, tenant_id, location_id, revision, locale, state, name, description, address, canonical_path, publication_id, published_at)
where not (select present from live_booking_reuse);

insert into app.catalog_service_locations (tenant_id, service_id, location_id)
select 'e0000000-0000-0000-0000-000000000001', 'e7200000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001'
where not (select present from live_booking_reuse);

insert into app.schedule_scopes (id, tenant_id, scope_kind, location_id, time_zone)
select 'e5600000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'location', 'e5000000-0000-0000-0000-000000000001', 'America/New_York'
where not (select present from live_booking_reuse);
insert into app.weekly_schedules (id, tenant_id, schedule_scope_id, day_of_week, start_minute, end_minute)
select * from (values
  ('e5700000-0000-0000-0000-000000000001'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'e5600000-0000-0000-0000-000000000001'::uuid, 0, 480, 1200),
  ('e5700000-0000-0000-0000-000000000002'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'e5600000-0000-0000-0000-000000000001'::uuid, 1, 480, 1200),
  ('e5700000-0000-0000-0000-000000000003'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'e5600000-0000-0000-0000-000000000001'::uuid, 2, 480, 1200),
  ('e5700000-0000-0000-0000-000000000004'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'e5600000-0000-0000-0000-000000000001'::uuid, 3, 480, 1200),
  ('e5700000-0000-0000-0000-000000000005'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'e5600000-0000-0000-0000-000000000001'::uuid, 4, 480, 1200),
  ('e5700000-0000-0000-0000-000000000006'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'e5600000-0000-0000-0000-000000000001'::uuid, 5, 480, 1200),
  ('e5700000-0000-0000-0000-000000000007'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'e5600000-0000-0000-0000-000000000001'::uuid, 6, 480, 1200)
) as v(id, tenant_id, schedule_scope_id, day_of_week, start_minute, end_minute)
where not (select present from live_booking_reuse);

insert into app.staff_profiles (id, tenant_id, public_name)
select 'e8000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'Live booking staff'
where not (select present from live_booking_reuse);
insert into app.staff_services (tenant_id, staff_id, service_id)
select 'e0000000-0000-0000-0000-000000000001', 'e8000000-0000-0000-0000-000000000001', 'e7200000-0000-0000-0000-000000000001'
where not (select present from live_booking_reuse);
insert into app.staff_locations (tenant_id, staff_id, location_id)
select 'e0000000-0000-0000-0000-000000000001', 'e8000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001'
where not (select present from live_booking_reuse);
insert into app.staff_service_locations (tenant_id, staff_id, service_id, location_id)
select 'e0000000-0000-0000-0000-000000000001', 'e8000000-0000-0000-0000-000000000001', 'e7200000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001'
where not (select present from live_booking_reuse);

insert into app.schedule_scopes (id, tenant_id, scope_kind, location_id, staff_id, time_zone)
select 'e8100000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'staff', 'e5000000-0000-0000-0000-000000000001', 'e8000000-0000-0000-0000-000000000001', 'America/New_York'
where not (select present from live_booking_reuse);
insert into app.weekly_schedules (id, tenant_id, schedule_scope_id, day_of_week, start_minute, end_minute)
select * from (values
  ('e8200000-0000-0000-0000-000000000001'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'e8100000-0000-0000-0000-000000000001'::uuid, 0, 480, 1200),
  ('e8200000-0000-0000-0000-000000000002'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'e8100000-0000-0000-0000-000000000001'::uuid, 1, 480, 1200),
  ('e8200000-0000-0000-0000-000000000003'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'e8100000-0000-0000-0000-000000000001'::uuid, 2, 480, 1200),
  ('e8200000-0000-0000-0000-000000000004'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'e8100000-0000-0000-0000-000000000001'::uuid, 3, 480, 1200),
  ('e8200000-0000-0000-0000-000000000005'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'e8100000-0000-0000-0000-000000000001'::uuid, 4, 480, 1200),
  ('e8200000-0000-0000-0000-000000000006'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'e8100000-0000-0000-0000-000000000001'::uuid, 5, 480, 1200),
  ('e8200000-0000-0000-0000-000000000007'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'e8100000-0000-0000-0000-000000000001'::uuid, 6, 480, 1200)
) as v(id, tenant_id, schedule_scope_id, day_of_week, start_minute, end_minute)
where not (select present from live_booking_reuse);

insert into app.roles (id, tenant_id, key, location_scope_mode)
select 'e2000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'tenant_admin', 'tenant'
where not (select present from live_booking_reuse);
insert into app.role_permissions (tenant_id, role_id, permission_key, grant_kind, scope_kind)
select 'e0000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'booking.view.any', 'direct', 'tenant'
where not (select present from live_booking_reuse);
insert into app.memberships (id, tenant_id, auth_user_id, role_id, status, revision, joined_at)
select 'e3000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'active', 1, statement_timestamp()
where not (select present from live_booking_reuse);

insert into app.tenant_entitlements (tenant_id, feature_key, granted, source)
select 'e0000000-0000-0000-0000-000000000001', 'booking.online', true, 'plan'
where not (select present from live_booking_reuse);

-- A present tenant with missing fixture rows is an incomplete setup: fail
-- closed instead of running the journey against half a tenant. A valid reuse
-- passes every check, and a fresh run just inserted all of these rows, so this
-- also catches a partial insert that somehow survived the statements above.
do $$
begin
  if not exists (select 1 from app.tenants where id = 'e0000000-0000-0000-0000-000000000001') then
    raise exception 'live-booking fixture incomplete: tenant';
  end if;
  if not exists (select 1 from app.brands where id = 'e4000000-0000-0000-0000-000000000001') then
    raise exception 'live-booking fixture incomplete: brand';
  end if;
  if not exists (select 1 from app.brand_revisions where id = 'e4100000-0000-0000-0000-000000000001') then
    raise exception 'live-booking fixture incomplete: brand revision';
  end if;
  if not exists (select 1 from app.instances where id = 'e4200000-0000-0000-0000-000000000001') then
    raise exception 'live-booking fixture incomplete: instance';
  end if;
  if (select count(*) from app.tenant_domains where tenant_id = 'e0000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'live-booking fixture incomplete: tenant domains';
  end if;
  if not exists (select 1 from app.tenant_settings where tenant_id = 'e0000000-0000-0000-0000-000000000001') then
    raise exception 'live-booking fixture incomplete: tenant settings';
  end if;
  if not exists (select 1 from app.locations where id = 'e5000000-0000-0000-0000-000000000001') then
    raise exception 'live-booking fixture incomplete: location';
  end if;
  if not exists (select 1 from app.catalog_publications where id = 'e7000000-0000-0000-0000-000000000001') then
    raise exception 'live-booking fixture incomplete: catalog publication';
  end if;
  if not exists (select 1 from app.catalog_categories where id = 'e7100000-0000-0000-0000-000000000001') then
    raise exception 'live-booking fixture incomplete: catalog category';
  end if;
  if (select count(*) from app.catalog_category_revisions where tenant_id = 'e0000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'live-booking fixture incomplete: catalog category revisions';
  end if;
  if not exists (select 1 from app.catalog_services where id = 'e7200000-0000-0000-0000-000000000001') then
    raise exception 'live-booking fixture incomplete: catalog service';
  end if;
  if (select count(*) from app.catalog_service_revisions where tenant_id = 'e0000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'live-booking fixture incomplete: catalog service revisions';
  end if;
  if (select count(*) from app.catalog_location_revisions where tenant_id = 'e0000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'live-booking fixture incomplete: catalog location revisions';
  end if;
  if not exists (
    select 1 from app.catalog_service_locations
    where tenant_id = 'e0000000-0000-0000-0000-000000000001'
      and service_id = 'e7200000-0000-0000-0000-000000000001'
      and location_id = 'e5000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'live-booking fixture incomplete: catalog service location';
  end if;
  if not exists (select 1 from app.schedule_scopes where id = 'e5600000-0000-0000-0000-000000000001') then
    raise exception 'live-booking fixture incomplete: location schedule scope';
  end if;
  if not exists (select 1 from app.schedule_scopes where id = 'e8100000-0000-0000-0000-000000000001') then
    raise exception 'live-booking fixture incomplete: staff schedule scope';
  end if;
  if (select count(*) from app.weekly_schedules where tenant_id = 'e0000000-0000-0000-0000-000000000001') <> 14 then
    raise exception 'live-booking fixture incomplete: weekly schedules';
  end if;
  if not exists (select 1 from app.staff_profiles where id = 'e8000000-0000-0000-0000-000000000001') then
    raise exception 'live-booking fixture incomplete: staff profile';
  end if;
  if not exists (
    select 1 from app.staff_services
    where tenant_id = 'e0000000-0000-0000-0000-000000000001'
      and staff_id = 'e8000000-0000-0000-0000-000000000001'
      and service_id = 'e7200000-0000-0000-0000-000000000001'
  ) then
    raise exception 'live-booking fixture incomplete: staff service';
  end if;
  if not exists (
    select 1 from app.staff_locations
    where tenant_id = 'e0000000-0000-0000-0000-000000000001'
      and staff_id = 'e8000000-0000-0000-0000-000000000001'
      and location_id = 'e5000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'live-booking fixture incomplete: staff location';
  end if;
  if not exists (
    select 1 from app.staff_service_locations
    where tenant_id = 'e0000000-0000-0000-0000-000000000001'
      and staff_id = 'e8000000-0000-0000-0000-000000000001'
      and service_id = 'e7200000-0000-0000-0000-000000000001'
      and location_id = 'e5000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'live-booking fixture incomplete: staff service location';
  end if;
  if not exists (select 1 from app.roles where id = 'e2000000-0000-0000-0000-000000000001') then
    raise exception 'live-booking fixture incomplete: role';
  end if;
  if not exists (
    select 1 from app.role_permissions
    where tenant_id = 'e0000000-0000-0000-0000-000000000001'
      and role_id = 'e2000000-0000-0000-0000-000000000001'
      and permission_key = 'booking.view.any'
  ) then
    raise exception 'live-booking fixture incomplete: role permission';
  end if;
  if not exists (select 1 from app.memberships where id = 'e3000000-0000-0000-0000-000000000001') then
    raise exception 'live-booking fixture incomplete: membership';
  end if;
  if not exists (
    select 1 from app.tenant_entitlements
    where tenant_id = 'e0000000-0000-0000-0000-000000000001'
      and feature_key = 'booking.online'
  ) then
    raise exception 'live-booking fixture incomplete: tenant entitlement';
  end if;
  if not exists (select 1 from auth.users where id = 'e1000000-0000-0000-0000-000000000001') then
    raise exception 'live-booking fixture incomplete: auth user';
  end if;
  if not exists (select 1 from auth.identities where id = 'e1100000-0000-0000-0000-000000000001') then
    raise exception 'live-booking fixture incomplete: auth identity';
  end if;
end
$$;

commit;
