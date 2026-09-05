# ADR-0014: Catalog publication boundary and public DTO

- **Status:** Accepted
- **Owner:** @SEIFSEIF4
- **Date:** 2026-09-05

## Context

Catalog authoring needs drafts, localized content, and safe previews while
anonymous discovery must never expose internal notes, intake definitions, or
authorization data. A live row-by-row read would also make cache invalidation
and historical booking snapshots ambiguous.

## Decision

Catalog entities use tenant-scoped rows and immutable localized revisions. A
published aggregate `catalog_publications` selects the active revision set.
Client discovery uses only `api_v1.get_public_catalog_v1`, resolved by a
verified Client hostname and locale; the DTO contains customer-facing service,
price, rule, and location fields plus a tenant/locale/publication cache tag.
Dashboard mutations require the live `catalog.edit` capability and location
scope, with AAL2 for approval-granted roles. Publication changes retire the
previous revision and create a tenant/locale-specific cache boundary.

## Consequences

Published rows cannot be edited in place, and authoring requires assembling a
complete revision set before publication. Public callers receive a small,
stable contract and cannot compose raw catalog tables. Booking work can later
copy the published service and policy fields into immutable booking snapshots.

## Revisit triggers

Custom roles, a new locale, multi-brand publishing, or booking snapshot fields
that cannot be represented by the published revision payload require reopening
this decision.

