# Architecture

How the white-label booking platform is layered, deployed, isolated, and distributed to tenant instances.

Authoritative source: §9-§21 of [the architecture spec](../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md). This document is a navigable summary of the decisions in that spec; where the two disagree, the spec wins.

Related: [docs index](./README.md) · [glossary](./glossary.md) · [product vision](./product-vision.md) · [release scope](./release-scope.md) · [engineering rules](./engineering-rules.md) · [security and privacy](./security-and-privacy.md) · [customization boundaries](./customization-boundaries.md) · [local setup](./local-setup.md) · [runbooks](./runbooks.md) · [upstream updates](./upstream-updates.md) · [references](./references.md) · [ADR index](./adr/README.md)

Four rules govern everything below and are repeated where they apply:

1. Only **Client**, **Dashboard**, and approved shared packages may ever enter a tenant instance repository. Platform Admin, database migrations, privileged workers, global billing logic, and operational tooling stay in the private monorepo.
2. Database migrations are run by the **central platform pipeline only**. No tenant instance repository may run or author migrations.
3. Booking correctness lives in the **database** (atomic RPCs and transactions), never in the browser.
4. **RLS is mandatory on every tenant-owned table**, and every tenant-owned row carries `tenant_id NOT NULL`.

---

## Layers

Three layers with different owners, release cadences, and blast radius. Terms are defined in the [glossary](./glossary.md); tenant, brand, and instance are not synonyms.

| Layer | Contains | Owned by | Changes via | Distributed? |
| --- | --- | --- | --- | --- |
| Product kernel | `booking-domain`, `api-contracts`, database schema, RPCs, RLS, migrations, shared packages, Client/Dashboard source | Platform engineering | Private monorepo PR → release pipeline | Only the approved subset |
| Instance layer | `instance/**` config, brand tokens, content, assets, feature flags, approved extension slots, generated types | Tenant (with platform guardrails) | Instance repo PR, config-first | Is the instance |
| Control plane | Platform Admin app, provisioning jobs, distribution/export, upgrade bot, fleet state, global billing | Platform operations | Private monorepo only | Never |

Ownership consequences:

- Kernel changes are fleet-wide; they ship through the paired release and rollout rings described under [Control plane](#control-plane).
- Instance changes are local and must stay inside the configuration-first path in [customization boundaries](./customization-boundaries.md). A repeated instance-level customization is a signal to promote it upstream into a flag, token, content field, or extension slot.
- Control-plane changes never reach a tenant repository, so they can move independently.

---

## Topology

```text
                          Browsers / staff devices
                                     |
        +----------------------------+----------------------------+
        |                            |                            |
 +------v-------+            +-------v-------+           +--------v---------+
 | Client       |            | Dashboard     |           | Platform Admin   |
 | white-label  |            | white-label   |           | private          |
 | 1 Vercel prj |            | 1 Vercel prj  |           | 1 Vercel project |
 | per instance |            | per instance  |           | (whole platform) |
 +------+-------+            +-------+-------+           +----+--------+----+
        |                            |                        |        |
        +-------------+--------------+------------------------+        |
                      |                                                |
     +----------------v-------------------------------+                |
     |  Supabase application platform (1 per env)      |                |
     |  Auth  +  api_v1 views / versioned RPCs         |                |
     |  Postgres + RLS   <- owns all invariants        |                |
     |  Outbox -> Queues -> Cron                       |                |
     |  Edge Functions (verified webhooks, workers)    |                |
     +--------------------------+----------------------+                |
                                |                                       |
                    +-----------v------------+          +---------------v-----------+
                    | Providers              |          | Fleet control             |
                    | email / payments /     |          | GitHub App + Vercel API   |
                    | calendars              |          | (repos, projects, domains)|
                    +------------------------+          +---------------------------+
```

- Apps may perform safe RLS-protected reads directly; **sensitive mutations go through a thin server-side data-access layer and versioned RPCs**.
- The database owns invariants. Edge Functions own verified provider webhooks and short external calls. Queues own retries.
- Realtime tells a UI to refetch. It never confirms a booking, locks a resource, or orders jobs.

---

## Trust boundaries

| Boundary | Trusted for | Never trusted for |
| --- | --- | --- |
| Browser | User input, rendering | Tenant scope, price, availability, permission, payment success |
| Next.js server | Session validation, input validation, orchestration | Bypassing RLS without an explicit privileged design |
| Supabase RLS / RPC | Tenant isolation, transactional invariants | External provider delivery |
| Edge/worker with privileged key | One narrow privileged job | Arbitrary caller-supplied tenant scope |
| Platform Admin | Initiating control-plane requests | Direct destructive infrastructure action without a job and audit trail |
| Provider webhook | Events *after* signature verification | Ordering, uniqueness, or tenant mapping before validation |
| Instance repository | Client/Dashboard presentation and allowed extensions | Platform secrets, Platform Admin code, shared database migrations |

The hostname decides branding and routing. It never grants data access — see [Next.js application architecture](#nextjs-application-architecture). Full threat list and expected defenses live in [security and privacy](./security-and-privacy.md).

---

## Deployment units

| Unit | Cardinality | Notes |
| --- | --- | --- |
| Platform Admin Vercel project | 1, private | Control plane UI |
| Client Vercel project | 1 per instance | Root `apps/client` |
| Dashboard Vercel project | 1 per instance | Root `apps/dashboard` |
| Supabase project | 1 per environment (local/dev, staging, production) | Shared row-based tenancy |
| Resend account | 1 central at launch | Platform and/or verified tenant sending subdomains |
| GitHub App | 1, org-owned | Narrow contents / PR / administration scopes |
| Vercel team + API integration | 1 | Projects, env, domains, deployments, status |

A dedicated Supabase project per tenant stays a documented option for physical isolation, residency, or tenant-specific recovery objectives — not the default, because it multiplies Auth config, secrets, migrations, webhooks, monitoring, and support burden.

Per-instance Vercel projects are a **commercial** choice for configuration-only brands, not a technical necessity. A shared wildcard deployment would cut build overhead but trades away per-instance release control. Do not run both deployment modes until fleet size justifies it.

---

## Monorepo layout and package rules

Private source monorepo: pnpm workspaces + Turborepo-style task orchestration. App entry points stay thin; stable domain behavior lives in owned packages.

```text
booking-platform/
├── apps/            client · dashboard · platform-admin
├── packages/        booking-domain · api-contracts · supabase-client · supabase-admin · auth ·
│                    tenant-resolution · ui-foundation · white-label-ui · i18n ·
│                    email · integrations · observability · testing · config
├── supabase/        migrations (central pipeline only) · functions · tests · seed.sql
├── control-plane/   provisioning · distribution · upgrade-bot · contracts
├── instance-template/  instance/ · AGENTS.md · docs/
└── tests/           e2e · concurrency · provisioning · upgrade-fixtures
```

Package rules (enforced in CI, not by convention):

- Applications import packages. Packages never import applications.
- `booking-domain` is framework-independent: no Supabase, no React.
- `api-contracts` is versioned and backward-compatible within its support window.
- Supabase client construction is split by trust level, per [ADR-0011](adr/0011-distribution-allowlist-and-contract-versions.md): `supabase-client` (distributed) constructs the anonymous browser client and the per-request user-scoped client only; `supabase-admin` (platform-only, `server-only`) is the sole constructor of the service-role client. No other package may import `@supabase/*`.
- `ui-foundation` holds accessible primitives with no tenant opinion; `white-label-ui` maps brand tokens onto them.
- Provider SDKs sit in platform-only `email` / `integrations` adapters. Distributed booking code consumes provider-neutral outcomes through `api-contracts` and never imports an adapter or vendor SDK.
- Platform-only packages are denied by the distribution allowlist and **verified absent** by export CI.
- Circular deps, deep private imports, and any import from Platform Admin into a distributed package fail CI.

See [engineering rules](./engineering-rules.md) for the lint/CI enforcement details.

---

## Distribution boundary

**Only Client, Dashboard, and approved shared packages may ever enter a tenant instance repository.** Platform Admin, database migrations, privileged workers, global billing logic, and operational tooling stay private.

A tenant instance repository contains:

```text
tenant-instance/
├── apps/client · apps/dashboard
├── packages/            approved distributable packages only
├── instance/            manifest · brand · features · navigation · content/{en,ar} · assets · theme.css · extensions
├── docs/                ARCHITECTURE · WHITE_LABEL_AGENT_BRIEF · CUSTOMIZATION_BOUNDARIES · DESIGN_SYSTEM ·
│                        FEATURE_FLAGS · LOCAL_SETUP · VERIFICATION_CHECKLIST · UPSTREAM_UPDATE_GUIDE
├── .platform/           base.json · customization-policy.json
└── AGENTS.md, workspace + lock files
```

It receives generated public Supabase URL/key references and safe generated API types. It receives **no** privileged key, provider secret, Platform Admin source, control-plane worker, or migration authority.

Native fork vs managed logical fork:

| Option | Strength | Material problem | Verdict |
| --- | --- | --- | --- |
| GitHub-native private fork | Familiar upstream sync | Visibility/permissions couple to upstream; deleting the private upstream deletes its private forks | Only inside one trusted org with explicit policy |
| Repository template | Simple creation | Unrelated history, awkward ongoing merges | One-time starter kits only |
| Managed independent repo with release ancestry | Private lifecycle, precise access, controlled upgrade PRs | Needs an upgrade bot and release manifest | **Default** |
| One shared runtime repository | Easiest fleet updates | Less per-instance freedom and release isolation | Future config-only fleet mode |

Product language may call each repository an "instance fork". Technically it is an independent private repository with a recorded `upstream_release` and a common ancestor with the sanitized distribution repository. The sanitized distribution must be a **separate repository and Git history** — a branch in the source monorepo is not a safe boundary if its history ever held Platform Admin code or secrets.

Compatibility contract carried by every instance: `whiteLabelVersion`, `configSchemaVersion`, and a `backendContract` min/max range against stable versioned RPCs. Backend changes use expand/contract: add → backfill/dual-write → deploy all supported apps → observe → remove after the deprecation window.

**Database migrations are run by the central platform pipeline only. No tenant instance repository may run or author migrations.** Upgrade flow and conflict handling: [upstream updates](./upstream-updates.md).

---

## Next.js application architecture

Baseline for all three apps:

- App Router + TypeScript; React Server Components by default, client components only for interaction needing browser state.
- Server Actions for app-owned form mutations; Route Handlers for provider callbacks, tenant public APIs, webhooks, file responses, machine-to-machine endpoints.
- Shared Zod schemas at every trust boundary; `server-only` modules for privileged orchestration.
- CSP, secure cookies, HSTS, referrer / frame / permissions policies. Middleware and hidden navigation are never the only authorization check.

Supabase SSR (`@supabase/ssr`):

- Browser client uses only the public publishable/anonymous key.
- A fresh per-request server client bound to request/response cookies.
- A completely separate privileged client available only to controlled server/worker code, never to Client or Dashboard.
- Authorize from a verified identity operation (`getClaims()`), never from an unverified client-stored session read.

Tenant resolution: normalize exactly one hostname (lower-case, strip a valid port/trailing root dot, reject ambiguous input and invalid IDN after safe normalization) → match an active verified `tenant_domains` row for the requested application surface → resolve Instance, Tenant, Brand, deployment state, and published revision → attach server-side routing context → **re-authorize every protected read through current membership/RLS or use a narrow public tenant-scoped RPC**. The hostname and an explicit tenant-selection preference are untrusted selectors, never authority. Preview context fails closed until its owning issue supplies a signed preview mechanism; an unrestricted `?tenant=` switch is never accepted in production. See [ADR-0013](./adr/0013-tenant-context-and-live-authorization.md).

Caching rules:

- Any cache key/tag holding tenant data includes tenant ID, locale, published revision, and the relevant feature/config version.
- User-specific Dashboard data is dynamic or privately cached with verified scope — never in a shared public cache.
- Availability has a short TTL and is **advisory**; confirmation always revalidates transactionally.
- Brand/catalog publication invalidates tenant-specific tags.
- Auth/session-bearing responses are private/no-store. Public-page CDN headers never vary on a session cookie without an explicit design.

Data-access layer — one narrow layer per app that resolves and validates user + tenant, checks capability/location scope for mutations, calls versioned `api_v1` views/RPCs, maps database/provider errors to stable product errors, returns minimal DTOs, and emits request/tenant/actor/booking/idempotency correlation IDs without raw PII. Supabase calls are not scattered across components.

i18n and a11y: locale-aware URLs and metadata; source copy stored by message key with no concatenated fragments; `dir="rtl"` and CSS logical properties for Arabic; localized digits, dates, currency, plurals, validation, emails, and downloads; UTC instants with IANA timezone IDs shown beside every bookable time; an accessible list alternative to dense calendar grids, persistent focus, status announcements, no color-only states; automated a11y checks plus manual keyboard/screen-reader passes in release gates.

---

## Supabase backend

One project per environment, shared row-based tenancy, explicit schemas:

| Schema | Purpose | Data API exposure |
| --- | --- | --- |
| `api_v1` | Narrow views and versioned RPCs the apps consume | Yes, intentionally |
| `app` | Core normalized business tables | Prefer no; expose selectively |
| `private` | RLS helpers, audit internals, provider metadata, worker state | Never |
| `auth` / `storage` / `realtime` | Supabase-managed | Managed |

Data domains: tenancy · white label · catalog · staff/resources · availability · customers · booking · commerce · messaging · calendar · API/integrations · control plane · governance. Sensitive intake answers, staff notes, and booking notes live in separately permissioned domains so ordinary calendar views do not expose them.

Schedule configuration is normalized under `app.schedule_scopes`,
`weekly_schedules`, `schedule_breaks`, `schedule_exceptions`, `time_off`,
`holidays`, `blackouts`, `resource_maintenance_blocks`, and
`schedule_policy_overrides`. Recurring rules use local civil minutes plus an
IANA timezone; UTC instants and the original timezone are retained on committed
allocations. The Dashboard writes through the invoker
`api_v1.save_schedule_config_v1` with compare-and-swap revisions and reads a
scoped workspace projection. Anonymous Client callers never receive these raw
rows; issue #10 owns the derived availability projection.

Key relationships: a tenant has memberships, instances, services, resources, and customers; a booking references a service and a customer, allocates reservations against resources, and records immutable booking events.

**Every tenant-owned row — including joins, events, audit rows, outbox rows, and idempotency records — has `tenant_id NOT NULL`.** `tenant_id` participates in unique constraints, and composite foreign keys `(tenant_id, parent_id) → parent(tenant_id, id)` prevent cross-tenant relationships even from privileged code.

`tenants` is the global identity root and the capability-name vocabulary is a global immutable catalog. Roles and role-permission bundles are tenant-owned fixed v1 rows so memberships always reference a role through a composite tenant key; issue #50 may add tenant-defined bundles without replacing that relationship. Platform operator roles are separate from tenant memberships. Catalog authoring uses immutable localized revisions selected by a tenant-scoped published aggregate; Client discovery is the narrow `get_public_catalog_v1` DTO and never a raw table read (see [ADR-0014](adr/0014-catalog-publication-and-public-dto.md)). Minimal Brand, Instance, domain, settings, and Location identity rows land with the isolation foundation; their publishing and control-plane workflows remain with their owning issues.

RLS and grants:

- **RLS is mandatory on every tenant-owned/exposed table.** Revoke broad defaults; grant only what is needed.
- Separate policies per `SELECT`/`INSERT`/`UPDATE`/`DELETE`, with `USING` and `WITH CHECK` where relevant.
- Authorize through indexed current `memberships`, tenant role-permission bundles, and location scopes plus hardened `private` helpers. A valid Auth session does not preserve authority after membership revocation, and user-editable JWT metadata never participates in authorization.
- `security_invoker = true` views; prefer `SECURITY INVOKER` functions.
- Any necessary `SECURITY DEFINER` function lives in an unexposed schema with an empty search path, fully qualified objects, explicit authorization, execute revoked by default and granted narrowly.
- Allow **and** deny tests are required for every exposed table.

Public access: anonymous visitors read only published tenant-scoped catalog/brand DTOs and call narrow rate-limited availability/hold/booking functions. No raw access to customer, booking, membership, or internal availability tables. A signed manage-booking token maps to one booking and a small action scope; email OTP is required for sensitive data or high-impact changes.

The tenant-isolation foundation exposes only three pre-booking v1 surfaces: published public tenant resolution, the authenticated actor's current tenant choices, and an explicitly selected Dashboard context. Caller-supplied tenant identifiers only narrow a request; RLS and live membership decide whether a row is returned. Storage and Realtime remain disabled and grant no application access until their owning issues add tested policies.

Database function policy — data-intensive and transactional behavior (availability, hold, confirm, reschedule, cancel, capacity allocation, idempotency) lives in database functions; Edge Functions handle payment/email/calendar network integrations. Versioned contracts: `resolve_public_tenant_v1`, `get_public_catalog_v1`, `availability_v1`, `create_hold_v1`, `submit_booking_v1`, `confirm_booking_v1`, `reschedule_booking_v1`, `cancel_booking_v1`, `accept_request_v1`, `expire_holds_v1`. Errors return stable codes (`slot_unavailable`, `capacity_exhausted`, `policy_denied`, `revision_conflict`, `payment_pending`, `idempotency_conflict`, `transition_not_allowed`, `legal_hold_active`, `offboarding_sequence`, `checkout_not_ready`, `payment_not_verified`, `refund_not_eligible`, `exception_resolved`) and never reveal the conflicting customer or booking.

---

## Booking correctness invariants

**Correctness lives in the database, never in the browser.** The displayed availability is advisory; only the atomic write is authoritative.

The public v1 request is exact and bounded to 31 days; responses contain at
most 500 slots and expose only coarse no-slot reasons. They distinguish the
customer-selected display timezone from the service/location timezone. Under
[ADR-0017](./adr/0017-availability-contract-and-advisory-semantics.md), calendar
provider health is `not_applicable` until ADR-0010's two-way calendar scope is
activated, and availability must remain uncached unless every tenant,
publication, configuration, entitlement, schedule, and allocation revision is
available for the cache key.

Slot generation aligns to the location's civil-time grid before applying request
bounds. Fold numbering precedes window, notice, and interval filtering, using
28 hours of grid context on either side. That context counts toward the same
250,000 candidate/grid work limit; it never widens the returned window. Schedule
exceptions use the buffered occupied start's fold in each scope's timezone, while
the public slot fold identifies the unbuffered start.
Opening containment and break overlap are checked against each occupied UTC minute mapped into the
schedule's timezone, including both repeated hours and excluding the interval's
end. Every occupied minute must be open in both scopes, with date exceptions
replacing weekly openings. The exposed availability RPC declares its two-second statement timeout for
PostgREST transaction enforcement.

Interchangeable exclusive resources produce one public offer per start/end pair
without exposing resource IDs. Appointment offers remain distinct by public staff
ID. Issue #11 selects and allocates the actual resource in the atomic booking
transaction.

Availability is composed from orthogonal dimensions — shape, assignment, confirmation, payment, location, occurrence, queue — rather than hard-coded "booking types". A slot survives only if it clears published service rules and duration, location hours and closures, staff/resource schedules, date overrides and time off, eligibility and resource requirements, before/after buffers and turnover, active holds and confirmed allocations, external-calendar busy periods, minimum notice / horizon / interval / daily limits / capacity, and customer-plan and approval/payment restrictions. Staff assignment modes are fixed staff, customer choice, any eligible candidate, or deterministic round-robin normalized by offered hours; inactive and maintenance resources never enter a public candidate set.

| Concern | Mechanism |
| --- | --- |
| Exclusive resource, capacity 1 | Half-open `tstzrange` `[start - buffer_before, end + buffer_after)` plus a GiST exclusion constraint on `(tenant_id, resource_id, occupied_at)` where state is held/confirmed. SQLSTATE `23P01` maps to `slot_unavailable` without disclosing the conflicting row. |
| Capacity > 1 | Fixed `occurrence_inventory` row with capacity/held/confirmed/revision; lock the row or use a conditional atomic update; succeed only when `held + confirmed + party_size <= capacity`; movements written in the same transaction. Never emulate capacity N by counting rows without a lock. Identifiable units (courts, rooms, seats) are allocated concretely instead. |
| Holds | Short tenant-configurable TTL within platform limits. `expires_at` is data, not a moving `now()` predicate in the constraint. A cron job expires stale holds; a creation transaction may synchronously expire conflicting stale holds and retry. Active holds are limited per IP/session/customer/tenant. Confirmation succeeds only while the hold is valid. |
| Idempotency | Every customer/server mutation takes a platform-generated key stored uniquely as `(tenant_id, operation, idempotency_key)` with a normalized request hash, state, and result reference. Same key + same payload replays the original result; same key + different payload fails. The database record outlives any provider retention window. |

Atomic confirmation, one transaction: resolve tenant and actor from trusted context → claim/check idempotency → lock hold/booking revision → re-read published service and required resources → validate expiry, permission, price snapshot, party size, policies, provider state → insert all allocations in deterministic resource-ID order → create/update booking plus an immutable booking event → snapshot price, tax, policy, intake schema/answers, locale, timezone → insert integration/notification outbox events → commit and return the authoritative result.

As implemented for the no-payment tracer (issue #12), that transaction writes
`app.bookings` (the immutable snapshot plus the separate booking, payment,
notification, calendar, and approval states), `app.booking_contacts` and
`app.booking_intake_answers` (guest data kept out of ordinary calendar reads and
readable only with `customer.pii.view`), `app.booking_events` (append-only
lineage), and one `app.outbox_events` row per booking and topic. Snapshot
immutability is enforced by a trigger, not by convention: only the lifecycle
states and the revision may move, and a committed booking can never be deleted.
Confirmation adds no new public error string — it reuses the issue #11
vocabulary, and refuses a service that needs payment (`payment_pending`) or
tenant approval (`policy_denied`) until issues #22 and #13 ship those paths.

**No payment, email, or calendar provider is ever called inside that transaction.** Deadlocks and serialization failures retry a bounded number of times with jitter; exclusion constraints and locked capacity remain the final guard.

Request-to-book (issue #13) uses the same transaction and the same guards. An
approval-gated service commits `requested` with a wall-clock decision deadline
instead of `confirmed`; whether that request reserves capacity is the explicit
per-service `service.request_holds_allocation` setting from ADR-0005, and when
it does, the checkout hold itself becomes the reservation — its purpose changes
and its expiry becomes the deadline — so the exclusion constraints, the
availability engine, and the existing expiry job keep working unchanged. Staff
decisions are settled by the booking revision, so exactly one of two competing
accepts wins and the other gets `revision_conflict`. A staff proposal is a
separate expiring offer with an intent-scoped customer link whose digest alone
is stored; accepting one moves the booking under a new revision, which is the
reschedule shape below.

A guest reaches its own booking through a manage-booking link (issue #14): an
opaque token scoped to one booking and one intent, stored only as a digest,
expiring, revocable, and re-checked against current booking state on every use.
Every action intent additionally needs an email step-up code, which the
notification worker mints when it sends the message so no code plaintext is
ever written to a table or an outbox payload. Refusal is a returned value
rather than an exception — unknown, expired, revoked, consumed, wrong host, and
rate-limited all answer identically — so the audit row and rate-limit counters
that the refused call just wrote survive the transaction, and the surface never
discloses whether a booking or a token exists.

As implemented in issue #15, both a reschedule and a cancellation lock the
expected booking revision first, so exactly one of two competing changes wins
and the other gets `revision_conflict`. A move inserts the new allocation
before releasing the old one in the same transaction, and every refused move
therefore leaves the original booking and its allocation untouched. Capacity
stays reachable through the booking's hold for the booking's whole life, so a
cancellation after a move still releases exactly what the booking holds.
Cancellation records refund eligibility and its amount from the snapshotted
schedule and leaves the provider refund to issue #23. Every delivery intent is
keyed by the revision it describes, so a stale duplicate cannot update the
wrong version of a booking. The customer reaches both actions through the
single-intent management link from issue #14, which is consumed on use.

The Dashboard's daily operating centre (issue #16) is two scoped reads over the
same rows: `get_today_workspace_v1` classifies work into queues — requests,
delivery exceptions, payments needing action, arrivals, recent cancellations,
and later work — and `list_calendar_v1` returns a window that the day, week,
resource, and list views group differently in the client. Both are SECURITY
INVOKER, so RLS decides what a member sees, and both are `stable`, so neither
can become a second way to act: every change still goes through the booking
RPCs and their capability, state, and revision checks. A private per-tenant
Realtime broadcast carries identifiers and status only, and a listener refetches
through RLS rather than trusting the wire, so a lost, duplicated, or reordered
message cannot create false state.

The appointment lifecycle after confirmation (issue #17) is one engine,
`transition_booking_v1`, holding the whole permitted-transition table: from
`confirmed` to `checked_in` or `no_show`, from `checked_in` to `completed`, and
from any of those three back to `confirmed` under `booking.correct_status`, which
is the only authority that can override a recorded outcome and is the only one
that demands a reason. `cancelled` is deliberately not correctable: cancellation
released the allocation, so re-confirming would need capacity nobody is holding
any more and the honest recovery is a new booking. A stale revision is answered
first, because the loser of a race between two operators must refresh and the
status it would otherwise hear about is the one the winner just created; the
transition table is then judged against the state the caller genuinely read, so
`transition_not_allowed` always means "this booking cannot do that from what you
saw". Check-in has an operational window read from the
booking's own policy snapshot, and arriving outside it needs the separate
`booking.check_in_override` grant. Payment, refund, notification, and calendar
states are never touched by a transition, so a day closes out while a refund is
still pending (invariant 9). A transition is a booking state change, so it
revokes any outstanding guest management link through the issue #14 trigger:
a link offers to act on the booking as the guest last saw it, and a guest who
has been checked in, completed, or marked absent is no longer looking at that
booking. The next message the notification worker sends mints a fresh link, so
nobody is stranded.

Staff-created bookings are the customer confirmation engine with a
`booking.create_on_behalf` check and an authorship ledger entry in front of it,
not a second path: there is no other way to allocate capacity, snapshot policy,
claim an idempotency key, or enqueue the confirmation intent. Operational notes
and sensitive notes share one table and two visibilities; the sensitive one is
gated on exactly the `customer.pii.view` capability that already gates contact
rows and intake answers, so seeing a calendar never reveals a sensitive note,
and the write gate for each class is its read gate. Notes are append-only and
the ledger records only that a note exists and its visibility, never what it
says, so status history stays readable to an operator who is not entitled to the
note itself. Transitions and administrative actions land in the one
`app.booking_events` ledger rather than a parallel audit table, which is also
what `get_lifecycle_analytics_v1` counts: a UI event can be dropped, replayed,
or fired without a commit, while a ledger row cannot exist without the
transition that wrote it in the same transaction. Scheduling blocks,
maintenance, and time off remain `save_schedule_config_v1` operations feeding the
availability engine, and staff or resource deactivation still demands an
explicit reassign, cancel, or keep-active decision before it touches a future
allocation.

A customer (issue #18) is an identity the tenant accumulated across bookings,
not a record anyone imports. `app.customers` is keyed by
`sha256(tenant_id || ':' || lower(email))` — the same tenant-salted digest the
notification worker addresses mail with — and a trigger on `app.booking_contacts`
resolves it on every booking path, so no booking RPC had to change and whatever
issue #22 adds is covered without being told. Tenant-salting means two tenants
holding one address produce different digests and cannot be correlated.
Correcting a customer rewrites current identity and never the booking contact
rows: a past booking keeps the details it was actually made under, which is what
makes it evidence rather than a mutable opinion about who someone is. Consent
evidence is minimal by construction — document key, version, a hash of the
rendered text, and a timestamp — and is append-only.

Export, deletion, correction, restriction, and tenant offboarding are one
restartable machine (`app.privacy_requests` plus a step row per subsystem),
because they share the hold check, the resume logic, and the audit shape. A step
that succeeded is never re-run, so a job resumes after a crash, a timeout, or a
partial provider failure rather than starting again. Every subsystem in the
dependency closure gets a row even when it has nothing to do: "we checked and it
did not apply" and "we never looked" are different claims to a regulator, and
`not_applicable` carries the reason. Backups expire on their own retention and
are never surgically edited; analytics events age out on their own clocks. A
legal hold outranks a deletion and is re-checked on every attempt, so a hold
placed after a request was opened still stops it. Erasure is the one operation
permitted to break append-only, through a single condition in
`private.enforce_append_only` gated on a transaction-local GUC that only the
SECURITY DEFINER erasure engine sets; holding the GUC grants nothing, because no
application role holds an UPDATE or DELETE privilege on those tables in the first
place. Erasure hard-deletes sensitive intake and sensitive notes, anonymizes
contact rows so the booking keeps its shape as financial evidence, and leaves the
identity row as a referent holding nothing that identifies anybody, with its
digest replaced so it cannot be re-identified by hashing a guessed address.

Rescheduling is lineage plus a new booking revision, not a terminal `rescheduled` status: hold and allocate the new slot before releasing the old one, complete atomically, and preserve old time, price/policy snapshot, actor, reason, and revision in history. Recurring series require explicit "this occurrence" / "this and future" / "entire series" semantics.

Time and DST: store start/end as UTC `timestamptz` plus the IANA timezone used for interpretation and display; keep weekly rules in local civil time plus timezone; never store only a numeric UTC offset; test nonexistent spring-forward and duplicated fall-back times; show the timezone at slot selection, review, confirmation, email, calendar export, and Dashboard detail; when timezone rules change, preserve booked instants and the original booking-time context.

If payment succeeds after a hold is lost, the transaction enters a visible exception state and follows an explicit refund-or-escalate policy. Never silently overbook.

---

## Async jobs and secrets

Every provider side effect follows the transactional outbox: the business transaction inserts an `outbox_event` in the same commit → a dispatcher sends due events to Supabase Queues in bounded batches → a worker claims one under a visibility timeout → the provider adapter makes an idempotent call → the worker records the attempt and provider IDs and acknowledges only after durable success. Retries use bounded exponential backoff with jitter; poison events go to a dead-letter state with replay controls.

As implemented in issue #19, the email edge is: the booking transaction's
`app.outbox_events` row becomes one `app.notification_messages` row keyed by
tenant, booking, template, revision, recipient digest, and locale — so a
duplicate dispatch creates nothing — which a worker claims under a visibility
timeout, renders from a platform-owned versioned template, and hands to the
provider adapter. Only `private.record_notification_attempt_v1` ends the send
loop: acceptance means `sent`, and only the provider's own verified callback
means `delivered`. Retries use bounded exponential backoff with jitter and dead
letter into an operator-visible state with an authorized replay. A hard bounce
or complaint suppresses that address for that tenant alone, and a replay to a
suppressed address is refused. The booking's `notification_status` mirrors its
newest message, so a booking read carries delivery state without a second
query, and provider truth never rewrites booking truth.

Inbound webhooks are signature-verified against the **unmodified raw body**, inserted into `webhook_inbox` under a unique provider event/delivery ID, acknowledged fast, and processed asynchronously. Both the sanitized raw event and the canonical state are stored. Duplicates and out-of-order delivery are expected.

Cron (Supabase Cron) covers hold expiry, reminder scheduling, stuck-outbox recovery, payment/calendar/email reconciliation, calendar subscription renewal, retention/deletion batches, usage aggregation, orphaned object checks, and partition/index maintenance when measurements justify it. Jobs stay short and batched — current guidance is at most eight concurrent jobs and no job over ten minutes (revalidate this vendor limit at implementation time; see [references](./references.md)). Long workflows are resumable state machines, not one long invocation.

Edge Functions handle verified provider webhooks, email sends, calendar/provider calls, the Supabase Auth email hook, and small provisioning steps. Each invocation is restartable and idempotent; bounded background execution is never the only durable path for critical work.

Realtime uses private Broadcast topics such as `tenant:<uuid>:calendar` carrying minimal change identifiers or status, after which the client refetches through RLS. No customer PII in broadcast payloads.

Storage uses buckets by data class, not per tenant: `tenant-public-assets` (public by deliberate policy), `tenant-private-docs` (private signed URLs), `upload-quarantine` (worker-only). Object keys begin `<tenant_id>/<purpose>/<uuid-or-content-hash>`; Storage RLS checks the tenant path and current membership; an application metadata row exists per object; declared vs actual MIME type, size, dimensions, and malware status are validated before promotion; deletion goes through the Storage API, never by editing metadata tables.

Secret placement:

| Location | Holds |
| --- | --- |
| Vercel environment storage | App/runtime secrets and public configuration, scoped by project and environment |
| Supabase function secrets | Provider secrets needed by Edge Functions |
| Supabase Vault | Only secrets that genuinely need database-side access |
| Platform database | Encrypted secret **references and fingerprints**, never plaintext for display |
| Instance repository | Nothing |

GitHub installation tokens are minted short-lived per job, scoped to the smallest repository set, and never stored. Provider credentials rotate on a schedule with last-used/rotation timestamps. Tokens, authorization headers, customer data, and webhook bodies are redacted from ordinary logs. Handling rules and incident procedures: [security and privacy](./security-and-privacy.md) and [runbooks](./runbooks.md).

---

## Integration topology

Detail lives in §17-§20 of the spec; what matters architecturally is the shape of each edge. Every integration is provider-neutral behind an `integrations` interface, driven by the outbox, and reconciled independently of webhooks.

| Integration | Path | Authority | Non-negotiables |
| --- | --- | --- | --- |
| Email (§17) | booking transaction → `notification_outbox` → Queue → Edge worker → provider → webhook inbox → email event ledger | Dashboard + event ledger | The booking commits even if the email provider is down. Never send from a booking Server Action. Durable database idempotency key, provider key as a second layer only. Immutable versioned templates with HTML + plain text, English/Arabic and RTL. Custom sending domains are inactive until verified. |
| Payments (§18) | Stripe-hosted Checkout Session on the tenant's connected account → verified webhook / server reconciliation → commerce ledger | Verified webhook or reconciliation — **never** the browser return URL | Tenant is merchant of record; v1 uses Accounts v2 direct charges with no application fee (ADR-0003). Booking payments and platform SaaS billing are separate systems. Money is integer minor units + ISO currency; no card data stored; `payment_status` stays separate from `booking_status`. Production enablement requires independent legal, finance, tax, and provider review. |
| Calendars (§19) | OAuth connection → full sync → persisted cursor → incremental sync + periodic reconciliation; push notifications are wake-up hints only | Incremental sync and reconciliation | Encrypted refresh tokens; renew watches/subscriptions before expiry; validate webhook challenges and secrets; deterministic event IDs for booking/revision correlation. Default policy: external busy data affects future availability, but an external edit never silently changes booking essentials — surface a conflict. |
| Tenant API and webhooks (§20) | Tenant-scoped service accounts → versioned, OpenAPI-described endpoints; outbound signed webhook envelopes | Platform contracts | Ships after core booking stabilizes. Hashed keys with named scopes and expiry; rate limits per tenant/key/endpoint; idempotency on create and payment-affecting operations; keyset pagination and ETags; secret rotation, dead-letter history, replay; at-least-once and possibly out-of-order delivery documented; never more customer data than the event scope requires. |

---

## Control plane

The control plane provisions and operates the fleet. It is never distributed.

Control-plane data records **stable external IDs, never only mutable names**: tenant/brand/instance IDs; GitHub org, installation, repository ID, default branch, ruleset state; current and desired distribution release plus customization tier; Vercel team, Client/Dashboard project IDs, deployment IDs, logical release-pair ID; domain IDs, desired DNS records, verification/certificate/cutover state; environment schema version and **secret fingerprints, not plaintext**; backend contract range; email domain/account IDs and health; payment and calendar onboarding health; rollout ring, operational state, attempts, errors, audit history.

GitHub App — organization-owned, not a personal access token. Grant only the needed installation permissions (administration where repository creation requires it, contents read/write, pull requests write; checks/status/actions only where automation truly needs them). Mint one-hour installation tokens per job scoped to the smallest repository set. Validate webhook signatures, enqueue, acknowledge quickly, respect primary and secondary rate limits, and periodically reconcile desired against actual state. The Vercel GitHub App is a **separate** installation — creating a repository through the platform App does not grant Vercel access to it.

Vercel projects and domains — per instance repository create `<instance-slug>-client` (root `apps/client`) and `<instance-slug>-dashboard` (root `apps/dashboard`). The slug is a display-safe derivative; `instance_id` remains the canonical identifier. Create with safe bootstrap configuration, deploy a known release, run health checks, and only then attach or cut over live domains. Environment changes affect future deployments only, so trigger and verify a new deployment. Domain ownership verification and DNS propagation are a **waiting state, not an error**. Deployment protection hardens previews and Dashboard defense in depth but never replaces application authentication and RBAC.

Paired release — Client and Dashboard build from the same commit, but promotion is two external operations and is not atomic. Keep current and previous backend compatibility, wait for both deployment checks, then promote both, recording the two production deployment IDs as one logical release pair. On failure: stop the rollout ring → redirect both domains to the last healthy pair where safe → verify backend compatibility and health → land a source revert or forward fix so Git stays authoritative. Code rollback does not undo external API actions or destructive data migrations — which is why database changes use expand/contract and forward repair, and why previous deployments retain their old build-time environment values.

Rollout rings, in order: internal/demo tenants → canary tenants → small production batches → remaining config-only fleet → extended-code tenants after manual resolution. Pause automatically on build failures, smoke failures, error or latency regression, contract mismatch, or unusual booking/payment errors. **Never direct-push fleet updates to default branches.** Procedures: [runbooks](./runbooks.md).

Fleet economics — one repository plus two Vercel projects per tenant is justified when a customer needs independent code, deployment, ownership, release control, or contractual isolation. It is expensive for configuration-only tenants: every upgrade produces two preview and two production deployments before retries. Monitor repository count, Vercel project/build/deployment quotas, GitHub API and action limits, upgrade conflict rate, queue age, and operator time. At a defined threshold, evaluate a shared multi-tenant deployment for the config-only tier while keeping dedicated logical forks for extended-code and enterprise customers. Record that threshold as an ADR — see [ADR index](./adr/README.md).
