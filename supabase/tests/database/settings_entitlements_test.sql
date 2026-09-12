begin;
select no_plan();

-- Issue #26. Navigation, settings, and entitled features. One property carries
-- this whole issue: a tenant editing its own configuration can turn a feature
-- OFF and can never turn one ON that the plan does not grant. Everything else
-- here is bounds checking and an audit trail.

do $$ begin
  execute format('grant usage on schema %I to authenticated',pg_my_temp_schema()::regnamespace::text);
end $$;

-- ---------------------------------------------------------------------------
-- Contract shape.
select has_table('app'::name,'tenant_entitlements'::name);
select has_table('app'::name,'tenant_settings_events'::name);
select ok((select bool_and(relrowsecurity) from pg_class
  where oid in ('app.tenant_entitlements'::regclass,'app.tenant_settings_events'::regclass)),
  'both new tables carry row level security');
select ok(not exists(
  select 1 from (values ('anon'),('authenticated')) p(role_name)
  cross join (values ('INSERT'),('UPDATE'),('DELETE')) c(privilege)
  where has_table_privilege(p.role_name,'app.tenant_entitlements',c.privilege)),
  'no application role writes an entitlement, including the tenant owner: that '
  'is the whole point of it being an entitlement');
select ok(has_table_privilege('authenticated','app.tenant_entitlements','SELECT'),
  'but a member may read what their plan includes');

select has_function('api_v1'::name,'save_tenant_settings_v1'::name,
  array['uuid','jsonb','jsonb','jsonb','bigint']);
select has_function('api_v1'::name,'get_tenant_configuration_v1'::name,array['uuid']);
select has_function('api_v1'::name,'get_public_navigation_v1'::name,array['text','text']);

select ok(has_function_privilege('anon','api_v1.get_public_navigation_v1(text,text)','execute'),
  'navigation is read before anybody signs in');
select ok(
  not has_function_privilege('anon','api_v1.get_tenant_configuration_v1(uuid)','execute')
  and not has_function_privilege('anon','api_v1.save_tenant_settings_v1(uuid,jsonb,jsonb,jsonb,bigint)','execute'),
  'but configuration and entitlements are never anonymous: a visitor has no '
  'business knowing what a tenant pays for');

-- ---------------------------------------------------------------------------
-- Navigation validation.
select ok(private.navigation_is_valid_v1(
  '{"items":[{"route":"/book","label":{"en":"Book","ar":"احجز"}}]}'::jsonb),
  'an approved route labelled in both languages is valid');
select ok(not private.navigation_is_valid_v1(
  '{"items":[{"route":"/book","label":{"en":"Book"}}]}'::jsonb),
  'a half-translated label is refused, so navigation cannot ship English-only');
select ok(not private.navigation_is_valid_v1(
  '{"items":[{"route":"/admin","label":{"en":"Admin","ar":"إدارة"}}]}'::jsonb),
  'a route outside the approved set is refused, so a link cannot point at '
  'something that does not exist or should not be reachable');
select ok(private.navigation_is_valid_v1(
  '{"items":[{"href":"https://example.invalid/help","label":{"en":"Help","ar":"مساعدة"}}]}'::jsonb),
  'an https external link is allowed');
select ok(not private.navigation_is_valid_v1(
  '{"items":[{"href":"http://example.invalid","label":{"en":"Help","ar":"مساعدة"}}]}'::jsonb),
  'an unencrypted one is not');
select ok(not private.navigation_is_valid_v1(
  '{"items":[{"href":"/../admin","label":{"en":"X","ar":"X"}}]}'::jsonb),
  'and neither is a traversal dressed up as a link');
select ok(private.navigation_is_valid_v1('{}'::jsonb),
  'empty navigation is valid: a tenant that has configured nothing is not broken');

-- ---------------------------------------------------------------------------
-- Settings bounds.
select ok(private.settings_are_valid_v1('{"currency":"SAR","defaultLocale":"ar"}'::jsonb),
  'a sane document passes');
select ok(not private.settings_are_valid_v1('{"currency":"riyal"}'::jsonb),
  'a currency that is not ISO 4217 is refused');
select ok(not private.settings_are_valid_v1('{"defaultLocale":"fr"}'::jsonb),
  'and a locale this product does not ship');
select ok(not private.settings_are_valid_v1('{"taxRateBps":9999}'::jsonb),
  'an implausible tax rate is refused, because a mistake here is expensive');
select ok(not private.settings_are_valid_v1('{"replyToEmail":"not-an-address"}'::jsonb),
  'and a reply-to that is not an address, because every customer sees it');
select ok(private.settings_are_valid_v1('{}'::jsonb),
  'an empty document is valid: nothing configured is not the same as invalid');

-- ---------------------------------------------------------------------------
-- The property this whole issue exists for.
savepoint se_entitlement;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;

select ok((select e.entitlements ? 'booking.online'
  from api_v1.get_tenant_configuration_v1('a0000000-0000-0000-0000-000000000001') e),
  'the tenant is entitled to online booking');
select ok(not (select e.entitlements ? 'calendar.two_way_sync'
  from api_v1.get_tenant_configuration_v1('a0000000-0000-0000-0000-000000000001') e),
  'and is not entitled to two-way calendar sync, which is Phase 2');

-- Enabling something the plan grants works.
select is((select s.ignored_features from api_v1.save_tenant_settings_v1(
  'a0000000-0000-0000-0000-000000000001','{"currency":"SAR"}'::jsonb,'{}'::jsonb,
  '{"booking.online":{"enabled":true}}'::jsonb) s),
  array[]::text[],'enabling an entitled feature is accepted without complaint');
select ok((select (s.feature_configuration->'booking.online'->>'enabled')::boolean
  from app.tenant_settings s where s.tenant_id='a0000000-0000-0000-0000-000000000001'),
  'and is stored as enabled');

-- Enabling something the plan does not grant is stripped on the way in.
select is((select s.ignored_features from api_v1.save_tenant_settings_v1(
  'a0000000-0000-0000-0000-000000000001','{"currency":"SAR"}'::jsonb,'{}'::jsonb,
  '{"calendar.two_way_sync":{"enabled":true}}'::jsonb) s),
  array['calendar.two_way_sync'],
  'enabling an unentitled feature reports exactly which one was ignored');
select ok(not (select (s.feature_configuration->'calendar.two_way_sync'->>'enabled')::boolean
  from app.tenant_settings s where s.tenant_id='a0000000-0000-0000-0000-000000000001'),
  'and it is stored as DISABLED — not merely hidden in an interface, and not '
  'merely false at read time: it never gets written as enabled');

-- The rest of the document still saves. One stale checkbox must not block every
-- other change an administrator is trying to make.
select is((select s.settings->>'currency' from app.tenant_settings s
  where s.tenant_id='a0000000-0000-0000-0000-000000000001'),'SAR',
  'and everything else in the same save still took effect');

reset role;
select set_config('request.jwt.claims',null,true);
-- An expired grant is not a grant. Written as the owner, because no role inside
-- the tenant can write this table at all — which is the point.
insert into app.tenant_entitlements(tenant_id,feature_key,granted,source,expires_at)
values ('a0000000-0000-0000-0000-000000000001','trial.thing',true,'trial',
  statement_timestamp()-interval '1 day');
update app.tenant_entitlements set granted=false
where tenant_id='a0000000-0000-0000-0000-000000000001' and feature_key='payments.deposits';
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select ok(not (select e.entitlements ? 'trial.thing'
  from api_v1.get_tenant_configuration_v1('a0000000-0000-0000-0000-000000000001') e),
  'an expired trial entitlement does not grant anything');

-- A revoked grant is not a grant either.
select ok(not (select e.entitlements ? 'payments.deposits'
  from api_v1.get_tenant_configuration_v1('a0000000-0000-0000-0000-000000000001') e),
  'nor a revoked one');
select is((select s.ignored_features from api_v1.save_tenant_settings_v1(
  'a0000000-0000-0000-0000-000000000001','{}'::jsonb,'{}'::jsonb,
  '{"payments.deposits":{"enabled":true}}'::jsonb) s),
  array['payments.deposits'],
  'and re-enabling a revoked feature is refused the same way a never-granted '
  'one is');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint se_entitlement;

-- ---------------------------------------------------------------------------
-- Writing settings is a capability, and the trail says who.
savepoint se_authority;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok(
  $$select * from api_v1.save_tenant_settings_v1('a0000000-0000-0000-0000-000000000001',
    '{}'::jsonb,'{}'::jsonb,'{}'::jsonb)$$,
  '42501','policy_denied','a staff member cannot rewrite the tenant''s settings');
reset role;
select set_config('request.jwt.claims',null,true);

select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok(
  $$select * from api_v1.save_tenant_settings_v1('a0000000-0000-0000-0000-000000000001',
    '{}'::jsonb,'{}'::jsonb,'{}'::jsonb)$$,
  '42501','policy_denied','and neither can another tenant''s administrator');
select throws_ok(
  $$select * from api_v1.get_tenant_configuration_v1('a0000000-0000-0000-0000-000000000001')$$,
  '42501','policy_denied','who also cannot read what this tenant is entitled to');
reset role;
select set_config('request.jwt.claims',null,true);

select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select * from api_v1.save_tenant_settings_v1('a0000000-0000-0000-0000-000000000001',
  '{"currency":"SAR"}'::jsonb,'{}'::jsonb,'{}'::jsonb);
select is((select e.changed from api_v1.list_settings_events_v1(
  'a0000000-0000-0000-0000-000000000001') e limit 1),
  array['settings'],'the trail records which documents moved');
select ok((select e.actor_membership_id is not null from api_v1.list_settings_events_v1(
  'a0000000-0000-0000-0000-000000000001') e limit 1),
  'and who moved them');
reset role;
select set_config('request.jwt.claims',null,true);
select ok(not exists(
  select 1 from app.tenant_settings_events e where e.changed::text ilike '%SAR%'),
  'the trail names the documents, never their values: a settings document can '
  'carry a reply-to address');
select throws_ok(
  $$update app.tenant_settings_events set changed=array['nothing']$$,
  '42501','booking_immutable','a settings history that can be edited is not a history');
rollback to savepoint se_authority;

-- ---------------------------------------------------------------------------
-- Concurrency and refusals.
savepoint se_refusals;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok(
  $$select * from api_v1.save_tenant_settings_v1('a0000000-0000-0000-0000-000000000001',
    '{}'::jsonb,'{}'::jsonb,'{}'::jsonb,99)$$,
  '23505','revision_conflict','a save against a stale read is refused');
select throws_ok(
  $$select * from api_v1.save_tenant_settings_v1('a0000000-0000-0000-0000-000000000001',
    '{"currency":"nonsense"}'::jsonb,'{}'::jsonb,'{}'::jsonb)$$,
  '22023','settings_invalid','an out-of-bounds setting is refused');
select throws_ok(
  $$select * from api_v1.save_tenant_settings_v1('a0000000-0000-0000-0000-000000000001',
    '{}'::jsonb,'{"items":[{"route":"/admin","label":{"en":"A","ar":"A"}}]}'::jsonb,'{}'::jsonb)$$,
  '22023','settings_invalid','so is a link to a route outside the approved set');
select throws_ok(
  $$select * from api_v1.save_tenant_settings_v1('a0000000-0000-0000-0000-000000000001',
    '{"tagline":"<script>x</script>"}'::jsonb,'{}'::jsonb,'{}'::jsonb)$$,
  '22023','brand_unsafe_content',
  'and markup is refused here exactly as it is in a brand document');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint se_refusals;

-- ---------------------------------------------------------------------------
-- The public read shows navigation and nothing commercial.
savepoint se_public;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select * from api_v1.save_tenant_settings_v1('a0000000-0000-0000-0000-000000000001',
  '{"replyToEmail":"hello@tenant-a.example.invalid"}'::jsonb,
  '{"items":[{"route":"/book","label":{"en":"Book","ar":"احجز"}}]}'::jsonb,
  '{"booking.online":{"enabled":true}}'::jsonb);
reset role;
select set_config('request.jwt.claims',null,true);

set local role anon;
select is((select n.navigation->'items'->0->>'route' from api_v1.get_public_navigation_v1(
  'client.tenant-a.example.invalid','client') n),'/book',
  'a visitor gets the navigation');
select ok((select n.cache_tag like 'config:a0000000-0000-0000-0000-000000000001:%'
  from api_v1.get_public_navigation_v1('client.tenant-a.example.invalid','client') n),
  'with a cache tag scoped to the tenant and its configuration version');
select ok(
  pg_get_function_result('api_v1.get_public_navigation_v1(text,text)'::regprocedure)
    !~* '(entitle|feature|settings|reply)',
  'and the shape carries no entitlement, feature configuration or reply-to: a '
  'visitor has no business knowing what a tenant pays for');
reset role;
rollback to savepoint se_public;

-- The savepoint rollbacks above revert pgTAP's own counter, so it is restored
-- from the non-transactional sequence before the plan is emitted.
select _set('curr_test',(select last_value::integer from __tresults___numb_seq));
select * from finish();
rollback;
