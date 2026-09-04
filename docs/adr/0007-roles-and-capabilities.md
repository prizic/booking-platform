# ADR-0007: Roles and capabilities

- **Status:** Accepted
- **Owner:** @SEIFSEIF4
- **Date:** 2026-09-04
- **Supersedes / Superseded by:** —

## Context

§4.1 names nine personas and §4.2 gives a nine-row capability sketch with cells such as "Policy-limited" and "Optional". That is enough to argue about and not enough to build. An implementer writing the cancel endpoint, the refund endpoint, the PII view, or an RLS policy needs to know, for each actor, whether the answer is yes, yes-for-their-own-records, yes-after-someone-approves, or no.

Three constraints shape the answer. Authorization is resolved from current database state, not from long-lived JWT claims, so revoking a staff member takes effect immediately (§4.2, SI-3). Permissions are named capabilities such as `booking.cancel` and `refund.issue`, never hard-coded role comparisons scattered through UI code, because roles become bundles of capabilities and custom roles arrive in Phase 2. And platform access to tenant data is never silent: a support session records tenant, operator, reason, reference, scope, start, and expiry, and shows an unmistakable banner (§4.3, SI-10).

The MVP ships four tenant roles (§8.1: owner/admin, scheduler, staff, location manager). This ADR defines all nine personas anyway, because the capability names, the enforcement points, and the support-access rules must be right from the first migration — retrofitting them once tenant data exists is the expensive path.

## Decision

We define nine roles as fixed bundles of named capabilities, enforce them at three layers, and ship no custom-role editor in v1.

### Roles

| Role | Scope of its "allow" cells | Identity |
| --- | --- | --- |
| **Customer** | Only their own bookings | Supabase Auth account, or a signed guest management link (ADR-0004) |
| **Staff** | Bookings assigned to them, at locations they work | Auth + membership row |
| **Scheduler** | The whole tenant | Auth + membership row |
| **Location manager** | Their assigned locations only | Auth + membership row, with a location id list |
| **Tenant administrator** | The whole tenant | Auth + MFA; step-up for the sensitive-action list |
| **Tenant billing administrator** | The tenant's SaaS plan and invoices — not customer payments | Auth + MFA |
| **Support operator** | One tenant, for the life of one active support grant | Platform operator role, MFA/AAL2 |
| **Platform operations administrator** | Fleet infrastructure; no tenant business data by default | Platform operator role, MFA/AAL2 |
| **Break-glass super administrator** | Everything, alarmed and time-boxed | Platform operator role, MFA/AAL2, two-person authorization |

A user may hold memberships in several tenants. Tenant switching is always explicit; there is no implicit "last tenant" for a mutation.

### Capability matrix

**A** = allow, within the role's scope · **O** = allow, own records only · **P** = allow, but requires approval (step-up authentication and, where noted, a second approver) · **D** = deny.

| Capability | Customer | Staff | Scheduler | Location mgr | Tenant admin | Billing admin | Support op | Platform ops | Break-glass |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| `booking.view.own` | O | O | A | A | A | D | A ¹ | D | A ² |
| `booking.view.any` (tenant-wide) | D | D | A | A ³ | A | D | A ¹ | D | A ² |
| `booking.create_on_behalf` | D | A | A | A ³ | A | D | P | D | A ² |
| `booking.approve` (accept or reject a request-to-book) | D | A | A | A ³ | A | D | D | D | A ² |
| `booking.reschedule` | O ⁴ | A | A | A ³ | A | D | P | D | A ² |
| `booking.cancel` | O ⁴ | A | A | A ³ | A | D | P | D | A ² |
| `refund.issue` | D | P ⁵ | P ⁵ | P ³ ⁵ | A | D | P | D | A ² |
| `booking.check_in` | D | A | A | A ³ | A | D | D | D | A ² |
| `booking.check_in_override` ¹⁵ | D | D | A | A ³ | A | D | D | D | A ² |
| `booking.mark_no_show` | D | A | A | A ³ | A | D | D | D | A ² |
| `booking.complete` | D | A | A | A ³ | A | D | D | D | A ² |
| `booking.correct_status` ¹⁸ | D | D | A | A ³ | A | D | D | D | A ² |
| `catalog.edit` | D | D | P ⁶ | P ³ ⁶ | A | D | D | D | A ² |
| `schedule.edit` | D | O ⁷ | A | A ³ | A | D | D | D | A ² |
| `staff.manage` | D | D | D | P ⁸ | A | D | D | D | A ² |
| `policy.edit` (ADR-0005 values) | D | D | D | A ³ | A | D | D | D | A ² |
| `customer.pii.view` | O | A ⁹ | A | A ³ | A | D | P ¹⁰ | D | A ² |
| `customer.data.export` | O | D | D | D | P ¹¹ | D | D | D | D |
| `customer.data.export_on_behalf` | D ¹⁶ | D | D | D | P ¹¹ | D | D | D | D |
| `customer.data.correct` | O ¹⁷ | D | D | D | A | D | D | D | D |
| `customer.data.delete` | O ¹² | D | D | D | D | D | D | D | D |
| `customer.data.restrict` | O ¹⁹ | D | D | D | D | D | D | D | D |
| `brand.manage` | D | D | D | D | A | D | D | P ¹³ | A ² |
| `integration.manage` | D | D | D | D | A ¹¹ | D | D | D | A ² |
| `billing.view` (tenant SaaS) | D | D | D | D | A | A | A ¹ | A | A ² |
| `billing.change_plan` | D | D | D | D | P ¹¹ | A | D | P | A ² |
| `support.grant_access` | D | D | D | D | A | D | D | D | A ² |
| `audit.read` | D | D | D | A ³ | A | D | A ¹ | A ¹⁴ | A ² |
| `instance.request_update` | D | D | D | D | A | D | D | A | A ² |
| `tenant.owner_transfer` | D | D | D | D | P ¹¹ | D | D | D | A ² |
| `tenant.read_other_tenant` | D | D | D | D | D | D | D | D | A ² |

Footnotes:

1. Only while an active support grant covers that tenant, and read-only. See the support-operator rules below.
2. Only inside an open break-glass window. See the break-glass rules below.
3. Restricted to the manager's assigned locations. A booking, staff member, service, or policy outside those locations is invisible, not merely uneditable.
4. Only before the snapshotted `cancellation.cutoff_minutes` / `reschedule.cutoff_minutes`, and only while `cancellation.customer_self_service` is true (ADR-0005, ADR-0006). After the cutoff the action is shown as unavailable with the reason, and the customer is directed to contact the tenant.
5. Staff, schedulers, and location managers may issue a refund only up to the amount the snapshotted refund schedule entitles. Anything beyond it — a goodwill refund, a refund after a no-show, a partial override — requires tenant-administrator approval.
6. A scheduler or location manager may edit bookable attributes that do not change price: description, images, staff eligibility. Price, deposit rule, tax treatment, and payment mode require tenant-administrator approval.
7. Staff edit their own working hours and time off. Editing another person's schedule is scheduler-and-above.
8. A location manager may assign and unassign existing staff to their locations. Inviting, deactivating, or changing anyone's role requires tenant-administrator approval.
9. Staff see PII only for customers on bookings assigned to them, and only for bookings from 7 days past to 30 days future. Sensitive intake notes follow the same rule.
10. A support operator sees PII only when the support grant's approved scope explicitly includes it; the default grant scope excludes it. Every field access is logged individually.
11. Requires step-up authentication (recent authentication plus MFA) — this is the sensitive-action list already in [security and privacy](../security-and-privacy.md).
12. A customer may request deletion of their own data; the request enters the deletion workflow and is subject to legal hold and lawful financial retention. It is not an immediate destructive action.
13. Recovery and override only — a broken deployment or a takedown obligation. Alarmed and audited like break-glass, and never used for routine content changes.
14. Platform-scope audit events only: provisioning, deployments, domains, releases, support grants. Not tenant business audit events.
15. Check in a booking outside the permitted check-in window defined in [ADR-0005](./0005-booking-policy-defaults.md). The override requires a recorded reason, written to the append-only audit log with the actor, the booking, and the window it departed from. An override without a reason is not accepted.
16. A customer exercises the export right on their own record through `customer.data.export`, not through this capability. `customer.data.export_on_behalf` exists only for the tenant-administrator case and is denied to every operational role, so an export of another person's record is never a routine staff action.
17. Own record only, and only by initiating the verified correction workflow through an intent-scoped link plus an email OTP (ADR-0004, [ADR-0008](./0008-privacy-retention-and-support-access.md) §2). It never edits an immutable snapshot directly.
18. Correct an erroneous `checked_in`, `completed`, or `no_show` state only within the snapshotted `booking.status_correction_window_hours`, with a mandatory reason and append-only old/new-state audit event. Any money adjustment separately requires `refund.issue`.
19. A customer may request restriction of their own data through the verified privacy workflow. It is a request subject to recorded review and legal hold, not a direct database mutation.

### Support operator: read-only by default

- A support operator has **no standing access to any tenant**. Access exists only through a support grant.
- A grant records: tenant, operator identity, reason text, ticket or incident reference, approved scope (which capabilities, and whether PII is included), start time, and expiry. Default expiry **4 hours**, platform maximum **24 hours**. There is no non-expiring grant.
- A grant is authorized by the tenant administrator (`support.grant_access`). A platform-initiated emergency grant without tenant authorization is a break-glass event, not a support grant, and follows the break-glass rules.
- A granted session is **read-only**. Every `P` cell in the support-operator column means: the write is blocked until step-up approval is obtained — re-authentication by the operator **and** a second platform approver who is not the operator — and the approval is recorded against that specific action, not the session.
- Credential and security changes are never available: no password reset, no MFA reset, no API key or provider key access, no `support.grant_access`, no `tenant.owner_transfer`. These are `D` regardless of grant scope.
- The Dashboard shows an unmistakable support-mode banner naming the operator and the expiry for the entire session, to every tenant user, not only to the operator.
- Every read and every write in a support session is written to the append-only audit log with the grant id. Silent impersonation does not exist (SI-10, §4.3).
- Expiry is enforced server-side at execution time. An in-flight session ends the moment the grant expires; nothing is cached to outlive it.

### Break-glass: alarmed and time-boxed

- Break-glass is for a security incident or a total loss of access, not for support convenience or a fast fix.
- Opening it requires two-person authorization from named platform operators with MFA/AAL2, and a written reason.
- Opening it **pages the on-call security owner immediately** and posts to the alert channel. It is loud by design; a quiet break-glass is a failed control.
- Maximum window **60 minutes**, non-renewable without a fresh two-person authorization. Expiry is server-side.
- Every action in the window is audited, and the audit trail is append-only and outside the break-glass role's own delete reach.
- A post-incident review is mandatory within one business day, recording what was accessed and why. An unreviewed break-glass event blocks the next release.
- Affected tenants are notified of the access according to the [security and privacy](../security-and-privacy.md) notification rules.

### Where this is enforced

Three layers, all required, none sufficient alone:

1. **UI** hides or disables what the actor cannot do, always with a reason. UI state is a courtesy, never a control.
2. **Server** rechecks the capability against current database state at execution time, on every sensitive mutation (SI-3). Membership is read at the point of use, never trusted from a JWT claim that could outlive a revocation.
3. **RLS** is the final guard. `tenant_id` is the isolation boundary (SI-1); a capability bug must still fail closed at the database.

Capabilities are referenced by name — `booking.cancel`, `refund.issue`, `brand.publish` — in code, tests, audit rows, and the RLS matrix. A role comparison such as `if (role === 'admin')` outside the single capability-resolution module is a defect.

### Deferred to Phase 2

Custom roles and approval workflows are **Phase 2, issue #50** (§8.2, [release scope](../release-scope.md)). In v1 the nine bundles are fixed and not editable by tenants, and every `P` cell is satisfied by the hard-coded approver above it — there is no configurable approval chain. The capability names are designed so that Phase 2 can add custom bundles without renaming anything or migrating existing checks.

### Alternatives rejected

- **Role checks inline throughout the code.** Rejected: it makes Phase 2 custom roles a full-codebase rewrite and makes the RLS matrix untestable.
- **Permissions carried in JWT claims.** Rejected: a revoked staff member keeps access until the token expires, which contradicts §4.2 and SI-3.
- **Standing platform read access to tenant data.** Rejected: it makes SI-10 unenforceable and turns every support engineer into a permanent tenant-isolation risk.
- **Configurable approval chains in v1.** Rejected: an approval engine is its own product surface, and issue #50 already owns it.

## Consequences

### Positive

- Every endpoint has one named capability to check, and every cell in this table has a testable assertion — this matrix is directly the source for the minimum RLS matrix (§24.2).
- Revocation is immediate because authorization is current database state, so removing a staff member actually removes them.
- Support access is bounded, expiring, visible, and fully audited, so a tenant can answer "who at the platform saw my data?" from the audit log alone.
- Break-glass is loud and short, which makes misuse detectable rather than deniable.
- Naming capabilities now means Phase 2 custom roles are additive; no existing check needs renaming.
- The escalation ladder runs one way. For `refund.issue` and `catalog.edit` the location-manager cell is `P` under the same restriction footnotes as staff and schedulers, which **deliberately departs from the literal cell in §4.2**: read literally, a location manager would hold unrestricted goodwill-refund and pricing authority that a tenant-wide scheduler must escalate for, so granting someone a single location would grant more authority than granting them the whole tenant. That is a privilege-escalation path, not a scoping rule, and the spec cell is treated as an error rather than a requirement.

### Negative / cost

- Nine roles times thirty-one capabilities is a large test surface, and it has to be tested at both the server and the RLS layer.
- Fixed bundles will not fit some tenant's org chart, and the only answer until issue #50 is "use the next role up", which over-grants.
- The `P` cells need real approval UI, notification, and expiry handling; that is more work than a boolean and it is easy to under-build.
- Two-person break-glass means a genuine 3am incident needs two people awake. That is the intended cost, and it will be resented at least once.
- Location-manager scoping touches every tenant-scoped query, not only the authorization check; a missed location filter is a data-visibility bug the capability check will not catch.
- Staff PII windowing (footnote 9) will occasionally block legitimate work on an old booking, and the escalation path is a scheduler.

## Revisit triggers

- A tenant requests a role that cannot be expressed by the nine bundles, or asks to grant one capability without the rest of its bundle.
- Issue #50 (custom roles and approval workflows) starts — this matrix becomes the seed data for the default bundles.
- A support-operator write escalation (`P`) is requested more than twice a month, indicating the read-only default is wrong for some workflow.
- Any break-glass event occurs, or any break-glass window is opened more than once per quarter.
- A capability is found to cross the tenant isolation boundary, or an RLS test fails for a cell marked `D`.
- A support grant is found to have outlived its expiry, or an audit entry is found missing for a support session action.
- Tenant billing administrator and tenant administrator need to diverge further — for example, if platform billing gains usage-based charges that a tenant admin must not see.
- A new persona appears, such as a franchise-group operator spanning several tenants.

## References

- [Architecture spec](../../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md) — §4.1 personas, §4.2 authorization model, §4.3 platform support access, §8.1 MVP roles, §8.2 Phase 2, §18.1 merchant model separation, §23 privacy, §24.2 minimum RLS matrix, §30 support access approval
- [ADR-0005: Booking policy defaults](./0005-booking-policy-defaults.md) — the cutoffs the `O` cells are evaluated against
- [ADR-0006: Policy snapshot rules](./0006-policy-snapshot-rules.md) — refund entitlement that bounds `refund.issue`
- [ADR-0004: Guest-first booking and management links](./0004-guest-first-booking-and-management-links.md) — how a guest customer authenticates to their `O` cells
- [ADR-0008: Privacy, retention, and support access](./0008-privacy-retention-and-support-access.md) — data classes behind `customer.pii.view`, export, and delete
- Issue #50 — custom roles and approval workflows (Phase 2)
- [Security and privacy](../security-and-privacy.md) · [Release scope](../release-scope.md) · [Architecture overview](../architecture.md) · [Glossary](../glossary.md)
- [ADR index](./README.md) · [References](../references.md)
