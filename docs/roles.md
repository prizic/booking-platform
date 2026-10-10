# Tenant roles — built-in and custom

Purpose: how tenant roles work, how a tenant administrator defines and assigns custom roles, and which contracts and error codes the Dashboard and database share.

Authoritative source: [ADR-0019: Tenant custom roles](adr/0019-tenant-custom-roles.md), which amends [ADR-0007](adr/0007-roles-and-capabilities.md), [ADR-0010](adr/0010-deferred-scope.md) and [ADR-0013](adr/0013-tenant-context-and-live-authorization.md). Where this guide and an ADR disagree, the ADR wins.

## What a role is

A role is a tenant-owned bundle of **grants**. Each grant names one capability from the global vocabulary (ADR-0007), a **scope**, and a **kind**:

| Field | Values | Meaning |
| --- | --- | --- |
| Scope | `tenant` · `location` · `own` | Whole tenant · the member's assigned locations · only records assigned to the member |
| Kind | `direct` · `approval` | Allowed outright · allowed only after step-up re-verification |
| Role mode | `tenant` · `assigned` | Reaches every location · reaches only the member's location rows |

A `tenant`-mode role carries no `location` grants; an `assigned`-mode role carries no `tenant` grants; `own` grants are allowed in both. An assigned-mode member with **no** location rows has no location access at all.

Roles are **tenant-local**: defined and used in one tenant's Dashboard, invisible to every other tenant. There is no Platform Admin roles feature.

## Built-in roles

Booking reads require a direct booking-view grant, not just membership.
Every read and digest intersects that grant with effective membership location
restrictions; tenant scope cannot widen an explicitly restricted membership.
`own` additionally requires the booking assignment. See
[notification delivery](notification-delivery.md).

Every tenant has four built-in roles, installed from platform templates when the tenant is created: **Tenant admin**, **Location manager**, **Scheduler**, and **Staff**, with exactly the grants of the ADR-0007 matrix (Tenant admin also holds `role.manage`). They are locked: nobody can edit or archive them. **Duplicate** one to start a custom role from its grants.

## Custom roles

- Created, edited, duplicated, and archived only by a member holding `role.manage` — the built-in Tenant admin — after recent MFA.
- Need an English **and** an Arabic name (1–80 characters, unique among the tenant's active roles), optional descriptions, a mode, and 1–32 grants.
- May not hold the reserved permissions `role.manage`, `billing.view`, `billing.change_plan`, `support.grant_access`, `tenant.owner_transfer`, `tenant.read_other_tenant`.
- Can only contain grants the editor holds themselves (see dominance below).
- Can be archived only when no active member and no pending invitation uses them. Archived roles stay visible on existing records but cannot be assigned.

## Dominance — why a choice is disabled

Nobody can hand out more than they hold. An actor grant **covers** a target grant when:

1. the capability is the same;
2. the actor's scope is at least as wide: `tenant` > `location` > `own`;
3. the actor's kind is at least as strong: `direct` covers `direct` and `approval`; `approval` covers `approval` only.

When the covering actor grant is not tenant-scoped, the target member's locations must all be among the actor's locations. An actor **dominates** a role when every grant in it is covered. The server checks this on role save and duplicate, on invitations, and on membership edits — for both the new role and the member's current role. The Dashboard runs the same rule (`grantCovers`, `dominates`, `actorCanGrant` in `@wlbp/api-contracts`) only to disable choices and explain why; the server decides.

The expected results live in one truth table, `roleCoverageCases` (`packages/api-contracts/src/roles.fixtures.ts`), shared by the contract unit tests and the pgTAP delegation test.

## Contracts

All RPCs take the tenant from the session-selected membership and re-authorize it. JSON is snake_case and versioned; the parsers in `@wlbp/api-contracts` reject unexpected keys.

| RPC | Who | Returns / parser |
| --- | --- | --- |
| `get_role_catalog_v1(p_tenant_id)` | `role.manage` or `staff.manage` | `{version: 1, tenant_id, permissions: [{key, group, allowed_scopes, allowed_grant_kinds, reserved, sort_order}]}` → `parseRoleCatalogV1` |
| `list_roles_v1(p_tenant_id)` | `role.manage` or `staff.manage` | `{version: 1, tenant_id, can_manage_roles, roles: [{id, key, is_builtin, name_en, name_ar, description_en, description_ar, location_scope_mode, revision, archived, archived_at, updated_at, duplicated_from_role_id, administrator, active_members, pending_invitations, assignable, grants: [{permission_key, grant_kind, scope_kind}]}]}` → `parseRolesV1` |
| `save_role_v1(p_tenant_id, p_request_id, p_role_id, p_expected_revision, p_source_role_id, p_name_en, p_name_ar, p_description_en, p_description_ar, p_location_scope_mode, p_grants)` | `role.manage` + recent MFA | `{version: 1, role_id, key, revision, action, replayed}` → `parseSaveRoleResultV1`; arguments from `buildSaveRoleV1Request` |
| `archive_role_v1(p_tenant_id, p_request_id, p_role_id, p_expected_revision)` | `role.manage` + recent MFA | `{version: 1, role_id, key, revision, action: "archive", replayed}` → `parseArchiveRoleResultV1`; arguments from `buildArchiveRoleV1Request` |
| `get_staff_access_workspace_v2(p_tenant_id)` | `staff.manage` | v1 shape with `version: 2` and roles `{id, key, is_builtin, name_en, name_ar, location_scope_mode, archived_at, assignable}` → `parseStaffAccessWorkspaceV2` |

`get_staff_access_workspace_v1` keeps returning built-in roles only, so an N-1 Dashboard keeps working. Built-in rows carry `null` names, descriptions, and `archived_at`. Revisions start at 1. A role holding a capability this Dashboard release does not know is parsed with `hasUnknownGrants: true`, and the editor must refuse to save it rather than drop the grant.

### Error codes

Role RPCs raise the code as the exception message; `parseRoleMutationErrorV1` maps it.

| Code | When | Dashboard response |
| --- | --- | --- |
| `role_locked` | Editing or archiving a built-in role | Offer Duplicate |
| `revision_conflict` | Expected revision is stale (SQLSTATE `40001`) | Keep the draft, reload, let the person re-apply |
| `idempotency_conflict` | Same request id, different payload | Start a new draft request id |
| `role_in_use` | Archiving a role with members or pending invitations; detail `{"members":n,"invitations":n}` | Show counts and link to Staff access |
| `role_scope_in_use` | Switching to `assigned` while a member has no locations; same detail | Show counts and link to Staff access |
| `reserved_permission` | A reserved capability on a custom role | Should be impossible from the UI |
| `escalation_denied` | The actor does not dominate the grants or locations involved | Explain which grants are out of reach |
| `step_up_required` | No recent MFA | Link to step-up, then retry with the same request id |

## Troubleshooting

- **A member suddenly sees nothing.** Their role is `assigned`-mode and they have no location rows. Assign locations in Staff access.
- **"You can't grant this."** The editor lacks that capability at that scope or kind, or the member's locations fall outside theirs. Ask a Tenant admin.
- **A role can't be archived.** It still has members or pending invitations; reassign or revoke them first.
- **Changes don't seem to apply.** Open Dashboard tabs re-authorize on `authorization_changed`; a tab that lost access is refused and refreshed.

## Related documents

- [ADR-0019: Tenant custom roles](adr/0019-tenant-custom-roles.md)
- [ADR-0007: Roles and capabilities](adr/0007-roles-and-capabilities.md)
- [Security and privacy](security-and-privacy.md) §4.1
- [Engineering rules](engineering-rules.md) §7
- [Documentation index](README.md)
