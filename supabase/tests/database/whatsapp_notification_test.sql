begin;
select no_plan();

-- The optional WhatsApp channel. The properties that matter: it is off unless
-- the plan grants it, the tenant configured and enabled it, AND the customer
-- consented on that booking; email for the same event is always still sent;
-- the token is only ever a reference and never leaves through a tenant-facing
-- function; the consent snapshot never changes after it is written.

select set_config('test.wa_day',
  (date_trunc('week',statement_timestamp() at time zone 'America/New_York')::date+28)::text,true);
create function pg_temp.wa_time(p_time time)
returns timestamptz language sql stable as $$
  select (current_setting('test.wa_day')::date+p_time) at time zone 'America/New_York';
$$;
do $$ begin
  execute format('grant usage on schema %I to authenticated,anon,service_role',
    pg_my_temp_schema()::regnamespace::text);
end $$;

select set_config('test.admin_mfa',jsonb_build_object('sub','a1000000-0000-0000-0000-000000000002',
  'role','authenticated','aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp',
  'timestamp',extract(epoch from statement_timestamp())::bigint)))::text,true);
select set_config('test.admin','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
select set_config('test.staff','{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',true);
select set_config('test.other','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('test.worker','{"role":"service_role"}',true);
select set_config('test.config',
  '{"enabled":false,"phone_number_id":"1234567890","business_account_id":"9876543210",
    "access_token_secret_ref":"env:WHATSAPP_TOKEN_A0000000000000000000000000000001",
    "template_map":{"booking.confirmed":{"name":"booking_confirmed_v1","language":"ar"},
      "booking.reminder":{"name":"booking_reminder_v1","language":"en_US"}}}',true);

-- ---------------------------------------------------------------------------
-- Shape and privileges
select has_table('app'::name,'whatsapp_configs'::name);
select has_table('app'::name,'booking_whatsapp_consents'::name);
select ok(not has_table_privilege('authenticated','app.whatsapp_configs','SELECT')
  and not has_table_privilege('anon','app.whatsapp_configs','SELECT'),
  'no application role reads the provider configuration table');
select ok(not exists(select 1 from (values ('anon'),('authenticated')) r(role_name)
  cross join (values ('INSERT'),('UPDATE'),('DELETE')) c(privilege)
  where has_table_privilege(r.role_name,'app.booking_whatsapp_consents',c.privilege)
     or has_table_privilege(r.role_name,'app.whatsapp_configs',c.privilege)),
  'no application role writes configuration or consent directly');
select ok(not exists(select 1 from (values ('anon'),('authenticated')) r(role_name)
  cross join (values ('api_v1.claim_whatsapp_batch_v1(integer,integer)'),
    ('api_v1.record_whatsapp_attempt_v1(uuid,integer,text,timestamptz,text,text)'),
    ('api_v1.record_whatsapp_provider_event_v1(text,text,timestamptz,text,text,text)')) f(sig)
  where has_function_privilege(r.role_name,f.sig,'execute')),
  'no application role can claim, record or settle a WhatsApp message');
select ok(has_function_privilege('service_role','api_v1.claim_whatsapp_batch_v1(integer,integer)','execute')
  and has_function_privilege('service_role','api_v1.record_whatsapp_attempt_v1(uuid,integer,text,timestamptz,text,text)','execute')
  and has_function_privilege('service_role','api_v1.record_whatsapp_provider_event_v1(text,text,timestamptz,text,text,text)','execute'),
  'the platform worker can');
select ok(not has_function_privilege('anon','api_v1.get_whatsapp_config_v1(uuid)','execute')
  and not has_function_privilege('anon','api_v1.save_whatsapp_config_v1(uuid,jsonb,bigint,uuid)','execute')
  and has_function_privilege('anon','api_v1.get_public_whatsapp_availability_v1(text,text)','execute'),
  'a visitor learns only whether the opt-in is offered');

-- ---------------------------------------------------------------------------
-- Configuration: capability, recent second factor, entitlement.
select set_config('request.jwt.claims',current_setting('test.admin'),true);
set local role authenticated;
select is((api_v1.get_whatsapp_config_v1('a0000000-0000-0000-0000-000000000001')->>'entitled')::boolean,false,
  'a tenant is not entitled to WhatsApp by default');
select throws_ok(format($$select api_v1.save_whatsapp_config_v1('a0000000-0000-0000-0000-000000000001',
  %L::jsonb,0,'d0000000-0000-0000-0000-000000000001')$$,current_setting('test.config')),
  '42501','integration_step_up_required','saving provider configuration needs a recent second factor');
reset role;

select set_config('request.jwt.claims',current_setting('test.admin_mfa'),true);
set local role authenticated;
select throws_ok(format($$select api_v1.save_whatsapp_config_v1('a0000000-0000-0000-0000-000000000001',
  %L::jsonb,0,'d0000000-0000-0000-0000-000000000002')$$,
  (current_setting('test.config')::jsonb || '{"enabled":true}')::text),
  '42501','not_entitled','the channel cannot be switched on without the plan');
select throws_ok(format($$select api_v1.save_whatsapp_config_v1('a0000000-0000-0000-0000-000000000001',
  %L::jsonb,0,'d0000000-0000-0000-0000-000000000003')$$,
  (current_setting('test.config')::jsonb || '{"access_token_secret_ref":"EAAGm0PX4ZCpsBAKZCZBnotarealtoken"}')::text),
  '22023','whatsapp_config_invalid','a credential is refused: only a secret reference is stored');
select throws_ok(format($$select api_v1.save_whatsapp_config_v1('a0000000-0000-0000-0000-000000000001',
  %L::jsonb,0,'d0000000-0000-0000-0000-000000000004')$$,
  (current_setting('test.config')::jsonb || '{"template_map":{"payment.refunded":{"name":"x","language":"en"}}}')::text),
  '22023','whatsapp_config_invalid','a template for a type WhatsApp does not carry is refused');
select is((api_v1.save_whatsapp_config_v1('a0000000-0000-0000-0000-000000000001',
  current_setting('test.config')::jsonb,0,'d0000000-0000-0000-0000-000000000005')->>'revision')::integer,1,
  'a configuration can be saved, switched off, before the plan grants it');
select is((api_v1.save_whatsapp_config_v1('a0000000-0000-0000-0000-000000000001',
  current_setting('test.config')::jsonb,0,'d0000000-0000-0000-0000-000000000005')->>'replayed')::boolean,true,
  'a retried save replays');
select throws_ok(format($$select api_v1.save_whatsapp_config_v1('a0000000-0000-0000-0000-000000000001',
  %L::jsonb,0,'d0000000-0000-0000-0000-000000000006')$$,current_setting('test.config')),
  '40001','revision_conflict','a stale revision is refused');
select is((select array[(c->>'configured'),(c->>'access_token_configured'),(c->>'available')]
  from api_v1.get_whatsapp_config_v1('a0000000-0000-0000-0000-000000000001') c),
  array['true','true','false'],'configured, with a token reference, but not yet available');
select ok(api_v1.get_whatsapp_config_v1('a0000000-0000-0000-0000-000000000001')::text !~ 'WHATSAPP_TOKEN|env:|vault:'
  and not (api_v1.get_whatsapp_config_v1('a0000000-0000-0000-0000-000000000001') ? 'access_token_secret_ref'),
  'the secret reference is never returned, only whether one is set');
reset role;

select set_config('request.jwt.claims',current_setting('test.staff'),true);
set local role authenticated;
select throws_ok($$select api_v1.get_whatsapp_config_v1('a0000000-0000-0000-0000-000000000001')$$,
  '42501','policy_denied','a member without the integration capability cannot read it');
select throws_ok(format($$select api_v1.save_whatsapp_config_v1('a0000000-0000-0000-0000-000000000001',
  %L::jsonb,1,'d0000000-0000-0000-0000-000000000007')$$,current_setting('test.config')),
  '42501','integration_step_up_required','or change it');
reset role;
select set_config('request.jwt.claims',current_setting('test.other'),true);
set local role authenticated;
select throws_ok($$select api_v1.get_whatsapp_config_v1('a0000000-0000-0000-0000-000000000001')$$,
  '42501','policy_denied','another tenant cannot read it');
select throws_ok(format($$select api_v1.save_whatsapp_config_v1('a0000000-0000-0000-0000-000000000001',
  %L::jsonb,1,'d0000000-0000-0000-0000-000000000008')$$,current_setting('test.config')),
  '42501','integration_step_up_required','or change it');
reset role;
select set_config('request.jwt.claims',null,true);
set local role anon;
select throws_ok($$select api_v1.get_whatsapp_config_v1('a0000000-0000-0000-0000-000000000001')$$,
  '42501',null,'an anonymous caller cannot read it');
select is((api_v1.get_public_whatsapp_availability_v1('client.tenant-a.example.invalid','client')
  ->>'whatsapp_available')::boolean,false,'and the public form does not offer the opt-in yet');
reset role;

-- The plan grants it; the tenant switches it on.
insert into app.tenant_entitlements(tenant_id,feature_key,granted,source)
values ('a0000000-0000-0000-0000-000000000001','whatsapp_notifications',true,'plan');
select set_config('request.jwt.claims',current_setting('test.admin_mfa'),true);
set local role authenticated;
select is((api_v1.save_whatsapp_config_v1('a0000000-0000-0000-0000-000000000001',
  (current_setting('test.config')::jsonb - 'access_token_secret_ref') || '{"enabled":true}',1,
  'd0000000-0000-0000-0000-000000000009')->>'revision')::integer,2,
  'once entitled the channel can be enabled, keeping the stored reference');
select is((api_v1.get_whatsapp_config_v1('a0000000-0000-0000-0000-000000000001')->>'available')::boolean,true,
  'entitled, configured and enabled is available');
reset role;
select set_config('request.jwt.claims',null,true);
set local role anon;
select is((api_v1.get_public_whatsapp_availability_v1('client.tenant-a.example.invalid','client')
  ->>'whatsapp_available')::boolean,true,'and the booking form may now offer the opt-in');
reset role;

-- ---------------------------------------------------------------------------
-- Bookings: one with consent, one without.
insert into app.staff_profiles(id,tenant_id,public_name)
values ('ac000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','WhatsApp staff');
insert into app.staff_services(tenant_id,staff_id,service_id)
values ('a0000000-0000-0000-0000-000000000001','ac000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001');
insert into app.staff_locations(tenant_id,staff_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','ac000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001');
insert into app.staff_service_locations(tenant_id,staff_id,service_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','ac000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001');
insert into app.schedule_scopes(id,tenant_id,scope_kind,location_id,staff_id,time_zone)
values ('ac100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','staff','a5000000-0000-0000-0000-000000000001','ac000000-0000-0000-0000-000000000001','America/New_York');
insert into app.weekly_schedules(id,tenant_id,schedule_scope_id,day_of_week,start_minute,end_minute)
values ('ac200000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','ac100000-0000-0000-0000-000000000001',1,540,1020);
update app.catalog_service_revisions
set policy=jsonb_build_object('consent_version','1','consent_text','Terms.')
where tenant_id='a0000000-0000-0000-0000-000000000001' and service_id='a7200000-0000-0000-0000-000000000001';

select set_config('test.wa_hold',(select h.hold_id::text from api_v1.create_hold_v1(
  'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.wa_time('10:00'),
  'session-token-wa01-0001','idempotency-key-wa01-0001') h),true);
select throws_ok(format($$select * from api_v1.confirm_booking_v1(
  'client.tenant-a.example.invalid','client',%L::uuid,'session-token-wa01-0001','confirm-key-wa01-0000',
  '{"fullName":"WhatsApp Guest","email":"wa-guest@example.invalid",
    "whatsappOptIn":{"phoneE164":"0501234567","consentText":"Send me WhatsApp updates.","consentVersion":"1"}}'::jsonb,
  '1','ar','{}'::jsonb,'Asia/Riyadh')$$,current_setting('test.wa_hold')),
  '22023','booking_invalid_whatsapp_opt_in','a phone number that is not E.164 is refused');
select set_config('test.wa_booking',(select b.booking_id::text from api_v1.confirm_booking_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.wa_hold')::uuid,
  'session-token-wa01-0001','confirm-key-wa01-0001',
  '{"fullName":"WhatsApp Guest","email":"wa-guest@example.invalid",
    "whatsappOptIn":{"phoneE164":"+966501234567","consentText":"Send me WhatsApp updates.","consentVersion":"1"}}'::jsonb,
  '1','ar','{}'::jsonb,'Asia/Riyadh') b),true);
select is((select array[c.phone_e164,c.consent_text,c.consent_version,c.locale]
  from app.booking_whatsapp_consents c where c.booking_id=current_setting('test.wa_booking')::uuid),
  array['+966501234567','Send me WhatsApp updates.','1','ar'],
  'the confirmation path snapshots the consent with its text, version and locale');
select is((select count(*)::integer from app.booking_contacts c
  where c.booking_id=current_setting('test.wa_booking')::uuid and c.phone is null),1,
  'the opt-in is not mistaken for the contact''s own fields');

select set_config('test.wa_hold2',(select h.hold_id::text from api_v1.create_hold_v1(
  'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.wa_time('13:00'),
  'session-token-wa02-0001','idempotency-key-wa02-0001') h),true);
select set_config('test.wa_booking2',(select b.booking_id::text from api_v1.confirm_booking_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.wa_hold2')::uuid,
  'session-token-wa02-0001','confirm-key-wa02-0001',
  '{"fullName":"Email Guest","email":"email-guest@example.invalid"}'::jsonb,
  '1','en','{}'::jsonb,'Asia/Riyadh') b),true);

-- Consent visibility: customer details are PII.
select set_config('request.jwt.claims',current_setting('test.admin'),true);
set local role authenticated;
select is((select count(*)::integer from app.booking_whatsapp_consents),1,
  'a member who may see customer details reads the consent');
reset role;
select set_config('request.jwt.claims',current_setting('test.other'),true);
set local role authenticated;
select is((select count(*)::integer from app.booking_whatsapp_consents),0,
  'another tenant reads none');
reset role;
select set_config('request.jwt.claims',null,true);
set local role anon;
select throws_ok($$select count(*) from app.booking_whatsapp_consents$$,'42501',null,'and a visitor cannot read the table at all');
reset role;

-- ---------------------------------------------------------------------------
-- Dispatch: WhatsApp rows only when every condition holds.
savepoint wa_dispatch;
select * from private.dispatch_notifications_v1();
select is((select count(*)::integer from app.notification_messages m
  where m.channel='email' and m.template_key='booking.confirmed'),2,
  'both bookings get their confirmation email');
select is((select array[m.booking_id::text,m.provider,m.template_locale]
  from app.notification_messages m where m.channel='whatsapp'),
  array[current_setting('test.wa_booking'),'meta_whatsapp','ar'],
  'only the consented booking also gets a WhatsApp row');
select is((select b.notification_status from app.bookings b where b.id=current_setting('test.wa_booking')::uuid),
  'queued','the booking''s notification column still follows its email');

select set_config('request.jwt.claims',current_setting('test.worker'),true);
set local role service_role;
create temp table wa_claimed on commit drop as
  select * from api_v1.claim_whatsapp_batch_v1(20,120);
reset role;
select is((select array[c.recipient_phone_e164,c.phone_number_id,c.template_name,c.template_language,
    c.access_token_secret_ref] from wa_claimed c),
  array['+966501234567','1234567890','booking_confirmed_v1','ar',
    'env:WHATSAPP_TOKEN_A0000000000000000000000000000001'],
  'the worker gets the consented number, the tenant''s ids, the approved template and a token REFERENCE');
select ok((select not (c.payload ? 'manage_url') and c.payload ? 'service_name' from wa_claimed c),
  'a WhatsApp payload carries booking facts and never a management link token');
select ok(not exists(select 1 from private.claim_notification_batch_v1() c
    join app.notification_messages m on m.id=c.message_id where m.channel<>'email'),
  'the email worker never claims a WhatsApp row');

select set_config('test.wa_email_message',(select m.id::text from app.notification_messages m
  where m.channel='email' limit 1),true);
select set_config('request.jwt.claims',current_setting('test.worker'),true);
set local role service_role;
select is((select r.status from api_v1.record_whatsapp_attempt_v1(
    (select c.message_id from wa_claimed c),1,'accepted',statement_timestamp(),'wamid.TEST1',null) r),
  'sent','an accepted send is recorded like email');
select throws_ok($$select * from api_v1.record_whatsapp_attempt_v1(
    current_setting('test.wa_email_message')::uuid,1,'accepted',statement_timestamp(),'x',null)$$,
  '42501','notification_unavailable','the WhatsApp recorder refuses an email message');
select is((select array[e.applied::text,coalesce(e.message_id::text,'')]
  from api_v1.record_whatsapp_provider_event_v1('wamid.TEST1:delivered','delivered',
    statement_timestamp(),'wamid.TEST1','1234567890',null) e),
  array['true',(select c.message_id::text from wa_claimed c)],
  'a verified delivery status for this tenant''s number is applied');
select is((select e.applied from api_v1.record_whatsapp_provider_event_v1('wamid.TEST1:delivered',
    'delivered',statement_timestamp(),'wamid.TEST1','1234567890',null) e),false,
  'a duplicate status changes nothing');
select is((select array[e.applied::text,coalesce(e.message_id::text,'none')]
  from api_v1.record_whatsapp_provider_event_v1('wamid.TEST1:failed','failed',
    statement_timestamp(),'wamid.TEST1','5555555555','131026') e),
  array['false','none'],'a status for a number this tenant does not own is acknowledged and ignored');
reset role;
select is((select m.status from app.notification_messages m where m.channel='whatsapp'),'delivered',
  'and canonical state is what the verified callback said');
select ok(not exists(select 1 from app.notification_suppressions s
    where s.tenant_id='a0000000-0000-0000-0000-000000000001'),
  'nothing about WhatsApp suppresses an address');
rollback to savepoint wa_dispatch;

savepoint wa_not_entitled;
update app.tenant_entitlements set granted=false
where tenant_id='a0000000-0000-0000-0000-000000000001' and feature_key='whatsapp_notifications';
select * from private.dispatch_notifications_v1();
select is((select count(*)::integer from app.notification_messages m where m.channel='whatsapp'),0,
  'without the entitlement no WhatsApp row is created, whatever the tenant configured');
select is((select count(*)::integer from app.notification_messages m where m.channel='email'),2,
  'and email is unaffected');
rollback to savepoint wa_not_entitled;

savepoint wa_disabled;
update app.whatsapp_configs set enabled=false where tenant_id='a0000000-0000-0000-0000-000000000001';
select * from private.dispatch_notifications_v1();
select is((select count(*)::integer from app.notification_messages m where m.channel='whatsapp'),0,
  'a tenant that switched the channel off gets no WhatsApp row');
rollback to savepoint wa_disabled;

savepoint wa_unconfigured;
update app.whatsapp_configs set access_token_secret_ref=null where tenant_id='a0000000-0000-0000-0000-000000000001';
select * from private.dispatch_notifications_v1();
select is((select count(*)::integer from app.notification_messages m where m.channel='whatsapp'),0,
  'a tenant without a token reference is not configured and gets none');
rollback to savepoint wa_unconfigured;

savepoint wa_unmapped;
update app.whatsapp_configs set template_map='{"booking.reminder":{"name":"r","language":"en"}}'
where tenant_id='a0000000-0000-0000-0000-000000000001';
select * from private.dispatch_notifications_v1();
select is((select count(*)::integer from app.notification_messages m where m.channel='whatsapp'),0,
  'a type without an approved template gets no WhatsApp row');
rollback to savepoint wa_unmapped;

savepoint wa_type_off;
insert into app.notification_settings(tenant_id,overrides)
values ('a0000000-0000-0000-0000-000000000001','{"booking.confirmed":{"whatsapp_enabled":false}}');
select * from private.dispatch_notifications_v1();
select is((select count(*)::integer from app.notification_messages m where m.channel='whatsapp'),0,
  'a type the tenant switched off for WhatsApp gets none');
select is((select count(*)::integer from app.notification_messages m where m.channel='email'),2,
  'while its email still goes');
rollback to savepoint wa_type_off;

-- The claim re-checks: a tenant that loses the channel after dispatch has its
-- waiting rows settled instead of sent.
savepoint wa_claim_recheck;
select * from private.dispatch_notifications_v1();
update app.tenant_entitlements set granted=false
where tenant_id='a0000000-0000-0000-0000-000000000001' and feature_key='whatsapp_notifications';
select is((select count(*)::integer from private.claim_whatsapp_batch_v1()),0,
  'nothing is claimed once the entitlement is gone');
select is((select array[m.status,m.last_error_code] from app.notification_messages m where m.channel='whatsapp'),
  array['failed','whatsapp_unavailable'],'and the waiting row is settled with a stable code');
rollback to savepoint wa_claim_recheck;

-- ---------------------------------------------------------------------------
-- No consent snapshot without the channel.
savepoint wa_no_channel_consent;
update app.tenant_entitlements set granted=false
where tenant_id='a0000000-0000-0000-0000-000000000001' and feature_key='whatsapp_notifications';
select set_config('test.wa_hold3',(select h.hold_id::text from api_v1.create_hold_v1(
  'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.wa_time('15:00'),
  'session-token-wa03-0001','idempotency-key-wa03-0001') h),true);
select set_config('test.wa_booking3',(select b.booking_id::text from api_v1.confirm_booking_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.wa_hold3')::uuid,
  'session-token-wa03-0001','confirm-key-wa03-0001',
  '{"fullName":"Late Guest","email":"late-guest@example.invalid",
    "whatsappOptIn":{"phoneE164":"+966501234568","consentText":"Yes.","consentVersion":"1"}}'::jsonb,
  '1','en','{}'::jsonb,'Asia/Riyadh') b),true);
select ok(current_setting('test.wa_booking3') <> '',
  'the booking still commits when the channel is unavailable');
select is((select count(*)::integer from app.booking_whatsapp_consents c
  where c.booking_id=current_setting('test.wa_booking3')::uuid),0,
  'but no consent is stored for a channel the tenant cannot use');
rollback to savepoint wa_no_channel_consent;

-- ---------------------------------------------------------------------------
-- The consent snapshot is immutable.
savepoint wa_immutable;
select set_config('request.jwt.claims',current_setting('test.admin_mfa'),true);
set local role authenticated;
select lives_ok($$select api_v1.save_whatsapp_config_v1('a0000000-0000-0000-0000-000000000001',
  '{"enabled":false,"phone_number_id":"1111111111","business_account_id":"2222222222","template_map":{}}'::jsonb,
  2,'d0000000-0000-0000-0000-000000000010')$$,'the tenant later edits its configuration');
select lives_ok($$select api_v1.save_notification_settings_v1('a0000000-0000-0000-0000-000000000001',
  '[{"template_key":"booking.confirmed","whatsapp_enabled":false}]'::jsonb,array[1440],0,
  'd0000000-0000-0000-0000-000000000011')$$,'and its notification settings');
reset role;
select is((select array[c.phone_e164,c.consent_text,c.consent_version,c.locale]
  from app.booking_whatsapp_consents c where c.booking_id=current_setting('test.wa_booking')::uuid),
  array['+966501234567','Send me WhatsApp updates.','1','ar'],
  'the consent the customer gave is exactly what it was');
select throws_ok($$update app.booking_whatsapp_consents set consent_text='Changed.'$$,
  '42501','booking_immutable','even the platform cannot rewrite a consent snapshot');
rollback to savepoint wa_immutable;

select _set('curr_test',(select last_value::integer from __tresults___numb_seq));
select * from finish();
rollback;
