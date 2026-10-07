import { describe, expect, it } from "vitest";
import { getWorkspaceNavigation } from "./workspace-navigation";

describe("workspace navigation", () => {
  it("advertises only enabled real destinations and one current section", () => {
    const rows = getWorkspaceNavigation({
      locale: "en",
      current: "bookings",
      enabledSections: ["today", "bookings"],
    });
    expect(rows.map((row) => row.href)).toEqual(["/en/today", "/en/bookings"]);
    expect(rows.filter((row) => row.active).map((row) => row.section)).toEqual([
      "bookings",
    ]);
    expect(
      getWorkspaceNavigation({ locale: "en", current: "today", enabledSections: [] }),
    ).toEqual([]);
  });
  it("localizes the complete module vocabulary", () => {
    const rows = getWorkspaceNavigation({
      locale: "ar",
      current: "services",
      enabledSections: [
        "services",
        "categories",
        "locations",
        "communications",
        "integrations",
        "audit",
      ],
    });
    expect(rows).toHaveLength(6);
    expect(
      rows.every(
        (row) => row.href.startsWith("/ar/") && /[\u0600-\u06ff]/u.test(row.label),
      ),
    ).toBe(true);
  });
});
