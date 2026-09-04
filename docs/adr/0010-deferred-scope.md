# ADR-0010: Deferred scope

- **Status:** Accepted
- **Owner:** @SEIFSEIF4
- **Date:** 2026-09-04
- **Supersedes / Superseded by:** —

## Context

§8 of the [architecture spec](../../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md) splits functionality into an MVP (§8.1), a Phase 2 (§8.2), and later or separate modules (§8.3). §30 records the individual scope locks — group classes out of v1, one-way calendar in MVP, platform fallback sending domain, shared Supabase by default, public API in Phase 2, attachments excluded unless independent object backup exists. Issue #2 makes the deferral itself an acceptance criterion: group occurrences, two-way calendars, public APIs, customer attachments, multiple brands, and dedicated databases must be *correctly* deferred to their approved release tickets.

"Correctly deferred" means three things, and only the first is usually done.

1. The item is written down as out of scope, with the issue that owns it.
2. The reason is recorded, so the deferral is not relitigated every sprint by someone who assumes it was an oversight.
3. **The seam is left in place.** A deferral is only cheap if the MVP data model and interfaces do not make the deferred item a rewrite. §8.2's note in [release scope](../release-scope.md) already says this for group capacity: the primitive is built correctly in the data model during MVP; only its interface and operations wait.

The opposite failure is equally expensive: building the deferred feature by accident. A "small" waitlist table, a webhook endpoint "for testing", or a second brand row added "since it's easy now" each buy a maintenance, test, security, and support surface that nobody scoped. The right-hand column of the table below exists for that reason.

Deferring is not cancelling. Everything here is in the milestone map: M7 owns issues #42–#57 (Phase 2), M8 owns #58–#63 (later modules, not scheduled).

## Decision

We ship the MVP in [release scope](../release-scope.md) §2 and defer everything below. Each row names the owning issue; that issue, not this ADR, is where the item is designed.

| Item | Deferred to | Owning issue | Why | What we must NOT accidentally build now |
| --- | --- | --- | --- | --- |
| Group occurrences and attendee capacity | Phase 2 (M7) | #42 | The lighthouse vertical is one-to-one and exclusive-resource. Group booking adds attendee records, per-attendee cancellation and refunds, roster interfaces, and a second concurrency shape to test | Attendee tables, seat selection, per-attendee pricing, roster export, occupancy reporting, or any `capacity > 1` booking path in the Client |
| Waitlist | Phase 2 (M7) | #43 | Waitlist is an offer-and-expiry state machine with its own fairness, notification, and race conditions against ordinary booking | Waitlist tables or queues, "notify me" capture, auto-promotion on cancellation, or a waitlist state in the booking enum |
| Recurring bookings | Phase 2 (M7) | #44 | Series editing ("this occurrence / all future") multiplies every lifecycle action, and recurrence interacts badly with DST and with policy snapshots | Recurrence rules, series identifiers, expansion jobs, or a "repeat" control in the booking interface |
| Multi-resource services | Phase 2 (M7) | #45 | Allocating two or more resources atomically for one booking is a materially harder concurrency problem than the single-resource exclusion the MVP proves | Multi-resource allocation, partial-allocation rollback, or resource-set requirements on a service |
| Two-way Google Calendar sync | Phase 2 (M7) | #46 | §30 locks MVP to one-way add-to-calendar. Two-way needs OAuth token custody, watch renewal, cursors, reconciliation, and a conflict policy | OAuth connection storage, webhook channels, sync cursors, or writing our bookings into a customer's or staff member's external calendar |
| Two-way Microsoft calendar sync | Phase 2 (M7) | #47 | As #46, with a separate Graph subscription and permission model | As #46 |
| Packages and memberships | Phase 2 (M7) | #48 | Entitlement balances, expiry, and proration are a commerce subsystem, and recurring charges change the merchant-of-record analysis | Balance ledgers, "credits remaining" on a customer, membership tiers, or recurring charges against a tenant's customers |
| Coupons, gift cards, and credits | Phase 2 (M7) | #49 | Redeemable value is fraud-sensitive and needs atomic redemption, partial refunds against redeemed value, and its own audit | Discount codes, gift-card balances, or a redemption field on checkout — including a "promo code" input that does nothing |
| Custom roles and approval workflows | Phase 2 (M7) | #50 | [ADR-0007](./0007-roles-and-capabilities.md) fixes a small set of roles so the RLS matrix is finite and testable. Tenant-defined roles make the matrix unbounded | A role editor, per-tenant capability rows, or approval chains beyond the single request-to-book approval step in MVP |
| SMS and WhatsApp notifications | Phase 2 (M7) | #51 | Per-market consent, sender registration, and template approval are legal work per market, not an adapter | Phone-number-as-channel, opt-in capture for messaging, or a second notification transport in the outbox |
| Public tenant API and outbound webhooks | Phase 2 (M7) | #52 | A public contract is permanent. API keys, scopes, quotas, versioning, and outbound delivery guarantees are a product, not an endpoint | Tenant API keys, a `/v1/public` surface, outbound webhook registrations, or "temporary" unauthenticated integration endpoints |
| Advanced and scheduled analytics | Phase 2 (M7) | #53 | MVP ships the defined metrics in [ADR-0009](./0009-analytics-definitions.md) plus CSV export. Scheduled delivery and a warehouse pipeline add a data-egress and PII-separation surface | A warehouse pipeline, scheduled email exports, custom report builders, or any analytics store that joins to customer contact rows |
| Tenant-owned sending domains | Phase 2 (M7) | #54 | §30 locks MVP to a **platform fallback sending domain**. Per-tenant domains add DNS verification, warm-up, and per-tenant deliverability reputation to operate | Per-tenant DKIM/SPF provisioning, domain-verification flows, or per-tenant sender reputation handling |
| Multiple brands or instances per tenant | Phase 2 (M7) | #55 | One tenant, one brand, one instance in MVP. Multi-brand adds brand selection to every read path and a second publish lifecycle | Brand-switching interfaces, brand selectors on catalog rows, or per-brand publishing — the *identifiers* stay separate (see seams) but the interface does not appear |
| Dedicated Supabase project for enterprise tenants | Phase 2 (M7) | #56 | Shared project by default (§30). A dedicated project changes provisioning, migrations, backup, and the fleet-upgrade model | Per-tenant connection routing, a tenant-to-database registry, or migrations parameterized by target project |
| Shared config-only fleet mode | Phase 2 (M7) | #57 | MVP gives every tenant its own repository and Vercel projects (§30). A shared multi-tenant deployment for the configuration-only tier is an economics decision with its own isolation, upgrade, and rollback model, and #57 also carries the end-of-phase validation that Phase 2 shipped without MVP regression | A shared runtime that serves more than one tenant, a tenant-resolution layer in front of the app, per-tier deployment branching, or removing the per-instance repository assumption to "save builds" |
| Customer attachments | **Gated, not scheduled** | Gate owned by [ADR-0008](./0008-privacy-retention-and-support-access.md); prerequisite tracked by #39 | Postgres PITR does not restore deleted Storage objects (§26.2). Accepting uploads would create data with a deletion story and no restore story | Any upload control in the Client, customer-facing use of `tenant-private-docs`, or an attachment column on booking or intake |
| Marketplace discovery and provider routing | Later module (M8) | #58 | Cross-tenant discovery inverts the isolation model and changes payment liability | Cross-tenant search, a public provider directory, or platform-held funds |
| Native mobile applications | Later module (M8) | #59 | The white-label distribution model is web repositories and Vercel projects; app-store distribution is a different factory | React Native or Expo packages, app-shell routes, or push-notification credentials |
| Hotel / nightly inventory | Later module (M8) | #60 | Nightly inventory needs a date-bucket model and rate plans — a different scheduling primitive, not a longer duration | Date-range inventory, per-night pricing, or occupancy rate plans |
| Seat-map ticketing | Later module (M8) | #61 | Seat maps and high-volume ticketing need spatial inventory and a queueing front door | Seat maps, section or row inventory, or virtual waiting rooms |
| Regulated clinical records | Later module (M8) | #62 | Clinical records trigger sector-specific obligations. Ordinary SaaS controls do not imply healthcare compliance (§23.3) — **requires independent legal review** | Diagnosis or treatment fields, clinical note types, or any intake field marketed as a medical record |
| Third-party plugin execution | Later module (M8) | #63 | Arbitrary tenant code execution breaks the customization boundary and the CSP | A plugin runtime, tenant-supplied scripts, arbitrary iframes, or `eval`-shaped extension points |

### The seams we leave in place

Each seam is cheap now and removes a migration later. Building more than the seam is the accidental-build failure above.

- **Group capacity (#42):** capacity is modelled on the allocation as an integer, defaulting to 1, and the atomic confirmation algorithm is written against capacity rather than against a boolean. No attendee table.
- **Waitlist (#43):** cancellation already emits a `booking_cancelled` domain event through the outbox. A future waitlist subscribes; nothing about cancellation changes.
- **Recurrence (#44):** the booking carries its own policy and price snapshot ([ADR-0006](./0006-policy-snapshot-rules.md)), so an occurrence generated by a future series is already independently correct.
- **Multi-resource (#45):** allocations are rows against a booking, not a single `resource_id` column on the booking. The one-resource case is one row.
- **Calendars (#46/#47):** provider connection and external-event identity are their own tables from day one, and the MVP one-way `.ics` path writes nothing into them. Booking essentials are never derived from external calendar state.
- **Commerce (#48/#49):** money is integer minor units with an ISO currency, and the payment ledger is append-only per [ADR-0002](./0002-region-currency-and-money-representation.md) and [ADR-0003](./0003-merchant-of-record-and-payments.md). Balances and redemptions become new ledger entry types, not a new money model.
- **Roles (#50):** roles are already bundles of named capabilities ([ADR-0007](./0007-roles-and-capabilities.md)). Checks are written against capabilities, never against a role string, so custom roles later are new bundles rather than new call sites.
- **Messaging (#51):** the transactional outbox is channel-agnostic. Email is one channel implementation; a second registers alongside it.
- **Public API (#52):** all application reads go through versioned `api_v1` views and RPCs behind a data-access layer. A public API later exposes an existing contract instead of inventing one.
- **Analytics (#53):** the event catalog, correlation identifiers, and denominators in [ADR-0009](./0009-analytics-definitions.md) are defined now, so a warehouse later ingests defined events rather than re-deriving metrics.
- **Sending domains (#54):** the sending identity is resolved per tenant at send time, with the platform fallback as the resolved value in MVP. Adding a verified tenant domain changes the resolution result, not the send path.
- **Brands and instances (#55):** `tenant_id`, `brand_id`, and `instance_id` are three distinct identifiers with three lifecycles from day one ([glossary](../glossary.md) §1), and `tenant_id` alone is the RLS boundary. This is the single most expensive seam to add later.
- **Dedicated project (#56):** every tenant-scoped read is already RLS-enforced and `tenant_id`-keyed, and the control plane records the instance-to-backend mapping. Moving a tenant becomes an export and import, not a redesign.
- **Attachments (ADR-0008):** the bucket layout and object-key convention from §16.5 exist, and object metadata rows are the application's source of truth. When the object-backup gate passes, the customer-facing path is added on top of an existing structure.
- **Fleet mode (#57):** tenant resolution already happens through `tenant_id` and the control plane's instance-to-backend mapping (see #56), and the runtime reads its identity from configuration rather than from build-time constants. A shared deployment later changes where that identity comes from, not what depends on it.
- **Later modules (#58–#63):** the seam is the boundary itself — tenant isolation, the customization boundary, and the distribution boundary are not weakened to make any of these easier. Each requires its own product and compliance design before it is scheduled.

### Phase 2 commitment register

Revisit trigger one below — "a signed commitment requires a deferred item" — needs somewhere to be recorded, or it is discovered during implementation instead of during sales. This is that place. [ADR-0001](./0001-lighthouse-vertical-and-v1-scope.md) points here when a prospect requires a deferred booking mode.

**The register starts empty.** The row below is a worked example of the format, not a real commitment; it is deleted when the first real row is added.

| Prospect/tenant | Required deferred capability | Owning issue | Date recorded | Commitment status |
| --- | --- | --- | --- | --- |
| _Example — not a real commitment_ | Group occurrences and attendee capacity | #42 | 2026-09-04 | Example row |

Rules for the register:

- A row is added when a prospect or tenant **states** a deferred capability is required, whether or not anything is signed. `Commitment status` is one of `prospect interest`, `verbal`, `signed`, or `withdrawn` — the point is to see pressure accumulating before it becomes a contractual surprise.
- A row is not an approval and does not schedule work. The owning issue is still where the item is designed, and inclusion still requires its own scope decision.
- Two or more independent rows against the same issue is the evidence that reopens the M7 ordering.
- No contractual, legal, or compliance claim is made here; any commitment with regulatory content **requires independent legal review** before it is signed.

### Alternatives rejected

- **Ship a "small" version of one or two Phase 2 items.** Rejected: each carries a full test, security, and support surface regardless of interface size, and a half-built waitlist is harder to finish than an unbuilt one.
- **Defer without leaving seams, and refactor later.** Rejected: capacity, allocation shape, and the tenant/brand/instance split are all migrations against live booking data if deferred without a seam.
- **Build the seams as working, hidden features behind flags.** Rejected: an unshipped code path is untested code that still has to be reviewed, upgraded, and secured. §11 and [customization boundaries](../customization-boundaries.md) also make a local flag file a non-control — the backend entitlement is what decides.

## Consequences

### Positive

- The MVP test surface stays finite: one booking shape, one notification channel, one brand, one calendar direction.
- Every deferred item has a named owning issue, so "is this in scope?" is answered by a link rather than by a meeting.
- The seams mean each deferral is additive later rather than a migration against production booking data.
- The right-hand column gives reviewers a concrete rejection reason for scope that arrives disguised as a small change.

### Negative / cost

- Some seams are unused code and unused columns in the first release, which reads as speculative until the relevant issue lands.
- One-way calendar only will be a recurring sales objection, and staff will manage external conflicts manually until #46/#47.
- A platform fallback sending domain means first-release mail is branded, not fully white-label under the [glossary](../glossary.md) definition, until #54.
- No attachments means some verticals cannot be served at all in the first release.
- Maintaining brand and instance identifiers that only ever hold one value each is deliberate overhead for the whole of MVP.

## Revisit triggers

- The lighthouse tenant, or a signed commitment, requires a deferred item to launch — the item is recorded in the Phase 2 commitment register above and then needs its own scope decision, not a quiet inclusion.
- An independent object backup for `tenant-private-docs` is live and a byte-level restore drill has passed (#39), which opens the attachments gate in ADR-0008.
- A seam turns out to be wrong: a Phase 2 issue starts and finds the MVP model blocks it.
- An MVP pull request implements anything in a "must NOT build" cell.
- M6 exits and M7 planning begins, at which point the Phase 2 ordering here is re-derived from evidence rather than from §8.2's ordering.
- A later module (#58–#63) is proposed for scheduling, which requires its own product and compliance design first.

## References

- [Architecture spec](../../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md) — §3.4 non-goals, §8.1–§8.3, §11, §16.5, §23.3, §26.2, §30
- [Release scope](../release-scope.md) — MVP, Phase 2, later modules, milestone map
- [Architecture overview](../architecture.md)
- [Glossary](../glossary.md) — tenant vs brand vs instance, fully white-label, capability, entitlement
- [Customization boundaries](../customization-boundaries.md)
- [Security and privacy](../security-and-privacy.md)
- [Runbooks](../runbooks.md) — backup, restore drills, object-backup freshness
- [ADR-0008: Privacy, retention, and support access](./0008-privacy-retention-and-support-access.md) — the attachments gate
- [ADR-0009: Analytics definitions](./0009-analytics-definitions.md)
- [References](../references.md)
