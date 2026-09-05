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

Staff profiles are tenant-owned records separate from memberships and connect to
services and locations through tenant-composite relationships. Resources have a
tenant-owned type, capacity-one/exclusive semantics for the MVP, service
requirements, and location assignments. Services declare fixed staff, customer
choice, any eligible candidate, or round-robin assignment. Anonymous access is
only the narrow candidate function and returns public names, IDs, and mode.
Administrative changes use live capability and location authorization.
Deactivation checks future held or confirmed allocations and requires
reassignment, cancellation, or deferral; the action writes actor,
effective-actor, request, reason, outcome, and a minimal redacted diff.
The staff/resource authorization helper is a narrow private security-definer
surface with pinned search path and an explicit authenticated grant, recorded
in the tenant schema contract.

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
