begin;

select plan(29);

set local role anon;

select is(
  (select count(*)::integer from api_v1.resolve_public_tenant_v1('client.tenant-a.example.invalid', 'client')),
  1,
  'anonymous resolves a verified production Client hostname'
);
select is(
  (select tenant_id from api_v1.resolve_public_tenant_v1('client.tenant-a.example.invalid', 'client')),
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'public resolution returns the owning tenant'
);
select is(
  (select hostname from api_v1.resolve_public_tenant_v1('client.tenant-a.example.invalid', 'client')),
  'client.tenant-a.example.invalid'::text,
  'public resolution returns the canonical verified hostname'
);
select is(
  (select published_brand_revision from api_v1.resolve_public_tenant_v1('client.tenant-a.example.invalid', 'client')),
  1::bigint,
  'public resolution returns the published brand revision'
);
select is(
  (select config_version from api_v1.resolve_public_tenant_v1('client.tenant-a.example.invalid', 'client')),
  3::bigint,
  'public resolution returns the cache-safe config version'
);
select is(
  (select count(*)::integer from api_v1.resolve_public_tenant_v1('Client.Tenant-A.Example.Invalid', 'client')),
  0,
  'non-canonical hostname input is rejected instead of normalized implicitly'
);
select is(
  (select count(*)::integer from api_v1.resolve_public_tenant_v1('client.tenant-a.example.invalid:443', 'client')),
  0,
  'hostname input containing a port is rejected'
);
select is(
  (select count(*)::integer from api_v1.resolve_public_tenant_v1('preview.tenant-a.example.invalid', 'client')),
  0,
  'unverified preview domains do not resolve publicly'
);
select is(
  (select count(*)::integer from api_v1.resolve_public_tenant_v1('unknown.example.invalid', 'client')),
  0,
  'unknown hostnames do not resolve publicly'
);
select is(
  (select count(*)::integer from api_v1.resolve_public_tenant_v1('dashboard.tenant-a.example.invalid', 'client')),
  0,
  'a dashboard hostname cannot be resolved as a Client surface'
);
select is(
  (select count(*)::integer from api_v1.resolve_public_tenant_v1(null, 'client')),
  0,
  'null hostname context defaults to denial'
);
select is(
  (select count(*)::integer from api_v1.resolve_public_tenant_v1('client.tenant-a.example.invalid', null)),
  0,
  'null application context defaults to denial'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from api_v1.list_tenant_choices_v1()),
  1,
  'a single-tenant staff user receives one tenant choice'
);
select is(
  (select tenant_id from api_v1.list_tenant_choices_v1()),
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'the tenant choice is derived from the active membership, not JWT metadata'
);
select is(
  (select count(*)::integer from api_v1.get_dashboard_context_v1('a0000000-0000-0000-0000-000000000001')),
  1,
  'staff can obtain context for their tenant'
);
select is(
  (select count(*)::integer from api_v1.get_dashboard_context_v1('b0000000-0000-0000-0000-000000000001')),
  0,
  'staff cannot obtain another tenant context'
);
select is(
  (select count(*)::integer from api_v1.get_dashboard_context_v1(null)),
  0,
  'null Dashboard tenant selection defaults to denial'
);
select is(
  (select location_ids from api_v1.get_dashboard_context_v1('a0000000-0000-0000-0000-000000000001')),
  array['a5000000-0000-0000-0000-000000000001'::uuid],
  'dashboard context returns only explicit assigned location ids'
);
select ok(
  (select capabilities from api_v1.get_dashboard_context_v1('a0000000-0000-0000-0000-000000000001'))
    @> '[{"capability":"booking.cancel","grantKind":"direct","scopeKind":"own"}]'::jsonb,
  'dashboard context preserves direct grant and own scope metadata'
);
select ok(
  (select capabilities from api_v1.get_dashboard_context_v1('a0000000-0000-0000-0000-000000000001'))
    @> '[{"capability":"refund.issue","grantKind":"approval","scopeKind":"own"}]'::jsonb,
  'dashboard context preserves approval-required grant and own scope metadata'
);
select is(
  (select aal2 from api_v1.get_dashboard_context_v1('a0000000-0000-0000-0000-000000000001')),
  false,
  'dashboard context reports the current aal1 foundation honestly'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"c1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from api_v1.list_tenant_choices_v1()),
  2,
  'a multi-tenant user receives every and only active membership choice'
);
select is(
  (select count(*)::integer from api_v1.get_dashboard_context_v1('b0000000-0000-0000-0000-000000000001')),
  1,
  'explicit tenant selection works for a multi-tenant user'
);
select is(
  (select aal2 from api_v1.get_dashboard_context_v1('b0000000-0000-0000-0000-000000000001')),
  true,
  'dashboard context exposes an AAL2 claim for later sensitive-operation gates'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"d1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2","user_metadata":{"tenant_id":"a0000000-0000-0000-0000-000000000001","role":"tenant_admin"}}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from api_v1.list_tenant_choices_v1()),
  0,
  'spoofed user metadata and AAL2 do not create a tenant membership'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal2"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from api_v1.list_tenant_choices_v1()),
  0,
  'a revoked membership disappears from the current tenant choices immediately'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"not-a-uuid","role":"authenticated","aal":"aal2"}',
  true
);
set local role authenticated;

select lives_ok(
  $$ select * from api_v1.list_tenant_choices_v1() $$,
  'malformed subject claims fail closed without leaking a UUID cast error'
);
select is(
  (select count(*)::integer from api_v1.list_tenant_choices_v1()),
  0,
  'malformed subject claims return no tenant choices'
);

reset role;
select set_config('request.jwt.claims', '{}', true);
set local role authenticated;
select is(
  (select count(*)::integer from api_v1.list_tenant_choices_v1()),
  0,
  'missing identity claims return no tenant choices'
);

reset role;
select * from finish();
rollback;
