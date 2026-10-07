import { describe, expect, it } from "vitest";

import {
  actorCanGrant,
  buildArchiveRoleV1Request,
  buildSaveRoleV1Request,
  builtInRoleTemplateGrants,
  capabilityNames,
  dominates,
  grantCovers,
  grantScopeAllowedInMode,
  parseArchiveRoleResultV1,
  parseRoleCatalogV1,
  parseRoleMutationErrorV1,
  parseRolesV1,
  parseSaveRoleResultV1,
  reservedPermissionKeysV1,
  roleCoverageCases,
  uncoveredGrants,
  validateCustomRoleGrantsV1,
  type RoleGrantV1,
  type SaveRoleV1Input,
} from "./index.js";

const tenant = "a0000000-0000-0000-0000-000000000001";
const request = "c0000000-0000-0000-0000-0000000000a1";
const builtInId = "a2000000-0000-0000-0000-000000000002";
const customId = "a2000000-0000-0000-0000-0000000000c1";

const catalogRow = (overrides: Record<string, unknown> = {}) => ({
  key: "booking.check_in",
  group: "bookings",
  allowed_scopes: ["tenant", "location", "own"],
  allowed_grant_kinds: ["direct", "approval"],
  reserved: false,
  sort_order: 10,
  ...overrides,
});

const builtInRole = (overrides: Record<string, unknown> = {}) => ({
  id: builtInId,
  key: "scheduler",
  is_builtin: true,
  name_en: null,
  name_ar: null,
  description_en: null,
  description_ar: null,
  location_scope_mode: "tenant",
  revision: 1,
  archived: false,
  archived_at: null,
  active_members: 2,
  updated_at: "2026-10-07T09:00:00Z",
  duplicated_from_role_id: null,
  administrator: false,
  pending_invitations: 0,
  assignable: true,
  grants: [
    { permission_key: "booking.view.any", grant_kind: "direct", scope_kind: "tenant" },
  ],
  ...overrides,
});

const customRole = (overrides: Record<string, unknown> = {}) => ({
  ...builtInRole(),
  id: customId,
  key: "custom_0123456789abcdef",
  is_builtin: false,
  name_en: "Front desk",
  name_ar: "الاستقبال",
  description_en: "Checks customers in",
  description_ar: null,
  location_scope_mode: "assigned",
  revision: 3,
  active_members: 1,
  pending_invitations: 1,
  assignable: false,
  grants: [
    {
      permission_key: "booking.view.any",
      grant_kind: "direct",
      scope_kind: "location",
    },
    { permission_key: "booking.check_in", grant_kind: "direct", scope_kind: "own" },
  ],
  ...overrides,
});

const roles = (...items: unknown[]) => ({
  version: 1,
  tenant_id: tenant,
  can_manage_roles: true,
  roles: items,
});

describe("role delegation truth table", () => {
  it("covers every scope × kind combination exactly once", () => {
    const grantCases = roleCoverageCases.filter((item) => item.kind === "grant");
    const sameKey = grantCases.filter(
      (item) => item.actor.permissionKey === item.target.permissionKey,
    );
    expect(sameKey).toHaveLength(36);
    expect(
      new Set(
        sameKey.map(
          (item) =>
            `${item.actor.scope}${item.actor.grantKind}${item.target.scope}${item.target.grantKind}`,
        ),
      ).size,
    ).toBe(36);
  });

  for (const item of roleCoverageCases) {
    it(`${item.kind}: ${item.name}`, () => {
      if (item.kind === "grant") {
        expect(grantCovers(item.actor, item.target)).toBe(item.expected);
      } else {
        expect(dominates(item.actor, item.target)).toBe(item.expected);
        expect(uncoveredGrants(item.actor, item.target).length === 0).toBe(
          item.expected,
        );
      }
    });
  }

  it("reports exactly the grants an actor cannot hand out", () => {
    const actor = {
      grants: builtInRoleTemplateGrants.scheduler,
      locationIds: "all" as const,
    };
    const missing = uncoveredGrants(actor, {
      grants: builtInRoleTemplateGrants.location_manager,
      locationIds: null,
    }).map((grant) => grant.permissionKey);
    expect(missing.sort()).toEqual(["audit.read", "policy.edit", "staff.manage"]);
  });

  it("checks target locations only for non-tenant actor grants", () => {
    const grant: RoleGrantV1 = {
      permissionKey: "booking.check_in",
      grantKind: "direct",
      scope: "location",
    };
    const locationActor = { grants: [grant], locationIds: ["l1"] };
    expect(actorCanGrant(locationActor, grant, ["l1"])).toBe(true);
    expect(actorCanGrant(locationActor, grant, ["l1", "l2"])).toBe(false);
    expect(actorCanGrant(locationActor, grant)).toBe(true);
    expect(actorCanGrant({ grants: [grant], locationIds: "all" }, grant, ["l9"])).toBe(
      true,
    );
  });

  it("keeps built-in templates consistent with their modes and the reserved list", () => {
    for (const grant of builtInRoleTemplateGrants.scheduler)
      expect(grantScopeAllowedInMode("tenant", grant.scope)).toBe(true);
    for (const key of ["staff", "location_manager"] as const)
      for (const grant of builtInRoleTemplateGrants[key])
        expect(grantScopeAllowedInMode("assigned", grant.scope)).toBe(true);
    const admin = builtInRoleTemplateGrants.tenant_admin.map(
      (grant) => grant.permissionKey,
    );
    expect([...admin].sort()).toEqual(
      capabilityNames.filter((key) => key !== "tenant.read_other_tenant").sort(),
    );
    for (const key of reservedPermissionKeysV1.filter(
      (key) => key !== "tenant.read_other_tenant",
    ))
      expect(admin).toContain(key);
  });
});

describe("mode and grant validation", () => {
  it("allows own scope in both modes and refuses the opposite wide scope", () => {
    expect(grantScopeAllowedInMode("tenant", "tenant")).toBe(true);
    expect(grantScopeAllowedInMode("tenant", "own")).toBe(true);
    expect(grantScopeAllowedInMode("tenant", "location")).toBe(false);
    expect(grantScopeAllowedInMode("assigned", "location")).toBe(true);
    expect(grantScopeAllowedInMode("assigned", "own")).toBe(true);
    expect(grantScopeAllowedInMode("assigned", "tenant")).toBe(false);
  });

  it("reports every save_role_v1 refusal it can see without the actor", () => {
    const catalog = parseRoleCatalogV1({
      version: 1,
      tenant_id: tenant,
      permissions: [
        catalogRow(),
        catalogRow({
          key: "booking.view.any",
          allowed_scopes: ["tenant", "location"],
          allowed_grant_kinds: ["direct"],
        }),
      ],
    }).permissions;
    const codes = (
      mode: "tenant" | "assigned",
      grants: RoleGrantV1[],
      withCatalog = true,
    ) =>
      validateCustomRoleGrantsV1(mode, grants, withCatalog ? catalog : undefined).map(
        (issue) => issue.code,
      );
    expect(codes("tenant", [])).toEqual(["empty"]);
    expect(
      codes("assigned", [
        { permissionKey: "booking.check_in", grantKind: "direct", scope: "own" },
      ]),
    ).toEqual([]);
    expect(
      codes("tenant", [
        { permissionKey: "booking.check_in", grantKind: "direct", scope: "own" },
        { permissionKey: "booking.check_in", grantKind: "direct", scope: "tenant" },
      ]),
    ).toEqual(["duplicate"]);
    expect(
      codes("tenant", [
        { permissionKey: "billing.view", grantKind: "direct", scope: "tenant" },
      ]),
    ).toEqual(["reserved"]);
    expect(
      codes("tenant", [
        { permissionKey: "catalog.edit", grantKind: "direct", scope: "tenant" },
      ]),
    ).toEqual(["unknown_permission"]);
    expect(
      codes("assigned", [
        { permissionKey: "booking.view.any", grantKind: "approval", scope: "own" },
      ]),
    ).toEqual(["scope_not_allowed", "grant_kind_not_allowed"]);
    expect(
      codes("tenant", [
        { permissionKey: "booking.check_in", grantKind: "direct", scope: "location" },
      ]),
    ).toEqual(["scope_mode_mismatch"]);
    expect(
      codes(
        "tenant",
        Array.from({ length: 33 }, () => ({
          permissionKey: "booking.check_in" as const,
          grantKind: "direct" as const,
          scope: "tenant" as const,
        })),
        false,
      ),
    ).toContain("too_many");
    for (const key of reservedPermissionKeysV1)
      expect(
        codes(
          "tenant",
          [{ permissionKey: key, grantKind: "approval", scope: "tenant" }],
          false,
        ),
      ).toEqual(["reserved"]);
  });
});

describe("parseRoleCatalogV1", () => {
  it("parses permission metadata and skips well-formed unknown keys", () => {
    const parsed = parseRoleCatalogV1({
      version: 1,
      tenant_id: tenant,
      permissions: [
        catalogRow(),
        catalogRow({ key: "future.capability_x" }),
        catalogRow({ key: "booking.cancel", group: "future_group" }),
      ],
    });
    expect(parsed.tenantId).toBe(tenant);
    expect(parsed.permissions.map((item) => [item.key, item.group])).toEqual([
      ["booking.check_in", "bookings"],
      ["booking.cancel", "other"],
    ]);
  });

  it("treats the local reserved list as a floor", () => {
    const parsed = parseRoleCatalogV1({
      version: 1,
      tenant_id: tenant,
      permissions: [catalogRow({ key: "role.manage", reserved: false })],
    });
    expect(parsed.permissions[0]?.reserved).toBe(true);
  });

  it.each([
    ["wrong version", { version: 2, tenant_id: tenant, permissions: [] }],
    ["extra key", { version: 1, tenant_id: tenant, permissions: [], extra: 1 }],
    [
      "malformed key",
      {
        version: 1,
        tenant_id: tenant,
        permissions: [catalogRow({ key: "Bad Key" })],
      },
    ],
    [
      "empty scopes",
      {
        version: 1,
        tenant_id: tenant,
        permissions: [catalogRow({ allowed_scopes: [] })],
      },
    ],
    [
      "duplicate scope",
      {
        version: 1,
        tenant_id: tenant,
        permissions: [catalogRow({ allowed_scopes: ["own", "own"] })],
      },
    ],
    [
      "bad kind",
      {
        version: 1,
        tenant_id: tenant,
        permissions: [catalogRow({ allowed_grant_kinds: ["maybe"] })],
      },
    ],
    [
      "negative order",
      { version: 1, tenant_id: tenant, permissions: [catalogRow({ sort_order: -1 })] },
    ],
    [
      "duplicate key",
      { version: 1, tenant_id: tenant, permissions: [catalogRow(), catalogRow()] },
    ],
    [
      "camelCase row",
      {
        version: 1,
        tenant_id: tenant,
        permissions: [{ permissionKey: "booking.check_in" }],
      },
    ],
  ])("fails closed on %s", (_name, value) => {
    expect(() => parseRoleCatalogV1(value)).toThrow();
  });
});

describe("parseRolesV1", () => {
  it("parses built-in and custom roles into a discriminated union", () => {
    const parsed = parseRolesV1(roles(builtInRole(), customRole()));
    expect(parsed.roles[0]).toEqual({
      kind: "builtin",
      key: "scheduler",
      id: builtInId,
      mode: "tenant",
      revision: 1,
      archived: false,
      archivedAt: null,
      updatedAt: "2026-10-07T09:00:00Z",
      duplicatedFromRoleId: null,
      administrator: false,
      activeMembers: 2,
      pendingInvitations: 0,
      assignable: true,
      grants: [
        { permissionKey: "booking.view.any", grantKind: "direct", scope: "tenant" },
      ],
      hasUnknownGrants: false,
    });
    expect(parsed.roles[1]).toMatchObject({
      kind: "custom",
      key: "custom_0123456789abcdef",
      nameEn: "Front desk",
      nameAr: "الاستقبال",
      descriptionEn: "Checks customers in",
      descriptionAr: null,
      archivedAt: null,
      mode: "assigned",
      revision: 3,
    });
  });

  it("allows reserved grants on built-ins only", () => {
    const admin = builtInRole({
      key: "tenant_admin",
      grants: [
        { permission_key: "role.manage", grant_kind: "approval", scope_kind: "tenant" },
      ],
    });
    expect(parseRolesV1(roles(admin)).roles[0]?.grants).toHaveLength(1);
    expect(() =>
      parseRolesV1(
        roles(
          customRole({
            location_scope_mode: "tenant",
            grants: [
              {
                permission_key: "role.manage",
                grant_kind: "approval",
                scope_kind: "tenant",
              },
            ],
          }),
        ),
      ),
    ).toThrow();
  });

  it("flags unknown grants instead of dropping them silently", () => {
    const parsed = parseRolesV1(
      roles(
        customRole({
          grants: [
            {
              permission_key: "future.capability_x",
              grant_kind: "direct",
              scope_kind: "own",
            },
            {
              permission_key: "booking.check_in",
              grant_kind: "direct",
              scope_kind: "own",
            },
          ],
        }),
      ),
    );
    expect(parsed.roles[0]?.hasUnknownGrants).toBe(true);
    expect(parsed.roles[0]?.grants).toHaveLength(1);
  });

  it("accepts an archived custom role", () => {
    const parsed = parseRolesV1(
      roles(customRole({ archived: true, archived_at: "2026-10-07T09:00:00+00:00" })),
    );
    expect(parsed.roles[0]).toMatchObject({ archivedAt: "2026-10-07T09:00:00+00:00" });
  });

  it.each([
    ["built-in with a name", builtInRole({ name_en: "Scheduler" })],
    ["archived built-in", builtInRole({ archived_at: "2026-10-07T09:00:00Z" })],
    ["unknown built-in key", builtInRole({ key: "owner" })],
    ["custom with a built-in key", customRole({ key: "scheduler" })],
    ["custom with a person-chosen key", customRole({ key: "custom_front_desk" })],
    ["custom without an Arabic name", customRole({ name_ar: "" })],
    ["custom with a blank English name", customRole({ name_en: "   " })],
    ["custom with a long name", customRole({ name_en: "x".repeat(81) })],
    ["custom with a long description", customRole({ description_en: "x".repeat(501) })],
    ["bad archive time", customRole({ archived_at: "yesterday" })],
    [
      "tenant-scope grant on an assigned role",
      customRole({
        grants: [
          {
            permission_key: "booking.check_in",
            grant_kind: "direct",
            scope_kind: "tenant",
          },
        ],
      }),
    ],
    [
      "location-scope grant on a tenant role",
      builtInRole({
        grants: [
          {
            permission_key: "booking.check_in",
            grant_kind: "direct",
            scope_kind: "location",
          },
        ],
      }),
    ],
    [
      "duplicate grant",
      customRole({
        grants: [
          {
            permission_key: "booking.check_in",
            grant_kind: "direct",
            scope_kind: "own",
          },
          {
            permission_key: "booking.check_in",
            grant_kind: "approval",
            scope_kind: "own",
          },
        ],
      }),
    ],
    [
      "malformed grant key",
      customRole({
        grants: [{ permission_key: "nope", grant_kind: "direct", scope_kind: "own" }],
      }),
    ],
    [
      "extra grant field",
      customRole({
        grants: [
          {
            permission_key: "booking.check_in",
            grant_kind: "direct",
            scope_kind: "own",
            note: 1,
          },
        ],
      }),
    ],
    ["zero revision", builtInRole({ revision: 0 })],
    ["negative member count", builtInRole({ active_members: -1 })],
    ["string assignable", builtInRole({ assignable: "true" })],
    [
      "missing field",
      (() => {
        const { assignable: _drop, ...rest } = builtInRole();
        return rest;
      })(),
    ],
    ["extra field", builtInRole({ tenant_id: tenant })],
  ])("fails closed on %s", (_name, role) => {
    expect(() => parseRolesV1(roles(role))).toThrow();
  });

  it("fails closed on duplicate roles and a wrong envelope", () => {
    expect(() => parseRolesV1(roles(builtInRole(), builtInRole()))).toThrow();
    expect(() => parseRolesV1({ version: 2, tenant_id: tenant, roles: [] })).toThrow();
    expect(() => parseRolesV1({ version: 1, tenant_id: "x", roles: [] })).toThrow();
  });
});

describe("mutation results and errors", () => {
  it("parses save and archive results", () => {
    expect(
      parseSaveRoleResultV1({
        version: 1,
        role_id: customId,
        key: "custom_0123456789abcdef",
        revision: 4,
        action: "update",
        replayed: false,
      }),
    ).toEqual({
      roleId: customId,
      key: "custom_0123456789abcdef",
      revision: 4,
      action: "update",
      replayed: false,
    });
    expect(
      parseArchiveRoleResultV1({
        version: 1,
        role_id: customId,
        key: "custom_0123456789abcdef",
        revision: 5,
        action: "archive",
        replayed: true,
      }),
    ).toEqual({
      roleId: customId,
      key: "custom_0123456789abcdef",
      revision: 5,
      action: "archive",
      replayed: true,
    });
    expect(() =>
      parseSaveRoleResultV1({
        version: 1,
        role_id: customId,
        key: "custom_0123456789abcdef",
        revision: 0,
        action: "update",
        replayed: false,
      }),
    ).toThrow();
    expect(() =>
      parseArchiveRoleResultV1({
        version: 1,
        role_id: customId,
        key: "custom_0123456789abcdef",
        revision: 0,
        action: "archive",
        replayed: false,
      }),
    ).toThrow();
  });

  it("maps exact exception messages to codes", () => {
    expect(parseRoleMutationErrorV1({ message: "role_locked" })).toEqual({
      code: "role_locked",
    });
    expect(
      parseRoleMutationErrorV1({
        code: "P0001",
        message: "role_in_use",
        details: '{"members":2,"invitations":1}',
      }),
    ).toEqual({ code: "role_in_use", members: 2, invitations: 1 });
    expect(
      parseRoleMutationErrorV1({ message: "role_in_use", details: "not json" }),
    ).toEqual({
      code: "role_in_use",
    });
    expect(
      parseRoleMutationErrorV1({ message: "role_in_use", details: '{"members":-1}' }),
    ).toEqual({
      code: "role_in_use",
    });
    expect(
      parseRoleMutationErrorV1({ code: "40001", message: "revision_conflict" }),
    ).toEqual({
      code: "revision_conflict",
    });
    expect(parseRoleMutationErrorV1({ message: "something else" })).toBeNull();
    expect(parseRoleMutationErrorV1({ message: "role_locked: extra" })).toBeNull();
    expect(parseRoleMutationErrorV1(null)).toBeNull();
  });
});

describe("request builders", () => {
  const input: SaveRoleV1Input = {
    tenantId: tenant,
    requestId: request,
    roleId: null,
    expectedRevision: null,
    sourceRoleId: builtInId,
    nameEn: "  Front desk ",
    nameAr: "الاستقبال",
    descriptionEn: " ",
    descriptionAr: null,
    mode: "assigned",
    grants: [
      { permissionKey: "booking.check_in", grantKind: "direct", scope: "location" },
    ],
  };

  it("builds snake_case save arguments with trimmed names", () => {
    expect(buildSaveRoleV1Request(input)).toEqual({
      p_tenant_id: tenant,
      p_request_id: request,
      p_role_id: null,
      p_expected_revision: null,
      p_source_role_id: builtInId,
      p_name_en: "Front desk",
      p_name_ar: "الاستقبال",
      p_description_en: null,
      p_description_ar: null,
      p_location_scope_mode: "assigned",
      p_grants: [
        {
          permission_key: "booking.check_in",
          grant_kind: "direct",
          scope_kind: "location",
        },
      ],
    });
  });

  it.each([
    ["update without revision", { roleId: customId }],
    ["create with revision", { expectedRevision: 2 }],
    ["duplicate source on update", { roleId: customId, expectedRevision: 2 }],
    ["blank Arabic name", { nameAr: " " }],
    [
      "reserved grant",
      {
        grants: [{ permissionKey: "role.manage", grantKind: "approval", scope: "own" }],
      },
    ],
    [
      "mode mismatch",
      {
        grants: [
          { permissionKey: "booking.check_in", grantKind: "direct", scope: "tenant" },
        ],
      },
    ],
    [
      "unknown permission",
      {
        grants: [
          { permissionKey: "future.capability_x", grantKind: "direct", scope: "own" },
        ],
      },
    ],
    ["no grants", { grants: [] }],
    ["bad request id", { requestId: "r1" }],
  ])("refuses %s", (_name, patch) => {
    expect(() =>
      buildSaveRoleV1Request({ ...input, ...patch } as SaveRoleV1Input),
    ).toThrow();
  });

  it("builds archive arguments", () => {
    expect(
      buildArchiveRoleV1Request({
        tenantId: tenant,
        requestId: request,
        roleId: customId,
        expectedRevision: 3,
      }),
    ).toEqual({
      p_tenant_id: tenant,
      p_request_id: request,
      p_role_id: customId,
      p_expected_revision: 3,
    });
    expect(() =>
      buildArchiveRoleV1Request({
        tenantId: tenant,
        requestId: request,
        roleId: customId,
        expectedRevision: 0,
      }),
    ).toThrow();
  });
});
