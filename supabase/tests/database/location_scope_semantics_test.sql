-- Location scope semantics (ADR-0019, amending ADR-0013).
--   tenant mode:   no location rows reach every location; rows reach exactly those.
--   assigned mode: rows reach exactly those; no rows reach nothing (fail closed).
-- The RPCs never create an assigned holder without a location, and the scope
-- backfill gives any such holder every location of its tenant.
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

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
from (values
  ('e1e00000-0000-4000-8000-000000000001'::uuid, 'scope-active@example.invalid'),
  ('e1e00000-0000-4000-8000-000000000002'::uuid, 'scope-suspended@example.invalid'),
  ('e1e00000-0000-4000-8000-000000000003'::uuid, 'scope-revoked@example.invalid'),
  ('e1e00000-0000-4000-8000-000000000004'::uuid, 'scope-tenant@example.invalid'),
  ('e1e00000-0000-4000-8000-000000000005'::uuid, 'scope-pinned@example.invalid'),
  ('e1e00000-0000-4000-8000-000000000006'::uuid, 'scope-invitee@example.invalid')) as u(id, email);

-- A third, inactive, location in Tenant A.
insert into app.locations (id, tenant_id, key, name, time_zone, status)
values ('a5000000-0000-0000-0000-0000000000c3', 'a0000000-0000-0000-0000-000000000001', 'location-a-closed', 'Closed', 'America/New_York', 'inactive');

-- ---------------------------------------------------------------------------
-- 1. The four shapes, read through RLS.
-- ---------------------------------------------------------------------------
insert into app.memberships (id, tenant_id, auth_user_id, role_id, status, revoked_at)
values
  ('a3e00000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'e1e00000-0000-4000-8000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'active', null),
  ('a3e00000-0000-4000-8000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'e1e00000-0000-4000-8000-000000000002', 'a2000000-0000-0000-0000-000000000003', 'suspended', null),
  ('a3e00000-0000-4000-8000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'e1e00000-0000-4000-8000-000000000003', 'a2000000-0000-0000-0000-000000000001', 'revoked', now()),
  ('a3e00000-0000-4000-8000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'e1e00000-0000-4000-8000-000000000004', 'a2000000-0000-0000-0000-000000000002', 'active', null),
  ('a3e00000-0000-4000-8000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'e1e00000-0000-4000-8000-000000000005', 'a2000000-0000-0000-0000-000000000002', 'active', null);
insert into app.membership_location_scopes (tenant_id, membership_id, location_id)
values ('a0000000-0000-0000-0000-000000000001', 'a3e00000-0000-4000-8000-000000000005', 'a5000000-0000-0000-0000-000000000002');

select pg_temp.claims('e1e00000-0000-4000-8000-000000000004', null);
set local role authenticated;
select is((select count(*)::integer from app.locations), 3, 'tenant mode, no rows: every location of the tenant');
reset role;
select pg_temp.claims('e1e00000-0000-4000-8000-000000000005', null);
set local role authenticated;
select is((select array_agg(id) from app.locations), array['a5000000-0000-0000-0000-000000000002'::uuid], 'tenant mode, one row: exactly that location');
reset role;
select pg_temp.claims('a1000000-0000-0000-0000-000000000001', null);
set local role authenticated;
select is((select array_agg(id) from app.locations), array['a5000000-0000-0000-0000-000000000001'::uuid], 'assigned mode, one row: exactly that location');
reset role;
select pg_temp.claims('e1e00000-0000-4000-8000-000000000001', null);
set local role authenticated;
select is((select count(*)::integer from app.locations), 0, 'assigned mode, no rows: nothing (fail closed)');
reset role;

-- ---------------------------------------------------------------------------
-- 2. The backfill: every active or suspended assigned holder with no row, and
--    every still-acceptable invitation, gets every location (inactive too).
-- ---------------------------------------------------------------------------
insert into app.invitations (id, tenant_id, role_id, invited_by_membership_id, invitee_email, token_hash, status, expires_at, created_at)
values
  ('a6e00000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000002',
    'scope-invitee@example.invalid', repeat('1', 64), 'pending', now() + interval '1 day', now()),
  ('a6e00000-0000-4000-8000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000003', 'a3000000-0000-0000-0000-000000000002',
    'scope-expired@example.invalid', repeat('2', 64), 'expired', now() + interval '1 day', now() - interval '1 day'),
  ('a6e00000-0000-4000-8000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000002',
    'scope-revoked-invite@example.invalid', repeat('3', 64), 'revoked', now() + interval '1 day', now()),
  ('a6e00000-0000-4000-8000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000002',
    'scope-scheduler@example.invalid', repeat('4', 64), 'pending', now() + interval '1 day', now());

-- An invitation in that shape cannot be accepted before the backfill places it.
select pg_temp.claims('e1e00000-0000-4000-8000-000000000006', null);
set local role authenticated;
select throws_like($$select api_v1.accept_staff_invitation_v1('a6e00000-0000-4000-8000-000000000001')$$, '%invitation_unavailable%',
  'an assigned-role invitation with no location is not acceptable');
reset role;

select is((select row(members, member_rows, invitations, invitation_rows)::text from private.backfill_assigned_location_scopes_v1()),
  '(2,6,2,6)', 'the backfill placed the active and suspended holders and the pending and expired invitations, on all three locations');
select is((select count(*)::integer from app.membership_location_scopes where membership_id = 'a3e00000-0000-4000-8000-000000000003'), 0,
  'a revoked membership is left alone');
select is((select count(*)::integer from app.membership_location_scopes where membership_id = 'a3e00000-0000-4000-8000-000000000004'), 0,
  'a tenant-mode holder is left alone (it already reaches everything)');
select is((select count(*)::integer from app.invitation_location_scopes where invitation_id in
  ('a6e00000-0000-4000-8000-000000000003', 'a6e00000-0000-4000-8000-000000000004')), 0, 'revoked and tenant-mode invitations are left alone');
select is((select row(members, member_rows, invitations, invitation_rows)::text from private.backfill_assigned_location_scopes_v1()),
  '(0,0,0,0)', 'the backfill is idempotent');
select pg_temp.claims('e1e00000-0000-4000-8000-000000000001', null);
set local role authenticated;
select is((select count(*)::integer from app.locations), 3, 'the placed holder reaches what it reached before');
reset role;
select pg_temp.claims('e1e00000-0000-4000-8000-000000000006', null);
set local role authenticated;
select ok((api_v1.accept_staff_invitation_v1('a6e00000-0000-4000-8000-000000000001') ->> 'membership_id') is not null,
  'the placed invitation is acceptable again');
select is((select count(*)::integer from app.locations), 3, 'and its holder reaches every location it was invited to');
reset role;

-- ---------------------------------------------------------------------------
-- 3. The RPCs never create the fail-closed shape.
-- ---------------------------------------------------------------------------
select pg_temp.claims('a1000000-0000-0000-0000-000000000002');
set local role authenticated;
select throws_like($$select api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'invite', null, null,
  'a2000000-0000-0000-0000-000000000001', '{}', 'nowhere@example.invalid')$$, '%invalid_request%', 'an assigned role cannot be invited without a location');
select throws_like($$select api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'invite', null, null,
  'a2000000-0000-0000-0000-000000000001', array[null]::uuid[], 'nowhere@example.invalid')$$, '%invalid_request%', 'a null location is not a location');
select throws_like($$select api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'invite', null, null,
  'a2000000-0000-0000-0000-000000000001', array['a5000000-0000-0000-0000-0000000000c3'::uuid], 'nowhere@example.invalid')$$, '%invalid_request%',
  'an inactive location cannot be newly assigned');
select ok((api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'invite', null, null,
  'a2000000-0000-0000-0000-000000000002', '{}', 'everywhere@example.invalid') ->> 'id') is not null, 'a tenant-mode role needs no location');
select throws_like($$select api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'edit_membership',
  'a3e00000-0000-4000-8000-000000000004', 1, 'a2000000-0000-0000-0000-000000000003', '{}')$$, '%invalid_request%',
  'nobody is moved onto an assigned role without a location');
select is((api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'edit_membership',
  'a3e00000-0000-4000-8000-000000000004', 1, 'a2000000-0000-0000-0000-000000000003', array['a5000000-0000-0000-0000-000000000002','a5000000-0000-0000-0000-000000000002']::uuid[]) ->> 'revision')::integer,
  2, 'with a location it is fine (duplicates collapse)');
reset role;
select is((select count(*)::integer from app.membership_location_scopes where membership_id = 'a3e00000-0000-4000-8000-000000000004'), 1, 'one row per location');

-- Resend: an expired assigned invitation whose rows were removed cannot come back.
delete from app.invitation_location_scopes where invitation_id = 'a6e00000-0000-4000-8000-000000000002';
select pg_temp.claims('a1000000-0000-0000-0000-000000000002');
set local role authenticated;
select throws_like($$select api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'resend',
  'a6e00000-0000-4000-8000-000000000002', 1)$$, '%invalid_request%', 'an unplaced assigned invitation is not re-sent');

-- Switching a custom role to assigned mode cannot strand its holders.
select set_config('test.flex', api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => gen_random_uuid(),
  p_name_en => 'Flexible', p_name_ar => 'مرن', p_location_scope_mode => 'tenant',
  p_grants => '[{"permission_key":"booking.view.own","grant_kind":"direct","scope_kind":"own"}]') ->> 'role_id', true);
select is((api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'edit_membership',
  'a3e00000-0000-4000-8000-000000000005', 1, current_setting('test.flex')::uuid, '{}') ->> 'revision')::integer, 2,
  'a tenant-mode custom role is assigned without a location');
select throws_like(format($$select api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => gen_random_uuid(),
  p_role_id => %L, p_expected_revision => 1, p_name_en => 'Flexible', p_name_ar => 'مرن', p_location_scope_mode => 'assigned',
  p_grants => '[{"permission_key":"booking.view.own","grant_kind":"direct","scope_kind":"own"}]')$$, current_setting('test.flex')),
  '%role_scope_in_use%', 'switching to assigned mode while a holder has no location is refused');
select is((api_v1.change_staff_access_v1('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'edit_membership',
  'a3e00000-0000-4000-8000-000000000005', 2, current_setting('test.flex')::uuid, array['a5000000-0000-0000-0000-000000000001'::uuid]) ->> 'revision')::integer, 3,
  'place the holder');
select is((api_v1.save_role_v1(p_tenant_id => 'a0000000-0000-0000-0000-000000000001', p_request_id => gen_random_uuid(),
  p_role_id => current_setting('test.flex')::uuid, p_expected_revision => 1, p_name_en => 'Flexible', p_name_ar => 'مرن', p_location_scope_mode => 'assigned',
  p_grants => '[{"permission_key":"booking.view.own","grant_kind":"direct","scope_kind":"own"}]') ->> 'revision')::integer, 2,
  'then the switch goes through');
reset role;
select pg_temp.claims('e1e00000-0000-4000-8000-000000000005', null);
set local role authenticated;
select is((select array_agg(id) from app.locations), array['a5000000-0000-0000-0000-000000000001'::uuid], 'and the holder reaches exactly its location');
reset role;

select * from finish();
rollback;
