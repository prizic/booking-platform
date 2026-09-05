-- Issue #6: establish tenant identity, verified-domain routing, current-state
-- membership authorization, and the first deliberately narrow api_v1 DTOs.
--
-- The root tenant and immutable capability catalog are platform-owned. Every
-- row owned by a tenant below carries tenant_id NOT NULL, participates in a
-- tenant-scoped key, and is protected by RLS even though app is not exposed by
-- PostgREST.

create table app.tenants (
  id uuid primary key,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 160),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create table app.permissions (
  key text primary key
    check (key = lower(key) and key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  description text not null check (description = btrim(description) and description <> '')
);

insert into app.permissions (key, description)
values
  ('booking.view.own', 'View bookings in the actor assignment scope'),
  ('booking.view.any', 'View bookings across the permitted tenant or location scope'),
  ('booking.create_on_behalf', 'Create a booking for a customer'),
  ('booking.approve', 'Accept or reject a request-to-book'),
  ('booking.reschedule', 'Reschedule a booking'),
  ('booking.cancel', 'Cancel a booking'),
  ('refund.issue', 'Issue a policy-authorized refund'),
  ('booking.check_in', 'Check in a booking'),
  ('booking.check_in_override', 'Override the normal check-in window'),
  ('booking.mark_no_show', 'Mark a booking as no-show'),
  ('booking.complete', 'Complete a booking'),
  ('booking.correct_status', 'Correct a terminal operational status'),
  ('catalog.edit', 'Edit catalog content within the permitted scope'),
  ('schedule.edit', 'Edit schedules within the permitted scope'),
  ('staff.manage', 'Manage tenant staff within the permitted scope'),
  ('policy.edit', 'Edit tenant booking policies'),
  ('customer.pii.view', 'View customer personal data within the permitted scope'),
  ('customer.data.export', 'Request an export of the actor customer record'),
  ('customer.data.export_on_behalf', 'Request a customer export as tenant administrator'),
  ('customer.data.correct', 'Request correction of customer data'),
  ('customer.data.delete', 'Request deletion of the actor customer record'),
  ('customer.data.restrict', 'Request restriction of the actor customer record'),
  ('brand.manage', 'Manage tenant brand configuration'),
  ('integration.manage', 'Manage tenant provider integrations'),
  ('billing.view', 'View tenant SaaS billing'),
  ('billing.change_plan', 'Change the tenant SaaS plan'),
  ('support.grant_access', 'Create an audited support-access grant'),
  ('audit.read', 'Read audit events within the permitted scope'),
  ('instance.request_update', 'Request an instance update'),
  ('tenant.owner_transfer', 'Transfer tenant ownership'),
  ('tenant.read_other_tenant', 'Break-glass cross-tenant read authority');

create table app.brands (
  id uuid not null,
  tenant_id uuid not null references app.tenants (id) on delete restrict,
  key text not null check (key = lower(key) and key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'active'
    check (status in ('active', 'retired')),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (id),
  unique (tenant_id, id),
  unique (tenant_id, key)
);

create table app.brand_revisions (
  id uuid not null,
  tenant_id uuid not null,
  brand_id uuid not null,
  revision bigint not null check (revision > 0),
  state text not null check (state in ('draft', 'published', 'retired')),
  config_version bigint not null check (config_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  published_at timestamptz,
  primary key (id),
  unique (tenant_id, id),
  unique (tenant_id, brand_id, id),
  unique (tenant_id, brand_id, revision),
  foreign key (tenant_id, brand_id)
    references app.brands (tenant_id, id) on delete restrict,
  check (
    (state = 'published' and published_at is not null)
    or (state <> 'published' and published_at is null)
  )
);

create unique index brand_revisions_one_published_idx
  on app.brand_revisions (tenant_id, brand_id)
  where state = 'published';

create table app.instances (
  id uuid not null,
  tenant_id uuid not null references app.tenants (id) on delete restrict,
  brand_id uuid not null,
  published_brand_revision_id uuid,
  deployment_state text not null default 'provisioning'
    check (deployment_state in ('provisioning', 'active', 'suspended', 'closed')),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (id),
  unique (tenant_id, id),
  foreign key (tenant_id, brand_id)
    references app.brands (tenant_id, id) on delete restrict,
  foreign key (tenant_id, brand_id, published_brand_revision_id)
    references app.brand_revisions (tenant_id, brand_id, id) on delete restrict,
  check (deployment_state <> 'active' or published_brand_revision_id is not null)
);

create table app.tenant_domains (
  id uuid not null,
  tenant_id uuid not null references app.tenants (id) on delete restrict,
  instance_id uuid not null,
  hostname text not null,
  application text not null check (application in ('client', 'dashboard')),
  kind text not null default 'production' check (kind in ('production', 'preview')),
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'failed')),
  verified_at timestamptz,
  active boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (id),
  unique (tenant_id, id),
  unique (hostname),
  foreign key (tenant_id, instance_id)
    references app.instances (tenant_id, id) on delete restrict,
  check (
    hostname = lower(btrim(hostname))
    and char_length(hostname) between 4 and 253
    and hostname ~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
  ),
  check (
    (verification_status = 'verified' and verified_at is not null)
    or (verification_status <> 'verified' and verified_at is null)
  ),
  check (not active or verification_status = 'verified')
);

create unique index tenant_domains_one_active_surface_idx
  on app.tenant_domains (tenant_id, instance_id, application)
  where active and kind = 'production';

create table app.tenant_settings (
  tenant_id uuid primary key references app.tenants (id) on delete restrict,
  default_locale text not null default 'en' check (default_locale in ('en', 'ar')),
  config_version bigint not null default 1 check (config_version > 0),
  feature_version bigint not null default 1 check (feature_version > 0),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default statement_timestamp()
);

create table app.locations (
  id uuid not null,
  tenant_id uuid not null references app.tenants (id) on delete restrict,
  key text not null check (key = lower(key) and key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 160),
  time_zone text not null check (time_zone = btrim(time_zone) and time_zone ~ '^[A-Za-z_]+(?:/[A-Za-z0-9_+\-]+)+$'),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (id),
  unique (tenant_id, id),
  unique (tenant_id, key)
);

create table app.roles (
  id uuid not null,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  key text not null
    check (key in ('staff', 'scheduler', 'location_manager', 'tenant_admin')),
  location_scope_mode text not null
    check (location_scope_mode in ('assigned', 'tenant')),
  created_at timestamptz not null default statement_timestamp(),
  primary key (id),
  unique (tenant_id, id),
  unique (tenant_id, key)
);

create table app.role_permissions (
  tenant_id uuid not null,
  role_id uuid not null,
  permission_key text not null references app.permissions (key) on delete restrict,
  grant_kind text not null check (grant_kind in ('direct', 'approval')),
  scope_kind text not null check (scope_kind in ('tenant', 'location', 'own')),
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, role_id, permission_key),
  foreign key (tenant_id, role_id)
    references app.roles (tenant_id, id) on delete cascade
);

create table app.memberships (
  id uuid not null,
  tenant_id uuid not null references app.tenants (id) on delete restrict,
  auth_user_id uuid not null references auth.users (id) on delete restrict,
  role_id uuid not null,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'revoked')),
  revision bigint not null default 1 check (revision > 0),
  joined_at timestamptz not null default statement_timestamp(),
  revoked_at timestamptz,
  primary key (id),
  unique (tenant_id, id),
  unique (tenant_id, auth_user_id),
  foreign key (tenant_id, role_id)
    references app.roles (tenant_id, id) on delete restrict,
  check (
    (status = 'revoked' and revoked_at is not null)
    or (status <> 'revoked' and revoked_at is null)
  )
);

create index memberships_auth_user_active_idx
  on app.memberships (auth_user_id, tenant_id)
  where status = 'active';

create table app.membership_location_scopes (
  tenant_id uuid not null,
  membership_id uuid not null,
  location_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, membership_id, location_id),
  foreign key (tenant_id, membership_id)
    references app.memberships (tenant_id, id) on delete cascade,
  foreign key (tenant_id, location_id)
    references app.locations (tenant_id, id) on delete cascade
);

create index membership_location_scopes_location_idx
  on app.membership_location_scopes (tenant_id, location_id, membership_id);

create table app.invitations (
  id uuid not null,
  tenant_id uuid not null references app.tenants (id) on delete restrict,
  role_id uuid not null,
  invited_by_membership_id uuid not null,
  invitee_email text not null
    check (
      invitee_email = lower(btrim(invitee_email))
      and invitee_email ~ '^[^[:space:]@]+@[^[:space:]@]+$'
      and char_length(invitee_email) <= 320
    ),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (id),
  unique (tenant_id, id),
  foreign key (tenant_id, role_id)
    references app.roles (tenant_id, id) on delete restrict,
  foreign key (tenant_id, invited_by_membership_id)
    references app.memberships (tenant_id, id) on delete restrict,
  check (
    (status = 'accepted' and accepted_at is not null)
    or (status <> 'accepted' and accepted_at is null)
  ),
  check (expires_at > created_at)
);

create unique index invitations_one_pending_email_idx
  on app.invitations (tenant_id, invitee_email)
  where status = 'pending';

create table app.invitation_location_scopes (
  tenant_id uuid not null,
  invitation_id uuid not null,
  location_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, invitation_id, location_id),
  foreign key (tenant_id, invitation_id)
    references app.invitations (tenant_id, id) on delete cascade,
  foreign key (tenant_id, location_id)
    references app.locations (tenant_id, id) on delete cascade
);

create index invitation_location_scopes_location_idx
  on app.invitation_location_scopes (tenant_id, location_id, invitation_id);

-- PostgreSQL does not index the referencing side of foreign keys. These indexes
-- cover deletion checks, joins, and the leading tenant predicates used by RLS.
create index brand_revisions_brand_idx on app.brand_revisions (tenant_id, brand_id);
create index instances_brand_idx on app.instances (tenant_id, brand_id);
create index instances_published_revision_idx
  on app.instances (tenant_id, brand_id, published_brand_revision_id);
create index tenant_domains_instance_idx on app.tenant_domains (tenant_id, instance_id);
create index roles_tenant_idx on app.roles (tenant_id);
create index role_permissions_permission_idx on app.role_permissions (permission_key);
create index memberships_role_idx on app.memberships (tenant_id, role_id);
create index invitations_role_idx on app.invitations (tenant_id, role_id);
create index invitations_inviter_idx
  on app.invitations (tenant_id, invited_by_membership_id);

create function private.current_auth_user_id()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $function$
begin
  return (select auth.uid());
exception
  when invalid_text_representation then
    return null;
end;
$function$;

create function private.is_active_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.current_auth_user_id()) is not null
    and exists (
      select 1
      from app.memberships as membership
      where membership.tenant_id = p_tenant_id
        and membership.auth_user_id = (select private.current_auth_user_id())
        and membership.status = 'active'
    );
$$;

create function private.current_membership_id(p_tenant_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select membership.id
  from app.memberships as membership
  where membership.tenant_id = p_tenant_id
    and membership.auth_user_id = (select private.current_auth_user_id())
    and membership.status = 'active'
  limit 1;
$$;

create function private.has_direct_capability(
  p_tenant_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.current_auth_user_id()) is not null
    and exists (
      select 1
      from app.memberships as membership
      join app.role_permissions as role_permission
        on role_permission.tenant_id = membership.tenant_id
       and role_permission.role_id = membership.role_id
      where membership.tenant_id = p_tenant_id
        and membership.auth_user_id = (select private.current_auth_user_id())
        and membership.status = 'active'
        and role_permission.permission_key = p_permission_key
        and role_permission.grant_kind = 'direct'
        and role_permission.scope_kind = 'tenant'
    );
$$;

create function private.can_access_location(
  p_tenant_id uuid,
  p_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.current_auth_user_id()) is not null
    and exists (
      select 1
      from app.memberships as membership
      join app.roles as role
        on role.tenant_id = membership.tenant_id
       and role.id = membership.role_id
      where membership.tenant_id = p_tenant_id
        and membership.auth_user_id = (select private.current_auth_user_id())
        and membership.status = 'active'
        and (
          role.location_scope_mode = 'tenant'
          or exists (
            select 1
            from app.membership_location_scopes as location_scope
            where location_scope.tenant_id = membership.tenant_id
              and location_scope.membership_id = membership.id
              and location_scope.location_id = p_location_id
          )
        )
    );
$$;

create function private.is_public_tenant_context(
  p_tenant_id uuid,
  p_instance_id uuid default null,
  p_brand_id uuid default null,
  p_brand_revision_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.tenants as tenant
    join app.instances as instance
      on instance.tenant_id = tenant.id
    join app.brands as brand
      on brand.tenant_id = instance.tenant_id
     and brand.id = instance.brand_id
    join app.brand_revisions as brand_revision
      on brand_revision.tenant_id = instance.tenant_id
     and brand_revision.brand_id = instance.brand_id
     and brand_revision.id = instance.published_brand_revision_id
    join app.tenant_domains as tenant_domain
      on tenant_domain.tenant_id = instance.tenant_id
     and tenant_domain.instance_id = instance.id
    where tenant.id = p_tenant_id
      and tenant.status = 'active'
      and instance.deployment_state = 'active'
      and brand.status = 'active'
      and brand_revision.state = 'published'
      and tenant_domain.kind = 'production'
      and tenant_domain.verification_status = 'verified'
      and tenant_domain.verified_at is not null
      and tenant_domain.active
      and (p_instance_id is null or instance.id = p_instance_id)
      and (p_brand_id is null or brand.id = p_brand_id)
      and (p_brand_revision_id is null or brand_revision.id = p_brand_revision_id)
  );
$$;

create function private.is_aal2()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false);
$$;

revoke execute on function private.current_auth_user_id() from public;
revoke execute on function private.is_active_tenant_member(uuid) from public;
revoke execute on function private.current_membership_id(uuid) from public;
revoke execute on function private.has_direct_capability(uuid, text) from public;
revoke execute on function private.can_access_location(uuid, uuid) from public;
revoke execute on function private.is_public_tenant_context(uuid, uuid, uuid, uuid) from public;
revoke execute on function private.is_aal2() from public;

revoke all on schema private from service_role;
grant usage on schema private to anon, authenticated;
grant execute on function private.is_public_tenant_context(uuid, uuid, uuid, uuid)
  to anon, authenticated;
grant execute on function private.current_auth_user_id(),
  private.is_active_tenant_member(uuid),
  private.current_membership_id(uuid),
  private.has_direct_capability(uuid, text),
  private.can_access_location(uuid, uuid),
  private.is_aal2()
  to authenticated;

do $rls$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tenants',
    'permissions',
    'brands',
    'brand_revisions',
    'instances',
    'tenant_domains',
    'tenant_settings',
    'locations',
    'roles',
    'role_permissions',
    'memberships',
    'membership_location_scopes',
    'invitations',
    'invitation_location_scopes'
  ]
  loop
    execute format('alter table app.%I enable row level security', table_name);
  end loop;
end;
$rls$;

create policy tenants_select_public
on app.tenants for select
to anon, authenticated
using ((select private.is_public_tenant_context(id)));

create policy tenants_select_member
on app.tenants for select
to authenticated
using ((select private.is_active_tenant_member(id)));

create policy permissions_select_authenticated
on app.permissions for select
to authenticated
using (true);

create policy brands_select_public
on app.brands for select
to anon, authenticated
using ((select private.is_public_tenant_context(tenant_id, null, id)));

create policy brands_select_member
on app.brands for select
to authenticated
using ((select private.is_active_tenant_member(tenant_id)));

create policy brand_revisions_select_public
on app.brand_revisions for select
to anon, authenticated
using (
  (select private.is_public_tenant_context(tenant_id, null, brand_id, id))
);

create policy brand_revisions_select_member
on app.brand_revisions for select
to authenticated
using ((select private.is_active_tenant_member(tenant_id)));

create policy instances_select_public
on app.instances for select
to anon, authenticated
using (
  (select private.is_public_tenant_context(
    tenant_id,
    id,
    brand_id,
    published_brand_revision_id
  ))
);

create policy instances_select_member
on app.instances for select
to authenticated
using ((select private.is_active_tenant_member(tenant_id)));

create policy tenant_domains_select_public
on app.tenant_domains for select
to anon, authenticated
using (
  kind = 'production'
  and verification_status = 'verified'
  and verified_at is not null
  and active
  and (select private.is_public_tenant_context(tenant_id, instance_id))
);

create policy tenant_domains_select_member
on app.tenant_domains for select
to authenticated
using ((select private.is_active_tenant_member(tenant_id)));

create policy tenant_settings_select_public
on app.tenant_settings for select
to anon, authenticated
using ((select private.is_public_tenant_context(tenant_id)));

create policy tenant_settings_select_member
on app.tenant_settings for select
to authenticated
using ((select private.is_active_tenant_member(tenant_id)));

create policy tenant_settings_update_admin
on app.tenant_settings for update
to authenticated
using ((select private.has_direct_capability(tenant_id, 'policy.edit')))
with check ((select private.has_direct_capability(tenant_id, 'policy.edit')));

create policy locations_select_scoped_member
on app.locations for select
to authenticated
using ((select private.can_access_location(tenant_id, id)));

create policy roles_select_member
on app.roles for select
to authenticated
using ((select private.is_active_tenant_member(tenant_id)));

create policy role_permissions_select_member
on app.role_permissions for select
to authenticated
using ((select private.is_active_tenant_member(tenant_id)));

create policy memberships_select_self_or_admin
on app.memberships for select
to authenticated
using (
  auth_user_id = (select private.current_auth_user_id())
  or (select private.has_direct_capability(tenant_id, 'staff.manage'))
);

create policy membership_location_scopes_select_self_or_admin
on app.membership_location_scopes for select
to authenticated
using (
  membership_id = (select private.current_membership_id(tenant_id))
  or (select private.has_direct_capability(tenant_id, 'staff.manage'))
);

create policy invitations_select_admin
on app.invitations for select
to authenticated
using ((select private.has_direct_capability(tenant_id, 'staff.manage')));

create policy invitations_insert_admin
on app.invitations for insert
to authenticated
with check (
  (select private.has_direct_capability(tenant_id, 'staff.manage'))
  and invited_by_membership_id = (select private.current_membership_id(tenant_id))
);

create policy invitations_update_admin
on app.invitations for update
to authenticated
using ((select private.has_direct_capability(tenant_id, 'staff.manage')))
with check (
  (select private.has_direct_capability(tenant_id, 'staff.manage'))
  and invited_by_membership_id = (select private.current_membership_id(tenant_id))
);

create policy invitations_delete_admin
on app.invitations for delete
to authenticated
using ((select private.has_direct_capability(tenant_id, 'staff.manage')));

create policy invitation_location_scopes_select_admin
on app.invitation_location_scopes for select
to authenticated
using ((select private.has_direct_capability(tenant_id, 'staff.manage')));

create policy invitation_location_scopes_insert_admin
on app.invitation_location_scopes for insert
to authenticated
with check ((select private.has_direct_capability(tenant_id, 'staff.manage')));

create policy invitation_location_scopes_update_admin
on app.invitation_location_scopes for update
to authenticated
using ((select private.has_direct_capability(tenant_id, 'staff.manage')))
with check ((select private.has_direct_capability(tenant_id, 'staff.manage')));

create policy invitation_location_scopes_delete_admin
on app.invitation_location_scopes for delete
to authenticated
using ((select private.has_direct_capability(tenant_id, 'staff.manage')));

-- A policy exists for every operation on every app table. Operations without a
-- specific allow policy remain denied. The explicit false policies make that
-- contract introspectable without granting an accidental permissive path.
do $deny_policies$
declare
  table_name text;
  operation text;
begin
  foreach table_name in array array[
    'tenants',
    'permissions',
    'brands',
    'brand_revisions',
    'instances',
    'tenant_domains',
    'tenant_settings',
    'locations',
    'roles',
    'role_permissions',
    'memberships',
    'membership_location_scopes',
    'invitations',
    'invitation_location_scopes'
  ]
  loop
    foreach operation in array array['insert', 'update', 'delete']
    loop
      if not (
        (table_name = 'tenant_settings' and operation = 'update')
        or (table_name = 'invitations')
        or (table_name = 'invitation_location_scopes')
      ) then
        if operation = 'insert' then
          execute format(
            'create policy %I on app.%I for insert to authenticated with check (false)',
            table_name || '_insert_denied',
            table_name
          );
        elsif operation = 'update' then
          execute format(
            'create policy %I on app.%I for update to authenticated using (false) with check (false)',
            table_name || '_update_denied',
            table_name
          );
        else
          execute format(
            'create policy %I on app.%I for delete to authenticated using (false)',
            table_name || '_delete_denied',
            table_name
          );
        end if;
      end if;
    end loop;
  end loop;
end;
$deny_policies$;

revoke all on all tables in schema app from public, anon, authenticated;
revoke all on schema app from service_role;
grant usage on schema app to anon, authenticated;
grant select on app.tenants,
  app.brands,
  app.brand_revisions,
  app.instances,
  app.tenant_domains,
  app.tenant_settings
  to anon;
grant select on all tables in schema app to authenticated;
grant update on app.tenant_settings to authenticated;
grant insert, update, delete on app.invitations, app.invitation_location_scopes
  to authenticated;
revoke all on all tables in schema app from service_role;

create function api_v1.resolve_public_tenant_v1(
  p_hostname text,
  p_application text
)
returns table (
  tenant_id uuid,
  brand_id uuid,
  instance_id uuid,
  deployment_state text,
  hostname text,
  published_brand_revision bigint,
  config_version bigint,
  feature_version bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    tenant.id,
    brand.id,
    instance.id,
    instance.deployment_state,
    tenant_domain.hostname,
    brand_revision.revision,
    tenant_setting.config_version,
    tenant_setting.feature_version
  from app.tenant_domains as tenant_domain
  join app.instances as instance
    on instance.tenant_id = tenant_domain.tenant_id
   and instance.id = tenant_domain.instance_id
  join app.tenants as tenant
    on tenant.id = instance.tenant_id
  join app.brands as brand
    on brand.tenant_id = instance.tenant_id
   and brand.id = instance.brand_id
  join app.brand_revisions as brand_revision
    on brand_revision.tenant_id = instance.tenant_id
   and brand_revision.brand_id = instance.brand_id
   and brand_revision.id = instance.published_brand_revision_id
  join app.tenant_settings as tenant_setting
    on tenant_setting.tenant_id = instance.tenant_id
  where p_hostname is not null
    and p_application in ('client', 'dashboard')
    and p_hostname = lower(btrim(p_hostname))
    and char_length(p_hostname) between 4 and 253
    and p_hostname ~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
    and tenant_domain.hostname = p_hostname
    and tenant_domain.application = p_application
    and tenant_domain.kind = 'production'
    and tenant_domain.verification_status = 'verified'
    and tenant_domain.verified_at is not null
    and tenant_domain.active
    and tenant.status = 'active'
    and instance.deployment_state = 'active'
    and brand.status = 'active'
    and brand_revision.state = 'published'
  limit 1;
$$;

create function api_v1.list_tenant_choices_v1()
returns table (
  tenant_id uuid,
  membership_id uuid,
  tenant_name text,
  role_key text,
  dashboard_hostname text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    tenant.id,
    membership.id,
    tenant.name,
    role.key,
    dashboard_domain.hostname
  from app.memberships as membership
  join app.tenants as tenant
    on tenant.id = membership.tenant_id
  join app.roles as role
    on role.tenant_id = membership.tenant_id
   and role.id = membership.role_id
  join lateral (
    select tenant_domain.hostname
    from app.tenant_domains as tenant_domain
    join app.instances as instance
      on instance.tenant_id = tenant_domain.tenant_id
     and instance.id = tenant_domain.instance_id
    where tenant_domain.tenant_id = membership.tenant_id
      and tenant_domain.application = 'dashboard'
      and tenant_domain.kind = 'production'
      and tenant_domain.verification_status = 'verified'
      and tenant_domain.verified_at is not null
      and tenant_domain.active
      and instance.deployment_state = 'active'
    order by tenant_domain.hostname
    limit 1
  ) as dashboard_domain on true
  where membership.auth_user_id = (select private.current_auth_user_id())
    and membership.status = 'active'
    and tenant.status = 'active'
  order by tenant.name, tenant.id;
$$;

create function api_v1.get_dashboard_context_v1(p_tenant_id uuid)
returns table (
  tenant_id uuid,
  membership_id uuid,
  tenant_name text,
  role_key text,
  location_scope_mode text,
  location_ids uuid[],
  capabilities jsonb,
  brand_id uuid,
  instance_id uuid,
  dashboard_hostname text,
  default_locale text,
  published_brand_revision bigint,
  config_version bigint,
  feature_version bigint,
  aal2 boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    tenant.id,
    membership.id,
    tenant.name,
    role.key,
    role.location_scope_mode,
    coalesce(
      array(
        select location_scope.location_id
        from app.membership_location_scopes as location_scope
        where location_scope.tenant_id = membership.tenant_id
          and location_scope.membership_id = membership.id
        order by location_scope.location_id
      ),
      array[]::uuid[]
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'capability', role_permission.permission_key,
            'grantKind', role_permission.grant_kind,
            'scopeKind', role_permission.scope_kind
          )
          order by role_permission.permission_key
        )
        from app.role_permissions as role_permission
        where role_permission.tenant_id = membership.tenant_id
          and role_permission.role_id = membership.role_id
      ),
      '[]'::jsonb
    ),
    instance.brand_id,
    instance.id,
    dashboard_domain.hostname,
    tenant_setting.default_locale,
    brand_revision.revision,
    tenant_setting.config_version,
    tenant_setting.feature_version,
    (select private.is_aal2())
  from app.memberships as membership
  join app.tenants as tenant
    on tenant.id = membership.tenant_id
  join app.roles as role
    on role.tenant_id = membership.tenant_id
   and role.id = membership.role_id
  join app.tenant_settings as tenant_setting
    on tenant_setting.tenant_id = membership.tenant_id
  join lateral (
    select instance.id, instance.brand_id, instance.published_brand_revision_id,
      tenant_domain.hostname
    from app.tenant_domains as tenant_domain
    join app.instances as instance
      on instance.tenant_id = tenant_domain.tenant_id
     and instance.id = tenant_domain.instance_id
    where tenant_domain.tenant_id = membership.tenant_id
      and tenant_domain.application = 'dashboard'
      and tenant_domain.kind = 'production'
      and tenant_domain.verification_status = 'verified'
      and tenant_domain.verified_at is not null
      and tenant_domain.active
      and instance.deployment_state = 'active'
    order by tenant_domain.hostname
    limit 1
  ) as dashboard_domain on true
  join app.instances as instance
    on instance.tenant_id = membership.tenant_id
   and instance.id = dashboard_domain.id
  join app.brand_revisions as brand_revision
    on brand_revision.tenant_id = instance.tenant_id
   and brand_revision.brand_id = instance.brand_id
   and brand_revision.id = instance.published_brand_revision_id
  where p_tenant_id is not null
    and membership.tenant_id = p_tenant_id
    and membership.auth_user_id = (select private.current_auth_user_id())
    and membership.status = 'active'
    and tenant.status = 'active'
    and brand_revision.state = 'published'
  limit 1;
$$;

revoke all on function api_v1.resolve_public_tenant_v1(text, text) from public;
revoke all on function api_v1.list_tenant_choices_v1() from public;
revoke all on function api_v1.get_dashboard_context_v1(uuid) from public;
grant execute on function api_v1.resolve_public_tenant_v1(text, text)
  to anon, authenticated;
grant execute on function api_v1.list_tenant_choices_v1(),
  api_v1.get_dashboard_context_v1(uuid)
  to authenticated;

comment on function api_v1.resolve_public_tenant_v1(text, text) is
  'Resolve one canonical verified production hostname to a public tenant context.';
comment on function api_v1.list_tenant_choices_v1() is
  'List only the caller current active tenant memberships for explicit selection.';
comment on function api_v1.get_dashboard_context_v1(uuid) is
  'Return a minimal current-state Dashboard authorization and cache context.';
