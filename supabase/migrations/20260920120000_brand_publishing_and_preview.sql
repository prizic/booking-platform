-- Issue #25: draft, preview, and publish a complete brand.
--
-- Issue #6 created `app.brands` and `app.brand_revisions` as a skeleton: a key,
-- a state, a revision number, and nothing to actually render. Issue #5 built the
-- other half in TypeScript — `BrandTokens`, `BrandAssets`, `validateBrandTokens`
-- with real contrast ratios, and the shipped font list — all unit tested in
-- `packages/white-label-ui`. This migration connects the two and adds nothing
-- that either already does.
--
-- Where validation lives, and why it is split:
--
--   Contrast ratios, font allow-lists and asset path shapes are arithmetic and
--   string rules. They live in TypeScript, where they are unit tested against
--   real colour pairs, and they run before anything is submitted. Re-deriving a
--   WCAG contrast ratio in PL/pgSQL would be a second implementation of a rule
--   that is already right, and the two would drift.
--
--   What the database enforces is what only the database can: that a published
--   revision is immutable, that exactly one revision per brand is published at
--   a time, that a draft cannot be published by somebody without the
--   capability, and — the part that genuinely cannot be left to a client —
--   that the stored JSON contains no executable markup. A client-side check
--   that the config has no `<script>` is a check an attacker skips by calling
--   the RPC directly.
--
-- What this deliberately does NOT add:
--
--   * no second token schema. `packages/white-label-ui` owns the shape.
--   * no rich-text engine. Content is a bounded set of plain-text fields and
--     link URLs; there is no HTML to sanitize because none is accepted.
--   * no preview query parameter. A preview is reachable only by presenting a
--     token this platform minted, which is why an unrestricted
--     `?preview=<revision>` switch does not exist to be guessed.
--   * no new audit table. Publication attribution lives on the revision row,
--     which is the thing being attributed.
--
-- Error vocabulary. Published strings reused; this migration adds two:
--   brand_unsafe_content  22023  the config or content contained executable markup
--   brand_not_publishable 42501  nothing about this revision may be published

-- ---------------------------------------------------------------------------
-- 1. A revision carries what it renders
-- ---------------------------------------------------------------------------

alter table app.brand_revisions add column config jsonb not null default '{}'::jsonb
  check (jsonb_typeof(config) = 'object');
-- Locale-specific copy, legal links and contact details. Separate from `config`
-- because the tokens are one per brand while the words are one per language.
alter table app.brand_revisions add column content jsonb not null default '{}'::jsonb
  check (jsonb_typeof(content) = 'object');
-- What the caller saw when they published. Two administrators publishing the
-- same draft produce the same hash; a draft edited in between does not.
alter table app.brand_revisions add column content_hash text
  check (content_hash is null or content_hash ~ '^[a-f0-9]{64}$');
alter table app.brand_revisions add column created_by_membership_id uuid;
alter table app.brand_revisions add column published_by_membership_id uuid;
alter table app.brand_revisions add column notes text
  check (notes is null or char_length(notes) between 1 and 500);
alter table app.brand_revisions
  add constraint brand_revisions_created_by_fk
  foreign key (tenant_id,created_by_membership_id)
  references app.memberships(tenant_id,id) on delete restrict;
alter table app.brand_revisions
  add constraint brand_revisions_published_by_fk
  foreign key (tenant_id,published_by_membership_id)
  references app.memberships(tenant_id,id) on delete restrict;
-- Issue #6 required `published_at` to be null unless the state is exactly
-- `published`, which made retiring a revision impossible without erasing when it
-- was live. A retired revision was published once and should still say when:
-- that is the history a rollback is chosen from.
alter table app.brand_revisions drop constraint brand_revisions_check;
alter table app.brand_revisions add constraint brand_revisions_check
  check (
    (state = 'published' and published_at is not null)
    or (state = 'retired')
    or (state = 'draft' and published_at is null)
  );

-- One-directional on purpose. Attribution implies publication, so a draft can
-- never claim a publisher. The reverse is not required because the seed's
-- fixture revisions are written before any membership exists to attribute them
-- to; every revision the publish function writes carries one.
alter table app.brand_revisions
  add constraint brand_revisions_published_attribution
  check (published_by_membership_id is null or state in ('published','retired'));

-- Exactly one published revision per brand. Publishing a second one retires the
-- first in the same transaction, so there is no instant where a customer could
-- load a page and get neither.
create unique index brand_revisions_published_idx
  on app.brand_revisions (tenant_id,brand_id) where state = 'published';

-- A published revision is what customers saw. It is immutable for the same
-- reason a booking snapshot is: it is evidence of what was presented, and a
-- later edit would rewrite history rather than change the future.
create or replace function private.enforce_published_brand_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.state = 'published' and new.state = 'published'
     and (old.config is distinct from new.config
       or old.content is distinct from new.content
       or old.content_hash is distinct from new.content_hash) then
    raise exception using errcode='42501',message='booking_immutable';
  end if;
  return new;
end;
$$;
create trigger brand_revisions_published_immutable
  before update on app.brand_revisions
  for each row execute function private.enforce_published_brand_immutability();

-- ---------------------------------------------------------------------------
-- 2. What the database refuses to store
-- ---------------------------------------------------------------------------

-- Executable markup, anywhere in the document, at any depth. A client-side
-- check is a check an attacker skips by calling the RPC directly, so this one
-- runs where the row is written.
--
-- The test is deliberately crude and deliberately broad: this platform accepts
-- plain text and URLs, so any angle bracket, `javascript:` scheme, inline event
-- handler or data URL is out of bounds regardless of context. There is no
-- sanitizer to get subtly wrong because there is nothing to sanitize.
create or replace function private.brand_document_is_safe_v1(p_document jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select not (p_document::text ~* '(<[a-z/!]|javascript:|data:text/html|vbscript:|\son[a-z]+\s*=|&#x?[0-9a-f]+;|\\u003c)');
$$;

alter table app.brand_revisions
  add constraint brand_revisions_config_safe
  check (private.brand_document_is_safe_v1(config));
alter table app.brand_revisions
  add constraint brand_revisions_content_safe
  check (private.brand_document_is_safe_v1(content));

-- ---------------------------------------------------------------------------
-- 3. Preview
-- ---------------------------------------------------------------------------

-- A preview is reachable only by presenting a token this platform minted. There
-- is deliberately no `?preview=<revision>` switch: a query parameter is a value
-- anybody can type, and an unpublished brand is a tenant's unreleased work.
create table app.brand_preview_tokens (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  brand_revision_id uuid not null,
  -- The token itself is never stored. Tenant-salted digest, exactly like the
  -- guest management links from issue #14.
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  issued_by_membership_id uuid,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  primary key (id),
  unique (tenant_id,id),
  unique (token_hash),
  foreign key (tenant_id,brand_revision_id)
    references app.brand_revisions(tenant_id,id) on delete restrict,
  foreign key (tenant_id,issued_by_membership_id)
    references app.memberships(tenant_id,id) on delete restrict
);

-- Preview state is operator data. No application role reads or writes it; the
-- preview surface reaches it only through the redemption function.
alter table app.brand_preview_tokens enable row level security;
create policy brand_preview_tokens_select_denied on app.brand_preview_tokens
  for select to anon,authenticated using (false);
create policy brand_preview_tokens_insert_denied on app.brand_preview_tokens
  for insert to anon,authenticated with check (false);
create policy brand_preview_tokens_update_denied on app.brand_preview_tokens
  for update to anon,authenticated using (false) with check (false);
create policy brand_preview_tokens_delete_denied on app.brand_preview_tokens
  for delete to anon,authenticated using (false);
revoke all on app.brand_preview_tokens from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 4. Reading a brand
-- ---------------------------------------------------------------------------

-- Issue #6 already gave both brand tables row level security, a member read and
-- a public read through `is_public_tenant_context`. That public policy is how a
-- customer's browser reaches a published brand at all, so none of it is
-- replaced here. The `brand.manage` capability is enforced by the write
-- functions below, which is where authoring authority actually matters.

-- ---------------------------------------------------------------------------
-- 5. Authoring
-- ---------------------------------------------------------------------------

-- Save a draft. Optimistic concurrency against the revision, so two
-- administrators editing the same brand do not silently overwrite each other.
create or replace function private.save_brand_draft_v1(
  p_tenant_id uuid,
  p_brand_key text,
  p_config jsonb,
  p_content jsonb,
  p_expected_revision bigint default null,
  p_notes text default null
)
returns table (
  contract_version integer,
  brand_id uuid,
  brand_revision_id uuid,
  revision bigint,
  content_hash text
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
declare
  v_brand app.brands%rowtype;
  v_draft app.brand_revisions%rowtype;
  v_membership uuid;
  v_next bigint;
  v_hash text;
  v_id uuid;
begin
  if not coalesce((select private.can_decide_booking(p_tenant_id,null,'brand.manage')),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if p_config is null or pg_catalog.jsonb_typeof(p_config) <> 'object'
     or p_content is null or pg_catalog.jsonb_typeof(p_content) <> 'object' then
    raise exception using errcode='22023',message='brand_invalid_document';
  end if;
  -- Refused here as well as by the check constraint, so the caller gets the
  -- reason rather than a constraint name.
  if not private.brand_document_is_safe_v1(p_config)
     or not private.brand_document_is_safe_v1(p_content) then
    raise exception using errcode='22023',message='brand_unsafe_content';
  end if;
  v_membership := (select private.current_membership_id(p_tenant_id));

  select * into v_brand from app.brands b
  where b.tenant_id = p_tenant_id and b.key = p_brand_key for update;
  if v_brand.id is null then
    insert into app.brands(id,tenant_id,key) values
      (pg_catalog.gen_random_uuid(),p_tenant_id,p_brand_key)
    returning * into v_brand;
  end if;

  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    p_config::text||':'||p_content::text,'UTF8')),'hex');

  -- One open draft per brand. Editing is editing that draft, not stacking a new
  -- revision per keystroke.
  select * into v_draft from app.brand_revisions r
  where r.tenant_id = p_tenant_id and r.brand_id = v_brand.id and r.state = 'draft'
  for update;

  if v_draft.id is not null then
    if p_expected_revision is not null and v_draft.revision is distinct from p_expected_revision then
      raise exception using errcode='23505',message='revision_conflict';
    end if;
    update app.brand_revisions r set
      config = p_config, content = p_content, content_hash = v_hash,
      created_by_membership_id = v_membership, notes = p_notes
    where r.id = v_draft.id;
    return query select 1,v_brand.id,v_draft.id,v_draft.revision,v_hash;
    return;
  end if;

  select coalesce(pg_catalog.max(r.revision),0) + 1 into v_next
  from app.brand_revisions r
  where r.tenant_id = p_tenant_id and r.brand_id = v_brand.id;

  insert into app.brand_revisions(
    id,tenant_id,brand_id,revision,state,config_version,config,content,content_hash,
    created_by_membership_id,notes)
  values (pg_catalog.gen_random_uuid(),p_tenant_id,v_brand.id,v_next,'draft',1,
    p_config,p_content,v_hash,v_membership,p_notes)
  returning id into v_id;

  return query select 1,v_brand.id,v_id,v_next,v_hash;
end;
$function$;

-- Publish. The caller states the hash they reviewed, so publishing a draft that
-- somebody edited in between is refused rather than silently shipping their
-- work under this person's name.
create or replace function private.publish_brand_revision_v1(
  p_tenant_id uuid,
  p_brand_revision_id uuid,
  p_expected_content_hash text
)
returns table (
  contract_version integer,
  brand_revision_id uuid,
  revision bigint,
  published_at timestamptz,
  retired_revision bigint
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_revision app.brand_revisions%rowtype;
  v_membership uuid;
  v_retired bigint;
begin
  -- Publishing changes what every customer sees, so it needs the capability and
  -- a recent authentication behind it.
  if not coalesce((select private.can_decide_booking(p_tenant_id,null,'brand.manage')),false)
     or not coalesce((select private.is_aal2()),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  v_membership := (select private.current_membership_id(p_tenant_id));

  select * into v_revision from app.brand_revisions r
  where r.tenant_id = p_tenant_id and r.id = p_brand_revision_id for update;
  if v_revision.id is null then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if v_revision.state <> 'draft' then
    raise exception using errcode='42501',message='brand_not_publishable';
  end if;
  if v_revision.content_hash is distinct from p_expected_content_hash then
    -- Somebody edited the draft between review and publication.
    raise exception using errcode='23505',message='revision_conflict';
  end if;
  -- A brand with no name renders as nothing. The rest of the shape is checked
  -- in TypeScript before submission; this is the one field whose absence would
  -- produce a page with no identity at all.
  if coalesce(pg_catalog.btrim(v_revision.config->>'name'),'') = '' then
    raise exception using errcode='42501',message='brand_not_publishable';
  end if;

  -- Retire the outgoing revision in the same transaction, so there is never an
  -- instant where a customer loads a page and finds no published brand.
  update app.brand_revisions r set state='retired'
  where r.tenant_id = p_tenant_id and r.brand_id = v_revision.brand_id
    and r.state = 'published'
  returning r.revision into v_retired;

  update app.brand_revisions r set
    state='published', published_at=v_now, published_by_membership_id=v_membership
  where r.id = p_brand_revision_id;

  -- Every preview of this draft stops working the moment it is real. A preview
  -- link is an offer to look at unreleased work, and it has been released.
  update app.brand_preview_tokens t set revoked_at=v_now
  where t.tenant_id = p_tenant_id and t.brand_revision_id = p_brand_revision_id
    and t.revoked_at is null;

  return query select 1,p_brand_revision_id,v_revision.revision,v_now,v_retired;
end;
$function$;

-- Rolling back is publishing a previous revision, not editing a published one.
-- A copy is made rather than reviving the old row, so history stays a list of
-- what was live and when, in order.
create or replace function private.rollback_brand_v1(
  p_tenant_id uuid,
  p_brand_id uuid,
  p_to_revision bigint
)
returns table (contract_version integer, brand_revision_id uuid, revision bigint)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_source app.brand_revisions%rowtype;
  v_membership uuid;
  v_next bigint;
  v_id uuid;
begin
  if not coalesce((select private.can_decide_booking(p_tenant_id,null,'brand.manage')),false)
     or not coalesce((select private.is_aal2()),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  v_membership := (select private.current_membership_id(p_tenant_id));

  select * into v_source from app.brand_revisions r
  where r.tenant_id = p_tenant_id and r.brand_id = p_brand_id and r.revision = p_to_revision;
  if v_source.id is null or v_source.state = 'draft' then
    -- A draft was never live, so rolling back to it is not a rollback.
    raise exception using errcode='42501',message='brand_not_publishable';
  end if;

  select coalesce(pg_catalog.max(r.revision),0) + 1 into v_next
  from app.brand_revisions r
  where r.tenant_id = p_tenant_id and r.brand_id = p_brand_id;

  update app.brand_revisions r set state='retired'
  where r.tenant_id = p_tenant_id and r.brand_id = p_brand_id and r.state = 'published';

  insert into app.brand_revisions(
    id,tenant_id,brand_id,revision,state,config_version,config,content,content_hash,
    created_by_membership_id,published_by_membership_id,published_at,notes)
  values (pg_catalog.gen_random_uuid(),p_tenant_id,p_brand_id,v_next,'published',
    v_source.config_version,v_source.config,v_source.content,v_source.content_hash,
    v_membership,v_membership,v_now,
    'Rolled back to revision '||p_to_revision::text)
  returning id into v_id;

  return query select 1,v_id,v_next;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Preview tokens
-- ---------------------------------------------------------------------------

create or replace function private.issue_brand_preview_v1(
  p_tenant_id uuid,
  p_brand_revision_id uuid,
  p_ttl_minutes integer default 60
)
returns table (preview_token text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_token text;
  v_expires timestamptz;
begin
  if not coalesce((select private.can_decide_booking(p_tenant_id,null,'brand.manage')),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if not exists (select 1 from app.brand_revisions r
    where r.tenant_id = p_tenant_id and r.id = p_brand_revision_id) then
    raise exception using errcode='42501',message='policy_denied';
  end if;

  v_token := pg_catalog.encode(extensions.gen_random_bytes(32),'hex');
  v_expires := pg_catalog.statement_timestamp()
    + pg_catalog.make_interval(mins=>least(greatest(coalesce(p_ttl_minutes,60),5),1440));

  insert into app.brand_preview_tokens(
    tenant_id,brand_revision_id,token_hash,issued_by_membership_id,expires_at)
  values (p_tenant_id,p_brand_revision_id,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      p_tenant_id::text||':'||v_token,'UTF8')),'hex'),
    (select private.current_membership_id(p_tenant_id)),v_expires);

  -- The token is returned exactly once, here. It is never stored and cannot be
  -- read back, which is what makes the digest worth keeping.
  return query select v_token, v_expires;
end;
$function$;

-- Redeeming a preview. Anonymous by design — the whole point is to show an
-- unreleased brand to somebody who is not a member — but only to somebody
-- holding a token this platform minted.
create or replace function private.redeem_brand_preview_v1(
  p_hostname text,
  p_application text,
  p_token text
)
returns table (
  contract_version integer,
  brand_revision_id uuid,
  revision bigint,
  state text,
  config jsonb,
  content jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_tenant_id uuid;
  v_row app.brand_preview_tokens%rowtype;
  v_revision app.brand_revisions%rowtype;
begin
  v_tenant_id := (select r.tenant_id from api_v1.resolve_public_tenant_v1(p_hostname,p_application) r);
  if v_tenant_id is null then
    raise exception using errcode='42501',message='booking_context_required';
  end if;

  select * into v_row from app.brand_preview_tokens t
  where t.tenant_id = v_tenant_id
    and t.token_hash = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      v_tenant_id::text||':'||coalesce(p_token,''),'UTF8')),'hex');
  -- Unknown, expired and revoked are one answer. Telling them apart would say
  -- whether a token ever existed.
  if v_row.id is null or v_row.revoked_at is not null or v_row.expires_at <= pg_catalog.statement_timestamp() then
    raise exception using errcode='42501',message='booking_context_required';
  end if;

  select * into v_revision from app.brand_revisions r
  where r.tenant_id = v_tenant_id and r.id = v_row.brand_revision_id;
  return query select 1,v_revision.id,v_revision.revision,v_revision.state,
    v_revision.config,v_revision.content;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 7. The published brand, and how branded it actually is
-- ---------------------------------------------------------------------------

-- What a customer's browser gets. Anonymous, because the Client renders it
-- before anybody signs in, and it returns only the published revision.
create or replace function private.get_published_brand_v1(
  p_hostname text,
  p_application text
)
returns table (
  contract_version integer,
  brand_revision_id uuid,
  revision bigint,
  config jsonb,
  content jsonb,
  -- Changes whenever the published revision does, so a CDN entry for the old
  -- brand is never served for the new one, and one tenant's publication never
  -- invalidates another's.
  cache_tag text,
  published_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_tenant_id uuid;
begin
  v_tenant_id := (select r.tenant_id from api_v1.resolve_public_tenant_v1(p_hostname,p_application) r);
  if v_tenant_id is null then
    raise exception using errcode='42501',message='booking_context_required';
  end if;

  return query
  select 1,r.id,r.revision,r.config,r.content,
    pg_catalog.concat('brand:',v_tenant_id::text,':',r.revision::text),
    r.published_at
  from app.brand_revisions r
  where r.tenant_id = v_tenant_id and r.state = 'published'
  order by r.published_at desc
  limit 1;
end;
$function$;

-- Branded or fully white-label, decided from state rather than from what
-- anybody hopes. "Fully white-label" means a tenant-controlled domain, a
-- verified tenant sending identity, and a complete brand: anything short of
-- that is branded, and the product should say so rather than overclaim.
create or replace function private.get_brand_presentation_v1(
  p_tenant_id uuid
)
returns table (
  contract_version integer,
  presentation text,
  has_verified_domain boolean,
  has_tenant_sender boolean,
  has_published_brand boolean,
  has_legal_links boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_domain boolean;
  v_sender boolean;
  v_brand boolean;
  v_legal boolean;
begin
  if not coalesce((select private.is_active_tenant_member(p_tenant_id)),false) then
    raise exception using errcode='42501',message='policy_denied';
  end if;

  -- `tenant_domains.kind` distinguishes production from preview, not
  -- platform-provided from tenant-owned: nothing in the schema records that yet,
  -- and issue #32 owns it. So this measures what it can honestly measure — a
  -- verified, active production domain — and is named for that rather than
  -- claiming to know whose domain it is.
  select exists (
    select 1 from app.tenant_domains d
    where d.tenant_id = p_tenant_id and d.kind = 'production'
      and d.verification_status = 'verified' and d.active
  ) into v_domain;
  -- Tenant-owned sending domains are issue #54; until then every tenant sends
  -- from the platform's verified identity, which is exactly the thing that
  -- keeps a deployment "branded" rather than fully white-label.
  v_sender := false;
  select exists (
    select 1 from app.brand_revisions r
    where r.tenant_id = p_tenant_id and r.state = 'published'
  ) into v_brand;
  select exists (
    select 1 from app.brand_revisions r
    where r.tenant_id = p_tenant_id and r.state = 'published'
      and r.content ? 'legal'
      and (r.content->'legal') ? 'privacyUrl'
      and (r.content->'legal') ? 'termsUrl'
  ) into v_legal;

  return query select 1,
    case when v_domain and v_sender and v_brand and v_legal
      then 'fully_white_label' else 'branded' end,
    v_domain, v_sender, v_brand, v_legal;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 8. api_v1 surface
-- ---------------------------------------------------------------------------

create or replace function api_v1.save_brand_draft_v1(
  p_tenant_id uuid, p_brand_key text, p_config jsonb, p_content jsonb,
  p_expected_revision bigint default null, p_notes text default null)
returns table (
  contract_version integer, brand_id uuid, brand_revision_id uuid,
  revision bigint, content_hash text)
language sql volatile security invoker set search_path = '' set statement_timeout = '5s'
as $$ select * from private.save_brand_draft_v1(p_tenant_id,p_brand_key,p_config,
  p_content,p_expected_revision,p_notes); $$;

create or replace function api_v1.publish_brand_revision_v1(
  p_tenant_id uuid, p_brand_revision_id uuid, p_expected_content_hash text)
returns table (
  contract_version integer, brand_revision_id uuid, revision bigint,
  published_at timestamptz, retired_revision bigint)
language sql volatile security invoker set search_path = '' set statement_timeout = '5s'
as $$ select * from private.publish_brand_revision_v1(p_tenant_id,p_brand_revision_id,
  p_expected_content_hash); $$;

create or replace function api_v1.rollback_brand_v1(
  p_tenant_id uuid, p_brand_id uuid, p_to_revision bigint)
returns table (contract_version integer, brand_revision_id uuid, revision bigint)
language sql volatile security invoker set search_path = ''
as $$ select * from private.rollback_brand_v1(p_tenant_id,p_brand_id,p_to_revision); $$;

create or replace function api_v1.issue_brand_preview_v1(
  p_tenant_id uuid, p_brand_revision_id uuid, p_ttl_minutes integer default 60)
returns table (preview_token text, expires_at timestamptz)
language sql volatile security invoker set search_path = ''
as $$ select * from private.issue_brand_preview_v1(p_tenant_id,p_brand_revision_id,
  p_ttl_minutes); $$;

create or replace function api_v1.redeem_brand_preview_v1(
  p_hostname text, p_application text, p_token text)
returns table (
  contract_version integer, brand_revision_id uuid, revision bigint, state text,
  config jsonb, content jsonb)
language sql stable security invoker set search_path = ''
as $$ select * from private.redeem_brand_preview_v1(p_hostname,p_application,p_token); $$;

create or replace function api_v1.get_published_brand_v1(
  p_hostname text, p_application text)
returns table (
  contract_version integer, brand_revision_id uuid, revision bigint,
  config jsonb, content jsonb, cache_tag text, published_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_published_brand_v1(p_hostname,p_application); $$;

create or replace function api_v1.get_brand_presentation_v1(p_tenant_id uuid)
returns table (
  contract_version integer, presentation text, has_verified_domain boolean,
  has_tenant_sender boolean, has_published_brand boolean, has_legal_links boolean)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_brand_presentation_v1(p_tenant_id); $$;

-- The revision history a tenant admin compares against. Security invoker over
-- rows RLS already scopes to the brand capability.
create or replace function api_v1.list_brand_revisions_v1(
  p_tenant_id uuid, p_limit integer default 25)
returns table (
  brand_revision_id uuid, brand_id uuid, brand_key text, revision bigint,
  state text, content_hash text, notes text, created_at timestamptz,
  published_at timestamptz)
language sql stable security invoker set search_path = ''
as $$
  select r.id, r.brand_id, b.key, r.revision, r.state, r.content_hash, r.notes,
    r.created_at, r.published_at
  from app.brand_revisions r
  join app.brands b on b.tenant_id = r.tenant_id and b.id = r.brand_id
  where r.tenant_id = p_tenant_id
  order by r.revision desc
  limit least(greatest(coalesce(p_limit,25),1),100);
$$;

-- ---------------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------------

revoke all on function
  private.enforce_published_brand_immutability(),
  private.brand_document_is_safe_v1(jsonb),
  private.save_brand_draft_v1(uuid,text,jsonb,jsonb,bigint,text),
  private.publish_brand_revision_v1(uuid,uuid,text),
  private.rollback_brand_v1(uuid,uuid,bigint),
  private.issue_brand_preview_v1(uuid,uuid,integer),
  private.redeem_brand_preview_v1(text,text,text),
  private.get_published_brand_v1(text,text),
  private.get_brand_presentation_v1(uuid)
from public, anon, authenticated;

grant execute on function
  private.brand_document_is_safe_v1(jsonb),
  private.save_brand_draft_v1(uuid,text,jsonb,jsonb,bigint,text),
  private.publish_brand_revision_v1(uuid,uuid,text),
  private.rollback_brand_v1(uuid,uuid,bigint),
  private.issue_brand_preview_v1(uuid,uuid,integer),
  private.get_brand_presentation_v1(uuid)
to authenticated;

-- The published brand and a minted preview are both read before anybody signs
-- in, so both are reachable anonymously. Neither returns a draft that was not
-- asked for by token.
grant execute on function
  private.redeem_brand_preview_v1(text,text,text),
  private.get_published_brand_v1(text,text)
to anon, authenticated;

revoke all on function
  api_v1.save_brand_draft_v1(uuid,text,jsonb,jsonb,bigint,text),
  api_v1.publish_brand_revision_v1(uuid,uuid,text),
  api_v1.rollback_brand_v1(uuid,uuid,bigint),
  api_v1.issue_brand_preview_v1(uuid,uuid,integer),
  api_v1.redeem_brand_preview_v1(text,text,text),
  api_v1.get_published_brand_v1(text,text),
  api_v1.get_brand_presentation_v1(uuid),
  api_v1.list_brand_revisions_v1(uuid,integer)
from public, anon, authenticated;

grant execute on function
  api_v1.save_brand_draft_v1(uuid,text,jsonb,jsonb,bigint,text),
  api_v1.publish_brand_revision_v1(uuid,uuid,text),
  api_v1.rollback_brand_v1(uuid,uuid,bigint),
  api_v1.issue_brand_preview_v1(uuid,uuid,integer),
  api_v1.get_brand_presentation_v1(uuid),
  api_v1.list_brand_revisions_v1(uuid,integer)
to authenticated;

grant execute on function
  api_v1.redeem_brand_preview_v1(text,text,text),
  api_v1.get_published_brand_v1(text,text)
to anon, authenticated;
