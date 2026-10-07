-- Arabic demo business ("منشأتك" / "Your Business"). Synthetic, local stacks only.
--
-- Opt-in preview data so a local Client/Dashboard looks like a working Gulf
-- business rather than an e2e fixture. Never part of seed.sql or a migration;
-- never applied by `db reset` or a deploy. Run only through `pnpm demo:local`,
-- which proves the target is a loopback Supabase stack, sets
-- `wlbp.allow_demo=on` for this session only, and sets the owner's password
-- through the local Auth admin API (no password is ever in this file).
--
-- Every email ends in .example.invalid, every phone number is in the reserved
-- fictional NANP range 555-0100..0199, and every fixed id starts with `ad`.
--
-- Repeatable: structure uses fixed ids with ON CONFLICT DO NOTHING. Bookings are
-- keyed by the Asia/Riyadh calendar day they were generated for, so a second
-- run on the same day inserts nothing, and a run on a later day adds that day's
-- set (skipping any slot an earlier set already occupies) after closing out
-- earlier demo bookings whose time has passed.
--
-- Bookings use the same row sequence as confirm_booking_v1 / the e2e fixtures:
-- a released hold, the staff allocation keyed by that hold, the booking whose
-- snapshot is copied from the published revision, the contact (whose trigger
-- links the customer and records consent), and the booking event history.
\set ON_ERROR_STOP on
begin;

do $guard$
declare
  v_reserved constant text := '\.(invalid|test|example|localhost)$';
begin
  if coalesce(current_setting('wlbp.allow_demo', true), '') <> 'on' then
    raise exception 'arabic demo: refusing to run outside `pnpm demo:local` (wlbp.allow_demo is not on)';
  end if;
  -- Every synthetic tenant (seed, fixtures, demos) is served only from RFC 2606
  -- reserved names; a tenant with any other hostname is a real one.
  if exists (select 1 from app.tenant_domains d where d.hostname !~ v_reserved) then
    raise exception 'arabic demo: refusing, a tenant with a non-reserved (real) domain exists';
  end if;
  if not exists (select 1 from app.roles where id = 'a2000000-0000-0000-0000-000000000004'
      and tenant_id = 'a0000000-0000-0000-0000-000000000001' and key = 'tenant_admin') then
    raise exception 'arabic demo: the synthetic seed (Tenant A built-in roles) is missing; run pnpm db:reset';
  end if;
end
$guard$;

-- Owner account --------------------------------------------------------------
-- The password hash is a throwaway random value; the runner replaces it through
-- the Auth admin API on every run and never writes it here.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change_token, reauthentication_token,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000', 'ad010000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'demo-owner@example.invalid',
  extensions.crypt(gen_random_uuid()::text || gen_random_uuid()::text, extensions.gen_salt('bf')),
  statement_timestamp(), '', '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb, '{"synthetic":true}'::jsonb,
  statement_timestamp(), statement_timestamp()
)
on conflict (id) do nothing;

insert into auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
values (
  'ad011000-0000-4000-8000-000000000001', 'demo-owner@example.invalid',
  'ad010000-0000-4000-8000-000000000001',
  '{"sub":"ad010000-0000-4000-8000-000000000001","email":"demo-owner@example.invalid"}'::jsonb,
  'email', statement_timestamp(), statement_timestamp()
)
on conflict (id) do nothing;

-- Tenant, brand, instance, domains ------------------------------------------------
insert into app.tenants (id, name, status)
values ('ad000000-0000-4000-8000-000000000001', 'منشأتك', 'active')
on conflict (id) do nothing;

insert into app.brands (id, tenant_id, key, status)
values ('ad020000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001', 'your-business', 'active')
on conflict do nothing;

-- Config is the seed's validated v3 brand config renamed; the hash uses the same
-- formula as save_brand_draft_v1 so the editor sees a consistent revision.
insert into app.brand_revisions (
  id, tenant_id, brand_id, revision, state, config_version, published_at, config, content, content_hash
)
select 'ad021000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
  'ad020000-0000-4000-8000-000000000001', 1, 'published', r.config_version, statement_timestamp(),
  d.config, d.content,
  encode(extensions.digest(convert_to(d.config::text || ':' || d.content::text, 'UTF8'), 'sha256'), 'hex')
from app.brand_revisions r
cross join lateral (
  select jsonb_set(r.config, '{name}', '"Your Business"') as config,
    jsonb_build_object(
      'title', jsonb_build_object('en', 'Your Business', 'ar', 'منشأتك'),
      'contact', jsonb_build_object('email', 'hello@your-business.example.invalid'),
      'legal', jsonb_build_object(
        'privacyUrl', 'https://your-business.example.invalid/privacy',
        'termsUrl', 'https://your-business.example.invalid/terms')) as content
) d
where r.id = 'a4100000-0000-0000-0000-000000000001'
on conflict do nothing;

insert into app.instances (id, tenant_id, brand_id, published_brand_revision_id, deployment_state)
values ('ad022000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
  'ad020000-0000-4000-8000-000000000001', 'ad021000-0000-4000-8000-000000000001', 'active')
on conflict do nothing;

insert into app.tenant_domains (
  id, tenant_id, instance_id, hostname, application, kind, verification_status, verified_at, active
)
values
  ('ad023000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
   'ad022000-0000-4000-8000-000000000001', 'client.arabic-demo.example.invalid',
   'client', 'production', 'verified', statement_timestamp(), true),
  ('ad023000-0000-4000-8000-000000000002', 'ad000000-0000-4000-8000-000000000001',
   'ad022000-0000-4000-8000-000000000001', 'dashboard.arabic-demo.example.invalid',
   'dashboard', 'production', 'verified', statement_timestamp(), true)
on conflict do nothing;

insert into app.tenant_settings (tenant_id, default_locale, config_version, feature_version, revision, settings)
values ('ad000000-0000-4000-8000-000000000001', 'ar', 3, 1, 1,
  '{"currency":"SAR","defaultLocale":"ar","replyToEmail":"reply@your-business.example.invalid"}'::jsonb)
on conflict do nothing;

insert into app.tenant_entitlements (tenant_id, feature_key, granted, source)
select 'ad000000-0000-4000-8000-000000000001', feature_key, granted, source
from app.tenant_entitlements where tenant_id = 'a0000000-0000-0000-0000-000000000001'
on conflict do nothing;

-- Roles clone the immutable built-in permission sets; the owner is tenant_admin.
insert into app.roles (id, tenant_id, key, location_scope_mode)
values
  ('ad070000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001', 'tenant_admin', 'tenant'),
  ('ad070000-0000-4000-8000-000000000002', 'ad000000-0000-4000-8000-000000000001', 'scheduler', 'tenant'),
  ('ad070000-0000-4000-8000-000000000003', 'ad000000-0000-4000-8000-000000000001', 'staff', 'assigned'),
  ('ad070000-0000-4000-8000-000000000004', 'ad000000-0000-4000-8000-000000000001', 'location_manager', 'assigned')
on conflict do nothing;
insert into app.role_permissions (tenant_id, role_id, permission_key, grant_kind, scope_kind)
select target.tenant_id, target.id, source.permission_key, source.grant_kind, source.scope_kind
from app.roles target
join app.roles base on base.tenant_id = 'a0000000-0000-0000-0000-000000000001' and base.key = target.key
join app.role_permissions source on source.tenant_id = base.tenant_id and source.role_id = base.id
where target.tenant_id = 'ad000000-0000-4000-8000-000000000001'
on conflict do nothing;

insert into app.memberships (id, tenant_id, auth_user_id, role_id, status, revision, joined_at)
values ('ad071000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
  'ad010000-0000-4000-8000-000000000001', 'ad070000-0000-4000-8000-000000000001',
  'active', 1, statement_timestamp())
on conflict do nothing;

-- Location ---------------------------------------------------------------------
insert into app.locations (id, tenant_id, key, name, time_zone, status)
values ('ad030000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
  'main-branch', 'الفرع الرئيسي', 'Asia/Riyadh', 'active')
on conflict do nothing;

insert into app.schedule_scopes (id, tenant_id, scope_kind, location_id, time_zone)
values ('ad031000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
  'location', 'ad030000-0000-4000-8000-000000000001', 'Asia/Riyadh')
on conflict do nothing;
-- Open every day 09:00-21:00, so "today" is a working day whenever this runs.
insert into app.weekly_schedules (id, tenant_id, schedule_scope_id, day_of_week, start_minute, end_minute)
select ('ad032000-0000-4000-8000-00000000000' || d)::uuid, 'ad000000-0000-4000-8000-000000000001',
  'ad031000-0000-4000-8000-000000000001', d, 540, 1260
from generate_series(0, 6) d
on conflict do nothing;

-- Catalog: one published publication, one category, five services ---------------
insert into app.catalog_publications (id, tenant_id, revision, state, published_at, published_by)
values ('ad040000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001', 1,
  'published', statement_timestamp(), 'ad010000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into app.catalog_categories (id, tenant_id, key)
values ('ad041000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001', 'services')
on conflict do nothing;
insert into app.catalog_category_revisions (id, tenant_id, category_id, revision, locale, state, name, publication_id, published_at)
values
  ('ad042000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
   'ad041000-0000-4000-8000-000000000001', 1, 'en', 'published', 'Services',
   'ad040000-0000-4000-8000-000000000001', statement_timestamp()),
  ('ad042000-0000-4000-8000-000000000002', 'ad000000-0000-4000-8000-000000000001',
   'ad041000-0000-4000-8000-000000000001', 1, 'ar', 'published', 'الخدمات',
   'ad040000-0000-4000-8000-000000000001', statement_timestamp())
on conflict do nothing;

insert into app.catalog_location_revisions (
  id, tenant_id, location_id, revision, locale, state, name, description, address,
  canonical_path, publication_id, published_at
)
values
  ('ad045000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
   'ad030000-0000-4000-8000-000000000001', 1, 'en', 'published', 'Main branch',
   'Our main branch, open every day.', 'King Fahd Road, Riyadh', '/locations/main-branch',
   'ad040000-0000-4000-8000-000000000001', statement_timestamp()),
  ('ad045000-0000-4000-8000-000000000002', 'ad000000-0000-4000-8000-000000000001',
   'ad030000-0000-4000-8000-000000000001', 1, 'ar', 'published', 'الفرع الرئيسي',
   'فرعنا الرئيسي، مفتوح كل يوم.', 'طريق الملك فهد، الرياض', '/locations/main-branch',
   'ad040000-0000-4000-8000-000000000001', statement_timestamp())
on conflict do nothing;

create temp table demo_services on commit drop as
select ('ad043000-0000-4000-8000-00000000000' || n)::uuid as id, n, key, name_en, name_ar,
  description_en, description_ar, duration, buffer_after, price_minor, approval_required
from (values
  (1, 'haircut', 'Haircut', 'قص شعر', 'A classic cut, styled to finish.', 'قصة كلاسيكية مع تصفيف.', 45, 0, 8000::bigint, false),
  (2, 'consultation', 'Consultation', 'استشارة', 'A first conversation to plan your visits.', 'جلسة أولى لتخطيط زياراتك.', 30, 0, 15000, true),
  (3, 'skin-care', 'Skin care session', 'جلسة عناية بالبشرة', 'Cleansing and hydration for every skin type.', 'تنظيف وترطيب يناسب جميع أنواع البشرة.', 60, 10, 25000, false),
  (4, 'massage', 'Massage', 'تدليك', 'A relaxing full-body massage.', 'تدليك مريح للجسم كاملًا.', 60, 15, 30000, false),
  (5, 'follow-up', 'Follow-up', 'متابعة', 'A short check-in after a treatment.', 'زيارة قصيرة للمتابعة بعد الجلسة.', 20, 0, 6000, false)
) v(n, key, name_en, name_ar, description_en, description_ar, duration, buffer_after, price_minor, approval_required);

insert into app.catalog_services (id, tenant_id, key, category_id)
select id, 'ad000000-0000-4000-8000-000000000001', key, 'ad041000-0000-4000-8000-000000000001'
from demo_services
on conflict do nothing;

-- VAT is 15% (tax_rate_bps 1500); prices are in halalas.
insert into app.catalog_service_revisions (
  id, tenant_id, service_id, revision, locale, state, name, description, canonical_path,
  duration_minutes, buffer_after_minutes, price_minor, tax_rate_bps, currency,
  approval_required, intake_schema, policy, publication_id, published_at
)
select ('ad044000-0000-4000-8000-0000000000' || s.n || l.n)::uuid,
  'ad000000-0000-4000-8000-000000000001', s.id, 1, l.locale, 'published',
  case l.locale when 'en' then s.name_en else s.name_ar end,
  case l.locale when 'en' then s.description_en else s.description_ar end,
  '/services/' || s.key, s.duration, s.buffer_after, s.price_minor, 1500, 'SAR',
  s.approval_required, '{"fields":[]}'::jsonb,
  jsonb_build_object('consent_version', '1',
    'consent_text', case l.locale
      when 'en' then 'I agree to the booking and cancellation terms.'
      else 'أوافق على شروط الحجز والإلغاء.' end,
    'response_sla_hours', 24),
  'ad040000-0000-4000-8000-000000000001', statement_timestamp()
from demo_services s
cross join (values (1, 'en'), (2, 'ar')) l(n, locale)
on conflict do nothing;

insert into app.catalog_service_locations (tenant_id, service_id, location_id)
select 'ad000000-0000-4000-8000-000000000001', id, 'ad030000-0000-4000-8000-000000000001'
from demo_services
on conflict do nothing;

-- Staff: four people, each offering every service at the main branch ------------
create temp table demo_staff on commit drop as
select ('ad050000-0000-4000-8000-00000000000' || n)::uuid as id, n, name_ar, name_en, role_en, role_ar
from (values
  (1, 'نورة القحطاني', 'Noura Al-Qahtani', 'Skin care specialist', 'أخصائية عناية بالبشرة'),
  (2, 'خالد الشمري', 'Khalid Al-Shammari', 'Senior stylist', 'مصفف شعر أول'),
  (3, 'ريم العتيبي', 'Reem Al-Otaibi', 'Massage therapist', 'معالجة تدليك'),
  (4, 'فهد الدوسري', 'Fahad Al-Dosari', 'Stylist', 'مصفف شعر')
) v(n, name_ar, name_en, role_en, role_ar);

insert into app.staff_profiles (id, tenant_id, public_name, public_bio)
select id, 'ad000000-0000-4000-8000-000000000001', name_ar,
  role_ar || ' · ' || name_en || ', ' || role_en
from demo_staff
on conflict do nothing;
insert into app.staff_locations (tenant_id, staff_id, location_id)
select 'ad000000-0000-4000-8000-000000000001', id, 'ad030000-0000-4000-8000-000000000001'
from demo_staff
on conflict do nothing;
insert into app.staff_services (tenant_id, staff_id, service_id)
select 'ad000000-0000-4000-8000-000000000001', st.id, sv.id
from demo_staff st cross join demo_services sv
on conflict do nothing;
insert into app.staff_service_locations (tenant_id, staff_id, service_id, location_id)
select 'ad000000-0000-4000-8000-000000000001', st.id, sv.id, 'ad030000-0000-4000-8000-000000000001'
from demo_staff st cross join demo_services sv
on conflict do nothing;
insert into app.schedule_scopes (id, tenant_id, scope_kind, location_id, staff_id, time_zone)
select ('ad051000-0000-4000-8000-00000000000' || n)::uuid, 'ad000000-0000-4000-8000-000000000001',
  'staff', 'ad030000-0000-4000-8000-000000000001', id, 'Asia/Riyadh'
from demo_staff
on conflict do nothing;
insert into app.weekly_schedules (id, tenant_id, schedule_scope_id, day_of_week, start_minute, end_minute)
select ('ad052000-0000-4000-8000-0000000000' || st.n || d)::uuid,
  'ad000000-0000-4000-8000-000000000001', ('ad051000-0000-4000-8000-00000000000' || st.n)::uuid,
  d, 540, 1260
from demo_staff st cross join generate_series(0, 6) d
on conflict do nothing;

-- Resources: two treatment rooms -------------------------------------------------
insert into app.resource_types (id, tenant_id, key, name)
values ('ad060000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
  'treatment-room', 'غرفة علاج')
on conflict do nothing;
insert into app.resources (id, tenant_id, resource_type_id, key, public_name, internal_notes)
values
  ('ad061000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
   'ad060000-0000-4000-8000-000000000001', 'room-1', 'غرفة ١', 'Room 1'),
  ('ad061000-0000-4000-8000-000000000002', 'ad000000-0000-4000-8000-000000000001',
   'ad060000-0000-4000-8000-000000000001', 'room-2', 'غرفة ٢', 'Room 2')
on conflict do nothing;
insert into app.resource_locations (tenant_id, resource_id, location_id)
values
  ('ad000000-0000-4000-8000-000000000001', 'ad061000-0000-4000-8000-000000000001', 'ad030000-0000-4000-8000-000000000001'),
  ('ad000000-0000-4000-8000-000000000001', 'ad061000-0000-4000-8000-000000000002', 'ad030000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into app.schedule_scopes (id, tenant_id, scope_kind, location_id, resource_id, time_zone)
values
  ('ad062000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001', 'resource',
   'ad030000-0000-4000-8000-000000000001', 'ad061000-0000-4000-8000-000000000001', 'Asia/Riyadh'),
  ('ad062000-0000-4000-8000-000000000002', 'ad000000-0000-4000-8000-000000000001', 'resource',
   'ad030000-0000-4000-8000-000000000001', 'ad061000-0000-4000-8000-000000000002', 'Asia/Riyadh')
on conflict do nothing;
insert into app.weekly_schedules (id, tenant_id, schedule_scope_id, day_of_week, start_minute, end_minute)
select ('ad063000-0000-4000-8000-0000000000' || r || d)::uuid, 'ad000000-0000-4000-8000-000000000001',
  ('ad062000-0000-4000-8000-00000000000' || r)::uuid, d, 540, 1260
from generate_series(1, 2) r cross join generate_series(0, 6) d
on conflict do nothing;

-- Customers ------------------------------------------------------------------------
-- email_hash uses link_booking_contact_customer's formula, so each booking
-- contact below lands on these rows instead of creating duplicates.
create temp table demo_customers on commit drop as
select ('ad090000-0000-4000-8000-00000000000' || n)::uuid as id, n, full_name, email, phone, locale
from (values
  (1, 'عبدالله الحربي', 'abdullah.alharbi@example.invalid', '+12025550101', 'ar'),
  (2, 'سارة المطيري', 'sara.almutairi@example.invalid', '+12025550102', 'ar'),
  (3, 'محمد الزهراني', 'mohammed.alzahrani@example.invalid', '+12025550103', 'ar'),
  (4, 'لمى الغامدي', 'lama.alghamdi@example.invalid', '+12025550104', 'en'),
  (5, 'يوسف السبيعي', 'yousef.alsubaie@example.invalid', '+12025550105', 'ar'),
  (6, 'هيا العنزي', 'haya.alanazi@example.invalid', '+12025550106', 'ar'),
  (7, 'تركي الشهري', 'turki.alshehri@example.invalid', '+12025550107', 'en'),
  (8, 'جود المالكي', 'joud.almalki@example.invalid', '+12025550108', 'ar')
) v(n, full_name, email, phone, locale);

insert into app.customers (id, tenant_id, email_hash, full_name, email, phone, preferred_locale)
select id, 'ad000000-0000-4000-8000-000000000001',
  encode(sha256(convert_to('ad000000-0000-4000-8000-000000000001:' || lower(email), 'UTF8')), 'hex'),
  full_name, email, phone, locale
from demo_customers
on conflict do nothing;

-- Close out earlier demo days ---------------------------------------------------------
-- What check-in/complete and request expiry would have done by now, so a
-- re-run on a later day does not leave yesterday's appointments "confirmed".
with closed as (
  update app.bookings b
  set status = 'completed', revision = b.revision + 1, updated_at = statement_timestamp()
  where b.tenant_id = 'ad000000-0000-4000-8000-000000000001'
    and b.status in ('confirmed', 'checked_in') and b.ends_at <= statement_timestamp()
  returning b.id, b.revision
)
insert into app.booking_events (tenant_id, booking_id, sequence, event_type, actor_kind, outcome,
  request_id, booking_revision, metadata)
select 'ad000000-0000-4000-8000-000000000001', c.id,
  (select max(e.sequence) + 1 from app.booking_events e
    where e.tenant_id = 'ad000000-0000-4000-8000-000000000001' and e.booking_id = c.id),
  'booking_completed', 'member', 'succeeded', gen_random_uuid(), c.revision,
  '{"action":"complete","to_status":"completed"}'::jsonb
from closed c;

with expired as (
  update app.bookings b
  set status = 'expired', approval_status = 'expired', approval_deadline = null,
    revision = b.revision + 1, updated_at = statement_timestamp()
  where b.tenant_id = 'ad000000-0000-4000-8000-000000000001'
    and b.status = 'requested'
    and (b.starts_at <= statement_timestamp() or b.approval_deadline <= statement_timestamp())
  returning b.id, b.revision
)
insert into app.booking_events (tenant_id, booking_id, sequence, event_type, actor_kind, outcome,
  request_id, booking_revision, metadata)
select 'ad000000-0000-4000-8000-000000000001', x.id,
  (select max(e.sequence) + 1 from app.booking_events e
    where e.tenant_id = 'ad000000-0000-4000-8000-000000000001' and e.booking_id = x.id),
  'booking_request_expired', 'system', 'succeeded', gen_random_uuid(), x.revision, '{}'::jsonb
from expired x;

-- Bookings ---------------------------------------------------------------------------
-- kind: auto = confirmed, then checked_in / completed as its time passes;
-- no_show, cancelled (by the guest), request (awaiting a decision).
create temp table demo_plan on commit drop as
select v.n, v.day_offset, v.local_time::time as local_time, v.staff_n, v.service_n, v.customer_n, v.kind
from (values
  -- today, across all four staff lanes, 09:00-20:00 Riyadh time
  (1, 0, '09:00', 1, 3, 1, 'auto'),
  (2, 0, '09:30', 2, 1, 2, 'auto'),
  (3, 0, '10:00', 3, 4, 3, 'auto'),
  (4, 0, '10:30', 4, 1, 4, 'auto'),
  (5, 0, '11:00', 1, 1, 5, 'cancelled'),
  (6, 0, '12:00', 2, 5, 6, 'auto'),
  (7, 0, '13:00', 3, 3, 7, 'auto'),
  (8, 0, '13:30', 4, 4, 8, 'no_show'),
  (9, 0, '15:00', 1, 1, 2, 'auto'),
  (10, 0, '16:00', 2, 4, 1, 'auto'),
  (11, 0, '16:30', 3, 2, 4, 'request'),
  (12, 0, '17:00', 4, 3, 5, 'auto'),
  (13, 0, '18:00', 1, 5, 3, 'auto'),
  (14, 0, '18:30', 2, 2, 6, 'request'),
  (15, 0, '19:00', 3, 1, 7, 'cancelled'),
  (16, 0, '19:30', 4, 5, 8, 'auto'),
  -- the next seven days
  (17, 1, '10:00', 1, 3, 6, 'auto'),
  (18, 1, '12:00', 2, 2, 3, 'request'),
  (19, 2, '11:00', 3, 4, 2, 'auto'),
  (20, 3, '17:00', 4, 1, 1, 'auto'),
  (21, 4, '09:30', 1, 2, 8, 'request'),
  (22, 5, '15:00', 2, 5, 5, 'auto'),
  (23, 6, '18:00', 3, 3, 4, 'cancelled'),
  (24, 7, '10:00', 4, 4, 7, 'auto'),
  -- the past week
  (25, -1, '10:00', 1, 1, 1, 'auto'),
  (26, -1, '14:00', 2, 3, 3, 'no_show'),
  (27, -2, '11:00', 3, 4, 5, 'auto'),
  (28, -3, '16:00', 4, 5, 6, 'auto'),
  (29, -5, '12:00', 1, 3, 2, 'auto'),
  (30, -7, '18:00', 2, 1, 8, 'cancelled')
) v(n, day_offset, local_time, staff_n, service_n, customer_n, kind);

create temp table demo_bookings on commit drop as
with base as (
  select p.*,
    (statement_timestamp() at time zone 'Asia/Riyadh')::date as anchor_day,
    statement_timestamp() as now_,
    (((statement_timestamp() at time zone 'Asia/Riyadh')::date + p.day_offset + p.local_time)
      at time zone 'Asia/Riyadh') as starts_at
  from demo_plan p
), resolved as (
  select b.*,
    to_char(b.anchor_day, 'YYYYMMDD') || lpad(b.n::text, 4, '0') as suffix,
    b.starts_at + make_interval(mins => en.duration_minutes) as ends_at,
    en.duration_minutes, en.buffer_before_minutes, en.buffer_after_minutes,
    en.price_minor, en.tax_rate_bps, en.currency, en.approval_required,
    c.full_name, c.email, c.phone, c.locale,
    case when c.locale = 'en' then en.name else ar.name end as service_name,
    case when c.locale = 'en' then en.policy else ar.policy end as policy,
    case when c.locale = 'en' then 'Main branch' else 'الفرع الرئيسي' end as location_name,
    sv.id as service_id, st.id as staff_id
  from base b
  join demo_services sv on sv.n = b.service_n
  join demo_staff st on st.n = b.staff_n
  join demo_customers c on c.n = b.customer_n
  join app.catalog_service_revisions en on en.service_id = sv.id and en.locale = 'en' and en.state = 'published'
  join app.catalog_service_revisions ar on ar.service_id = sv.id and ar.locale = 'ar' and ar.state = 'published'
), stated as (
  select r.*,
    case
      when r.kind = 'cancelled' then 'cancelled'
      when r.kind = 'request' and r.starts_at > r.now_ then 'requested'
      when r.kind = 'request' then 'expired'
      when r.kind = 'no_show' and r.starts_at + interval '15 minutes' <= r.now_ then 'no_show'
      when r.ends_at <= r.now_ then 'completed'
      when r.starts_at <= r.now_ then 'checked_in'
      else 'confirmed'
    end as status,
    -- Booked ahead of time; a pending request was submitted in the last hour.
    case
      when r.kind = 'request' and r.starts_at > r.now_ then r.now_ - interval '1 hour'
      else least(r.starts_at, r.now_) - make_interval(days => 1 + r.n % 6, hours => r.n % 5)
    end as created_at,
    -- A guest cancelled recently (so today's show in the cancellations queue),
    -- or, for a past appointment, on the morning of it.
    case when r.kind = 'cancelled' then
      case when r.day_offset < 0 then r.starts_at - interval '6 hours'
        else r.now_ - interval '2 hours' end end as cancelled_at
  from resolved r
)
select s.*,
  ('ad800000-0000-4000-8000-' || s.suffix)::uuid as hold_id,
  ('ad810000-0000-4000-8000-' || s.suffix)::uuid as allocation_id,
  ('ad820000-0000-4000-8000-' || s.suffix)::uuid as booking_id,
  -- Crockford alphabet, like confirm_booking_v1: digits plus D and M.
  'DM' || to_char(s.anchor_day, 'YYMMDD') || lpad(s.n::text, 2, '0') as public_reference,
  case when s.status in ('cancelled', 'requested', 'expired') then 'cancelled' else 'confirmed' end
    as allocation_state,
  gen_random_uuid() as correlation_id
from stated s
where not exists (
  select 1 from app.bookings b
  where b.tenant_id = 'ad000000-0000-4000-8000-000000000001'
    and b.id = ('ad820000-0000-4000-8000-' || s.suffix)::uuid
);

-- A set generated on a different day must not double-book anyone: drop any
-- candidate whose staff already holds that time (the exclusion constraint
-- would otherwise reject the whole transaction).
delete from demo_bookings d
where d.allocation_state = 'confirmed'
  and exists (
    select 1 from app.assignment_allocations a
    where a.tenant_id = 'ad000000-0000-4000-8000-000000000001'
      and a.staff_id = d.staff_id and a.state in ('held', 'confirmed')
      and a.occupied_at && tsrange(
        (d.starts_at at time zone 'UTC') - make_interval(mins => d.buffer_before_minutes),
        (d.ends_at at time zone 'UTC') + make_interval(mins => d.buffer_after_minutes), '[)'));

insert into app.booking_holds (
  id, tenant_id, service_id, location_id, publication_id, allocation_kind, starts_at, ends_at,
  state, expires_at, ttl_seconds, price_minor, tax_rate_bps, currency, session_hash,
  correlation_id, created_at, updated_at, released_at
)
select hold_id, 'ad000000-0000-4000-8000-000000000001', service_id,
  'ad030000-0000-4000-8000-000000000001', 'ad040000-0000-4000-8000-000000000001', 'appointment',
  starts_at, ends_at, 'released', created_at + interval '10 minutes', 600,
  price_minor, tax_rate_bps, currency,
  encode(sha256(convert_to('arabic-demo:' || booking_id::text, 'UTF8')), 'hex'),
  correlation_id, created_at, created_at, created_at
from demo_bookings;

insert into app.assignment_allocations (
  id, tenant_id, service_id, location_id, staff_id, starts_at, ends_at,
  buffer_before_minutes, buffer_after_minutes, state, hold_id
)
select allocation_id, 'ad000000-0000-4000-8000-000000000001', service_id,
  'ad030000-0000-4000-8000-000000000001', staff_id, starts_at, ends_at,
  buffer_before_minutes, buffer_after_minutes, allocation_state, hold_id
from demo_bookings;

insert into app.bookings (
  id, tenant_id, public_reference, service_id, location_id, hold_id, publication_id,
  status, payment_status, notification_status, calendar_status, approval_status,
  starts_at, ends_at, party_size, duration_minutes, buffer_before_minutes, buffer_after_minutes,
  price_minor, tax_rate_bps, currency, policy_snapshot, consent_text, consent_version, consented_at,
  intake_schema_snapshot, service_name, location_name, locale, location_time_zone,
  customer_time_zone, correlation_id, created_at, updated_at, approval_deadline,
  cancelled_at, cancellation_actor_kind, refund_percent_bps, refund_eligible_minor, revision
)
select booking_id, 'ad000000-0000-4000-8000-000000000001', public_reference, service_id,
  'ad030000-0000-4000-8000-000000000001', hold_id, 'ad040000-0000-4000-8000-000000000001',
  status, 'not_required', 'sent', 'pending',
  case
    when status = 'requested' then 'pending'
    when status = 'expired' then 'expired'
    when approval_required then 'approved'
    else 'not_required'
  end,
  starts_at, ends_at, 1, duration_minutes, buffer_before_minutes, buffer_after_minutes,
  price_minor, tax_rate_bps, currency, policy, policy ->> 'consent_text', policy ->> 'consent_version',
  created_at, '{"fields":[]}'::jsonb, service_name, location_name, locale, 'Asia/Riyadh',
  'Asia/Riyadh', correlation_id, created_at, statement_timestamp(),
  case when status = 'requested' then created_at + interval '24 hours' end,
  cancelled_at,
  case when status = 'cancelled' then 'guest' end,
  case when status = 'cancelled' then 10000 end,
  case when status = 'cancelled' then price_minor end,
  case status when 'completed' then 3 when 'checked_in' then 2 when 'no_show' then 2
    when 'cancelled' then 2 when 'expired' then 2 when 'requested' then 1
    else case when approval_required then 2 else 1 end end
from demo_bookings;

insert into app.booking_contacts (tenant_id, booking_id, full_name, email, phone)
select 'ad000000-0000-4000-8000-000000000001', booking_id, full_name, email, phone
from demo_bookings;

-- Event history, in the order the real functions write it.
insert into app.booking_events (
  tenant_id, booking_id, sequence, event_type, actor_kind, reason, outcome, request_id,
  booking_revision, metadata, created_at
)
select 'ad000000-0000-4000-8000-000000000001', d.booking_id, e.sequence, e.event_type, e.actor_kind,
  e.reason, 'succeeded', d.correlation_id, e.sequence, e.metadata, e.at
from demo_bookings d
cross join lateral (
  select 1 as sequence,
    case when d.approval_required then 'booking_requested' else 'booking_confirmed' end as event_type,
    'guest' as actor_kind,
    case when d.approval_required then 'request_to_book' else 'instant_booking' end as reason,
    jsonb_build_object('application', 'client', 'locale', d.locale, 'payment_mode', 'none',
      'publication_id', 'ad040000-0000-4000-8000-000000000001') as metadata,
    d.created_at as at
  union all
  select 2, 'booking_confirmed', 'member', 'request_approved', '{"decision":"approve"}'::jsonb,
    d.created_at + interval '2 hours'
  where d.approval_required and d.status not in ('requested', 'expired', 'cancelled')
  union all
  select 2, 'booking_request_expired', 'system', null, '{}'::jsonb, d.starts_at
  where d.status = 'expired'
  union all
  select 2, 'booking_cancelled', 'guest', null,
    '{"refund_percent_bps":10000,"released_allocations":1,"has_public_reason":false}'::jsonb,
    d.cancelled_at
  where d.status = 'cancelled'
  union all
  select 2, 'booking_no_show', 'member', null,
    '{"action":"no_show","from_status":"confirmed","to_status":"no_show"}'::jsonb,
    d.starts_at + interval '15 minutes'
  where d.status = 'no_show'
  union all
  select 2, 'booking_checked_in', 'member', null,
    '{"action":"check_in","from_status":"confirmed","to_status":"checked_in"}'::jsonb,
    d.starts_at
  where d.status in ('checked_in', 'completed') and not d.approval_required
  union all
  select 3, 'booking_completed', 'member', null,
    '{"action":"complete","from_status":"checked_in","to_status":"completed"}'::jsonb,
    d.ends_at
  where d.status = 'completed' and not d.approval_required
) e;

commit;
