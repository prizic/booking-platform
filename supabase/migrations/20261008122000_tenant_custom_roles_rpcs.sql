-- Tenant custom roles, part 3: the role and staff-access RPCs (ADR-0019).
--
-- Every mutation locks the tenant row first, so role edits, archive, invites,
-- membership edits and the last-administrator check all serialize per tenant.
-- Every mutation is idempotent on its request id, revision-checked, recorded in
-- an append-only ledger and announced to open Dashboard sessions.

-- ---------------------------------------------------------------------------
-- Shared read model.
-- ---------------------------------------------------------------------------
create function private.role_list_json(p_tenant_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'key', r.key,
      'is_builtin', r.is_builtin,
      'name_en', r.name_en,
      'name_ar', r.name_ar,
      'description_en', r.description_en,
      'description_ar', r.description_ar,
      'location_scope_mode', r.location_scope_mode,
      'revision', r.revision,
      'archived', r.archived_at is not null,
      'archived_at', r.archived_at,
      'updated_at', r.updated_at,
      'duplicated_from_role_id', r.duplicated_from_role_id,
      'administrator', private.role_is_administrator(r.tenant_id, r.id),
      'grants', private.role_grants_json(r.tenant_id, r.id),
      'active_members', (select count(*) from app.memberships m
        where m.tenant_id = r.tenant_id and m.role_id = r.id and m.status in ('active', 'suspended')),
      'pending_invitations', (select count(*) from app.invitations i
        where i.tenant_id = r.tenant_id and i.role_id = r.id and i.status = 'pending'),
      'assignable', r.archived_at is null and private.actor_dominates_role(r.tenant_id, r.id, null))
    order by r.is_builtin desc,
      case r.key when 'tenant_admin' then 1 when 'location_manager' then 2 when 'scheduler' then 3 when 'staff' then 4 else 5 end,
      r.archived_at is not null, lower(r.name_en), r.id), '[]'::jsonb)
  from app.roles r
  where r.tenant_id = p_tenant_id;
$$;
revoke all on function private.role_list_json(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Reads: the permission catalog and the role list. Role administrators and
-- staff managers may read them (the latter to assign roles).
-- ---------------------------------------------------------------------------
create function private.get_role_catalog_v1(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not (coalesce(private.is_role_administrator(p_tenant_id), false)
      or coalesce(private.has_direct_capability(p_tenant_id, 'staff.manage'), false)) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  return jsonb_build_object('version', 1, 'tenant_id', p_tenant_id,
    'permissions', coalesce((select jsonb_agg(jsonb_build_object(
        'key', m.permission_key,
        'group', m.group_key,
        'allowed_scopes', to_jsonb(m.allowed_scopes),
        'allowed_grant_kinds', to_jsonb(m.allowed_grant_kinds),
        'reserved', m.reserved,
        'sort_order', m.sort_order) order by m.sort_order)
      from app.permission_meta m), '[]'::jsonb));
end;
$$;

create function private.list_roles_v1(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not (coalesce(private.is_role_administrator(p_tenant_id), false)
      or coalesce(private.has_direct_capability(p_tenant_id, 'staff.manage'), false)) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  return jsonb_build_object('version', 1, 'tenant_id', p_tenant_id,
    'can_manage_roles', coalesce(private.is_role_administrator(p_tenant_id), false),
    'roles', private.role_list_json(p_tenant_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- save_role_v1: create, duplicate (p_source_role_id) or update a custom role.
-- ---------------------------------------------------------------------------
create function private.save_role_v1(
  p_tenant_id uuid, p_request_id uuid, p_role_id uuid, p_expected_revision bigint,
  p_source_role_id uuid, p_name_en text, p_name_ar text, p_description_en text,
  p_description_ar text, p_location_scope_mode text, p_grants jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.current_auth_user_id();
  v_name_en text := nullif(btrim(p_name_en), '');
  v_name_ar text := nullif(btrim(p_name_ar), '');
  v_description_en text := nullif(btrim(p_description_en), '');
  v_description_ar text := nullif(btrim(p_description_ar), '');
  v_hash text;
  v_prior app.role_change_events%rowtype;
  v_role app.roles%rowtype;
  v_action text;
  v_id uuid;
  v_key text;
  v_revision bigint;
  v_result jsonb;
begin
  perform 1 from app.tenants t where t.id = p_tenant_id and t.status = 'active' for update;
  if not found or v_actor is null or not private.is_role_administrator(p_tenant_id) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if not private.dashboard_recent_aal2() then
    raise exception using errcode = '42501', message = 'step_up_required';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'invalid_request';
  end if;

  v_hash := encode(extensions.digest(convert_to(jsonb_build_array(
    p_tenant_id, p_request_id, p_role_id, p_expected_revision, p_source_role_id,
    v_name_en, v_name_ar, v_description_en, v_description_ar, p_location_scope_mode, p_grants)::text,
    'UTF8'), 'sha256'), 'hex');
  select * into v_prior from app.role_change_events e
  where e.tenant_id = p_tenant_id and e.request_id = p_request_id;
  if found then
    if v_prior.actor_id <> v_actor or v_prior.request_hash <> v_hash then
      raise exception using errcode = '22023', message = 'idempotency_conflict';
    end if;
    return v_prior.result || jsonb_build_object('replayed', true);
  end if;

  -- Shape.
  if p_location_scope_mode is null or p_location_scope_mode not in ('tenant', 'assigned')
     or v_name_en is null or v_name_ar is null
     or char_length(v_name_en) > 80 or char_length(v_name_ar) > 80
     or char_length(coalesce(v_description_en, '')) > 500
     or char_length(coalesce(v_description_ar, '')) > 500
     or (p_role_id is not null and p_source_role_id is not null)
     or p_grants is null or jsonb_typeof(p_grants) <> 'array'
     or jsonb_array_length(p_grants) not between 1 and 32 then
    raise exception using errcode = '22023', message = 'invalid_request';
  end if;
  if exists (
      select 1 from jsonb_array_elements(p_grants) e
      where jsonb_typeof(e) <> 'object'
        or jsonb_typeof(e -> 'permission_key') is distinct from 'string'
        or jsonb_typeof(e -> 'grant_kind') is distinct from 'string'
        or jsonb_typeof(e -> 'scope_kind') is distinct from 'string'
        or (select count(*) from jsonb_object_keys(e)) <> 3
        or not exists (select 1 from app.permission_meta m where m.permission_key = e ->> 'permission_key'))
     or (select count(distinct e ->> 'permission_key') from jsonb_array_elements(p_grants) e)
        <> jsonb_array_length(p_grants) then
    raise exception using errcode = '22023', message = 'invalid_request';
  end if;
  -- Catalog rules.
  if exists (select 1 from jsonb_array_elements(p_grants) e
      join app.permission_meta m on m.permission_key = e ->> 'permission_key' where m.reserved) then
    raise exception using errcode = '22023', message = 'permission_reserved';
  end if;
  if exists (select 1 from jsonb_array_elements(p_grants) e
      join app.permission_meta m on m.permission_key = e ->> 'permission_key'
      where not ((e ->> 'scope_kind') = any (m.allowed_scopes))
         or not ((e ->> 'grant_kind') = any (m.allowed_grant_kinds))) then
    raise exception using errcode = '22023', message = 'grant_not_allowed';
  end if;
  if exists (select 1 from jsonb_array_elements(p_grants) e
      where (p_location_scope_mode = 'tenant' and e ->> 'scope_kind' = 'location')
         or (p_location_scope_mode = 'assigned' and e ->> 'scope_kind' = 'tenant')) then
    raise exception using errcode = '22023', message = 'scope_mode_mismatch';
  end if;
  -- No escalation: the administrator can only hand out what they hold.
  if not private.actor_dominates_grants(p_tenant_id, p_grants, null) then
    raise exception using errcode = '42501', message = 'escalation_denied';
  end if;

  if p_role_id is null then
    if p_source_role_id is not null then
      select * into v_role from app.roles r where r.tenant_id = p_tenant_id and r.id = p_source_role_id;
      if not found then
        raise exception using errcode = '42501', message = 'not_authorized';
      end if;
      if v_role.archived_at is not null then
        raise exception using errcode = '22023', message = 'role_archived';
      end if;
      v_action := 'duplicate';
    else
      v_action := 'create';
    end if;
    v_id := pg_catalog.gen_random_uuid();
    v_key := 'custom_' || substr(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16);
    v_revision := 1;
    begin
      insert into app.roles (id, tenant_id, key, location_scope_mode, name_en, name_ar,
        description_en, description_ar, created_by_membership_id, duplicated_from_role_id)
      values (v_id, p_tenant_id, v_key, p_location_scope_mode, v_name_en, v_name_ar,
        v_description_en, v_description_ar, private.current_membership_id(p_tenant_id), p_source_role_id);
    exception when unique_violation then
      raise exception using errcode = '22023', message = 'role_name_taken';
    end;
  else
    select * into v_role from app.roles r where r.tenant_id = p_tenant_id and r.id = p_role_id for update;
    if not found then
      raise exception using errcode = '42501', message = 'not_authorized';
    end if;
    if v_role.is_builtin then
      raise exception using errcode = '22023', message = 'role_locked';
    end if;
    if v_role.archived_at is not null then
      raise exception using errcode = '22023', message = 'role_archived';
    end if;
    if p_expected_revision is null or v_role.revision <> p_expected_revision then
      raise exception using errcode = '40001', message = 'revision_conflict';
    end if;
    -- Assigned mode fails closed, so it may not strand a holder with no locations.
    if p_location_scope_mode = 'assigned' and v_role.location_scope_mode <> 'assigned' and (
        exists (select 1 from app.memberships m
          where m.tenant_id = p_tenant_id and m.role_id = v_role.id and m.status in ('active', 'suspended')
            and not exists (select 1 from app.membership_location_scopes s
              where s.tenant_id = m.tenant_id and s.membership_id = m.id))
        or exists (select 1 from app.invitations i
          where i.tenant_id = p_tenant_id and i.role_id = v_role.id and i.status in ('pending', 'expired')
            and not exists (select 1 from app.invitation_location_scopes s
              where s.tenant_id = i.tenant_id and s.invitation_id = i.id))) then
      raise exception using errcode = '22023', message = 'role_scope_in_use';
    end if;
    v_action := 'update';
    v_id := v_role.id;
    v_key := v_role.key;
    v_revision := v_role.revision + 1;
    delete from app.role_permissions rp where rp.tenant_id = p_tenant_id and rp.role_id = v_id;
    begin
      update app.roles r
      set name_en = v_name_en, name_ar = v_name_ar,
        description_en = v_description_en, description_ar = v_description_ar,
        location_scope_mode = p_location_scope_mode,
        revision = v_revision, updated_at = statement_timestamp()
      where r.tenant_id = p_tenant_id and r.id = v_id;
    exception when unique_violation then
      raise exception using errcode = '22023', message = 'role_name_taken';
    end;
  end if;

  insert into app.role_permissions (tenant_id, role_id, permission_key, grant_kind, scope_kind)
  select p_tenant_id, v_id, e ->> 'permission_key', e ->> 'grant_kind', e ->> 'scope_kind'
  from jsonb_array_elements(p_grants) e;

  v_result := jsonb_build_object('version', 1, 'role_id', v_id, 'key', v_key,
    'revision', v_revision, 'action', v_action, 'replayed', false);
  insert into app.role_change_events (tenant_id, actor_id, request_id, request_hash, action,
    role_id, role_revision, result)
  values (p_tenant_id, v_actor, p_request_id, v_hash, v_action, v_id, v_revision, v_result);
  perform private.broadcast_authorization_change_v1(p_tenant_id,
    jsonb_build_object('reason', 'role_saved', 'role_id', v_id, 'revision', v_revision));
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- archive_role_v1: retire a custom role nobody holds or is invited to.
-- ---------------------------------------------------------------------------
create function private.archive_role_v1(
  p_tenant_id uuid, p_request_id uuid, p_role_id uuid, p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.current_auth_user_id();
  v_hash text;
  v_prior app.role_change_events%rowtype;
  v_role app.roles%rowtype;
  v_members bigint;
  v_invitations bigint;
  v_result jsonb;
begin
  perform 1 from app.tenants t where t.id = p_tenant_id and t.status = 'active' for update;
  if not found or v_actor is null or not private.is_role_administrator(p_tenant_id) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if not private.dashboard_recent_aal2() then
    raise exception using errcode = '42501', message = 'step_up_required';
  end if;
  if p_request_id is null or p_role_id is null then
    raise exception using errcode = '22023', message = 'invalid_request';
  end if;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_array(
    p_tenant_id, p_request_id, 'archive', p_role_id, p_expected_revision)::text, 'UTF8'), 'sha256'), 'hex');
  select * into v_prior from app.role_change_events e
  where e.tenant_id = p_tenant_id and e.request_id = p_request_id;
  if found then
    if v_prior.actor_id <> v_actor or v_prior.request_hash <> v_hash then
      raise exception using errcode = '22023', message = 'idempotency_conflict';
    end if;
    return v_prior.result || jsonb_build_object('replayed', true);
  end if;

  select * into v_role from app.roles r where r.tenant_id = p_tenant_id and r.id = p_role_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if v_role.is_builtin then
    raise exception using errcode = '22023', message = 'role_locked';
  end if;
  if v_role.archived_at is not null then
    raise exception using errcode = '22023', message = 'role_archived';
  end if;
  if p_expected_revision is null or v_role.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'revision_conflict';
  end if;
  if not private.actor_dominates_role(p_tenant_id, v_role.id, null) then
    raise exception using errcode = '42501', message = 'escalation_denied';
  end if;
  select count(*) into v_members from app.memberships m
  where m.tenant_id = p_tenant_id and m.role_id = v_role.id and m.status in ('active', 'suspended');
  select count(*) into v_invitations from app.invitations i
  where i.tenant_id = p_tenant_id and i.role_id = v_role.id and i.status = 'pending';
  if v_members > 0 or v_invitations > 0 then
    raise exception using errcode = '22023', message = 'role_in_use',
      detail = jsonb_build_object('members', v_members, 'invitations', v_invitations)::text;
  end if;

  update app.roles r set archived_at = statement_timestamp(), revision = r.revision + 1,
    updated_at = statement_timestamp()
  where r.tenant_id = p_tenant_id and r.id = v_role.id;
  v_result := jsonb_build_object('version', 1, 'role_id', v_role.id, 'key', v_role.key,
    'revision', v_role.revision + 1, 'action', 'archive', 'replayed', false);
  insert into app.role_change_events (tenant_id, actor_id, request_id, request_hash, action,
    role_id, role_revision, result)
  values (p_tenant_id, v_actor, p_request_id, v_hash, 'archive', v_role.id, v_role.revision + 1, v_result);
  perform private.broadcast_authorization_change_v1(p_tenant_id,
    jsonb_build_object('reason', 'role_archived', 'role_id', v_role.id, 'revision', v_role.revision + 1));
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff access workspace. v2 carries every role with its names, mode, archive
-- state and whether the caller may assign it. v1 stays for an N-1 Dashboard
-- that only understands the four built-ins.
-- ---------------------------------------------------------------------------
create or replace function private.get_staff_access_workspace_v1(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not coalesce(private.has_direct_capability(p_tenant_id,'staff.manage'),false) then
    raise exception using errcode='42501',message='not_authorized';
  end if;
  return jsonb_build_object('version',1,'tenant_id',p_tenant_id,
    'roles',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'key',r.key) order by r.key) from app.roles r where r.tenant_id=p_tenant_id and r.is_builtin),'[]'::jsonb),
    'locations',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name) order by l.name) from app.locations l where l.tenant_id=p_tenant_id and l.status='active'),'[]'::jsonb),
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',coalesce(s.public_name,u.email),'email',u.email,
      'role_id',m.role_id,'status',m.status,'revision',m.revision,'location_ids',coalesce((select jsonb_agg(x.location_id order by x.location_id) from app.membership_location_scopes x where x.tenant_id=m.tenant_id and x.membership_id=m.id),'[]'::jsonb)) order by m.joined_at,m.id)
      from app.memberships m join auth.users u on u.id=m.auth_user_id left join app.staff_profiles s on s.tenant_id=m.tenant_id and s.membership_id=m.id where m.tenant_id=p_tenant_id),'[]'::jsonb),
    'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.invitee_email,'role_id',i.role_id,
      'status',case when i.status='pending' and i.expires_at<=statement_timestamp() then 'expired' else i.status end,'expires_at',i.expires_at,'revision',i.revision,
      'location_ids',coalesce((select jsonb_agg(x.location_id order by x.location_id) from app.invitation_location_scopes x where x.tenant_id=i.tenant_id and x.invitation_id=i.id),'[]'::jsonb),
      'delivery_status',coalesce((select j.status from private.staff_invitation_deliveries j where j.tenant_id=i.tenant_id and j.invitation_id=i.id order by j.invitation_revision desc limit 1),'unconfigured')) order by i.created_at desc,i.id)
      from app.invitations i where i.tenant_id=p_tenant_id),'[]'::jsonb));
end;
$$;

create function private.get_staff_access_workspace_v2(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_v1 jsonb;
begin
  v_v1 := private.get_staff_access_workspace_v1(p_tenant_id);
  return v_v1 || jsonb_build_object('version',2,
    'can_manage_roles',coalesce(private.is_role_administrator(p_tenant_id),false),
    'roles',private.role_list_json(p_tenant_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- change_staff_access_v1, replaced. Same signature and result. New rules:
--   * an archived role cannot be assigned, invited to or re-sent;
--   * an assigned-mode role needs at least one location;
--   * a target or current role that is an administrator role needs
--     tenant.owner_transfer and a recent second factor;
--   * the caller must dominate the role being given and the role being changed
--     or taken away, at the locations involved.
-- ---------------------------------------------------------------------------
create or replace function private.change_staff_access_v1(p_tenant_id uuid,p_request_id uuid,p_action text,p_target_id uuid,p_expected_revision bigint,p_role_id uuid,p_location_ids uuid[],p_email text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_hash text; v_prior app.staff_access_events%rowtype; v_member app.memberships%rowtype;
  v_invite app.invitations%rowtype; v_id uuid; v_revision bigint; v_result jsonb;
  v_role app.roles%rowtype; v_old_role app.roles%rowtype; v_old_locations uuid[];
  v_locations uuid[] := coalesce((select array_agg(distinct l) from unnest(p_location_ids) l where l is not null),'{}'::uuid[]);
begin
  perform 1 from app.tenants t where t.id=p_tenant_id and t.status='active' for update;
  if not found or not coalesce(private.has_direct_capability(p_tenant_id,'staff.manage'),false) then
    raise exception using errcode='42501',message='not_authorized';
  end if;
  if p_request_id is null or p_action not in ('invite','resend','revoke_invitation','edit_membership','revoke_membership') or p_action is null then
    raise exception using errcode='22023',message='invalid_request';
  end if;
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_array(p_tenant_id,p_request_id,p_action,p_target_id,p_expected_revision,p_role_id,p_location_ids,lower(btrim(p_email)))::text,'UTF8'),'sha256'),'hex');
  select * into v_prior from app.staff_access_events e where e.tenant_id=p_tenant_id and e.request_id=p_request_id;
  if found then
    if v_prior.actor_id<>private.current_auth_user_id() or v_prior.request_hash<>v_hash then raise exception using errcode='22023',message='idempotency_conflict'; end if;
    return v_prior.result || jsonb_build_object('replayed',true);
  end if;
  if p_action in ('edit_membership','revoke_membership') then
    select * into v_member from app.memberships m where m.tenant_id=p_tenant_id and m.id=p_target_id for update;
    if not found then raise exception using errcode='42501',message='not_authorized'; end if;
    if p_expected_revision is null or v_member.revision<>p_expected_revision then raise exception using errcode='40001',message='revision_conflict'; end if;
    select * into v_old_role from app.roles r where r.tenant_id=p_tenant_id and r.id=v_member.role_id;
    v_old_locations:=coalesce((select array_agg(x.location_id) from app.membership_location_scopes x where x.tenant_id=p_tenant_id and x.membership_id=v_member.id),'{}'::uuid[]);
  elsif p_action in ('resend','revoke_invitation') then
    select * into v_invite from app.invitations i where i.tenant_id=p_tenant_id and i.id=p_target_id for update;
    if not found then raise exception using errcode='42501',message='not_authorized'; end if;
    if p_expected_revision is null or v_invite.revision<>p_expected_revision then raise exception using errcode='40001',message='revision_conflict'; end if;
    if v_invite.status not in ('pending','expired') then raise exception using errcode='22023',message='invitation_not_pending'; end if;
    select * into v_old_role from app.roles r where r.tenant_id=p_tenant_id and r.id=v_invite.role_id;
    v_old_locations:=coalesce((select array_agg(x.location_id) from app.invitation_location_scopes x where x.tenant_id=p_tenant_id and x.invitation_id=v_invite.id),'{}'::uuid[]);
    if p_action='resend' then
      if v_old_role.archived_at is not null then raise exception using errcode='22023',message='role_archived'; end if;
      if v_old_role.location_scope_mode='assigned' and cardinality(v_old_locations)=0 then raise exception using errcode='22023',message='invalid_request'; end if;
    end if;
  end if;
  if p_action in ('invite','edit_membership') then
    select * into v_role from app.roles r where r.tenant_id=p_tenant_id and r.id=p_role_id;
    if not found or coalesce(cardinality(p_location_ids),0)>100 or exists(select 1 from unnest(p_location_ids) l where l is null or not exists(select 1 from app.locations x where x.tenant_id=p_tenant_id and x.id=l and x.status='active'))
      or (v_role.location_scope_mode='assigned' and cardinality(v_locations)=0) then raise exception using errcode='22023',message='invalid_request'; end if;
    if v_role.archived_at is not null then raise exception using errcode='22023',message='role_archived'; end if;
  end if;
  if (v_role.id is not null and private.role_is_administrator(p_tenant_id,v_role.id))
     or (v_old_role.id is not null and private.role_is_administrator(p_tenant_id,v_old_role.id)) then
    if not exists(select 1 from app.memberships m join app.role_permissions rp on rp.tenant_id=m.tenant_id and rp.role_id=m.role_id where m.tenant_id=p_tenant_id and m.auth_user_id=private.current_auth_user_id() and m.status='active' and rp.permission_key='tenant.owner_transfer' and rp.scope_kind='tenant' and rp.grant_kind in ('direct','approval')) or not private.dashboard_recent_aal2() then
      raise exception using errcode='42501',message='step_up_required';
    end if;
  end if;
  -- No escalation, in either direction: the caller may only hand out a role it
  -- dominates and may only change or remove someone whose role it dominates.
  if (v_role.id is not null and not private.actor_dominates_role(p_tenant_id,v_role.id,v_locations))
     or (v_old_role.id is not null and not private.actor_dominates_role(p_tenant_id,v_old_role.id,v_old_locations)) then
    raise exception using errcode='42501',message='escalation_denied';
  end if;
  if p_action='invite' then
    if p_email is null or length(p_email)>254 or lower(btrim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception using errcode='22023',message='invalid_request'; end if;
    update app.invitations i set status='expired',revision=i.revision+1,updated_at=statement_timestamp() where i.tenant_id=p_tenant_id and i.invitee_email=lower(btrim(p_email)) and i.status='pending' and i.expires_at<=statement_timestamp();
    if exists(select 1 from app.memberships m join auth.users u on u.id=m.auth_user_id where m.tenant_id=p_tenant_id and m.status='active' and lower(u.email)=lower(btrim(p_email))) then raise exception using errcode='22023',message='member_already_active'; end if;
    v_id:=pg_catalog.gen_random_uuid(); v_revision:=1;
    insert into app.invitations(id,tenant_id,role_id,invited_by_membership_id,invitee_email,token_hash,expires_at)
      values(v_id,p_tenant_id,p_role_id,private.current_membership_id(p_tenant_id),lower(btrim(p_email)),encode(extensions.digest(pg_catalog.gen_random_uuid()::text,'sha256'),'hex'),statement_timestamp()+interval '7 days');
    insert into app.invitation_location_scopes(tenant_id,invitation_id,location_id) select p_tenant_id,v_id,l from unnest(v_locations) l;
  elsif p_action in ('edit_membership','revoke_membership') then
    v_id:=v_member.id; v_revision:=v_member.revision+1;
    update app.memberships m set role_id=case when p_action='edit_membership' then p_role_id else m.role_id end,
      status=case when p_action='revoke_membership' then 'revoked' else m.status end,
      revoked_at=case when p_action='revoke_membership' then statement_timestamp() else m.revoked_at end,revision=v_revision where m.tenant_id=p_tenant_id and m.id=v_id;
    if p_action='edit_membership' then
      delete from app.membership_location_scopes x where x.tenant_id=p_tenant_id and x.membership_id=v_id;
      insert into app.membership_location_scopes(tenant_id,membership_id,location_id) select p_tenant_id,v_id,l from unnest(v_locations) l;
    end if;
  else
    v_id:=v_invite.id; v_revision:=v_invite.revision+1;
    update app.invitations i set status=case when p_action='resend' then 'pending' else 'revoked' end,
      expires_at=case when p_action='resend' then statement_timestamp()+interval '7 days' else i.expires_at end,
      revision=v_revision,updated_at=statement_timestamp() where i.tenant_id=p_tenant_id and i.id=v_id;
  end if;
  if p_action in ('invite','resend') then
    insert into private.staff_invitation_deliveries(tenant_id,invitation_id,invitation_revision) values(p_tenant_id,v_id,v_revision);
  end if;
  v_result:=jsonb_build_object('version',1,'id',v_id,'revision',v_revision,'replayed',false,'action',p_action);
  insert into app.staff_access_events(tenant_id,actor_id,effective_actor_id,request_id,request_hash,action,target_id,result)
    values(p_tenant_id,private.current_auth_user_id(),private.current_auth_user_id(),p_request_id,v_hash,p_action,v_id,v_result);
  if p_action in ('edit_membership','revoke_membership') then
    perform private.broadcast_authorization_change_v1(p_tenant_id,
      jsonb_build_object('reason','membership_changed','membership_id',v_id,'revision',v_revision));
  end if;
  return v_result;
end;
$$;

-- accept_staff_invitation_v1, replaced: an invitation to an archived role, or to
-- an assigned-mode role with no location, is no longer acceptable.
create or replace function private.accept_staff_invitation_v1(p_invitation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_invite app.invitations%rowtype; v_user auth.users%rowtype; v_role app.roles%rowtype; v_id uuid; v_replayed boolean:=false;
begin
  select * into v_user from auth.users u where u.id=private.current_auth_user_id() and u.email_confirmed_at is not null;
  if not found then raise exception using errcode='42501',message='invitation_unavailable'; end if;
  select * into v_invite from app.invitations i where i.id=p_invitation_id and i.invitee_email=lower(v_user.email);
  if not found then raise exception using errcode='42501',message='invitation_unavailable'; end if;
  perform 1 from app.tenants t where t.id=v_invite.tenant_id and t.status='active' for update;
  if not found then raise exception using errcode='42501',message='invitation_unavailable'; end if;
  select * into v_invite from app.invitations i where i.id=p_invitation_id for update;
  if v_invite.status='accepted' then
    select m.id into v_id from app.memberships m where m.tenant_id=v_invite.tenant_id and m.auth_user_id=v_user.id and m.status='active';
    if v_id is null then raise exception using errcode='42501',message='invitation_unavailable'; end if;
    return jsonb_build_object('version',1,'membership_id',v_id,'tenant_id',v_invite.tenant_id,'replayed',true);
  end if;
  if v_invite.status<>'pending' or v_invite.expires_at<=statement_timestamp() then raise exception using errcode='42501',message='invitation_unavailable'; end if;
  select * into v_role from app.roles r where r.tenant_id=v_invite.tenant_id and r.id=v_invite.role_id;
  if v_role.archived_at is not null
     or (v_role.location_scope_mode='assigned' and not exists(select 1 from app.invitation_location_scopes x where x.tenant_id=v_invite.tenant_id and x.invitation_id=v_invite.id)) then
    raise exception using errcode='42501',message='invitation_unavailable';
  end if;
  select m.id into v_id from app.memberships m where m.tenant_id=v_invite.tenant_id and m.auth_user_id=v_user.id for update;
  if v_id is null then
    v_id:=pg_catalog.gen_random_uuid();
    insert into app.memberships(id,tenant_id,auth_user_id,role_id) values(v_id,v_invite.tenant_id,v_user.id,v_invite.role_id);
  else
    update app.memberships m set role_id=v_invite.role_id,status='active',revoked_at=null,revision=m.revision+1 where m.tenant_id=v_invite.tenant_id and m.id=v_id and m.status<>'active';
    if not found then raise exception using errcode='22023',message='member_already_active'; end if;
  end if;
  delete from app.membership_location_scopes x where x.tenant_id=v_invite.tenant_id and x.membership_id=v_id;
  insert into app.membership_location_scopes(tenant_id,membership_id,location_id)
    select x.tenant_id,v_id,x.location_id from app.invitation_location_scopes x where x.tenant_id=v_invite.tenant_id and x.invitation_id=v_invite.id;
  update app.invitations i set status='accepted',accepted_at=statement_timestamp(),revision=i.revision+1,updated_at=statement_timestamp() where i.id=v_invite.id;
  insert into app.staff_access_events(tenant_id,actor_id,effective_actor_id,request_id,request_hash,action,target_id,result)
    values(v_invite.tenant_id,v_user.id,v_user.id,pg_catalog.gen_random_uuid(),'', 'accept_invitation',v_invite.id,jsonb_build_object('membership_id',v_id));
  perform private.broadcast_authorization_change_v1(v_invite.tenant_id,
    jsonb_build_object('reason','membership_changed','membership_id',v_id));
  return jsonb_build_object('version',1,'membership_id',v_id,'tenant_id',v_invite.tenant_id,'replayed',v_replayed);
end;
$$;

-- ---------------------------------------------------------------------------
-- api_v1 wrappers and grants.
-- ---------------------------------------------------------------------------
create function api_v1.get_role_catalog_v1(p_tenant_id uuid) returns jsonb
  language sql security invoker set search_path = '' as $$ select private.get_role_catalog_v1(p_tenant_id); $$;
create function api_v1.list_roles_v1(p_tenant_id uuid) returns jsonb
  language sql security invoker set search_path = '' as $$ select private.list_roles_v1(p_tenant_id); $$;
create function api_v1.save_role_v1(
  p_tenant_id uuid, p_request_id uuid, p_role_id uuid default null, p_expected_revision bigint default null,
  p_source_role_id uuid default null, p_name_en text default null, p_name_ar text default null,
  p_description_en text default null, p_description_ar text default null,
  p_location_scope_mode text default 'tenant', p_grants jsonb default '[]'::jsonb) returns jsonb
  language sql security invoker set search_path = '' as $$
  select private.save_role_v1(p_tenant_id, p_request_id, p_role_id, p_expected_revision, p_source_role_id,
    p_name_en, p_name_ar, p_description_en, p_description_ar, p_location_scope_mode, p_grants); $$;
create function api_v1.archive_role_v1(p_tenant_id uuid, p_request_id uuid, p_role_id uuid, p_expected_revision bigint) returns jsonb
  language sql security invoker set search_path = '' as $$ select private.archive_role_v1(p_tenant_id, p_request_id, p_role_id, p_expected_revision); $$;
create function api_v1.get_staff_access_workspace_v2(p_tenant_id uuid) returns jsonb
  language sql security invoker set search_path = '' as $$ select private.get_staff_access_workspace_v2(p_tenant_id); $$;

revoke all on function
  private.get_role_catalog_v1(uuid), private.list_roles_v1(uuid),
  private.save_role_v1(uuid, uuid, uuid, bigint, uuid, text, text, text, text, text, jsonb),
  private.archive_role_v1(uuid, uuid, uuid, bigint), private.get_staff_access_workspace_v2(uuid),
  api_v1.get_role_catalog_v1(uuid), api_v1.list_roles_v1(uuid),
  api_v1.save_role_v1(uuid, uuid, uuid, bigint, uuid, text, text, text, text, text, jsonb),
  api_v1.archive_role_v1(uuid, uuid, uuid, bigint), api_v1.get_staff_access_workspace_v2(uuid)
from public, anon, service_role;
grant execute on function
  private.get_role_catalog_v1(uuid), private.list_roles_v1(uuid),
  private.save_role_v1(uuid, uuid, uuid, bigint, uuid, text, text, text, text, text, jsonb),
  private.archive_role_v1(uuid, uuid, uuid, bigint), private.get_staff_access_workspace_v2(uuid),
  api_v1.get_role_catalog_v1(uuid), api_v1.list_roles_v1(uuid),
  api_v1.save_role_v1(uuid, uuid, uuid, bigint, uuid, text, text, text, text, text, jsonb),
  api_v1.archive_role_v1(uuid, uuid, uuid, bigint), api_v1.get_staff_access_workspace_v2(uuid)
to authenticated;
