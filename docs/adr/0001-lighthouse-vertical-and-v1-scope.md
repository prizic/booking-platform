# 0001. Lighthouse vertical and v1 scope

Purpose: lock which booking modes the first release sells, supports, and tests — and which are deliberately deferred.

Authoritative source: [the architecture spec](../../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md) §3.4, §3.5, §8.1, §8.2, §28.3, §30. This ADR does not depart from it.

- **Owner:** @SEIFSEIF4
- **Status:** Accepted
- **Date:** 2026-09-04
- **Supersedes / Superseded by:** —

## Context

The platform is a white-label booking product, and "works for every booking business" is a roadmap position, not an MVP acceptance criterion (§28.3). Every additional booking mode multiplies the availability, allocation, pricing, notification, and refund surface that must be built, translated into Arabic, made accessible, and tested for concurrency.

The forces in play:

- Spec §3.5 already grades booking modes by release. One-to-one appointments, exclusive-resource bookings, and request-to-book are MVP. Group occurrences, multi-resource services, recurring series, waitlists, and nightly inventory are not.
- Spec §3.5 also says the core must stay extensible: the group-capacity primitive is designed in now, and only its UI and operations are deferred. Retrofitting capacity into the allocation model later is a migration; leaving a `capacity` column unused is free.
- The delivery estimate in §28.2 (roughly 24–34 weeks to a credible v1) explicitly assumes group classes are out. Adding them moves the estimate.
- Acceptance testing capacity is finite. §3.5 requires that MVP acceptance testing cover only the modes explicitly sold, so "sold" and "tested" must be the same list.
- Ambiguity here is expensive downstream: the implementers of tenancy, booking, payments, and customer management (issues in §32 build order 3–11) cannot invent product behavior mid-build.

## Decision

1. The first release sells exactly three booking modes: **one-to-one appointment**, **exclusive-resource booking**, and **request-to-book** (the last as an optional per-service setting, not a separate product).
2. Every bookable unit in v1 has an effective capacity of exactly 1. A confirmed allocation for a resource and time range excludes every other allocation for the same resource and overlapping range, buffers included.
3. Request-to-book creates a booking in `requested` state, never `confirmed`. Whether a request holds capacity is an explicit per-service setting with a recorded default; it is never implicit.
4. Supported lighthouse examples — the ones onboarding material, demo data, and acceptance tests must cover — are: professional consultations, salon and barber services, treatment and therapy rooms, sports courts, studios and rehearsal spaces, and vehicle or equipment rental.
5. **Group occurrences (capacity greater than 1) are excluded from v1.** No Client UI, no Dashboard UI, no attendee-level operations, no notifications, no reports, and no acceptance tests for them ship in the first release.
6. The capacity primitive is nonetheless built into the schema and allocation functions from the start, per §3.5 and §28.3: a `capacity` column, atomic decrement semantics, and allocation counting exist and are unit-tested at `capacity = 1`. Its UI and operations ship in Phase 2 under issue #42.
7. Group occurrences are represented in v1 as an **entitlement column only** — a per-tenant entitlement field, `false` for every tenant, with **no runtime behavior attached to it**. No code path reads it to decide what to render, what to allocate, or what to charge, so setting it reveals nothing and enables nothing. It exists so issue #42 has a column to wire up rather than a migration to run. It is deliberately not a feature flag over a working hidden feature: [ADR-0010](./0010-deferred-scope.md) forbids shipping working-but-hidden functionality, and a flag that gates one is that functionality.
8. Booking lifecycle actions in v1 are: create, reschedule, cancel, check-in, complete, and no-show (§8.1). No other terminal or intermediate state is exposed to tenants.
9. **"Supported" means all six of the following are true.** A mode or example that fails any one of them is not supported, regardless of whether the code technically runs:
   1. Configurable from the Dashboard by a tenant administrator with no code edit and no platform intervention.
   2. Covered by automated acceptance tests, including the concurrency cases in §24.3.
   3. Complete in both English and Arabic, including RTL layout, per §31.
   4. Passing the agreed WCAG 2.2 AA review for its Client and Dashboard surfaces.
   5. Covered by a named support runbook for its common failure and recovery states.
   6. Present in tenant onboarding material and demo data.
10. Also deferred, and named here so no implementer treats them as in-scope: multi-resource services, recurring series, waitlists, packages, memberships, coupons, gift cards, credits, and multi-day or nightly inventory (§8.2, §8.3).
11. A prospective tenant requirement that needs a deferred mode does not pull that mode into v1. It is recorded in the commitment register of [ADR-0010: deferred scope](./0010-deferred-scope.md) as a Phase 2 commitment, with the issue that owns it.
12. Any pull request that adds Client or Dashboard surface for a deferred mode is out of scope for v1 and must be rejected at review, not merged behind a flag.

Alternatives considered:

- **Ship group classes in v1 too.** Rejected: it adds attendee-level capacity, partial cancellation, per-attendee refunds, waitlist pressure, and roster operations — a materially larger test surface (§28.2) for a segment that is not the lighthouse.
- **Defer the capacity primitive entirely and add it in Phase 2.** Rejected: it turns Phase 2 into a data migration of the allocation model, the single most concurrency-sensitive part of the system (§15.3).
- **Sell all modes and mark some "beta".** Rejected: "beta" in a white-label product still generates tenant support load, Arabic strings, and refund disputes, without the acceptance-test coverage that makes them safe.

## Consequences

### Positive

- The availability and allocation engine only has to be correct for one invariant in v1 — no overlap on an exclusive resource — which is the case §24.3 tests hardest.
- MVP acceptance criteria are enumerable: three modes, six lifecycle actions, six supported example verticals.
- English/Arabic parity and WCAG 2.2 AA are achievable within the phase budget because the surface is bounded.
- Phase 2 group work is additive (UI and operations over an existing primitive), not a schema rewrite.

### Negative / cost

- Prospects whose core offering is classes or workshops cannot be sold v1. Sales needs a stated qualifying question and a Phase 2 answer.
- The unused `capacity` column and its counting logic carry maintenance and review cost for a release that never exercises them above 1.
- The entitlement column has no reader in v1, so nothing exercises it and nothing would catch it being wrong; issue #42 has to wire it up and write its first test in the same change.
- Deferring multi-resource services means tenants who need "staff + room" must model it as one exclusive resource, which loses reporting fidelity and will need migration in Phase 2.

## Revisit triggers

- The signed lighthouse tenant states a launch-blocking requirement for group occurrences before production sign-off.
- A second vertical is added to the first release scope by an approved change to [release scope](../release-scope.md).
- Issue #42 is scheduled into an active phase, at which point clauses 5–7 are superseded by that ticket's ADR.
- Production booking data shows any allocation created against a bookable unit with capacity greater than 1.
- More than one in four qualified pipeline opportunities is disqualified solely by the group-class exclusion.
- Any of the six "supported" conditions in decision 9 is knowingly waived for a shipped mode.

## References

- [Architecture spec](../../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md) §3.4, §3.5, §8.1, §8.2, §8.3, §15.3, §24.3, §28.2, §28.3, §30, §31
- [Architecture overview](../architecture.md)
- [Glossary](../glossary.md) — service, resource, occurrence, allocation, hold
- [Release scope](../release-scope.md)
- [ADR-0010: deferred scope](./0010-deferred-scope.md) — Phase 2 commitment register
- [Security and privacy](../security-and-privacy.md)
- [References](../references.md) — vendor and regulatory sources, all point-in-time
- [ADR index](./README.md)
- GitHub issue #2 (this decision), issue #42 (Phase 2 group occurrences)
