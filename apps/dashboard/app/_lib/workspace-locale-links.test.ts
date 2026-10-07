import { describe, expect, it } from "vitest";
import { workspaceLocaleHref } from "./workspace-locale-links";

describe("workspace locale links", () => {
  it("retains detail identity and supported filters", () => {
    expect(workspaceLocaleHref("ar", "/en/bookings/booking-1", "")).toBe(
      "/ar/bookings/booking-1",
    );
    expect(
      workspaceLocaleHref("ar", "/en/calendar", "?date=2035-09-24&view=week"),
    ).toBe("/ar/calendar?date=2035-09-24&view=week");
  });
  it("rejects unsafe paths and strips secrets and personal search terms", () => {
    for (const path of [
      "//example.invalid",
      "https://example.invalid",
      "/en/%2f%2fevil",
      "/en/\\evil",
    ])
      expect(workspaceLocaleHref("en", path, "")).toBe("/en/today");
    expect(
      workspaceLocaleHref(
        "ar",
        "/en/calendar",
        "?code=secret&previewToken=secret&query=contact&view=list",
      ),
    ).toBe("/ar/calendar?view=list");
    expect(workspaceLocaleHref("ar", "/en/auth/update-password", "?code=secret")).toBe(
      "/ar/today",
    );
  });
});
