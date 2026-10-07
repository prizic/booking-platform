import { describe, it, expect } from "vitest";
import { calendarRange, validCivilDate, civilDate } from "./calendar-range";
describe("civil calendar windows", () => {
  it("uses 23 and 25 hour DST days", () => {
    for (const [day, hours] of [
      ["2026-03-08", 23],
      ["2026-11-01", 25],
    ] as const) {
      const r = calendarRange(day, "America/New_York");
      expect((Date.parse(r.to) - Date.parse(r.from)) / 3600000).toBe(hours);
    }
  });
  it("refuses impossible dates and groups by a stable local date", () => {
    expect(validCivilDate("2026-02-30")).toBe(false);
    expect(civilDate("2026-10-05T22:00:00Z", "Asia/Riyadh")).toBe("2026-10-06");
    expect(() => calendarRange("2026-02-30", "Asia/Riyadh")).toThrow();
  });
});
