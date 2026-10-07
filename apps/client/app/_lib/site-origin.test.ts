import { afterEach, expect, it, vi } from "vitest";

import { getClientSiteOrigin } from "./site-origin";

afterEach(() => vi.unstubAllEnvs());

it("uses the running dev server's port for local URLs", () => {
  vi.stubEnv("PORT", "3003");
  expect(getClientSiteOrigin("", "development").origin).toBe("http://localhost:3003");
});

it("keeps a configured origin when a dev port is selected", () => {
  vi.stubEnv("PORT", "3003");
  expect(
    getClientSiteOrigin("https://client.booking.example", "development").origin,
  ).toBe("https://client.booking.example");
});

it("requires a configured origin in production even when PORT is set", () => {
  vi.stubEnv("PORT", "3003");
  expect(() => getClientSiteOrigin("", "production")).toThrow();
});
