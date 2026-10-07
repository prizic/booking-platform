import { describe, expect, it } from "vitest";
import { staffAccessSchema, type StaffAccessInput } from "./staff-access-schema";

const requestId = "10000000-0000-4000-8000-000000000001";
const roleId = "10000000-0000-4000-8000-000000000002";

function input(overrides: Partial<StaffAccessInput>): StaffAccessInput {
  return {
    locale: "en",
    operation: "invite",
    requestId,
    targetId: "",
    expectedRevision: "",
    roleId: "",
    locationIds: [],
    email: "",
    ...overrides,
  };
}

describe("staff access commands", () => {
  it("validates invitation email and built-in-role reference without changing authority", () => {
    const invite = input({ roleId, email: "Person@example.invalid" });
    expect(staffAccessSchema.parse(invite).email).toBe("person@example.invalid");
    expect(
      staffAccessSchema.safeParse({ ...invite, roleId: "tenant_admin" }).success,
    ).toBe(false);
    expect(
      staffAccessSchema.safeParse({ ...invite, email: "no-at-sign" }).success,
    ).toBe(false);
  });
  it("requires explicit revocation confirmation and a safe positive revision", () => {
    const revoke = input({
      operation: "revoke_membership",
      targetId: roleId,
      expectedRevision: "1",
    });
    expect(staffAccessSchema.safeParse(revoke).success).toBe(false);
    expect(staffAccessSchema.parse({ ...revoke, confirm: "yes" }).action).toBe(
      "revoke_membership",
    );
    expect(
      staffAccessSchema.safeParse({
        ...revoke,
        confirm: "yes",
        expectedRevision: "9007199254740999",
      }).success,
    ).toBe(false);
    expect(
      staffAccessSchema.safeParse({ ...revoke, confirm: "yes", expectedRevision: "0" })
        .success,
    ).toBe(false);
  });
  it("produces the command the access RPC receives", () => {
    const location = "10000000-0000-4000-8000-000000000003";
    expect(
      staffAccessSchema.parse(
        input({
          operation: "edit_membership",
          targetId: roleId,
          expectedRevision: "4",
          roleId,
          locationIds: [location],
        }),
      ),
    ).toEqual({
      action: "edit_membership",
      requestId,
      targetId: roleId,
      roleId,
      expectedRevision: 4,
      locationIds: [location],
      email: null,
    });
    expect(
      staffAccessSchema.safeParse(input({ roleId, locationIds: ["not-an-id"] }))
        .success,
    ).toBe(false);
  });
});
