begin;
select no_plan();

-- Issue #25. Draft, preview, and publish a brand. The properties that matter:
-- a published revision is what customers saw and cannot be edited afterwards,
-- exactly one revision is live at a time, executable markup cannot be stored at
-- all, and an unreleased brand is reachable only by a token this platform
-- minted rather than by a query parameter anybody can type.

do $$ begin
  execute format('grant usage on schema %I to authenticated',pg_my_temp_schema()::regnamespace::text);
end $$;

select set_config('test.br_config',
  '{"name":"Tenant A Salon","assets":{"logoLight":"/assets/logo.svg","icon":"/assets/icon.svg","favicon":"/assets/favicon.ico","socialImage":"/assets/social.png"},"tokens":{}}',
  true);
select set_config('test.br_content',
  '{"legal":{"privacyUrl":"https://tenant-a.example.invalid/privacy","termsUrl":"https://tenant-a.example.invalid/terms"},"contact":{"email":"hello@tenant-a.example.invalid"}}',
  true);

-- ---------------------------------------------------------------------------
-- Contract shape.
select has_table('app'::name,'brand_preview_tokens'::name);
select ok((select relrowsecurity from pg_class where oid='app.brand_preview_tokens'::regclass),
  'preview tokens carry row level security');
select ok(not has_table_privilege('anon','app.brand_preview_tokens','select')
  and not has_table_privilege('authenticated','app.brand_preview_tokens','select'),
  'and no application role reads them: a preview token is a credential');

select has_function('api_v1'::name,'save_brand_draft_v1'::name,
  array['uuid','text','jsonb','jsonb','bigint','text']);
select has_function('api_v1'::name,'publish_brand_revision_v1'::name,
  array['uuid','uuid','text']);
select has_function('api_v1'::name,'rollback_brand_v1'::name,array['uuid','uuid','bigint']);
select has_function('api_v1'::name,'redeem_brand_preview_v1'::name,array['text','text','text']);
select has_function('api_v1'::name,'get_published_brand_v1'::name,array['text','text']);

select ok(
  has_function_privilege('anon','api_v1.get_published_brand_v1(text,text)','execute')
  and has_function_privilege('anon','api_v1.redeem_brand_preview_v1(text,text,text)','execute'),
  'a published brand and a minted preview are both read before anybody signs in');
select ok(
  not has_function_privilege('anon','api_v1.save_brand_draft_v1(uuid,text,jsonb,jsonb,bigint,text)','execute')
  and not has_function_privilege('anon','api_v1.publish_brand_revision_v1(uuid,uuid,text)','execute')
  and not has_function_privilege('anon','api_v1.issue_brand_preview_v1(uuid,uuid,integer)','execute'),
  'but authoring, publishing and minting a preview are never anonymous');

-- ---------------------------------------------------------------------------
-- Executable markup cannot be stored, at any depth, by anybody.
select ok(private.brand_document_is_safe_v1('{"name":"Salon"}'::jsonb),
  'ordinary text is safe');
select ok(not private.brand_document_is_safe_v1('{"name":"<script>alert(1)</script>"}'::jsonb),
  'a script tag is refused');
select ok(not private.brand_document_is_safe_v1(
  '{"legal":{"termsUrl":"javascript:alert(1)"}}'::jsonb),
  'a javascript: URL is refused, however deep it is nested');
select ok(not private.brand_document_is_safe_v1('{"a":{"b":{"c":"<img onerror=x>"}}}'::jsonb),
  'and so is an inline event handler three levels down');
select ok(not private.brand_document_is_safe_v1('{"x":"data:text/html;base64,PHN2Zz4="}'::jsonb),
  'a data: HTML URL is refused');
select ok(not private.brand_document_is_safe_v1('{"x":"&#60;script&#62;"}'::jsonb),
  'and an HTML-entity encoded one, which is how a naive filter is walked past');

-- The constraint is on the table, so it holds even for a writer that bypasses
-- every function.
select throws_ok(
  $$insert into app.brand_revisions(id,tenant_id,brand_id,revision,state,config_version,config)
    values (gen_random_uuid(),'a0000000-0000-0000-0000-000000000001',
      'a4000000-0000-0000-0000-000000000001',99,'draft',1,'{"n":"<script>x</script>"}'::jsonb)$$,
  '23514',null,
  'the refusal is a table constraint, so it holds for a direct insert too');

-- ---------------------------------------------------------------------------
-- Drafting.
savepoint br_draft;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;

select set_config('test.br_rev',(select d.brand_revision_id::text from api_v1.save_brand_draft_v1(
  'a0000000-0000-0000-0000-000000000001','synthetic-a',
  current_setting('test.br_config')::jsonb,current_setting('test.br_content')::jsonb) d),true);
select is((select r.state from app.brand_revisions r
  where r.id=current_setting('test.br_rev')::uuid),'draft',
  'saving creates a draft, not a live brand');
select isnt((select r.content_hash from app.brand_revisions r
  where r.id=current_setting('test.br_rev')::uuid),null,
  'and hashes what the author is looking at');

-- Editing is editing that draft, not stacking a revision per keystroke.
select is((select d.brand_revision_id::text from api_v1.save_brand_draft_v1(
  'a0000000-0000-0000-0000-000000000001','synthetic-a',
  current_setting('test.br_config')::jsonb,
  (current_setting('test.br_content')::jsonb || '{"tagline":"Open late"}'::jsonb)) d),
  current_setting('test.br_rev'),
  'a second save edits the open draft rather than opening a second one');
select is((select count(*)::integer from app.brand_revisions r
  where r.tenant_id='a0000000-0000-0000-0000-000000000001' and r.state='draft'),1,
  'one open draft per brand');

select throws_ok(
  $$select * from api_v1.save_brand_draft_v1('a0000000-0000-0000-0000-000000000001',
    'tenant-a','{"name":"<script>x</script>"}'::jsonb,'{}'::jsonb)$$,
  '22023','brand_unsafe_content',
  'and the function names the reason rather than leaking a constraint name');
reset role;
select set_config('request.jwt.claims',null,true);

-- Somebody without the brand capability cannot author at all.
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok(
  $$select * from api_v1.save_brand_draft_v1('a0000000-0000-0000-0000-000000000001',
    'tenant-a','{"name":"Hijack"}'::jsonb,'{}'::jsonb)$$,
  '42501','policy_denied','a staff member cannot rebrand the business');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint br_draft;

-- ---------------------------------------------------------------------------
-- Publishing.
savepoint br_publish;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select set_config('test.br_rev',(select d.brand_revision_id::text from api_v1.save_brand_draft_v1(
  'a0000000-0000-0000-0000-000000000001','synthetic-a',
  current_setting('test.br_config')::jsonb,current_setting('test.br_content')::jsonb) d),true);
select set_config('test.br_hash',(select r.content_hash from app.brand_revisions r
  where r.id=current_setting('test.br_rev')::uuid),true);

select throws_ok(
  format($$select * from api_v1.publish_brand_revision_v1('a0000000-0000-0000-0000-000000000001',
    %L,'0000000000000000000000000000000000000000000000000000000000000000')$$,
    current_setting('test.br_rev')),
  '23505','revision_conflict',
  'publishing a draft somebody edited between review and publication is refused');

select ok((select p.published_at is not null from api_v1.publish_brand_revision_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.br_rev')::uuid,
  current_setting('test.br_hash')) p),
  'publishing the draft that was actually reviewed succeeds');
select is((select r.state from app.brand_revisions r
  where r.id=current_setting('test.br_rev')::uuid),'published','it is live');
select isnt((select r.published_by_membership_id from app.brand_revisions r
  where r.id=current_setting('test.br_rev')::uuid),null,
  'and says who made it live');
select is((select r.state from app.brand_revisions r
  where r.tenant_id='a0000000-0000-0000-0000-000000000001'
    and r.id='a4100000-0000-0000-0000-000000000001'),'retired',
  'the outgoing revision is retired in the same transaction, so there is never '
  'an instant with no published brand');
select is((select count(*)::integer from app.brand_revisions r
  where r.tenant_id='a0000000-0000-0000-0000-000000000001' and r.state='published'),1,
  'exactly one revision is live');

select throws_ok(
  format($$select * from api_v1.publish_brand_revision_v1('a0000000-0000-0000-0000-000000000001',
    %L,%L)$$,current_setting('test.br_rev'),current_setting('test.br_hash')),
  '42501','brand_not_publishable','a published revision cannot be published again');
reset role;
select set_config('request.jwt.claims',null,true);

-- A published revision is evidence of what customers saw.
select throws_ok(
  format($$update app.brand_revisions set config='{"name":"Rewritten"}'::jsonb where id=%L$$,
    current_setting('test.br_rev')),
  '42501','booking_immutable',
  'and cannot be edited afterwards, for the same reason a booking snapshot cannot');
rollback to savepoint br_publish;

-- Publishing changes what every customer sees, so it needs a step-up.
savepoint br_stepup;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select set_config('test.br_rev',(select d.brand_revision_id::text from api_v1.save_brand_draft_v1(
  'a0000000-0000-0000-0000-000000000001','synthetic-a',
  current_setting('test.br_config')::jsonb,current_setting('test.br_content')::jsonb) d),true);
select set_config('test.br_hash',(select r.content_hash from app.brand_revisions r
  where r.id=current_setting('test.br_rev')::uuid),true);
reset role;
select set_config('request.jwt.claims',null,true);
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok(
  format($$select * from api_v1.publish_brand_revision_v1('a0000000-0000-0000-0000-000000000001',
    %L,%L)$$,current_setting('test.br_rev'),current_setting('test.br_hash')),
  '42501','policy_denied','publishing without a recent authentication is refused');
reset role;
select set_config('request.jwt.claims',null,true);

-- A brand with no name would render as nothing at all.
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select set_config('test.br_blank',(select d.brand_revision_id::text from api_v1.save_brand_draft_v1(
  'a0000000-0000-0000-0000-000000000001','tenant-b-blank','{"name":"  "}'::jsonb,'{}'::jsonb) d),true);
select throws_ok(
  format($$select * from api_v1.publish_brand_revision_v1('a0000000-0000-0000-0000-000000000001',
    %L,(select content_hash from app.brand_revisions where id=%L))$$,
    current_setting('test.br_blank'),current_setting('test.br_blank')),
  '42501','brand_not_publishable','a brand with no name cannot go live');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint br_stepup;

-- ---------------------------------------------------------------------------
-- Preview is a token, never a query parameter.
savepoint br_preview;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select set_config('test.br_rev',(select d.brand_revision_id::text from api_v1.save_brand_draft_v1(
  'a0000000-0000-0000-0000-000000000001','synthetic-a',
  current_setting('test.br_config')::jsonb,current_setting('test.br_content')::jsonb) d),true);
select set_config('test.br_token',(select p.preview_token from api_v1.issue_brand_preview_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.br_rev')::uuid) p),true);
reset role;
select set_config('request.jwt.claims',null,true);

select ok(not exists(select 1 from app.brand_preview_tokens t
  where t.token_hash = current_setting('test.br_token')),
  'the token is stored as a digest, never in the clear');

set local role anon;
select is((select v.state from api_v1.redeem_brand_preview_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.br_token')) v),
  'draft','a minted token shows the unreleased draft to somebody not signed in');
select is((select v.config->>'name' from api_v1.redeem_brand_preview_v1(
  'client.tenant-a.example.invalid','client',current_setting('test.br_token')) v),
  'Tenant A Salon','with the brand it is previewing');

select throws_ok(
  $$select * from api_v1.redeem_brand_preview_v1('client.tenant-a.example.invalid',
    'client','not-a-real-token')$$,
  '42501','booking_context_required','a guessed token shows nothing');
-- Another tenant's hostname cannot redeem this tenant's token, even holding it.
select throws_ok(
  format($$select * from api_v1.redeem_brand_preview_v1('client.tenant-b.example.invalid',
    'client',%L)$$,current_setting('test.br_token')),
  '42501','booking_context_required',
  'and the digest is tenant-salted, so a token is useless at another tenant');
reset role;

-- Expiry and revocation are the same answer as never having existed.
update app.brand_preview_tokens set expires_at=statement_timestamp()-interval '1 minute';
set local role anon;
select throws_ok(
  format($$select * from api_v1.redeem_brand_preview_v1('client.tenant-a.example.invalid',
    'client',%L)$$,current_setting('test.br_token')),
  '42501','booking_context_required',
  'an expired preview discloses nothing, including that it once worked');
reset role;
rollback to savepoint br_preview;

-- Publishing a draft revokes every preview of it: the work has been released.
savepoint br_preview_revoke;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select set_config('test.br_rev',(select d.brand_revision_id::text from api_v1.save_brand_draft_v1(
  'a0000000-0000-0000-0000-000000000001','synthetic-a',
  current_setting('test.br_config')::jsonb,current_setting('test.br_content')::jsonb) d),true);
select set_config('test.br_token',(select p.preview_token from api_v1.issue_brand_preview_v1(
  'a0000000-0000-0000-0000-000000000001',current_setting('test.br_rev')::uuid) p),true);
select * from api_v1.publish_brand_revision_v1('a0000000-0000-0000-0000-000000000001',
  current_setting('test.br_rev')::uuid,
  (select content_hash from app.brand_revisions where id=current_setting('test.br_rev')::uuid));
reset role;
select set_config('request.jwt.claims',null,true);
select isnt((select t.revoked_at from app.brand_preview_tokens t),null,
  'publishing revokes the preview links for that draft');
rollback to savepoint br_preview_revoke;

-- ---------------------------------------------------------------------------
-- The public read, and rolling back.
savepoint br_public;
set local role anon;
select is((select b.revision from api_v1.get_published_brand_v1(
  'client.tenant-a.example.invalid','client') b),1::bigint,
  'a customer''s browser gets the published revision');
select ok((select b.cache_tag like 'brand:a0000000-0000-0000-0000-000000000001:%'
  from api_v1.get_published_brand_v1('client.tenant-a.example.invalid','client') b),
  'with a cache tag scoped to the tenant and the revision, so one tenant''s '
  'publication never invalidates another''s');
select is((select count(*)::integer from api_v1.get_published_brand_v1(
  'client.tenant-b.example.invalid','client')),1,
  'and another tenant gets their own, not this one');
reset role;

select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select set_config('test.br_rev',(select d.brand_revision_id::text from api_v1.save_brand_draft_v1(
  'a0000000-0000-0000-0000-000000000001','synthetic-a',
  current_setting('test.br_config')::jsonb,current_setting('test.br_content')::jsonb) d),true);
select * from api_v1.publish_brand_revision_v1('a0000000-0000-0000-0000-000000000001',
  current_setting('test.br_rev')::uuid,
  (select content_hash from app.brand_revisions where id=current_setting('test.br_rev')::uuid));

select is((select r.revision from api_v1.rollback_brand_v1(
  'a0000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001',1) r),
  3::bigint,'rolling back publishes a new revision rather than reviving an old row');
select is((select count(*)::integer from app.brand_revisions r
  where r.tenant_id='a0000000-0000-0000-0000-000000000001' and r.state='published'),1,
  'still exactly one live revision');
select ok((select r.notes like 'Rolled back%' from app.brand_revisions r
  where r.tenant_id='a0000000-0000-0000-0000-000000000001' and r.state='published'),
  'and history records that it was a rollback, in order');
select throws_ok(
  $$select * from api_v1.rollback_brand_v1('a0000000-0000-0000-0000-000000000001',
    'a4000000-0000-0000-0000-000000000001',99)$$,
  '42501','brand_not_publishable','rolling back to a revision that never existed is refused');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint br_public;

-- ---------------------------------------------------------------------------
-- Branded versus fully white-label is decided from state, not from hope.
savepoint br_presentation;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select p.presentation from api_v1.get_brand_presentation_v1(
  'a0000000-0000-0000-0000-000000000001') p),'branded',
  'a tenant on a platform domain with a platform sender is branded, not fully '
  'white-label, and the product says so rather than overclaiming');
select ok((select p.has_published_brand from api_v1.get_brand_presentation_v1(
  'a0000000-0000-0000-0000-000000000001') p),
  'the seeded tenant does have a published brand');
select ok(not (select p.has_tenant_sender from api_v1.get_brand_presentation_v1(
  'a0000000-0000-0000-0000-000000000001') p),
  'and does not have its own sending identity, which is issue #54');
reset role;
select set_config('request.jwt.claims',null,true);
rollback to savepoint br_presentation;

-- The savepoint rollbacks above revert pgTAP's own counter, so it is restored
-- from the non-transactional sequence before the plan is emitted.
select _set('curr_test',(select last_value::integer from __tresults___numb_seq));
select * from finish();
rollback;
