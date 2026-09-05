-- Issue #21: provider-neutral booking commerce records.
-- Provider credentials and raw card data are intentionally absent. Provider
-- adapters/Edge Functions own external calls; these tables own references,
-- state, money, and the immutable financial record.

create extension if not exists pgcrypto;

create table app.payment_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete restrict,
  provider text not null check (provider = lower(provider) and provider ~ '^[a-z][a-z0-9_-]{1,31}$'),
  provider_account_reference text not null check (btrim(provider_account_reference) <> ''),
  status text not null default 'requirements_due' check (status in ('connected','requirements_due','restricted','suspended','disconnected','error')),
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  capabilities jsonb not null default '{}'::jsonb check (jsonb_typeof(capabilities) = 'object'),
  requirements jsonb not null default '[]'::jsonb check (jsonb_typeof(requirements) = 'array'),
  secret_reference text check (secret_reference is null or secret_reference !~ '(sk_|rk_|whsec_)'),
  secret_fingerprint text check (secret_fingerprint is null or secret_fingerprint ~ '^[a-f0-9]{64}$'),
  last_provider_sync_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (tenant_id, id), unique (provider, provider_account_reference)
);

create unique index payment_accounts_one_provider_idx on app.payment_accounts (tenant_id, provider);

create table app.provider_object_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete restrict,
  payment_account_id uuid not null,
  object_kind text not null check (object_kind in ('account','checkout','payment','charge','refund','dispute','payout')),
  provider_object_reference text not null check (btrim(provider_object_reference) <> ''),
  canonical_entity_id uuid,
  created_at timestamptz not null default statement_timestamp(),
  unique (tenant_id, id), unique (payment_account_id, object_kind, provider_object_reference),
  foreign key (tenant_id, payment_account_id) references app.payment_accounts (tenant_id, id) on delete restrict
);

create table app.payment_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete restrict,
  booking_id uuid not null,
  total_minor_units bigint not null check (total_minor_units >= 0),
  deposit_minor_units bigint not null default 0 check (deposit_minor_units >= 0 and deposit_minor_units <= total_minor_units),
  currency char(3) not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  tax_minor_units bigint not null default 0 check (tax_minor_units >= 0 and tax_minor_units <= total_minor_units),
  tax_rate_basis_points integer check (tax_rate_basis_points is null or tax_rate_basis_points between 0 and 10000),
  tax_inclusive boolean not null default false,
  tax_label text,
  policy_revision bigint,
  captured_at timestamptz not null default statement_timestamp(),
  unique (tenant_id, booking_id)
);

create table app.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete restrict,
  booking_id uuid not null,
  payment_account_id uuid not null,
  amount_minor_units bigint not null check (amount_minor_units > 0),
  currency char(3) not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  status text not null default 'requires_payment' check (status in ('requires_payment','processing','succeeded','failed','cancelled','disputed')),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9._:-]{8,128}$'),
  provider_checkout_reference text,
  provider_payment_reference text,
  last_error_code text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (tenant_id, id), unique (tenant_id, idempotency_key),
  foreign key (tenant_id, payment_account_id) references app.payment_accounts (tenant_id, id) on delete restrict
);

create table app.payment_charges (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references app.tenants (id) on delete restrict,
  payment_attempt_id uuid not null, provider_charge_reference text not null,
  amount_minor_units bigint not null check (amount_minor_units > 0), currency char(3) not null check (currency = upper(currency)),
  status text not null check (status in ('pending','succeeded','failed','refunded','disputed')),
  created_at timestamptz not null default statement_timestamp(),
  unique (tenant_id, provider_charge_reference), unique (tenant_id, id),
  foreign key (tenant_id, payment_attempt_id) references app.payment_attempts (tenant_id, id) on delete restrict
);

create table app.payment_refunds (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references app.tenants (id) on delete restrict,
  payment_charge_id uuid not null, provider_refund_reference text,
  amount_minor_units bigint not null check (amount_minor_units > 0), currency char(3) not null check (currency = upper(currency)),
  status text not null default 'pending' check (status in ('eligible','pending','succeeded','failed','manual_review')),
  reason text not null check (reason in ('requested_by_customer','duplicate','fraudulent')),
  authorized_by uuid, created_at timestamptz not null default statement_timestamp(), updated_at timestamptz not null default statement_timestamp(),
  unique (tenant_id, id), unique (tenant_id, provider_refund_reference),
  foreign key (tenant_id, payment_charge_id) references app.payment_charges (tenant_id, id) on delete restrict
);

create table app.payment_disputes (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references app.tenants (id) on delete restrict,
  payment_charge_id uuid not null, provider_dispute_reference text not null,
  status text not null check (status in ('warning_needs_response','under_review','won','lost')),
  response_due_at timestamptz, created_at timestamptz not null default statement_timestamp(), updated_at timestamptz not null default statement_timestamp(),
  unique (tenant_id, id), unique (tenant_id, provider_dispute_reference),
  foreign key (tenant_id, payment_charge_id) references app.payment_charges (tenant_id, id) on delete restrict
);

create table app.payment_transfers (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references app.tenants (id) on delete restrict,
  payment_charge_id uuid, provider_transfer_reference text not null,
  amount_minor_units bigint not null check (amount_minor_units > 0), currency char(3) not null check (currency = upper(currency)),
  status text not null check (status in ('pending','in_transit','paid','failed','canceled')),
  created_at timestamptz not null default statement_timestamp(),
  unique (tenant_id, id), unique (tenant_id, provider_transfer_reference),
  foreign key (tenant_id, payment_charge_id) references app.payment_charges (tenant_id, id) on delete restrict
);

create table app.commerce_ledger_entries (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references app.tenants (id) on delete restrict,
  entry_type text not null check (entry_type in ('charge','refund','fee','transfer','adjustment')),
  source_id uuid not null, amount_minor_units bigint not null, currency char(3) not null check (currency = upper(currency)),
  occurred_at timestamptz not null, metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default statement_timestamp(), unique (tenant_id, id),
  unique (tenant_id, entry_type, source_id)
);

create table app.payment_webhook_events (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references app.tenants (id) on delete restrict,
  provider text not null, provider_event_reference text not null, event_type text not null,
  object_kind text not null, provider_object_reference text not null, sanitized_payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz, processed_at timestamptz, processing_error text, created_at timestamptz not null default statement_timestamp(),
  unique (provider, provider_event_reference), unique (tenant_id, id)
);

create function private.reject_ledger_mutation() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'commerce ledger is append-only'; end;
$$;
create trigger commerce_ledger_immutable before update or delete on app.commerce_ledger_entries for each row execute function private.reject_ledger_mutation();

do $rls$
declare t text;
begin
  foreach t in array array['payment_accounts','provider_object_mappings','payment_price_snapshots','payment_attempts','payment_charges','payment_refunds','payment_disputes','payment_transfers','commerce_ledger_entries','payment_webhook_events'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('create policy %I on app.%I for select to authenticated using (private.is_active_tenant_member(tenant_id) and private.has_direct_capability(tenant_id, ''integration.manage''))', t || '_read', t);
    execute format('create policy %I on app.%I for insert to authenticated with check (false)', t || '_insert_denied', t);
    execute format('create policy %I on app.%I for update to authenticated using (false) with check (false)', t || '_update_denied', t);
    execute format('create policy %I on app.%I for delete to authenticated using (false)', t || '_delete_denied', t);
  end loop;
end $rls$;

grant select, insert on app.payment_accounts to authenticated;
grant select on app.provider_object_mappings, app.payment_attempts, app.payment_charges, app.payment_refunds, app.payment_disputes, app.payment_transfers, app.commerce_ledger_entries, app.payment_webhook_events to authenticated;
grant select on app.payment_price_snapshots to authenticated;

create function api_v1.get_payment_account_status_v1(p_tenant_id uuid)
returns table (provider text, provider_account_reference text, status text, charges_enabled boolean, payouts_enabled boolean, requirements jsonb, capabilities jsonb)
language sql stable security invoker set search_path = '' as $$
  select provider, provider_account_reference, status, charges_enabled, payouts_enabled, requirements, capabilities
  from app.payment_accounts
  where tenant_id = p_tenant_id
    and private.has_direct_capability(p_tenant_id, 'integration.manage')
    and private.is_aal2();
$$;

revoke all on function api_v1.get_payment_account_status_v1(uuid) from public;
grant execute on function api_v1.get_payment_account_status_v1(uuid) to authenticated;

comment on table app.payment_accounts is 'Provider account references and status only; credentials remain in controlled worker secret storage.';
comment on table app.commerce_ledger_entries is 'Immutable tenant booking-commerce ledger; never used for platform SaaS billing.';
comment on function api_v1.get_payment_account_status_v1(uuid) is 'Returns authoritative connected-account requirements after live membership and MFA checks.';
