# ADR-0017: Availability contract and advisory semantics

- **Status:** Accepted
- **Owner:** @SEIFSEIF4
- **Date:** 2026-09-06
- **Supersedes / Superseded by:** —

## Context

Client and Dashboard need the same public slot semantics without receiving raw
schedules, time-off reasons, conflicting bookings, customer data, or calendar
provider details. Availability composes mutable inputs, so a displayed slot can
become stale before a hold is written. The first release supports one-to-one and
exclusive-resource booking, while group capacity, multi-resource allocation,
packages, memberships, and two-way calendars remain deferred by ADR-0010.

The `availability_v1` name and TypeScript placeholder were reserved before a
database RPC was published. Issue #10 therefore completes that reserved v1
contract without widening the backend contract range in `platform-contract.json`.

## Decision

1. `AvailabilityV1Request` is an exact, versioned input containing locale,
   service, location, optional staff preference, party size, display timezone,
   and canonical UTC start/end bounds. The end must follow the start, the window
   is at most 31 days, party size is 1–50, and unknown fields are rejected.
   Runtime availability for the MVP rejects or returns no capacity for party
   sizes unsupported by the published capacity-one offer; validation never
   implies that group capacity is implemented.
2. A response contains at most 500 half-open UTC slots, the requested display
   timezone, the service/location timezone, an optional public staff ID, an
   allocation kind limited to `appointment` or `exclusive_resource`,
   `advisory: true`, and a coarse no-slot reason. Resource allocation IDs remain
   private. Empty results require one of
   `outside_booking_window`, `policy_restricted`, `no_matching_availability`, or
   `capacity_unavailable`; non-empty results carry no reason.
   Interchangeable exclusive resources yield one public offer per start/end
   pair with rank 1. Appointments retain separate offers for each public staff
   ID. Issue #11 selects the actual resource during atomic booking revalidation;
   an availability offer never identifies or reserves that resource.
3. Public responses never identify a conflicting booking or customer and never
   reveal private schedule, time-off, maintenance, fairness, or provider detail.
   Operator diagnostics use a separately authorized surface rather than widening
   the public DTO.
4. Availability intersects published catalog rules, eligible active candidates,
   civil-time schedules and exceptions, policy bounds, buffers, and active
   allocations. Candidate intervals and allocations are half-open. A candidate
   survives only when its buffered occupied interval does not overlap a blocker.
   Slot starts align to the location's civil-time grid independently of request
   bounds. Fold identity is computed before window, notice, and interval filters;
   the bounded grid includes 28 hours of context on each side to retain repeated
   civil times. All context points count toward the 250,000 candidate/grid work
   limit, and only candidates inside the requested bounds reach schedule checks.
   A slot's fold describes its start; buffered location and subject starts have
   their own folds for matching schedule exceptions.
   Opening containment and break overlap checks walk the occupied UTC minutes and map each to the
   relevant scope's local weekday/minute, preserving half-open boundaries across
   repeated hours. Every minute must be open in both the location and subject
   scopes; date exceptions replace that date's weekly openings and retain their
   occupied-start fold selection. Existing duration and offset constraints bound that walk.
   The exposed RPC declares the two-second statement timeout so PostgREST can
   hoist it to the request transaction; a private-helper setting alone is not
   sufficient for that enforcement.
5. Availability may use a short tenant-aware cache. Keys include tenant, locale,
   publication, configuration, feature-entitlement, schedule, and allocation
   revisions. The database projection owns revision inputs; callers may not cache
   when any required discriminator is unavailable. Results are advisory even on
   a cache hit. Issue #11 owns the atomic hold and transactional revalidation that
   can reject a stale slot safely.
   Availability revision rows remain private: application roles have neither
   CRUD grants nor permitting RLS policies. Explicit deny policies cover every
   operation, while approved private triggers initialize and advance revisions.
6. Because ADR-0010 defers two-way calendar connections to issues #46 and #47,
   v1 reports provider health as `not_applicable` and reads no external busy
   state. It does not claim that a disconnected calendar has been checked.
   Adding blocking calendars or an unhealthy-connection policy requires reopening
   ADR-0010 and this ADR.
7. Deferred group occurrences, multi-resource services, customer plans/packages,
   and runtime entitlements fail closed when the current data model cannot prove
   eligibility. Reserved DTO discriminants are not evidence those modes work.

### Alternatives rejected

- **Return detailed exclusion reasons.** Rejected because reasons can reveal a
  staff member's time off, another customer's booking, or provider state.
- **Treat an availability response as a reservation.** Rejected because only an
  atomic allocation write can prevent races.
- **Build calendar health placeholders backed by local configuration.** Rejected
  because they would imply a sync guarantee ADR-0010 explicitly defers.
- **Widen the backend contract for the completed placeholder.** Rejected because
  no deployed RPC shape is being replaced and the paired applications currently
  support backend contract 1 only.

## Consequences

### Positive

- Client and Dashboard can validate one shared, privacy-safe contract.
- Query and response cost have explicit upper bounds.
- Timezone labels and no-slot recovery states are stable across English and Arabic.
- Deferred integrations cannot silently weaken availability correctness.

### Negative / cost

- A 31-day query limit may require the UI to page through longer horizons.
- Coarse public reasons provide less diagnostic detail than operators may want.
- Cache implementations need explicit schedule and allocation revision sources;
  until those exist, correct implementations must skip caching.
- Provider health remains unavailable in v1 even though the long-term composition
  model includes external busy periods.

## Revisit triggers

- A measured customer journey needs a window longer than 31 days or more than
  500 returned slots.
- Issue #11 cannot revalidate the completed v1 slot identity without changing
  its shape.
- Issues #42, #45, #46, #47, or #48 activate a deferred availability dimension.
- A privacy review finds that a public reason or assignment identifier permits
  sensitive inference. Resource allocation identifiers remain private.
- The backend contract range widens or a previously deployed v1 RPC must change.

## References

- [Architecture specification](../../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md) — §5.1–§5.2, §6.1, §13.3–§13.6, §14.5–§14.6, §15.1–§15.8, §19, §24–§25
- [ADR-0010: Deferred scope](./0010-deferred-scope.md)
- [ADR-0011: Distribution allowlist and contract versions](./0011-distribution-allowlist-and-contract-versions.md)
- [ADR-0013: Tenant context and live authorization](./0013-tenant-context-and-live-authorization.md)
- [ADR-0014: Catalog publication boundary](./0014-catalog-publication-and-public-dto.md)
- [ADR-0015: Staff and resource assignment boundary](./0015-staff-and-resource-assignment-boundary.md)
- [ADR-0016: Civil-time schedules and policy bounds](./0016-schedule-civil-time-and-policy-bounds.md)
