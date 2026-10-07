# Local Setup

The local development environment: toolchain, environment variable names, bring-up sequence, and the verification commands each CI gate runs or will run.

Authoritative source: §10.1, §13.1, §14.1, §16.6, §24 of [the architecture spec](../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md).

---

## Reality check: the workspace and local backend are reproducible

Issue #3 added the private pnpm/Turborepo monorepo, all three Next.js
application shells, the ADR-0011 package set, and local enforcement scripts.
Issue #4 added the pinned Supabase CLI, a Docker-backed local project, central
migration and Edge Function surfaces, a synthetic-only seed, and a pgTAP
schema-boundary smoke. Issue #6 adds tenant tables, deterministic multi-tenant
fixtures, the complete RLS access matrix, and a local-only `api_v1` generated
type drift gate.

| Thing | Status | Lands in |
| ----- | ------ | -------- |
| Knowledge-pack gate (`bash scripts/check-docs.sh`) | Available | Issue #1 (done) |
| Monorepo scaffold (workspaces, apps, packages, `turbo.json`) | Available | Issue #3 |
| Local workspace gates (format, lint, types, unit, build, boundaries, distribution, config, secrets, bundles) | Available | Issue #3 |
| Supabase local stack, central migrations, synthetic seed | Available | Issue #4 |
| pgTAP schema-boundary smoke | Available | Issue #4 |
| Full RLS matrix and multi-tenant fixtures | Available | Issue #6 |
| Local-only `api_v1` database type drift gate | Available | Issue #6 |
| CI workflows that run the gates below | Available | Issue #4 |
| Bilingual component, a11y, RTL, reduced-motion, and visual foundation | Available | Issue #5; full journey coverage remains issue #40 |

An unavailable gate is reported as `N/A` with its owning issue. It is never
reported as passing.

---

## Toolchain

| Tool | Role | Notes |
| ---- | ---- | ----- |
| **Node.js 22.22.0** | Runtime for apps and tooling | Pinned by `.nvmrc`; engines accept maintained Node 22 versions from 22.13 |
| **pnpm 11.25.0 workspaces** | Package manager and workspace linking | The root manifest pins it; installs are frozen in verification and CI |
| **Turborepo 2.10.12** | Task orchestration and caching across workspaces | `turbo.json` defines the task graph |
| **TypeScript 6.0.3** | Language for all three applications and every package | Pinned below 6.1 for the supported TypeScript ESLint peer range |
| **Next.js 16.3.4 / React 19.2.8** | Client, Dashboard, and Platform Admin | App Router; Server Components by default |
| **Supabase CLI 2.116.0** | Local Postgres + Auth + REST + Edge Functions stack, migrations, `supabase test db` | Pinned as a root development dependency; Storage/Realtime wait for their owning tested features; requires Docker and Node 20+ |
| **Docker Desktop** (or compatible engine) | Runs the local Supabase containers | Prerequisite for the CLI stack |
| **Playwright** | E2E and accessibility runs | §24.1 |
| **pgTAP** | Database, RLS, and function tests | Executed via `supabase test db` |

The lockfile is the installation authority. The workspace catalog keeps shared
runtime and type packages on one reviewed version. Foundational dependencies
were selected from maintained, permissively licensed packages; boundary tooling
is development-only, and the application shells ship no provider SDK.
ESLint is pinned to 9.39.5 because the React/import plugins consumed by the
Next.js configuration do not yet declare ESLint 10 support. Unapproved
dependency lifecycle scripts are denied by default; the unused
`unrs-resolver` postinstall is explicitly denied.

---

## Environment variables

**Names and purposes only.** This document never contains a value, and never a realistic-looking placeholder. Set every variable in your own local environment file, which is git-ignored.

Use the literal string `<set-in-your-own-env>` as the stand-in below.

### Client and Dashboard (distributed apps — public/runtime scope only)

| Variable | Purpose |
| -------- | ------- |
| `NEXT_PUBLIC_SUPABASE_URL` | Base URL of the Supabase project the app talks to (local stack URL during development). |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public publishable/anonymous key used by the browser client. Grants nothing beyond RLS-permitted anonymous access. |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin used for locale-aware URLs, metadata, and redirect targets. Required for production/preview builds; localhost fallback exists only outside production. |
| `LOCAL_TENANT_HOST` | Hostname used to exercise tenant resolution locally against a seeded synthetic tenant (§13.3). |

Example line shape in your local env file:

```bash
NEXT_PUBLIC_SUPABASE_URL=<set-in-your-own-env>
```

The default locale is configuration, not an environment variable. Read it from the validated `instance/manifest.json`; there is no environment override.

### Server-only (never bundled, never in a distributed instance repository)

| Variable | Purpose |
| -------- | ------- |
| `EMAIL_PROVIDER_API_KEY` | Credential for the transactional email adapter behind the `integrations` interface (§17). |
| `PAYMENT_PROVIDER_SECRET_KEY` | Credential for the payment adapter, provider **test mode** only in local development (§18). |
| `PAYMENT_WEBHOOK_SIGNING_SECRET` | Verifies raw-body signatures on inbound payment webhooks (§18.3, §22.1). |

### Phase 2 only — do NOT set these in v1

v1 ships **one-way add-to-calendar (`.ics`) only**. It never reads or writes an external calendar, and [ADR-0010](./adr/0010-deferred-scope.md) puts OAuth connection storage, webhook channels, and sync cursors under "must NOT build". The variables below belong to two-way sync (issues #46 / #47) and are listed only so nobody re-invents a different name for them later. **Do not add them to any v1 env file; a v1 code path that reads one is a defect.**

| Variable | Purpose | Status |
| -------- | ------- | ------ |
| `CALENDAR_GOOGLE_CLIENT_ID` / `CALENDAR_GOOGLE_CLIENT_SECRET` | OAuth client for a future Google Calendar adapter (§19.2). | Phase 2 — not set in v1 |
| `CALENDAR_MICROSOFT_CLIENT_ID` / `CALENDAR_MICROSOFT_CLIENT_SECRET` | OAuth client for a future Microsoft Graph adapter (§19.3). | Phase 2 — not set in v1 |

### Rules that are not negotiable

- **No privileged Supabase key belongs in Client or Dashboard** — not in env, not in a build step, not "temporarily". Privileged database access exists only in controlled server/worker code owned by the platform, and this document deliberately gives no instructions for using it. See [engineering-rules.md](./engineering-rules.md) "Never do these" #2.
- Local `.env*` files are git-ignored and never committed, pasted into issues, screenshots, logs, or AI prompts (§16.6, §22.1).
- Instance repositories contain **no secrets at all** (§16.6). Secrets live in Vercel environment storage, Supabase function secrets, or Supabase Vault.
- Payment and email providers run in **test/sandbox mode** locally. Never point a local stack at production credentials or production data.
- Where the local Supabase CLI prints its own generated local keys, use those from the CLI output — do not copy them into this repository.

---

## Control-plane variables — never in an app env file

These belong to Platform Admin and the provisioning automation only. **A Client or Dashboard developer copying `.env.local` never copies anything from this section.** They are not in this repository's app scope for MVP local work, they are never placed in an app `.env*` file, a distributed instance repository, a build step, or a browser bundle, and they are held in the platform's secret store. They are listed here as names only so nobody invents a second spelling for them.

| Variable | Purpose |
| -------- | ------- |
| `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` | Identity for minting short-lived, per-job GitHub installation tokens (§21.2). |
| `VERCEL_API_TOKEN` | Provisioning of instance projects, environment variables, and domains (§21.3). |
| `VERCEL_TEAM_ID` | The platform's Vercel team scope (`team_katana`) every project/domain call is issued under. |

---

## Bring-up sequence

1. **Install prerequisites** — Node 22.22.0, `corepack enable` for pnpm, and Docker Desktop (or a compatible engine). The Supabase CLI is installed from the frozen workspace lockfile; a global CLI is not required.
2. **Clone and install** — `pnpm install --frozen-lockfile` at the repository root.
3. **Create your local env files** — copy the committed `.env.example` (added by issue #3) to `.env.local` in each app and fill each variable yourself. Values are never distributed.
4. **Start the local backend** — `pnpm supabase:start` starts the committed Supabase project. Use the local URL and publishable key printed by the CLI only in ignored local env files.
5. **Reset from zero** — `pnpm db:reset` replays every central migration and `supabase/seed.sql`. It is deliberately local-only; never add `--linked` or a hosted database URL.
6. **Run database checks** — `pnpm test:db` runs the pgTAP schema-boundary and complete tenant RLS matrix; `pnpm db:lint` runs the database linter.
7. **Generate and verify database types** — with the reset local stack running, use `pnpm db:types` to atomically update `packages/supabase-client/src/database.types.ts`, then run `pnpm check:db-types`. Both commands are pinned to the local stack and the safe `api_v1` schema; neither requires a linked or hosted Supabase project. Generator diagnostics are suppressed so local credentials and connection details cannot enter logs.
8. **Run the apps** — `pnpm dev` prefers Client on 3000, Dashboard on 3001, and Platform Admin on 3002. If a port is occupied, the launcher selects another available port without taking another app's preferred port and prints the resulting URLs before starting Turborepo. Shared package dependencies build before the apps start. The launcher never stops an existing server. Local URL fallbacks use the running server's port; an explicit `NEXT_PUBLIC_SITE_URL` still takes precedence. Direct app commands keep their default ports; override them with `CLIENT_PORT`, `DASHBOARD_PORT`, or `PLATFORM_ADMIN_PORT`. The identity shells work on localhost; after issue #6 connects tenant resolution, exercise Client through `LOCAL_TENANT_HOST` as well.
9. **Verify** — run the gates in the next section before opening a pull request.
10. **Stop the backend** — `pnpm supabase:stop` preserves local Docker state for the next run. A deliberate local volume wipe is safe only because local data is synthetic.

Hosted environment setup and the serialized release path are documented in
[environments.md](./environments.md). Developer workstations never link to
production as the normal migration path.

### Arabic demo data

Opt-in preview data so a local Client and Dashboard look like a working Gulf business instead of e2e fixtures. With a local stack running (set `WLBP_SUPABASE_WORKDIR` to an absolute path to target an isolated stack), run `pnpm demo:local`.

It applies `supabase/demo/arabic-demo.sql`: one tenant, "منشأتك" / "Your Business" (SAR, Arabic default), with the location "الفرع الرئيسي" / "Main branch" in `Asia/Riyadh`. It also creates 4 staff with Arabic names, 2 rooms, 5 bilingual services with VAT-inclusive SAR prices, 8 customers, and about 30 bookings. The bookings span today across all four staff lanes (in mixed states), the next 7 days and the past week. Every fixed id starts with `ad`. Emails end in `.example.invalid`. Phone numbers are in the fictional 555-01xx range.

- **Synthetic and local-only.** The runner refuses any non-loopback Supabase URL. The SQL refuses unless the runner sets `wlbp.allow_demo=on`, and also refuses when any tenant has a non-reserved (real) domain. It is never part of `seed.sql`, a migration or `db reset`. Some pgTAP files assume an empty bookings table, so run `pnpm test:db` on a freshly reset stack **before** applying the demo (or reset again afterwards), exactly as with the e2e fixtures.
- **Repeatable.** Re-running on the same day changes nothing. A run on a later day closes out passed demo bookings and adds that day's set. `pnpm db:reset` removes it.
- **Owner login.** Sign in as `demo-owner@example.invalid`. The runner sets a fresh random password through the local Auth admin API on every run and saves it only to the ignored, owner-only `.artifacts/demo/credentials.json`.
- **Resolving the tenant.** On `localhost`, the apps resolve the tenant from `LOCAL_TENANT_HOST`. The helper below sets it along with the stack's public URL and key. From `apps/dashboard` (Git Bash):

  ```bash
  WLBP_NEXT_DIST_DIR=.next-arabic-demo node ../../scripts/run-with-local-supabase-env.mjs \
    dashboard.arabic-demo.example.invalid node node_modules/next/dist/bin/next dev --port 3101
  ```

  Open `http://localhost:3101/ar`. For Client, run the same command from `apps/client` with `client.arabic-demo.example.invalid` and another port.

---

## Verification commands

These map onto [engineering-rules.md](./engineering-rules.md) §9. Commands marked
available run locally now; issue #4 owns their CI wiring. Report an unavailable
gate as `N/A — not yet implemented, owned by issue #N`, never as passing.

### Fast feedback loop

Use `pnpm check:fast` while iterating and before pushing a pull request. It
validates the lockfile, workflow controls, formatting, release/configuration
contracts, distribution closure, secret-shaped values, documentation links, and
the affected workspace packages through Turborepo. Locally it compares against
`origin/main` when that ref is available; set `FAST_BASE_SHA` and
`FAST_HEAD_SHA` to override the comparison. If no usable base is available, it
checks every workspace package.

The matching [Fast PR feedback](../.github/workflows/fast-feedback.yml)
workflow caches the pnpm store and Turborepo task results and cancels obsolete
commits. It is intentionally informational and does not start Docker, reset
Supabase, install Chromium, run browser/database gates, build every application,
or replace the required [Source monorepo CI](../.github/workflows/ci.yml)
ordered source gates. A fast pass is therefore an early signal, never release
evidence.

| Gate | Intended command | Status |
| ---- | ---------------- | ------ |
| Knowledge pack (links, coverage, secrets, naming) | `pnpm check:docs` | Available — issue #1 |
| Frozen install / lockfile | `pnpm install --frozen-lockfile` | Available — issue #3 |
| Format | `pnpm format:check` | Available — issue #3 |
| Lint | `pnpm lint` | Available — issue #3 |
| Typecheck | `pnpm typecheck` | Available — issue #3 |
| Unit / domain tests | `pnpm test:unit` | Available — issue #3 |
| GitHub App provisioning unit tests | `pnpm test:github-app` | Available — issue #31; live App calls are N/A until its organization-owned installation and runtime-only secret references exist |
| Component tests | `pnpm test:component` | Available — issue #5; booking-flow components expand in issues #14–#18 |
| Database reset from zero | `pnpm db:reset` | Available — issue #4; Docker required |
| Database lint | `pnpm db:lint` | Available — issue #4; Docker required |
| pgTAP schema boundary and full tenant RLS matrix | `pnpm test:db` (`supabase test db --local`) | Available — issues #4 and #6; Docker required |
| Generated `api_v1` database type drift | `pnpm check:db-types` | Available — issue #6; reset local stack and Docker required |
| Contract tests | `pnpm test:contract` | Available — issue #4 |
| Provider integration (email) | `pnpm test:unit` covers rendering, signatures, batch dispatch and adapter failure classification. Central Edge entry points exist. Actual Resend sandbox delivery remains pending provider credentials and an authorized integration run; queue state does not prove delivery. |
| Booking concurrency tests | `pnpm test:concurrency` | Available — issue #11; Docker, a reset local stack, `psql`, and more than 100 spare database connections required |
| Build all apps and packages | `pnpm build` | Available — issue #3 |
| Workspace Realtime broadcast | Database invalidation, private browser subscription, degraded status and authoritative refetch are implemented. The completion campaign enables Realtime only on its isolated stack and provisions its table-owner policy explicitly. Actor update/reconnect/revocation acceptance is tracked in the campaign report; issue #102 is not labelled passing from source alone. |
| E2E | `pnpm test:e2e`, `pnpm test:e2e:live`, and the `dashboard-completion` Playwright project | Existing Client booking/request/manage/cancellation and Tenant-C tracers are available. The completion project adds real staff Auth, catalog, scheduling, lifecycle, privacy, Brand, communications and scoped refusal journeys. The campaign report records their executed results. |
| Accessibility (+ RTL interaction) | `pnpm test:a11y` | Client/Dashboard EN/AR × mobile/desktop × brand matrix plus reduced motion available — issue #5; full journeys remain issue #40 |
| Localization parity | `pnpm test:i18n` | Available — issue #5; includes locale rendering plus unit coverage for messages, formatting, and DST gaps/overlaps |
| Visual regression | `pnpm test:visual` | Client/Dashboard EN/AR × mobile/desktop × brand pixel baselines available — issue #5; full journeys remain issue #40 |
| Instance config validation | `pnpm check:config` | Available — issue #3 |
| Forbidden imports / boundaries / cycles | `pnpm check:boundaries` | Available — issue #3 |
| Distribution dependency closure | `pnpm check:distribution` | Available — issue #3; actual export/history fixture is issue #4 / #29 |
| Secret-shaped value scan | `pnpm check:secrets` | Available — issue #3; full exported-history scan is issue #4 / #29 |
| Distributed bundle leakage | `pnpm check:bundles` after `pnpm build` | Available — issue #3 |
| Workspace dependency graph | `pnpm graph:dependencies` | Available — issue #3 |

`check:config` and `check:boundaries` detect exactly one repository mode. The
private source monorepo validates `instance-template/instance/` with
`manifest.template.json` and the complete ADR-0011 source classification. A
generated repository validates `instance/` with the stamped `manifest.json`
and permits only ADR-0011 distributed workspace members. Having both mode
markers, neither marker, the wrong manifest filename, or a missing
configuration directory fails; configuration validation is never skipped.

Visual references are platform-specific. Run and review the Darwin references
locally, but treat the `*-linux.png` references produced by the pinned
`ubuntu-24.04` source workflow as canonical for CI. Do not regenerate Linux
references in a different container or distribution: system and Arabic font
metrics differ even when the Chromium and Playwright versions match. Promote an
intentional CI-rendered reference only after reviewing the uploaded actual and
diff artifacts.

Client and Dashboard use the checked-in WOFF2 assets documented in
[docs/fonts/README.md](./fonts/README.md). `pnpm check:fonts` verifies that all
three app/template copies match the recorded SHA-256 values, licenses are
present, and CSS contains no remote resource URL. The canonical Linux reference
workflow records the OS, architecture, Playwright, Chromium, and font
provenance alongside its actual/diff artifacts.

### Required coverage before a pull request

- The RLS matrix in [engineering-rules.md](./engineering-rules.md) §7 has a positive and a negative case for every changed policy.
- The concurrency cases in [engineering-rules.md](./engineering-rules.md) §8 that touch your change still pass.
- English and Arabic are both exercised for any user-visible string.

### Manual UI foundation review

Automation does not replace assistive-technology judgment. Before closing a UI
foundation or full-journey issue, review Client, Dashboard, and Dashboard
`/{locale}/brand-preview` in both locales and record the browser, operating
system, assistive technology, and commit tested. The required pass is:

1. Keyboard-only traversal, activation, form submission, error-summary focus,
   error-link recovery, and schedule grid/list switching.
2. Visible and logical focus order at desktop and mobile widths.
3. Reflow at 200% browser zoom and text-only zoom, with no two-dimensional
   scrolling for ordinary content.
4. VoiceOver, NVDA, or an equivalent screen reader: headings, landmarks,
   labels, error association, assertive errors, polite status updates, and the
   schedule list all announce in a useful order.
5. English and Arabic at narrow mobile width with the longest realistic tenant
   name and content; Arabic reading order must remain chronological where time
   is involved.
6. Operating-system reduced motion enabled; no authored motion remains.
7. The brand preview's default/warm token cases, light/dark asset treatments,
   button/form/calendar/error/empty/email states, and non-color status labels.

If any row has not been performed by a human, report it as pending manual
evidence. Axe, semantic-tree inspection, and screenshots are supporting
evidence, not a claim that a screen-reader pass occurred.

---

## Troubleshooting (anticipated)

| Symptom | Likely cause |
| ------- | ------------ |
| Direct app startup fails with `EADDRINUSE` | Another process owns the requested port. Use root `pnpm dev` for automatic selection, or set the app's port variable for a direct command. If your local `NEXT_PUBLIC_SITE_URL` includes a port, update it to match the printed app URL. |
| `supabase start` hangs or fails | Docker not running, or ports already held by another local stack |
| App loads unbranded / 404 on the Client | Requested `localhost` instead of `LOCAL_TENANT_HOST`; tenant resolution found no verified domain row (§13.3) |
| `supabase db reset` mentions a linked project | Stop. The repository wrapper is local-only; do not continue against hosted data. |
| Type errors after pulling migrations | The committed `api_v1` database types are stale; reset the local stack, regenerate with `pnpm db:types`, then run `pnpm check:db-types`. |
| RLS tests pass locally, fail in CI | Local database not reset from zero; CI always replays every migration (§24.4 step 4) |

---

## Related documents

- [docs/README.md](./README.md) — index of the knowledge pack
- [engineering-rules.md](./engineering-rules.md) — package, caching, data-access, i18n/a11y, and CI rules
- [architecture.md](./architecture.md) — system topology, deployment units, trust boundaries
- [glossary.md](./glossary.md) — tenant, instance, hold, contract version, and other terms
- [security-and-privacy.md](./security-and-privacy.md) — secrets handling and data classification
- [customization-boundaries.md](./customization-boundaries.md) — what lives in `instance/`
- [design-system.md](./design-system.md) — tokens and accessible primitives
- [runbooks.md](./runbooks.md) — operational procedures
- [environments.md](./environments.md) — environment identity and serialized backend releases
- [upstream-updates.md](./upstream-updates.md) — instance CI and upgrade flow
- [references.md](./references.md) — external documentation sources
- [adr/README.md](./adr/README.md) — architecture decision records
## Dashboard account flows

Dashboard sign-in uses normal Supabase Auth credentials; active membership and
the verified Dashboard hostname still determine workspace access. Recovery uses
PKCE and `/auth/callback?locale=en` (or `ar`). The callback also accepts the SDK's
optional `sb_flow_id`; it never carries a return destination. Open the link in
the browser that requested it. Supabase consumes the code once.

Set `DASHBOARD_RECOVERY_COOKIE_SECRET` in the Dashboard's server environment to
a platform-provided random signing key of at least 32 characters. It is not a
provider credential and must never use a `NEXT_PUBLIC_` name or enter Git. All
Dashboard instances serving the same origin need the same key. Rotating it
invalidates pending recovery receipts. Recovery fails closed when it is unset.
The callback creates a 15-minute HttpOnly receipt bound to the verified Auth
account/session. Password-only or unrelated OTP sessions cannot open the update
screen. A successful password change clears the receipt and signs out.

For the platform Auth mail hook, configure `DASHBOARD_AUTH_REDIRECT_ORIGINS` as
the exact comma-separated HTTPS Dashboard origins. Recovery redirects must use
`/auth/callback` with only `locale` and optional `sb_flow_id`. The allowlist never
selects a tenant or brand. Local default Inbucket mail does not use this hook.
The local redirect/TOTP configuration edits take effect only after a deliberate
stack configuration reload; they have not yet been applied or verified against
the retained running stack.

Account security is at `/{locale}/auth/mfa`. Verify a code, return to the task,
and submit its authoritative action again. Cancelling setup removes only an
unverified factor. Removing a verified factor requires recent AAL2. Secrets and
Auth callback URLs must be excluded from screenshots, traces, and ordinary logs.


### Dashboard completion campaign

Run `rtk node scripts/verify-dashboard-completion.mjs` with the pinned Node 22 toolchain. The runner creates the separate `dashboard-completion-20261005` Supabase project under ignored `.artifacts/dashboard-completion/isolated`, using ports 553xx, and resets only that campaign-owned stack. The retained `white-label-booking-platform` stack and demo booking are never reset. The isolated configuration enables Realtime for the acceptance tests.

Reports and redacted logs live in `.artifacts/dashboard-completion/`. Runtime synthetic passwords stay in a mode-0600 credential file and never enter app environment variables, snapshots or traces. Use `--only gate,gate` for affected gate reruns; rerunning fresh replay resets the isolated fixtures. Run completion-fixture after a fresh replay before browser acceptance.

Run the complete pgTAP suite immediately after fresh replay, before browser or contention fixtures populate the database. Rebuild exported shared packages before browser runs; `browser-contracts` covers the Dashboard and Client dependency closures. The `dashboard-workflows`, `dashboard-followthrough`, and `dashboard-realtime` gates are diagnostic subsets and never substitute for the full completion project. The local Auth mailbox is Mailpit behind the CLI’s inbucket-named service; its campaign UI/API port is explicitly 55324.

The platform-managed `realtime.messages` table has a separate owner. Apply `supabase/realtime/tenant-workspace-policy.sql` through that infrastructure owner before enabling the browser subscription. The campaign does this only inside its named isolated database container. The policy checks both live tenant membership and equality between each message topic and the authorized channel topic; it grants no client write policy or table ownership.

Set `DASHBOARD_RECOVERY_COOKIE_SECRET` in the Dashboard server secret store to an independently generated value of at least 32 characters. Keep it outside `NEXT_PUBLIC_*` configuration. Enable `NEXT_PUBLIC_DASHBOARD_REALTIME_ENABLED` only after tenant private-channel policies are provisioned.

Staff invitation delivery and payment onboarding workers are central platform functions, excluded from instance distribution. Their internal invocation credential, service-role credential and Stripe/Resend credentials belong to the platform worker secret store. Invitation jobs must be claimed by the platform scheduler; queue acceptance alone does not prove dispatch or delivery. Provider sandbox readiness remains pending until an actual authorized integration run is recorded.

## Isolated Platform Admin

Use Node 22.13–22.x and run `node scripts/platform-admin-local.mjs start`, then `node scripts/platform-admin-local.mjs seed`, then `node scripts/platform-admin-local.mjs serve`. The helper creates only the named `platform-admin-20261006` Supabase project (API 56521, database 56522), verifies its identity, and injects its public connection settings into Platform Admin. It does not trust the repository's `.env.local`. Port 3002 uses a separate Next cache from browser tests on 41742.

Open `http://localhost:3002/en` or `/ar`. Real synthetic Auth accounts and verified authenticator factors are recorded in ignored, owner-readable `.artifacts/platform-admin/credentials.json`. Use the admin account's email/password, then its six-digit authenticator code. `node scripts/platform-admin-local.mjs code admin` prints the current local code. The helper also creates viewer, operator and second-admin accounts for permission and two-person approval testing. Keep these files local. There is no authentication bypass.

The repeatable seed creates explicitly synthetic control-plane records and retains existing local data. External resources are recorded as unverified or pending until an actual worker reports evidence. Run browser checks with `PLATFORM_ADMIN_E2E=1 pnpm exec playwright test --project=platform-admin --workers=1`; artifacts containing credentials and sessions are disabled. Do not run native sign-in concurrently with tests using the same authenticator factor.
