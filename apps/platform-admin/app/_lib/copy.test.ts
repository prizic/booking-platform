import { describe, expect, it } from "vitest";
import * as shared from "./copy";

import * as c0 from "./auth-copy";
import * as c1 from "./audit-copy";
import * as c2 from "./action-copy";
import * as c3 from "./operations-copy";
import * as c4 from "./commercial-copy";
import * as c5 from "./release-copy";
import * as c6 from "./health-support-copy";
import * as c7 from "./admin-copy";
import * as c8 from "../[locale]/(console)/copy";
import * as c9 from "../[locale]/(console)/tenants/copy";
// Each route task appends its copy module here, e.g.
// import * as tenants from "../[locale]/(console)/tenants/copy";
const modules: Record<string, Record<string, unknown>> = {
  shared,
  c0,
  c1,
  c2,
  c3,
  c4,
  c5,
  c6,
  c7,
  c8,
  c9,
};

describe("copy parity", () => {
  for (const [name, module] of Object.entries(modules)) {
    it(`${name}: every entry has English and Arabic text`, () => {
      expect(() => shared.assertCopyTree(module, name)).not.toThrow();
    });
  }

  it("fill substitutes named values in both languages", () => {
    const copy = ["{count} jobs", "{count} مهام"] as const;
    expect(shared.fill("en", copy, { count: "3" })).toBe("3 jobs");
    expect(shared.fill("ar", copy, { count: "٣" })).toBe("٣ مهام");
  });

  it("unknown codes fall back to a localized label, never an English-only code", () => {
    expect(shared.copyFor(shared.statusCopy, "weird_state", "ar")).toBe(
      "حالة غير معروفة",
    );
  });

  it("every error code the database can raise has copy", () => {
    for (const code of [
      "policy_denied",
      "recent_authentication_required",
      "not_found",
      "stale_revision",
      "reason_required",
      "last_admin_protected",
      "idempotency_conflict",
      "unavailable",
    ]) {
      expect(shared.errorCopy).toHaveProperty(code);
    }
  });
});
