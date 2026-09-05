# ADR-0013: Tenant context and live authorization

- **Status:** Accepted
- **Owner:** @SEIFSEIF4
- **Date:** 2026-09-05
- **Supersedes / Superseded by:** —

## Context

The platform uses one shared Supabase project per environment. A request can carry several plausible tenant signals: the requested hostname, an instance mapping, a tenant-selection cookie or form value, and an authenticated user's memberships. Those signals answer different questions. A hostname selects branding and routing, while only current database state can establish whether an authenticated actor may read or change tenant data.

This distinction matters most for a user who belongs to two tenants, a user whose membership was revoked while their Auth session remains valid, and a location-scoped user who guesses an object outside their assigned locations. Treating any routing signal or long-lived claim as authority would make each scenario a cross-tenant access path. RLS alone is also insufficient when the schema permits a privileged process to create a relationship whose parent belongs to another tenant.

The first tenant-isolation slice must establish a durable model without pulling catalog, booking, support-operation, Storage, or Realtime product surfaces forward from their owning issues. It must preserve the fixed v1 capability bundles in [ADR-0007](./0007-roles-and-capabilities.md), the support constraints in [ADR-0008](./0008-privacy-retention-and-support-access.md), and the existing backend contract range in [ADR-0011](./0011-distribution-allowlist-and-contract-versions.md).

## Decision

1. **Hostname is routing context, never authorization.** The server canonicalizes exactly one hostname, resolves only an active verified domain for the requested application surface, and obtains its Tenant, Brand, Instance, deployment state, and published revision. Missing, malformed, preview, ambiguous, inactive, and unverified mappings fail closed. Forwarded host values are accepted only through an explicit trusted deployment adapter; a query parameter or arbitrary forwarded header is never a production tenant switch.

2. **Authentication and authorization remain separate.** Supabase Auth identifies the actor through verified claims from a fresh request-scoped SSR client. The application never authorizes from `getSession()`, JWT user metadata, a hidden control, a host, or a stored tenant preference. An explicit tenant selection is an untrusted selector that every database operation re-authorizes.

3. **Live membership is the authority.** Every protected read and mutation resolves the actor's current active membership, tenant-owned role, fixed capability grants, and location scope from the database. Revocation or suspension takes effect immediately even while the Auth session remains valid. A location-bound authorization request without a location fails when the membership is location-scoped.

4. **Tenant ownership is structurally represented.** `tenants` is the global identity root and the capability vocabulary is an immutable global catalog. Every tenant-owned child, including roles, role-permission bundles, memberships, location scopes, invitations, settings, domains, instances, brand revisions, and audit records, carries `tenant_id NOT NULL`. Tenant parents expose `(tenant_id, id)` candidate keys and children use composite foreign keys so even privileged code cannot create a cross-tenant relationship. The fixed v1 roles are copied per tenant and are not tenant-editable; issue #50 may later add custom bundles without changing membership references.

5. **The database is the final isolation boundary.** Tenant-owned tables use RLS, least-privilege grants, separately named operation policies, and `USING` plus `WITH CHECK` where applicable. `app` and `private` remain outside the Data API. Exposed views are security-invoker. Any recursion-breaking definer helper lives only in `private`, uses an empty search path and fully qualified names, derives the actor from `auth.uid()`, performs explicit checks, has default execute revoked, and receives only narrow grants.

6. **Applications consume narrow versioned DTOs.** `api_v1` exposes only the minimum public domain resolution, current actor tenant choices, and selected Dashboard context required by this slice. Anonymous callers can resolve published public context but cannot read memberships, settings, or normalized tenant tables. Caller-supplied tenant and instance identifiers can narrow a request but never expand access. This completes the reserved v1 contract and does not widen `backendContract`.

7. **Authenticated Dashboard responses are private.** A Dashboard render creates its Supabase client inside the request, verifies identity, resolves routing context, requires an explicit valid membership selection, and calls the narrow API. Auth-bearing responses are dynamic and `private, no-store`; they never use a shared Next.js or CDN data cache. Any future cache key for public tenant data must include tenant ID, locale, published revision, configuration revision, and feature-entitlement revision.

8. **Sensitive-access foundations fail closed.** Verified AAL and recent-auth information may be carried to a narrow authorization helper, but the first slice does not claim to deliver MFA enrollment, Platform Admin access, or support impersonation. It exposes no worker-facing tenant operation or credential; Supabase's `service_role` remains an explicitly trusted RLS-bypass boundary and is not mislabeled as an isolated worker role. A later worker operation must assert Tenant, use its own narrow RPC, be idempotent, and write audit evidence. Platform operators, support actors, Storage, and Realtime receive no implicit tenant-data access. Their real audited operations remain owned by later issues.

### Alternatives rejected

- **Authorize from the resolved hostname.** Rejected because a host proves which brand was requested, not that the actor belongs to that tenant; changing hosts would become a privilege change.
- **Put tenant roles and permissions in JWT claims.** Rejected because a revoked user would retain authority until token expiry and location or capability edits would not take effect immediately.
- **Use one implicit “current tenant” for multi-tenant users.** Rejected because stale browser state can silently execute a mutation against the wrong tenant. Selection is explicit and remains subject to live authorization.
- **Rely on RLS without composite tenant foreign keys.** Rejected because service workers and migration code can bypass RLS; malformed cross-tenant relationships must be unrepresentable even under privileged SQL.
- **Expose normalized `app` tables and let clients compose joins.** Rejected because it expands the public contract, complicates grant review, and makes nested-leak behavior dependent on every caller.
- **Enable Storage and Realtime now to test them.** Rejected because their product policies belong to later issues. This slice proves the placeholder state is disabled and grants nothing rather than creating an unowned live surface.

## Consequences

### Positive

- Changing a hostname, tenant selector, or JWT metadata cannot grant access; every path converges on live membership and RLS.
- Composite keys provide defense in depth for privileged jobs and future migrations, not only browser-originated requests.
- The public API is small enough to enumerate and test, while normalized and private schemas remain implementation details.
- Revocation, role changes, and location-scope changes take effect without waiting for session expiry.
- Per-tenant fixed roles make Phase 2 custom roles additive instead of requiring a membership-schema replacement.

### Negative / cost

- Fixed role bundles are duplicated per tenant and provisioning must create them transactionally before inviting members.
- Every new tenant-owned relationship needs both an ordinary foreign key decision and an explicit composite-tenant constraint, increasing migration and fixture work.
- Live authorization adds database reads to protected requests; indexes and policy plans must be measured as the data set grows.
- Multi-tenant users must make an explicit choice and may be redirected to the selected tenant's verified Dashboard domain, which adds friction but prevents confused-brand execution.
- Security-definer helpers become a small privileged surface that requires dedicated grant, search-path, and behavior tests.
- Support, worker, Storage, Realtime, and full MFA workflows remain deliberately unavailable; this ADR records default denial at the application contract and treats `service_role` as a privileged trust boundary, not delivery of those features.

## Revisit triggers

- Issue #50 introduces custom roles or approval workflows and the fixed per-tenant bundle representation cannot express them without replacing membership references.
- A tenant requires a dedicated Supabase project and the shared-schema membership/RLS model cannot preserve identical API behavior across deployment modes.
- Measured RLS or live-capability policy cost breaches the database latency budget after representative indexes and query-plan fixes.
- A supported deployment platform cannot provide one trustworthy canonical host signal without accepting ambiguous client-controlled forwarded headers.
- Storage, Realtime, support access, or service-worker issues require a tenant authority that cannot be expressed through the same live membership or explicit audited-grant model.
- A verified cross-tenant test fails for an identifier, nested relationship, cache response, or privileged composite insert.

## References

- [Architecture spec](../../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md) — §4, §9.2, §13.2–§13.5, §14.1–§14.5, §22.1–§22.4, §24.2
- [ADR-0007: Roles and capabilities](./0007-roles-and-capabilities.md)
- [ADR-0008: Privacy, retention, and support access](./0008-privacy-retention-and-support-access.md)
- [ADR-0011: Distribution allowlist, contract versions, and locale URLs](./0011-distribution-allowlist-and-contract-versions.md)
- [Architecture overview](../architecture.md)
- [Security and privacy](../security-and-privacy.md)
- [Engineering rules](../engineering-rules.md)
- [ADR index](./README.md)
