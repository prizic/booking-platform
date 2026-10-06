import { describe, expect, it } from "vitest";
import { occupiesStartCell } from "./calendar-cells";
describe("calendar carryover", () => {
  it("keeps an overnight appointment visible on the following day", () => {
    expect(
      occupiesStartCell(
        "2026-10-04T23:30:00Z",
        "2026-10-05T01:00:00Z",
        "2026-10-05",
        0,
        "UTC",
      ),
    ).toBe(true);
    expect(
      occupiesStartCell(
        "2026-10-04T23:30:00Z",
        "2026-10-05T00:00:00Z",
        "2026-10-05",
        0,
        "UTC",
      ),
    ).toBe(false);
    expect(
      occupiesStartCell(
        "2026-10-04T23:30:00Z",
        "2026-10-05T01:00:00Z",
        "2026-10-05",
        1,
        "UTC",
      ),
    ).toBe(false);
  });
});
