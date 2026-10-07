-- Tenant custom roles, part 1: the data model (ADR-0019).
--
-- Roles were always per-tenant rows and every authorization check already asks
-- for a capability, never a role name. Custom roles therefore live in the same
-- tables as the four built-ins. What this file adds is the shape that makes
-- that safe: a permission catalog that marks owner-level keys as reserved, the
-- platform template the built-ins are installed from, the columns a custom role
-- needs, triggers that keep every grant consistent with its role, and an
-- append-only role change ledger.
--
-- Effective access of every existing member is unchanged by this migration: the
-- only new authority is `role.manage`, added to roles that are already the
-- tenant's administrators, and the scope backfill at the end gives assigned-mode
-- members exactly the locations they could already reach.

insert into app.permissions (key, description)
values ('role.manage', 'Define, edit and archive tenant custom roles');

-- ---------------------------------------------------------------------------
-- 1. Permission catalog metadata. Global and read-only; labels and hints live
--    in the applications' i18n, not here.
-- ---------------------------------------------------------------------------
create table app.permission_meta (
  permission_key text primary key references app.permissions (key) on delete restrict,
  group_key text not null check (group_key in (
    'bookings', 'catalog_schedule', 'team', 'customers_privacy',
    'brand_integrations', 'audit', 'owner')),
  allowed_scopes text[] not null check (
    cardinality(allowed_scopes) between 1 and 3
    and allowed_scopes <@ array['tenant', 'location', 'own']::text[]),
  allowed_grant_kinds text[] not null check (
    cardinality(allowed_grant_kinds) between 1 and 2
    and allowed_grant_kinds <@ array['direct', 'approval']::text[]),
  reserved boolean not null default false,
  sort_order integer not null unique check (sort_order > 0),
  check (not reserved or group_key = 'owner')
);

insert into app.permission_meta (permission_key, group_key, allowed_scopes, allowed_grant_kinds, reserved, sort_order)
values
  ('booking.view.own',               'bookings',           array['tenant','location','own'], array['direct'],             false, 10),
  ('booking.view.any',               'bookings',           array['tenant','location'],       array['direct'],             false, 20),
  ('booking.create_on_behalf',       'bookings',           array['tenant','location','own'], array['direct','approval'],  false, 30),
  ('booking.approve',                'bookings',           array['tenant','location','own'], array['direct','approval'],  false, 40),
  ('booking.reschedule',             'bookings',           array['tenant','location','own'], array['direct','approval'],  false, 50),
  ('booking.cancel',                 'bookings',           array['tenant','location','own'], array['direct','approval'],  false, 60),
  ('booking.check_in',               'bookings',           array['tenant','location','own'], array['direct','approval'],  false, 70),
  ('booking.check_in_override',      'bookings',           array['tenant','location'],       array['direct','approval'],  false, 80),
  ('booking.mark_no_show',           'bookings',           array['tenant','location','own'], array['direct','approval'],  false, 90),
  ('booking.complete',               'bookings',           array['tenant','location','own'], array['direct','approval'],  false, 100),
  ('booking.correct_status',         'bookings',           array['tenant','location'],       array['direct','approval'],  false, 110),
  ('refund.issue',                   'bookings',           array['tenant','location','own'], array['direct','approval'],  false, 120),
  ('catalog.edit',                   'catalog_schedule',   array['tenant','location'],       array['direct','approval'],  false, 200),
  ('schedule.edit',                  'catalog_schedule',   array['tenant','location','own'], array['direct','approval'],  false, 210),
  ('policy.edit',                    'catalog_schedule',   array['tenant','location'],       array['direct','approval'],  false, 220),
  ('staff.manage',                   'team',               array['tenant','location'],       array['direct','approval'],  false, 300),
  ('customer.pii.view',              'customers_privacy',  array['tenant','location','own'], array['direct'],             false, 400),
  ('customer.data.export',           'customers_privacy',  array['tenant'],                  array['direct','approval'],  false, 410),
  ('customer.data.export_on_behalf', 'customers_privacy',  array['tenant'],                  array['direct','approval'],  false, 420),
  ('customer.data.correct',          'customers_privacy',  array['tenant'],                  array['direct','approval'],  false, 430),
  ('customer.data.restrict',         'customers_privacy',  array['tenant'],                  array['direct','approval'],  false, 440),
  ('customer.data.delete',           'customers_privacy',  array['tenant'],                  array['direct','approval'],  false, 450),
  ('brand.manage',                   'brand_integrations', array['tenant'],                  array['direct','approval'],  false, 500),
  ('integration.manage',             'brand_integrations', array['tenant'],                  array['direct','approval'],  false, 510),
  ('instance.request_update',        'brand_integrations', array['tenant'],                  array['direct','approval'],  false, 520),
  ('audit.read',                     'audit',              array['tenant','location'],       array['direct'],             false, 600),
  ('role.manage',                    'owner',              array['tenant'],                  array['direct','approval'],  true,  900),
  ('billing.view',                   'owner',              array['tenant'],                  array['direct','approval'],  true,  910),
  ('billing.change_plan',            'owner',              array['tenant'],                  array['direct','approval'],  true,  920),
  ('support.grant_access',           'owner',              array['tenant'],                  array['direct','approval'],  true,  930),
  ('tenant.owner_transfer',          'owner',              array['tenant'],                  array['direct','approval'],  true,  940),
  ('tenant.read_other_tenant',       'owner',              array['tenant'],                  array['direct','approval'],  true,  950);

do $check$
begin
  if exists (select 1 from app.permissions p where not exists (
      select 1 from app.permission_meta m where m.permission_key = p.key)) then
    raise exception 'every permission needs catalog metadata';
  end if;
end;
$check$;

-- ---------------------------------------------------------------------------
-- 2. Platform templates for the four built-in roles. These are the seed grant
--    table plus `role.manage` for the tenant administrator.
-- ---------------------------------------------------------------------------
create table private.builtin_role_templates (
  role_key text primary key check (role_key in ('staff', 'scheduler', 'location_manager', 'tenant_admin')),
  location_scope_mode text not null check (location_scope_mode in ('assigned', 'tenant'))
);
create table private.builtin_role_template_grants (
  role_key text not null references private.builtin_role_templates (role_key) on delete cascade,
  permission_key text not null references app.permissions (key) on delete restrict,
  grant_kind text not null check (grant_kind in ('direct', 'approval')),
  scope_kind text not null check (scope_kind in ('tenant', 'location', 'own')),
  primary key (role_key, permission_key)
);
alter table private.builtin_role_templates enable row level security;
alter table private.builtin_role_template_grants enable row level security;
revoke all on private.builtin_role_templates, private.builtin_role_template_grants
  from public, anon, authenticated, service_role;

insert into private.builtin_role_templates (role_key, location_scope_mode)
values ('staff', 'assigned'), ('scheduler', 'tenant'),
  ('location_manager', 'assigned'), ('tenant_admin', 'tenant');

insert into private.builtin_role_template_grants (role_key, permission_key, grant_kind, scope_kind)
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
  ('tenant_admin', 'customer.data.restrict', 'direct', 'tenant'),
  ('tenant_admin', 'customer.data.delete', 'approval', 'tenant'),
  ('tenant_admin', 'brand.manage', 'direct', 'tenant'),
  ('tenant_admin', 'integration.manage', 'direct', 'tenant'),
  ('tenant_admin', 'billing.view', 'direct', 'tenant'),
  ('tenant_admin', 'billing.change_plan', 'approval', 'tenant'),
  ('tenant_admin', 'support.grant_access', 'direct', 'tenant'),
  ('tenant_admin', 'audit.read', 'direct', 'tenant'),
  ('tenant_admin', 'instance.request_update', 'direct', 'tenant'),
  ('tenant_admin', 'tenant.owner_transfer', 'approval', 'tenant'),
  ('tenant_admin', 'role.manage', 'approval', 'tenant');

-- ---------------------------------------------------------------------------
-- 3. Role columns. Built-ins keep their four keys and carry no names (their
--    labels are localized by the applications); custom roles get a server
--    generated key and a name in both languages.
-- ---------------------------------------------------------------------------
alter table app.roles drop constraint roles_key_check;
alter table app.roles
  add column is_builtin boolean generated always as (
    key in ('staff', 'scheduler', 'location_manager', 'tenant_admin')) stored,
  add column name_en text,
  add column name_ar text,
  add column description_en text,
  add column description_ar text,
  add column revision bigint not null default 1 check (revision > 0),
  add column archived_at timestamptz,
  add column updated_at timestamptz not null default statement_timestamp(),
  add column created_by_membership_id uuid,
  add column duplicated_from_role_id uuid,
  add constraint roles_key_check check (
    key in ('staff', 'scheduler', 'location_manager', 'tenant_admin')
    or key ~ '^custom_[0-9a-f]{16}$'),
  add constraint roles_builtin_unnamed check (
    not is_builtin or (name_en is null and name_ar is null and description_en is null
      and description_ar is null and archived_at is null and duplicated_from_role_id is null)),
  add constraint roles_custom_named check (
    is_builtin or (
      name_en is not null and name_en = btrim(name_en) and char_length(name_en) between 1 and 80
      and name_ar is not null and name_ar = btrim(name_ar) and char_length(name_ar) between 1 and 80)),
  add constraint roles_description_shape check (
    (description_en is null or (description_en = btrim(description_en) and char_length(description_en) between 1 and 500))
    and (description_ar is null or (description_ar = btrim(description_ar) and char_length(description_ar) between 1 and 500))),
  add constraint roles_created_by_fk foreign key (tenant_id, created_by_membership_id)
    references app.memberships (tenant_id, id) on delete restrict,
  add constraint roles_duplicated_from_fk foreign key (tenant_id, duplicated_from_role_id)
    references app.roles (tenant_id, id) on delete restrict;

create unique index roles_active_name_en_idx on app.roles (tenant_id, lower(name_en))
  where archived_at is null and not is_builtin;
create unique index roles_active_name_ar_idx on app.roles (tenant_id, name_ar)
  where archived_at is null and not is_builtin;
create index roles_created_by_idx on app.roles (tenant_id, created_by_membership_id);
create index roles_duplicated_from_idx on app.roles (tenant_id, duplicated_from_role_id);

-- ---------------------------------------------------------------------------
-- 4. Grant consistency, enforced below every write path:
--    * reserved (owner-level) keys only ever on built-in roles;
--    * a custom role's grant uses a scope and kind its catalog entry allows;
--    * a tenant-mode role holds no location-scoped grant and an assigned-mode
--      role holds no tenant-scoped grant;
--    * a role's key never changes, and its mode only changes when every grant
--      it holds still fits the new mode.
-- ---------------------------------------------------------------------------
create function private.guard_role_permission_v1()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_role app.roles%rowtype;
  v_meta app.permission_meta%rowtype;
begin
  select * into v_role from app.roles r where r.tenant_id = new.tenant_id and r.id = new.role_id;
  if not found then
    return new; -- the foreign key reports the missing role
  end if;
  select * into v_meta from app.permission_meta m where m.permission_key = new.permission_key;
  if not v_role.is_builtin then
    if v_meta.permission_key is null or v_meta.reserved then
      raise exception using errcode = '22023', message = 'permission_reserved';
    end if;
    if not (new.scope_kind = any (v_meta.allowed_scopes))
       or not (new.grant_kind = any (v_meta.allowed_grant_kinds)) then
      raise exception using errcode = '22023', message = 'grant_not_allowed';
    end if;
  end if;
  if (v_role.location_scope_mode = 'tenant' and new.scope_kind = 'location')
     or (v_role.location_scope_mode = 'assigned' and new.scope_kind = 'tenant') then
    raise exception using errcode = '22023', message = 'scope_mode_mismatch';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_role_permission_v1() from public, anon, authenticated, service_role;
create trigger role_permissions_guard before insert or update on app.role_permissions
  for each row execute function private.guard_role_permission_v1();

create function private.guard_role_shape_v1()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.key is distinct from old.key or new.tenant_id is distinct from old.tenant_id then
    raise exception using errcode = '22023', message = 'role_key_immutable';
  end if;
  if new.location_scope_mode is distinct from old.location_scope_mode and exists (
      select 1 from app.role_permissions rp
      where rp.tenant_id = new.tenant_id and rp.role_id = new.id
        and ((new.location_scope_mode = 'tenant' and rp.scope_kind = 'location')
          or (new.location_scope_mode = 'assigned' and rp.scope_kind = 'tenant'))) then
    raise exception using errcode = '22023', message = 'scope_mode_mismatch';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_role_shape_v1() from public, anon, authenticated, service_role;
create trigger roles_shape_guard before update on app.roles
  for each row execute function private.guard_role_shape_v1();

-- ---------------------------------------------------------------------------
-- 5. Append-only role change ledger. Readable by audit.read; written only by
--    the role RPCs.
-- ---------------------------------------------------------------------------
create table app.role_change_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete restrict,
  actor_id uuid not null,
  request_id uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  action text not null check (action in ('create', 'duplicate', 'update', 'archive')),
  role_id uuid not null,
  role_revision bigint not null check (role_revision > 0),
  result jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  unique (tenant_id, request_id),
  unique (tenant_id, id),
  foreign key (tenant_id, role_id) references app.roles (tenant_id, id) on delete restrict
);
create index role_change_events_role_idx on app.role_change_events (tenant_id, role_id, created_at);
create trigger role_change_events_append_only before update or delete on app.role_change_events
  for each row execute function private.enforce_append_only();

-- Every app table answers every operation with an explicit policy.
do $rls$
declare t text;
begin
  foreach t in array array['permission_meta', 'role_change_events'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('create policy %I on app.%I for insert to anon,authenticated with check (false)', t || '_insert_denied', t);
    execute format('create policy %I on app.%I for update to anon,authenticated using (false) with check (false)', t || '_update_denied', t);
    execute format('create policy %I on app.%I for delete to anon,authenticated using (false)', t || '_delete_denied', t);
    execute format('revoke all on app.%I from public,anon,authenticated,service_role', t);
  end loop;
end;
$rls$;
create policy permission_meta_select_authenticated on app.permission_meta
  for select to authenticated using (true);
create policy permission_meta_select_denied_anon on app.permission_meta
  for select to anon using (false);
create policy role_change_events_select_audit on app.role_change_events
  for select to authenticated using ((select private.has_direct_capability(tenant_id, 'audit.read')));
create policy role_change_events_select_denied_anon on app.role_change_events
  for select to anon using (false);
grant select on app.permission_meta, app.role_change_events to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Installing the built-ins. Idempotent: a role the tenant lacks is created
--    with its full template; a role that already exists keeps its grants and
--    only gains `role.manage` where the template says so. That keeps the
--    effective access of existing members identical while making every tenant
--    administrator a role administrator.
-- ---------------------------------------------------------------------------
create function private.install_builtin_roles_v1(p_tenant_id uuid)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_created text[]; v_count integer;
begin
  if not exists (select 1 from app.tenants x where x.id = p_tenant_id) then
    return 0;
  end if;
  with created as (
    insert into app.roles (id, tenant_id, key, location_scope_mode)
    select pg_catalog.gen_random_uuid(), p_tenant_id, t.role_key, t.location_scope_mode
    from private.builtin_role_templates t
    on conflict (tenant_id, key) do nothing
    returning key
  )
  select coalesce(array_agg(created.key), '{}'::text[]) into v_created from created;
  insert into app.role_permissions (tenant_id, role_id, permission_key, grant_kind, scope_kind)
  select r.tenant_id, r.id, g.permission_key, g.grant_kind, g.scope_kind
  from private.builtin_role_template_grants g
  join app.roles r on r.tenant_id = p_tenant_id and r.key = g.role_key
  where r.key = any (v_created) or g.permission_key = 'role.manage'
  on conflict (tenant_id, role_id, permission_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function private.install_builtin_roles_v1(uuid) from public, anon, authenticated, service_role;

do $install$
declare v_tenants integer := 0; v_grants integer := 0; v_tenant record;
begin
  for v_tenant in select t.id from app.tenants t order by t.id loop
    v_grants := v_grants + private.install_builtin_roles_v1(v_tenant.id);
    v_tenants := v_tenants + 1;
  end loop;
  raise notice 'custom roles: built-in roles installed for % tenant(s), % grant row(s) added', v_tenants, v_grants;
end;
$install$;

-- ---------------------------------------------------------------------------
-- 7. Scope backfill. Until now an assigned-mode member with no location rows
--    reached the whole tenant; from part 2 on, assigned mode fails closed. Give
--    each such member and each still-acceptable invitation every location of
--    its tenant (inactive ones too), so nobody's reach changes.
-- ---------------------------------------------------------------------------
create function private.backfill_assigned_location_scopes_v1()
returns table (members integer, member_rows integer, invitations integer, invitation_rows integer)
language plpgsql security invoker set search_path = '' as $$
declare v_members integer; v_member_rows integer; v_invitations integer; v_invitation_rows integer;
begin
  with targets as (
    select m.tenant_id, m.id from app.memberships m
    join app.roles r on r.tenant_id = m.tenant_id and r.id = m.role_id
    where m.status in ('active', 'suspended') and r.location_scope_mode = 'assigned'
      and not exists (select 1 from app.membership_location_scopes s
        where s.tenant_id = m.tenant_id and s.membership_id = m.id)
  ), inserted as (
    insert into app.membership_location_scopes (tenant_id, membership_id, location_id)
    select t.tenant_id, t.id, l.id from targets t join app.locations l on l.tenant_id = t.tenant_id
    on conflict do nothing
    returning membership_id
  )
  select (select count(*) from targets), (select count(*) from inserted) into v_members, v_member_rows;

  with targets as (
    select i.tenant_id, i.id from app.invitations i
    join app.roles r on r.tenant_id = i.tenant_id and r.id = i.role_id
    where i.status in ('pending', 'expired') and r.location_scope_mode = 'assigned'
      and not exists (select 1 from app.invitation_location_scopes s
        where s.tenant_id = i.tenant_id and s.invitation_id = i.id)
  ), inserted as (
    insert into app.invitation_location_scopes (tenant_id, invitation_id, location_id)
    select t.tenant_id, t.id, l.id from targets t join app.locations l on l.tenant_id = t.tenant_id
    on conflict do nothing
    returning invitation_id
  )
  select (select count(*) from targets), (select count(*) from inserted) into v_invitations, v_invitation_rows;
  return query select v_members, v_member_rows, v_invitations, v_invitation_rows;
end;
$$;
revoke all on function private.backfill_assigned_location_scopes_v1() from public, anon, authenticated, service_role;

do $backfill$
declare v record;
begin
  select * into v from private.backfill_assigned_location_scopes_v1();
  raise notice 'custom roles scope backfill: % member(s) given % location row(s); % invitation(s) given % location row(s)',
    v.members, v.member_rows, v.invitations, v.invitation_rows;
end;
$backfill$;
