begin;
select no_plan();

-- Issue #17. The appointment lifecycle after confirmation: exactly the §7.1
-- transitions and no others, capability and location scope re-read at the
-- moment of the act, notes that a calendar-only role cannot read, and analytics
-- that come from the committed ledger rather than from anything a UI emitted.

select set_config('test.lc_day',
  (date_trunc('week',statement_timestamp() at time zone 'America/New_York')::date+21)::text,true);
create function pg_temp.lc_time(p_time time)
returns timestamptz language sql stable as $$
  select (current_setting('test.lc_day')::date+p_time) at time zone 'America/New_York';
$$;
do $$ begin
  execute format('grant usage on schema %I to authenticated',pg_my_temp_schema()::regnamespace::text);
end $$;

-- Contract shape.
select has_function('api_v1'::name,'transition_booking_v1'::name,
  array['uuid','uuid','text','bigint','text','uuid','text']);
select has_function('api_v1'::name,'create_booking_on_behalf_v1'::name,
  array['uuid','text','uuid','text','text','jsonb','text','text','jsonb','text','uuid']);
select has_function('api_v1'::name,'add_booking_note_v1'::name,
  array['uuid','uuid','text','text','uuid']);
select has_function('api_v1'::name,'search_bookings_v1'::name,
  array['uuid','timestamp with time zone','timestamp with time zone','text','text','uuid','uuid']);
select has_function('api_v1'::name,'get_booking_detail_v1'::name,array['uuid','uuid']);
select has_function('api_v1'::name,'get_lifecycle_analytics_v1'::name,
  array['uuid','timestamp with time zone','timestamp with time zone']);
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='api_v1' and p.prosecdef and p.proname in (
    'transition_booking_v1','create_booking_on_behalf_v1','add_booking_note_v1',
    'search_bookings_v1','get_booking_detail_v1','get_lifecycle_analytics_v1')),
  'every exposed lifecycle wrapper is security invoker');
select ok(not has_function_privilege('anon','api_v1.transition_booking_v1(uuid,uuid,text,bigint,text,uuid,text)','execute')
  and not has_function_privilege('anon','api_v1.add_booking_note_v1(uuid,uuid,text,text,uuid)','execute')
  and not has_function_privilege('anon','api_v1.get_booking_detail_v1(uuid,uuid)','execute')
  and not has_function_privilege('anon','api_v1.search_bookings_v1(uuid,timestamptz,timestamptz,text,text,uuid,uuid)','execute'),
  'no lifecycle surface is anonymous: operating a business is never public');
select ok((select p.provolatile='s' from pg_proc p
  where p.oid='api_v1.get_lifecycle_analytics_v1(uuid,timestamptz,timestamptz)'::regprocedure),
  'the analytics read is stable: reporting can never become a way to act');
select has_table('app'::name,'booking_notes'::name);
select ok((select relrowsecurity from pg_class where oid='app.booking_notes'::regclass),
  'notes carry row level security like every other tenant-owned table');

-- Fixtures: one staff member, one weekly schedule, two bookings. The first
-- booking's service policy carries a wide check-in window so the in-window
-- branch is reachable from a deterministic future date; the second reverts to
-- the default window so the off-window branch is reachable too.
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

update app.catalog_service_revisions
set policy=jsonb_build_object('consent_version','1','consent_text','Terms.',
  'check_in_window_minutes',100000)
where tenant_id='a0000000-0000-0000-0000-000000000001' and service_id='a7200000-0000-0000-0000-000000000001';
select set_config('test.hold',(select h.hold_id::text from api_v1.create_hold_v1(
  'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.lc_time('10:00'),
  'session-token-aaaa-0001','idempotency-key-aaaa-0001') h),true);
select set_config('test.booking',(select b.booking_id::text from api_v1.confirm_booking_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.hold')::uuid,
  'session-token-aaaa-0001','confirm-key-aaaa-0001',
  '{"fullName":"Guest A","email":"guest@example.invalid"}'::jsonb,
  '1','en','{}'::jsonb,'Asia/Riyadh') b),true);

update app.catalog_service_revisions
set policy=jsonb_build_object('consent_version','1','consent_text','Terms.')
where tenant_id='a0000000-0000-0000-0000-000000000001' and service_id='a7200000-0000-0000-0000-000000000001';
select set_config('test.hold_two',(select h.hold_id::text from api_v1.create_hold_v1(
  'client.tenant-a.example.invalid','client','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.lc_time('14:00'),
  'session-token-bbbb-0001','idempotency-key-bbbb-0001') h),true);
select set_config('test.booking_two',(select b.booking_id::text from api_v1.confirm_booking_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.hold_two')::uuid,
  'session-token-bbbb-0001','confirm-key-bbbb-0001',
  '{"fullName":"Guest B","email":"guest.b@example.invalid"}'::jsonb,
  '1','en','{}'::jsonb,'Asia/Riyadh') b),true);

-- ---------------------------------------------------------------------------
savepoint lc_happy_path;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;

select throws_ok(
  format($$select * from api_v1.transition_booking_v1('a0000000-0000-0000-0000-000000000001',%L,'complete',1)$$,
    current_setting('test.booking')),
  '42501','transition_not_allowed',
  'a booking cannot skip check-in on its way to completed');
select throws_ok(
  format($$select * from api_v1.transition_booking_v1('a0000000-0000-0000-0000-000000000001',%L,'check_in',9)$$,
    current_setting('test.booking')),
  '23505','revision_conflict','a stale read cannot check anyone in');
select throws_ok(
  format($$select * from api_v1.transition_booking_v1('a0000000-0000-0000-0000-000000000001',%L,'complete',9)$$,
    current_setting('test.booking')),
  '23505','revision_conflict',
  'a stale read is answered as stale even when the action would also be impossible');
select throws_ok(
  format($$select * from api_v1.transition_booking_v1('a0000000-0000-0000-0000-000000000001',%L,'finish',1)$$,
    current_setting('test.booking')),
  '22023','booking_invalid_action','an action outside the vocabulary is not an action');
select is((select array[b.status,b.revision::text] from app.bookings b
  where b.id=current_setting('test.booking')::uuid),
  array['confirmed','1'],
  'every refused transition leaves the booking exactly as it was');

select is((select array[t.status,t.booking_revision::text,t.replayed::text]
  from api_v1.transition_booking_v1('a0000000-0000-0000-0000-000000000001',
    current_setting('test.booking')::uuid,'check_in',1,null,null,'lifecycle-key-aaaa-0001') t),
  array['checked_in','2','false'],'an in-window check-in succeeds and bumps the revision');
select is((select array[t.status,t.booking_revision::text,t.replayed::text]
  from api_v1.transition_booking_v1('a0000000-0000-0000-0000-000000000001',
    current_setting('test.booking')::uuid,'check_in',1,null,null,'lifecycle-key-aaaa-0001') t),
  array['checked_in','2','true'],'a double-clicked check-in is one check-in, replayed');
select is((select count(*)::integer from app.booking_events e
  where e.booking_id=current_setting('test.booking')::uuid and e.event_type='booking_checked_in'),1,
  'the replay appends no second ledger entry');
select is((select array[t.status,t.booking_revision::text]
  from api_v1.transition_booking_v1('a0000000-0000-0000-0000-000000000001',
    current_setting('test.booking')::uuid,'complete',2) t),
  array['completed','3'],'a checked-in booking completes');
select is((select array[e.event_type,e.actor_kind,(e.actor_membership_id is not null)::text,
    (e.effective_actor_id is not null)::text]
  from app.booking_events e where e.booking_id=current_setting('test.booking')::uuid
  order by e.sequence desc limit 1),
  array['booking_completed','member','true','true'],
  'every transition records who acted and on whose authority');
select is((select array[b.payment_status,b.notification_status,b.calendar_status]
  from app.bookings b where b.id=current_setting('test.booking')::uuid),
  array['not_required','queued','pending'],
  'completing a booking never touches payment, notification, or calendar state');

-- Correcting a recorded outcome is a separate authority and must say why.
select throws_ok(
  format($$select * from api_v1.transition_booking_v1('a0000000-0000-0000-0000-000000000001',%L,'correct',3)$$,
    current_setting('test.booking')),
  '22023','booking_reason_required','a correction that overrides history must give a reason');
select is((select array[t.status,t.booking_revision::text]
  from api_v1.transition_booking_v1('a0000000-0000-0000-0000-000000000001',
    current_setting('test.booking')::uuid,'correct',3,'Marked complete on the wrong appointment.') t),
  array['confirmed','4'],'a terminal operational status can be corrected back to confirmed');
select is((select e.reason from app.booking_events e
  where e.booking_id=current_setting('test.booking')::uuid
    and e.event_type='booking_status_corrected'),
  'Marked complete on the wrong appointment.',
  'the correction reason is internal and lives in the ledger');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint lc_happy_path;

-- ---------------------------------------------------------------------------
-- The rest of the §7.1 matrix, walked so that "permitted" and "forbidden" are
-- both stated rather than implied by the paths above.
savepoint lc_matrix;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;

-- confirmed is the only status a correction is not reachable from, because it
-- is the status a correction returns to.
select throws_ok(
  format($$select * from api_v1.transition_booking_v1('a0000000-0000-0000-0000-000000000001',%L,'correct',1,'Nothing to correct.')$$,
    current_setting('test.booking')),
  '42501','transition_not_allowed','a confirmed booking has no recorded outcome to correct');

-- confirmed -> no_show -> confirmed.
select is((select array[t.status,t.booking_revision::text]
  from api_v1.transition_booking_v1('a0000000-0000-0000-0000-000000000001',
    current_setting('test.booking')::uuid,'no_show',1) t),
  array['no_show','2'],'a confirmed booking can be marked a no-show');
select throws_ok(
  format($$select * from api_v1.transition_booking_v1('a0000000-0000-0000-0000-000000000001',%L,'complete',2)$$,
    current_setting('test.booking')),
  '42501','transition_not_allowed','a no-show cannot then be completed');
select throws_ok(
  format($$select * from api_v1.transition_booking_v1('a0000000-0000-0000-0000-000000000001',%L,'check_in',2)$$,
    current_setting('test.booking')),
  '42501','transition_not_allowed','and cannot be checked in without being corrected first');
select is((select t.status from api_v1.transition_booking_v1(
    'a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid,
    'correct',2,'Customer had arrived after all.') t),
  'confirmed','a no-show corrects back to confirmed');

-- checked_in is not a no-show and is not twice.
select is((select t.status from api_v1.transition_booking_v1(
    'a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid,'check_in',3) t),
  'checked_in','the corrected booking checks in normally');
select throws_ok(
  format($$select * from api_v1.transition_booking_v1('a0000000-0000-0000-0000-000000000001',%L,'no_show',4)$$,
    current_setting('test.booking')),
  '42501','transition_not_allowed','somebody who arrived cannot become a no-show');
select throws_ok(
  format($$select * from api_v1.transition_booking_v1('a0000000-0000-0000-0000-000000000001',%L,'check_in',4)$$,
    current_setting('test.booking')),
  '42501','transition_not_allowed','and cannot arrive twice');
select is((select t.status from api_v1.transition_booking_v1(
    'a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid,
    'correct',4,'Checked in the wrong appointment.') t),
  'confirmed','a check-in corrects back to confirmed');

-- A completed booking is not completed again.
select is((select t.status from api_v1.transition_booking_v1(
    'a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid,'check_in',5) t),
  'checked_in','the booking checks in once more');
select is((select t.status from api_v1.transition_booking_v1(
    'a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid,'complete',6) t),
  'completed','and completes');
select throws_ok(
  format($$select * from api_v1.transition_booking_v1('a0000000-0000-0000-0000-000000000001',%L,'complete',7)$$,
    current_setting('test.booking')),
  '42501','transition_not_allowed','a completed booking does not complete again');
select throws_ok(
  format($$select * from api_v1.transition_booking_v1('a0000000-0000-0000-0000-000000000001',%L,'no_show',7)$$,
    current_setting('test.booking')),
  '42501','transition_not_allowed','and never becomes a no-show');
select is((select array[b.payment_status,b.notification_status,b.calendar_status,b.price_minor::text]
  from app.bookings b where b.id=current_setting('test.booking')::uuid),
  (select array[b.payment_status,b.notification_status,b.calendar_status,b.price_minor::text]
   from app.bookings b where b.id=current_setting('test.booking_two')::uuid),
  'the whole walk moved nothing but the operational status');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint lc_matrix;

-- ---------------------------------------------------------------------------
savepoint lc_cancel_not_correctable;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select lives_ok(format(
  $$select * from api_v1.cancel_booking_v1('a0000000-0000-0000-0000-000000000001',%L,1)$$,
  current_setting('test.booking')),'a confirmed booking cancels');
select throws_ok(
  format($$select * from api_v1.transition_booking_v1('a0000000-0000-0000-0000-000000000001',%L,'correct',2,'Cancelled by mistake.')$$,
    current_setting('test.booking')),
  '42501','transition_not_allowed',
  'a cancellation released the capacity, so it is not correctable into a booking');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint lc_cancel_not_correctable;

-- ---------------------------------------------------------------------------
savepoint lc_window;
-- A member granted check-in but not the override cannot check anyone in
-- outside the booking's own snapshotted window.
update app.role_permissions set scope_kind='tenant'
where tenant_id='a0000000-0000-0000-0000-000000000001'
  and role_id='a2000000-0000-0000-0000-000000000001'
  and permission_key='booking.check_in';
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok(
  format($$select * from api_v1.transition_booking_v1('a0000000-0000-0000-0000-000000000001',%L,'check_in',1)$$,
    current_setting('test.booking_two')),
  '42501','policy_denied','arriving weeks early is not arriving');
reset role;
select set_config('request.jwt.claims',null,true);
insert into app.role_permissions(tenant_id,role_id,permission_key,grant_kind,scope_kind)
values ('a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001',
  'booking.check_in_override','direct','tenant');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select t.status from api_v1.transition_booking_v1(
    'a0000000-0000-0000-0000-000000000001',current_setting('test.booking_two')::uuid,'check_in',1) t),
  'checked_in','the override exists precisely so an off-window arrival stays possible');
select is((select (e.metadata->>'off_window') from app.booking_events e
  where e.booking_id=current_setting('test.booking_two')::uuid and e.event_type='booking_checked_in'),
  'true','the ledger records that the window was overridden, not just that it happened');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint lc_window;

-- ---------------------------------------------------------------------------
savepoint lc_unauthorized;
-- The seeded staff role holds booking.check_in at 'own' scope, which grants no
-- authority over another person's appointment.
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok(
  format($$select * from api_v1.transition_booking_v1('a0000000-0000-0000-0000-000000000001',%L,'check_in',1)$$,
    current_setting('test.booking')),
  '42501','policy_denied','a scope that grants nothing here grants nothing here');
select throws_ok(
  format($$select * from api_v1.transition_booking_v1('a0000000-0000-0000-0000-000000000001',%L,'correct',1,'Because.')$$,
    current_setting('test.booking')),
  '42501','policy_denied','correcting a status is its own grant, not a bonus on check-in');
reset role;
select set_config('request.jwt.claims',null,true);

-- Cross-tenant. Tenant B's admin asking about tenant B's bookings never finds
-- tenant A's, and never learns that it exists.
select set_config('request.jwt.claims','{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok(
  format($$select * from api_v1.transition_booking_v1('b0000000-0000-0000-0000-000000000001',%L,'check_in',1)$$,
    current_setting('test.booking')),
  '42501','booking_context_required','a booking in another tenant does not exist');
select is((select count(*)::integer from api_v1.search_bookings_v1(
  'a0000000-0000-0000-0000-000000000001')),0,
  'the search read is row level security, not a filter a caller can widen');
reset role;
select set_config('request.jwt.claims',null,true);
select is((select array[b.status,b.revision::text] from app.bookings b
  where b.id=current_setting('test.booking')::uuid),
  array['confirmed','1'],'no unauthorized or cross-tenant attempt left a partial effect');
rollback to savepoint lc_unauthorized;

-- ---------------------------------------------------------------------------
savepoint lc_notes;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select n.visibility from api_v1.add_booking_note_v1(
    'a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid,
    'operational','Customer will arrive by the side entrance.') n),
  'operational','an operator with booking.view.any may annotate a booking');
select is((select n.visibility from api_v1.add_booking_note_v1(
    'a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid,
    'sensitive','Declared a medical condition relevant to the treatment.') n),
  'sensitive','a member entitled to customer data may record a sensitive note');
select is((select jsonb_array_length(d.notes) from api_v1.get_booking_detail_v1(
    'a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid) d),2,
  'the entitled reader sees both classes of note on the detail');
select is((select count(*)::integer from app.booking_events e
  where e.booking_id=current_setting('test.booking')::uuid and e.event_type='booking_note_added'),2,
  'the ledger records that notes were added');
select is((select count(*)::integer from app.booking_events e
  where e.booking_id=current_setting('test.booking')::uuid
    and e.event_type='booking_note_added'
    and e.metadata::text like '%medical%'),0,
  'the ledger never repeats what a note says');
reset role;
select set_config('request.jwt.claims',null,true);

-- The seeded staff role holds customer.pii.view at 'own' scope only, which is
-- exactly the calendar-only reader the requirement is about.
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select count(*)::integer from app.booking_notes n
  where n.booking_id=current_setting('test.booking')::uuid),1,
  'a calendar-only reader sees the operational note and not the sensitive one');
select is((select n.visibility from app.booking_notes n
  where n.booking_id=current_setting('test.booking')::uuid),'operational',
  'seeing a booking never reveals a sensitive note');
select is((select d.customer_full_name from api_v1.get_booking_detail_v1(
    'a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid) d),
  null,'the same detail read hides the customer from a reader not entitled to it');
select throws_ok(
  format($$select * from api_v1.add_booking_note_v1('a0000000-0000-0000-0000-000000000001',%L,'sensitive','Attempted.')$$,
    current_setting('test.booking')),
  '42501','policy_denied','a reader who cannot see sensitive notes cannot write one');
reset role;
select set_config('request.jwt.claims',null,true);

select throws_ok(
  format($$update app.booking_notes set body='Rewritten.' where booking_id=%L$$,
    current_setting('test.booking')),
  '42501','booking_immutable','a note records what was observed and is never rewritten');
select throws_ok(
  format($$delete from app.booking_notes where booking_id=%L$$,current_setting('test.booking')),
  '42501','booking_immutable','and is never deleted');
rollback to savepoint lc_notes;

-- ---------------------------------------------------------------------------
savepoint lc_on_behalf;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select set_config('test.staff_hold',(select h.hold_id::text from api_v1.create_hold_v1(
  'dashboard.tenant-a.example.invalid','dashboard','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.lc_time('11:00'),
  'session-token-cccc-0001','idempotency-key-cccc-0001') h),true);
select set_config('test.staff_booking',(select b.booking_id::text
  from api_v1.create_booking_on_behalf_v1(
    'a0000000-0000-0000-0000-000000000001','dashboard.tenant-a.example.invalid',
    current_setting('test.staff_hold')::uuid,'session-token-cccc-0001','confirm-key-cccc-0001',
    '{"fullName":"Walk In","email":"walkin@example.invalid"}'::jsonb,
    '1','en','{}'::jsonb,'America/New_York') b),true);
reset role;
select set_config('request.jwt.claims',null,true);
select is((select b.status from app.bookings b where b.id=current_setting('test.staff_booking')::uuid),
  'confirmed','a staff-created booking is an ordinary confirmed booking');
select is((select count(*)::integer from app.assignment_allocations a
  where a.hold_id=current_setting('test.staff_hold')::uuid and a.state='confirmed'),1,
  'it occupies capacity through the same allocation ledger, so it cannot overbook');
select is((select count(*)::integer from app.outbox_events o
  where o.booking_id=current_setting('test.staff_booking')::uuid and o.topic='booking.confirmed'),1,
  'it enqueues the same confirmation intent a customer booking does');
select is((select array[b.consent_version,(b.policy_snapshot is not null)::text]
  from app.bookings b where b.id=current_setting('test.staff_booking')::uuid),
  array['1','true'],'it snapshots policy and consent exactly as a customer booking does');
select is((select e.actor_kind from app.booking_events e
  where e.booking_id=current_setting('test.staff_booking')::uuid
    and e.event_type='booking_created_on_behalf'),
  'member','authorship is recorded as a separate ledger entry');

-- Without booking.create_on_behalf at an effective scope there is no staff path.
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select set_config('test.denied_hold',(select h.hold_id::text from api_v1.create_hold_v1(
  'dashboard.tenant-a.example.invalid','dashboard','a7200000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',pg_temp.lc_time('15:00'),
  'session-token-dddd-0001','idempotency-key-dddd-0001') h),true);
select throws_ok(
  format($$select * from api_v1.create_booking_on_behalf_v1(
    'a0000000-0000-0000-0000-000000000001','dashboard.tenant-a.example.invalid',%L,
    'session-token-dddd-0001','confirm-key-dddd-0001',
    '{"fullName":"Walk In","email":"walkin2@example.invalid"}'::jsonb,'1')$$,
    current_setting('test.denied_hold')),
  '42501','policy_denied','holding a slot is not authority to book on someone else''s behalf');
reset role;
select set_config('request.jwt.claims',null,true);
select is((select count(*)::integer from app.bookings b
  where b.hold_id=current_setting('test.denied_hold')::uuid),0,
  'the denied attempt created no booking');
rollback to savepoint lc_on_behalf;

-- ---------------------------------------------------------------------------
savepoint lc_reads;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select t.status from api_v1.transition_booking_v1(
    'a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid,'check_in',1) t),
  'checked_in','the reads below observe a booking that was just checked in');
select is((select array_agg(distinct t.queue) from api_v1.get_today_workspace_v1(
    'a0000000-0000-0000-0000-000000000001',pg_temp.lc_time('00:00'),pg_temp.lc_time('23:59')) t),
  array['arrivals'],
  'a checked-in appointment is still one of today''s arrivals');
select ok((select count(*) from api_v1.list_calendar_v1(
    'a0000000-0000-0000-0000-000000000001',pg_temp.lc_time('00:00'),pg_temp.lc_time('23:59')))=2,
  'checking someone in never makes their appointment vanish from the calendar');
select is((select s.status from api_v1.search_bookings_v1(
    'a0000000-0000-0000-0000-000000000001',null,null,'Guest A') s),
  'checked_in','search finds a booking by the customer an entitled reader may see');
select is((select count(*)::integer from api_v1.search_bookings_v1(
    'a0000000-0000-0000-0000-000000000001',null,null,null,'checked_in')),1,
  'the status filter narrows to the one appointment in that state');
select is((select count(*)::integer from api_v1.search_bookings_v1(
    'a0000000-0000-0000-0000-000000000001',null,null,'no-such-reference')),0,
  'a query that matches nothing returns nothing rather than everything');
select is((select jsonb_array_length(d.history) from api_v1.get_booking_detail_v1(
    'a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid) d),2,
  'the detail shows the confirmation and the check-in as status history');
select is((select array[d.status,d.customer_full_name] from api_v1.get_booking_detail_v1(
    'a0000000-0000-0000-0000-000000000001',current_setting('test.booking')::uuid) d),
  array['checked_in','Guest A'],'the detail carries the live status and the customer context');

-- Analytics are the ledger, counted. Nothing here reads a UI event.
select is((select a.event_count from api_v1.get_lifecycle_analytics_v1(
    'a0000000-0000-0000-0000-000000000001') a where a.event_type='booking_checked_in'),
  1::bigint,'the analytics read counts exactly the committed check-in');
select is((select a.event_count from api_v1.get_lifecycle_analytics_v1(
    'a0000000-0000-0000-0000-000000000001') a where a.event_type='booking_confirmed'),
  2::bigint,'and exactly the committed confirmations');
select is((select sum(a.event_count)::bigint from api_v1.get_lifecycle_analytics_v1(
    'a0000000-0000-0000-0000-000000000001') a),
  (select count(*) from app.booking_events e
    where e.tenant_id='a0000000-0000-0000-0000-000000000001' and e.outcome='succeeded'),
  'every committed transition is counted once and nothing else is');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint lc_reads;

-- ---------------------------------------------------------------------------
-- Deactivating someone with future work still demands an explicit decision.
-- That contract is issue #8's; this asserts the lifecycle did not erode it.
savepoint lc_deactivation;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok(
  $$select * from api_v1.deactivate_staff_v1('a0000000-0000-0000-0000-000000000001',
    'a8000000-0000-0000-0000-000000000001',null,null,
    '00000000-0000-0000-0000-0000000000aa','Leaving.')$$,
  '22023','deactivation_resolution_required',
  'nobody is deactivated out from under a future appointment by default');
select is((select d.remaining_allocations from api_v1.deactivate_staff_v1(
    'a0000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001',
    'defer',null,'00000000-0000-0000-0000-0000000000ab','Leaving.') d),
  2,'an explicit decision names how many future allocations it accepted');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint lc_deactivation;

-- The savepoint rollbacks above revert pgTAP's own counter, so it is restored
-- from the non-transactional sequence before the plan is emitted.
select _set('curr_test',(select last_value::integer from __tresults___numb_seq));
select * from finish();

rollback;
