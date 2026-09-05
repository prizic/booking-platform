-- Issue #7: tenant-scoped catalog authoring and narrow published discovery.
-- Published revisions are immutable and selected by an aggregate publication.

create table app.catalog_publications (
  id uuid not null,
  tenant_id uuid not null references app.tenants (id) on delete restrict,
  revision bigint not null check (revision > 0),
  state text not null default 'draft' check (state in ('draft','published','retired')),
  created_at timestamptz not null default statement_timestamp(),
  published_at timestamptz,
  published_by uuid,
  primary key (id), unique (tenant_id,id), unique (tenant_id,revision),
  check ((state='published' and published_at is not null and published_by is not null) or (state<>'published' and published_at is null))
);
create unique index catalog_one_published on app.catalog_publications(tenant_id) where state='published';

create table app.catalog_categories (
  id uuid not null, tenant_id uuid not null references app.tenants(id) on delete restrict,
  key text not null check (key=lower(key) and key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  sort_order integer not null default 0 check (sort_order>=0), status text not null default 'active' check (status in ('active','retired')),
  created_at timestamptz not null default statement_timestamp(), updated_at timestamptz not null default statement_timestamp(),
  primary key(id), unique(tenant_id,id), unique(tenant_id,key)
);
create table app.catalog_services (
  id uuid not null, tenant_id uuid not null references app.tenants(id) on delete restrict,
  key text not null check (key=lower(key) and key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'), category_id uuid,
  status text not null default 'active' check (status in ('active','retired')), internal_notes text not null default '',
  created_at timestamptz not null default statement_timestamp(), updated_at timestamptz not null default statement_timestamp(),
  primary key(id), unique(tenant_id,id), unique(tenant_id,key),
  foreign key(tenant_id,category_id) references app.catalog_categories(tenant_id,id) on delete restrict
);

create table app.catalog_category_revisions (
  id uuid not null, tenant_id uuid not null, category_id uuid not null, revision bigint not null check(revision>0),
  locale text not null check(locale in ('en','ar')), state text not null check(state in ('draft','published','retired')),
  name text not null check(name=btrim(name) and char_length(name) between 1 and 160), description text not null default '',
  publication_id uuid, created_at timestamptz not null default statement_timestamp(), published_at timestamptz,
  primary key(id), unique(tenant_id,id), unique(tenant_id,category_id,locale,revision),
  foreign key(tenant_id,category_id) references app.catalog_categories(tenant_id,id) on delete restrict,
  foreign key(tenant_id,publication_id) references app.catalog_publications(tenant_id,id) on delete restrict,
  check((state='published' and published_at is not null) or (state<>'published' and published_at is null))
);
create table app.catalog_service_revisions (
  id uuid not null, tenant_id uuid not null, service_id uuid not null, revision bigint not null check(revision>0),
  locale text not null check(locale in ('en','ar')), state text not null check(state in ('draft','published','retired')),
  name text not null check(name=btrim(name) and char_length(name) between 1 and 160), description text not null default '',
  seo_title text not null default '', seo_description text not null default '', canonical_path text not null check(canonical_path ~ '^/[a-z0-9][a-z0-9/-]*$'), og_image_path text,
  duration_minutes integer not null check(duration_minutes between 1 and 1440), buffer_before_minutes integer not null default 0 check(buffer_before_minutes between 0 and 1440), buffer_after_minutes integer not null default 0 check(buffer_after_minutes between 0 and 1440),
  price_minor bigint not null check(price_minor>=0), tax_rate_bps integer not null default 0 check(tax_rate_bps between 0 and 3000), currency text not null check(currency ~ '^[A-Z]{3}$'),
  capacity_mode text not null default 'exclusive' check(capacity_mode in ('exclusive','group')), booking_mode text not null default 'appointment' check(booking_mode in ('appointment','exclusive_resource')),
  approval_required boolean not null default false, payment_mode text not null default 'none' check(payment_mode in ('none','deposit','full')),
  intake_schema jsonb not null default '{"fields":[]}'::jsonb, policy jsonb not null default '{}'::jsonb, publication_id uuid,
  created_at timestamptz not null default statement_timestamp(), published_at timestamptz,
  primary key(id), unique(tenant_id,id), unique(tenant_id,service_id,locale,revision),
  foreign key(tenant_id,service_id) references app.catalog_services(tenant_id,id) on delete restrict,
  foreign key(tenant_id,publication_id) references app.catalog_publications(tenant_id,id) on delete restrict,
  check((state='published' and published_at is not null) or (state<>'published' and published_at is null)),
  check(jsonb_typeof(intake_schema)='object' and intake_schema ? 'fields'), check(jsonb_typeof(policy)='object')
);
create table app.catalog_location_revisions (
  id uuid not null, tenant_id uuid not null, location_id uuid not null, revision bigint not null check(revision>0),
  locale text not null check(locale in ('en','ar')), state text not null check(state in ('draft','published','retired')),
  name text not null check(name=btrim(name) and char_length(name) between 1 and 160), description text not null default '', address text not null default '',
  canonical_path text not null check(canonical_path ~ '^/[a-z0-9][a-z0-9/-]*$'), og_image_path text, publication_id uuid,
  created_at timestamptz not null default statement_timestamp(), published_at timestamptz,
  primary key(id), unique(tenant_id,id), unique(tenant_id,location_id,locale,revision),
  foreign key(tenant_id,location_id) references app.locations(tenant_id,id) on delete restrict,
  foreign key(tenant_id,publication_id) references app.catalog_publications(tenant_id,id) on delete restrict,
  check((state='published' and published_at is not null) or (state<>'published' and published_at is null))
);
create table app.catalog_service_locations (
  tenant_id uuid not null, service_id uuid not null, location_id uuid not null, created_at timestamptz not null default statement_timestamp(),
  primary key(tenant_id,service_id,location_id),
  foreign key(tenant_id,service_id) references app.catalog_services(tenant_id,id) on delete cascade,
  foreign key(tenant_id,location_id) references app.locations(tenant_id,id) on delete cascade
);
alter table app.catalog_service_locations enable row level security;
create unique index catalog_one_published_service on app.catalog_service_revisions(tenant_id,service_id,locale) where state='published';
create unique index catalog_one_published_category on app.catalog_category_revisions(tenant_id,category_id,locale) where state='published';
create unique index catalog_one_published_location on app.catalog_location_revisions(tenant_id,location_id,locale) where state='published';
create index catalog_service_public_idx on app.catalog_service_revisions(tenant_id,locale,publication_id) where state='published';

create or replace function private.can_manage_catalog(p_tenant_id uuid, p_location_id uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from app.memberships m join app.role_permissions rp on rp.tenant_id=m.tenant_id and rp.role_id=m.role_id
    where m.tenant_id=p_tenant_id and m.auth_user_id=(select private.current_auth_user_id()) and m.status='active' and rp.permission_key='catalog.edit'
      and (rp.grant_kind='direct' or (rp.grant_kind='approval' and (select private.is_aal2())))
      and (rp.scope_kind='tenant' or (p_location_id is not null and (select private.can_access_location(p_tenant_id,p_location_id)))));
$$;
revoke execute on function private.can_manage_catalog(uuid,uuid) from public;
grant execute on function private.can_manage_catalog(uuid,uuid) to authenticated;

do $rls$
declare t text;
begin
  foreach t in array array['catalog_publications','catalog_categories','catalog_category_revisions','catalog_services','catalog_service_revisions','catalog_location_revisions'] loop
    execute format('alter table app.%I enable row level security',t);
    if t in ('catalog_publications','catalog_category_revisions','catalog_service_revisions','catalog_location_revisions') then
      execute format('create policy %I on app.%I for select to anon,authenticated using ((select private.is_public_tenant_context(tenant_id)) and state=''published'')',t,t);
    elsif t = 'catalog_categories' then
      execute format('create policy %I on app.%I for select to anon,authenticated using ((select private.is_public_tenant_context(tenant_id)) and status=''active'')',t,t);
    else
      execute format('create policy %I on app.%I for select to anon,authenticated using ((select private.is_public_tenant_context(tenant_id)) and status=''active'')',t,t);
    end if;
    execute format('create policy %I on app.%I for select to authenticated using ((select private.can_manage_catalog(tenant_id,null)))',t||'_member',t);
    execute format('create policy %I on app.%I for insert to authenticated with check ((select private.can_manage_catalog(tenant_id,null)))',t||'_insert',t);
    execute format('create policy %I on app.%I for update to authenticated using ((select private.can_manage_catalog(tenant_id,null))) with check ((select private.can_manage_catalog(tenant_id,null)))',t||'_update',t);
    execute format('create policy %I on app.%I for delete to authenticated using ((select private.can_manage_catalog(tenant_id,null)))',t||'_delete',t);
  end loop;
end;
$rls$;
create policy catalog_service_locations_public on app.catalog_service_locations for select to anon,authenticated using ((select private.is_public_tenant_context(catalog_service_locations.tenant_id)) and exists(select 1 from app.catalog_service_revisions r where r.tenant_id=catalog_service_locations.tenant_id and r.service_id=catalog_service_locations.service_id and r.state='published'));
create policy catalog_service_locations_member on app.catalog_service_locations for select to authenticated using ((select private.is_active_tenant_member(tenant_id)));
create policy catalog_service_locations_insert on app.catalog_service_locations for insert to authenticated with check ((select private.can_manage_catalog(tenant_id,location_id)));
create policy catalog_service_locations_update on app.catalog_service_locations for update to authenticated using ((select private.can_manage_catalog(tenant_id,location_id))) with check ((select private.can_manage_catalog(tenant_id,location_id)));
create policy catalog_service_locations_delete on app.catalog_service_locations for delete to authenticated using ((select private.can_manage_catalog(tenant_id,location_id)));

revoke all on app.catalog_publications, app.catalog_categories,
  app.catalog_category_revisions, app.catalog_services,
  app.catalog_service_revisions, app.catalog_location_revisions,
  app.catalog_service_locations from anon,authenticated;
grant usage on schema app to anon,authenticated;
grant select on app.catalog_publications,app.catalog_categories,app.catalog_category_revisions,app.catalog_services,app.catalog_service_revisions,app.catalog_location_revisions,app.catalog_service_locations to anon,authenticated;
grant insert,update,delete on app.catalog_publications,app.catalog_categories,app.catalog_category_revisions,app.catalog_services,app.catalog_service_revisions,app.catalog_location_revisions,app.catalog_service_locations to authenticated;

create or replace function api_v1.get_public_catalog_v1(p_hostname text, p_locale text default 'en', p_service_key text default null)
returns table(tenant_id uuid,publication_id uuid,publication_revision bigint,locale text,service_id uuid,service_key text,category_key text,service_name text,service_description text,canonical_path text,og_image_path text,duration_minutes integer,buffer_before_minutes integer,buffer_after_minutes integer,price_minor bigint,tax_rate_bps integer,currency text,capacity_mode text,booking_mode text,approval_required boolean,payment_mode text,location_id uuid,location_key text,location_name text,location_description text,location_address text,location_time_zone text,location_canonical_path text,cache_tag text)
language sql stable security invoker set search_path='' as $$
  select t.id,p.id,p.revision,sr.locale,s.id,s.key,c.key,sr.name,sr.description,sr.canonical_path,sr.og_image_path,sr.duration_minutes,sr.buffer_before_minutes,sr.buffer_after_minutes,sr.price_minor,sr.tax_rate_bps,sr.currency,sr.capacity_mode,sr.booking_mode,sr.approval_required,sr.payment_mode,l.id,l.key,lr.name,lr.description,lr.address,l.time_zone,lr.canonical_path,concat('catalog:',t.id::text,':',p.revision::text,':',sr.locale)
  from app.tenant_domains d join app.instances i on i.tenant_id=d.tenant_id and i.id=d.instance_id join app.tenants t on t.id=d.tenant_id
  join app.catalog_publications p on p.tenant_id=t.id and p.state='published' join app.catalog_services s on s.tenant_id=t.id and s.status='active'
  join app.catalog_service_revisions sr on sr.tenant_id=s.tenant_id and sr.service_id=s.id and sr.publication_id=p.id and sr.locale=p_locale and sr.state='published'
  left join app.catalog_categories c on c.tenant_id=s.tenant_id and c.id=s.category_id join app.catalog_service_locations sl on sl.tenant_id=s.tenant_id and sl.service_id=s.id
  join app.locations l on l.tenant_id=sl.tenant_id and l.id=sl.location_id and l.status='active'
  join app.catalog_location_revisions lr on lr.tenant_id=l.tenant_id and lr.location_id=l.id and lr.publication_id=p.id and lr.locale=sr.locale and lr.state='published'
  where d.hostname=lower(btrim(p_hostname)) and d.application='client' and d.kind='production' and d.verification_status='verified' and d.active and t.status='active' and i.deployment_state='active' and p_locale in ('en','ar') and (p_service_key is null or s.key=p_service_key)
  order by sr.name,l.key;
$$;
revoke all on function api_v1.get_public_catalog_v1(text,text,text) from public;
grant execute on function api_v1.get_public_catalog_v1(text,text,text) to anon,authenticated;
comment on function api_v1.get_public_catalog_v1(text,text,text) is 'Narrow published catalog DTO; excludes internal notes, intake answers, authorization, and unpublished revisions.';

create or replace function api_v1.publish_catalog_v1(
  p_tenant_id uuid, p_publication_id uuid, p_service_revision_ids uuid[],
  p_category_revision_ids uuid[], p_location_revision_ids uuid[]
)
returns table(publication_id uuid, publication_revision bigint, cache_tag text)
language plpgsql security invoker set search_path='' as $function$
declare next_revision bigint;
begin
  if p_tenant_id is null or p_publication_id is null
     or not coalesce((select private.can_manage_catalog(p_tenant_id,null)),false) then
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
