import { afterEach, describe, expect, it, vi } from "vitest";

import { getTeamResourcesMetadata } from "../../_lib/team-resources-metadata";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Team and resources metadata", () => {
  it("emits route-specific canonical and locale alternates", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://dashboard.booking.example");

    const metadata = getTeamResourcesMetadata("ar");

    expect(metadata.alternates).toEqual({
      canonical: new URL("https://dashboard.booking.example/ar/team-resources"),
      languages: {
        ar: new URL("https://dashboard.booking.example/ar/team-resources"),
        en: new URL("https://dashboard.booking.example/en/team-resources"),
        "x-default": new URL("https://dashboard.booking.example/en/team-resources"),
      },
    });
  });
});
