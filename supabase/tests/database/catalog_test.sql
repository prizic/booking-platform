begin;
select plan(18);

select has_table('app','catalog_services');
select has_table('app','catalog_service_revisions');
select has_table('app','catalog_location_revisions');
select has_table('app','catalog_publications');
select col_not_null('app','catalog_service_revisions','tenant_id');
select col_not_null('app','catalog_service_revisions','locale');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app' and c.relname='catalog_services'),'services have RLS');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app' and c.relname='catalog_service_revisions'),'service revisions have RLS');

set local role anon;
select is((select count(*)::integer from api_v1.get_public_catalog_v1('client.tenant-a.example.invalid','en')),
  1,'anonymous receives only the active published catalog');
select is((select count(*)::integer from api_v1.get_public_catalog_v1('client.tenant-a.example.invalid','ar')),
  1,'anonymous receives the selected Arabic catalog');
select is((select count(*)::integer from api_v1.get_public_catalog_v1('client.tenant-a.example.invalid','en','unknown')),
  0,'service filter cannot reveal unpublished or unknown services');
select is((select count(*)::integer from api_v1.get_public_catalog_v1('client.tenant-b.example.invalid','en')),
  0,'another tenant catalog is never returned from tenant A fixture');
select ok((select cache_tag like 'catalog:a0000000-0000-0000-0000-000000000001:1:en' from api_v1.get_public_catalog_v1('client.tenant-a.example.invalid','en')),'cache tag is tenant and locale scoped');
select ok(not exists(select 1 from jsonb_object_keys(to_jsonb((select x from api_v1.get_public_catalog_v1('client.tenant-a.example.invalid','en') x))) key where key in ('internal_notes','intake_schema','policy')),'public DTO excludes sensitive and internal fields');

reset role;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select count(*)::integer from app.catalog_services),1,'tenant admin reads only own catalog');
insert into app.catalog_categories(id,tenant_id,key) values ('a7100000-0000-0000-0000-000000000009','a0000000-0000-0000-0000-000000000001','new-category');
select is((select count(*)::integer from app.catalog_categories where id='a7100000-0000-0000-0000-000000000009'),1,'tenant admin can create catalog content');
select throws_like($$insert into app.catalog_services(id,tenant_id,key) values ('b7200000-0000-0000-0000-000000000009','b0000000-0000-0000-0000-000000000001','cross-tenant')$$,'%row-level security%','tenant admin cannot create cross-tenant catalog');
select ok((select has_function_privilege('anon','api_v1.get_public_catalog_v1(text,text,text)','execute')),'anonymous has only the narrow catalog RPC grant');
select * from finish();
rollback;
