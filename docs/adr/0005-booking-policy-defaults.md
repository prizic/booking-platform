# ADR-0005: Booking policy defaults

- **Status:** Accepted
- **Owner:** @SEIFSEIF4
- **Date:** 2026-09-04
- **Supersedes / Superseded by:** —

## Context

The lighthouse release sells one-to-one appointments, exclusive-resource bookings, and request-to-book (§3.5). Every one of those flows reads a dozen configurable numbers — how long a service runs, how long a hold survives, how late a customer may cancel, how much comes back. §15.1 lists the dimensions availability is composed from but assigns no values, and §30 leaves the values as "decisions required before implementation".

An implementer of the tenancy, booking, payments, or customer-management tickets cannot ship without those values. Left open, each ticket invents its own: one team's hold is 5 minutes, another's is an hour, and the refund arithmetic differs between the Client, the Dashboard, and the confirmation email. Tenants also need room to differ — a salon and a court hire do not share a cancellation window — but unbounded tenant configuration produces slot hoarding, unusable availability, and refund terms the platform cannot defend.

Two further forces: policy values are snapshotted onto bookings (SI-7, ADR-0006), so a value that is ambiguous at write time is ambiguous forever; and the same policy is settable at more than one scope, so a deterministic precedence rule is required before any resolver is written.

## Decision

We lock the policy set below. Every policy has a platform default that is a real, shippable value, platform-enforced bounds that no tenant may exceed, and exactly one deepest scope at which it may be set. A `null` at any scope means **inherit**, never zero.

### Policy table

Scope column names the deepest scope that may set the value. Every policy is also settable at every shallower scope in the precedence chain unless the scope reads "platform" (fixed) .

| # | Name | Type | Default | Allowed range | Scope |
| --- | --- | --- | --- | --- | --- |
| 1 | `service.duration_minutes` | integer minutes | `60` | 5–480, multiple of 5 | service |
| 2 | `service.buffer_before_minutes` | integer minutes | `0` | 0–120 | staff |
| 3 | `service.buffer_after_minutes` | integer minutes | `10` | 0–120 | staff |
| 4 | `service.slot_interval_minutes` | integer minutes | `15` | one of 5, 10, 15, 20, 30, 60 | service |
| 5 | `service.assignment_mode` | enum | `any_available` | `fixed_staff` \| `any_available` \| `customer_choice` \| `round_robin` | service |
| 6 | `service.location_applicability` | enum + id list | `all_active_locations` | `all_active_locations` \| explicit list of ≥1 tenant location id | service |
| 7 | `service.location_mode` | enum | `physical` | `physical` \| `video` \| `phone` \| `customer_address` | service |
| 8 | `service.approval_required` | boolean | `false` | `true` \| `false` | service |
| 9 | `service.payment_mode` | enum | `none` | `none` \| `deposit` \| `full` | service |
| 10 | `service.deposit_rule` | enum + value | `percent`, `25` | `percent` 1–100, or `fixed` 100–(price − 100) minor units | service |
| 11 | `price.tax_treatment` | enum | `tax_exclusive` | `tax_exclusive` \| `tax_inclusive` | tenant |
| 12 | `price.tax_rate_bps` | integer basis points | `0` | 0–3000 | location |
| 13 | `booking.minimum_notice_minutes` | integer minutes | `120` | 0–43200 (30 days) | service |
| 14 | `booking.horizon_days` | integer days | `60` | 1–365 | service |
| 15 | `booking.daily_limit_per_staff` | integer or null | `null` (unlimited) | 1–50, or null | staff |
| 16 | `hold.ttl_seconds` | integer seconds | `600` (10 min) | **platform min 120, platform max 1800** | service |
| 17 | `hold.max_active_per_actor` | integer | `3` concurrent holds on **each** of session, IP, and customer, counted independently | platform-fixed | platform |
| 18 | `cancellation.cutoff_minutes` | integer minutes before start | `1440` (24 h) | 0–20160 (14 days) | service |
| 19 | `cancellation.customer_self_service` | boolean | `true` | `true` \| `false` | service |
| 20 | `reschedule.cutoff_minutes` | integer minutes before start | `1440` (24 h) | 0–20160 | service |
| 21 | `reschedule.max_per_booking` | integer | `2` | 0–10 | service |
| 22 | `refund.schedule` | ordered tier list | `[{≥1440 min: 100%}, {≥240 min: 50%}, {<240 min: 0%}]` | 1–5 tiers, descending by time, each 0–100%, first tier boundary ≥ `cancellation.cutoff_minutes` | service |
| 23 | `refund.deposit_non_refundable` | boolean | `false` | `true` \| `false` | service |
| 24 | `payment.late_settlement_policy` | enum | `reallocate_then_refund` | `reallocate_then_refund` \| `reallocate_then_staff_resolve` | tenant |
| 25 | `payment.late_settlement_resolve_hours` | integer hours | `24` | platform-fixed max 72 | platform |
| 26 | `no_show.grace_minutes` | integer minutes after start | `15` | 0–60 | location |
| 27 | `no_show.fee_rule` | enum | `forfeit_deposit` | `none` \| `forfeit_deposit` | tenant |
| 28 | `checkin.window_opens_minutes_before` | integer minutes | `30` | 0–240 | location |
| 29 | `checkin.window_closes_minutes_after` | integer minutes | `60` | 0–240, and ≥ `no_show.grace_minutes` | location |
| 30 | `staff.deactivation_future_bookings` | enum | `reassign_then_defer` | `reassign_then_defer` \| `defer_until_resolved` | tenant |
| 31 | `tenant.timezone` | IANA timezone | `America/New_York` | any IANA zone | location |
| 32 | `tenant.locale` | BCP-47 tag | `en-US` | `en-US` \| `ar` (both always available) | location |
| 33 | `tenant.currency` | ISO 4217 | `USD` | platform-fixed in v1 (ADR-0002) | platform |
| 34 | `service.request_holds_allocation` | boolean | `false` | `true` \| `false` | service |
| 35 | `request.response_sla_hours` | integer hours | `48` | 1–168 | service |
| 36 | `completion.auto_complete_after_minutes` | integer minutes or null | `null` (manual completion only in v1) | 1–1440, or null | tenant |
| 37 | `hold.max_active_per_tenant` | integer | `500` concurrent holds | 50–10000, platform-adjustable per tenant, never tenant-settable | platform |
| 38 | `checkin.required_before_completion` | boolean | `true` | `true` \| `false` | service |
| 39 | `booking.status_correction_window_hours` | integer hours | `24` | 1–168 | tenant |
| 40 | `request.proposal_ttl_hours` | integer hours | `24` | 1–72 | service |

### Behavior the table does not fully state

- **Assignment (5).** `fixed_staff` requires one configured staff profile and fails closed when that person is not eligible for the published service/location pair at write time. `any_available` picks the eligible staff/resource with the fewest confirmed bookings in the target local day, ties broken by lowest resource id — deterministic, so a retry picks the same one. `customer_choice` requires a selection and fails closed if the chosen resource is unavailable at write time. `round_robin` orders eligible staff by normalized load: confirmed or completed assignments divided by `offered_hours_per_week`; lower load wins, then the oldest most-recent assignment (`NULL` first), then the lowest staff UUID. The public candidate DTO exposes only the resulting rank, never raw workload or offered-hours inputs. The atomic hold/confirmation transaction re-evaluates eligibility and the same ordering before it allocates, so the advisory candidate list cannot reserve a person or resource.
- **Approval (8, 34).** `approval_required = true` creates `requested`, never `confirmed` (§7.1). What that request does to availability is decided by `service.request_holds_allocation`, explicitly per service and never implicitly (ADR-0001 clause 3). With the default `false` the request reserves nothing: the allocation is attempted at acceptance and may fail with `slot_unavailable`, which is the honest outcome when two requests target the same slot. With `true`, request submission atomically converts the ordinary checkout hold into a `provisional_request` allocation whose expiry is the request's `created_at + request.response_sla_hours`; the shorter checkout hold TTL no longer governs it. It counts against availability until the request is accepted, declined, withdrawn, or expires. Acceptance without payment converts it atomically to a confirmed allocation. Acceptance with payment converts it atomically to a fresh checkout hold with a new `hold.ttl_seconds` clock.
- **Request SLA (35).** The clock is **wall-clock**, not business hours: 48 hours starting Friday afternoon elapses over the weekend, and no tenant calendar, holiday, or opening-hours setting pauses it. On elapse the request moves to `expired`, the customer is notified, and any provisional hold from row 34 is released. `expired` is a **terminal decision** and sits in the denominator of the approval rate defined in [0009-analytics-definitions.md](./0009-analytics-definitions.md) — a tenant cannot improve its approval rate by ignoring requests.
- **Completion (36, 38).** With the default `null` nothing auto-completes: a booking whose scheduled end is in the past stays open until staff complete it, mark it `no_show`, or cancel it. Manual completion requires `checked_in` when `checkin.required_before_completion = true`; otherwise it may complete directly from `confirmed`. A non-null auto-complete timer runs only when that check-in requirement is `false`. Changing either value changes the no-show denominator in [0009-analytics-definitions.md](./0009-analytics-definitions.md), so it is an analytics change as well as an operations change.
- **Payment (9, 10).** `deposit` charges the deposit at checkout and records the remainder as due at the venue. `full` charges the whole price. Deposit `percent` rounds **half up** to the nearest minor unit; the result is clamped to at least 100 minor units and at most the price minus 100.
- **Notice and horizon (13, 14).** Both are evaluated against the service/location timezone at the moment of the atomic write, not at the moment the slot list was rendered.
- **Hold TTL (16).** Bounds are platform-hard: 120 s is the floor because 3DS rarely completes faster; 1800 s is the ceiling because longer holds starve a same-day calendar. A confirmation succeeds only while the hold is valid (§15.4).
- **The hold TTL *is* the payment window (16).** The same 16 is the payment deadline: there is no separate payment-window policy and none may be added. The time a customer has to complete payment — card entry, 3DS challenge, bank redirect, all of it — is exactly the remaining `hold.ttl_seconds` on the hold the checkout is attached to. A tenant that needs longer raises `hold.ttl_seconds` within its platform bounds (120–1800 s); there is nothing else to raise. A second knob would let the two windows disagree, and every disagreement lands in the late-settlement path (24, 25), which is the expensive path.
- **Cancellation and refund (18, 22).** The cutoff governs who may cancel in the Client app; staff may cancel at any time (ADR-0007). The refund schedule is independent and is evaluated on `now()` at cancellation against scheduled start, using the snapshotted schedule (ADR-0006). Refund percentage applies to the amount actually captured. `refund.deposit_non_refundable = true` excludes the deposit from every tier.
- **Reschedule allowance (20, 21).** `reschedule.max_per_booking` counts **customer-initiated** reschedules only. A staff reschedule from the Dashboard never consumes the allowance and is never blocked by an exhausted one — staff moving a booking to cover a sick stylist is not the customer's fault. The guard reads the value **snapshotted onto the booking** (ADR-0006), not the currently configured one, so lowering the tenant setting does not retroactively strand a customer part-way through an allowance they were told they had.
- **Hold caps (17, 37).** Row 17 is three separate limits, not one: 3 concurrent holds per session, 3 per IP, and 3 per customer, each counted independently — not 3 across the three combined. Whichever limit binds first rejects the create, and the reason names the axis. Row 37 adds a per-tenant ceiling on top: 500 concurrent holds across the whole tenant, adjustable by platform operations and not exposed to tenants, so one tenant's traffic or scripted abuse cannot exhaust shared capacity (§15.4). Every count is of live, unexpired holds only; expiry frees capacity immediately with no sweep required.
- **Late settlement (24, 25).** Payment verified after the hold expired is processed from the durable payment attempt associated with the expired booking attempt; it never reopens that expired row. The system first re-attempts the identical allocation atomically. If it succeeds, it creates a new confirmed booking linked to the expired attempt. If it does not, `reallocate_then_refund` issues a full automatic refund and notifies the customer within 24 h; `reallocate_then_staff_resolve` opens a separate visible payment-exception task and, if unresolved after `payment.late_settlement_resolve_hours`, falls back to the full automatic refund. A customer-approved alternative likewise creates a new booking. Silent overbooking is never permitted (§15.4, §18.3).
- **No-show (26, 27).** A booking becomes `no_show` only by explicit staff action after `no_show.grace_minutes` past scheduled start. No job marks no-shows automatically. `forfeit_deposit` retains the captured deposit and issues no refund; charging beyond what was captured requires card-on-file and is Phase 2.
- **Check-in and corrections (28, 29, 38, 39).** Check-in is allowed inside the window and only from `confirmed`. Outside the window the action is never hidden — it is shown with the reason. A holder of `booking.check_in_override` (ADR-0007) may check in outside it only with a recorded reason. A holder of `booking.correct_status` may reverse an erroneous check-in, completion, or no-show within the snapshotted correction window; every correction records old state, new state, actor, reason, and timestamp. A correction that changes money also requires `refund.issue` and a separate ledger action.
- **Alternative request time (40).** A staff proposal does not replace the original request. It records a proposal with its own expiry and sends an intent-scoped customer link. Acceptance rechecks availability atomically and then follows the ordinary confirmation or fresh-payment-hold path; decline or proposal expiry returns the request to its original pending decision without extending `request.response_sla_hours`.
- **Staff deactivation (30).** A deactivation request immediately revokes login, blocks new allocation, and marks the staff/resource `deactivation_pending`; it never silently cancels a customer booking. `reassign_then_defer` attempts deterministic reassignment for every future booking. `defer_until_resolved` skips that automatic attempt. Under either value the resource cannot become inactive until every future booking has been reassigned, rescheduled, cancelled through its ordinary refund path, or explicitly resolved by an audited administrator action.

### Precedence when two scopes disagree

Policies fall into two classes and resolve differently.

1. **Override policies** — every row in the table above. Resolution is **most-specific-wins**, then clamped to platform bounds:

   `platform bounds (clamp)` ← `staff` → `service` → `location` → `tenant` → `platform default`

   Read right to left: start from the platform default, let each more specific scope that has a non-null value replace it, and clamp the result to the platform bounds. A value set at a scope deeper than the policy's declared scope is a configuration error, rejected at write time, not silently ignored.

2. **Constraint policies** — location opening hours and closures, staff weekly schedules, time off, holidays, maintenance blocks, and blackout periods. These are **intersected, never overridden**: the most restrictive wins, and no deeper scope can widen a shallower one. A staff schedule cannot open a closed location.

Worked precedence example: tenant sets `booking.minimum_notice_minutes = 60`; the "Downtown" location sets `240`; the "Colour treatment" service sets `120`; staff member Rana sets nothing. A Colour treatment with Rana at Downtown resolves to **120** — the service is more specific than the location. If the tenant wants Downtown to win, the value belongs on the services offered there, or Downtown's opening hours belong in a constraint policy. The resolver never maximizes or minimizes across scopes; that would be unpredictable to configure.

### Alternatives rejected

- **Ship with `TBD` and let each ticket choose.** Rejected: it guarantees three different refund calculations and violates SI-7 the first time a value is snapshotted.
- **Free-form tenant configuration with no platform bounds.** Rejected: a 6-hour hold or a 5-year horizon breaks availability for every other customer of that tenant, and the platform carries the support cost.
- **Most-restrictive-wins across all scopes.** Rejected: it makes a location's single conservative value silently override every service, and tenants cannot reason about why a slot disappeared.
- **A per-tenant policy scripting language.** Rejected: unreviewable, unsnapshotable, and Phase 2 at the earliest.

## Consequences

### Positive

- Tenancy, booking, payments, and customer-management tickets have no product behavior left to invent; every number they need is here with a scope and a bound.
- The resolver is one pure function over five scopes, unit-testable without a database, and reusable by the Client, the Dashboard, the availability query, and the snapshot writer — so all four agree by construction.
- Platform bounds make hostile or careless configuration non-catastrophic, and make availability performance predictable.
- Deterministic assignment (5) makes concurrency retries idempotent instead of picking a different resource on each attempt.
- Every policy is a named, versioned value, which is what ADR-0006 needs to snapshot and what disputes need to cite.

### Negative / cost

- Forty settings is a large configuration surface to build UI, validation, i18n copy, and seed data for; onboarding must present a small subset and hide the rest behind defaults.
- Most-specific-wins will surprise at least one tenant, who will expect a location's stricter value to win. Support cost, mitigated only by showing the resolved effective value and its source scope in the Dashboard.
- Bounds are judgement calls made before real usage; changing a bound after tenants have configured values requires a migration that clamps existing rows, and that migration will change some tenants' behavior.
- Deposit rounding, refund tiers, and tax treatment interact; the arithmetic needs its own test matrix in integer minor units, and floating point is forbidden anywhere near it.
- `round_robin` fairness depends on accurate offered hours and allocation states. Cancelled allocations do not contribute; changes to offered hours affect future ordering and never rewrite past allocations. The fairness metric in ADR-0009 will show drift.

## Revisit triggers

- A lighthouse tenant needs a policy this model cannot express at any scope, or asks for a value outside a platform bound.
- Measured no-show rate exceeds 10% of confirmed bookings, or cancellation rate exceeds 25%, over any rolling 30-day period for a tenant.
- Slot-hoarding is observed: expired holds exceed 30% of created holds over a rolling 7-day period.
- Late-settlement exceptions (24) exceed 0.5% of paid bookings in a month.
- A second currency, a non-decimal currency, or a jurisdiction with statutory cancellation rights enters scope (invalidates rows 11, 12, 22, 33).
- Group occurrences, waitlist, recurring series, or card-on-file enter a release — each adds policies this table does not have.
- Reassignment on staff deactivation (30) fails for more than 10% of affected future bookings.

## References

- [Architecture spec](../../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md) — §3.5 booking modes, §6 journeys, §7.1 booking state, §15 availability and booking correctness, §18.3 payment lifecycle, §30 decisions required
- [ADR-0002: Region, currency, and money representation](./0002-region-currency-and-money-representation.md)
- [ADR-0006: Policy snapshot rules](./0006-policy-snapshot-rules.md)
- [ADR-0007: Roles and capabilities](./0007-roles-and-capabilities.md) — `booking.check_in_override`
- [ADR-0009: Analytics definitions](./0009-analytics-definitions.md) — approval-rate and no-show denominators
- [Architecture overview](../architecture.md) · [Glossary](../glossary.md) · [Security and privacy](../security-and-privacy.md) · [Release scope](../release-scope.md)
- [ADR index](./README.md) · [References](../references.md)
