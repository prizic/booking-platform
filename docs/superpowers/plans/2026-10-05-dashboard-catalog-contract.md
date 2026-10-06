# Dashboard catalog authoring contract — Tasks 8–9

The existing localized revision tables and aggregate publication remain the
owners. Add a narrow authoring workspace, save-draft, publish-workspace, and
retire contract. No public draft endpoint or browser-owned pricing is added.

- Save is authorized from live `catalog.edit`. Full create/pricing/relations and
  publication require direct tenant scope. Approval-granted scoped operators
  may change content on an existing entity only when every affected location is
  permitted; protected financial fields and relations remain unchanged.
- Each entity has a staged metadata head (key, relations, assignment, sort order,
  timezone) alongside the existing immutable bilingual content revisions. Draft
  metadata never changes the live service/location. Compare-and-swap uses the
  returned head revision; UUID request IDs provide durable replay/mismatch checks.
- Publication is serialized per tenant and reviews every submitted draft head
  revision. It materializes staged metadata and assembles a complete aggregate,
  copying unchanged published locale revisions into the new aggregate. Publishing
  one edit cannot silently drop other offerings. English/Arabic content,
  tenant/location links, first-release capacity, money, policy/intake, assignment,
  timezone and legal/consent references are validated before commit.
- Retirement changes future catalog visibility through the publication operation;
  it never rewrites committed booking snapshots or allocations. A category still
  used by an active service cannot be retired.
- Workspace output contains explicit editor fields and named authorized choices.
  It omits internal staff notes, customer/intake answers, credentials, and provider
  data. Anonymous discovery remains `get_public_catalog_v1` only.
- Required tests: draft invisibility; admin success; cross-tenant/scoped/stale
  refusal; publication parity and preservation; malformed references/money/time;
  unchanged historical snapshots; idempotency replay/mismatch; audit redaction.

Migration application, generated types and executable evidence are queued for
the single final campaign. This document does not claim those checks passed.
