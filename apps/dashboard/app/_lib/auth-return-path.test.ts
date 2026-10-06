import { describe, expect, it } from "vitest";
import { assertMessageParity } from "@wlbp/i18n";
import { normalizeAuthReturnPath } from "./auth-return-path";
import { authCopy } from "./auth-copy";
describe("staff auth navigation", () => {
  it("rejects external, callback, traversal and malformed destinations", () => {
    for (const path of [
      "//evil.test",
      "https://evil.test",
      "/en/auth/callback",
      "/en/bookings/%2e%2e",
      "/xx/today",
      "/en/bookings/../settings",
      "/en/\\evil",
      "/en/unknown",
    ])
      expect(normalizeAuthReturnPath("ar", path)).toBe("/ar/today");
  });
  it("retains local detail identity and safe filters while stripping secrets", () => {
    expect(normalizeAuthReturnPath("ar", "/en/bookings/booking-1")).toBe(
      "/ar/bookings/booking-1",
    );
    expect(normalizeAuthReturnPath("en", "/en/calendar?view=week&code=secret")).toBe(
      "/en/calendar?view=week",
    );
  });
  it("ships recovery and security copy in both locales", () => {
    expect(() => assertMessageParity(authCopy)).not.toThrow();
  });
});
