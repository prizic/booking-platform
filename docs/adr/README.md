# Architecture Decision Records

Purpose: the index of architecture decision records (ADRs) and the rules for writing one.

Authoritative source: [the architecture spec](../../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md). An ADR records a decision made under that spec; it never silently contradicts it. If a decision does contradict the spec, say so explicitly in the ADR's Consequences.

## When an ADR is required

Write an ADR for any decision that is expensive to reverse or that someone six months from now would otherwise have to reverse-engineer from code.

An ADR is **REQUIRED** — not optional — for any decision that would change:

- **Tenant isolation** — who can read or write whose data, and where that boundary is enforced.
- **Booking atomicity** — how double-booking is prevented, and which layer owns the guarantee.
- **The distribution boundary** — what a white-label instance may change, and what stays upstream.
- **The merchant model** — who is merchant of record, who holds funds, and who carries refund liability.
- **English/Arabic parity** — anything that could leave one language a second-class experience.

A pull request touching one of these without a linked ADR should not be merged.

## Format

Every ADR carries these sections, in this order (see [the template](./0000-template.md)):

| Section | Contents |
| --- | --- |
| Owner | One named person accountable for the decision. Not a team, not "TBD" once accepted. |
| Status | `Proposed`, `Accepted`, or `Superseded`. |
| Date | ISO date (`YYYY-MM-DD`) of the last status change. |
| Context | The forces in play: constraints, requirements, what makes the choice non-obvious. Written so a newcomer needs no other document. |
| Decision | What was decided, in the active voice. The alternatives considered and why they lost. |
| Consequences | What this makes easy, what it makes hard, what it forecloses, what new work it creates. Include the bad consequences — an ADR with only upsides is unfinished. |
| Revisit triggers | The concrete, observable events that mean this decision must be reopened. Not "periodically". |

## Status lifecycle

```
Proposed ──► Accepted ──► Superseded
```

- **Proposed** — drafted and under review. Nothing depends on it yet.
- **Accepted** — agreed and in force. Code and other documents may rely on it.
- **Superseded** — replaced by a later ADR. The file is never deleted or rewritten; add a line at the top linking to the ADR that replaces it, and update the replacement's Context with what it supersedes.

ADRs are append-only history. Correcting a decision means writing a new one, not editing the old one.

## Numbering

Files are named `NNNN-kebab-title.md`: a zero-padded four-digit sequence number, then a lowercase hyphenated title. `0000-template.md` is the template and is not a decision. Numbers are allocated in order and never reused, including for abandoned drafts.

## Index

| ID | Title | Status | Owner | Date | Revisit trigger |
| --- | --- | --- | --- | --- | --- |
| 0001 | [Lighthouse vertical and v1 scope](./0001-lighthouse-vertical-and-v1-scope.md) | Accepted | @SEIFSEIF4 | 2026-09-04 | Lighthouse tenant changes, or a second vertical enters the first release |
| 0002 | [Region, currency, and money representation](./0002-region-currency-and-money-representation.md) | Accepted | @SEIFSEIF4 | 2026-09-04 | A second currency, a non-decimal currency, or a new launch region |
| 0003 | [Merchant of record and payments](./0003-merchant-of-record-and-payments.md) | Accepted | @SEIFSEIF4 | 2026-09-04 | Platform takes funds custody, a new provider is added, or a new payment jurisdiction is targeted |
| 0004 | [Guest-first booking and management links](./0004-guest-first-booking-and-management-links.md) | Accepted | @SEIFSEIF4 | 2026-09-04 | Accounts become mandatory, or a link-security incident or abuse pattern appears |
| 0005 | [Booking policy defaults](./0005-booking-policy-defaults.md) | Accepted | @SEIFSEIF4 | 2026-09-04 | A tenant needs a default the model cannot express, or no-show/cancellation rates breach agreed thresholds |
| 0006 | [Policy snapshot rules](./0006-policy-snapshot-rules.md) | Accepted | @SEIFSEIF4 | 2026-09-04 | A dispute turns on which policy applied, or policy versioning changes shape |
| 0007 | [Roles and capabilities](./0007-roles-and-capabilities.md) | Accepted | @SEIFSEIF4 | 2026-09-04 | Custom or per-tenant roles are requested, or a capability crosses the tenant isolation boundary |
| 0008 | [Privacy, retention, and support access](./0008-privacy-retention-and-support-access.md) | Accepted | @SEIFSEIF4 | 2026-09-04 | A new jurisdiction, a new data category, or a change to support impersonation |
| 0009 | [Analytics definitions](./0009-analytics-definitions.md) | Accepted | @SEIFSEIF4 | 2026-09-04 | A metric definition changes, or a reported number stops reconciling with the booking record |
| 0010 | [Deferred scope](./0010-deferred-scope.md) | Accepted | @SEIFSEIF4 | 2026-09-04 | Any deferred item is pulled into a release, or a customer commitment depends on one |
| 0011 | [Distribution allowlist, contract versions, and locale URLs](./0011-distribution-allowlist-and-contract-versions.md) | Accepted | @SEIFSEIF4 | 2026-09-04 | A package is added to or removed from the allowlist, the export check finds platform-only code in a distributed tree, or `backendContract` widens or narrows |
| 0012 | [Instance ownership and support tiers](./0012-instance-ownership-and-support-tiers.md) | Accepted | @SEIFSEIF4 | 2026-09-04 | A repository transfer is requested, a stated response target is missed twice in one quarter, or a voided tier is disputed |
| 0013 | [Tenant context and live authorization](./0013-tenant-context-and-live-authorization.md) | Accepted | @SEIFSEIF4 | 2026-09-05 | A cross-tenant test fails, custom roles replace fixed bundles, or a new surface cannot use the live-membership/audited-grant model |
| 0014 | [Catalog publication boundary and public DTO](./0014-catalog-publication-and-public-dto.md) | Accepted | @SEIFSEIF4 | 2026-09-05 | Custom roles, a new locale, multi-brand publishing, or booking snapshots need a new revision shape |

| 0015 | [Staff and resource assignment boundary](./0015-staff-and-resource-assignment-boundary.md) | Accepted | @SEIFSEIF4 | 2026-09-06 | Multi-resource services, custom roles, group capacity, or non-exclusive inventory changes the MVP model |
| 0016 | [Civil-time schedules and policy bounds](./0016-schedule-civil-time-and-policy-bounds.md) | Accepted | @SEIFSEIF4 | 2026-09-06 | A new schedule kind, policy bound, or DST interpretation is required |

Dates are `—` while status is `Proposed` and undated; set the date when the status changes.

## Related documents

- [Documentation index](../README.md)
- [Architecture overview](../architecture.md)
- [Glossary](../glossary.md)
- [Release scope](../release-scope.md)
- [Security and privacy](../security-and-privacy.md)
- [References](../references.md) — vendor and regulatory sources, all point-in-time
