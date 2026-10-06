begin;
select no_plan();

do $$ begin
  execute format('grant usage on schema %I to authenticated',pg_my_temp_schema()::regnamespace::text);
end $$;

-- A real auth user, so MFA-factor and email lookups behave as in production.
create function pg_temp.user(p_id uuid, p_email text) returns uuid
language sql as $$
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,
    email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values ('00000000-0000-0000-0000-000000000000',p_id,'authenticated','authenticated',
    p_email,'',now(),'{}','{}',now(),now())
  on conflict (id) do nothing;
  select p_id;
$$;

create function pg_temp.verified_factor(p_user uuid) returns void
language sql as $$
  insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at)
  values (gen_random_uuid(),p_user,'test-'||gen_random_uuid(),'totp','verified',now(),now());
$$;

-- Lists the user, then becomes them with aal2 and a TOTP verification p_age seconds ago.
create function pg_temp.as_operator(p_user uuid, p_role text, p_age integer default 60) returns void
language plpgsql as $$
begin
  perform pg_temp.user(p_user, 'op-'||p_user::text||'@example.invalid');
  insert into control_plane.operators(auth_user_id,email,role,expires_at)
  values (p_user,'op-'||p_user::text||'@example.invalid',p_role,
    case when p_role='break_glass' then now()+interval '1 hour' end)
  on conflict (auth_user_id) do update
    set role=excluded.role, expires_at=excluded.expires_at, disabled_at=null;
  perform pg_temp.claims(p_user,'aal2',p_age);
end $$;

create function pg_temp.claims(p_user uuid, p_aal text, p_age integer default 60) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub',p_user,'role','authenticated','aal',p_aal,
    'amr',jsonb_build_array(jsonb_build_object('method','totp',
      'timestamp',extract(epoch from statement_timestamp())::bigint - p_age)))::text, true);
$$;

create function pg_temp.as_worker() returns void
language sql as $$ select set_config('request.jwt.claims',null,true); $$;

select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin',30);
select set_config('test.t',(select tenant_id::text from control_plane.create_tenant_v2('Plan Tenant','plan-tenant','plan-tenant-create-01')),true);

set local role authenticated;
-- Plans
select throws_ok($$ select * from api_v1.save_plan_v1('studio','Studio',array['booking.online'],true,true,'x') $$,
  '22023','reason_required','commercial plan edits need a reviewable reason');
select throws_ok($$ select * from api_v1.save_plan_v1('Bad Key','Bad',array['booking.online'],true,true,'Reviewed plan change') $$,
  '22023','plan_invalid','a malformed key is refused');
select throws_ok($$ select * from api_v1.save_plan_v1('studio','Studio',array['NOT VALID'],true,true,'Reviewed plan change') $$,
  '22023','entitlement_invalid','a malformed feature key is refused');
select is((select key from api_v1.save_plan_v1('studio','Studio',array['booking.online','reports.operational','booking.online'],true,true,'Reviewed plan change')),
  'studio','a recent admin creates a plan');
select is((select entitlements from api_v1.list_plans_v1() where key='studio'),array['booking.online','reports.operational'],
  'feature keys are de-duplicated and sorted');
select throws_ok($$ select * from api_v1.save_plan_v1('studio','Studio',array['booking.online'],true,true,'Reviewed plan change') $$,
  '23505','plan_exists','creating an existing key is refused');

-- Subscription assignment projects entitlements.
select lives_ok(format($$ select * from api_v1.assign_subscription_v1(%L,'studio','canary','Pilot customer onboarding') $$,current_setting('test.t')),
  'an admin assigns a plan');
reset role;
select is((select array_agg(feature_key order by feature_key) from app.tenant_entitlements
  where tenant_id=current_setting('test.t')::uuid and granted),array['booking.online','reports.operational'],
  'the plan''s features are granted');

-- Editing a plan re-projects to subscribers, removal included.
set local role authenticated;
select lives_ok($$ select * from api_v1.save_plan_v1('studio','Studio',array['booking.online','payments.deposits'],true,false,'Reviewed plan change') $$,
  'an admin edits the plan');
reset role;
select is((select array_agg(feature_key order by feature_key) from app.tenant_entitlements
  where tenant_id=current_setting('test.t')::uuid and granted),array['booking.online','payments.deposits'],
  'subscribers gain and lose features with the plan');

-- Overrides survive plan edits; clearing returns to plan truth.
set local role authenticated;
select lives_ok(format($$ select * from api_v1.set_entitlement_override_v1(%L,'brand.custom_domain',true,null,'Contractual add-on') $$,current_setting('test.t')),
  'an admin grants an override');
select lives_ok($$ select * from api_v1.save_plan_v1('studio','Studio',array['booking.online'],true,false,'Reviewed plan change') $$,'the plan changes again');
reset role;
select ok((select granted and source='override' from app.tenant_entitlements
  where tenant_id=current_setting('test.t')::uuid and feature_key='brand.custom_domain'),'the override is untouched');
set local role authenticated;
select lives_ok(format($$ select * from api_v1.clear_entitlement_override_v1(%L,'brand.custom_domain','Add-on contract ended') $$,current_setting('test.t')),
  'an admin clears the override');
reset role;
select ok((select not granted from app.tenant_entitlements
  where tenant_id=current_setting('test.t')::uuid and feature_key='brand.custom_domain'),'a feature outside the plan is no longer granted');

-- Subscription lifecycle with concurrency.
set local role authenticated;
select throws_ok(format($$ select * from api_v1.update_subscription_v1(%L,'cancelled',null,'canary','Customer left',
  (select updated_at from api_v1.list_subscriptions_v1(null,null,'plan tenant',10,0))) $$,current_setting('test.t')),
  '22023','ends_at_required','cancelling needs an end date');
select throws_ok(format($$ select * from api_v1.update_subscription_v1(%L,'past_due',null,'canary','Card declined','2000-01-01') $$,current_setting('test.t')),
  '40001','stale_revision','a stale edit is refused');
select is((select state from api_v1.update_subscription_v1(current_setting('test.t')::uuid,'cancelled',now()+interval '7 days','canary','Customer left',
  (select updated_at from api_v1.list_subscriptions_v1(null,null,'plan tenant',10,0)))),'cancelled','cancellation with an end date works');
reset role;
select ok((select bool_and(expires_at is not null) from app.tenant_entitlements
  where tenant_id=current_setting('test.t')::uuid and source='plan' and granted),'plan features now expire at the end date');

-- Cancellation keeps remaining access through edits and override removal.
set local role authenticated;
select lives_ok($$ select * from api_v1.save_plan_v1('studio','Studio',array['booking.online','reports.operational'],true,false,'Reviewed plan change') $$,
  'a plan edit updates a subscription cancelled with a future end date');
reset role;
select ok((select granted and expires_at is not null from app.tenant_entitlements
  where tenant_id=current_setting('test.t')::uuid and feature_key='reports.operational'),
  'a newly added feature honors the cancelled subscription end date');
set local role authenticated;
select * from api_v1.set_entitlement_override_v1(current_setting('test.t')::uuid,'booking.online',false,null,'Temporary restriction');
select * from api_v1.clear_entitlement_override_v1(current_setting('test.t')::uuid,'booking.online','Restriction resolved');
reset role;
select ok((select granted and expires_at is not null from app.tenant_entitlements
  where tenant_id=current_setting('test.t')::uuid and feature_key='booking.online'),
  'clearing an override restores remaining plan access and its end date');

-- Roles and step-up.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000c','operator');
set local role authenticated;
select throws_ok($$ select * from api_v1.save_plan_v1('x2','X',array[]::text[],true,true,'Reviewed plan change') $$,'42501','policy_denied','an operator cannot edit plans');
select ok((select count(*) from api_v1.list_plans_v1()) >= 2,'but can read them');
reset role;
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin',3600);
set local role authenticated;
select throws_ok($$ select * from api_v1.save_plan_v1('x3','X',array[]::text[],true,true,'Reviewed plan change') $$,'42501','recent_authentication_required',
  'plan edits need step-up');
reset role;

select is((select count(*)::int from control_plane.audit_events
  where operator_id='c0000000-0000-0000-0000-00000000000a'
  and (action like 'plan.%' or action like 'subscription.%' or action like 'entitlement.%')),
  10,'every commercial change is audited');

select * from finish();
rollback;
