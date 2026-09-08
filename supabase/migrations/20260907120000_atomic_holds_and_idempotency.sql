-- Issue #11: turn advisory availability into race-safe reservations. Overlap is
-- decided by the assignment_allocations exclusion constraints introduced with
-- issue #9; this migration only adds the hold lifecycle, durable idempotency,
-- expiry, and abuse limits around them.
--
-- Stable public error vocabulary (message text) and the SQLSTATE each is raised
-- with. Callers match the message, never the conflicting row:
--   slot_unavailable      23P01  the requested slot is no longer allocatable
--   capacity_exhausted    23P01  reserved for group capacity (issue #42)
--   policy_denied         42501  policy, abuse, or eligibility denial
--   revision_conflict     23505  the caller acted on a superseded catalog read
--   payment_pending       23505  reserved for paid confirmation (issue #22)
--   idempotency_conflict  23505  key reused with a different normalized request
-- Malformed input keeps the issue #10 convention: 22023 with a hold_* message.

-- Hold TTL is tenant-configurable and bounded by platform limits here, so no
-- caller can widen it. Per-scope schedule knobs stay in schedule_policy_overrides.
alter table app.tenant_settings
  add column hold_ttl_seconds integer not null default 600
    check (hold_ttl_seconds between 60 and 1800);

create table app.booking_holds (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  service_id uuid not null,
  location_id uuid not null,
  -- The publication read while creating the hold. A later publication makes the
  -- hold stale rather than silently repricing it (invariant 5).
  publication_id uuid not null,
  allocation_kind text not null check (allocation_kind in ('appointment','exclusive_resource')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  party_size integer not null default 1 check (party_size = 1),
  state text not null default 'active' check (state in ('active','expired','released')),
  -- expires_at is data. No moving now-time predicate ever enters the exclusion
  -- constraints; expiry flips allocation state instead.
  expires_at timestamptz not null,
  ttl_seconds integer not null check (ttl_seconds between 60 and 1800),
  price_minor bigint not null check (price_minor >= 0),
  tax_rate_bps integer not null check (tax_rate_bps between 0 and 3000),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  -- Tenant-salted digests: a session or network identity is never stored in the
  -- clear and cannot be correlated across tenants. Customer-scoped limits attach
  -- to a customer record in issue #18.
  session_hash text not null check (session_hash ~ '^[a-f0-9]{64}$'),
  actor_hash text check (actor_hash ~ '^[a-f0-9]{64}$'),
  correlation_id uuid not null,
  attempts integer not null default 1 check (attempts between 1 and 3),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  released_at timestamptz,
  primary key (id), unique (tenant_id,id),
  check (ends_at > starts_at),
  check ((state = 'active') = (released_at is null)),
  foreign key (tenant_id,service_id,location_id)
    references app.catalog_service_locations(tenant_id,service_id,location_id) on delete restrict,
  foreign key (tenant_id,publication_id)
    references app.catalog_publications(tenant_id,id) on delete restrict
);
create index booking_holds_expiry_idx on app.booking_holds(expires_at) where state='active';
create index booking_holds_session_idx on app.booking_holds(tenant_id,session_hash) where state='active';
create index booking_holds_actor_idx on app.booking_holds(tenant_id,actor_hash) where state='active';

-- Allocations are the capacity ledger; the hold owns their lifetime.
alter table app.assignment_allocations add column hold_id uuid;
alter table app.assignment_allocations add constraint assignment_allocations_hold_fk
  foreign key (tenant_id,hold_id) references app.booking_holds(tenant_id,id) on delete restrict;
alter table app.assignment_allocations add constraint assignment_allocations_hold_required
  check (state <> 'held' or hold_id is not null);
create index assignment_allocations_hold_idx on app.assignment_allocations(hold_id) where hold_id is not null;

create table app.idempotency_keys (
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  operation text not null check (operation in ('create_hold_v1')),
  idempotency_key text not null
    check (idempotency_key = btrim(idempotency_key) and char_length(idempotency_key) between 16 and 200),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  -- A failed attempt rolls its own claim back, so a retry after a failure is a
  -- fresh attempt rather than a replayed failure. in_progress is therefore only
  -- ever visible inside the creating transaction; it stays modelled because
  -- issue #22 keeps a claim open across an external payment.
  state text not null check (state in ('in_progress','succeeded')),
  result_kind text check (result_kind in ('hold')),
  result_id uuid,
  correlation_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  primary key (tenant_id,operation,idempotency_key),
  check ((state = 'succeeded') = (result_id is not null and result_kind is not null))
);
create index idempotency_keys_expiry_idx on app.idempotency_keys(expires_at);

-- Hold and idempotency state is operator data, not application data: no role
-- reads or writes it directly. Keep explicit denial beneath the absent grants.
do $rls$
declare t text;
begin
  foreach t in array array['booking_holds','idempotency_keys'] loop
    execute format('alter table app.%I enable row level security',t);
    execute format('create policy %I on app.%I for select to anon,authenticated using (false)',t||'_select_denied',t);
    execute format('create policy %I on app.%I for insert to anon,authenticated with check (false)',t||'_insert_denied',t);
    execute format('create policy %I on app.%I for update to anon,authenticated using (false) with check (false)',t||'_update_denied',t);
    execute format('create policy %I on app.%I for delete to anon,authenticated using (false)',t||'_delete_denied',t);
    execute format('revoke all on app.%I from public,anon,authenticated',t);
  end loop;
end;
$rls$;

-- Holds deliberately do not bump app.availability_revisions. Availability is
-- advisory within its published window, and per-hold bumps would serialize
-- every concurrent hold on one tenant row and turn a competing hold into a
-- revision_conflict instead of an honest slot_unavailable.

create or replace function private.expire_holds_v1(
  p_tenant_id uuid default null,
  p_limit integer default 500
)
returns table(expired_holds integer, released_allocations integer, purged_idempotency_keys integer)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_ids uuid[];
  v_expired integer;
  v_released integer;
  v_purged integer;
begin
  if p_limit is null or p_limit not between 1 and 5000 then
    raise exception using errcode='22023',message='hold_invalid_batch';
  end if;
  -- skip locked keeps concurrent job runs and synchronous callers from waiting
  -- on each other; the state guard below releases each hold exactly once.
  select coalesce(array_agg(candidate.id),'{}'::uuid[]) into v_ids from (
    select h.id from app.booking_holds h
    where h.state='active' and h.expires_at<=v_now
      and (p_tenant_id is null or h.tenant_id=p_tenant_id)
    order by h.expires_at
    limit p_limit
    for update skip locked
  ) candidate;

  with released as (
    update app.assignment_allocations a set state='cancelled'
    where a.hold_id = any(v_ids) and a.state='held'
    returning 1
  ) select count(*)::integer into v_released from released;
  with expired as (
    update app.booking_holds h
    set state='expired', released_at=v_now, updated_at=v_now
    where h.id = any(v_ids) and h.state='active'
    returning 1
  ) select count(*)::integer into v_expired from expired;
  with purged as (
    delete from app.idempotency_keys k
    where (k.tenant_id,k.operation,k.idempotency_key) in (
      select p.tenant_id,p.operation,p.idempotency_key from app.idempotency_keys p
      where p.expires_at<=v_now and (p_tenant_id is null or p.tenant_id=p_tenant_id)
      limit p_limit
    )
    returning 1
  ) select count(*)::integer into v_purged from purged;

  if v_expired > 0 then
    raise log 'hold_expiry_batch expired=% released=% tenant=%',v_expired,v_released,coalesce(p_tenant_id::text,'all');
  end if;
  return query select v_expired,v_released,v_purged;
end;
$$;
comment on function private.expire_holds_v1(uuid,integer) is
  'Batched hold expiry. Releases each expired hold exactly once, purges elapsed idempotency claims, and is safe to run concurrently with hold creation.';
revoke all on function private.expire_holds_v1(uuid,integer) from public,anon,authenticated;

create or replace function private.create_hold_v1(
  p_hostname text,
  p_application text,
  p_service_id uuid,
  p_location_id uuid,
  p_slot_start timestamptz,
  p_session_token text,
  p_idempotency_key text,
  p_staff_preference_id uuid default null,
  p_party_size integer default 1,
  p_expected_cache_tag text default null,
  p_customer_time_zone text default null
)
returns table(
  contract_version integer,
  hold_id uuid,
  state text,
  expires_at timestamptz,
  slot_start timestamptz,
  slot_end timestamptz,
  staff_id uuid,
  allocation_kind text,
  price_minor bigint,
  tax_rate_bps integer,
  currency text,
  attempts integer,
  replayed boolean,
  cache_tag text
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
declare
  v_now timestamptz := statement_timestamp();
  v_correlation_id uuid := pg_catalog.gen_random_uuid();
  v_tenant_id uuid;
  v_publication_id uuid;
  v_duration integer;
  v_published_before integer;
  v_published_after integer;
  v_price_minor bigint;
  v_tax_rate_bps integer;
  v_currency text;
  v_allocation_kind text;
  v_session_hash text;
  v_actor_hash text;
  v_forwarded text;
  v_request_hash text;
  v_existing app.idempotency_keys%rowtype;
  v_hold app.booking_holds%rowtype;
  v_cache_tag text;
  v_matched bigint;
  v_no_slot_code text;
  v_fatal boolean := false;
  v_staff_id uuid;
  v_slot_end timestamptz;
  v_ttl integer;
  v_expires_at timestamptz;
  v_before integer;
  v_after integer;
  v_hold_id uuid;
  v_attempt integer;
  v_resource_type_id uuid;
  v_resource_id uuid;
  v_occupied tsrange;
  -- Platform abuse ceilings. They are never returned, logged per-threshold, or
  -- otherwise disclosed: every breach raises the same policy_denied.
  v_session_limit constant integer := 3;
  v_actor_limit constant integer := 10;
  v_tenant_limit constant integer := 500;
  v_max_attempts constant integer := 3;
begin
  if p_session_token is null or p_session_token <> btrim(p_session_token)
     or char_length(p_session_token) not between 16 and 200 then
    raise exception using errcode='22023',message='hold_invalid_session';
  end if;
  if p_idempotency_key is null or p_idempotency_key <> btrim(p_idempotency_key)
     or char_length(p_idempotency_key) not between 16 and 200 then
    raise exception using errcode='22023',message='hold_invalid_idempotency_key';
  end if;
  if p_party_size is distinct from 1 then
    raise exception using errcode='22023',message='hold_party_size_out_of_bounds';
  end if;
  if p_slot_start is null or p_slot_start <> pg_catalog.date_trunc('minute',p_slot_start) then
    raise exception using errcode='22023',message='hold_invalid_slot';
  end if;

  -- Trusted context only: the hostname must resolve to a verified production
  -- domain, and a Dashboard caller must additionally hold live membership and
  -- location scope. The hostname is evidence, never authorization by itself.
  select r.tenant_id into v_tenant_id
  from api_v1.resolve_public_tenant_v1(p_hostname,p_application) r;
  if v_tenant_id is null
     or (p_application='dashboard' and not (
       coalesce((select private.is_active_tenant_member(v_tenant_id)),false)
       and coalesce((select private.can_access_location(v_tenant_id,p_location_id)),false)
     )) then
    raise exception using errcode='42501',message='hold_context_required';
  end if;

  begin
    v_forwarded := btrim(split_part(
      coalesce(pg_catalog.current_setting('request.headers',true),'{}')::jsonb->>'x-forwarded-for',',',1));
  exception when others then
    v_forwarded := null;
  end;
  v_session_hash := encode(pg_catalog.sha256(
    pg_catalog.convert_to(v_tenant_id::text||':'||p_session_token,'UTF8')),'hex');
  v_actor_hash := case when coalesce(v_forwarded,'')='' then null else encode(pg_catalog.sha256(
    pg_catalog.convert_to(v_tenant_id::text||':'||v_forwarded,'UTF8')),'hex') end;

  -- Normalized request identity. jsonb renders its keys canonically, so the
  -- same logical request always hashes to the same digest.
  v_request_hash := encode(pg_catalog.sha256(pg_catalog.convert_to(
    jsonb_build_object(
      'application',p_application,
      'hostname',p_hostname,
      'location_id',p_location_id,
      'party_size',p_party_size,
      'service_id',p_service_id,
      'session',v_session_hash,
      'slot_start',to_char(p_slot_start at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'staff_preference_id',p_staff_preference_id
    )::text,'UTF8')),'hex');

  -- A duplicate key blocks here until the first transaction commits or aborts,
  -- so concurrent duplicates converge on one hold instead of racing.
  insert into app.idempotency_keys(
    tenant_id,operation,idempotency_key,request_hash,state,correlation_id,expires_at)
  values (v_tenant_id,'create_hold_v1',p_idempotency_key,v_request_hash,'in_progress',
    v_correlation_id,v_now+interval '24 hours')
  on conflict (tenant_id,operation,idempotency_key) do nothing;
  if not found then
    select * into v_existing from app.idempotency_keys k
    where k.tenant_id=v_tenant_id and k.operation='create_hold_v1'
      and k.idempotency_key=p_idempotency_key
    for update;
    if v_existing.request_hash is distinct from v_request_hash then
      raise log 'hold_denied code=idempotency_conflict correlation=% tenant=%',v_correlation_id,v_tenant_id;
      raise exception using errcode='23505',message='idempotency_conflict';
    end if;
    select * into v_hold from app.booking_holds h where h.tenant_id=v_tenant_id and h.id=v_existing.result_id;
    if v_hold.id is null then
      raise exception using errcode='23505',message='idempotency_conflict';
    end if;
    raise log 'hold_replayed hold=% correlation=% tenant=%',v_hold.id,v_existing.correlation_id,v_tenant_id;
    return query select 1,v_hold.id,v_hold.state,v_hold.expires_at,v_hold.starts_at,v_hold.ends_at,
      (select a.staff_id from app.assignment_allocations a where a.hold_id=v_hold.id and a.staff_id is not null limit 1),
      v_hold.allocation_kind,v_hold.price_minor,v_hold.tax_rate_bps,v_hold.currency,
      v_hold.attempts,true,null::text;
    return;
  end if;

  -- Published catalog read: price, tax, duration, and buffers are snapshotted
  -- from the same revision the availability engine offered.
  select p.id,sr.duration_minutes,sr.buffer_before_minutes,sr.buffer_after_minutes,
         sr.price_minor,sr.tax_rate_bps,sr.currency,sr.booking_mode
  into v_publication_id,v_duration,v_published_before,v_published_after,
       v_price_minor,v_tax_rate_bps,v_currency,v_allocation_kind
  from app.catalog_publications p
  join app.catalog_service_revisions sr on sr.tenant_id=p.tenant_id and sr.publication_id=p.id
    and sr.service_id=p_service_id and sr.state='published'
  join app.catalog_services s on s.tenant_id=sr.tenant_id and s.id=sr.service_id and s.status='active'
  where p.tenant_id=v_tenant_id and p.state='published' and sr.capacity_mode='exclusive'
  order by (sr.locale='en') desc,sr.locale
  limit 1;
  if v_publication_id is null then
    raise exception using errcode='42501',message='hold_context_required';
  end if;
  v_slot_end := p_slot_start+make_interval(mins=>v_duration);

  select ts.hold_ttl_seconds into v_ttl from app.tenant_settings ts where ts.tenant_id=v_tenant_id;
  v_ttl := least(greatest(coalesce(v_ttl,600),60),1800);
  -- A hold never outlives the slot it protects.
  v_expires_at := least(v_now+make_interval(secs=>v_ttl),p_slot_start);
  if v_expires_at<=v_now then
    raise log 'hold_denied code=policy_denied correlation=% tenant=%',v_correlation_id,v_tenant_id;
    raise exception using errcode='42501',message='policy_denied';
  end if;

  if (select count(*) from app.booking_holds h
        where h.tenant_id=v_tenant_id and h.state='active' and h.expires_at>v_now
          and h.session_hash=v_session_hash)>=v_session_limit
     or (v_actor_hash is not null and (select count(*) from app.booking_holds h
        where h.tenant_id=v_tenant_id and h.state='active' and h.expires_at>v_now
          and h.actor_hash=v_actor_hash)>=v_actor_limit)
     or (select count(*) from app.booking_holds h
        where h.tenant_id=v_tenant_id and h.state='active' and h.expires_at>v_now)>=v_tenant_limit then
    raise log 'hold_denied code=policy_denied correlation=% tenant=%',v_correlation_id,v_tenant_id;
    raise exception using errcode='42501',message='policy_denied';
  end if;

  for v_attempt in 1..v_max_attempts loop
    begin
      -- Synchronously release this tenant's stale holds so a lapsed reservation
      -- never blocks a live one, then re-read availability inside the attempt.
      perform private.expire_holds_v1(v_tenant_id,100);

      select max(a.cache_tag),
             count(*) filter (where a.result_kind='slot' and a.slot_start=p_slot_start),
             max(a.no_slot_code),
             (array_agg(a.staff_id order by a.candidate_rank)
               filter (where a.result_kind='slot' and a.slot_start=p_slot_start))[1]
      into v_cache_tag,v_matched,v_no_slot_code,v_staff_id
      from private.get_availability_v1(p_hostname,p_application,p_service_id,p_location_id,
        p_staff_preference_id,p_slot_start,v_slot_end,1,p_customer_time_zone) a;

      if p_expected_cache_tag is not null and p_expected_cache_tag is distinct from v_cache_tag then
        raise log 'hold_denied code=revision_conflict correlation=% tenant=%',v_correlation_id,v_tenant_id;
        raise exception using errcode='23505',message='revision_conflict';
      end if;
      if coalesce(v_matched,0)=0 then
        -- Availability already knows whether the slot is barred by policy or by
        -- occupancy; reuse its reason instead of guessing a second time.
        v_fatal := true;
        if v_no_slot_code='policy_restricted' then
          raise log 'hold_denied code=policy_denied correlation=% tenant=%',v_correlation_id,v_tenant_id;
          raise exception using errcode='42501',message='policy_denied';
        end if;
        raise log 'hold_denied code=slot_unavailable correlation=% tenant=% attempt=%',v_correlation_id,v_tenant_id,v_attempt;
        raise exception using errcode='23P01',message='slot_unavailable';
      end if;

      v_hold_id := pg_catalog.gen_random_uuid();
      insert into app.booking_holds(
        id,tenant_id,service_id,location_id,publication_id,allocation_kind,starts_at,ends_at,
        party_size,expires_at,ttl_seconds,price_minor,tax_rate_bps,currency,
        session_hash,actor_hash,correlation_id,attempts)
      values (v_hold_id,v_tenant_id,p_service_id,p_location_id,v_publication_id,v_allocation_kind,
        p_slot_start,v_slot_end,1,v_expires_at,v_ttl,v_price_minor,v_tax_rate_bps,v_currency,
        v_session_hash,v_actor_hash,v_correlation_id,v_attempt);

      if v_allocation_kind='appointment' then
        v_before := private.resolve_availability_policy_v1(v_tenant_id,p_location_id,p_service_id,v_staff_id,null,'buffer_before_minutes',v_published_before)
          + private.resolve_availability_policy_v1(v_tenant_id,p_location_id,p_service_id,v_staff_id,null,'travel_minutes',0);
        v_after := private.resolve_availability_policy_v1(v_tenant_id,p_location_id,p_service_id,v_staff_id,null,'buffer_after_minutes',v_published_after)
          + private.resolve_availability_policy_v1(v_tenant_id,p_location_id,p_service_id,v_staff_id,null,'turnover_minutes',0);
        insert into app.assignment_allocations(
          id,tenant_id,service_id,location_id,staff_id,starts_at,ends_at,
          buffer_before_minutes,buffer_after_minutes,state,hold_id)
        values (pg_catalog.gen_random_uuid(),v_tenant_id,p_service_id,p_location_id,v_staff_id,
          p_slot_start,v_slot_end,v_before,v_after,'held',v_hold_id);
      else
        v_staff_id := null;
        -- Every required resource type is allocated in one transaction, and both
        -- the type and the resource are taken in ascending id order so competing
        -- multi-resource requests acquire the same rows in the same sequence.
        for v_resource_type_id in
          select rr.resource_type_id from app.resource_requirements rr
          where rr.tenant_id=v_tenant_id and rr.service_id=p_service_id
          order by rr.resource_type_id
        loop
          v_before := private.resolve_availability_policy_v1(v_tenant_id,p_location_id,p_service_id,null,null,'buffer_before_minutes',v_published_before)
            + private.resolve_availability_policy_v1(v_tenant_id,p_location_id,p_service_id,null,null,'travel_minutes',0);
          v_after := private.resolve_availability_policy_v1(v_tenant_id,p_location_id,p_service_id,null,null,'buffer_after_minutes',v_published_after)
            + private.resolve_availability_policy_v1(v_tenant_id,p_location_id,p_service_id,null,null,'turnover_minutes',0);
          v_occupied := tsrange(
            (p_slot_start at time zone 'UTC')-make_interval(mins=>v_before),
            (v_slot_end at time zone 'UTC')+make_interval(mins=>v_after),'[)');
          select r.id into v_resource_id
          from app.resources r
          join app.resource_locations rl on rl.tenant_id=r.tenant_id and rl.resource_id=r.id
            and rl.location_id=p_location_id
          where r.tenant_id=v_tenant_id and r.resource_type_id=v_resource_type_id and r.status='active'
            and not exists (
              select 1 from app.assignment_allocations a
              where a.tenant_id=v_tenant_id and a.resource_id=r.id
                and a.state in ('held','confirmed') and a.occupied_at && v_occupied)
          order by r.id
          limit 1;
          if v_resource_id is null then
            raise log 'hold_denied code=slot_unavailable correlation=% tenant=% attempt=%',v_correlation_id,v_tenant_id,v_attempt;
            raise exception using errcode='23P01',message='slot_unavailable';
          end if;
          insert into app.assignment_allocations(
            id,tenant_id,service_id,location_id,resource_id,resource_type_id,starts_at,ends_at,
            buffer_before_minutes,buffer_after_minutes,state,hold_id)
          values (pg_catalog.gen_random_uuid(),v_tenant_id,p_service_id,p_location_id,v_resource_id,
            v_resource_type_id,p_slot_start,v_slot_end,v_before,v_after,'held',v_hold_id);
        end loop;
      end if;
      exit;
    exception
      when exclusion_violation or deadlock_detected or serialization_failure then
        -- The database, not this function, decided the overlap. The losing caller
        -- learns only that the slot is gone. v_fatal marks a denial this function
        -- already decided, which must not be retried; plpgsql variables survive
        -- the subtransaction rollback, database work does not.
        if v_fatal or v_attempt>=v_max_attempts then
          raise log 'hold_denied code=slot_unavailable correlation=% tenant=% attempt=%',v_correlation_id,v_tenant_id,v_attempt;
          raise exception using errcode='23P01',message='slot_unavailable';
        end if;
        perform pg_catalog.pg_sleep(0.01+random()*0.04);
    end;
  end loop;

  update app.idempotency_keys k
  set state='succeeded',result_kind='hold',result_id=v_hold_id,updated_at=v_now
  where k.tenant_id=v_tenant_id and k.operation='create_hold_v1' and k.idempotency_key=p_idempotency_key;

  raise log 'hold_created hold=% correlation=% tenant=% attempts=% expires=%',
    v_hold_id,v_correlation_id,v_tenant_id,v_attempt,v_expires_at;
  return query select 1,v_hold_id,'active'::text,v_expires_at,p_slot_start,v_slot_end,v_staff_id,
    v_allocation_kind,v_price_minor,v_tax_rate_bps,v_currency,v_attempt,false,v_cache_tag;
end;
$function$;
comment on function private.create_hold_v1(text,text,uuid,uuid,timestamptz,text,text,uuid,integer,text,text) is
  'Hold v1 engine. Re-reads published catalog, schedule, eligibility, policy, and availability inside the transaction, allocates in ascending resource order, and translates every overlap decided by the exclusion constraints into slot_unavailable.';
revoke all on function private.create_hold_v1(text,text,uuid,uuid,timestamptz,text,text,uuid,integer,text,text) from public;
grant execute on function private.create_hold_v1(text,text,uuid,uuid,timestamptz,text,text,uuid,integer,text,text) to anon,authenticated;

create or replace function private.release_hold_v1(
  p_hostname text,
  p_application text,
  p_hold_id uuid,
  p_session_token text
)
returns table(contract_version integer, hold_id uuid, state text)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_tenant_id uuid;
  v_session_hash text;
  v_hold app.booking_holds%rowtype;
begin
  if p_session_token is null or char_length(p_session_token) not between 16 and 200 then
    raise exception using errcode='22023',message='hold_invalid_session';
  end if;
  select r.tenant_id into v_tenant_id from api_v1.resolve_public_tenant_v1(p_hostname,p_application) r;
  if v_tenant_id is null then
    raise exception using errcode='42501',message='hold_context_required';
  end if;
  v_session_hash := encode(pg_catalog.sha256(
    pg_catalog.convert_to(v_tenant_id::text||':'||p_session_token,'UTF8')),'hex');
  -- Ownership is proved by the session that created the hold. An unknown hold
  -- and a hold owned by someone else are indistinguishable to the caller.
  select * into v_hold from app.booking_holds h
  where h.tenant_id=v_tenant_id and h.id=p_hold_id and h.session_hash=v_session_hash
  for update;
  if v_hold.id is null then
    raise exception using errcode='42501',message='hold_context_required';
  end if;
  if v_hold.state='active' then
    update app.assignment_allocations a set state='cancelled'
    where a.hold_id=v_hold.id and a.state='held';
    update app.booking_holds h set state='released',released_at=v_now,updated_at=v_now
    where h.id=v_hold.id;
    v_hold.state := 'released';
    raise log 'hold_released hold=% correlation=% tenant=%',v_hold.id,v_hold.correlation_id,v_tenant_id;
  end if;
  return query select 1,v_hold.id,v_hold.state;
end;
$$;
revoke all on function private.release_hold_v1(text,text,uuid,text) from public;
grant execute on function private.release_hold_v1(text,text,uuid,text) to anon,authenticated;

create or replace function api_v1.create_hold_v1(
  p_hostname text,
  p_application text,
  p_service_id uuid,
  p_location_id uuid,
  p_slot_start timestamptz,
  p_session_token text,
  p_idempotency_key text,
  p_staff_preference_id uuid default null,
  p_party_size integer default 1,
  p_expected_cache_tag text default null,
  p_customer_time_zone text default null
)
returns table(
  contract_version integer, hold_id uuid, state text, expires_at timestamptz,
  slot_start timestamptz, slot_end timestamptz, staff_id uuid, allocation_kind text,
  price_minor bigint, tax_rate_bps integer, currency text, attempts integer,
  replayed boolean, cache_tag text
)
language sql volatile security invoker set search_path = '' set statement_timeout = '5s' as $$
  select * from private.create_hold_v1(
    p_hostname,p_application,p_service_id,p_location_id,p_slot_start,p_session_token,
    p_idempotency_key,p_staff_preference_id,p_party_size,p_expected_cache_tag,p_customer_time_zone);
$$;
revoke all on function api_v1.create_hold_v1(text,text,uuid,uuid,timestamptz,text,text,uuid,integer,text,text) from public;
grant execute on function api_v1.create_hold_v1(text,text,uuid,uuid,timestamptz,text,text,uuid,integer,text,text) to anon,authenticated;

create or replace function api_v1.release_hold_v1(
  p_hostname text,
  p_application text,
  p_hold_id uuid,
  p_session_token text
)
returns table(contract_version integer, hold_id uuid, state text)
language sql volatile security invoker set search_path = '' set statement_timeout = '5s' as $$
  select * from private.release_hold_v1(p_hostname,p_application,p_hold_id,p_session_token);
$$;
revoke all on function api_v1.release_hold_v1(text,text,uuid,text) from public;
grant execute on function api_v1.release_hold_v1(text,text,uuid,text) to anon,authenticated;
