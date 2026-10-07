import { formatDateTime } from "@wlbp/i18n";
import { describe, expect, it } from "vitest";

import { formatWallDateTime } from "./wall-time";

describe("formatWallDateTime", () => {
  it("formats the same wall time as formatDateTime, without the zone suffix", () => {
    const instant = "2035-09-24T13:00:00.000Z";
    for (const locale of ["en", "ar"] as const) {
      const wall = formatWallDateTime(instant, locale, "Asia/Riyadh");
      expect(formatDateTime(instant, locale, "Asia/Riyadh").startsWith(wall)).toBe(
        true,
      );
      expect(wall).not.toContain("Asia/Riyadh");
    }
    expect(formatWallDateTime(instant, "ar", "Asia/Riyadh")).toMatch(/[٠-٩]/u);
  });
});
