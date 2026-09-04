# Local Setup

The local development environment: toolchain, environment variable names, bring-up sequence, and the verification commands each CI gate runs or will run.

Authoritative source: §10.1, §13.1, §14.1, §16.6, §24 of [the architecture spec](../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md).

---

## Reality check: the workspace runs; the backend does not yet

Issue #3 adds the private pnpm/Turborepo monorepo, all three Next.js
application shells, the ADR-0011 package set, and local enforcement scripts.
The `supabase/` directory reserves platform ownership only: there is still no
Supabase project, migration, seed, or database test harness until issues #4 and
#6.

| Thing | Status | Lands in |
| ----- | ------ | -------- |
| Knowledge-pack gate (`bash scripts/check-docs.sh`) | Available | Issue #1 (done) |
| Monorepo scaffold (workspaces, apps, packages, `turbo.json`) | Available | Issue #3 |
| Local workspace gates (format, lint, types, unit, build, boundaries, distribution, config, secrets, bundles) | Available | Issue #3 |
| Supabase local stack (`supabase start`), migrations, seed | Not yet available | Issue #4 (environments) — scope boundary to confirm on the ticket, since #3 does not mention Supabase |
| pgTAP / RLS tests and the tenant-isolation fixtures they need | Not yet available | Issue #6 (tenant isolation) — scope boundary to confirm on the ticket |
| CI workflows that run the gates below | Not yet available | Issue #4 |
| Browser E2E, accessibility, RTL interaction, and visual suites | Not yet available | Issue #5 (foundation), issue #4 (CI) |

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
| **Supabase CLI** | Local Postgres + Auth + Storage + Edge Functions stack, migrations, `supabase test db` | §14.1, §24.2. Requires Docker |
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
| `NEXT_PUBLIC_SITE_URL` | Canonical origin used for locale-aware URLs, metadata, and redirect targets. |
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

---

## Bring-up sequence

1. **Install prerequisites** — Node LTS, `corepack enable` for pnpm, Docker, and the Supabase CLI.
2. **Clone and install** — `pnpm install --frozen-lockfile` at the repository root.
3. **Create your local env files** — copy the committed `.env.example` (added by issue #3) to `.env.local` in each app and fill each variable yourself. Values are never distributed.
4. **Start the local backend (pending issue #4)** — the future `pnpm supabase:start` wrapper will start Supabase. Until then the identity pages intentionally render without a backend.
5. **Reset the database from zero (pending issue #4)** — the future `pnpm db:reset` command will replay migrations and synthetic seed data.
6. **Seed synthetic tenants (pending issue #4)** — never seed real customer data.
7. **Generate database types (pending issue #4)** — the future `pnpm db:types` command writes safe generated types into `packages/supabase-client`.
8. **Run the apps** — `pnpm dev` starts Client on 3000, Dashboard on 3001, and Platform Admin on 3002. The issue #3 identity shells work on localhost; after issue #6 connects tenant resolution, exercise Client through `LOCAL_TENANT_HOST` as well.
9. **Verify** — run the gates in the next section before opening a pull request.

After issue #4 adds the local stack, its future `pnpm supabase:stop` command will tear it down. Wiping those local volumes is safe because they contain synthetic data only.

---

## Verification commands

These map onto [engineering-rules.md](./engineering-rules.md) §9. Commands marked
available run locally now; issue #4 owns their CI wiring. Report an unavailable
gate as `N/A — not yet implemented, owned by issue #N`, never as passing.

| Gate | Intended command | Status |
| ---- | ---------------- | ------ |
| Knowledge pack (links, coverage, secrets, naming) | `pnpm check:docs` | Available — issue #1 |
| Frozen install / lockfile | `pnpm install --frozen-lockfile` | Available — issue #3 |
| Format | `pnpm format:check` | Available — issue #3 |
| Lint | `pnpm lint` | Available — issue #3 |
| Typecheck | `pnpm typecheck` | Available — issue #3 |
| Unit / domain tests | `pnpm test:unit` | Available — issue #3 |
| Component tests | `pnpm test:component` | Pending — issue #5 (suite), #4 (CI) |
| Database reset from zero | `pnpm db:reset` | Pending — issue #4 (Supabase local stack and environments); scope boundary to confirm on the ticket |
| RLS / pgTAP tests | `pnpm test:db` (`supabase test db`) | Pending — issue #6 (tenant-isolation tests), #4 (CI); scope boundary to confirm on the ticket |
| Contract tests | `pnpm test:contract` | Pending — issue #4 |
| Concurrency tests | `pnpm test:concurrency` | Pending — issues #4 / #6 |
| Build all apps and packages | `pnpm build` | Available — issue #3 |
| E2E | `pnpm test:e2e` | Pending — issues #4 / #5 |
| Accessibility (+ RTL interaction) | `pnpm test:a11y` | Pending — issues #4 / #5 |
| Localization parity | `pnpm test:i18n` | Pending — issue #5; issue #3 config validation already checks template message-key parity |
| Visual regression | `pnpm test:visual` | Pending — issue #4 |
| Instance config validation | `pnpm check:config` | Available — issue #3 |
| Forbidden imports / boundaries / cycles | `pnpm check:boundaries` | Available — issue #3 |
| Distribution dependency closure | `pnpm check:distribution` | Available — issue #3; actual export/history fixture is issue #4 / #29 |
| Secret-shaped value scan | `pnpm check:secrets` | Available — issue #3; full exported-history scan is issue #4 / #29 |
| Distributed bundle leakage | `pnpm check:bundles` after `pnpm build` | Available — issue #3 |
| Workspace dependency graph | `pnpm graph:dependencies` | Available — issue #3 |

### Required coverage before a pull request

- The RLS matrix in [engineering-rules.md](./engineering-rules.md) §7 has a positive and a negative case for every changed policy.
- The concurrency cases in [engineering-rules.md](./engineering-rules.md) §8 that touch your change still pass.
- English and Arabic are both exercised for any user-visible string.

---

## Troubleshooting (anticipated)

| Symptom | Likely cause |
| ------- | ------------ |
| `supabase start` hangs or fails | Docker not running, or ports already held by another local stack |
| App loads unbranded / 404 on the Client | Requested `localhost` instead of `LOCAL_TENANT_HOST`; tenant resolution found no verified domain row (§13.3) |
| Type errors after pulling migrations | `pnpm db:types` not re-run after `pnpm db:reset` |
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
- [upstream-updates.md](./upstream-updates.md) — instance CI and upgrade flow
- [references.md](./references.md) — external documentation sources
- [adr/README.md](./adr/README.md) — architecture decision records
