begin;
select no_plan();

select ok(private.brand_site_content_is_valid_v1('{}'), 'R2-R4 N-1 empty content remains valid');
select ok(private.brand_site_content_is_valid_v1('{"contact":{"email":"desk@example.invalid"}}'),
  'R2 email-only brands remain valid and gain no default channel');
select ok(not private.brand_site_content_is_valid_v1('{"contact":{"whatsapp":"https://wa.me/12125550100"}}'),
  'R2 WhatsApp is a validated E.164 number, not arbitrary content');
select ok(not private.brand_site_content_is_valid_v1('{"about":{"experience":{"en":"Missing Arabic"}}}'),
  'R3 supplied experience must include both locales');
select ok(not private.brand_site_content_is_valid_v1('{"about":{"mapUrl":"https://user:pass@maps.example.invalid"}}'),
  'R3 map URLs cannot embed credentials');
select ok(not private.brand_site_content_is_valid_v1('{"appStores":{"appStoreUrl":"http://apps.example.invalid"}}'),
  'R4 store links require HTTPS');
select ok(not private.brand_site_content_is_valid_v1('{"appStores":{"googlePlayUrl":"javascript:alert(1)"}}'),
  'R4 executable links are refused');

select set_config('test.site_content','{
  "title":{"en":"Tenant A Salon","ar":"صالون أ"},
  "contact":{"email":"desk@example.invalid","phone":"+12125550100","whatsapp":"+12125550101","privateEmail":"private@example.invalid"},
  "about":{"experience":{"en":"Experienced team","ar":"فريق ذو خبرة"},"whyChooseUs":{"en":"Time for you","ar":"وقت مخصص لك"},"address":{"en":"Example Avenue","ar":"شارع المثال"},"mapUrl":"https://maps.example.invalid/place"},
  "appStores":{"appStoreUrl":"https://apps.apple.com/app/example","googlePlayUrl":"https://play.google.com/store/apps/details?id=example"},
  "legal":{"privacyUrl":"https://tenant-a.example.invalid/privacy","termsUrl":"https://tenant-a.example.invalid/terms"},
  "internal":{"customerEmail":"private@example.invalid"}}',true);
select set_config('test.site_config',(select config::text from app.brand_revisions
  where id='a4100000-0000-0000-0000-000000000001'),true);
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select set_config('test.site_revision',(select brand_revision_id::text from api_v1.save_brand_draft_v1(
  'a0000000-0000-0000-0000-000000000001','synthetic-a',current_setting('test.site_config')::jsonb,
  current_setting('test.site_content')::jsonb)),true);
select throws_ok($$select * from api_v1.save_brand_draft_v1('a0000000-0000-0000-0000-000000000001',
  'synthetic-a',current_setting('test.site_config')::jsonb,'{"contact":{"phone":"212-555-0100"}}')$$,
  '22023','brand_invalid_content','R2 forged editor RPC cannot bypass optional channel validation');
reset role;
set local role anon;
select ok((select content#>>'{contact,phone}' is null from api_v1.get_published_brand_v1('client.tenant-a.example.invalid','client')),
  'R2 drafts do not add public contact channels before publication');
reset role;
select set_config('test.site_hash',(select content_hash from app.brand_revisions where id=current_setting('test.site_revision')::uuid),true);
set local role authenticated;
select lives_ok($$select * from api_v1.publish_brand_revision_v1('a0000000-0000-0000-0000-000000000001',
  current_setting('test.site_revision')::uuid,current_setting('test.site_hash'))$$,'R2-R4 authorized publication uses the existing pipeline');
reset role;
select set_config('request.jwt.claims',null,true);
set local role anon;
select is((select content#>>'{contact,whatsapp}' from api_v1.get_published_brand_v1('client.tenant-a.example.invalid','client')),
  '+12125550101','R2 published tenant channels are readable anonymously');
select is((select content#>>'{about,experience,ar}' from api_v1.get_published_brand_v1('client.tenant-a.example.invalid','client')),
  'فريق ذو خبرة','R3 the public projection retains Arabic About copy');
select is((select content#>>'{appStores,googlePlayUrl}' from api_v1.get_published_brand_v1('client.tenant-a.example.invalid','client')),
  'https://play.google.com/store/apps/details?id=example','R4 published optional Google Play URL is tenant data');
select ok((select not(content ? 'internal') and not(content->'contact' ? 'privateEmail')
  from api_v1.get_published_brand_v1('client.tenant-a.example.invalid','client')),
  'public reads project allowed content instead of arbitrary revision JSON');
select ok((select content#>>'{contact,whatsapp}' is null from api_v1.get_published_brand_v1('client.tenant-b.example.invalid','client')),
  'other-tenant host cannot read Tenant A content');
select throws_ok($$select * from api_v1.get_published_brand_v1('unknown.example.invalid','client')$$,
  '42501','booking_context_required','unverified route cannot read any brand');
reset role;

-- Tenant A's seeded tenant_admin is the only administrator, so a bare
-- revocation here is refused by the last-administrator guard rather than
-- testing a stale session. Seed a second administrator first; the revocation
-- below then exercises the stale-session path, and the final throws_ok keeps
-- the last-administrator protection itself under test.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000','d1c00000-0000-4000-8000-000000000001','authenticated',
  'authenticated','site-second-admin@example.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
insert into app.memberships(id,tenant_id,auth_user_id,role_id)
  values ('d1c00000-0000-4000-8000-000000000002','a0000000-0000-0000-0000-000000000001',
    'd1c00000-0000-4000-8000-000000000001','a2000000-0000-0000-0000-000000000004');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
update app.memberships set status='revoked',revoked_at=statement_timestamp()
  where auth_user_id='a1000000-0000-0000-0000-000000000002';
select throws_ok($$update app.memberships set status='revoked',revoked_at=statement_timestamp()
  where auth_user_id='d1c00000-0000-4000-8000-000000000001'$$,
  '22023','last_administrator_required','the last live tenant administrator cannot be revoked');
set local role authenticated;
select throws_ok($$select * from api_v1.save_brand_draft_v1('a0000000-0000-0000-0000-000000000001','synthetic-a',
  current_setting('test.site_config')::jsonb,current_setting('test.site_content')::jsonb)$$,
  '42501','policy_denied','stale tenant author session loses live brand authority');
reset role;
select * from finish();
rollback;
