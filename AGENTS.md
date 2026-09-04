# Agent contract — White-Label Booking Platform (private source monorepo)

This is the **private source monorepo**, not a tenant instance repository. The
contract for a generated instance repo is different and is specified in
[`docs/instance-docs-contract.md`](docs/instance-docs-contract.md).

## Mission

Build and operate one multi-tenant booking platform delivered through three
applications — public **Client**, tenant **Dashboard**, private **Platform
Admin** — plus a sanitized white-label distribution of Client and Dashboard
only.

## Read before changing code

Read the relevant knowledge pack **completely** before your first edit. Start at
[`docs/README.md`](docs/README.md). At minimum, always read:

| You are changing | Read first |
| --- | --- |
| Anything | [`docs/README.md`](docs/README.md), [`docs/glossary.md`](docs/glossary.md), [`docs/engineering-rules.md`](docs/engineering-rules.md) |
| Product behavior or policy | [`docs/product-vision.md`](docs/product-vision.md), [`docs/release-scope.md`](docs/release-scope.md), [`docs/adr/README.md`](docs/adr/README.md) |
| Schema, RLS, RPCs, jobs | [`docs/architecture.md`](docs/architecture.md), [`docs/security-and-privacy.md`](docs/security-and-privacy.md) |
| UI, tokens, i18n, a11y | [`docs/design-system.md`](docs/design-system.md) |
| Distribution or instance config | [`docs/customization-boundaries.md`](docs/customization-boundaries.md), [`docs/upstream-updates.md`](docs/upstream-updates.md) |
| Deploys, backups, incidents | [`docs/runbooks.md`](docs/runbooks.md) |

The full specification remains authoritative:
[`WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md`](WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md).
The knowledge pack navigates it; it does not replace it. Where they disagree,
the specification and any Accepted ADR win — and you must fix the drifted doc in
the same change.

## Work from the issue tracker

Every unit of work is a numbered GitHub issue with acceptance criteria, required
verification, and an explicit `Blocked by` list. Do not start an issue whose
blockers are open. Do not silently widen an issue's scope; open a follow-up
issue instead. Milestones M0–M8 define the delivery order — see
[`docs/release-scope.md`](docs/release-scope.md).

## Safe change order

Two ladders. Use the one for the repository you are actually in. In both, stop
at the lowest rung that genuinely works, and say in the pull request why you had
to go higher.

**In this source monorepo.** There is no `instance/` directory and no extension
slot here, so the instance ladder below does not apply — every rung here exists
in this repository:

1. Reuse an existing package or helper.
2. Extend an existing module.
3. Add a new module inside an existing package.
4. Add a new package — requires the distribution-allowlist ADR
   ([`docs/adr/0011-distribution-allowlist-and-contract-versions.md`](docs/adr/0011-distribution-allowlist-and-contract-versions.md)),
   because a new package is a distribution decision, not just a directory.
5. Change a platform invariant (below) — requires an Accepted ADR.

**In a generated instance repository** (see
[`docs/instance-docs-contract.md`](docs/instance-docs-contract.md)):

1. Change configuration, content, tokens, or feature entitlements.
2. Use or extend a documented extension slot.
3. Change shared core only when 1 and 2 genuinely cannot work — and say why in
   the pull request.
4. Change a platform invariant (below) only via an Accepted ADR.

## Never do these

- Never place Platform Admin code, control-plane source, privileged workers,
  production migrations, or global billing logic anywhere that the white-label
  distribution can reach.
- Never author or run a database migration from a tenant instance repository.
  Migrations run only in the central platform pipeline.
- Never use a Supabase service-role key, provider secret, or admin credential in
  Client or Dashboard code.
- Never implement booking, capacity, price, or eligibility correctness in the
  browser. It belongs in atomic database functions.
- Never trust a hostname, URL parameter, form value, JWT user metadata, or
  hidden UI control as authorization.
- Never bypass RLS, booking RPCs, price calculation, idempotency, webhook
  signature verification, or payment reconciliation.
- Never commit secrets, real customer data, provider tokens, or production dumps
  to Git, tests, screenshots, logs, fixtures, or AI prompts.
- Never remove RTL, keyboard, focus, contrast, mobile, or error-state behavior.
- Never ship an English-only user-facing string.
- Never add a table without RLS and both a positive and a negative access test.
- Never install a dependency without checking license, maintenance, security,
  bundle impact, and whether an existing package already solves the need.
- Never state a compliance conclusion (PCI, PDPL, GDPR, SAMA, ZATCA). Write
  "requires independent legal review".

## Invariants

1. Every tenant-owned row carries `tenant_id`; every tenant-owned table has RLS
   enabled and tested in both directions.
2. All time and capacity allocation happens in atomic PostgreSQL functions or
   transactions, with idempotency keys on every externally retryable mutation.
3. Tenant, Brand, and Instance are distinct concepts and are never used
   interchangeably. See [`docs/glossary.md`](docs/glossary.md).
4. Only Client, Dashboard, and approved shared packages are distributed to an
   instance repository. The allowlist of approved packages lives in
   [`docs/adr/0011-distribution-allowlist-and-contract-versions.md`](docs/adr/0011-distribution-allowlist-and-contract-versions.md);
   adding to it or removing from it requires an Accepted ADR.
5. Existing bookings keep their snapshotted policy, price, tax, duration,
   buffers, consent text, intake schema, locale, and timezone. Later tenant
   edits never rewrite a booking that already exists.
6. Runtime entitlements from the control plane override local feature
   configuration.
7. English and Arabic are functionally equivalent; RTL is a semantic layout
   foundation, not a late skin.
8. Client and Dashboard are promoted and rolled back as a recorded logical pair
   under an N/N-1 contract.
9. Booking commits even when email, payment, or calendar providers are degraded,
   wherever business rules permit.

## Before handing off

**The only gate that runs in this repository today is
`bash scripts/check-docs.sh`** (relative links and anchors, specification
coverage map, secret-shaped strings, compliance claims, tenant/brand/instance
distinctness). Run it before every handoff that touches documentation, and
report its result.

The rest of the gate list — format, lint, typecheck, unit, RLS, concurrency,
contract, build, E2E, accessibility, localization, forbidden-import, and
config-validation — is planned, not present. Ownership per gate is in
[`docs/local-setup.md`](docs/local-setup.md#verification-commands). Run every
gate that exists.

**Gate-reporting rule: when a gate does not exist yet, record it in the handoff
report as `N/A — not yet implemented, owned by issue #N`.** Never report a
non-existent gate as passing, and never drop it from the report silently.

Then report:

- the behavior delivered and the issue it closes,
- the exact commands run and their results, plus every gate recorded as
  `N/A — not yet implemented, owned by issue #N`,
- assumptions made,
- current white-label / config / backend contract versions — read
  `whiteLabelVersion`, `configSchemaVersion`, and `backendContract` from the
  single committed file (`platform-contract.json` at the repository root)
  defined in
  [`docs/adr/0011-distribution-allowlist-and-contract-versions.md`](docs/adr/0011-distribution-allowlist-and-contract-versions.md).
  If that file does not exist in your working tree yet, report each value as
  `N/A — not yet implemented, owned by issue #N` rather than inventing one,
- remaining risks,
- preview or operational evidence.

If implementation clarified a durable product, security, operations, or
architecture decision, update the knowledge pack and add or amend an ADR in the
same pull request.
