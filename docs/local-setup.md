# Local Setup

The local development environment: toolchain, environment variable names, bring-up sequence, and the verification commands each CI gate runs or will run.

Authoritative source: §10.1, §13.1, §14.1, §16.6, §24 of [the architecture spec](../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md).

---

## Reality check: the workspace and local backend are reproducible

Issue #3 added the private pnpm/Turborepo monorepo, all three Next.js
application shells, the ADR-0011 package set, and local enforcement scripts.
Issue #4 adds the pinned Supabase CLI, a Docker-backed local project, central
migration and Edge Function surfaces, a synthetic-only seed, and a pgTAP
schema-boundary smoke. Issue #6 still owns tenant tables and the complete RLS
access matrix; a passing foundation smoke is not a claim that tenant isolation
is implemented.

| Thing | Status | Lands in |
| ----- | ------ | -------- |
| Knowledge-pack gate (`bash scripts/check-docs.sh`) | Available | Issue #1 (done) |
| Monorepo scaffold (workspaces, apps, packages, `turbo.json`) | Available | Issue #3 |
| Local workspace gates (format, lint, types, unit, build, boundaries, distribution, config, secrets, bundles) | Available | Issue #3 |
| Supabase local stack, central migrations, synthetic seed | Available | Issue #4 |
| pgTAP schema-boundary smoke | Available | Issue #4 |
| Full RLS matrix and multi-tenant fixtures | Not yet available | Issue #6 |
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

1. **Install prerequisites** — Node 22.22.0, `corepack enable` for pnpm, and Docker Desktop (or a compatible engine). The Supabase CLI is installed from the frozen workspace lockfile; a global CLI is not required.
2. **Clone and install** — `pnpm install --frozen-lockfile` at the repository root.
3. **Create your local env files** — copy the committed `.env.example` (added by issue #3) to `.env.local` in each app and fill each variable yourself. Values are never distributed.
4. **Start the local backend** — `pnpm supabase:start` starts the committed Supabase project. Use the local URL and publishable key printed by the CLI only in ignored local env files.
5. **Reset from zero** — `pnpm db:reset` replays every central migration and `supabase/seed.sql`. It is deliberately local-only; never add `--linked` or a hosted database URL.
6. **Run database checks** — `pnpm test:db` runs the pgTAP foundation and `pnpm db:lint` runs the database linter. Issue #6 expands both around tenant tables and RLS.
7. **Generate database types (pending issue #6)** — issue #6 adds the safe generated-type output once application schema exists.
8. **Run the apps** — `pnpm dev` starts Client on 3000, Dashboard on 3001, and Platform Admin on 3002. The identity shells work on localhost; after issue #6 connects tenant resolution, exercise Client through `LOCAL_TENANT_HOST` as well.
9. **Verify** — run the gates in the next section before opening a pull request.
10. **Stop the backend** — `pnpm supabase:stop` preserves local Docker state for the next run. A deliberate local volume wipe is safe only because local data is synthetic.

Hosted environment setup and the serialized release path are documented in
[environments.md](./environments.md). Developer workstations never link to
production as the normal migration path.

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
| Component tests | `pnpm test:component` | Available — issue #5; booking-flow components expand in issues #12–#18 |
| Database reset from zero | `pnpm db:reset` | Available — issue #4; Docker required |
| Database lint | `pnpm db:lint` | Available — issue #4; Docker required |
| pgTAP foundation | `pnpm test:db` (`supabase test db --local`) | Available — issue #4; full RLS matrix is `N/A — not yet implemented, owned by issue #6` |
| Contract tests | `pnpm test:contract` | Available — issue #4 |
| Concurrency tests | `pnpm test:concurrency` | `N/A — not yet implemented, owned by issues #6 and #11` |
| Build all apps and packages | `pnpm build` | Available — issue #3 |
| E2E | `pnpm test:e2e` | Identity/release smoke available — issue #4; full journeys are `N/A — not yet implemented, owned by issues #12–#18` |
| Accessibility (+ RTL interaction) | `pnpm test:a11y` | Client/Dashboard EN/AR × mobile/desktop × brand matrix plus reduced motion available — issue #5; full journeys remain issue #40 |
| Localization parity | `pnpm test:i18n` | Available — issue #5; includes locale rendering plus unit coverage for messages, formatting, and DST gaps/overlaps |
| Visual regression | `pnpm test:visual` | Client/Dashboard EN/AR × mobile/desktop × brand pixel baselines available — issue #5; full journeys remain issue #40 |
| Instance config validation | `pnpm check:config` | Available — issue #3 |
| Forbidden imports / boundaries / cycles | `pnpm check:boundaries` | Available — issue #3 |
| Distribution dependency closure | `pnpm check:distribution` | Available — issue #3; actual export/history fixture is issue #4 / #29 |
| Secret-shaped value scan | `pnpm check:secrets` | Available — issue #3; full exported-history scan is issue #4 / #29 |
| Distributed bundle leakage | `pnpm check:bundles` after `pnpm build` | Available — issue #3 |
| Workspace dependency graph | `pnpm graph:dependencies` | Available — issue #3 |

Visual references are platform-specific. Run and review the Darwin references
locally, but treat the `*-linux.png` references produced by the pinned
`ubuntu-24.04` source workflow as canonical for CI. Do not regenerate Linux
references in a different container or distribution: system and Arabic font
metrics differ even when the Chromium and Playwright versions match. Promote an
intentional CI-rendered reference only after reviewing the uploaded actual and
diff artifacts.

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
| `supabase start` hangs or fails | Docker not running, or ports already held by another local stack |
| App loads unbranded / 404 on the Client | Requested `localhost` instead of `LOCAL_TENANT_HOST`; tenant resolution found no verified domain row (§13.3) |
| `supabase db reset` mentions a linked project | Stop. The repository wrapper is local-only; do not continue against hosted data. |
| Type errors after pulling migrations | Safe database types were not regenerated after the schema changed; the generation surface lands with issue #6 |
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
