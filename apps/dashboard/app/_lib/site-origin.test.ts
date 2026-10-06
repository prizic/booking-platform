import { afterEach, expect, it, vi } from "vitest";

import { getDashboardSiteOrigin } from "./site-origin";

afterEach(() => vi.unstubAllEnvs());

it("uses the running dev server's port for local URLs", () => {
  vi.stubEnv("PORT", "3004");
  expect(getDashboardSiteOrigin("", "development").origin).toBe(
    "http://localhost:3004",
  );
});

it("keeps a configured origin when a dev port is selected", () => {
  vi.stubEnv("PORT", "3004");
  expect(
    getDashboardSiteOrigin("https://dashboard.booking.example", "development").origin,
  ).toBe("https://dashboard.booking.example");
});

it("requires a configured origin in production even when PORT is set", () => {
  vi.stubEnv("PORT", "3004");
  expect(() => getDashboardSiteOrigin("", "production")).toThrow();
});
