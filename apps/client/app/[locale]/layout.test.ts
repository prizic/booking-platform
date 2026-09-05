import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

function readBrandFixture(): string {
  for (const relativePath of [
    "../../../../instance/brand.json",
    "../../../../instance-template/instance/brand.json",
  ]) {
    const candidate = new URL(relativePath, import.meta.url);
    if (existsSync(candidate)) return readFileSync(candidate, "utf8");
  }
  throw new Error("Instance brand fixture is missing");
}

const serializedBrand = readBrandFixture();

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Client locale metadata", () => {
  it("uses the validated tenant origin for canonical and social URLs", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://client.booking.example");
    vi.stubEnv("WLBP_BRAND_CONFIG_JSON", serializedBrand);

    const [{ clientBrand }, { getClientLocaleMetadata }] = await Promise.all([
      import("../_lib/brand"),
      import("../_lib/site-metadata"),
    ]);

    const metadata = getClientLocaleMetadata("ar");

    expect(metadata).toMatchObject({
      metadataBase: new URL("https://client.booking.example/"),
      openGraph: {
        images: [
          new URL(clientBrand.assets.socialImage, "https://client.booking.example/"),
        ],
      },
      alternates: {
        canonical: new URL("https://client.booking.example/ar"),
        languages: {
          en: new URL("https://client.booking.example/en"),
          ar: new URL("https://client.booking.example/ar"),
          "x-default": new URL("https://client.booking.example/en"),
        },
      },
    });
  });

  it("fails closed when a production build has no public origin", async () => {
    const { getClientSiteOrigin } = await import("../_lib/site-origin");

    expect(() => getClientSiteOrigin("", "production")).toThrow(
      "Public site URL is required",
    );
  });
});
