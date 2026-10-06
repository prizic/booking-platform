-- Safe related-record identity; both joins inherit the actual caller's RLS.
create or replace function api_v1.get_booking_customer_v1(p_tenant_id uuid,p_booking_id uuid)
returns uuid language sql stable security invoker set search_path='' as $$
  select c.id from app.bookings b
  join app.booking_contacts bc on bc.tenant_id=b.tenant_id and bc.booking_id=b.id
  join app.customers c on c.tenant_id=bc.tenant_id and c.id=bc.customer_id
  where b.tenant_id=p_tenant_id and b.id=p_booking_id;
$$;
revoke all on function api_v1.get_booking_customer_v1(uuid,uuid) from public,anon;
grant execute on function api_v1.get_booking_customer_v1(uuid,uuid) to authenticated;

-- Publication validation is enforced even when a caller skips the Dashboard.
create or replace function private.brand_luminance_v1(p_hex text)
returns double precision language plpgsql immutable security invoker set search_path='' as $$
declare v bytea; c double precision; result double precision:=0; i integer;
begin
  if p_hex is null or p_hex !~ '^#[0-9A-Fa-f]{6}$' then raise exception using errcode='22023',message='brand_not_publishable'; end if;
  v:=decode(substr(p_hex,2),'hex');
  for i in 0..2 loop
    c:=get_byte(v,i)/255.0;
    c:=case when c<=0.04045 then c/12.92 else power((c+0.055)/1.055,2.4) end;
    result:=result+c*(case i when 0 then 0.2126 when 1 then 0.7152 else 0.0722 end);
  end loop;
  return result;
end; $$;
revoke all on function private.brand_luminance_v1(text) from public,anon,authenticated;

create or replace function private.validate_brand_publication_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare colors jsonb; pair record; a double precision; b double precision; k text; v text;
begin
  if new.state<>'published' then return new; end if;
  -- Privileged provisioning creates a bootstrap revision before memberships exist.
  -- Tenant publish/rollback RPCs always attribute the actual active membership.
  if new.published_by_membership_id is null and current_setting('role',true) not in ('authenticated','anon') then return new; end if;
  if coalesce(btrim(new.config->>'name'),'')='' or
    coalesce(btrim(new.content#>>'{title,en}'),'')='' or coalesce(btrim(new.content#>>'{title,ar}'),'')='' or
    coalesce(new.content#>>'{contact,email}','') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception using errcode='42501',message='brand_not_publishable';
  end if;
  foreach k in array array['privacyUrl','termsUrl'] loop
    v:=new.content#>>array['legal',k];
    if v is null or v !~ '^https://[^/@[:space:]?#]+(:[0-9]+)?(/|$)' or length(v)>2048 then
      raise exception using errcode='42501',message='brand_not_publishable';
    end if;
  end loop;
  if not private.brand_document_is_safe_v1(new.config) or not private.brand_document_is_safe_v1(new.content) then
    raise exception using errcode='42501',message='brand_unsafe_content';
  end if;
  colors:=new.config#>'{tokens,color}';
  for pair in select * from (values
    ('text','background',4.5),('text','surface',4.5),('muted','background',4.5),('muted','surface',4.5),
    ('onPrimary','primary',4.5),('onSuccess','success',4.5),('onWarning','warning',4.5),('onDanger','danger',4.5),
    ('success','background',4.5),('success','surface',4.5),('warning','background',4.5),('warning','surface',4.5),
    ('danger','background',4.5),('danger','surface',4.5),('border','background',3.0),('border','surface',3.0),('focus','background',3.0),('focus','surface',3.0)
  ) p(fg,bg,minimum) loop
    a:=private.brand_luminance_v1(colors->>pair.fg); b:=private.brand_luminance_v1(colors->>pair.bg);
    if (greatest(a,b)+0.05)/(least(a,b)+0.05)<pair.minimum then
      raise exception using errcode='42501',message='brand_not_publishable';
    end if;
  end loop;
  for k,v in select key,value from jsonb_each_text(new.config->'assets') loop
    if k not in ('logoLight','logoDark','icon','favicon','socialImage') or
      v !~ '^/assets/[A-Za-z0-9][A-Za-z0-9._/-]*\.(png|webp|jpg|jpeg|avif)$' or v like '%..%' then
      raise exception using errcode='42501',message='brand_not_publishable';
    end if;
  end loop;
  foreach k in array array['logoLight','icon','favicon','socialImage'] loop
    if new.config#>>array['assets',k] is null then raise exception using errcode='42501',message='brand_not_publishable'; end if;
  end loop;
  return new;
end; $$;
revoke all on function private.validate_brand_publication_v1() from public,anon,authenticated;
create trigger validate_brand_publication before insert or update of state,config,content on app.brand_revisions
for each row execute function private.validate_brand_publication_v1();

create or replace function private.sync_published_brand_pointer_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.state='published' then
    update app.instances set published_brand_revision_id=new.id
    where tenant_id=new.tenant_id and brand_id=new.brand_id and deployment_state='active';
  end if;
  return new;
end; $$;
revoke all on function private.sync_published_brand_pointer_v1() from public,anon,authenticated;
create trigger sync_published_brand_pointer after insert or update of state on app.brand_revisions
for each row execute function private.sync_published_brand_pointer_v1();

create policy catalog_draft_heads_deny_select on app.catalog_draft_heads for select to anon,authenticated using(false);
create policy catalog_draft_heads_deny_insert on app.catalog_draft_heads for insert to anon,authenticated with check(false);
create policy catalog_draft_heads_deny_update on app.catalog_draft_heads for update to anon,authenticated using(false) with check(false);
create policy catalog_draft_heads_deny_delete on app.catalog_draft_heads for delete to anon,authenticated using(false);
create policy catalog_authoring_events_deny_insert on app.catalog_authoring_events for insert to anon,authenticated with check(false);
create policy catalog_authoring_events_deny_update on app.catalog_authoring_events for update to anon,authenticated using(false) with check(false);
create policy catalog_authoring_events_deny_delete on app.catalog_authoring_events for delete to anon,authenticated using(false);
create policy staff_access_events_deny_insert on app.staff_access_events for insert to anon,authenticated with check(false);
create policy staff_access_events_deny_update on app.staff_access_events for update to anon,authenticated using(false) with check(false);
create policy staff_access_events_deny_delete on app.staff_access_events for delete to anon,authenticated using(false);
create policy integration_events_deny_insert on app.integration_events for insert to anon,authenticated with check(false);
create policy integration_events_deny_update on app.integration_events for update to anon,authenticated using(false) with check(false);
create policy integration_events_deny_delete on app.integration_events for delete to anon,authenticated using(false);
