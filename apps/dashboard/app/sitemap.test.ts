import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import sitemap from "./sitemap";

describe("Dashboard sitemap", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://dashboard.booking.example");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lists both locales and alternates for every user-facing route", () => {
    const entries = sitemap();

    expect(entries.map(({ url }) => url)).toEqual([
      "https://dashboard.booking.example/en",
      "https://dashboard.booking.example/ar",
      "https://dashboard.booking.example/en/brand-preview",
      "https://dashboard.booking.example/ar/brand-preview",
      "https://dashboard.booking.example/en/team-resources",
      "https://dashboard.booking.example/ar/team-resources",
    ]);
    expect(entries.at(-1)?.alternates?.languages).toEqual({
      ar: "https://dashboard.booking.example/ar/team-resources",
      en: "https://dashboard.booking.example/en/team-resources",
      "x-default": "https://dashboard.booking.example/en/team-resources",
    });
  });
});
