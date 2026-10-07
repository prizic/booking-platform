create table app.integration_events (
 id uuid primary key default pg_catalog.gen_random_uuid(), tenant_id uuid not null references app.tenants(id), actor_auth_user_id uuid not null, request_id uuid not null, action text not null check(action in ('onboarding_authorized','onboarding_link_created','onboarding_provider_failed')),target_id uuid not null,created_at timestamptz not null default statement_timestamp(),unique(tenant_id,request_id,action)
);
alter table app.integration_events enable row level security;
create policy integration_events_read on app.integration_events for select to authenticated using(private.has_direct_capability(tenant_id,'audit.read'));
revoke all on app.integration_events from public,anon,authenticated;
grant select on app.integration_events to authenticated;
create trigger integration_events_append_only before update or delete on app.integration_events for each row execute function private.enforce_append_only();
create table private.payment_onboarding_intents (
 id uuid primary key,tenant_id uuid not null references app.tenants(id),actor_auth_user_id uuid not null,request_id uuid not null,request_hash text not null,payment_account_id uuid not null,dashboard_hostname text not null,locale text not null check(locale in ('en','ar')),expires_at timestamptz not null,state text not null default 'authorized' check(state in ('authorized','completed','failed')),unique(tenant_id,request_id),foreign key(tenant_id,payment_account_id) references app.payment_accounts(tenant_id,id)
);
alter table private.payment_onboarding_intents enable row level security;
revoke all on private.payment_onboarding_intents from public,anon,authenticated,service_role;
create or replace function private.authorize_payment_onboarding_v1(p_tenant_id uuid,p_hostname text,p_locale text,p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_account app.payment_accounts%rowtype;v_prior private.payment_onboarding_intents%rowtype;v_hash text;v_id uuid;
begin
 perform 1 from app.tenants where id=p_tenant_id and status='active' for update;
 if not found or not coalesce(private.has_direct_capability(p_tenant_id,'integration.manage'),false) or not coalesce(private.dashboard_recent_aal2(),false) then raise exception using errcode='42501',message='integration_step_up_required';end if;
 if p_locale not in ('en','ar') or p_request_id is null or not exists(select 1 from app.tenant_domains d join app.instances i on i.tenant_id=d.tenant_id and i.id=d.instance_id where d.tenant_id=p_tenant_id and d.hostname=p_hostname and d.application='dashboard' and d.active and d.verification_status='verified' and d.kind='production' and i.deployment_state='active') then raise exception using errcode='22023',message='integration_return_invalid';end if;
 select * into v_account from app.payment_accounts a where a.tenant_id=p_tenant_id and a.provider='stripe' and a.status not in ('suspended','disconnected') for update;
 if not found then raise exception using errcode='22023',message='integration_account_unavailable';end if;
 v_hash:=encode(extensions.digest(jsonb_build_object('actor',private.current_auth_user_id(),'account',v_account.id,'host',p_hostname,'locale',p_locale)::text,'sha256'),'hex');
 select * into v_prior from private.payment_onboarding_intents where tenant_id=p_tenant_id and request_id=p_request_id;
 if found then
  if v_prior.request_hash is distinct from v_hash or v_prior.actor_auth_user_id is distinct from private.current_auth_user_id() then raise exception using errcode='22023',message='idempotency_conflict';end if;
  if v_prior.expires_at<=statement_timestamp() then raise exception using errcode='22023',message='integration_attempt_expired';end if;
  return v_prior.id;
 end if;
 v_id:=pg_catalog.gen_random_uuid();insert into private.payment_onboarding_intents(id,tenant_id,actor_auth_user_id,request_id,request_hash,payment_account_id,dashboard_hostname,locale,expires_at) values(v_id,p_tenant_id,private.current_auth_user_id(),p_request_id,v_hash,v_account.id,p_hostname,p_locale,statement_timestamp()+interval '5 minutes');
 insert into app.integration_events(tenant_id,actor_auth_user_id,request_id,action,target_id) values(p_tenant_id,private.current_auth_user_id(),p_request_id,'onboarding_authorized',v_account.id);
 return v_id;
end; $$;
revoke all on function private.authorize_payment_onboarding_v1(uuid,text,text,uuid) from public,anon;
grant execute on function private.authorize_payment_onboarding_v1(uuid,text,text,uuid) to authenticated;
create or replace function api_v1.authorize_payment_onboarding_v1(p_tenant_id uuid,p_hostname text,p_locale text,p_request_id uuid)
returns uuid language sql security invoker set search_path='' as $$select private.authorize_payment_onboarding_v1(p_tenant_id,p_hostname,p_locale,p_request_id);$$;
revoke all on function api_v1.authorize_payment_onboarding_v1(uuid,text,text,uuid) from public,anon;
grant execute on function api_v1.authorize_payment_onboarding_v1(uuid,text,text,uuid) to authenticated;
create or replace function private.get_payment_onboarding_intent_v1(p_intent_id uuid)
returns table(account_reference text,return_url text,refresh_url text,idempotency_key text) language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='worker_not_authorized';end if;
 return query select a.provider_account_reference,'https://'||i.dashboard_hostname||'/'||i.locale||'/integrations?onboarding=return','https://'||i.dashboard_hostname||'/'||i.locale||'/integrations?onboarding=refresh','onboarding:'||i.id::text from private.payment_onboarding_intents i join app.payment_accounts a on a.tenant_id=i.tenant_id and a.id=i.payment_account_id where i.id=p_intent_id and exists(select 1 from app.tenants t where t.id=i.tenant_id and t.status='active') and i.expires_at>statement_timestamp() and a.status not in ('suspended','disconnected') and exists(select 1 from app.memberships m join app.role_permissions rp on rp.tenant_id=m.tenant_id and rp.role_id=m.role_id where m.tenant_id=i.tenant_id and m.auth_user_id=i.actor_auth_user_id and m.status='active' and rp.permission_key='integration.manage' and rp.grant_kind='direct' and rp.scope_kind='tenant') and exists(select 1 from app.tenant_domains d join app.instances inst on inst.tenant_id=d.tenant_id and inst.id=d.instance_id where inst.deployment_state='active' and d.kind='production' and d.tenant_id=i.tenant_id and d.hostname=i.dashboard_hostname and d.application='dashboard' and d.active and d.verification_status='verified');
end; $$;
create or replace function private.complete_payment_onboarding_intent_v1(p_intent_id uuid,p_succeeded boolean)
returns void language plpgsql security definer set search_path='' as $$
declare i private.payment_onboarding_intents%rowtype;
begin
 if auth.role() is distinct from 'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='worker_not_authorized';end if;
 select * into i from private.payment_onboarding_intents where id=p_intent_id for update;if not found then raise exception using errcode='22023',message='integration_attempt_invalid';end if;
 update private.payment_onboarding_intents set state=case when p_succeeded then 'completed' else 'failed' end where id=i.id;
 insert into app.integration_events(tenant_id,actor_auth_user_id,request_id,action,target_id) values(i.tenant_id,i.actor_auth_user_id,i.request_id,case when p_succeeded then 'onboarding_link_created' else 'onboarding_provider_failed' end,i.payment_account_id) on conflict do nothing;
end;$$;
create or replace function api_v1.get_payment_onboarding_intent_v1(p_intent_id uuid)
returns table(account_reference text,return_url text,refresh_url text,idempotency_key text) language sql security invoker set search_path='' as $$select * from private.get_payment_onboarding_intent_v1(p_intent_id);$$;
create or replace function api_v1.complete_payment_onboarding_intent_v1(p_intent_id uuid,p_succeeded boolean)
returns void language sql security invoker set search_path='' as $$select private.complete_payment_onboarding_intent_v1(p_intent_id,p_succeeded);$$;
revoke all on function private.get_payment_onboarding_intent_v1(uuid),private.complete_payment_onboarding_intent_v1(uuid,boolean),api_v1.get_payment_onboarding_intent_v1(uuid),api_v1.complete_payment_onboarding_intent_v1(uuid,boolean) from public,anon,authenticated;
grant execute on function private.get_payment_onboarding_intent_v1(uuid),private.complete_payment_onboarding_intent_v1(uuid,boolean),api_v1.get_payment_onboarding_intent_v1(uuid),api_v1.complete_payment_onboarding_intent_v1(uuid,boolean) to service_role;
