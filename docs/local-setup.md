# Local Setup

The planned local development environment: toolchain, environment variable names, bring-up sequence, and the verification commands each CI gate will run.

Authoritative source: §10.1, §13.1, §14.1, §16.6, §24 of [the architecture spec](../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md).

---

## Reality check: one gate runs today

This repository currently contains the architecture specification, the `docs/` knowledge pack, and `scripts/`. There is **no `package.json`, no `pnpm-workspace.yaml`, no `turbo.json`, no `apps/`, no `supabase/`, and no Supabase project.**

One thing *is* executable and does pass today:

```bash
bash scripts/check-docs.sh
```

It is the knowledge-pack gate (issue #1): it runs `scripts/check_links.py` to resolve every relative link and anchor, checks that specification §1–§34 are all mapped in [docs/README.md](./README.md), scans for secret-shaped strings and compliance claims, and checks that tenant/brand/instance are kept distinct. Requires only `bash` and `python3`. Run it before opening any documentation pull request.

Everything else below is planned:

| Thing | Status | Lands in |
| ----- | ------ | -------- |
| Knowledge-pack gate (`bash scripts/check-docs.sh`) | **Runs today and passes** | Issue #1 (done) |
| Monorepo scaffold (workspaces, apps, packages, `turbo.json`) | Not yet available | Issue #3 |
| Supabase local stack (`supabase start`), migrations, seed | Not yet available | Issue #4 (environments) — scope boundary to confirm on the ticket, since #3 does not mention Supabase |
| pgTAP / RLS tests and the tenant-isolation fixtures they need | Not yet available | Issue #6 (tenant isolation) — scope boundary to confirm on the ticket |
| CI workflows that run the gates below | Not yet available | Issue #4 |
| Everything in "Bring-up sequence" and the pending rows in "Verification commands" | **Intended commands only. None execute today.** | Issues #3 / #4 / #6 |

Do not file a bug because a planned command below fails. It fails because the code does not exist yet.

---

## Planned toolchain

| Tool | Role | Notes |
| ---- | ---- | ----- |
| **Node.js** (active LTS) | Runtime for apps and tooling | Version pinned by `.nvmrc` / `engines` in issue #3 |
| **pnpm workspaces** | Package manager and workspace linking | §10.1. Installs are always frozen-lockfile in CI |
| **Turborepo** | Task orchestration and caching across workspaces | §10.1. `turbo.json` defines the task graph |
| **TypeScript** | Language for all three applications and every package | §13.1 |
| **Next.js (App Router)** | Client, Dashboard, and Platform Admin | RSC by default; client components only for browser-state interaction (§13.1) |
| **Supabase CLI** | Local Postgres + Auth + Storage + Edge Functions stack, migrations, `supabase test db` | §14.1, §24.2. Requires Docker |
| **Docker Desktop** (or compatible engine) | Runs the local Supabase containers | Prerequisite for the CLI stack |
| **Playwright** | E2E and accessibility runs | §24.1 |
| **pgTAP** | Database, RLS, and function tests | Executed via `supabase test db` |

Exact versions are set by issue #3. Treat the table as the shape of the toolchain, not a lockfile.

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

## Bring-up sequence (planned)

Every step below is pending issues #3, #4, and #6.

1. **Install prerequisites** — Node LTS, `corepack enable` for pnpm, Docker, and the Supabase CLI.
2. **Clone and install** — `pnpm install --frozen-lockfile` at the repository root.
3. **Create your local env files** — copy the committed `.env.example` (added by issue #3) to `.env.local` in each app and fill each variable yourself. Values are never distributed.
4. **Start the local backend** — `pnpm supabase:start` (wrapper around `supabase start`). Wait for the CLI to report the local API URL and keys.
5. **Reset the database from zero** — `pnpm db:reset` (`supabase db reset`) to replay all migrations and apply `supabase/seed.sql`. This is also CI step 4 (§24.4); if it fails locally it will fail in CI.
6. **Seed synthetic tenants** — the seed file provisions non-production tenants and a local hostname mapping so tenant resolution has something to resolve (§13.3). Never seed real customer data.
7. **Generate database types** — `pnpm db:types` writes generated Supabase types into `packages/supabase-client`.
8. **Run the apps** — `pnpm dev` (Turborepo runs Client, Dashboard, and Platform Admin). Access the Client through `LOCAL_TENANT_HOST`, not `localhost` directly, so tenant resolution behaves like production.
9. **Verify** — run the gates in the next section before opening a pull request.

Tear down with `pnpm supabase:stop`. Wiping local volumes is safe; the local stack holds only synthetic data.

---

## Verification commands

These map one-to-one onto the CI gates in [engineering-rules.md](./engineering-rules.md) §9 (source monorepo CI). **Exactly one of them runs today** — the knowledge-pack gate. Every other command is still a proposal. Report a gate that does not exist yet as `N/A — not yet implemented, owned by issue #N`, never as passing (see [`../AGENTS.md`](../AGENTS.md)).

| Gate | Intended command | Status |
| ---- | ---------------- | ------ |
| Knowledge pack (links, coverage, secrets, naming) | `bash scripts/check-docs.sh` | **Runs today and passes** — issue #1 |
| Format | `pnpm format:check` | Pending — issue #3 (script), #4 (CI) |
| Lint | `pnpm lint` | Pending — issue #3 (script), #4 (CI) |
| Typecheck | `pnpm typecheck` | Pending — issue #3 (script), #4 (CI) |
| Unit / domain tests | `pnpm test:unit` | Pending — issue #3 (script), #4 (CI) |
| Component tests | `pnpm test:component` | Pending — issue #3 (script), #4 (CI) |
| Database reset from zero | `pnpm db:reset` | Pending — issue #4 (Supabase local stack and environments); scope boundary to confirm on the ticket |
| RLS / pgTAP tests | `pnpm test:db` (`supabase test db`) | Pending — issue #6 (tenant-isolation tests), #4 (CI); scope boundary to confirm on the ticket |
| Contract tests | `pnpm test:contract` | Pending — issue #3 (script), #4 (CI) |
| Concurrency tests | `pnpm test:concurrency` | Pending — issue #3 (harness), #4 (CI) |
| Build all apps | `pnpm build` | Pending — issue #3 |
| E2E | `pnpm test:e2e` | Pending — issue #3 (script), #4 (CI) |
| Accessibility (+ RTL) | `pnpm test:a11y` | Pending — issue #3 (script), #4 (CI) |
| Localization parity | `pnpm test:i18n` | Pending — issue #3 (script), #4 (CI) |
| Visual regression | `pnpm test:visual` | Pending — issue #4 |
| Instance config validation | `pnpm check:config` | Pending — issue #3 (script), #4 (CI) |
| Forbidden imports / boundaries | `pnpm check:boundaries` | Pending — issue #3 (its acceptance criteria require it), #4 (CI wiring) |
| Distribution export + dependency closure | `pnpm check:distribution` | Pending — issue #3 (its acceptance criteria require it), #4 (CI wiring) |
| Secret / private-path / history scan | `pnpm check:secrets` | Pending — issue #3 (its acceptance criteria require it), #4 (CI wiring) |

Command names other than `scripts/check-docs.sh` are proposals from the CI order in §24.4. Issue #3 is free to rename them; if it does, this table is updated in the same pull request. Where the owning ticket is marked "scope boundary to confirm", settle it on the ticket before building, rather than assuming this table is authoritative.

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
