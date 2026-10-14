-- Additive site content on the existing immutable brand revision. No draft or
-- arbitrary JSON may cross the public read boundary.
create or replace function private.brand_https_url_is_safe_v1(p_url text)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare v_port text[];
begin
  if not coalesce(char_length(p_url) between 9 and 2048
    and p_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:]<>\\]*)?$'
    and p_url !~ '[[:cntrl:]]',false) then return false; end if;
  v_port:=regexp_match(p_url,'^https://[^/:?#]+:([0-9]+)');
  if v_port is not null and v_port[1]::integer>65535 then return false; end if;
  return true;
end;
$$;

create or replace function private.brand_localized_text_is_valid_v1(p_text jsonb, p_max integer)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select coalesce(jsonb_typeof(p_text)='object'
    and jsonb_typeof(p_text->'en')='string' and jsonb_typeof(p_text->'ar')='string'
    and char_length(btrim(p_text->>'en')) between 1 and p_max
    and char_length(btrim(p_text->>'ar')) between 1 and p_max
    and private.brand_document_is_safe_v1(p_text),false);
$$;

create or replace function private.brand_site_content_is_valid_v1(p_content jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare v_key text; v_group text; v_value jsonb;
begin
  if p_content is null or jsonb_typeof(p_content)<>'object'
     or not private.brand_document_is_safe_v1(p_content) then return false; end if;
  -- Only optional additive fields are constrained. Legacy unrelated safe copy
  -- remains stored, but does not become part of the new public projection.
  foreach v_group in array array['contact','about','appStores'] loop
    if p_content ? v_group and jsonb_typeof(p_content->v_group)<>'object' then return false; end if;
  end loop;
  if p_content->'contact' ? 'email' and (jsonb_typeof(p_content->'contact'->'email')<>'string'
    or char_length(p_content->'contact'->>'email') not between 3 and 320
    or (p_content->'contact'->>'email') !~ '^[^[:space:]@<>"'']+@[^[:space:]@<>"'']+\.[^[:space:]@<>"'']+$') then return false; end if;
  foreach v_key in array array['phone','whatsapp'] loop
    v_value := p_content->'contact'->v_key;
    if v_value is not null and (jsonb_typeof(v_value)<>'string'
      or (v_value #>> '{}') !~ '^\+[1-9][0-9]{6,14}$') then return false; end if;
  end loop;
  foreach v_key in array array['experience','whyChooseUs','address'] loop
    if p_content->'about' ? v_key and not private.brand_localized_text_is_valid_v1(
      p_content->'about'->v_key,case when v_key='address' then 1000 else 4000 end) then return false; end if;
  end loop;
  if p_content->'about' ? 'mapUrl' and (jsonb_typeof(p_content->'about'->'mapUrl')<>'string'
    or not private.brand_https_url_is_safe_v1(p_content->'about'->>'mapUrl')) then return false; end if;
  foreach v_key in array array['appStoreUrl','googlePlayUrl'] loop
    if p_content->'appStores' ? v_key and (jsonb_typeof(p_content->'appStores'->v_key)<>'string'
      or not private.brand_https_url_is_safe_v1(p_content->'appStores'->>v_key)) then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function private.validate_brand_site_content_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.brand_site_content_is_valid_v1(new.content) then
    raise exception using errcode='22023',message='brand_invalid_content';
  end if;
  return new;
end;
$$;
-- Validate inserts/edits and publication, including older drafts authored by
-- N-1. Existing published rows are not rewritten or invalidated by a migration.
create trigger brand_revisions_site_content_valid
  before insert or update of content,state on app.brand_revisions
  for each row execute function private.validate_brand_site_content_v1();

create or replace function private.public_brand_site_content_v1(p_content jsonb)
returns jsonb language plpgsql immutable security invoker set search_path = '' as $$
declare v_result jsonb := '{}'; v_group text; v_keys text[]; v_value jsonb; v_key text;
begin
  if private.brand_localized_text_is_valid_v1(p_content->'title',160) then
    v_result := jsonb_build_object('title',jsonb_build_object('en',p_content->'title'->>'en','ar',p_content->'title'->>'ar'));
  end if;
  foreach v_group in array array['contact','about','appStores','legal'] loop
    v_keys := case v_group when 'contact' then array['email','phone','whatsapp']
      when 'about' then array['experience','whyChooseUs','address','mapUrl']
      when 'appStores' then array['appStoreUrl','googlePlayUrl'] else array['privacyUrl','termsUrl'] end;
    v_value := '{}';
    foreach v_key in array v_keys loop
      if v_group='about' and v_key<>'mapUrl' then
        if private.brand_localized_text_is_valid_v1(p_content->v_group->v_key,
          case when v_key='address' then 1000 else 4000 end) then
          v_value := v_value || jsonb_build_object(v_key,jsonb_build_object(
            'en',p_content->v_group->v_key->>'en','ar',p_content->v_group->v_key->>'ar'));
        end if;
      elsif v_group in ('legal','appStores') or v_key='mapUrl' then
        if private.brand_https_url_is_safe_v1(p_content->v_group->>v_key) then
          v_value := v_value || jsonb_build_object(v_key,p_content->v_group->>v_key);
        end if;
      elsif jsonb_typeof(p_content->v_group->v_key)='string'
        and private.brand_site_content_is_valid_v1(jsonb_build_object('contact',jsonb_build_object(v_key,p_content->v_group->v_key))) then
        v_value := v_value || jsonb_build_object(v_key,p_content->v_group->v_key);
      end if;
    end loop;
    if v_value<>'{}'::jsonb then v_result := v_result || jsonb_build_object(v_group,v_value); end if;
  end loop;
  return v_result;
end;
$$;

create or replace function private.get_published_brand_v1(p_hostname text,p_application text)
returns table(contract_version integer,brand_revision_id uuid,revision bigint,
  config jsonb,content jsonb,cache_tag text,published_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_route record;
begin
  select * into v_route from api_v1.resolve_public_tenant_v1(p_hostname,p_application);
  if v_route.tenant_id is null then raise exception using errcode='42501',message='booking_context_required'; end if;
  return query select 1,r.id,r.revision,r.config,private.public_brand_site_content_v1(r.content),
    concat('brand:',r.tenant_id::text,':',r.revision::text),r.published_at
  from app.brand_revisions r
  where r.tenant_id=v_route.tenant_id and r.brand_id=v_route.brand_id and r.state='published'
  order by r.published_at desc limit 1;
end;
$$;

revoke all on function private.brand_https_url_is_safe_v1(text),
  private.brand_localized_text_is_valid_v1(jsonb,integer),private.brand_site_content_is_valid_v1(jsonb),
  private.validate_brand_site_content_v1(),private.public_brand_site_content_v1(jsonb)
from public,anon,authenticated;
-- These validators are callable by authorized authors, never table readers.
grant execute on function private.brand_https_url_is_safe_v1(text),
  private.brand_localized_text_is_valid_v1(jsonb,integer),private.brand_site_content_is_valid_v1(jsonb)
to authenticated;
