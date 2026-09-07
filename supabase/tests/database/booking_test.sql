begin;
select no_plan();

-- Issue #12. The no-payment tracer: contract, snapshot immutability, lineage,
-- outbox intent, idempotent duplicate submission, and RLS in both directions.
-- Contention across parallel sessions stays in tests/concurrency.

select set_config('test.booking_day',
  (date_trunc('week',statement_timestamp() at time zone 'America/New_York')::date+14)::text,true);
create function pg_temp.booking_time(p_time time)
returns timestamptz language sql stable as $$
  select (current_setting('test.booking_day')::date+p_time) at time zone 'America/New_York';
$$;
do $$ begin
  execute format('grant usage on schema %I to authenticated',pg_my_temp_schema()::regnamespace::text);
end $$;

select has_table('app'::name,'bookings'::name);
select has_table('app'::name,'booking_contacts'::name);
select has_table('app'::name,'booking_intake_answers'::name);
select has_table('app'::name,'booking_events'::name);
select has_table('app'::name,'outbox_events'::name);
select ok((select relrowsecurity from pg_class where oid='app.bookings'::regclass),'bookings require RLS');
select ok((select relrowsecurity from pg_class where oid='app.booking_contacts'::regclass),'contacts require RLS');
select ok((select relrowsecurity from pg_class where oid='app.booking_intake_answers'::regclass),'intake answers require RLS');
select ok((select relrowsecurity from pg_class where oid='app.booking_events'::regclass),'booking lineage requires RLS');
select ok((select relrowsecurity from pg_class where oid='app.outbox_events'::regclass),'the outbox requires RLS');
select ok(not exists(
  select 1 from (values ('anon'),('authenticated')) principals(role_name)
  cross join (values ('app.bookings'),('app.booking_contacts'),('app.booking_intake_answers'),('app.booking_events'),('app.outbox_events')) tables(table_name)
  cross join (values ('INSERT'),('UPDATE'),('DELETE')) commands(privilege)
  where has_table_privilege(principals.role_name,tables.table_name,commands.privilege)
),'no application role can write booking state directly');
select ok(not has_table_privilege('anon','app.bookings','SELECT')
  and not has_table_privilege('anon','app.outbox_events','SELECT')
  and not has_table_privilege('authenticated','app.outbox_events','SELECT'),
  'anonymous callers read no booking state and nobody reads the outbox directly');

select has_function('api_v1'::name,'confirm_booking_v1'::name,
  array['text','text','uuid','text','text','jsonb','text','text','jsonb','text']);
select has_function('api_v1'::name,'get_hold_form_v1'::name,
  array['text','text','uuid','text','text']);
select has_function('api_v1'::name,'list_bookings_v1'::name,
  array['uuid','timestamp with time zone','timestamp with time zone']);
select ok(has_function_privilege('anon','api_v1.confirm_booking_v1(text,text,uuid,text,text,jsonb,text,text,jsonb,text)','execute'),
  'a guest can confirm without an account');
select ok(not has_function_privilege('anon','api_v1.list_bookings_v1(uuid,timestamptz,timestamptz)','execute'),
  'the Dashboard booking list is never anonymous');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='api_v1' and p.prosecdef
    and p.proname in ('confirm_booking_v1','list_bookings_v1','get_hold_form_v1')),
  'every exposed booking wrapper is security invoker');

-- The same holdable fixture the hold suite uses: one staff member, one civil
-- weekly schedule, and the seeded published 45-minute service.
insert into app.staff_profiles(id,tenant_id,public_name)
values ('a8000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Available staff');
insert into app.staff_services(tenant_id,staff_id,service_id)
values ('a0000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001');
insert into app.staff_locations(tenant_id,staff_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001');
insert into app.staff_service_locations(tenant_id,staff_id,service_id,location_id)
values ('a0000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001');
insert into app.schedule_scopes(id,tenant_id,scope_kind,location_id,staff_id,time_zone)
values ('a8100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','staff','a5000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001','America/New_York');
insert into app.weekly_schedules(id,tenant_id,schedule_scope_id,day_of_week,start_minute,end_minute)
values ('a8200000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a8100000-0000-0000-0000-000000000001',1,540,1020);

-- A published policy and one required intake question, so consent and intake
-- are exercised rather than defaulted.
update app.catalog_service_revisions
set policy=jsonb_build_object('consent_version','2','consent_text','Cancellations are free up to 24 hours before.'),
    intake_schema='{"fields":[{"key":"reason","label":"Reason for visit","required":true,"maxLength":500}]}'::jsonb
where tenant_id='a0000000-0000-0000-0000-000000000001' and service_id='a7200000-0000-0000-0000-000000000001';

select set_config('test.hold_id',(select h.hold_id::text from api_v1.create_hold_v1(
  'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.booking_time('10:00'),
  'session-token-aaaa-0001','idempotency-key-aaaa-0001') h),true);

-- The details step reads the consent text and questions of exactly the
-- publication the hold captured, and only for the session that owns the hold.
select is((select array[f.consent_version,f.consent_text,f.intake_schema->'fields'->0->>'key']
  from api_v1.get_hold_form_v1('client.tenant-a.example.invalid','client',
    current_setting('test.hold_id')::uuid,'session-token-aaaa-0001','en') f),
  array['2','Cancellations are free up to 24 hours before.','reason'],
  'the hold form carries the published consent text and intake questions');
select throws_ok(
  format($$select * from api_v1.get_hold_form_v1('client.tenant-a.example.invalid','client',%L,'session-token-wrong-01','en')$$,current_setting('test.hold_id')),
  '42501','booking_context_required','another session cannot read the hold form');

select throws_ok(
  format($$select * from api_v1.confirm_booking_v1('client.tenant-a.example.invalid','client',%L,'session-token-aaaa-0001','confirm-key-aaaa-0001','{"fullName":"Guest A","email":"not-an-email"}'::jsonb,'2','en','{"reason":"First visit"}'::jsonb,'Asia/Riyadh')$$,current_setting('test.hold_id')),
  '22023','booking_invalid_contact','a malformed contact is refused before anything is stored');
select throws_ok(
  format($$select * from api_v1.confirm_booking_v1('client.tenant-a.example.invalid','client',%L,'session-token-aaaa-0001','confirm-key-aaaa-0001','{"fullName":"Guest A","email":"guest@example.invalid","marketingOptIn":"yes"}'::jsonb,'2','en','{"reason":"First visit"}'::jsonb,'Asia/Riyadh')$$,current_setting('test.hold_id')),
  '22023','booking_invalid_contact','a contact field the booking purpose never declared is refused');
select throws_ok(
  format($$select * from api_v1.confirm_booking_v1('client.tenant-a.example.invalid','client',%L,'session-token-aaaa-0001','confirm-key-aaaa-0001','{"fullName":"Guest A","email":"guest@example.invalid"}'::jsonb,'2','en','{"unknown":"x"}'::jsonb,'Asia/Riyadh')$$,current_setting('test.hold_id')),
  '22023','booking_invalid_intake','an answer to a question the tenant never published is refused');
select throws_ok(
  format($$select * from api_v1.confirm_booking_v1('client.tenant-a.example.invalid','client',%L,'session-token-aaaa-0001','confirm-key-aaaa-0001','{"fullName":"Guest A","email":"guest@example.invalid"}'::jsonb,'2','en','{}'::jsonb,'Asia/Riyadh')$$,current_setting('test.hold_id')),
  '22023','booking_invalid_intake','a missing required answer is refused');
select throws_ok(
  format($$select * from api_v1.confirm_booking_v1('client.tenant-a.example.invalid','client',%L,'session-token-wrong-01','confirm-key-aaaa-0001','{"fullName":"Guest A","email":"guest@example.invalid"}'::jsonb,'2','en','{"reason":"First visit"}'::jsonb,'Asia/Riyadh')$$,current_setting('test.hold_id')),
  '42501','booking_context_required','a hold cannot be confirmed by another session');
select throws_ok(
  format($$select * from api_v1.confirm_booking_v1('client.tenant-b.example.invalid','client',%L,'session-token-aaaa-0001','confirm-key-aaaa-0001','{"fullName":"Guest A","email":"guest@example.invalid"}'::jsonb,'2','en','{"reason":"First visit"}'::jsonb,'Asia/Riyadh')$$,current_setting('test.hold_id')),
  '42501','booking_context_required','another tenant cannot confirm this tenant hold');
select throws_ok(
  format($$select * from api_v1.confirm_booking_v1('client.tenant-a.example.invalid','client',%L,'session-token-aaaa-0001','confirm-key-aaaa-0001','{"fullName":"Guest A","email":"guest@example.invalid"}'::jsonb,'1','en','{"reason":"First visit"}'::jsonb,'Asia/Riyadh')$$,current_setting('test.hold_id')),
  '42501','policy_denied','consenting to a superseded policy version is refused');
select is((select count(*)::integer from app.bookings),0,'no rejected attempt left a booking behind');
select is((select h.state from app.booking_holds h where h.id=current_setting('test.hold_id')::uuid),
  'active','a rejected confirmation leaves the hold intact');

savepoint payment_and_approval;
update app.catalog_service_revisions set payment_mode='full'
where tenant_id='a0000000-0000-0000-0000-000000000001' and service_id='a7200000-0000-0000-0000-000000000001';
select throws_ok(
  format($$select * from api_v1.confirm_booking_v1('client.tenant-a.example.invalid','client',%L,'session-token-aaaa-0001','confirm-key-aaaa-0001','{"fullName":"Guest A","email":"guest@example.invalid"}'::jsonb,'2','en','{"reason":"First visit"}'::jsonb,'Asia/Riyadh')$$,current_setting('test.hold_id')),
  '23505','payment_pending','a service that needs payment is not confirmed by this tracer');
rollback to savepoint payment_and_approval;
savepoint approval_required;
update app.catalog_service_revisions set approval_required=true
where tenant_id='a0000000-0000-0000-0000-000000000001' and service_id='a7200000-0000-0000-0000-000000000001';
select throws_ok(
  format($$select * from api_v1.confirm_booking_v1('client.tenant-a.example.invalid','client',%L,'session-token-aaaa-0001','confirm-key-aaaa-0001','{"fullName":"Guest A","email":"guest@example.invalid"}'::jsonb,'2','en','{"reason":"First visit"}'::jsonb,'Asia/Riyadh')$$,current_setting('test.hold_id')),
  '42501','policy_denied','a service the tenant approves is not silently confirmed');
rollback to savepoint approval_required;

savepoint expired_hold;
update app.booking_holds set expires_at=statement_timestamp()-interval '1 second'
where id=current_setting('test.hold_id')::uuid;
select throws_ok(
  format($$select * from api_v1.confirm_booking_v1('client.tenant-a.example.invalid','client',%L,'session-token-aaaa-0001','confirm-key-aaaa-0001','{"fullName":"Guest A","email":"guest@example.invalid"}'::jsonb,'2','en','{"reason":"First visit"}'::jsonb,'Asia/Riyadh')$$,current_setting('test.hold_id')),
  '23P01','slot_unavailable','an expired hold no longer confirms a booking');
select is((select count(*)::integer from app.bookings),0,'the expired race leaves no partial booking');
rollback to savepoint expired_hold;

-- The committed tracer.
select set_config('test.booking_id',(select b.booking_id::text from api_v1.confirm_booking_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.hold_id')::uuid,
  'session-token-aaaa-0001','confirm-key-aaaa-0001',
  '{"fullName":"Guest A","email":"Guest.A@Example.invalid","phone":"+966 55 000 0000"}'::jsonb,
  '2','en','{"reason":"First visit"}'::jsonb,'Asia/Riyadh') b),true);

select is((select array[b.status,b.approval_status,b.payment_status,b.notification_status,
    b.calendar_status,b.price_minor::text,b.currency,b.duration_minutes::text,b.consent_version,
    b.locale,b.location_time_zone,b.customer_time_zone,b.revision::text]
  from app.bookings b where b.id=current_setting('test.booking_id')::uuid),
  array['confirmed','not_required','not_required','queued','pending','18000','SAR','45','2','en',
    'America/New_York','Asia/Riyadh','1'],
  'the confirmation snapshots price, policy, locale, and timezone with provider state kept separate');
select matches((select b.public_reference from app.bookings b where b.id=current_setting('test.booking_id')::uuid),
  '^[0-9A-HJ-NP-Z]{10}$','the customer reference avoids confusable characters');
select is((select array[a.state] from app.assignment_allocations a
  where a.hold_id=current_setting('test.hold_id')::uuid),array['confirmed'],
  'the held allocation is promoted rather than re-allocated');
select is((select h.state from app.booking_holds h where h.id=current_setting('test.hold_id')::uuid),
  'released','the hold stops holding capacity once its booking exists');
select is((select array[c.full_name,c.email,c.phone] from app.booking_contacts c
  where c.booking_id=current_setting('test.booking_id')::uuid),
  array['Guest A','guest.a@example.invalid','+966 55 000 0000'],
  'contact details are normalized and stored outside the booking row');
select is((select i.answers->>'reason' from app.booking_intake_answers i
  where i.booking_id=current_setting('test.booking_id')::uuid),'First visit',
  'intake answers are stored separately from ordinary calendar data');
select is((select array[e.event_type,e.actor_kind,e.outcome,e.booking_revision::text]
  from app.booking_events e where e.booking_id=current_setting('test.booking_id')::uuid),
  array['booking_confirmed','guest','succeeded','1'],
  'the same commit records immutable booking lineage');
select ok(not exists(select 1 from app.booking_events e
  where e.booking_id=current_setting('test.booking_id')::uuid
    and (e.metadata::text like '%guest.a@example.invalid%' or e.metadata::text like '%First visit%')),
  'booking lineage carries no contact detail or intake answer');
select is((select array[o.topic,o.state,o.payload->>'public_reference'] from app.outbox_events o
  where o.booking_id=current_setting('test.booking_id')::uuid),
  array['booking.confirmed','pending',(select b.public_reference from app.bookings b where b.id=current_setting('test.booking_id')::uuid)],
  'provider work is an intent recorded in the same commit, not a call');
select ok(not exists(select 1 from app.outbox_events o
  where o.booking_id=current_setting('test.booking_id')::uuid
    and o.payload::text like '%guest.a@example.invalid%'),
  'the outbox intent carries no contact detail');
select is(
  (select count(*)::integer from api_v1.get_availability_v1('client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001',null,pg_temp.booking_time('09:00'),pg_temp.booking_time('18:00'),1,'America/New_York') where result_kind='slot'),
  25,'the confirmed booking keeps its capacity out of public availability');

-- Duplicate submission, changed submission, and a hold that is already spent.
select is((select array[b.booking_id::text,b.replayed::text] from api_v1.confirm_booking_v1(
    'client.tenant-a.example.invalid','client',current_setting('test.hold_id')::uuid,
    'session-token-aaaa-0001','confirm-key-aaaa-0001',
    '{"fullName":"Guest A","email":"Guest.A@Example.invalid","phone":"+966 55 000 0000"}'::jsonb,
    '2','en','{"reason":"First visit"}'::jsonb,'Asia/Riyadh') b),
  array[current_setting('test.booking_id'),'true'],
  'a duplicate submission replays the one committed booking');
select is((select count(*)::integer from app.bookings),1,'the replay created no second booking');
select is((select count(*)::integer from app.outbox_events),1,'the replay enqueued no second confirmation');
select throws_ok(
  format($$select * from api_v1.confirm_booking_v1('client.tenant-a.example.invalid','client',%L,'session-token-aaaa-0001','confirm-key-aaaa-0001','{"fullName":"Guest B","email":"guest.b@example.invalid"}'::jsonb,'2','en','{"reason":"First visit"}'::jsonb,'Asia/Riyadh')$$,current_setting('test.hold_id')),
  '23505','idempotency_conflict','the same key with different details is an honest conflict');
select throws_ok(
  format($$select * from api_v1.confirm_booking_v1('client.tenant-a.example.invalid','client',%L,'session-token-aaaa-0001','confirm-key-aaaa-0002','{"fullName":"Guest A","email":"guest.a@example.invalid"}'::jsonb,'2','en','{"reason":"First visit"}'::jsonb,'Asia/Riyadh')$$,current_setting('test.hold_id')),
  '23P01','slot_unavailable','a hold that already produced a booking cannot produce a second one');

-- Snapshots outlive later tenant edits, and nothing rewrites a committed row.
update app.catalog_service_revisions set price_minor=99000,name='Renamed consultation',
  policy=jsonb_build_object('consent_version','3','consent_text','New terms.')
where tenant_id='a0000000-0000-0000-0000-000000000001' and service_id='a7200000-0000-0000-0000-000000000001';
select is((select array[b.price_minor::text,b.service_name,b.consent_version,b.consent_text]
  from app.bookings b where b.id=current_setting('test.booking_id')::uuid),
  array['18000','Initial consultation','2','Cancellations are free up to 24 hours before.'],
  'a later catalog edit never rewrites a booking that already exists');
select throws_ok(
  format($$update app.bookings set price_minor=1 where id=%L$$,current_setting('test.booking_id')),
  '42501','booking_immutable','a snapshot column cannot be rewritten');
select throws_ok(
  format($$delete from app.bookings where id=%L$$,current_setting('test.booking_id')),
  '42501','booking_immutable','a committed booking cannot be deleted');
select throws_ok(
  format($$update app.booking_events set outcome='failed' where booking_id=%L$$,current_setting('test.booking_id')),
  '42501','booking_immutable','booking lineage is append only');
select lives_ok(
  format($$update app.bookings set notification_status='delivered',updated_at=statement_timestamp() where id=%L$$,current_setting('test.booking_id')),
  'provider state moves without touching the snapshot');

-- A superseded publication is a conflict rather than a silent reprice.
savepoint superseded;
select set_config('test.hold_two',(select h.hold_id::text from api_v1.create_hold_v1(
  'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.booking_time('12:00'),
  'session-token-bbbb-0001','idempotency-key-bbbb-0001') h),true);
-- Only one publication is published per tenant, so the newer one replaces it.
update app.catalog_publications set state='retired',published_at=null,published_by=null
where tenant_id='a0000000-0000-0000-0000-000000000001' and id='a7000000-0000-0000-0000-000000000001';
insert into app.catalog_publications(id,tenant_id,revision,state,published_at,published_by)
values ('a7000000-0000-0000-0000-000000000009','a0000000-0000-0000-0000-000000000001',2,'published','2026-09-08 00:00+00','a1000000-0000-0000-0000-000000000002');
select throws_ok(
  format($$select * from api_v1.confirm_booking_v1('client.tenant-a.example.invalid','client',%L,'session-token-bbbb-0001','confirm-key-bbbb-0001','{"fullName":"Guest B","email":"guest.b@example.invalid"}'::jsonb,'2','en','{"reason":"Second visit"}'::jsonb,'Asia/Riyadh')$$,current_setting('test.hold_two')),
  '23505','revision_conflict','a hold that read a superseded publication is refused');
rollback to savepoint superseded;

-- RLS in both directions, and the minimal Dashboard DTO.
-- Anonymous callers hold no SELECT grant at all (asserted above), so RLS is
-- exercised through the two member roles that do.
savepoint booking_rls;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select count(*)::integer from app.bookings),0,'another tenant member sees no booking of this tenant');
reset role;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select count(*)::integer from app.bookings),1,'a scoped tenant admin sees the booking');
select is((select count(*)::integer from app.booking_contacts),1,'the PII capability reads contact details');
select is((select array[l.status,l.has_intake::text,(l.staff_id is not null)::text]
  from api_v1.list_bookings_v1('a0000000-0000-0000-0000-000000000001',null,null) l),
  array['confirmed','true','true'],'the Dashboard DTO reports the booking and that intake exists');
select ok(not exists(select 1 from jsonb_object_keys(to_jsonb((select x from api_v1.list_bookings_v1('a0000000-0000-0000-0000-000000000001',null,null) x))) key
  where key in ('full_name','email','phone','answers','intake_schema_snapshot')),
  'the Dashboard DTO reveals no contact detail or intake answer');
reset role;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select count(*)::integer from app.booking_contacts),0,
  'a member without the tenant-scoped PII capability reads no contact details');
select is((select count(*)::integer from app.booking_intake_answers),0,
  'a member without the tenant-scoped PII capability reads no intake answers');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint booking_rls;

-- Savepoint rollbacks revert pgTAP's counter, which lives in a temporary table,
-- but not the test numbering, which comes from a temporary sequence. Re-sync the
-- count so the emitted plan matches the tests that actually ran.
select _set('curr_test',(select last_value::integer from __tresults___numb_seq));
select * from finish();

rollback;
