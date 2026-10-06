-- Compare content hashes because editing a draft does not increment its number.
create or replace function private.get_brand_editor_v1(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_row record;
begin
 if not coalesce(private.can_decide_booking(p_tenant_id,null,'brand.manage'),false) then raise exception using errcode='42501',message='policy_denied'; end if;
 select b.key,r.* into v_row from app.brands b join app.brand_revisions r on r.tenant_id=b.tenant_id and r.brand_id=b.id where b.tenant_id=p_tenant_id and r.state in ('draft','published') order by (r.state='draft') desc,r.created_at desc,r.id desc limit 1;
 if not found then return null; end if;
 return jsonb_build_object('brandKey',v_row.key,'revisionId',v_row.id,'revision',v_row.revision,'state',v_row.state,'contentHash',v_row.content_hash,'config',v_row.config,'content',v_row.content,'published', (select jsonb_build_object('config',r.config,'content',r.content) from app.brand_revisions r where r.tenant_id=p_tenant_id and r.brand_id=v_row.brand_id and r.state='published' limit 1));
end; $$;
revoke all on function private.get_brand_editor_v1(uuid) from public,anon;
grant execute on function private.get_brand_editor_v1(uuid) to authenticated;
create or replace function api_v1.get_brand_editor_v1(p_tenant_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_brand_editor_v1(p_tenant_id); $$;
revoke all on function api_v1.get_brand_editor_v1(uuid) from public,anon;
grant execute on function api_v1.get_brand_editor_v1(uuid) to authenticated;
create or replace function private.save_brand_editor_v1(p_tenant_id uuid,p_brand_key text,p_expected_hash text,p_config jsonb,p_content jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_current jsonb;v_result record;
begin
 perform 1 from app.tenants where id=p_tenant_id and status='active' for update;
 if not found then raise exception using errcode='42501',message='policy_denied';end if;
 v_current:=private.get_brand_editor_v1(p_tenant_id);
 if v_current->>'contentHash' is distinct from p_expected_hash or (v_current is not null and v_current->>'brandKey' is distinct from p_brand_key) then raise exception using errcode='23505',message='revision_conflict'; end if;
 select * into v_result from private.save_brand_draft_v1(p_tenant_id,p_brand_key,p_config,p_content,null,null);
 return jsonb_build_object('revisionId',v_result.brand_revision_id,'revision',v_result.revision,'contentHash',v_result.content_hash);
end; $$;
revoke all on function private.save_brand_editor_v1(uuid,text,text,jsonb,jsonb) from public,anon;
grant execute on function private.save_brand_editor_v1(uuid,text,text,jsonb,jsonb) to authenticated;
create or replace function api_v1.save_brand_editor_v1(p_tenant_id uuid,p_brand_key text,p_expected_hash text,p_config jsonb,p_content jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.save_brand_editor_v1(p_tenant_id,p_brand_key,p_expected_hash,p_config,p_content); $$;
revoke all on function api_v1.save_brand_editor_v1(uuid,text,text,jsonb,jsonb) from public,anon;
grant execute on function api_v1.save_brand_editor_v1(uuid,text,text,jsonb,jsonb) to authenticated;
