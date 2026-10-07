import { describe, expect, it } from "vitest";

import { myPreferencesSchema, staffAlertKeys } from "./preferences-schema";

const valid = {
  locale: "en",
  requestId: "0a3f2b64-0000-4000-8000-000000000001",
  alerts: [{ templateKey: "staff.request_pending", enabled: false }],
  digestEnabled: true,
  digestLocalTime: "07:30",
};

describe("my email preferences schema", () => {
  it("keeps the daily agenda out of the alert list", () => {
    expect(staffAlertKeys).not.toContain("staff.daily_digest");
    expect(staffAlertKeys).toContain("staff.delivery_failed");
  });

  it("accepts a member's own choices and a wall-clock time", () => {
    expect(myPreferencesSchema.safeParse(valid).success).toBe(true);
  });

  it("refuses customer message types and malformed times", () => {
    for (const templateKey of ["booking.confirmed", "staff.daily_digest"])
      expect(
        myPreferencesSchema.safeParse({
          ...valid,
          alerts: [{ templateKey, enabled: true }],
        }).success,
        templateKey,
      ).toBe(false);
    for (const digestLocalTime of ["7:30", "24:00", "07:60", "07:30:00", ""]) {
      const parsed = myPreferencesSchema.safeParse({ ...valid, digestLocalTime });
      expect(parsed.success, digestLocalTime).toBe(false);
      if (!parsed.success) expect(parsed.error.issues[0]?.message).toBe("invalid_time");
    }
  });
});
