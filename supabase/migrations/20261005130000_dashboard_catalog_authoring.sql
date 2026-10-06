-- Tasks 8–9: staged metadata + existing immutable localized revisions.
create table app.catalog_draft_heads (
  tenant_id uuid not null references app.tenants(id), entity_id uuid not null,
  kind text not null check(kind in ('service','category','location')),
  revision bigint not null check(revision>0), state text not null check(state in ('draft','published','retired')),
  metadata jsonb not null check(jsonb_typeof(metadata)='object'),
  primary key(tenant_id,entity_id)
);
alter table app.catalog_draft_heads enable row level security;
revoke all on app.catalog_draft_heads from public,anon,authenticated;
create table app.catalog_authoring_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),tenant_id uuid not null references app.tenants(id),
  actor_id uuid not null,effective_actor_id uuid not null,request_id uuid not null,
  request_hash text not null,action text not null,target_id uuid not null,result jsonb not null,
  created_at timestamptz not null default statement_timestamp(),unique(tenant_id,request_id)
);
alter table app.catalog_authoring_events enable row level security;
create policy catalog_authoring_events_read on app.catalog_authoring_events for select to authenticated
  using ((select private.has_direct_capability(tenant_id,'audit.read')));
revoke all on app.catalog_authoring_events from public,anon,authenticated;
grant select on app.catalog_authoring_events to authenticated;
create trigger catalog_authoring_events_append_only before update or delete on app.catalog_authoring_events
  for each row execute function private.enforce_append_only();

create function private.catalog_entity_document_v1(p_tenant_id uuid,p_kind text,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare h app.catalog_draft_heads%rowtype; e jsonb; en jsonb; ar jsonb; v_revision bigint;
begin
  select * into h from app.catalog_draft_heads x where x.tenant_id=p_tenant_id and x.entity_id=p_id and x.kind=p_kind;
  if p_kind='service' then
    select jsonb_build_object('key',s.key,'category_id',s.category_id,'assignment_mode',s.assignment_mode,'fixed_staff_id',s.fixed_staff_id,'resource_type_id',(select rr.resource_type_id from app.resource_requirements rr where rr.tenant_id=s.tenant_id and rr.service_id=s.id),'location_ids',coalesce((select jsonb_agg(l.location_id order by l.location_id) from app.catalog_service_locations l where l.tenant_id=s.tenant_id and l.service_id=s.id),'[]'::jsonb),'status',s.status) into e from app.catalog_services s where s.tenant_id=p_tenant_id and s.id=p_id;
    select to_jsonb(r) into en from app.catalog_service_revisions r where r.tenant_id=p_tenant_id and r.service_id=p_id and r.locale='en' and (case when h.state in ('draft','retired') and exists(select 1 from app.catalog_draft_heads x where x.tenant_id=p_tenant_id and x.entity_id=p_id) then r.revision=h.revision and r.state='draft' else r.state='published' end) order by r.revision desc limit 1;
    select to_jsonb(r) into ar from app.catalog_service_revisions r where r.tenant_id=p_tenant_id and r.service_id=p_id and r.locale='ar' and (case when h.state in ('draft','retired') and exists(select 1 from app.catalog_draft_heads x where x.tenant_id=p_tenant_id and x.entity_id=p_id) then r.revision=h.revision and r.state='draft' else r.state='published' end) order by r.revision desc limit 1;
  elsif p_kind='category' then
    select jsonb_build_object('key',c.key,'sort_order',c.sort_order,'status',c.status) into e from app.catalog_categories c where c.tenant_id=p_tenant_id and c.id=p_id;
    select to_jsonb(r) into en from app.catalog_category_revisions r where r.tenant_id=p_tenant_id and r.category_id=p_id and r.locale='en' and (case when h.state in ('draft','retired') and exists(select 1 from app.catalog_draft_heads x where x.tenant_id=p_tenant_id and x.entity_id=p_id) then r.revision=h.revision and r.state='draft' else r.state='published' end) order by r.revision desc limit 1;
    select to_jsonb(r) into ar from app.catalog_category_revisions r where r.tenant_id=p_tenant_id and r.category_id=p_id and r.locale='ar' and (case when h.state in ('draft','retired') and exists(select 1 from app.catalog_draft_heads x where x.tenant_id=p_tenant_id and x.entity_id=p_id) then r.revision=h.revision and r.state='draft' else r.state='published' end) order by r.revision desc limit 1;
  elsif p_kind='location' then
    select jsonb_build_object('key',l.key,'time_zone',l.time_zone,'status',l.status) into e from app.locations l where l.tenant_id=p_tenant_id and l.id=p_id;
    select to_jsonb(r) into en from app.catalog_location_revisions r where r.tenant_id=p_tenant_id and r.location_id=p_id and r.locale='en' and (case when h.state in ('draft','retired') and exists(select 1 from app.catalog_draft_heads x where x.tenant_id=p_tenant_id and x.entity_id=p_id) then r.revision=h.revision and r.state='draft' else r.state='published' end) order by r.revision desc limit 1;
    select to_jsonb(r) into ar from app.catalog_location_revisions r where r.tenant_id=p_tenant_id and r.location_id=p_id and r.locale='ar' and (case when h.state in ('draft','retired') and exists(select 1 from app.catalog_draft_heads x where x.tenant_id=p_tenant_id and x.entity_id=p_id) then r.revision=h.revision and r.state='draft' else r.state='published' end) order by r.revision desc limit 1;
  end if;
  if e is null then return null; end if;
  v_revision:=coalesce(h.revision,(en->>'revision')::bigint,(ar->>'revision')::bigint,0);
  return jsonb_build_object('id',p_id,'kind',p_kind,'revision',v_revision,'state',coalesce(h.state,case when e->>'status' in ('retired','inactive') then 'retired' else 'published' end),'metadata',coalesce(h.metadata,e-'status'),
    'name_en',coalesce(en->>'name',''),'name_ar',coalesce(ar->>'name',''),'description_en',coalesce(en->>'description',''),'description_ar',coalesce(ar->>'description',''),'address_en',coalesce(en->>'address',''),'address_ar',coalesce(ar->>'address',''),
    'duration_minutes',coalesce(en->'duration_minutes','30'::jsonb),'buffer_before_minutes',coalesce(en->'buffer_before_minutes','0'::jsonb),'buffer_after_minutes',coalesce(en->'buffer_after_minutes','0'::jsonb),'price_minor',coalesce(en->'price_minor','0'::jsonb),'currency',coalesce(en->>'currency','USD'),'tax_rate_bps',coalesce(en->'tax_rate_bps','0'::jsonb),'payment_mode',coalesce(en->>'payment_mode','none'),'booking_mode',coalesce(en->>'booking_mode','appointment'),'approval_required',coalesce(en->'approval_required','false'::jsonb),'policy',coalesce(en->'policy','{}'::jsonb),'policy_ar',coalesce(ar->'policy','{}'::jsonb),'intake_schema',coalesce(en->'intake_schema','{"fields":[]}'::jsonb),'intake_schema_ar',coalesce(ar->'intake_schema','{"fields":[]}'::jsonb));
end;
$$;
revoke all on function private.catalog_entity_document_v1(uuid,text,uuid) from public,anon,authenticated,service_role;

create function private.get_catalog_workspace_v1(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_all boolean; v_docs jsonb;
begin
  v_all:=private.can_manage_catalog(p_tenant_id,null);
  if not v_all and not exists(select 1 from app.locations l where l.tenant_id=p_tenant_id and private.can_manage_catalog(p_tenant_id,l.id)) then raise exception using errcode='42501',message='not_authorized'; end if;
  select coalesce(jsonb_agg(x.document order by x.kind,x.id),'[]'::jsonb) into v_docs from (
    select 'service' kind,s.id,private.catalog_entity_document_v1(p_tenant_id,'service',s.id) document from app.catalog_services s where s.tenant_id=p_tenant_id and (v_all or (exists(select 1 from app.catalog_service_locations l where l.tenant_id=s.tenant_id and l.service_id=s.id) and not exists(select 1 from app.catalog_service_locations l where l.tenant_id=s.tenant_id and l.service_id=s.id and not private.can_manage_catalog(p_tenant_id,l.location_id))))
    union all select 'category',c.id,private.catalog_entity_document_v1(p_tenant_id,'category',c.id) from app.catalog_categories c where c.tenant_id=p_tenant_id and v_all
    union all select 'location',l.id,private.catalog_entity_document_v1(p_tenant_id,'location',l.id) from app.locations l where l.tenant_id=p_tenant_id and (v_all or private.can_manage_catalog(p_tenant_id,l.id))
  ) x;
  return jsonb_build_object('version',1,'tenant_id',p_tenant_id,'can_publish',private.has_direct_capability(p_tenant_id,'catalog.edit'),'entities',v_docs,
    'resource_types',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name) order by r.name) from app.resource_types r where r.tenant_id=p_tenant_id and r.exclusive),'[]'::jsonb),'staff',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.public_name) order by s.public_name) from app.staff_profiles s where s.tenant_id=p_tenant_id and s.status='active' and (v_all or exists(select 1 from app.staff_locations l where l.tenant_id=s.tenant_id and l.staff_id=s.id and private.can_access_location(p_tenant_id,l.location_id)))),'[]'::jsonb));
end;
$$;

create function private.save_catalog_entity_v1(p_tenant_id uuid,p_request_id uuid,p_kind text,p_entity_id uuid,p_expected_revision bigint,p_document jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid:=coalesce(p_entity_id,pg_catalog.gen_random_uuid()); v_old jsonb; v_revision bigint; v_metadata jsonb; v_locale text; v_name text; v_description text; v_hash text; v_prior app.catalog_authoring_events%rowtype; v_result jsonb; v_full boolean;
begin
  perform 1 from app.tenants t where t.id=p_tenant_id and t.status='active' for update;
  if not found then raise exception using errcode='42501',message='not_authorized'; end if;
  v_full:=private.has_direct_capability(p_tenant_id,'catalog.edit');
  if not v_full and not private.can_manage_catalog(p_tenant_id,null) and not exists(select 1 from app.locations l where l.tenant_id=p_tenant_id and private.can_manage_catalog(p_tenant_id,l.id)) then raise exception using errcode='42501',message='not_authorized'; end if;
  if p_request_id is null or p_kind is null or p_kind not in ('service','category','location') or jsonb_typeof(p_document) is distinct from 'object' or octet_length(p_document::text)>100000 then raise exception using errcode='22023',message='invalid_request'; end if;
  if p_entity_id is not null and not v_full then
    if p_kind='category' or (p_kind='location' and not private.can_manage_catalog(p_tenant_id,p_entity_id)) or
      (p_kind='service' and (not exists(select 1 from app.catalog_service_locations where tenant_id=p_tenant_id and service_id=p_entity_id) or exists(select 1 from app.catalog_service_locations where tenant_id=p_tenant_id and service_id=p_entity_id and not private.can_manage_catalog(p_tenant_id,location_id)))) then raise exception using errcode='42501',message='not_authorized'; end if;
  end if;
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_array(p_request_id,p_kind,p_entity_id,p_expected_revision,p_document)::text,'UTF8'),'sha256'),'hex');
  select * into v_prior from app.catalog_authoring_events e where e.tenant_id=p_tenant_id and e.request_id=p_request_id;
  if found then
    if v_prior.actor_id<>private.current_auth_user_id() or v_prior.request_hash<>v_hash then raise exception using errcode='22023',message='idempotency_conflict'; end if;
    return v_prior.result||jsonb_build_object('replayed',true);
  end if;
  v_old:=private.catalog_entity_document_v1(p_tenant_id,p_kind,v_id);
  if p_entity_id is not null and v_old is null then raise exception using errcode='42501',message='not_authorized'; end if;
  if v_old is not null and p_expected_revision is distinct from (v_old->>'revision')::bigint then raise exception using errcode='40001',message='revision_conflict'; end if;
  v_metadata:=p_document->'metadata';
  if char_length(v_metadata->>'key')>100 then raise exception using errcode='22023',message='invalid_request'; end if;
  if jsonb_typeof(v_metadata) is distinct from 'object' or coalesce(v_metadata->>'key','') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception using errcode='22023',message='invalid_request'; end if;
  if not v_full then
    if v_old is null or (p_document - array['name_en','name_ar','description_en','description_ar']) is distinct from (v_old - array['id','kind','revision','state','name_en','name_ar','description_en','description_ar']) then raise exception using errcode='42501',message='catalog_approval_required'; end if;
    if p_kind='location' and not private.can_manage_catalog(p_tenant_id,v_id) then raise exception using errcode='42501',message='not_authorized'; end if;
    if p_kind='service' and exists(select 1 from jsonb_array_elements_text(v_metadata->'location_ids') l where not private.can_manage_catalog(p_tenant_id,l::uuid)) then raise exception using errcode='42501',message='not_authorized'; end if;
  end if;
  if p_kind='service' then
    if jsonb_typeof(v_metadata->'location_ids') is distinct from 'array' or jsonb_array_length(v_metadata->'location_ids')=0 or jsonb_array_length(v_metadata->'location_ids')>100
      or exists(select 1 from jsonb_array_elements_text(v_metadata->'location_ids') l where not exists(select 1 from app.locations x where x.tenant_id=p_tenant_id and x.id=l::uuid and x.status='active'))
      or ((v_metadata->>'category_id') is not null and not exists(select 1 from app.catalog_categories c where c.tenant_id=p_tenant_id and c.id=(v_metadata->>'category_id')::uuid and c.status='active')) then raise exception using errcode='22023',message='catalog_reference_invalid'; end if;
    if v_metadata->>'assignment_mode' not in ('any_available','customer_choice','round_robin','fixed_staff') or v_metadata->>'assignment_mode' is null
      or ((v_metadata->>'assignment_mode'='fixed_staff') <> ((v_metadata->>'fixed_staff_id') is not null))
      or ((v_metadata->>'fixed_staff_id') is not null and not exists(select 1 from app.staff_profiles s where s.tenant_id=p_tenant_id and s.id=(v_metadata->>'fixed_staff_id')::uuid and s.status='active')) then raise exception using errcode='22023',message='catalog_assignment_invalid'; end if;
    if (v_metadata->>'resource_type_id') is not null and not exists(select 1 from app.resource_types rt where rt.tenant_id=p_tenant_id and rt.id=(v_metadata->>'resource_type_id')::uuid and rt.exclusive) then raise exception using errcode='22023',message='catalog_reference_invalid'; end if;
    if (p_document->>'price_minor')::numeric>9007199254740991 then raise exception using errcode='22023',message='invalid_request'; end if;
    if p_document->>'currency'<>'USD' or p_document->>'booking_mode' not in ('appointment','exclusive_resource') or p_document->>'payment_mode' not in ('none','deposit','full') then raise exception using errcode='22023',message='catalog_first_release_invalid'; end if;
    if jsonb_typeof(p_document->'policy') is distinct from 'object' or jsonb_typeof(p_document->'intake_schema') is distinct from 'object' or jsonb_typeof(p_document->'intake_schema'->'fields') is distinct from 'array' then raise exception using errcode='22023',message='catalog_policy_invalid'; end if;
  elsif p_kind='location' then
    if not exists(select 1 from pg_catalog.pg_timezone_names where name=v_metadata->>'time_zone') or v_metadata->>'time_zone' !~ '^[A-Za-z_]+(/[A-Za-z0-9_+\-]+)+$' then raise exception using errcode='22023',message='catalog_time_zone_invalid'; end if;
  end if;
  -- New identities have no published content. Staged metadata never edits live rows.
  if v_old is null then
    if p_kind='service' then insert into app.catalog_services(id,tenant_id,key) values(v_id,p_tenant_id,v_metadata->>'key');
    elsif p_kind='category' then insert into app.catalog_categories(id,tenant_id,key) values(v_id,p_tenant_id,v_metadata->>'key');
    else insert into app.locations(id,tenant_id,key,name,time_zone) values(v_id,p_tenant_id,v_metadata->>'key',btrim(p_document->>'name_en'),v_metadata->>'time_zone'); end if;
  end if;
  if p_kind='service' then select coalesce(max(r.revision),0)+1 into v_revision from app.catalog_service_revisions r where r.tenant_id=p_tenant_id and r.service_id=v_id;
  elsif p_kind='category' then select coalesce(max(r.revision),0)+1 into v_revision from app.catalog_category_revisions r where r.tenant_id=p_tenant_id and r.category_id=v_id;
  else select coalesce(max(r.revision),0)+1 into v_revision from app.catalog_location_revisions r where r.tenant_id=p_tenant_id and r.location_id=v_id; end if;
  foreach v_locale in array array['en','ar'] loop
    v_name:=btrim(p_document->>('name_'||v_locale)); v_description:=coalesce(p_document->>('description_'||v_locale),'');
    if p_kind='service' then
      insert into app.catalog_service_revisions(id,tenant_id,service_id,revision,locale,state,name,description,canonical_path,duration_minutes,buffer_before_minutes,buffer_after_minutes,price_minor,tax_rate_bps,currency,capacity_mode,booking_mode,approval_required,payment_mode,intake_schema,policy)
      values(pg_catalog.gen_random_uuid(),p_tenant_id,v_id,v_revision,v_locale,'draft',v_name,v_description,'/services/'||(v_metadata->>'key'),(p_document->>'duration_minutes')::integer,(p_document->>'buffer_before_minutes')::integer,(p_document->>'buffer_after_minutes')::integer,(p_document->>'price_minor')::bigint,(p_document->>'tax_rate_bps')::integer,p_document->>'currency','exclusive',p_document->>'booking_mode',(p_document->>'approval_required')::boolean,p_document->>'payment_mode',case when v_locale='ar' then coalesce(p_document->'intake_schema_ar',p_document->'intake_schema') else p_document->'intake_schema' end,case when v_locale='ar' then coalesce(p_document->'policy_ar',p_document->'policy') else p_document->'policy' end);
    elsif p_kind='category' then insert into app.catalog_category_revisions(id,tenant_id,category_id,revision,locale,state,name,description) values(pg_catalog.gen_random_uuid(),p_tenant_id,v_id,v_revision,v_locale,'draft',v_name,v_description);
    else insert into app.catalog_location_revisions(id,tenant_id,location_id,revision,locale,state,name,description,address,canonical_path) values(pg_catalog.gen_random_uuid(),p_tenant_id,v_id,v_revision,v_locale,'draft',v_name,v_description,coalesce(p_document->>('address_'||v_locale),''),'/locations/'||(v_metadata->>'key')); end if;
  end loop;
  insert into app.catalog_draft_heads(tenant_id,entity_id,kind,revision,state,metadata) values(p_tenant_id,v_id,p_kind,v_revision,'draft',v_metadata)
    on conflict(tenant_id,entity_id) do update set revision=excluded.revision,state='draft',metadata=excluded.metadata;
  v_result:=jsonb_build_object('version',1,'id',v_id,'revision',v_revision,'state','draft','replayed',false);
  insert into app.catalog_authoring_events(tenant_id,actor_id,effective_actor_id,request_id,request_hash,action,target_id,result) values(p_tenant_id,private.current_auth_user_id(),private.current_auth_user_id(),p_request_id,v_hash,'save_'||p_kind,v_id,v_result);
  return v_result;
end;
$$;

create function private.publish_catalog_workspace_v1(p_tenant_id uuid,p_request_id uuid,p_revisions jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_head app.catalog_draft_heads%rowtype; v_hash text; v_prior app.catalog_authoring_events%rowtype; v_publication uuid:=pg_catalog.gen_random_uuid(); v_revision bigint; v_service_ids uuid[]:='{}'; v_category_ids uuid[]:='{}'; v_location_ids uuid[]:='{}'; v_new_ids uuid[]; v_result jsonb;
begin
  perform 1 from app.tenants t where t.id=p_tenant_id and t.status='active' for update;
  if not found or not private.has_direct_capability(p_tenant_id,'catalog.edit') then raise exception using errcode='42501',message='not_authorized'; end if;
  if p_request_id is null or jsonb_typeof(p_revisions) is distinct from 'object' then raise exception using errcode='22023',message='invalid_request'; end if;
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_array(p_request_id,p_revisions)::text,'UTF8'),'sha256'),'hex');
  select * into v_prior from app.catalog_authoring_events e where e.tenant_id=p_tenant_id and e.request_id=p_request_id;
  if found then
    if v_prior.actor_id<>private.current_auth_user_id() or v_prior.request_hash<>v_hash then raise exception using errcode='22023',message='idempotency_conflict'; end if;
    return v_prior.result||jsonb_build_object('replayed',true);
  end if;
  if exists(select 1 from app.catalog_draft_heads x where x.tenant_id=p_tenant_id and x.state='draft' and (p_revisions->>x.entity_id::text)::bigint is distinct from x.revision)
    or exists(select 1 from jsonb_object_keys(p_revisions) k where not exists(select 1 from app.catalog_draft_heads x where x.tenant_id=p_tenant_id and x.entity_id=k::uuid and x.state='draft')) then raise exception using errcode='40001',message='revision_conflict'; end if;
  if not exists(select 1 from app.catalog_draft_heads x where x.tenant_id=p_tenant_id and x.state='draft') then raise exception using errcode='22023',message='catalog_no_draft'; end if;
  -- Apply metadata only here, under the same lock as the aggregate switch.
  for v_head in select * from app.catalog_draft_heads x where x.tenant_id=p_tenant_id and x.state='draft' order by x.kind,x.entity_id loop
    if v_head.kind='service' then
      update app.catalog_services s set key=v_head.metadata->>'key',category_id=(v_head.metadata->>'category_id')::uuid,assignment_mode=v_head.metadata->>'assignment_mode',fixed_staff_id=(v_head.metadata->>'fixed_staff_id')::uuid,status=case when v_head.metadata->>'retire'='true' then 'retired' else 'active' end,updated_at=statement_timestamp() where s.tenant_id=p_tenant_id and s.id=v_head.entity_id;
      if v_head.metadata->>'resource_type_id' is null then delete from app.resource_requirements r where r.tenant_id=p_tenant_id and r.service_id=v_head.entity_id;
      else insert into app.resource_requirements(tenant_id,service_id,resource_type_id) values(p_tenant_id,v_head.entity_id,(v_head.metadata->>'resource_type_id')::uuid) on conflict(tenant_id,service_id) do update set resource_type_id=excluded.resource_type_id; end if;
      delete from app.catalog_service_locations l where l.tenant_id=p_tenant_id and l.service_id=v_head.entity_id;
      insert into app.catalog_service_locations(tenant_id,service_id,location_id) select p_tenant_id,v_head.entity_id,l::uuid from jsonb_array_elements_text(v_head.metadata->'location_ids') l;
    elsif v_head.kind='category' then update app.catalog_categories c set key=v_head.metadata->>'key',sort_order=coalesce((v_head.metadata->>'sort_order')::integer,0),status=case when v_head.metadata->>'retire'='true' then 'retired' else 'active' end,updated_at=statement_timestamp() where c.tenant_id=p_tenant_id and c.id=v_head.entity_id;
    else update app.locations l set key=v_head.metadata->>'key',time_zone=v_head.metadata->>'time_zone',name=(select r.name from app.catalog_location_revisions r where r.tenant_id=p_tenant_id and r.location_id=v_head.entity_id and r.revision=v_head.revision and r.locale='en'),status=case when v_head.metadata->>'retire'='true' then 'inactive' else 'active' end,updated_at=statement_timestamp() where l.tenant_id=p_tenant_id and l.id=v_head.entity_id; end if;
  end loop;
  if exists(select 1 from app.catalog_services s join app.catalog_categories c on c.tenant_id=s.tenant_id and c.id=s.category_id where s.tenant_id=p_tenant_id and s.status='active' and c.status='retired') then raise exception using errcode='22023',message='catalog_category_in_use'; end if;
  -- Unchanged published offerings participate in the new aggregate too.
  with cloned as (insert into app.catalog_service_revisions
    select (jsonb_populate_record(null::app.catalog_service_revisions,to_jsonb(r)||jsonb_build_object('id',pg_catalog.gen_random_uuid(),'revision',(select max(x.revision)+1 from app.catalog_service_revisions x where x.tenant_id=r.tenant_id and x.service_id=r.service_id),'state','draft','publication_id',null,'published_at',null,'created_at',statement_timestamp()))).*
    from app.catalog_service_revisions r join app.catalog_services e on e.tenant_id=r.tenant_id and e.id=r.service_id
    where r.tenant_id=p_tenant_id and r.state='published' and e.status='active'
      and not exists(select 1 from app.catalog_draft_heads h where h.tenant_id=r.tenant_id and h.entity_id=r.service_id and h.state='draft')
    returning id) select coalesce(array_agg(id),'{}'::uuid[]) into v_service_ids from cloned;
  select coalesce(array_agg(r.id),'{}'::uuid[]) into v_new_ids from app.catalog_service_revisions r join app.catalog_draft_heads h on h.tenant_id=r.tenant_id and h.entity_id=r.service_id and h.kind='service' and h.revision=r.revision
    where r.tenant_id=p_tenant_id and r.state='draft' and h.state='draft' and coalesce(h.metadata->>'retire','false')<>'true';
  v_service_ids:=v_service_ids||v_new_ids;
  -- Unchanged published offerings participate in the new aggregate too.
  with cloned as (insert into app.catalog_category_revisions
    select (jsonb_populate_record(null::app.catalog_category_revisions,to_jsonb(r)||jsonb_build_object('id',pg_catalog.gen_random_uuid(),'revision',(select max(x.revision)+1 from app.catalog_category_revisions x where x.tenant_id=r.tenant_id and x.category_id=r.category_id),'state','draft','publication_id',null,'published_at',null,'created_at',statement_timestamp()))).*
    from app.catalog_category_revisions r join app.catalog_categories e on e.tenant_id=r.tenant_id and e.id=r.category_id
    where r.tenant_id=p_tenant_id and r.state='published' and e.status='active'
      and not exists(select 1 from app.catalog_draft_heads h where h.tenant_id=r.tenant_id and h.entity_id=r.category_id and h.state='draft')
    returning id) select coalesce(array_agg(id),'{}'::uuid[]) into v_category_ids from cloned;
  select coalesce(array_agg(r.id),'{}'::uuid[]) into v_new_ids from app.catalog_category_revisions r join app.catalog_draft_heads h on h.tenant_id=r.tenant_id and h.entity_id=r.category_id and h.kind='category' and h.revision=r.revision
    where r.tenant_id=p_tenant_id and r.state='draft' and h.state='draft' and coalesce(h.metadata->>'retire','false')<>'true';
  v_category_ids:=v_category_ids||v_new_ids;
  -- Unchanged published offerings participate in the new aggregate too.
  with cloned as (insert into app.catalog_location_revisions
    select (jsonb_populate_record(null::app.catalog_location_revisions,to_jsonb(r)||jsonb_build_object('id',pg_catalog.gen_random_uuid(),'revision',(select max(x.revision)+1 from app.catalog_location_revisions x where x.tenant_id=r.tenant_id and x.location_id=r.location_id),'state','draft','publication_id',null,'published_at',null,'created_at',statement_timestamp()))).*
    from app.catalog_location_revisions r join app.locations e on e.tenant_id=r.tenant_id and e.id=r.location_id
    where r.tenant_id=p_tenant_id and r.state='published' and e.status='active'
      and not exists(select 1 from app.catalog_draft_heads h where h.tenant_id=r.tenant_id and h.entity_id=r.location_id and h.state='draft')
    returning id) select coalesce(array_agg(id),'{}'::uuid[]) into v_location_ids from cloned;
  select coalesce(array_agg(r.id),'{}'::uuid[]) into v_new_ids from app.catalog_location_revisions r join app.catalog_draft_heads h on h.tenant_id=r.tenant_id and h.entity_id=r.location_id and h.kind='location' and h.revision=r.revision
    where r.tenant_id=p_tenant_id and r.state='draft' and h.state='draft' and coalesce(h.metadata->>'retire','false')<>'true';
  v_location_ids:=v_location_ids||v_new_ids;
  -- Existing public aggregate API remains the state-transition owner.
  select coalesce(max(p.revision),0)+1 into v_revision from app.catalog_publications p where p.tenant_id=p_tenant_id;
  insert into app.catalog_publications(id,tenant_id,revision,state) values(v_publication,p_tenant_id,v_revision,'draft');
  perform private.validate_catalog_publication_v1(p_tenant_id,v_service_ids,v_category_ids,v_location_ids);
  update app.catalog_publications p set state='retired',published_at=null where p.tenant_id=p_tenant_id and p.state='published';
  perform api_v1.publish_catalog_v1(p_tenant_id,v_publication,v_service_ids,v_category_ids,v_location_ids);
  update app.catalog_draft_heads h set state=case when h.metadata->>'retire'='true' then 'retired' else 'published' end where h.tenant_id=p_tenant_id and h.state='draft';
  v_result:=jsonb_build_object('version',1,'publication_id',v_publication,'revision',v_revision,'cache_tag','catalog:'||p_tenant_id::text||':'||v_revision::text,'replayed',false);
  insert into app.catalog_authoring_events(tenant_id,actor_id,effective_actor_id,request_id,request_hash,action,target_id,result) values(p_tenant_id,private.current_auth_user_id(),private.current_auth_user_id(),p_request_id,v_hash,'publish',v_publication,v_result);
  return v_result;
end;
$$;

create function private.validate_catalog_publication_v1(p_tenant_id uuid,p_service_ids uuid[],p_category_ids uuid[],p_location_ids uuid[])
returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.has_direct_capability(p_tenant_id,'catalog.edit') then raise exception using errcode='42501',message='not_authorized'; end if;
  if exists(select 1 from app.catalog_service_revisions old join app.catalog_services s on s.tenant_id=old.tenant_id and s.id=old.service_id where old.tenant_id=p_tenant_id and old.state='published' and s.status='active' and not exists(select 1 from app.catalog_service_revisions next where next.id=any(p_service_ids) and next.tenant_id=old.tenant_id and next.service_id=old.service_id and next.locale=old.locale)) then raise exception using errcode='22023',message='catalog_aggregate_incomplete'; end if;
  if cardinality(p_service_ids)>10000 or cardinality(p_category_ids)>10000 or cardinality(p_location_ids)>10000 then raise exception using errcode='22023',message='catalog_publication_invalid'; end if;
  if cardinality(p_service_ids)<>(select count(*) from app.catalog_service_revisions r where r.tenant_id=p_tenant_id and r.id=any(p_service_ids) and r.state='draft')
    or cardinality(p_category_ids)<>(select count(*) from app.catalog_category_revisions r where r.tenant_id=p_tenant_id and r.id=any(p_category_ids) and r.state='draft')
    or cardinality(p_location_ids)<>(select count(*) from app.catalog_location_revisions r where r.tenant_id=p_tenant_id and r.id=any(p_location_ids) and r.state='draft') then raise exception using errcode='22023',message='catalog_reference_invalid'; end if;
  if exists(select r.service_id from app.catalog_service_revisions r where r.id=any(p_service_ids) group by r.service_id having count(*)<>2 or count(distinct r.locale)<>2)
    or exists(select r.category_id from app.catalog_category_revisions r where r.id=any(p_category_ids) group by r.category_id having count(*)<>2 or count(distinct r.locale)<>2)
    or exists(select r.location_id from app.catalog_location_revisions r where r.id=any(p_location_ids) group by r.location_id having count(*)<>2 or count(distinct r.locale)<>2) then raise exception using errcode='22023',message='catalog_locales_required'; end if;
  if exists(select 1 from app.catalog_service_revisions r join app.catalog_services s on s.tenant_id=r.tenant_id and s.id=r.service_id where r.id=any(p_service_ids) and (
    r.capacity_mode<>'exclusive' or not exists(select 1 from app.catalog_service_locations l where l.tenant_id=r.tenant_id and l.service_id=r.service_id)
    or exists(select 1 from app.catalog_service_locations l where l.tenant_id=r.tenant_id and l.service_id=r.service_id and not exists(select 1 from app.catalog_location_revisions lr where lr.tenant_id=l.tenant_id and lr.location_id=l.location_id and lr.locale=r.locale and lr.id=any(p_location_ids)))
    or (s.category_id is not null and not exists(select 1 from app.catalog_category_revisions cr where cr.tenant_id=s.tenant_id and cr.category_id=s.category_id and cr.locale=r.locale and cr.id=any(p_category_ids)))
    or (r.booking_mode='exclusive_resource' and not exists(select 1 from app.resource_requirements rr join app.resource_types rt on rt.tenant_id=rr.tenant_id and rt.id=rr.resource_type_id where rr.tenant_id=r.tenant_id and rr.service_id=r.service_id and rt.exclusive))
  )) then raise exception using errcode='22023',message='catalog_reference_invalid'; end if;
  -- Locale variants share commercial and validation semantics; only copy may differ.
  if exists(select 1 from app.catalog_service_revisions en join app.catalog_service_revisions ar on ar.tenant_id=en.tenant_id and ar.service_id=en.service_id and ar.locale='ar' and ar.id=any(p_service_ids)
    where en.id=any(p_service_ids) and en.locale='en' and (
      (to_jsonb(en)-array['id','locale','name','description','canonical_path','seo','seo_title','seo_description','og_image_path','created_at','policy','intake_schema']) is distinct from (to_jsonb(ar)-array['id','locale','name','description','canonical_path','seo','seo_title','seo_description','og_image_path','created_at','policy','intake_schema'])
      or ((en.policy-'consent_text')#-'{consent,text}') is distinct from ((ar.policy-'consent_text')#-'{consent,text}')
      or (select coalesce(jsonb_agg(f-'label' order by f->>'key'),'[]'::jsonb) from jsonb_array_elements(coalesce(en.intake_schema->'fields','[]'::jsonb)) f) is distinct from (select coalesce(jsonb_agg(f-'label' order by f->>'key'),'[]'::jsonb) from jsonb_array_elements(coalesce(ar.intake_schema->'fields','[]'::jsonb)) f)
    )) then raise exception using errcode='22023',message='catalog_locale_semantics_invalid'; end if;
  if exists(select 1 from app.catalog_service_revisions r where r.id=any(p_service_ids) and (
    char_length(btrim(r.name)) not between 1 and 160 or jsonb_array_length(coalesce(r.intake_schema->'fields','[]'::jsonb))>20
    or exists(select 1 from jsonb_array_elements(coalesce(r.intake_schema->'fields','[]'::jsonb)) f where coalesce(f->>'key','') !~ '^[a-z][a-z0-9_]{0,63}$' or char_length(btrim(coalesce(f->>'label',''))) not between 1 and 500 or jsonb_typeof(f->'required') is distinct from 'boolean' or (f->>'maxLength')::integer not between 1 and 10000)
    or (select count(*) from jsonb_array_elements(coalesce(r.intake_schema->'fields','[]'::jsonb)))<>(select count(distinct f->>'key') from jsonb_array_elements(coalesce(r.intake_schema->'fields','[]'::jsonb)) f)
  )) then raise exception using errcode='22023',message='catalog_intake_invalid'; end if;
  -- Only new edited drafts require the new legal-content floor; retained legacy
  -- offerings remain unchanged until explicitly migrated by their owner.
  if exists(select 1 from app.catalog_service_revisions r join app.catalog_draft_heads h on h.tenant_id=r.tenant_id and h.entity_id=r.service_id and h.state='draft' and h.revision=r.revision where r.id=any(p_service_ids) and (
    r.currency<>'USD' or char_length(coalesce(r.policy->>'consent_version','')) not between 1 and 40 or char_length(btrim(coalesce(r.policy->>'consent_text',''))) not between 1 and 10000 or jsonb_typeof(r.intake_schema->'fields') is distinct from 'array'
  )) then raise exception using errcode='22023',message='catalog_legal_content_required'; end if;
end;
$$;
revoke all on function private.validate_catalog_publication_v1(uuid,uuid[],uuid[],uuid[]) from public,anon,service_role;
grant execute on function private.validate_catalog_publication_v1(uuid,uuid[],uuid[],uuid[]) to authenticated;

-- Harden the historical entry point too: raw calls cannot bypass the complete
-- aggregate validation or turn a scoped content-edit grant into pricing power.
create or replace function api_v1.publish_catalog_v1(
  p_tenant_id uuid, p_publication_id uuid, p_service_revision_ids uuid[],
  p_category_revision_ids uuid[], p_location_revision_ids uuid[]
)
returns table(publication_id uuid, publication_revision bigint, cache_tag text)
language plpgsql security invoker set search_path='' as $function$
declare next_revision bigint;
begin
  if p_tenant_id is null or p_publication_id is null
     or not coalesce((select private.has_direct_capability(p_tenant_id,'catalog.edit')),false) then
    raise exception using errcode='42501', message='catalog_authorization_required';
  end if;
  if not exists(select 1 from app.catalog_publications where tenant_id=p_tenant_id and id=p_publication_id and state='draft') then
    raise exception using errcode='22023', message='catalog_publication_not_draft';
  end if;
  if exists(select 1 from app.catalog_service_revisions where tenant_id=p_tenant_id and id=any(coalesce(p_service_revision_ids,array[]::uuid[])) and state<>'draft')
     or exists(select 1 from app.catalog_location_revisions where tenant_id=p_tenant_id and id=any(coalesce(p_location_revision_ids,array[]::uuid[])) and state<>'draft')
     or exists(select 1 from app.catalog_category_revisions where tenant_id=p_tenant_id and id=any(coalesce(p_category_revision_ids,array[]::uuid[])) and state<>'draft') then
    raise exception using errcode='22023', message='catalog_revision_not_draft';
  end if;
  perform private.validate_catalog_publication_v1(p_tenant_id,p_service_revision_ids,p_category_revision_ids,p_location_revision_ids);
  update app.catalog_service_revisions old set state='retired', published_at=null, publication_id=null
    where old.tenant_id=p_tenant_id and old.state='published' and exists(select 1 from app.catalog_service_revisions next where next.id=any(coalesce(p_service_revision_ids,array[]::uuid[])) and next.tenant_id=old.tenant_id and next.service_id=old.service_id and next.locale=old.locale);
  update app.catalog_location_revisions old set state='retired', published_at=null, publication_id=null
    where old.tenant_id=p_tenant_id and old.state='published' and exists(select 1 from app.catalog_location_revisions next where next.id=any(coalesce(p_location_revision_ids,array[]::uuid[])) and next.tenant_id=old.tenant_id and next.location_id=old.location_id and next.locale=old.locale);
  update app.catalog_category_revisions old set state='retired', published_at=null, publication_id=null
    where old.tenant_id=p_tenant_id and old.state='published' and exists(select 1 from app.catalog_category_revisions next where next.id=any(coalesce(p_category_revision_ids,array[]::uuid[])) and next.tenant_id=old.tenant_id and next.category_id=old.category_id and next.locale=old.locale);
  update app.catalog_service_revisions set state='published', published_at=statement_timestamp(), publication_id=p_publication_id
    where tenant_id=p_tenant_id and id=any(coalesce(p_service_revision_ids,array[]::uuid[]));
  update app.catalog_location_revisions set state='published', published_at=statement_timestamp(), publication_id=p_publication_id
    where tenant_id=p_tenant_id and id=any(coalesce(p_location_revision_ids,array[]::uuid[]));
  update app.catalog_category_revisions set state='published', published_at=statement_timestamp(), publication_id=p_publication_id
    where tenant_id=p_tenant_id and id=any(coalesce(p_category_revision_ids,array[]::uuid[]));
  update app.catalog_publications set state='published', published_at=statement_timestamp(), published_by=(select private.current_auth_user_id())
    where tenant_id=p_tenant_id and id=p_publication_id returning revision into next_revision;
  return query select p_publication_id,next_revision,concat('catalog:',p_tenant_id::text,':',next_revision::text);
end;
$function$;
revoke all on function api_v1.publish_catalog_v1(uuid,uuid,uuid[],uuid[],uuid[]) from public;
grant execute on function api_v1.publish_catalog_v1(uuid,uuid,uuid[],uuid[],uuid[]) to authenticated;

create function api_v1.get_catalog_workspace_v1(p_tenant_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.get_catalog_workspace_v1(p_tenant_id); $$;
create function api_v1.save_catalog_entity_v1(p_tenant_id uuid,p_request_id uuid,p_kind text,p_entity_id uuid,p_expected_revision bigint,p_document jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.save_catalog_entity_v1(p_tenant_id,p_request_id,p_kind,p_entity_id,p_expected_revision,p_document); $$;
create function api_v1.publish_catalog_workspace_v1(p_tenant_id uuid,p_request_id uuid,p_revisions jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.publish_catalog_workspace_v1(p_tenant_id,p_request_id,p_revisions); $$;
revoke all on function private.get_catalog_workspace_v1(uuid),private.save_catalog_entity_v1(uuid,uuid,text,uuid,bigint,jsonb),private.publish_catalog_workspace_v1(uuid,uuid,jsonb),api_v1.get_catalog_workspace_v1(uuid),api_v1.save_catalog_entity_v1(uuid,uuid,text,uuid,bigint,jsonb),api_v1.publish_catalog_workspace_v1(uuid,uuid,jsonb) from public,anon,service_role;
grant execute on function private.get_catalog_workspace_v1(uuid),private.save_catalog_entity_v1(uuid,uuid,text,uuid,bigint,jsonb),private.publish_catalog_workspace_v1(uuid,uuid,jsonb),api_v1.get_catalog_workspace_v1(uuid),api_v1.save_catalog_entity_v1(uuid,uuid,text,uuid,bigint,jsonb),api_v1.publish_catalog_workspace_v1(uuid,uuid,jsonb) to authenticated;
