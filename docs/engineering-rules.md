# Engineering Rules

The non-negotiable rules for writing code in this platform: package boundaries, caching, data access, i18n/a11y, test gates, and migration compatibility.

Authoritative source: §10.2, §10.7, §13.4, §13.5, §13.6, §24 of [the architecture spec](../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md).

> **Status:** issue #3 provides the pnpm/Turborepo workspace, three application shells, package builds, unit tests, and local gates for formatting, lint, type checking, boundaries, distribution closure, configuration, secrets, builds, and bundle leakage. CI orchestration and the local Supabase/database-backed gate layers remain issue #4 and issue #6 work. See [local-setup.md](./local-setup.md) for the exact command and owner of every gate.

---

## Never do these

Violating any of these is a blocking review failure, not a style comment.

| # | Rule | Why |
| - | ---- | --- |
| 1 | **No booking logic in the browser.** Availability, pricing, holds, and confirmation are decided server-side through versioned RPCs. | The browser is an untrusted client; correctness is database-enforced (§15). |
| 2 | **No service-role / secret Supabase key in Client or Dashboard.** Not in code, not in env, not in a build step. | Either app is distributed to tenant repositories; a leaked key defeats all tenant isolation (§22.1). |
| 3 | **No direct table writes bypassing the data-access layer.** All reads/writes go through the app's DAL to `api_v1` views/RPCs. | Scattered Supabase calls make RLS assumptions and cache semantics unreviewable (§13.5). |
| 4 | **No migration authored outside the platform pipeline.** An instance repository never authors or runs a shared production migration. | Only the private serialized release pipeline may migrate shared data (§10.7). |
| 5 | **No untested RLS table.** Every exposed table ships with positive *and* negative policy tests. | Untested isolation is assumed isolation (§24.2). |
| 6 | **No English-only string.** Every user-visible string is a message key with an Arabic counterpart. | English and Arabic must stay functionally equivalent (§13.6). |
| 7 | **No unlabelled interactive control.** Every control has an accessible name, visible focus, and a non-color-only state. | Accessibility is a release gate, not a follow-up ticket (§13.6, §24.1). |

Also never: trust a hostname, query parameter, form value, or JWT user metadata as authorization; put secrets, production data, or provider tokens in Git, tests, screenshots, logs, or AI prompts.

---

## 1. Package rules (§10.2)

| Rule | Enforcement |
| ---- | ----------- |
| Applications may import packages; packages must never import applications. | Lint boundary rule, fails CI |
| `booking-domain` is framework-independent — no Supabase, no React. | Dependency check in `packages/booking-domain/package.json` |
| `api-contracts` is versioned and backward-compatible within its support window. | Contract tests against supported versions |
| `supabase-client` (distributed) constructs the anonymous and user-scoped clients only; `supabase-admin` (platform-only) is the sole constructor of the service-role client — see [ADR-0011](adr/0011-distribution-allowlist-and-contract-versions.md). | Forbidden-import rule on `@supabase/*` outside those two packages, plus the distribution export test |
| `ui-foundation` holds accessible primitives with no tenant opinion; `white-label-ui` maps brand tokens onto them. | Review + visual regression matrix |
| Provider SDKs (Resend, Stripe, Google, Microsoft) live only in platform-owned `email` / `integrations` adapters. Distributed packages consume provider-neutral `api-contracts` outcomes. | Forbidden-import and distribution-closure rules; distributed booking code never imports an adapter or vendor SDK |
| Platform-only packages are denied by the distribution allowlist and verified absent in export CI. | Export/dependency-closure check |
| No circular dependencies, no deep private imports, no Platform Admin imports into distributed packages. | Fails CI |

**Practical consequence:** platform workers add vendor behaviour behind an `integrations` interface. Distributed Client/Dashboard code asks for a versioned provider-neutral field or operation in `api-contracts`; it never imports the adapter or SDK.

## 2. Caching rules (§13.4)

- Every cache key or tag containing tenant data includes: **tenant ID + locale + published revision + relevant feature/config version.** Missing any one of these is a cross-tenant or stale-brand bug.
- Dashboard user-specific data is dynamic or privately cached with verified user/tenant scope. Never a shared public cache.
- Booking availability has a **short TTL and is advisory only**. Confirmation always revalidates transactionally.
- Brand or catalog publication invalidates the tenant-specific tags.
- Auth/session-bearing responses are `private` / `no-store` unless framework guidance explicitly proves otherwise.
- CDN cache headers on public pages never vary on a session cookie without an explicit, reviewed design.

## 3. Data-access layer (§13.5)

Each app has one narrow DAL. It is the only place that talks to the backend, and it must:

1. Resolve and validate the current user and tenant.
2. Check capability and location scope for every mutation.
3. Call versioned `api_v1` views/RPCs — never ad-hoc table queries.
4. Convert database and provider errors into stable product errors.
5. Return DTOs containing only the fields the caller needs.
6. Emit correlation IDs (request, tenant, actor, booking, idempotency) with **no raw PII**.

Anything that looks like `supabase.from('bookings')` inside a component is a defect. See [architecture.md](./architecture.md) for where the DAL sits relative to the apps, and [security-and-privacy.md](./security-and-privacy.md) for the trust-boundary rules it enforces.

## 4. Internationalization (§13.6)

- URLs and metadata are locale-aware.
- Source copy is stored **by message key**. Never concatenate translated fragments.
- Arabic uses `dir="rtl"` and CSS logical properties (`margin-inline-start`, not `margin-left`).
- Localize digits, dates/times, currency, plural rules, validation messages, emails, and downloadable files.
- Store instants in **UTC**; store zones as **IANA identifiers**; display the selected zone next to every bookable time.

## 5. Accessibility (§13.6)

- Dense calendar grids ship with an accessible **list alternative**.
- Focus is persistent and visible; state changes are announced via live regions.
- No state is communicated by colour alone.
- Automated accessibility checks plus manual keyboard and screen-reader passes are release gates.

Token-level colour, contrast, and focus definitions live in [design-system.md](./design-system.md); what a tenant may and may not override lives in [customization-boundaries.md](./customization-boundaries.md).

---

## 6. Test layers (§24.1)

| Layer | What it proves |
| ----- | -------------- |
| Domain unit | Duration, buffers, policies, money, state transitions, assignment rules |
| Database / pgTAP | Constraints, functions, grants, RLS allow/deny, composite tenant relationships |
| Contract | Supported Client/Dashboard versions work against current and next backend contracts |
| Integration | Email/payment/calendar adapters, signatures, retries, reconciliation |
| Component | Form and calendar states, validation, permissions, RTL, long content |
| E2E | Customer booking and staff/admin workflows across real app boundaries |
| Concurrency | No overbooking under simultaneous holds, confirms, and reschedules |
| Accessibility | Automated rules plus manual keyboard/screen-reader checks |
| Visual regression | Brand-token matrix, mobile/desktop, English/Arabic, email previews |
| Provisioning | GitHub/Vercel/domain job replay, partial failure, reconciliation |
| Upgrade fixtures | Pristine, config-only, and extended-code instance upgrades |
| Load / resilience | RLS query cost, connection storms, queue backlog, provider outage |
| Recovery drills | Database restore, Storage restore, tenant-selective recovery, secret rotation |

## 7. Minimum RLS test matrix (§24.2)

Run `SELECT`, `INSERT`, `UPDATE`, `DELETE`, RPC, Storage, and Realtime cases for each principal below.

| Principal | Required expectation |
| --------- | -------------------- |
| Anonymous | Published DTOs only; no raw PII, no booking writes |
| Tenant A member | Only Tenant A, and only the permitted role/location/action |
| Tenant B member | Zero Tenant A access, including guessed IDs and nested joins |
| Multi-tenant user | Correct rows and capability scope under each membership |
| Revoked / stale session | Current membership check denies the sensitive action |
| Tenant administrator | Elevated privileges only within their own tenant |
| Platform support | Only the active support-grant scope; actor remains attributable |
| Service worker | Server-only, explicit asserted tenant, idempotent and audited |
| Missing / null / malformed identity | Default denial |

Every policy change ships positive and negative tests. Coverage must include views, nested relationships, RPC execution grants, `SECURITY DEFINER` functions, Storage paths, Realtime topics, and cross-tenant composite foreign-key attempts.

## 8. Required concurrency cases (§24.3)

| # | Case | Required outcome |
| - | ---- | ---------------- |
| 1 | 100 simultaneous requests for one capacity-1 slot | Exactly one active reservation |
| 2 | N seats, contended | Exactly N total party capacity accepted; the rest rejected |
| 3 | Adjacent half-open slots | Both succeed |
| 4 | Hold expiry racing payment confirmation | One explicit outcome plus a compensation path |
| 5 | Duplicate customer requests | One booking |
| 6 | Duplicate and reordered provider webhooks | No duplicated state or side effects |
| 7 | Reschedule failure | Original booking left intact |
| 8 | Multi-resource requests in reversed order | No unhandled deadlock |
| 9 | DST gap / duplicate local times | Deterministic slots |
| 10 | Staff or resource deactivation | Future bookings never silently orphaned |

## 9. Source monorepo CI (§24.4)

Ordered pipeline. A failure at any step stops the run.

1. Frozen dependency install and lockfile validation.
2. Format, lint, and type checks.
3. Domain, unit, and component tests.
4. Local Supabase reset from zero, replaying all migrations.
5. pgTAP / RLS / function tests with multiple tenants and roles.
6. Integration and webhook contract tests.
7. Build all three applications.
8. E2E, accessibility, RTL, and visual reference tests.
9. Distribution export and dependency-closure validation.
10. Secret, private-path, and Git-history scan.
11. Test the distribution against supported backend contract versions and instance fixtures.

## 10. Instance CI (§24.5)

Frozen install → config schema validation → customization-policy diff → forbidden-import check → lint → typecheck → unit and contract tests → both app builds → E2E smoke → accessibility and RTL → two protected preview deployments.

The instance calls a **central reusable workflow pinned to a reviewed full commit SHA**; a small local workflow stays visible for transparency. See [upstream-updates.md](./upstream-updates.md).

## 11. Production promotion (§24.6)

- Migration compatibility and backup/PITR state checked.
- Both apps built from the **same commit**.
- Preview smoke, contract, and security-header checks passed.
- Domain and environment fingerprints match desired state.
- Both production deployments pass health checks before **pair promotion**.
- Post-promotion synthetic booking runs against a test tenant in provider test mode.
- Rollback pair and on-call operator are known before promotion.

Operational procedures for a failed promotion live in [runbooks.md](./runbooks.md).

## 12. Compatibility and migration rule (§10.7)

Instance apps declare their compatibility window:

- `whiteLabelVersion` — the upstream release the instance is built from.
- `configSchemaVersion` — the `instance/` configuration schema it understands.
- `backendContract` — the `{ min, max }` range of backend contract versions it can run against.

Rules:

- The backend exposes **stable versioned views and RPCs** (`availability_v1`, `create_booking_v1`, …). Never change the shape of a published version — add a new one.
- Database releases follow **expand/contract**: add → backfill or dual-write → deploy all supported applications → observe → remove only after the deprecation window.
- An instance repository can **never** run a shared production migration. Only the private serialized platform release pipeline may.
- A change that narrows `backendContract` for existing instances is a breaking release and needs an ADR — see [adr/README.md](./adr/README.md).

---

## Related documents

- [docs/README.md](./README.md) — index of the knowledge pack
- [architecture.md](./architecture.md) — system topology and trust boundaries
- [glossary.md](./glossary.md) — tenant, instance, hold, contract version, and other terms
- [security-and-privacy.md](./security-and-privacy.md) — security invariants and data classification
- [customization-boundaries.md](./customization-boundaries.md) — what a tenant may change
- [design-system.md](./design-system.md) — tokens, primitives, RTL and contrast rules
- [local-setup.md](./local-setup.md) — toolchain, env variable names, verification commands
- [runbooks.md](./runbooks.md) — operational procedures
- [upstream-updates.md](./upstream-updates.md) — release, upgrade, and rollback flow
- [references.md](./references.md) — external documentation sources
- [adr/README.md](./adr/README.md) — architecture decision records
