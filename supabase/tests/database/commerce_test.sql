begin;
select plan(20);

select has_table('app'::name, 'payment_accounts'::name, 'payment account state exists');
select has_table('app'::name, 'payment_attempts'::name, 'payment attempts exist');
select has_table('app'::name, 'commerce_ledger_entries'::name, 'commerce ledger exists');
select has_table('app'::name, 'payment_webhook_events'::name, 'webhook event ledger exists');
select col_not_null('app'::name, 'payment_accounts'::name, 'tenant_id'::name, 'payment accounts are tenant-owned');
select col_not_null('app'::name, 'payment_attempts'::name, 'amount_minor_units'::name, 'attempt amount is required');
select col_not_null('app'::name, 'payment_attempts'::name, 'currency'::name, 'attempt currency is required');
select col_not_null('app'::name, 'commerce_ledger_entries'::name, 'occurred_at'::name, 'ledger occurrence is required');
select ok((select relrowsecurity from pg_class where oid = 'app.payment_accounts'::regclass), 'payment accounts have RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'app.commerce_ledger_entries'::regclass), 'commerce ledger has RLS enabled');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is((select count(*)::integer from app.payment_accounts), 0, 'tenant admin has no uncreated account');
select is((select count(*)::integer from app.payment_attempts), 0, 'tenant admin cannot see another tenant attempts');
select throws_like($$insert into app.payment_accounts (tenant_id, provider, provider_account_reference) values ('a0000000-0000-0000-0000-000000000001', 'stripe', 'acct_synthetic')$$, '%row-level security%', 'client cannot create account state directly');
select is((select count(*)::integer from api_v1.get_payment_account_status_v1('b0000000-0000-0000-0000-000000000001')), 0, 'status RPC denies cross-tenant status');

reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*)::integer from app.payment_accounts), 0, 'non-admin cannot inspect payment account state');
select is((select count(*)::integer from api_v1.get_payment_account_status_v1('a0000000-0000-0000-0000-000000000001')), 0, 'MFA is required for provider status');

reset role;
set local role service_role;
select throws_like($$select * from app.payment_accounts$$, '%permission denied%', 'generic service role cannot read payment records');

reset role;
select is((select count(*)::integer from pg_policies where schemaname = 'app' and tablename = 'payment_accounts'), 4, 'payment accounts have explicit CRUD RLS policies');
select is((select count(*)::integer from pg_policies where schemaname = 'app' and tablename = 'commerce_ledger_entries'), 4, 'ledger has explicit CRUD RLS policies');
insert into app.commerce_ledger_entries (tenant_id, entry_type, source_id, amount_minor_units, currency, occurred_at)
values ('a0000000-0000-0000-0000-000000000001', 'adjustment', 'a7000000-0000-0000-0000-000000000001', 100, 'USD', statement_timestamp());
select throws_like($$update app.commerce_ledger_entries set amount_minor_units = 0$$, '%commerce ledger is append-only%', 'ledger is not client mutable');

select * from finish();
rollback;
