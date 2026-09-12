begin;
select no_plan();

-- Issue #18. Customer records and privacy requests: identity derived from the
-- bookings a tenant already took, a directory that discloses nothing a
-- capability does not already permit, and export/deletion/hold/offboarding as
-- one restartable machine whose every subsystem outcome is written down.

select set_config('test.cp_day',
  (date_trunc('week',statement_timestamp() at time zone 'America/New_York')::date+28)::text,true);
create function pg_temp.cp_time(p_time time)
returns timestamptz language sql stable as $$
  select (current_setting('test.cp_day')::date+p_time) at time zone 'America/New_York';
$$;
do $$ begin
  execute format('grant usage on schema %I to authenticated',pg_my_temp_schema()::regnamespace::text);
end $$;

-- ---------------------------------------------------------------------------
-- Contract shape.
select has_table('app'::name,'customers'::name);
select has_table('app'::name,'customer_consents'::name);
select has_table('app'::name,'legal_holds'::name);
select has_table('app'::name,'privacy_requests'::name);
select has_table('app'::name,'privacy_request_steps'::name);
select ok((select bool_and(relrowsecurity) from pg_class
  where oid in ('app.customers'::regclass,'app.customer_consents'::regclass,
    'app.legal_holds'::regclass,'app.privacy_requests'::regclass,
    'app.privacy_request_steps'::regclass)),
  'every table this issue adds carries row level security');

select has_function('api_v1'::name,'search_customers_v1'::name,
  array['uuid','text','text','boolean','integer','integer']);
select has_function('api_v1'::name,'get_customer_detail_v1'::name,array['uuid','uuid']);
select has_function('api_v1'::name,'correct_customer_v1'::name,
  array['uuid','uuid','bigint','text','text','text','text','text[]']);
select has_function('api_v1'::name,'set_customer_restriction_v1'::name,
  array['uuid','uuid','boolean','text']);
select has_function('api_v1'::name,'set_legal_hold_v1'::name,array['uuid','uuid','boolean','text']);
select has_function('api_v1'::name,'open_privacy_request_v1'::name,array['uuid','uuid','text']);
select has_function('api_v1'::name,'run_privacy_request_v1'::name,array['uuid','uuid']);
select has_function('api_v1'::name,'get_privacy_request_v1'::name,array['uuid','uuid']);
select has_function('api_v1'::name,'advance_tenant_offboarding_v1'::name,array['uuid','text']);
select has_function('api_v1'::name,'list_privacy_requests_v1'::name,array['uuid','uuid','integer']);

select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='api_v1' and p.prosecdef and p.proname in (
    'search_customers_v1','get_customer_detail_v1','correct_customer_v1',
    'set_customer_restriction_v1','set_legal_hold_v1','open_privacy_request_v1',
    'run_privacy_request_v1','get_privacy_request_v1','advance_tenant_offboarding_v1',
    'list_privacy_requests_v1')),
  'every exposed privacy wrapper is security invoker');
select ok(not has_function_privilege('anon','api_v1.search_customers_v1(uuid,text,text,boolean,integer,integer)','execute')
  and not has_function_privilege('anon','api_v1.get_customer_detail_v1(uuid,uuid)','execute')
  and not has_function_privilege('anon','api_v1.open_privacy_request_v1(uuid,uuid,text)','execute')
  and not has_function_privilege('anon','api_v1.advance_tenant_offboarding_v1(uuid,text)','execute'),
  'no privacy surface is anonymous: a customer directory is never public');
select ok(not has_column_privilege('authenticated','app.privacy_requests','artifact','select'),
  'the export artifact is unreadable through the table: one function is the only way to it');
select ok(has_column_privilege('authenticated','app.privacy_requests','status','select'),
  'the rest of the request row stays readable, so revoking the artifact is narrow');

-- ---------------------------------------------------------------------------
-- Fixtures. Two bookings for one guest and one for another, made through the
-- ordinary client path, because identity is supposed to fall out of the
-- bookings a tenant already takes rather than out of a separate import.
insert into app.staff_profiles(id,tenant_id,public_name)
values ('d8000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Privacy fixture staff');
insert into app.staff_services(tenant_id,staff_id,service_id)
values ('a0000000-0000-0000-0000-000000000001','d8000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001');
insert into app.staff_locations(tenant_id,staff_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','d8000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001');
insert into app.staff_service_locations(tenant_id,staff_id,service_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','d8000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001');
insert into app.schedule_scopes(id,tenant_id,scope_kind,location_id,staff_id,time_zone)
values ('d8100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','staff','a5000000-0000-0000-0000-000000000001','d8000000-0000-0000-0000-000000000001','America/New_York');
insert into app.weekly_schedules(id,tenant_id,schedule_scope_id,day_of_week,start_minute,end_minute)
values ('d8200000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','d8100000-0000-0000-0000-000000000001',1,540,1020);

-- The service has to publish the intake field before a booking may answer it,
-- which is also why the export has something sensitive to carry.
update app.catalog_service_revisions
set intake_schema=jsonb_build_object('fields',jsonb_build_array(
  jsonb_build_object('key','allergies','label','Allergies','type','text','required',false)))
where tenant_id='a0000000-0000-0000-0000-000000000001'
  and service_id='a7200000-0000-0000-0000-000000000001';

select set_config('test.cp_hold_one',(select h.hold_id::text from api_v1.create_hold_v1(
  'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.cp_time('10:00'),
  'session-token-cp01-0001','idempotency-key-cp01-0001') h),true);
select set_config('test.cp_booking_one',(select b.booking_id::text from api_v1.confirm_booking_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.cp_hold_one')::uuid,
  'session-token-cp01-0001','confirm-key-cp01-0001',
  '{"fullName":"Dana Halim","email":"Dana.Halim@example.invalid","phone":"+966500000001"}'::jsonb,
  '1','en','{"allergies":"penicillin"}'::jsonb,'Asia/Riyadh') b),true);

-- The same person, different capitalisation. Identity is the lowered address,
-- so this is the same customer and not a second one.
select set_config('test.cp_hold_two',(select h.hold_id::text from api_v1.create_hold_v1(
  'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.cp_time('11:00'),
  'session-token-cp02-0001','idempotency-key-cp02-0001') h),true);
select set_config('test.cp_booking_two',(select b.booking_id::text from api_v1.confirm_booking_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.cp_hold_two')::uuid,
  'session-token-cp02-0001','confirm-key-cp02-0001',
  '{"fullName":"Dana Halim","email":"dana.halim@EXAMPLE.invalid","phone":"+966500000001"}'::jsonb,
  '1','en','{}'::jsonb,'Asia/Riyadh') b),true);

select set_config('test.cp_hold_three',(select h.hold_id::text from api_v1.create_hold_v1(
  'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.cp_time('13:00'),
  'session-token-cp03-0001','idempotency-key-cp03-0001') h),true);
select set_config('test.cp_booking_three',(select b.booking_id::text from api_v1.confirm_booking_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.cp_hold_three')::uuid,
  'session-token-cp03-0001','confirm-key-cp03-0001',
  '{"fullName":"Omar Said","email":"omar@example.invalid"}'::jsonb,
  '1','en','{}'::jsonb,'Asia/Riyadh') b),true);

select set_config('test.cp_customer',(select bc.customer_id::text from app.booking_contacts bc
  where bc.booking_id=current_setting('test.cp_booking_one')::uuid),true);

-- ---------------------------------------------------------------------------
savepoint cp_identity;

select isnt(current_setting('test.cp_customer'),null,
  'confirming a booking resolves a customer without any booking RPC being changed');
select is((select bc.customer_id::text from app.booking_contacts bc
  where bc.booking_id=current_setting('test.cp_booking_two')::uuid),
  current_setting('test.cp_customer'),
  'the same address in different case is the same person, not a second record');
select isnt((select bc.customer_id::text from app.booking_contacts bc
  where bc.booking_id=current_setting('test.cp_booking_three')::uuid),
  current_setting('test.cp_customer'),
  'a different address is a different person');
select is((select count(*)::integer from app.customers
  where tenant_id='a0000000-0000-0000-0000-000000000001'),2,
  'three bookings by two people produce exactly two customers');
select is((select c.email_hash from app.customers c
  where c.id=current_setting('test.cp_customer')::uuid),
  encode(sha256(convert_to('a0000000-0000-0000-0000-000000000001:dana.halim@example.invalid','UTF8')),'hex'),
  'identity is the tenant-salted digest, so two tenants holding one address never correlate');

-- Consent evidence is minimal and immutable.
select is((select count(*)::integer from app.customer_consents
  where customer_id=current_setting('test.cp_customer')::uuid),2,
  'each booking records the policy version it was actually made under');
select throws_ok(
  format($$update app.customer_consents set policy_version=99 where customer_id=%L$$,
    current_setting('test.cp_customer')),
  '42501','booking_immutable','consent evidence cannot be rewritten after the fact');
select ok(not exists(select 1 from information_schema.columns
  where table_schema='app' and table_name='customer_consents'
    and column_name in ('consent_text','rendered_text','body')),
  'consent evidence stores a hash of the rendered text and never the text');

rollback to savepoint cp_identity;

-- ---------------------------------------------------------------------------
-- The directory discloses to exactly the capability that already gates contact
-- rows, and to nobody else.
savepoint cp_directory;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;

select is((select count(*)::integer from api_v1.search_customers_v1(
  'a0000000-0000-0000-0000-000000000001')),2,
  'an admin sees the tenant directory');
select is((select s.full_name from api_v1.search_customers_v1(
  'a0000000-0000-0000-0000-000000000001','dana') s),'Dana Halim',
  'search matches on name');
select is((select s.full_name from api_v1.search_customers_v1(
  'a0000000-0000-0000-0000-000000000001','omar@example') s),'Omar Said',
  'search matches on address');
select is((select s.full_name from api_v1.search_customers_v1(
  'a0000000-0000-0000-0000-000000000001','500000001') s),'Dana Halim',
  'search matches on phone');
select is((select s.booking_count::integer from api_v1.search_customers_v1(
  'a0000000-0000-0000-0000-000000000001','dana') s),2,
  'the directory carries the history that makes a customer worth looking up');
select is((select array[d.full_name,d.email]
  from api_v1.get_customer_detail_v1('a0000000-0000-0000-0000-000000000001',
    current_setting('test.cp_customer')::uuid) d),
  array['Dana Halim','dana.halim@example.invalid'],
  'the detail surface returns the identity an authorized member asked for');
select is((select jsonb_array_length(d.bookings)
  from api_v1.get_customer_detail_v1('a0000000-0000-0000-0000-000000000001',
    current_setting('test.cp_customer')::uuid) d),2,
  'booking history is the point of the record');
select is((select d.intake_count::integer
  from api_v1.get_customer_detail_v1('a0000000-0000-0000-0000-000000000001',
    current_setting('test.cp_customer')::uuid) d),1,
  'the detail surface reports that sensitive intake exists');
select ok((select d.bookings::text not like '%penicillin%'
  from api_v1.get_customer_detail_v1('a0000000-0000-0000-0000-000000000001',
    current_setting('test.cp_customer')::uuid) d),
  'and never carries the intake answers themselves: a count is not a disclosure');

reset role;
select set_config('request.jwt.claims',null,true);

-- A staff member holds customer.pii.view at `own` scope, which grants nothing
-- tenant-wide. The directory is not a way around that.
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select count(*)::integer from api_v1.search_customers_v1(
  'a0000000-0000-0000-0000-000000000001')),0,
  'an own-scoped role gets an empty directory rather than a tenant-wide one');
select is((select count(*)::integer from api_v1.get_customer_detail_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.cp_customer')::uuid)),0,
  'and cannot reach a single record by guessing its id');
reset role;
select set_config('request.jwt.claims',null,true);

-- Another tenant's admin learns nothing, including whether the id exists.
select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select count(*)::integer from api_v1.search_customers_v1(
  'a0000000-0000-0000-0000-000000000001')),0,
  'a cross-tenant search returns nothing');
select is((select count(*)::integer from api_v1.get_customer_detail_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.cp_customer')::uuid)),0,
  'a cross-tenant read discloses no existence');
select throws_ok(
  format($$select * from api_v1.open_privacy_request_v1('a0000000-0000-0000-0000-000000000001',%L,'deletion')$$,
    current_setting('test.cp_customer')),
  '42501','policy_denied','and cannot open a privacy request against a stranger');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint cp_directory;

-- ---------------------------------------------------------------------------
-- Correction edits identity and leaves history alone.
savepoint cp_correction;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;

select throws_ok(
  format($$select * from api_v1.correct_customer_v1('a0000000-0000-0000-0000-000000000001',%L,99,'X','x@example.invalid')$$,
    current_setting('test.cp_customer')),
  '23505','revision_conflict','a correction against a stale read is refused');
select is((select c.revision::integer from api_v1.correct_customer_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.cp_customer')::uuid,
  (select revision from app.customers where id=current_setting('test.cp_customer')::uuid),
  'Dana Halim-Rashed','dana.rashed@example.invalid','+966500000009') c),3,
  'a correction with the current revision succeeds and bumps it');
select is((select array[c.full_name,c.email] from app.customers c
  where c.id=current_setting('test.cp_customer')::uuid),
  array['Dana Halim-Rashed','dana.rashed@example.invalid'],
  'current identity is what changed');
select is((select array[bc.full_name,bc.email] from app.booking_contacts bc
  where bc.booking_id=current_setting('test.cp_booking_one')::uuid),
  array['Dana Halim','dana.halim@example.invalid'],
  'the booking keeps the contact details it was actually made under (invariant 5)');
select is((select c.email_hash from app.customers c
  where c.id=current_setting('test.cp_customer')::uuid),
  encode(sha256(convert_to('a0000000-0000-0000-0000-000000000001:dana.rashed@example.invalid','UTF8')),'hex'),
  'a corrected address re-keys identity, so the next booking to that address is the same person');
select is((select r.detail->>'from_revision' from app.privacy_requests r
  where r.customer_id=current_setting('test.cp_customer')::uuid and r.kind='correction'),'2',
  'a correction leaves the same evidence a deletion does');
select ok((select r.detail::text not like '%Dana%' from app.privacy_requests r
  where r.customer_id=current_setting('test.cp_customer')::uuid and r.kind='correction'),
  'and records which fields moved, never their values');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint cp_correction;

-- ---------------------------------------------------------------------------
-- Restriction stops processing without destroying the record.
savepoint cp_restriction;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;

select ok((select r.restricted from api_v1.set_customer_restriction_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.cp_customer')::uuid,
  true,'Customer asked us to stop.') r),'a restriction is recorded');
reset role;
select set_config('request.jwt.claims',null,true);
select is((select count(*)::integer from app.notification_suppressions s
  join app.customers c on c.tenant_id=s.tenant_id and c.email_hash=s.recipient_hash
  where c.id=current_setting('test.cp_customer')::uuid),1,
  'restricting processing also stops the mail: a restriction that still sends is not one');

-- A provider finding is not ours to lift.
insert into app.notification_suppressions(tenant_id,recipient_hash,reason)
select 'a0000000-0000-0000-0000-000000000001',c.email_hash,'hard_bounce'
from app.customers c where c.id=current_setting('test.cp_booking_three')::uuid
on conflict do nothing;
insert into app.notification_suppressions(tenant_id,recipient_hash,reason)
select 'a0000000-0000-0000-0000-000000000001',
  encode(sha256(convert_to('a0000000-0000-0000-0000-000000000001:omar@example.invalid','UTF8')),'hex'),
  'hard_bounce'
on conflict do nothing;

select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select ok(not (select r.restricted from api_v1.set_customer_restriction_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.cp_customer')::uuid,
  false,null) r),'a restriction can be lifted');
reset role;
select set_config('request.jwt.claims',null,true);
select is((select count(*)::integer from app.notification_suppressions s
  join app.customers c on c.tenant_id=s.tenant_id and c.email_hash=s.recipient_hash
  where c.id=current_setting('test.cp_customer')::uuid),0,
  'lifting removes the suppression the restriction created');
select is((select count(*)::integer from app.notification_suppressions
  where reason='hard_bounce'),1,
  'and leaves the provider''s own hard bounce exactly where it was');
rollback to savepoint cp_restriction;

-- ---------------------------------------------------------------------------
-- Export: the documented closure, delivered with an expiry, reachable only
-- through the function that re-checks capability and step-up.
savepoint cp_export;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;

select set_config('test.cp_export',(select api_v1.open_privacy_request_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.cp_customer')::uuid,'export')::text),true);
select is(current_setting('test.cp_export'),
  (select api_v1.open_privacy_request_v1('a0000000-0000-0000-0000-000000000001',
    current_setting('test.cp_customer')::uuid,'export')::text),
  'a re-submitted export resumes the live request instead of opening a second one');
select is((select count(*)::integer from app.privacy_request_steps
  where request_id=current_setting('test.cp_export')::uuid),8,
  'every subsystem in the dependency closure gets a step, including the ones with nothing to do');
select is((select r.status from api_v1.run_privacy_request_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.cp_export')::uuid) r),
  'completed','running the request completes it');
select is((select count(*)::integer from app.privacy_request_steps
  where request_id=current_setting('test.cp_export')::uuid and status='pending'),0,
  'no step is left unanswered');
select ok((select bool_and(outcome_code is not null) from app.privacy_request_steps
  where request_id=current_setting('test.cp_export')::uuid),
  'and every step says why, so "not applicable" is a claim rather than a silence');

select ok((select g.artifact->'customer'->>'full_name'='Dana Halim'
  from api_v1.get_privacy_request_v1('a0000000-0000-0000-0000-000000000001',
    current_setting('test.cp_export')::uuid) g),'the artifact carries identity');
select is((select jsonb_array_length(g.artifact->'bookings')
  from api_v1.get_privacy_request_v1('a0000000-0000-0000-0000-000000000001',
    current_setting('test.cp_export')::uuid) g),2,'every booking is in the closure');
select ok((select g.artifact::text like '%penicillin%'
  from api_v1.get_privacy_request_v1('a0000000-0000-0000-0000-000000000001',
    current_setting('test.cp_export')::uuid) g),
  'including the sensitive intake the customer is entitled to receive');
select ok((select (g.artifact->'excluded'->>'backups') is not null
  and (g.artifact->'excluded'->>'analytics') is not null
  from api_v1.get_privacy_request_v1('a0000000-0000-0000-0000-000000000001',
    current_setting('test.cp_export')::uuid) g),
  'and states what it cannot contain: an absent section and an empty one are different claims');
select ok((select g.artifact_expires_at > statement_timestamp()
  from api_v1.get_privacy_request_v1('a0000000-0000-0000-0000-000000000001',
    current_setting('test.cp_export')::uuid) g),
  'the artifact expires rather than sitting around being densely available');
select throws_ok(
  format($$select artifact from app.privacy_requests where id=%L$$,current_setting('test.cp_export')),
  '42501',null,
  'a member who may read the request row still cannot read the artifact out of the table');
select lives_ok(
  format($$select status from app.privacy_requests where id=%L$$,current_setting('test.cp_export')),
  'while the rest of the row stays readable, so the exclusion is one column wide');
reset role;
select set_config('request.jwt.claims',null,true);

update app.privacy_requests set artifact_expires_at=statement_timestamp()-interval '1 day'
where id=current_setting('test.cp_export')::uuid;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select g.artifact from api_v1.get_privacy_request_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.cp_export')::uuid) g),null,
  'an expired artifact is the same as an absent one');
reset role;
select set_config('request.jwt.claims',null,true);

-- Export is an approval-grant capability, so the same admin without a step-up
-- gets the request metadata and not the data.
update app.privacy_requests set artifact_expires_at=statement_timestamp()+interval '1 day'
where id=current_setting('test.cp_export')::uuid;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((select g.artifact from api_v1.get_privacy_request_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.cp_export')::uuid) g),null,
  'without a recent authentication the artifact stays closed');
select is((select g.status from api_v1.get_privacy_request_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.cp_export')::uuid) g),'completed',
  'while the audit trail around it stays readable');
select throws_ok(
  format($$select * from api_v1.open_privacy_request_v1('a0000000-0000-0000-0000-000000000001',%L,'export')$$,
    current_setting('test.cp_customer')),
  '42501','policy_denied','and a new export cannot be opened without one either');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint cp_export;

-- ---------------------------------------------------------------------------
-- Deletion: restartable, subsystem-by-subsystem, and total where it is total.
savepoint cp_deletion;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;

select set_config('test.cp_note',(select n.note_id::text from api_v1.add_booking_note_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.cp_booking_one')::uuid,
  'sensitive','Allergic reaction noted at the last visit.') n),true);
select set_config('test.cp_note_ops',(select n.note_id::text from api_v1.add_booking_note_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.cp_booking_one')::uuid,
  'operational','Arrived fifteen minutes late.') n),true);

select set_config('test.cp_deletion',(select api_v1.open_privacy_request_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.cp_customer')::uuid,'deletion')::text),true);
select is((select r.status from api_v1.run_privacy_request_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.cp_deletion')::uuid) r),
  'completed','the deletion runs to completion');
reset role;
select set_config('request.jwt.claims',null,true);

select is((select count(*)::integer from app.booking_intake_answers
  where booking_id=current_setting('test.cp_booking_one')::uuid),0,
  'sensitive intake is hard-deleted on the sensitive-data clock');
select is((select count(*)::integer from app.booking_notes
  where id=current_setting('test.cp_note')::uuid),0,
  'so is a sensitive note');
select is((select count(*)::integer from app.booking_notes
  where id=current_setting('test.cp_note_ops')::uuid),1,
  'an operational note survives: "arrived late" is the tenant''s record of its own day');
select is((select array[bc.full_name,bc.email,coalesce(bc.phone,'-')] from app.booking_contacts bc
  where bc.booking_id=current_setting('test.cp_booking_one')::uuid),
  array['redacted','redacted@invalid','-'],
  'the contact row is anonymized rather than removed, so financial evidence keeps its shape');
select is((select count(*)::integer from app.bookings
  where id=current_setting('test.cp_booking_one')::uuid),1,
  'the booking itself survives its lawful retention');
select ok((select c.erased_at is not null and c.full_name is null and c.email is null
  and c.phone is null and c.tags='{}'::text[]
  from app.customers c where c.id=current_setting('test.cp_customer')::uuid),
  'the identity row keeps nothing that identifies anybody');
select isnt((select c.email_hash from app.customers c where c.id=current_setting('test.cp_customer')::uuid),
  encode(sha256(convert_to('a0000000-0000-0000-0000-000000000001:dana.halim@example.invalid','UTF8')),'hex'),
  'and its digest is replaced, so the row cannot be re-identified by hashing a guess');
select is((select count(*)::integer from app.privacy_request_steps
  where request_id=current_setting('test.cp_deletion')::uuid and status in ('succeeded','not_applicable')),8,
  'every subsystem in the closure reports an outcome');
select is((select s.outcome_code from app.privacy_request_steps s
  where s.request_id=current_setting('test.cp_deletion')::uuid and s.subsystem='email_provider'),
  'suppressed_at_provider',
  'the address is suppressed at the provider rather than the provider''s logs being pretended away');
select is((select s.outcome_code from app.privacy_request_steps s
  where s.request_id=current_setting('test.cp_deletion')::uuid and s.subsystem='backups'),
  'backups_expire_on_retention_never_edited',
  'and backups are stated as a separate clock, never as an immediate deletion');

-- Restartability. Re-running a completed deletion changes nothing.
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select r.status from api_v1.run_privacy_request_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.cp_deletion')::uuid) r),
  'completed','re-running a finished job is a no-op, because a retried submission is the normal case');
reset role;
select set_config('request.jwt.claims',null,true);
select is((select max(attempts)::integer from app.privacy_request_steps
  where request_id=current_setting('test.cp_deletion')::uuid),1,
  'and does not re-attempt a step that already succeeded');

-- The other customer is untouched.
select ok((select c.erased_at is null from app.customers c
  where c.tenant_id='a0000000-0000-0000-0000-000000000001' and c.email='omar@example.invalid'),
  'erasing one person erases exactly one person');
rollback to savepoint cp_deletion;

-- ---------------------------------------------------------------------------
-- Legal hold outranks deletion, and releasing it resumes the same request.
savepoint cp_hold;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;

select ok((select h.held from api_v1.set_legal_hold_v1('a0000000-0000-0000-0000-000000000001',
  current_setting('test.cp_customer')::uuid,true,'Open dispute, matter 2026-14.') h),
  'a hold is placed and attributed');
select set_config('test.cp_held',(select api_v1.open_privacy_request_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.cp_customer')::uuid,'deletion')::text),true);
select is((select array[r.status,r.blocked_reason] from api_v1.run_privacy_request_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.cp_held')::uuid) r),
  array['blocked','legal_hold_active'],
  'a deletion under a hold is refused, visibly');
reset role;
select set_config('request.jwt.claims',null,true);
select ok((select c.erased_at is null from app.customers c
  where c.id=current_setting('test.cp_customer')::uuid),
  'and the record is still there');
select is((select count(*)::integer from app.privacy_request_steps
  where request_id=current_setting('test.cp_held')::uuid and status='blocked'),8,
  'every step records that it was blocked rather than silently skipped');

select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select ok(not (select h.held from api_v1.set_legal_hold_v1('a0000000-0000-0000-0000-000000000001',
  current_setting('test.cp_customer')::uuid,false,'Matter closed.') h),
  'the hold is released by a named person');
select is((select r.status from api_v1.run_privacy_request_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.cp_held')::uuid) r),
  'completed','the same request resumes rather than needing to be opened again');
reset role;
select set_config('request.jwt.claims',null,true);
select ok((select c.erased_at is not null from app.customers c
  where c.id=current_setting('test.cp_customer')::uuid),
  'and completes the erasure it was holding');

-- A hold is an audit action with a step-up behind it, both ways.
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok(
  format($$select * from api_v1.set_legal_hold_v1('a0000000-0000-0000-0000-000000000001',%L,true,'x')$$,
    current_setting('test.cp_customer')),
  '42501','policy_denied','placing a hold needs a recent authentication');
select throws_ok(
  format($$select * from api_v1.set_legal_hold_v1('a0000000-0000-0000-0000-000000000001',%L,false,'x')$$,
    current_setting('test.cp_customer')),
  '42501','policy_denied','and so does releasing one, which is the dangerous direction');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint cp_hold;

-- ---------------------------------------------------------------------------
-- The append-only escape is narrow: holding the GUC is not holding a grant.
savepoint cp_append_only;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select set_config('app.erasure_request_id',gen_random_uuid()::text,true);
select throws_ok(
  format($$delete from app.booking_events where booking_id=%L$$,current_setting('test.cp_booking_one')),
  '42501',null,
  'setting the erasure GUC grants nothing: the caller still holds no delete privilege');
select throws_ok(
  format($$update app.booking_contacts set email='x@y.invalid' where booking_id=%L$$,
    current_setting('test.cp_booking_one')),
  '42501',null,'and no update privilege either');
select set_config('app.erasure_request_id','',true);
reset role;
select set_config('request.jwt.claims',null,true);
select is((select count(*)::integer from app.booking_contacts
  where booking_id=current_setting('test.cp_booking_one')::uuid and email='dana.halim@example.invalid'),1,
  'the row is exactly as it was');
select throws_ok(
  format($$delete from app.booking_events where booking_id=%L$$,current_setting('test.cp_booking_one')),
  '42501','booking_immutable',
  'and the owner role without the GUC is refused by the guard itself');
rollback to savepoint cp_append_only;

-- ---------------------------------------------------------------------------
-- Tenant offboarding is ordered, and the order is the safety property.
savepoint cp_offboarding;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;

select throws_ok(
  $$select * from api_v1.advance_tenant_offboarding_v1('a0000000-0000-0000-0000-000000000001','delete_primary')$$,
  '42501','offboarding_sequence',
  'a tenant cannot be deleted without first passing the phase that preserved an export');
select throws_ok(
  $$select * from api_v1.advance_tenant_offboarding_v1('a0000000-0000-0000-0000-000000000001','burn_it')$$,
  '42501','offboarding_sequence','a phase outside the vocabulary is not a phase');
select is((select o.phase from api_v1.advance_tenant_offboarding_v1(
  'a0000000-0000-0000-0000-000000000001','restrict_bookings') o),'restrict_bookings',
  'the first phase is restricting new bookings');
reset role;
select set_config('request.jwt.claims',null,true);
select is((select t.status from app.tenants t where t.id='a0000000-0000-0000-0000-000000000001'),
  'suspended','which stops the tenant through the status column every isolation helper already reads');

select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select o.status from api_v1.advance_tenant_offboarding_v1(
  'a0000000-0000-0000-0000-000000000001','restrict_bookings') o),'completed',
  'replaying the phase just completed is a no-op rather than an error');
select is((select o.phase from api_v1.advance_tenant_offboarding_v1(
  'a0000000-0000-0000-0000-000000000001','preserve_export') o),'preserve_export',
  'then export is preserved');
select is((select o.phase from api_v1.advance_tenant_offboarding_v1(
  'a0000000-0000-0000-0000-000000000001','close_instance') o),'close_instance',
  'then the instance closes');

-- A hold anywhere in the tenant stops the destructive phase.
select * from api_v1.set_legal_hold_v1('a0000000-0000-0000-0000-000000000001',null,true,'Regulator request.');
select is((select array[o.status,o.blocked_reason] from api_v1.advance_tenant_offboarding_v1(
  'a0000000-0000-0000-0000-000000000001','delete_primary') o),
  array['blocked','legal_hold_active'],
  'and primary deletion is refused while any hold in the tenant is live');
reset role;
select set_config('request.jwt.claims',null,true);
select is((select t.status from app.tenants t where t.id='a0000000-0000-0000-0000-000000000001'),
  'closed','the tenant stays where the last completed phase left it');

select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select * from api_v1.set_legal_hold_v1('a0000000-0000-0000-0000-000000000001',null,false,'Released.');
select is((select o.phase from api_v1.advance_tenant_offboarding_v1(
  'a0000000-0000-0000-0000-000000000001','delete_primary') o),'delete_primary',
  'once the hold is released the sequence continues from where it stopped');
select is((select o.phase from api_v1.advance_tenant_offboarding_v1(
  'a0000000-0000-0000-0000-000000000001','retain_evidence') o),'retain_evidence',
  'and ends by retaining only lawful evidence');
reset role;
select set_config('request.jwt.claims',null,true);

-- Ending a tenant is an owner action with a step-up, not an admin convenience.
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok(
  $$select * from api_v1.advance_tenant_offboarding_v1('a0000000-0000-0000-0000-000000000001','restrict_bookings')$$,
  '42501','policy_denied','a location manager cannot offboard the tenant');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint cp_offboarding;

-- ---------------------------------------------------------------------------
-- The audit trail is audit-class: readable with the audit capability, and by
-- nobody else, including the role that can see the customer.
savepoint cp_audit_scope;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select * from api_v1.set_customer_restriction_v1('a0000000-0000-0000-0000-000000000001',
  current_setting('test.cp_customer')::uuid,true,'Recorded.');
select is((select count(*)::integer from api_v1.list_privacy_requests_v1(
  'a0000000-0000-0000-0000-000000000001')),1,
  'an admin holding audit.read sees the privacy trail');
reset role;
select set_config('request.jwt.claims',null,true);

-- A scheduler holds customer.pii.view at tenant scope but no audit.read.
select set_config('request.jwt.claims','{"sub":"c1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select count(*)::integer from api_v1.search_customers_v1(
  'a0000000-0000-0000-0000-000000000001')),2,
  'a scheduler can still work the directory');
select is((select count(*)::integer from api_v1.list_privacy_requests_v1(
  'a0000000-0000-0000-0000-000000000001')),0,
  'and cannot read who exercised which right, which is a different class of record');
select is((select count(*)::integer from app.legal_holds),0,
  'nor the holds');
select throws_ok(
  format($$select * from api_v1.set_legal_hold_v1('a0000000-0000-0000-0000-000000000001',%L,true,'x')$$,
    current_setting('test.cp_customer')),
  '42501','policy_denied','nor place one');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint cp_audit_scope;

-- The savepoint rollbacks above revert pgTAP's own counter, so it is restored
-- from the non-transactional sequence before the plan is emitted.
select _set('curr_test',(select last_value::integer from __tresults___numb_seq));
select * from finish();
rollback;
