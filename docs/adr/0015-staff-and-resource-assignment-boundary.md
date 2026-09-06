# ADR-0015: Staff and resource assignment boundary

- **Status:** Accepted
- **Owner:** @SEIFSEIF4
- **Date:** 2026-09-06

## Context

Catalog services need operational staff and exclusive resources, but Auth
memberships are identity and authorization records, not the public profile of a
person. A customer must not receive internal notes or inactive candidates.
Future allocations also make deactivation a state transition rather than a
boolean toggle.

## Decision

Staff profiles are tenant-owned records separate from memberships. A staff
member's exact bookable eligibility is the tenant-composite tuple of staff,
service, and location; the tuple must also reference a published service/location
pair before it can appear to a customer. Resources have a tenant-owned type,
capacity-one/exclusive semantics for the MVP, service requirements, and exact
location assignments. An allocation carries its service and location identity
so a reassignment can prove that the replacement remains eligible.

Services declare `fixed_staff`, `customer_choice`, `any_available`, or
`round_robin`. Fixed staff references one same-tenant staff profile.
Round-robin candidates are ordered by confirmed/completed assignment count
divided by offered hours, then oldest most-recent assignment (`NULL` first),
then staff UUID. The returned rank is deterministic and public; the inputs are
operational data and are not returned. This list remains advisory until the
booking kernel rechecks and allocates atomically.

Anonymous access is only the narrow candidate function and returns public
names, IDs, mode, and rank from the current aggregate publication. Raw staff,
resource, eligibility, allocation, and audit tables have no anonymous grants.
Every exposed `api_v1` function is `SECURITY INVOKER`. A wrapper may call a
narrow private `SECURITY DEFINER` helper only when that helper has an empty
search path, fully qualified objects, default execute revoked, and either an
explicit live authorization check or a public-safe projection.

Administrative changes use live capability and exact location authorization.
A location manager may change only staff/service/location or resource/location
eligibility inside an assigned location; tenant-wide profile changes and
deactivation remain tenant-administrator actions. Direct table mutations are
not an application API.

Deactivation locks the target, checks future held or confirmed allocations, and
requires reassignment, cancellation, or deferral. Staff replacements must be
eligible for every affected service/location tuple. Resource replacements must
be active, satisfy every affected service requirement, and be assigned to every
affected location. A platform-generated request ID is serialized in the
database and stored with a normalized payload hash: same key and payload returns
the original result, while a changed payload fails with
`idempotency_conflict`. Every administrative action writes actor, effective
actor, request, reason, target, outcome, and a redacted before/after diff that
includes the affected allocation count and replacement ID but never internal
notes.

## Consequences

Composite keys reject cross-tenant links even for privileged migration code, and
internal notes cannot leak through the public contract. The shared allocation
ledger gives booking work a stable tenant-safe parent for later hold and booking
issues. Round-robin selection still requires the availability/booking kernel to
apply deterministic offered-hours weighting at selection time.

## Revisit triggers

Multi-resource services, custom roles, group capacity, or non-exclusive
inventory changes this MVP model; those changes require an ADR and must preserve
public DTO minimization and tenant-composite constraints.
