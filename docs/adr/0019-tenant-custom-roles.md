# ADR-0019: Tenant custom roles

- **Status:** Accepted
- **Owner:** @SEIFSEIF4
- **Date:** 2026-10-07
- **Supersedes / Superseded by:** — (amends [ADR-0007](./0007-roles-and-capabilities.md), [ADR-0010](./0010-deferred-scope.md) and [ADR-0013](./0013-tenant-context-and-live-authorization.md))

## Context

[ADR-0007](./0007-roles-and-capabilities.md) fixed the tenant roles as four bundles of named capabilities (Tenant admin, Location manager, Scheduler, Staff) and [ADR-0010](./0010-deferred-scope.md) deferred "Custom roles and approval workflows" to Phase 2 (#50), because tenant-defined roles make the RLS matrix unbounded. On 2026-10-07 the owner decided to bring the **custom roles** half forward: businesses want to give a front-desk person check-in without cancellation, or a scheduler everything except catalog edits, and "use the next role up" over-grants (ADR-0007, Negative).

The ground was mostly ready. Roles and their grants are already per-tenant rows (`app.roles`, `app.role_permissions`) over the global `app.permissions` vocabulary, and about twenty SQL checks plus every Dashboard page authorize **by capability, never by role name** (the ADR-0010 seam). Exploration also found gaps that custom roles would turn into security holes:

- Nothing stopped a member with `staff.manage` from assigning a more powerful role than their own; only `tenant_admin` was special-cased.
- New tenants received no roles at all; only seed and fixtures created them, contradicting ADR-0013 §4.
- The last-administrator and step-up rules compared the string `'tenant_admin'`, and `roles.key` had a CHECK listing the four keys.
- `location_scope_mode` was effectively unused: a member with no location rows silently saw the whole tenant.
- The Dashboard's live re-check noticed revocation, but not a role losing permissions.
- An N-1 Dashboard threw on any capability name it did not know, so adding a permission would have taken every Dashboard offline.

The scope is narrow on purpose: roles are **tenant-local**, defined and used inside one tenant's Dashboard. There is no Platform Admin roles feature and operator roles are untouched.

## Decision

We let each tenant define its own roles as bundles of the existing capabilities, keep the four built-in roles fixed and locked, and enforce every rule in the database.

1. **Tenant-local rows.** A custom role is an `app.roles` row with `tenant_id`, a server-generated key `custom_<16 hex>`, an English and an Arabic name (1–80 characters each, unique among the tenant's active roles), optional descriptions, a location-scope mode, a revision, and an archive time. Its grants are `app.role_permissions` rows. RLS isolates both per tenant and is tested in both directions and across tenants.
2. **Built-ins are locked but duplicable.** The four built-in roles are installed per tenant from platform templates by `private.install_builtin_roles_v1`, which `control_plane.create_tenant_v1` calls and a one-time backfill runs for existing tenants. Their grants equal the template (a pgTAP drift test proves it); no RPC edits or archives them (`role_locked`). A tenant may duplicate one and edit the copy.
3. **`role.manage`** is a new capability, held only by the built-in Tenant admin (approval grant, tenant scope). Saving or archiving a role requires it **and** recent MFA (`step_up_required`). It cannot be delegated.
4. **Reserved permissions.** A custom role may hold any capability except the owner-level ones: `role.manage`, `billing.view`, `billing.change_plan`, `support.grant_access`, `tenant.owner_transfer`, `tenant.read_other_tenant` (`reserved_permission`). A trigger on `app.role_permissions` enforces it, so even privileged SQL cannot attach one to a custom role.
5. **No escalation (dominance).** An actor may create, change, assign or remove a role only when they dominate every grant involved. One grant covers another when the permission is the same, the scope is at least as wide (tenant > location > own), and the kind is at least as strong (direct covers direct and approval; approval covers approval only). When the actor's covering grant is not tenant-scoped, the target member's locations must be a subset of the actor's. This applies on role save and duplicate, on invitation, and on membership edits — to both the new role and the member's current role, so nobody can demote someone above them. `escalation_denied` is the refusal.
6. **Scope semantics fail closed.** A `tenant`-mode role reaches every location and carries no location-scoped grants; an `assigned`-mode role reaches only the member's location rows and carries no tenant-scoped grants; own-scoped grants are allowed in both. An assigned-mode member with no location rows now sees **nothing**. The migration first gives every active assigned-mode member without location rows a row for each active location of their tenant, so today's effective access is unchanged (counted in the migration, proven in pgTAP).
7. **Administrator is a capability, not a name.** "Administrator" means an active member whose role holds `role.manage` at tenant scope. The last-administrator guard and the step-up rule for administrator changes use that definition instead of the key `tenant_admin`. A role key string is used only to identify built-ins for locking and labels.
8. **Every mutation is safe to retry and race.** `save_role_v1` and `archive_role_v1` lock the tenant row, check the capability and recent MFA, are idempotent on `request_id` (replay returns the stored result; a different payload is `idempotency_conflict`), compare an expected revision (`revision_conflict`), append to `app.role_change_events`, and broadcast `authorization_changed` on the tenant topic. Archiving a role still used by members or pending invitations is refused (`role_in_use`); switching a role to `assigned` while a member has no locations is refused (`role_scope_in_use`).
9. **Live re-authorization.** The Dashboard fingerprints the actor's effective access (sorted capabilities, scope mode, location ids, role id) and refuses and refreshes when it changes — not only when the membership disappears.
10. **Contracts are additive.** `get_role_catalog_v1`, `list_roles_v1`, `save_role_v1`, `archive_role_v1` and `get_staff_access_workspace_v2` are new. `get_staff_access_workspace_v1` keeps returning built-in roles only for N-1 Dashboards. Clients skip well-formed capability names they do not know; that tolerance ships before the migration. `@wlbp/api-contracts` mirrors the coverage and dominance rules only so the UI can disable choices; the server stays authoritative.

Approval workflows (configurable approval chains) stay deferred under #50; every approval grant is still satisfied by step-up as in ADR-0007.

### Alternatives rejected

- **Keep fixed roles until #50.** Rejected by owner decision on 2026-10-07; over-granting through "the next role up" is itself a risk.
- **Editable built-ins.** Rejected: a tenant could quietly widen Staff for every member, and the drift test and N-1 contract would lose their fixed reference. Duplication gives the same flexibility without that.
- **Let `staff.manage` holders define roles.** Rejected: defining a bundle is a broader power than assigning one; `role.manage` with step-up keeps it with the owner.
- **Check escalation in the Dashboard only.** Rejected: UI state is a courtesy, never a control (ADR-0007); a crafted RPC call would bypass it.
- **Treat zero location rows as "all locations".** Rejected: it fails open, and custom assigned-mode roles would inherit the whole tenant by accident.
- **Free-form role keys.** Rejected: a person-chosen key invites code to branch on it. Server-generated keys keep authorization on capabilities.

## Consequences

### Positive

- Tenants can express the role they need instead of over-granting.
- Escalation, reserved permissions, built-in locking and last-administrator are enforced in one place, under concurrency, with append-only evidence.
- New tenants now get their built-in roles at creation, closing the ADR-0013 gap.
- Location scope now fails closed, which also hardens the four built-in roles.

### Negative / cost

- The authorization matrix is no longer finite in roles. Tests cover grant **shapes** (permission × scope × kind) through a data-driven pgTAP matrix plus a shared truth table (`roleCoverageCases` in `@wlbp/api-contracts`), not every possible role.
- Every staff-access path gains dominance and scope checks; mistakes there are privilege-escalation bugs, so the SQL needs independent review before release.
- An assigned-mode member who loses all location rows loses all access; operators must expect "I see nothing" support requests instead of silent over-exposure.
- The role editor needs English and Arabic labels and hints for every permission, kept in step with the catalog.
- One more realtime broadcast and fingerprint comparison on each Dashboard tab.

## Revisit triggers

- A tenant needs a reserved permission on a custom role, or needs `role.manage` delegated.
- Configurable approval chains (#50) are scheduled — they need their own ADR.
- A dominance, scope, or last-administrator test fails, or an escalation is reported.
- The permission catalog grows past the 32-grant limit per role, or a new scope kind is needed.
- A Platform Admin roles feature is proposed — it is out of scope here.

## References

- [ADR-0007: Roles and capabilities](./0007-roles-and-capabilities.md) — amended
- [ADR-0010: Deferred scope](./0010-deferred-scope.md) — amended (#50 row and roles seam)
- [ADR-0013: Tenant context and live authorization](./0013-tenant-context-and-live-authorization.md) — amended (scope semantics, provisioning)
- [ADR-0011: Distribution allowlist and contract versions](./0011-distribution-allowlist-and-contract-versions.md) — additive contracts, N-1
- [Tenant roles guide](../roles.md)
- [Security and privacy](../security-and-privacy.md) §4.1
- [Engineering rules](../engineering-rules.md) §7
- [ADR index](./README.md)
