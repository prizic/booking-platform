import { describe, expect, it } from "vitest";

import { parseStaffAccessWorkspaceV1, parseStaffAccessWorkspaceV2 } from "./index.js";

const tenant = "a0000000-0000-0000-0000-000000000001";
const location = "a1000000-0000-0000-0000-000000000001";
const schedulerRole = "a2000000-0000-0000-0000-000000000002";
const customRole = "a2000000-0000-0000-0000-0000000000c1";

const member = {
  id: "a3000000-0000-0000-0000-000000000002",
  name: "Sara",
  email: "sara@example.test",
  role_id: customRole,
  status: "active",
  revision: 1,
  location_ids: [location],
};

const invitation = {
  id: "a4000000-0000-0000-0000-000000000001",
  email: "new@example.test",
  role_id: schedulerRole,
  status: "pending",
  revision: 1,
  expires_at: "2026-10-14T00:00:00Z",
  location_ids: [],
  delivery_status: "sent",
};

const builtIn = {
  id: schedulerRole,
  key: "scheduler",
  is_builtin: true,
  name_en: null,
  name_ar: null,
  location_scope_mode: "tenant",
  archived_at: null,
  assignable: true,
};

const custom = {
  id: customRole,
  key: "custom_0123456789abcdef",
  is_builtin: false,
  name_en: "Front desk",
  name_ar: "الاستقبال",
  location_scope_mode: "assigned",
  archived_at: null,
  assignable: false,
};

const v2 = (roles: unknown[]) => ({
  version: 2,
  tenant_id: tenant,
  roles,
  locations: [{ id: location, name: "Downtown" }],
  members: [member],
  invitations: [invitation],
});

describe("parseStaffAccessWorkspaceV1", () => {
  it("still accepts built-in roles only", () => {
    const parsed = parseStaffAccessWorkspaceV1({
      ...v2([]),
      version: 1,
      roles: [{ id: schedulerRole, key: "scheduler" }],
    });
    expect(parsed.roles).toEqual([{ id: schedulerRole, key: "scheduler" }]);
    expect(parsed.members[0]?.roleId).toBe(customRole);
    expect(() =>
      parseStaffAccessWorkspaceV1({
        ...v2([]),
        version: 1,
        roles: [{ id: customRole, key: "custom_0123456789abcdef" }],
      }),
    ).toThrow();
  });
});

describe("parseStaffAccessWorkspaceV2", () => {
  it("parses built-in and custom roles", () => {
    const parsed = parseStaffAccessWorkspaceV2(v2([builtIn, custom]));
    expect(parsed.roles).toEqual([
      {
        kind: "builtin",
        key: "scheduler",
        id: schedulerRole,
        mode: "tenant",
        assignable: true,
      },
      {
        kind: "custom",
        key: "custom_0123456789abcdef",
        id: customRole,
        mode: "assigned",
        assignable: false,
        nameEn: "Front desk",
        nameAr: "الاستقبال",
        archivedAt: null,
      },
    ]);
    expect(parsed.members).toHaveLength(1);
    expect(parsed.invitations[0]?.deliveryStatus).toBe("sent");
  });

  it("keeps archived roles so existing members still show their role", () => {
    const parsed = parseStaffAccessWorkspaceV2(
      v2([{ ...custom, archived_at: "2026-10-07T09:00:00Z" }]),
    );
    expect(parsed.roles[0]).toMatchObject({ archivedAt: "2026-10-07T09:00:00Z" });
  });

  it.each([
    ["version 1 envelope", { ...v2([builtIn]), version: 1 }],
    ["built-in with a name", v2([{ ...builtIn, name_en: "Scheduler" }])],
    ["archived built-in", v2([{ ...builtIn, archived_at: "2026-10-07T09:00:00Z" }])],
    ["unknown built-in key", v2([{ ...builtIn, key: "owner" }])],
    ["custom with a built-in key", v2([{ ...custom, key: "tenant_admin" }])],
    ["custom with a chosen key", v2([{ ...custom, key: "custom_front_desk" }])],
    ["custom without a name", v2([{ ...custom, name_ar: null }])],
    ["custom with a long name", v2([{ ...custom, name_en: "x".repeat(81) }])],
    ["unknown mode", v2([{ ...custom, location_scope_mode: "some" }])],
    ["string flag", v2([{ ...custom, assignable: "false" }])],
    ["bad archive time", v2([{ ...custom, archived_at: "soon" }])],
    ["extra role field", v2([{ ...custom, grants: [] }])],
    [
      "missing role field",
      v2([{ id: customRole, key: custom.key, is_builtin: false }]),
    ],
    ["duplicate role", v2([builtIn, builtIn])],
    [
      "bad member status",
      { ...v2([builtIn]), members: [{ ...member, status: "gone" }] },
    ],
  ])("fails closed on %s", (_name, value) => {
    expect(() => parseStaffAccessWorkspaceV2(value)).toThrow();
  });
});
