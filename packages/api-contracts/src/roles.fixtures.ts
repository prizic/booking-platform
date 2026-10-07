/**
 * Shared truth table for role delegation (ADR-0019). The same rows are the
 * expected values of the pgTAP delegation test for `private.grant_covers` and
 * `private.actor_dominates_grants`; change both together or neither.
 */
import type { CapabilityName } from "./capabilities.js";
import type {
  BuiltInRoleKey,
  GrantActorV1,
  GrantKindV1,
  GrantScopeV1,
  GrantTargetV1,
  RoleGrantV1,
} from "./roles.js";

export type RoleCoverageCase =
  | {
      readonly kind: "grant";
      readonly name: string;
      readonly actor: RoleGrantV1;
      readonly target: RoleGrantV1;
      readonly expected: boolean;
    }
  | {
      readonly kind: "dominance";
      readonly name: string;
      readonly actor: GrantActorV1;
      readonly target: GrantTargetV1;
      readonly expected: boolean;
    };

type Row = readonly [GrantScopeV1, GrantKindV1, GrantScopeV1, GrantKindV1, boolean];

// actor scope, actor kind, target scope, target kind, covers
const sameKeyRows: readonly Row[] = [
  ["tenant", "direct", "tenant", "direct", true],
  ["tenant", "direct", "tenant", "approval", true],
  ["tenant", "direct", "location", "direct", true],
  ["tenant", "direct", "location", "approval", true],
  ["tenant", "direct", "own", "direct", true],
  ["tenant", "direct", "own", "approval", true],
  ["tenant", "approval", "tenant", "direct", false],
  ["tenant", "approval", "tenant", "approval", true],
  ["tenant", "approval", "location", "direct", false],
  ["tenant", "approval", "location", "approval", true],
  ["tenant", "approval", "own", "direct", false],
  ["tenant", "approval", "own", "approval", true],
  ["location", "direct", "tenant", "direct", false],
  ["location", "direct", "tenant", "approval", false],
  ["location", "direct", "location", "direct", true],
  ["location", "direct", "location", "approval", true],
  ["location", "direct", "own", "direct", true],
  ["location", "direct", "own", "approval", true],
  ["location", "approval", "tenant", "direct", false],
  ["location", "approval", "tenant", "approval", false],
  ["location", "approval", "location", "direct", false],
  ["location", "approval", "location", "approval", true],
  ["location", "approval", "own", "direct", false],
  ["location", "approval", "own", "approval", true],
  ["own", "direct", "tenant", "direct", false],
  ["own", "direct", "tenant", "approval", false],
  ["own", "direct", "location", "direct", false],
  ["own", "direct", "location", "approval", false],
  ["own", "direct", "own", "direct", true],
  ["own", "direct", "own", "approval", true],
  ["own", "approval", "tenant", "direct", false],
  ["own", "approval", "tenant", "approval", false],
  ["own", "approval", "location", "direct", false],
  ["own", "approval", "location", "approval", false],
  ["own", "approval", "own", "direct", false],
  ["own", "approval", "own", "approval", true],
];

const g = (
  permissionKey: CapabilityName,
  grantKind: GrantKindV1,
  scope: GrantScopeV1,
): RoleGrantV1 => ({ permissionKey, grantKind, scope });

type Template = readonly (readonly [CapabilityName, GrantKindV1])[];

const staff: Template = [
  ["booking.view.own", "direct"],
  ["booking.create_on_behalf", "direct"],
  ["booking.approve", "direct"],
  ["booking.reschedule", "direct"],
  ["booking.cancel", "direct"],
  ["refund.issue", "approval"],
  ["booking.check_in", "direct"],
  ["booking.mark_no_show", "direct"],
  ["booking.complete", "direct"],
  ["schedule.edit", "direct"],
  ["customer.pii.view", "direct"],
];

const operations: Template = [
  ["booking.view.own", "direct"],
  ["booking.view.any", "direct"],
  ["booking.create_on_behalf", "direct"],
  ["booking.approve", "direct"],
  ["booking.reschedule", "direct"],
  ["booking.cancel", "direct"],
  ["refund.issue", "approval"],
  ["booking.check_in", "direct"],
  ["booking.check_in_override", "direct"],
  ["booking.mark_no_show", "direct"],
  ["booking.complete", "direct"],
  ["booking.correct_status", "direct"],
  ["catalog.edit", "approval"],
  ["schedule.edit", "direct"],
  ["customer.pii.view", "direct"],
];

const tenantAdmin: Template = [
  ["booking.view.own", "direct"],
  ["booking.view.any", "direct"],
  ["booking.create_on_behalf", "direct"],
  ["booking.approve", "direct"],
  ["booking.reschedule", "direct"],
  ["booking.cancel", "direct"],
  ["refund.issue", "direct"],
  ["booking.check_in", "direct"],
  ["booking.check_in_override", "direct"],
  ["booking.mark_no_show", "direct"],
  ["booking.complete", "direct"],
  ["booking.correct_status", "direct"],
  ["catalog.edit", "direct"],
  ["schedule.edit", "direct"],
  ["staff.manage", "direct"],
  ["policy.edit", "direct"],
  ["customer.pii.view", "direct"],
  ["customer.data.export", "approval"],
  ["customer.data.export_on_behalf", "approval"],
  ["customer.data.correct", "direct"],
  ["customer.data.restrict", "direct"],
  ["customer.data.delete", "approval"],
  ["brand.manage", "direct"],
  ["integration.manage", "direct"],
  ["billing.view", "direct"],
  ["billing.change_plan", "approval"],
  ["support.grant_access", "direct"],
  ["audit.read", "direct"],
  ["instance.request_update", "direct"],
  ["tenant.owner_transfer", "approval"],
  ["role.manage", "approval"],
];

const scoped = (template: Template, scope: GrantScopeV1) =>
  template.map(([key, kind]) => g(key, kind, scope));

/**
 * Built-in grants per role, mirroring `private.builtin_role_template_grants`
 * (supabase/seed.sql plus `role.manage` on Tenant admin).
 */
export const builtInRoleTemplateGrants: Readonly<
  Record<BuiltInRoleKey, readonly RoleGrantV1[]>
> = {
  staff: scoped(staff, "own"),
  scheduler: scoped(operations, "tenant"),
  location_manager: [
    ...scoped(operations, "location"),
    g("staff.manage", "approval", "location"),
    g("policy.edit", "direct", "location"),
    g("audit.read", "direct", "location"),
  ],
  tenant_admin: scoped(tenantAdmin, "tenant"),
};

const L1 = "c1000000-0000-4000-8000-000000000001";
const L2 = "c1000000-0000-4000-8000-000000000002";

const t = builtInRoleTemplateGrants;
const duplicatedScheduler = t.scheduler
  .filter((grant) => grant.permissionKey !== "catalog.edit")
  .map((grant) =>
    grant.permissionKey === "refund.issue"
      ? { ...grant, grantKind: "approval" as const }
      : grant,
  );

export const roleCoverageCases: readonly RoleCoverageCase[] = [
  ...sameKeyRows.map(
    ([actorScope, actorKind, targetScope, targetKind, expected]): RoleCoverageCase => ({
      kind: "grant",
      name: `${actorScope}/${actorKind} → ${targetScope}/${targetKind}`,
      actor: g("booking.cancel", actorKind, actorScope),
      target: g("booking.cancel", targetKind, targetScope),
      expected,
    }),
  ),
  {
    kind: "grant",
    name: "a different permission never covers",
    actor: g("booking.cancel", "direct", "tenant"),
    target: g("booking.reschedule", "approval", "own"),
    expected: false,
  },
  {
    kind: "grant",
    name: "staff.manage does not cover role.manage",
    actor: g("staff.manage", "direct", "tenant"),
    target: g("role.manage", "approval", "tenant"),
    expected: false,
  },
  ...(Object.keys(t) as BuiltInRoleKey[]).map((key): RoleCoverageCase => ({
    kind: "dominance",
    name: `tenant_admin dominates ${key}`,
    actor: { grants: t.tenant_admin, locationIds: "all" },
    target: { grants: t[key], locationIds: [L1, L2] },
    expected: true,
  })),
  {
    kind: "dominance",
    name: "scheduler does not dominate tenant_admin",
    actor: { grants: t.scheduler, locationIds: "all" },
    target: { grants: t.tenant_admin, locationIds: null },
    expected: false,
  },
  {
    kind: "dominance",
    name: "scheduler does not dominate location_manager (staff.manage, policy.edit)",
    actor: { grants: t.scheduler, locationIds: "all" },
    target: { grants: t.location_manager, locationIds: [L1] },
    expected: false,
  },
  {
    kind: "dominance",
    name: "location_manager dominates staff inside its locations",
    actor: { grants: t.location_manager, locationIds: [L1] },
    target: { grants: t.staff, locationIds: [L1] },
    expected: true,
  },
  {
    kind: "dominance",
    name: "location_manager does not dominate staff outside its locations",
    actor: { grants: t.location_manager, locationIds: [L1] },
    target: { grants: t.staff, locationIds: [L1, L2] },
    expected: false,
  },
  {
    kind: "dominance",
    name: "location_manager dominates staff at role level (locations checked on assignment)",
    actor: { grants: t.location_manager, locationIds: [L1] },
    target: { grants: t.staff, locationIds: null },
    expected: true,
  },
  {
    kind: "dominance",
    name: "location_manager does not dominate scheduler (tenant scope)",
    actor: { grants: t.location_manager, locationIds: [L1, L2] },
    target: { grants: t.scheduler, locationIds: null },
    expected: false,
  },
  {
    kind: "dominance",
    name: "staff does not dominate location_manager",
    actor: { grants: t.staff, locationIds: [L1] },
    target: { grants: t.location_manager, locationIds: [L1] },
    expected: false,
  },
  {
    kind: "dominance",
    name: "scheduler dominates a duplicated scheduler without catalog.edit",
    actor: { grants: t.scheduler, locationIds: "all" },
    target: { grants: duplicatedScheduler, locationIds: null },
    expected: true,
  },
  {
    kind: "dominance",
    name: "scheduler cannot upgrade catalog.edit from approval to direct",
    actor: { grants: t.scheduler, locationIds: "all" },
    target: {
      grants: [...duplicatedScheduler, g("catalog.edit", "direct", "tenant")],
      locationIds: null,
    },
    expected: false,
  },
  {
    kind: "dominance",
    name: "tenant-scope grants cover any target locations",
    actor: { grants: [g("booking.check_in", "direct", "tenant")], locationIds: [L1] },
    target: {
      grants: [g("booking.check_in", "direct", "location")],
      locationIds: [L2],
    },
    expected: true,
  },
  {
    kind: "dominance",
    name: "own-scope actor grants are bounded by the actor's locations",
    actor: { grants: [g("booking.check_in", "direct", "own")], locationIds: [L1] },
    target: { grants: [g("booking.check_in", "direct", "own")], locationIds: [L2] },
    expected: false,
  },
  {
    kind: "dominance",
    name: "no target grants is vacuously dominated",
    actor: { grants: [], locationIds: [] },
    target: { grants: [], locationIds: [] },
    expected: true,
  },
];
