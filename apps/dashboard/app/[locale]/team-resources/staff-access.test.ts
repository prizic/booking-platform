import { describe, expect, it } from "vitest";
import { parseStaffAccessCommand } from "./staff-access";
describe("staff access commands", () => {
  const requestId = "10000000-0000-4000-8000-000000000001";
  const roleId = "10000000-0000-4000-8000-000000000002";
  it("validates invitation email and built-in-role reference without changing authority", () => {
    const form = new FormData();
    form.set("operation", "invite");
    form.set("requestId", requestId);
    form.set("roleId", roleId);
    form.set("email", "Person@example.invalid");
    expect(parseStaffAccessCommand(form)?.email).toBe("person@example.invalid");
    form.set("roleId", "tenant_admin");
    expect(parseStaffAccessCommand(form)).toBeNull();
  });
  it("requires explicit revocation confirmation and a safe positive revision", () => {
    const form = new FormData();
    form.set("operation", "revoke_membership");
    form.set("requestId", requestId);
    form.set("targetId", roleId);
    form.set("expectedRevision", "1");
    expect(parseStaffAccessCommand(form)).toBeNull();
    form.set("confirm", "yes");
    expect(parseStaffAccessCommand(form)?.action).toBe("revoke_membership");
    form.set("expectedRevision", "9007199254740999");
    expect(parseStaffAccessCommand(form)).toBeNull();
  });
});
