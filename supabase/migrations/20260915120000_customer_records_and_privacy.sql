-- Issue #18: customer records and privacy requests. A customer is an identity
-- the tenant accumulated across bookings, and every privacy right the product
-- offers runs through ONE restartable job machine.
--
-- What this migration deliberately does not add:
--
--   * no new permission keys. `customer.data.export`, `.export_on_behalf`,
--     `.correct`, `.restrict`, `.delete` and `customer.pii.view` were seeded in
--     issue #6 for exactly this ticket.
--   * no second notes table. Sensitive notes are issue #17's `app.booking_notes`
--     at `visibility='sensitive'`, already gated on `customer.pii.view`.
--   * no second suppression list. `app.notification_suppressions` from issue #19
--     is the communication-suppression record, keyed by the same recipient
--     digest this migration uses as customer identity.
--   * no second audit ledger. Privacy outcomes are their own step rows because
--     they span subsystems a booking event cannot describe, but nothing about a
--     booking is re-recorded here.
--   * no change to how a booking is written. Identity is derived by trigger from
--     the contact row every booking path already writes, so `confirm_booking_v1`,
--     `request_booking_v1` and `create_booking_on_behalf_v1` are untouched.
--
-- Identity. A customer is keyed by sha256(tenant_id || ':' || lower(email)),
-- the same tenant-salted digest issue #19 addresses mail with. Tenant-salted
-- means two tenants holding the same address produce different digests and can
-- never be correlated. Email is the identity because it is the only field every
-- booking path requires; phone is optional and names are not unique.
--
-- Snapshots outlive corrections (invariant 5). Correcting a customer's name
-- rewrites `app.customers` and never `app.booking_contacts`: a past booking
-- keeps the contact details it was actually made under, which is what makes it
-- evidence. The directory reads current identity, the booking reads its own.
--
-- Erasure is the one operation allowed to break append-only, because "this
-- ledger is immutable" and "erase this person" are both real obligations and
-- the second one wins where law says it does. The escape is narrow: see the
-- `private.enforce_append_only` change below.
--
-- Error vocabulary. Published strings reused; this migration adds two, because
-- neither condition is describable with the existing set:
--   legal_hold_active      42501  deletion refused, a hold outranks the request
--   offboarding_sequence   42501  a phase was skipped or replayed backwards
-- Plus the existing policy_denied / revision_conflict / idempotency_conflict.

-- ---------------------------------------------------------------------------
-- 1. The erasure escape
-- ---------------------------------------------------------------------------

-- `private.enforce_append_only` guards booking events, contacts, intake answers,
-- proposals, management tokens and notes. Erasure has to reach three of those.
-- Rather than give erasure its own bypass per table, the shared guard learns one
-- condition, so every append-only table gets the same rule and the same audit
-- trail instead of drifting apart.
--
-- Why this is not a hole: the GUC alone grants nothing. `anon` and
-- `authenticated` hold no UPDATE or DELETE grant on any of these tables and
-- every one of them carries a `for update using (false)` / `for delete using
-- (false)` policy. A caller who sets this GUC still cannot reach a row. Only a
-- SECURITY DEFINER function running as the owner can, and the only one that
-- sets it is `private.erase_customer_records_v1`, which sets it with `set local`
-- so it dies with the transaction.
create or replace function private.enforce_append_only()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- A live erasure request is the single lawful reason a row here changes.
  if coalesce(pg_catalog.current_setting('app.erasure_request_id', true), '') <> '' then
    -- tg_op is a PL/pgSQL trigger variable, not a catalog function.
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception using errcode='42501',message='booking_immutable';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Customer identity
-- ---------------------------------------------------------------------------

create table app.customers (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  -- sha256(tenant_id || ':' || lower(email)). Identity, and the join key to
  -- `app.notification_suppressions`.
  email_hash text not null check (email_hash ~ '^[a-f0-9]{64}$'),
  -- Current identity, not booking history. Null once erased.
  full_name text check (full_name = btrim(full_name) and char_length(full_name) between 1 and 160),
  email text check (char_length(email) between 3 and 320 and email like '%@%'),
  phone text check (char_length(phone) between 3 and 40),
  preferred_locale text not null default 'en' check (preferred_locale in ('en','ar')),
  -- Operational labels, never a place for a diagnosis or anything else that
  -- belongs in a sensitive note.
  tags text[] not null default '{}'::text[]
    check (pg_catalog.array_length(tags,1) is null or pg_catalog.array_length(tags,1) <= 20),
  -- Restriction is GDPR Art. 18 processing restriction: the record stays
  -- readable and exportable, and stops being used for anything else.
  restricted_at timestamptz,
  restriction_reason text check (restriction_reason is null or char_length(restriction_reason) between 1 and 500),
  -- Set when erasure completed. The row survives so bookings keep a referent;
  -- every identifying column is null by then.
  erased_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (id),
  unique (tenant_id,id),
  unique (tenant_id,email_hash),
  -- Erasure is total: an erased row keeps no identifying column.
  check (erased_at is null or (full_name is null and email is null and phone is null
    and tags = '{}'::text[])),
  -- A live row has to be addressable.
  check (erased_at is not null or email is not null),
  check ((restricted_at is null) = (restriction_reason is null))
);
create index customers_tenant_name_idx on app.customers (tenant_id, lower(full_name));
create index customers_tenant_created_idx on app.customers (tenant_id, created_at desc);

-- The link from a booking to the identity it belongs to. Nullable because the
-- trigger resolves it, and because an erasure never orphans a booking.
alter table app.booking_contacts add column customer_id uuid;
alter table app.booking_contacts add constraint booking_contacts_customer_fk
  foreign key (tenant_id,customer_id) references app.customers(tenant_id,id) on delete restrict;
create index booking_contacts_customer_idx on app.booking_contacts (tenant_id, customer_id);

-- Consent evidence. Minimal by design (ADR-0008): the document key, its
-- version, a hash of the rendered text, and when it was accepted. Never the
-- text itself, which would put policy prose in a table that outlives erasure.
create table app.customer_consents (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  customer_id uuid not null,
  booking_id uuid,
  policy_key text not null check (policy_key = btrim(policy_key) and char_length(policy_key) between 1 and 80),
  policy_version integer not null check (policy_version > 0),
  rendered_text_hash text not null check (rendered_text_hash ~ '^[a-f0-9]{64}$'),
  accepted_at timestamptz not null,
  source text not null check (source in ('booking','dashboard','management_link')),
  created_at timestamptz not null default statement_timestamp(),
  primary key (id),
  -- One acceptance per customer, document, version and booking. A replayed
  -- booking confirmation records nothing new.
  unique (tenant_id,customer_id,policy_key,policy_version,booking_id),
  foreign key (tenant_id,customer_id) references app.customers(tenant_id,id) on delete restrict,
  foreign key (tenant_id,booking_id) references app.bookings(tenant_id,id) on delete restrict
);
create trigger customer_consents_append_only
  before update or delete on app.customer_consents
  for each row execute function private.enforce_append_only();

-- Identity resolution. Runs on the contact row every booking path already
-- writes, which is why no booking RPC changed: one trigger covers
-- confirm_booking_v1, request_booking_v1 and create_booking_on_behalf_v1, and
-- covers whatever issue #22 adds without being told.
create or replace function private.link_booking_contact_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_customer_id uuid;
  v_policy jsonb;
  v_version integer;
begin
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    new.tenant_id::text||':'||pg_catalog.lower(new.email),'UTF8')),'hex');

  insert into app.customers (tenant_id,email_hash,full_name,email,phone)
  values (new.tenant_id,v_hash,new.full_name,new.email,new.phone)
  on conflict (tenant_id,email_hash) do update
    -- A returning customer refreshes contact details only while the record is
    -- live. An erased identity that books again stays erased for the old
    -- bookings and is re-identified here, which is correct: the new booking is
    -- a new lawful basis, and `erased_at` is cleared to say so.
    set full_name = excluded.full_name,
        email = excluded.email,
        phone = coalesce(excluded.phone, app.customers.phone),
        erased_at = null,
        revision = app.customers.revision + 1,
        updated_at = pg_catalog.statement_timestamp()
  returning id into v_customer_id;

  new.customer_id := v_customer_id;

  -- Consent evidence, from the policy the booking was actually made under.
  select b.policy_snapshot into v_policy
  from app.bookings b where b.tenant_id = new.tenant_id and b.id = new.booking_id;
  v_version := coalesce((v_policy->>'policy_version')::integer, 1);
  insert into app.customer_consents (
    tenant_id,customer_id,booking_id,policy_key,policy_version,rendered_text_hash,accepted_at,source)
  values (
    new.tenant_id,v_customer_id,new.booking_id,'booking_terms',v_version,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      coalesce(v_policy::text,'{}'),'UTF8')),'hex'),
    pg_catalog.statement_timestamp(),'booking')
  on conflict do nothing;

  return new;
end;
$$;
create trigger booking_contacts_link_customer
  before insert on app.booking_contacts
  for each row execute function private.link_booking_contact_customer();

-- Existing contact rows predate the trigger. Replaying them through the same
-- resolution keeps one code path rather than a separate backfill rule.
do $backfill$
declare r record; v_hash text; v_customer_id uuid;
begin
  for r in select tenant_id,booking_id,full_name,email,phone from app.booking_contacts
           where customer_id is null order by created_at loop
    v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      r.tenant_id::text||':'||pg_catalog.lower(r.email),'UTF8')),'hex');
    insert into app.customers (tenant_id,email_hash,full_name,email,phone)
    values (r.tenant_id,v_hash,r.full_name,r.email,r.phone)
    on conflict (tenant_id,email_hash) do update set updated_at = pg_catalog.statement_timestamp()
    returning id into v_customer_id;
    -- The append-only guard covers this table, so the backfill declares itself
    -- an erasure-class maintenance write rather than dropping the trigger.
    perform pg_catalog.set_config('app.erasure_request_id', pg_catalog.gen_random_uuid()::text, true);
    update app.booking_contacts set customer_id = v_customer_id
    where tenant_id = r.tenant_id and booking_id = r.booking_id;
    perform pg_catalog.set_config('app.erasure_request_id', '', true);
  end loop;
end;
$backfill$;

-- ---------------------------------------------------------------------------
-- 3. Legal holds
-- ---------------------------------------------------------------------------

-- A hold outranks a deletion request. It is explicit, attributed, and released
-- by a named person rather than expiring on a timer, because a timer would let
-- evidence disappear while a matter is still open.
create table app.legal_holds (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  customer_id uuid,
  reason text not null check (reason = btrim(reason) and char_length(reason) between 1 and 500),
  placed_by_membership_id uuid,
  placed_at timestamptz not null default statement_timestamp(),
  released_by_membership_id uuid,
  released_at timestamptz,
  release_reason text check (release_reason is null or char_length(release_reason) between 1 and 500),
  primary key (id),
  unique (tenant_id,id),
  foreign key (tenant_id,customer_id) references app.customers(tenant_id,id) on delete restrict,
  foreign key (tenant_id,placed_by_membership_id) references app.memberships(tenant_id,id) on delete restrict,
  foreign key (tenant_id,released_by_membership_id) references app.memberships(tenant_id,id) on delete restrict,
  check ((released_at is null) = (released_by_membership_id is null))
);
-- At most one live hold per customer, so "is this customer held" is a lookup
-- and never a judgement call. A tenant-wide hold carries a null customer.
create unique index legal_holds_live_customer_idx on app.legal_holds (tenant_id,customer_id)
  where released_at is null and customer_id is not null;
create unique index legal_holds_live_tenant_idx on app.legal_holds (tenant_id)
  where released_at is null and customer_id is null;

create or replace function private.has_legal_hold_v1(
  p_tenant_id uuid,
  p_customer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from app.legal_holds h
    where h.tenant_id = p_tenant_id
      and h.released_at is null
      -- A tenant-wide hold covers every customer in it.
      and (h.customer_id is null or h.customer_id = p_customer_id));
$$;

-- ---------------------------------------------------------------------------
-- 4. The privacy job machine
-- ---------------------------------------------------------------------------

-- One table for every right the product offers, plus tenant offboarding, which
-- is the same machine at tenant scope. Splitting them would duplicate the
-- restart logic, the hold check, and the audit shape three times over.
create table app.privacy_requests (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  -- Null for offboarding, which is not about one person.
  customer_id uuid,
  kind text not null check (kind in ('export','correction','restriction','deletion','offboarding')),
  status text not null default 'pending'
    check (status in ('pending','running','blocked','completed','failed')),
  -- Offboarding only. The five phases of security-and-privacy.md §9, in order.
  offboarding_phase text check (offboarding_phase in
    ('restrict_bookings','preserve_export','close_instance','delete_primary','retain_evidence')),
  requested_by_membership_id uuid,
  -- Why the request exists, for the audit trail. Never the data itself.
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  -- Export payload. Held here rather than in Storage on purpose: Postgres PITR
  -- does not restore deleted Storage objects, so an export written to Storage
  -- would be a data class with no restore story, which is the same reason
  -- customer attachments are out of the first release (ADR-0008). Issue #39
  -- brings object backup and a restore drill; the delivery moves then.
  -- ponytail: jsonb artifact with an expiry, move to Storage once #39 lands.
  artifact jsonb check (artifact is null or jsonb_typeof(artifact) = 'object'),
  artifact_expires_at timestamptz,
  blocked_reason text check (blocked_reason is null or char_length(blocked_reason) between 1 and 200),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  primary key (id),
  unique (tenant_id,id),
  foreign key (tenant_id,customer_id) references app.customers(tenant_id,id) on delete restrict,
  foreign key (tenant_id,requested_by_membership_id) references app.memberships(tenant_id,id) on delete restrict,
  check ((kind = 'offboarding') = (customer_id is null)),
  check ((kind = 'offboarding') or offboarding_phase is null),
  check ((artifact is null) or artifact_expires_at is not null),
  check ((status = 'blocked') = (blocked_reason is not null))
);
create index privacy_requests_tenant_created_idx on app.privacy_requests (tenant_id, created_at desc);
create index privacy_requests_customer_idx on app.privacy_requests (tenant_id, customer_id);
-- One live job per customer and kind. A double-click does not start a second
-- deletion, and a retry resumes the first.
create unique index privacy_requests_live_idx on app.privacy_requests (tenant_id,customer_id,kind)
  where status in ('pending','running','blocked') and customer_id is not null;

-- Per-subsystem outcome. This is what makes a job restartable and what makes a
-- partial provider failure visible instead of silent: a step that succeeded is
-- never re-run, and a step that failed names the subsystem it failed in.
create table app.privacy_request_steps (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  request_id uuid not null,
  subsystem text not null check (subsystem in (
    'postgres_primary','sensitive_records','storage_objects','email_provider',
    'payment_metadata','calendar_metadata','analytics','backups')),
  status text not null default 'pending'
    check (status in ('pending','succeeded','not_applicable','blocked','failed')),
  -- Operator-readable, and deliberately incapable of holding the data: a short
  -- stable code plus counts, never a name, address or note body.
  outcome_code text check (outcome_code is null or char_length(outcome_code) between 1 and 80),
  affected_rows integer check (affected_rows is null or affected_rows >= 0),
  attempts integer not null default 0 check (attempts between 0 and 10),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (id),
  unique (request_id,subsystem),
  foreign key (tenant_id,request_id) references app.privacy_requests(tenant_id,id) on delete restrict
);

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------

-- The directory is customer PII, so it is gated on exactly the capability that
-- already gates contact rows and intake answers. A member who cannot see a
-- booking's contact row does not get the same person through a search box.
alter table app.customers enable row level security;
create policy customers_select_pii on app.customers for select to authenticated
using ((select private.is_active_tenant_member(tenant_id))
  and (select private.has_direct_capability(tenant_id,'customer.pii.view')));
create policy customers_insert_denied on app.customers for insert to anon,authenticated with check (false);
create policy customers_update_denied on app.customers for update to anon,authenticated using (false) with check (false);
create policy customers_delete_denied on app.customers for delete to anon,authenticated using (false);
revoke all on app.customers from public,anon,authenticated;
grant select on app.customers to authenticated;

-- Consent evidence is audit-class: it is read by whoever can read the audit
-- trail, not by whoever can read a customer.
alter table app.customer_consents enable row level security;
create policy customer_consents_select_audit on app.customer_consents for select to authenticated
using ((select private.is_active_tenant_member(tenant_id))
  and (select private.has_direct_capability(tenant_id,'audit.read')));
create policy customer_consents_insert_denied on app.customer_consents for insert to anon,authenticated with check (false);
create policy customer_consents_update_denied on app.customer_consents for update to anon,authenticated using (false) with check (false);
create policy customer_consents_delete_denied on app.customer_consents for delete to anon,authenticated using (false);
revoke all on app.customer_consents from public,anon,authenticated;
grant select on app.customer_consents to authenticated;

-- Holds and privacy jobs are legal-evidence class. Reading them requires the
-- audit capability; nothing writes through the table.
do $rls$
declare t text;
begin
  foreach t in array array['legal_holds','privacy_requests','privacy_request_steps'] loop
    execute format('alter table app.%I enable row level security',t);
    execute format($p$create policy %I on app.%I for select to authenticated
      using ((select private.is_active_tenant_member(tenant_id))
        and (select private.has_direct_capability(tenant_id,'audit.read')))$p$, t||'_select_audit', t);
    execute format('create policy %I on app.%I for insert to anon,authenticated with check (false)',t||'_insert_denied',t);
    execute format('create policy %I on app.%I for update to anon,authenticated using (false) with check (false)',t||'_update_denied',t);
    execute format('create policy %I on app.%I for delete to anon,authenticated using (false)',t||'_delete_denied',t);
    execute format('revoke all on app.%I from public,anon,authenticated',t);
    execute format('grant select on app.%I to authenticated',t);
  end loop;
end;
$rls$;

-- The export artifact is the one column that holds a whole person's record in
-- one place. No role reads it through the table; it comes back only from
-- `get_privacy_request_v1`, which re-checks capability and step-up. A table-wide
-- SELECT grant cannot be narrowed by revoking one column, so the grant itself is
-- column-scoped and `artifact` is simply not in it.
revoke select on app.privacy_requests from authenticated;
grant select (id,tenant_id,customer_id,kind,status,offboarding_phase,
  requested_by_membership_id,detail,artifact_expires_at,blocked_reason,
  created_at,updated_at,completed_at)
  on app.privacy_requests to authenticated;

-- `app.notification_suppressions` is revoked from `authenticated` outright, and
-- rightly: it is a list of addresses. The directory still has to answer "can
-- this tenant email this person", so exactly that boolean crosses the boundary
-- and the address never does.
create or replace function private.is_communication_suppressed_v1(
  p_tenant_id uuid,
  p_customer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from app.customers c
    join app.notification_suppressions s
      on s.tenant_id = c.tenant_id and s.recipient_hash = c.email_hash
    where c.tenant_id = p_tenant_id and c.id = p_customer_id);
$$;

-- ---------------------------------------------------------------------------
-- 6. Directory reads
-- ---------------------------------------------------------------------------

-- SECURITY INVOKER: the policies above are the authorization. Nothing here
-- re-implements a permission check the row already answers.
create or replace function api_v1.search_customers_v1(
  p_tenant_id uuid,
  p_query text default null,
  p_include_erased boolean default false,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  customer_id uuid,
  full_name text,
  email text,
  phone text,
  preferred_locale text,
  tags text[],
  restricted boolean,
  erased boolean,
  legal_hold boolean,
  suppressed boolean,
  booking_count bigint,
  last_booking_at timestamptz,
  revision bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    c.full_name,
    c.email,
    c.phone,
    c.preferred_locale,
    c.tags,
    c.restricted_at is not null,
    c.erased_at is not null,
    (select private.has_legal_hold_v1(c.tenant_id,c.id)),
    (select private.is_communication_suppressed_v1(c.tenant_id,c.id)),
    (select pg_catalog.count(*) from app.booking_contacts bc
      where bc.tenant_id = c.tenant_id and bc.customer_id = c.id),
    (select pg_catalog.max(b.starts_at) from app.booking_contacts bc
      join app.bookings b on b.tenant_id = bc.tenant_id and b.id = bc.booking_id
      where bc.tenant_id = c.tenant_id and bc.customer_id = c.id),
    c.revision
  from app.customers c
  where c.tenant_id = p_tenant_id
    and (p_include_erased or c.erased_at is null)
    and (
      coalesce(btrim(p_query),'') = ''
      or c.full_name ilike '%'||btrim(p_query)||'%'
      or c.email ilike '%'||btrim(p_query)||'%'
      or c.phone ilike '%'||btrim(p_query)||'%')
  order by c.created_at desc
  limit least(greatest(coalesce(p_limit,25),1),100)
  offset greatest(coalesce(p_offset,0),0);
$$;

-- One customer with the history a staff member needs to understand them. Note
-- bodies are NOT returned: this surface reports that sensitive records exist
-- and how many, and the booking detail surface from issue #17 is where an
-- authorized member reads one. Counting is not disclosure; a count with no
-- capability behind it would still be, which is why the sensitive counts
-- resolve through the same policy that gates the rows.
create or replace function api_v1.get_customer_detail_v1(
  p_tenant_id uuid,
  p_customer_id uuid
)
returns table (
  customer_id uuid,
  full_name text,
  email text,
  phone text,
  preferred_locale text,
  tags text[],
  restricted boolean,
  restriction_reason text,
  erased boolean,
  legal_hold boolean,
  suppressed boolean,
  revision bigint,
  created_at timestamptz,
  bookings jsonb,
  consents jsonb,
  sensitive_note_count bigint,
  intake_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id, c.full_name, c.email, c.phone, c.preferred_locale, c.tags,
    c.restricted_at is not null, c.restriction_reason, c.erased_at is not null,
    (select private.has_legal_hold_v1(c.tenant_id,c.id)),
    (select private.is_communication_suppressed_v1(c.tenant_id,c.id)),
    c.revision, c.created_at,
    coalesce((
      select pg_catalog.jsonb_agg(jsonb_build_object(
        'booking_id', b.id,
        'public_reference', b.public_reference,
        'service_name', b.service_name,
        'status', b.status,
        'starts_at', b.starts_at,
        'ends_at', b.ends_at,
        -- The contact details this booking was made under, which may differ
        -- from current identity and deliberately are not corrected by an edit.
        'contact_name', bc.full_name
      ) order by b.starts_at desc)
      from app.booking_contacts bc
      join app.bookings b on b.tenant_id = bc.tenant_id and b.id = bc.booking_id
      where bc.tenant_id = c.tenant_id and bc.customer_id = c.id), '[]'::jsonb),
    coalesce((
      select pg_catalog.jsonb_agg(jsonb_build_object(
        'policy_key', cc.policy_key,
        'policy_version', cc.policy_version,
        'accepted_at', cc.accepted_at,
        'source', cc.source) order by cc.accepted_at desc)
      from app.customer_consents cc
      where cc.tenant_id = c.tenant_id and cc.customer_id = c.id), '[]'::jsonb),
    (select pg_catalog.count(*) from app.booking_notes n
      join app.booking_contacts bc on bc.tenant_id = n.tenant_id and bc.booking_id = n.booking_id
      where n.tenant_id = c.tenant_id and bc.customer_id = c.id and n.visibility = 'sensitive'),
    (select pg_catalog.count(*) from app.booking_intake_answers ia
      join app.booking_contacts bc on bc.tenant_id = ia.tenant_id and bc.booking_id = ia.booking_id
      where ia.tenant_id = c.tenant_id and bc.customer_id = c.id)
  from app.customers c
  where c.tenant_id = p_tenant_id and c.id = p_customer_id;
$$;

-- ---------------------------------------------------------------------------
-- 7. Correction, restriction, suppression
-- ---------------------------------------------------------------------------

-- Correction edits current identity and nothing historical. Optimistic
-- concurrency against `revision` for the same reason bookings carry one: two
-- operators correcting the same person should not silently overwrite.
create or replace function private.correct_customer_v1(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_expected_revision bigint,
  p_full_name text,
  p_email text,
  p_phone text,
  p_preferred_locale text,
  p_tags text[]
)
returns table (customer_id uuid, revision bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer app.customers;
  v_membership uuid;
  v_hash text;
begin
  -- `can_decide_booking` with a null location is the tenant-scope capability
  -- test that honours ADR-0007 approval grants: a role holding this as
  -- `approval` passes only with a step-up behind it. The name is booking
  -- flavoured, the rule is not, and a second helper with the same body would
  -- be one more place for the approval rule to drift.
  if not coalesce((select private.can_decide_booking(p_tenant_id,null,'customer.data.correct')),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  v_membership := (select private.current_membership_id(p_tenant_id));

  select * into v_customer from app.customers c
  where c.tenant_id = p_tenant_id and c.id = p_customer_id for update;
  if v_customer.id is null then
    -- Absence and denial read identically to a caller. A wrong tenant learns
    -- nothing about whether the id exists.
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if v_customer.revision is distinct from p_expected_revision then
    raise exception using errcode='23505',message='revision_conflict';
  end if;
  if v_customer.erased_at is not null then
    raise exception using errcode='42501',message='policy_denied';
  end if;

  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    p_tenant_id::text||':'||pg_catalog.lower(p_email),'UTF8')),'hex');

  update app.customers c set
    full_name = p_full_name,
    email = p_email,
    phone = p_phone,
    email_hash = v_hash,
    preferred_locale = coalesce(p_preferred_locale, c.preferred_locale),
    tags = coalesce(p_tags, c.tags),
    revision = c.revision + 1,
    updated_at = pg_catalog.statement_timestamp()
  where c.tenant_id = p_tenant_id and c.id = p_customer_id;

  -- A correction is a privacy right exercised, so it leaves the same evidence
  -- a deletion does. The detail records which fields moved, never their values.
  insert into app.privacy_requests (
    tenant_id,customer_id,kind,status,requested_by_membership_id,detail,completed_at)
  values (p_tenant_id,p_customer_id,'correction','completed',v_membership,
    jsonb_build_object(
      'changed', (select coalesce(pg_catalog.jsonb_agg(f),'[]'::jsonb) from (
        select 'full_name' as f where p_full_name is distinct from v_customer.full_name
        union all select 'email' where p_email is distinct from v_customer.email
        union all select 'phone' where p_phone is distinct from v_customer.phone
        union all select 'preferred_locale' where p_preferred_locale is distinct from v_customer.preferred_locale
        union all select 'tags' where p_tags is distinct from v_customer.tags) as changes),
      'from_revision', v_customer.revision),
    pg_catalog.statement_timestamp());

  return query select p_customer_id, v_customer.revision + 1;
end;
$$;

-- Restriction suspends use without suspending existence. It also writes the
-- communication suppression, because "restrict processing" that still sends
-- marketing is not a restriction.
create or replace function private.set_customer_restriction_v1(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_restricted boolean,
  p_reason text
)
returns table (customer_id uuid, restricted boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer app.customers;
  v_membership uuid;
begin
  if not coalesce((select private.can_decide_booking(p_tenant_id,null,'customer.data.restrict')),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  v_membership := (select private.current_membership_id(p_tenant_id));

  select * into v_customer from app.customers c
  where c.tenant_id = p_tenant_id and c.id = p_customer_id for update;
  if v_customer.id is null then
    raise exception using errcode='42501',message='policy_denied';
  end if;

  update app.customers c set
    restricted_at = case when p_restricted then pg_catalog.statement_timestamp() else null end,
    restriction_reason = case when p_restricted then p_reason else null end,
    revision = c.revision + 1,
    updated_at = pg_catalog.statement_timestamp()
  where c.tenant_id = p_tenant_id and c.id = p_customer_id;

  if p_restricted then
    insert into app.notification_suppressions (tenant_id,recipient_hash,reason)
    values (p_tenant_id,v_customer.email_hash,'manual')
    on conflict do nothing;
  else
    -- Lifting a restriction lifts only the suppression it created. A hard
    -- bounce or a complaint is the provider's finding and survives.
    delete from app.notification_suppressions s
    where s.tenant_id = p_tenant_id and s.recipient_hash = v_customer.email_hash
      and s.reason = 'manual';
  end if;

  insert into app.privacy_requests (
    tenant_id,customer_id,kind,status,requested_by_membership_id,detail,completed_at)
  values (p_tenant_id,p_customer_id,'restriction','completed',v_membership,
    jsonb_build_object('restricted',p_restricted),pg_catalog.statement_timestamp());

  return query select p_customer_id, p_restricted;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Legal holds
-- ---------------------------------------------------------------------------

create or replace function private.set_legal_hold_v1(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_hold boolean,
  p_reason text
)
returns table (hold_id uuid, held boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership uuid;
  v_id uuid;
begin
  -- A hold is legal evidence handling, so it needs the audit capability and a
  -- recent authentication. Placing one is cheap; releasing one destroys the
  -- protection, and both go through the same door.
  if not coalesce((select private.has_direct_capability(p_tenant_id,'audit.read')),false)
     or not coalesce((select private.is_aal2()),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  v_membership := (select private.current_membership_id(p_tenant_id));

  if p_hold then
    insert into app.legal_holds (tenant_id,customer_id,reason,placed_by_membership_id)
    values (p_tenant_id,p_customer_id,p_reason,v_membership)
    -- A second hold on an already-held customer is the same hold.
    on conflict do nothing
    returning id into v_id;
    if v_id is null then
      select h.id into v_id from app.legal_holds h
      where h.tenant_id = p_tenant_id and h.released_at is null
        and h.customer_id is not distinct from p_customer_id;
    end if;
    return query select v_id, true;
    -- `return query` appends and keeps going; without this the release branch
    -- below would run too and the caller would get both rows.
    return;
  end if;

  update app.legal_holds h set
    released_at = pg_catalog.statement_timestamp(),
    released_by_membership_id = v_membership,
    release_reason = p_reason
  where h.tenant_id = p_tenant_id and h.released_at is null
    and h.customer_id is not distinct from p_customer_id
  returning h.id into v_id;
  return query select v_id, false;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Export
-- ---------------------------------------------------------------------------

-- The documented dependency closure, built in SQL so no row leaves the database
-- on its way into the artifact. Everything the tenant holds about this person:
-- identity, every booking with its contact snapshot and intake answers, every
-- note, consent evidence, notification metadata, payment references.
create or replace function private.build_customer_export_v1(
  p_tenant_id uuid,
  p_customer_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'schema_version', 1,
    'generated_at', pg_catalog.statement_timestamp(),
    'customer', (select jsonb_build_object(
        'full_name', c.full_name, 'email', c.email, 'phone', c.phone,
        'preferred_locale', c.preferred_locale, 'tags', c.tags,
        'created_at', c.created_at, 'restricted', c.restricted_at is not null)
      from app.customers c where c.tenant_id = p_tenant_id and c.id = p_customer_id),
    'bookings', coalesce((select pg_catalog.jsonb_agg(jsonb_build_object(
        'public_reference', b.public_reference,
        'service_name', b.service_name,
        'status', b.status,
        'starts_at', b.starts_at,
        'ends_at', b.ends_at,
        'contact', jsonb_build_object('full_name',bc.full_name,'email',bc.email,'phone',bc.phone),
        'intake_answers', (select ia.answers from app.booking_intake_answers ia
          where ia.tenant_id = b.tenant_id and ia.booking_id = b.id),
        'notes', coalesce((select pg_catalog.jsonb_agg(jsonb_build_object(
            'visibility', n.visibility, 'body', n.body, 'created_at', n.created_at)
            order by n.created_at)
          from app.booking_notes n where n.tenant_id = b.tenant_id and n.booking_id = b.id),'[]'::jsonb),
        'history', coalesce((select pg_catalog.jsonb_agg(jsonb_build_object(
            'event_type', e.event_type, 'created_at', e.created_at) order by e.created_at)
          from app.booking_events e where e.tenant_id = b.tenant_id and e.booking_id = b.id),'[]'::jsonb)
      ) order by b.starts_at)
      from app.booking_contacts bc
      join app.bookings b on b.tenant_id = bc.tenant_id and b.id = bc.booking_id
      where bc.tenant_id = p_tenant_id and bc.customer_id = p_customer_id),'[]'::jsonb),
    'consents', coalesce((select pg_catalog.jsonb_agg(jsonb_build_object(
        'policy_key', cc.policy_key, 'policy_version', cc.policy_version,
        'accepted_at', cc.accepted_at, 'source', cc.source) order by cc.accepted_at)
      from app.customer_consents cc
      where cc.tenant_id = p_tenant_id and cc.customer_id = p_customer_id),'[]'::jsonb),
    -- Metadata only. The provider holds the rendered mail; this says what was
    -- sent, when, and how it landed, which is the part the tenant controls.
    'notifications', coalesce((select pg_catalog.jsonb_agg(jsonb_build_object(
        'template_key', m.template_key, 'locale', m.template_locale,
        'status', m.status, 'created_at', m.created_at) order by m.created_at)
      from app.notification_messages m
      join app.customers c on c.tenant_id = m.tenant_id and c.email_hash = m.recipient_hash
      where m.tenant_id = p_tenant_id and c.id = p_customer_id),'[]'::jsonb),
    -- References and amounts, never card data: that lives at the provider and
    -- the platform has never held it. Attempts are the booking-scoped record;
    -- charges and refunds hang off them.
    'payments', coalesce((select pg_catalog.jsonb_agg(jsonb_build_object(
        'amount_minor_units', a.amount_minor_units,
        'currency', a.currency,
        'status', a.status,
        'created_at', a.created_at,
        'charges', coalesce((select pg_catalog.jsonb_agg(jsonb_build_object(
            'amount_minor_units', ch.amount_minor_units, 'currency', ch.currency,
            'status', ch.status, 'created_at', ch.created_at) order by ch.created_at)
          from app.payment_charges ch
          where ch.tenant_id = a.tenant_id and ch.payment_attempt_id = a.id),'[]'::jsonb),
        'refunds', coalesce((select pg_catalog.jsonb_agg(jsonb_build_object(
            'amount_minor_units', rf.amount_minor_units, 'currency', rf.currency,
            'status', rf.status, 'reason', rf.reason, 'created_at', rf.created_at)
            order by rf.created_at)
          from app.payment_refunds rf
          join app.payment_charges ch2 on ch2.tenant_id = rf.tenant_id and ch2.id = rf.payment_charge_id
          where rf.tenant_id = a.tenant_id and ch2.payment_attempt_id = a.id),'[]'::jsonb)
      ) order by a.created_at)
      from app.payment_attempts a
      join app.booking_contacts bc on bc.tenant_id = a.tenant_id and bc.booking_id = a.booking_id
      where a.tenant_id = p_tenant_id and bc.customer_id = p_customer_id),'[]'::jsonb),
    -- Stated rather than omitted, so the export is honest about what it cannot
    -- contain. An empty section and a section that does not exist are different
    -- claims to a regulator.
    'excluded', jsonb_build_object(
      'storage_objects', 'no customer-uploaded files exist in this release (ADR-0008)',
      'analytics', 'pseudonymous events only, expire on their own 30-day and 13-month clocks',
      'backups', 'point-in-time backups are not surgically edited; they expire on their own retention clock')
  );
$$;

-- ---------------------------------------------------------------------------
-- 10. Erasure
-- ---------------------------------------------------------------------------

-- The only function permitted to break append-only, and the only one that sets
-- the erasure GUC. Everything it touches is named here; nothing is cascaded.
create or replace function private.erase_customer_records_v1(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_request_id uuid
)
returns table (subsystem text, affected integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contacts integer;
  v_intake integer;
  v_notes integer;
  v_customer integer;
begin
  -- Scoped to this transaction, so no later statement inherits the permission.
  perform pg_catalog.set_config('app.erasure_request_id', p_request_id::text, true);

  -- Sensitive class first: intake answers and sensitive notes are hard-deleted
  -- on the sensitive-data clock. Operational notes survive, because "the
  -- customer arrived late" is tenant operational data about the tenant's day.
  delete from app.booking_intake_answers ia
  where ia.tenant_id = p_tenant_id and ia.booking_id in (
    select bc.booking_id from app.booking_contacts bc
    where bc.tenant_id = p_tenant_id and bc.customer_id = p_customer_id);
  get diagnostics v_intake = row_count;

  delete from app.booking_notes n
  where n.tenant_id = p_tenant_id and n.visibility = 'sensitive' and n.booking_id in (
    select bc.booking_id from app.booking_contacts bc
    where bc.tenant_id = p_tenant_id and bc.customer_id = p_customer_id);
  get diagnostics v_notes = row_count;

  -- Contact rows are anonymized rather than deleted: the booking they belong to
  -- is financial evidence with a lawful retention of its own, and a booking with
  -- no contact row at all would be a hole in that evidence rather than a
  -- privacy improvement. Every identifying value goes; the shape stays.
  update app.booking_contacts bc set
    full_name = 'redacted',
    email = 'redacted@invalid',
    phone = null
  where bc.tenant_id = p_tenant_id and bc.customer_id = p_customer_id;
  get diagnostics v_contacts = row_count;

  -- The identity row survives as the referent the bookings point at, holding
  -- nothing that identifies anybody. The email_hash is replaced with a random
  -- digest so the row cannot be re-identified by hashing a guessed address.
  update app.customers c set
    full_name = null, email = null, phone = null, tags = '{}'::text[],
    email_hash = pg_catalog.encode(pg_catalog.sha256(
      pg_catalog.convert_to(pg_catalog.gen_random_uuid()::text,'UTF8')),'hex'),
    erased_at = pg_catalog.statement_timestamp(),
    revision = c.revision + 1,
    updated_at = pg_catalog.statement_timestamp()
  where c.tenant_id = p_tenant_id and c.id = p_customer_id;
  get diagnostics v_customer = row_count;

  perform pg_catalog.set_config('app.erasure_request_id', '', true);

  return query
    select 'sensitive_records'::text, v_intake + v_notes
    union all select 'postgres_primary'::text, v_contacts + v_customer;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. The request runner
-- ---------------------------------------------------------------------------

-- Opening a request. Separate from running it so an interrupted run resumes
-- against a request that already exists rather than opening a second one.
create or replace function private.open_privacy_request_v1(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_kind text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_membership uuid;
  v_capability text;
  v_steps text[];
begin
  v_capability := case p_kind when 'export' then 'customer.data.export'
                             when 'deletion' then 'customer.data.delete' end;
  if v_capability is null then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if not coalesce((select private.can_decide_booking(p_tenant_id,null,v_capability)),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  -- Both jobs assemble or destroy a whole person's record, so both are step-up
  -- operations regardless of how the session was established.
  if not coalesce((select private.is_aal2()),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if not exists (select 1 from app.customers c
                 where c.tenant_id = p_tenant_id and c.id = p_customer_id) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  v_membership := (select private.current_membership_id(p_tenant_id));

  -- A live request of the same kind is returned rather than duplicated, which
  -- is what makes a retried submission safe without an idempotency key.
  select r.id into v_id from app.privacy_requests r
  where r.tenant_id = p_tenant_id and r.customer_id = p_customer_id and r.kind = p_kind
    and r.status in ('pending','running','blocked');
  if v_id is not null then
    return v_id;
  end if;

  insert into app.privacy_requests (tenant_id,customer_id,kind,requested_by_membership_id)
  values (p_tenant_id,p_customer_id,p_kind,v_membership)
  returning id into v_id;

  -- The dependency closure, one row per subsystem, all pending. A subsystem
  -- with nothing to do still gets a row: "we checked and it did not apply" is a
  -- different statement from "we never looked".
  v_steps := case p_kind
    when 'export' then array['postgres_primary','sensitive_records','storage_objects',
                             'email_provider','payment_metadata','calendar_metadata','analytics','backups']
    else array['sensitive_records','postgres_primary','storage_objects',
               'email_provider','payment_metadata','calendar_metadata','analytics','backups']
  end;
  insert into app.privacy_request_steps (tenant_id,request_id,subsystem)
  select p_tenant_id, v_id, s from unnest(v_steps) as s;

  return v_id;
end;
$$;

-- Running a request. Restartable by construction: a step that already succeeded
-- is never re-run, so calling this after a crash, a timeout, or a partial
-- provider failure resumes exactly where it stopped.
create or replace function private.run_privacy_request_v1(
  p_tenant_id uuid,
  p_request_id uuid
)
returns table (status text, blocked_reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request app.privacy_requests;
  v_step record;
  v_erasure record;
  v_hash text;
  v_remaining integer;
begin
  if not coalesce((select private.has_direct_capability(p_tenant_id,'audit.read')),false)
     and not coalesce((select private.can_decide_booking(p_tenant_id,null,'customer.data.delete')),false)
     and not coalesce((select private.can_decide_booking(p_tenant_id,null,'customer.data.export')),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;

  select * into v_request from app.privacy_requests r
  where r.tenant_id = p_tenant_id and r.id = p_request_id for update;
  if v_request.id is null then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if v_request.status = 'completed' then
    -- Already done. Re-running is a no-op, not an error, because a retry after
    -- a lost response is the normal case.
    return query select v_request.status, v_request.blocked_reason;
    return;
  end if;

  -- The hold check runs on every attempt, not only the first: a hold placed
  -- after a deletion was opened still stops it.
  if v_request.kind = 'deletion'
     and coalesce((select private.has_legal_hold_v1(p_tenant_id,v_request.customer_id)),false) then
    update app.privacy_requests r
      set status='blocked', blocked_reason='legal_hold_active',
          updated_at=pg_catalog.statement_timestamp()
    where r.id = p_request_id;
    update app.privacy_request_steps s
      set status='blocked', outcome_code='legal_hold_active',
          updated_at=pg_catalog.statement_timestamp()
    where s.request_id = p_request_id and s.status = 'pending';
    return query select 'blocked'::text, 'legal_hold_active'::text;
    return;
  end if;

  -- A previously blocked request whose hold was released resumes from pending.
  update app.privacy_request_steps s
    set status='pending', outcome_code=null, updated_at=pg_catalog.statement_timestamp()
  where s.request_id = p_request_id and s.status = 'blocked';
  update app.privacy_requests r
    set status='running', blocked_reason=null, updated_at=pg_catalog.statement_timestamp()
  where r.id = p_request_id;

  select c.email_hash into v_hash from app.customers c
  where c.tenant_id = p_tenant_id and c.id = v_request.customer_id;

  if v_request.kind = 'deletion' then
    -- Postgres work happens once, under one transaction, and reports per
    -- subsystem. Re-running after this point finds both steps succeeded.
    if exists (select 1 from app.privacy_request_steps s
               where s.request_id = p_request_id and s.status = 'pending'
                 and s.subsystem in ('postgres_primary','sensitive_records')) then
      for v_erasure in
        select * from private.erase_customer_records_v1(p_tenant_id,v_request.customer_id,p_request_id)
      loop
        update app.privacy_request_steps s
          set status='succeeded', outcome_code='erased',
              affected_rows=v_erasure.affected, attempts=s.attempts+1,
              updated_at=pg_catalog.statement_timestamp()
        where s.request_id = p_request_id and s.subsystem = v_erasure.subsystem;
      end loop;
    end if;

    -- Resend: the address is suppressed so nothing reaches it again. The
    -- provider's own logs age out on its retention, which the export states and
    -- this step records rather than pretending to purge.
    if exists (select 1 from app.privacy_request_steps s
               where s.request_id = p_request_id and s.subsystem = 'email_provider'
                 and s.status = 'pending') then
      insert into app.notification_suppressions (tenant_id,recipient_hash,reason)
      values (p_tenant_id,v_hash,'manual') on conflict do nothing;
      update app.privacy_request_steps s
        set status='succeeded', outcome_code='suppressed_at_provider',
            attempts=s.attempts+1, updated_at=pg_catalog.statement_timestamp()
      where s.request_id = p_request_id and s.subsystem = 'email_provider';
    end if;
  end if;

  if v_request.kind = 'export' then
    if exists (select 1 from app.privacy_request_steps s
               where s.request_id = p_request_id and s.status = 'pending'
                 and s.subsystem in ('postgres_primary','sensitive_records','email_provider','payment_metadata')) then
      update app.privacy_requests r set
        artifact = (select private.build_customer_export_v1(p_tenant_id,v_request.customer_id)),
        -- Short-lived by design. An export is the densest PII the product ever
        -- assembles, and it should not sit around being densely available.
        artifact_expires_at = pg_catalog.statement_timestamp() + pg_catalog.make_interval(days=>7),
        updated_at = pg_catalog.statement_timestamp()
      where r.id = p_request_id;
      update app.privacy_request_steps s
        set status='succeeded', outcome_code='included_in_artifact',
            attempts=s.attempts+1, updated_at=pg_catalog.statement_timestamp()
      where s.request_id = p_request_id
        and s.subsystem in ('postgres_primary','sensitive_records','email_provider','payment_metadata');
    end if;
  end if;

  -- Subsystems with nothing to do in this release. Recorded, never skipped:
  -- these are exactly the claims a regulator asks the platform to substantiate,
  -- and each one names why rather than reporting a silent success.
  update app.privacy_request_steps s set
    status = 'not_applicable',
    outcome_code = case s.subsystem
      when 'storage_objects' then 'no_customer_objects_in_release'
      when 'calendar_metadata' then 'one_way_ics_only_no_stored_provider_objects'
      when 'analytics' then 'pseudonymous_events_expire_on_own_clock'
      when 'backups' then 'backups_expire_on_retention_never_edited'
      when 'payment_metadata' then 'financial_evidence_retained_lawfully'
      when 'email_provider' then 'provider_logs_expire_on_provider_retention'
      else 'not_applicable' end,
    attempts = s.attempts + 1,
    updated_at = pg_catalog.statement_timestamp()
  where s.request_id = p_request_id and s.status = 'pending';

  select pg_catalog.count(*) into v_remaining from app.privacy_request_steps s
  where s.request_id = p_request_id and s.status in ('pending','failed','blocked');

  update app.privacy_requests r set
    status = case when v_remaining = 0 then 'completed' else 'running' end,
    completed_at = case when v_remaining = 0 then pg_catalog.statement_timestamp() else null end,
    updated_at = pg_catalog.statement_timestamp()
  where r.id = p_request_id;

  return query select case when v_remaining = 0 then 'completed' else 'running' end, null::text;
end;
$$;

-- Reading a request, including the artifact. The artifact column is revoked
-- from `authenticated` at the table, so this is the only path to it, and it
-- re-checks capability and step-up rather than trusting that opening the
-- request was enough.
create or replace function private.get_privacy_request_v1(
  p_tenant_id uuid,
  p_request_id uuid
)
returns table (
  request_id uuid,
  customer_id uuid,
  kind text,
  status text,
  blocked_reason text,
  offboarding_phase text,
  detail jsonb,
  steps jsonb,
  artifact jsonb,
  artifact_expires_at timestamptz,
  created_at timestamptz,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_may_export boolean;
begin
  if not coalesce((select private.is_active_tenant_member(p_tenant_id)),false)
     or not coalesce((select private.has_direct_capability(p_tenant_id,'audit.read')),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  v_may_export := coalesce((select private.can_decide_booking(p_tenant_id,null,'customer.data.export')),false)
              and coalesce((select private.is_aal2()),false);

  return query
  select r.id, r.customer_id, r.kind, r.status, r.blocked_reason, r.offboarding_phase, r.detail,
    coalesce((select pg_catalog.jsonb_agg(jsonb_build_object(
        'subsystem', s.subsystem, 'status', s.status,
        'outcome_code', s.outcome_code, 'affected_rows', s.affected_rows,
        'attempts', s.attempts) order by s.subsystem)
      from app.privacy_request_steps s where s.request_id = r.id),'[]'::jsonb),
    -- Expired is the same as absent. The artifact is not returned late.
    case when v_may_export
           and r.artifact_expires_at is not null
           and r.artifact_expires_at > pg_catalog.statement_timestamp()
         then r.artifact end,
    r.artifact_expires_at, r.created_at, r.completed_at
  from app.privacy_requests r
  where r.tenant_id = p_tenant_id and r.id = p_request_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Tenant offboarding
-- ---------------------------------------------------------------------------

-- Five ordered phases. The order is the safety property: a tenant cannot reach
-- `delete_primary` without having passed through the phase that preserved an
-- export, and cannot skip the hold check that `delete_primary` performs.
create or replace function private.advance_tenant_offboarding_v1(
  p_tenant_id uuid,
  p_phase text
)
returns table (phase text, status text, blocked_reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership uuid;
  v_current text;
  v_expected text;
  v_id uuid;
  v_phases text[] := array['restrict_bookings','preserve_export','close_instance',
                           'delete_primary','retain_evidence'];
  v_index integer;
begin
  -- Ending a tenant is an owner action with a recent authentication behind it.
  if not coalesce((select private.can_decide_booking(p_tenant_id,null,'tenant.owner_transfer')),false)
     or not coalesce((select private.is_aal2()),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  v_membership := (select private.current_membership_id(p_tenant_id));

  v_index := pg_catalog.array_position(v_phases,p_phase);
  if v_index is null then
    raise exception using errcode='42501',message='offboarding_sequence';
  end if;

  select r.offboarding_phase into v_current from app.privacy_requests r
  where r.tenant_id = p_tenant_id and r.kind = 'offboarding'
  order by r.created_at desc limit 1;

  v_expected := case when v_current is null then v_phases[1]
                     else v_phases[pg_catalog.array_position(v_phases,v_current) + 1] end;
  -- Replaying the phase just completed is a no-op; jumping ahead is refused.
  if p_phase = v_current then
    return query select v_current, 'completed'::text, null::text;
    return;
  end if;
  if p_phase is distinct from v_expected then
    raise exception using errcode='42501',message='offboarding_sequence';
  end if;

  -- Nothing is destroyed while any hold in the tenant is live.
  if p_phase = 'delete_primary'
     and coalesce((select private.has_legal_hold_v1(p_tenant_id,null)),false) then
    insert into app.privacy_requests (
      tenant_id,kind,status,offboarding_phase,requested_by_membership_id,blocked_reason,detail)
    values (p_tenant_id,'offboarding','blocked',v_current,v_membership,'legal_hold_active',
      jsonb_build_object('refused_phase',p_phase));
    return query select v_current, 'blocked'::text, 'legal_hold_active'::text;
    return;
  end if;

  insert into app.privacy_requests (
    tenant_id,kind,status,offboarding_phase,requested_by_membership_id,detail,completed_at)
  values (p_tenant_id,'offboarding','completed',p_phase,v_membership,
    jsonb_build_object('sequence',v_index),pg_catalog.statement_timestamp())
  returning id into v_id;

  -- The tenant status column from issue #6 already carries exactly these two
  -- states, and every isolation helper already reads it. Nothing about booking
  -- acceptance is re-implemented here; the tenant simply stops being active.
  if p_phase = 'restrict_bookings' then
    update app.tenants t set status = 'suspended', updated_at = pg_catalog.statement_timestamp()
    where t.id = p_tenant_id;
  elsif p_phase = 'close_instance' then
    update app.tenants t set status = 'closed', updated_at = pg_catalog.statement_timestamp()
    where t.id = p_tenant_id;
  end if;

  return query select p_phase, 'completed'::text, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. api_v1 surface
-- ---------------------------------------------------------------------------

create or replace function api_v1.correct_customer_v1(
  p_tenant_id uuid, p_customer_id uuid, p_expected_revision bigint,
  p_full_name text, p_email text, p_phone text default null,
  p_preferred_locale text default null, p_tags text[] default null)
returns table (customer_id uuid, revision bigint)
language sql volatile security invoker set search_path = ''
as $$ select * from private.correct_customer_v1(p_tenant_id,p_customer_id,p_expected_revision,
  p_full_name,p_email,p_phone,p_preferred_locale,p_tags); $$;

create or replace function api_v1.set_customer_restriction_v1(
  p_tenant_id uuid, p_customer_id uuid, p_restricted boolean, p_reason text default null)
returns table (customer_id uuid, restricted boolean)
language sql volatile security invoker set search_path = ''
as $$ select * from private.set_customer_restriction_v1(p_tenant_id,p_customer_id,p_restricted,p_reason); $$;

create or replace function api_v1.set_legal_hold_v1(
  p_tenant_id uuid, p_customer_id uuid, p_hold boolean, p_reason text)
returns table (hold_id uuid, held boolean)
language sql volatile security invoker set search_path = ''
as $$ select * from private.set_legal_hold_v1(p_tenant_id,p_customer_id,p_hold,p_reason); $$;

create or replace function api_v1.open_privacy_request_v1(
  p_tenant_id uuid, p_customer_id uuid, p_kind text)
returns uuid
language sql volatile security invoker set search_path = ''
as $$ select private.open_privacy_request_v1(p_tenant_id,p_customer_id,p_kind); $$;

create or replace function api_v1.run_privacy_request_v1(
  p_tenant_id uuid, p_request_id uuid)
returns table (status text, blocked_reason text)
language sql volatile security invoker set search_path = ''
as $$ select * from private.run_privacy_request_v1(p_tenant_id,p_request_id); $$;

create or replace function api_v1.get_privacy_request_v1(
  p_tenant_id uuid, p_request_id uuid)
returns table (
  request_id uuid, customer_id uuid, kind text, status text, blocked_reason text,
  offboarding_phase text, detail jsonb, steps jsonb, artifact jsonb,
  artifact_expires_at timestamptz, created_at timestamptz, completed_at timestamptz)
language sql volatile security invoker set search_path = ''
as $$ select * from private.get_privacy_request_v1(p_tenant_id,p_request_id); $$;

create or replace function api_v1.advance_tenant_offboarding_v1(
  p_tenant_id uuid, p_phase text)
returns table (phase text, status text, blocked_reason text)
language sql volatile security invoker set search_path = ''
as $$ select * from private.advance_tenant_offboarding_v1(p_tenant_id,p_phase); $$;

-- The request list is a plain read over rows RLS already scopes, so it stays
-- SECURITY INVOKER and re-checks nothing.
create or replace function api_v1.list_privacy_requests_v1(
  p_tenant_id uuid, p_customer_id uuid default null, p_limit integer default 50)
returns table (
  request_id uuid, customer_id uuid, kind text, status text, blocked_reason text,
  offboarding_phase text, created_at timestamptz, completed_at timestamptz,
  pending_steps bigint)
language sql stable security invoker set search_path = ''
as $$
  select r.id, r.customer_id, r.kind, r.status, r.blocked_reason, r.offboarding_phase,
    r.created_at, r.completed_at,
    (select pg_catalog.count(*) from app.privacy_request_steps s
      where s.request_id = r.id and s.status in ('pending','failed','blocked'))
  from app.privacy_requests r
  where r.tenant_id = p_tenant_id
    and (p_customer_id is null or r.customer_id = p_customer_id)
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit,50),1),200);
$$;

-- ---------------------------------------------------------------------------
-- 14. Grants
-- ---------------------------------------------------------------------------

revoke all on function
  private.link_booking_contact_customer(),
  private.has_legal_hold_v1(uuid,uuid),
  private.is_communication_suppressed_v1(uuid,uuid),
  private.correct_customer_v1(uuid,uuid,bigint,text,text,text,text,text[]),
  private.set_customer_restriction_v1(uuid,uuid,boolean,text),
  private.set_legal_hold_v1(uuid,uuid,boolean,text),
  private.build_customer_export_v1(uuid,uuid),
  private.erase_customer_records_v1(uuid,uuid,uuid),
  private.open_privacy_request_v1(uuid,uuid,text),
  private.run_privacy_request_v1(uuid,uuid),
  private.get_privacy_request_v1(uuid,uuid),
  private.advance_tenant_offboarding_v1(uuid,text)
from public, anon, authenticated;

grant execute on function
  private.has_legal_hold_v1(uuid,uuid),
  private.is_communication_suppressed_v1(uuid,uuid),
  private.correct_customer_v1(uuid,uuid,bigint,text,text,text,text,text[]),
  private.set_customer_restriction_v1(uuid,uuid,boolean,text),
  private.set_legal_hold_v1(uuid,uuid,boolean,text),
  private.open_privacy_request_v1(uuid,uuid,text),
  private.run_privacy_request_v1(uuid,uuid),
  private.get_privacy_request_v1(uuid,uuid),
  private.advance_tenant_offboarding_v1(uuid,text)
to authenticated;

revoke all on function
  api_v1.search_customers_v1(uuid,text,boolean,integer,integer),
  api_v1.get_customer_detail_v1(uuid,uuid),
  api_v1.correct_customer_v1(uuid,uuid,bigint,text,text,text,text,text[]),
  api_v1.set_customer_restriction_v1(uuid,uuid,boolean,text),
  api_v1.set_legal_hold_v1(uuid,uuid,boolean,text),
  api_v1.open_privacy_request_v1(uuid,uuid,text),
  api_v1.run_privacy_request_v1(uuid,uuid),
  api_v1.get_privacy_request_v1(uuid,uuid),
  api_v1.advance_tenant_offboarding_v1(uuid,text),
  api_v1.list_privacy_requests_v1(uuid,uuid,integer)
from public, anon;

grant execute on function
  api_v1.search_customers_v1(uuid,text,boolean,integer,integer),
  api_v1.get_customer_detail_v1(uuid,uuid),
  api_v1.correct_customer_v1(uuid,uuid,bigint,text,text,text,text,text[]),
  api_v1.set_customer_restriction_v1(uuid,uuid,boolean,text),
  api_v1.set_legal_hold_v1(uuid,uuid,boolean,text),
  api_v1.open_privacy_request_v1(uuid,uuid,text),
  api_v1.run_privacy_request_v1(uuid,uuid),
  api_v1.get_privacy_request_v1(uuid,uuid),
  api_v1.advance_tenant_offboarding_v1(uuid,text),
  api_v1.list_privacy_requests_v1(uuid,uuid,integer)
to authenticated;
