# Platform Admin implementation checkpoint — 2026-10-06

The application, operator database boundaries and isolated synthetic demo are complete and running locally. Verification passed: 14 browser tests, 39 database files / 1,703 assertions, 42 Platform Admin unit tests, typecheck, lint, formatting and all-app production builds. Final evidence is in [the route checklist and verification report](../../platform-admin-verification.md). The previous planning-only checkpoint is retained under `.artifacts/platform-admin/baseline/`.

## Running environment and login

- Repository: `/Volumes/PortableSSD/Dev/E/projects/booking-platform/booking-platform`; branch `feat/dashboard-completion`.
- Platform Admin: `http://localhost:3002/en`, Arabic `http://localhost:3002/ar`.
- Actual backend: isolated `platform-admin-20261006`, API `http://127.0.0.1:56521`, PostgreSQL port `56522`. Process configuration overrides unchanged `.env.local` files pointing at another project.
- Retained stacks on 543xx and 553xx were not reset, seeded or stopped. Realtime and its owner policy were enabled only on the isolated stack.
- Ignored `.artifacts/platform-admin/credentials.json` is mode `0600`, with real Auth accounts and verified TOTP for `admin`, `admin2`, `operator`, `viewer`. Read `operators.admin.email` and `operators.admin.password` locally; get a current code with `node scripts/platform-admin-local.mjs code admin`. No passwords or TOTP secrets appear here.
- Use Node 22.22.0; a local copy is at `.artifacts/platform-admin/node-v22.22.0-darwin-arm64/bin`. Host default Node 26 is outside the supported engine range.
- Dev `.next-platform-admin-local`, browser `.next-platform-admin-41742`, and production `.next` outputs are separate.

## Changed files and migrations

- `apps/platform-admin`: 26 page routes plus root and sign-out handlers, grouped shell, English/Arabic copy, RTL/mobile navigation, server reads/actions, URL list state, forms/dialogs, durable success feedback, MFA/step-up and sign-out. Old introductory and create-tenant shells were replaced.
- Six migrations: `20261006120000_platform_admin_foundation.sql`, `20261006130000_platform_admin_tenants.sql`, `20261006140000_platform_admin_operations.sql`, `20261006150000_platform_admin_commercial.sql`, `20261006160000_platform_admin_releases.sql`, `20261006170000_platform_admin_security_health.sql`.
- Six corresponding `supabase/tests/database/platform_admin_*_test.sql` contracts, fixture scoping in existing audit/support/RLS tests, minimal reviewed-definer checks in `tenant_schema_contract_test.sql`, and generated API types preserving 124 previously present function names with 66 additions (190 names; 191 signatures including an existing overload).
- `scripts/platform-admin-local.mjs`, `scripts/totp.mjs` and their tests; `supabase/demo/platform-admin-demo.sql` and README; `tests/e2e/platform-admin-fixtures.ts`, `platform-admin.spec.ts`, scoped Playwright configuration and config-test registration.
- Local fonts/licenses, font integrity checker, Markdown link checks outside fenced examples; setup, operations and architecture documentation.

Existing Client/Dashboard and shared work remains in the working tree. Initial status, binary diff and shared-file snapshots are retained in `.artifacts/platform-admin/`. Selective shared-file blobs keep earlier unrelated changes out of this commit. No push or deployment is authorized.

## Implementation corrections

- PostgreSQL enforces roles, AAL2, recent authentication, break-glass expiry and last-usable-administrator protection. Future authentication timestamps are denied.
- Idempotency binds keys to normalized payload fingerprints. Concurrent duplicate registrations yield one tenant/audit event; simultaneous administrator demotions preserve one usable admin.
- Durable audit/job boundaries reject secret-shaped values including escaped nested JSON. App logging records correlation IDs, function names and stable outcomes, without request parameters.
- Missing observations remain unknown. Domain verification, rollout completion and rollback require real worker evidence. Cancelled subscription access follows its expiry, including after clearing an override.
- Layout-owned feedback survives refresh and disappearing buttons. Native dialogs open after fresh forms commit, preserving initial focus and Escape focus return.
- Sign-out validates public Host/Origin instead of internal bind authority. Same-origin referrer policy preserves native form origins; cross-origin and opaque requests remain denied.
- Selectors load all pages; release validation reads the exact selected release. Specific-instance rollouts require no preselected rings. Localized audit export retains stable IDs and neutralizes spreadsheet formulas.

## Resume commands

Prefix shells with `rtk`, select Node 22 on PATH, and work from the repository root:

```sh
rtk node scripts/platform-admin-local.mjs status
rtk node scripts/platform-admin-local.mjs start
rtk node scripts/platform-admin-local.mjs serve --port 3002
rtk node scripts/platform-admin-local.mjs code admin
```

`serve --replace` replaces only this repository's Platform Admin process if necessary. Avoid generic Supabase reset/stop. `seed` refreshes named synthetic records/accounts while retaining non-demo data. `replay` deliberately resets only the isolated project for future migration verification; it is not a routine resume step. Full replay passed, followed by a transactional support/banner delta and complete tests without another reset. Isolated stop/start retained its backup.

```sh
rtk proxy env WLBP_SUPABASE_WORKDIR=.artifacts/platform-admin/isolated pnpm test:db
rtk proxy env WLBP_SUPABASE_WORKDIR=.artifacts/platform-admin/isolated pnpm db:lint
rtk proxy env WLBP_SUPABASE_WORKDIR=.artifacts/platform-admin/isolated pnpm check:db-types
rtk proxy env PLATFORM_ADMIN_E2E=1 pnpm exec playwright test --project=platform-admin --workers=1
```

Browser tests use actual password/TOTP sessions and disable screenshots, traces and videos. Avoid simultaneous native/test verification of one operator's TOTP step. Logs/reviews reside in `.artifacts/platform-admin/`. `database-report.md` records 39 files / 1703 passing assertions; `gates.mjs` captures source checks; `security-scan.mjs` compares actual credentials against static bundles, logs, test output and persisted audit without printing secrets.

## External dependencies and contracts

GitHub App installation/runtime secret references, Vercel team credentials, provider/release/integration/health workers, DNS/certificate observations, deployment reporting, restore/deletion execution and paging need configured services. Local queues and contracts exist; external execution remains unverified. There is no control-plane payment-provider integration: subscriptions are administrative records. Support grants do not automatically expose tenant bookings/customers. Human screen-reader acceptance was not performed.

Current contracts from `platform-contract.json`: `whiteLabelVersion=0.1.0`, `configSchemaVersion=3`, `backendContract={min:1,max:1}`. No issue is automatically closed by local delivery.
