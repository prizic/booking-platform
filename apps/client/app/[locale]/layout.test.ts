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

function readContentFixture(): string {
  for (const relativePath of [
    "../../../../instance/content/",
    "../../../../instance-template/instance/content/",
  ]) {
    const directory = new URL(relativePath, import.meta.url);
    if (existsSync(new URL("en.json", directory))) {
      return JSON.stringify({
        en: JSON.parse(readFileSync(new URL("en.json", directory), "utf8")),
        ar: JSON.parse(readFileSync(new URL("ar.json", directory), "utf8")),
      });
    }
  }
  throw new Error("Instance content fixture is missing");
}

const serializedBrand = readBrandFixture();
const serializedContent = readContentFixture();

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Client locale metadata", () => {
  // Cold-imports the metadata helpers and the pure parser entrypoints on first run.
  it("uses the validated tenant origin for canonical and social URLs", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://client.booking.example");
    vi.stubEnv("WLBP_BRAND_CONFIG_JSON", serializedBrand);
    vi.stubEnv("WLBP_INSTANCE_CONTENT_JSON", serializedContent);

    const [{ clientBrand }, { getClientLocaleMetadata }] = await Promise.all([
      import("../_lib/brand"),
      import("../_lib/site-metadata"),
    ]);

    const metadata = getClientLocaleMetadata("ar");
    const content = JSON.parse(serializedContent) as {
      ar: Record<string, string>;
    };

    expect(metadata).toMatchObject({
      title: content.ar["site.title"],
      description: content.ar["site.description"],
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
          // The generated instance-locale-policy.json defaults to Arabic.
          "x-default": new URL("https://client.booking.example/ar"),
        },
      },
    });
  }, 20_000);

  it("uses English x-default when the instance configures it", async () => {
    vi.resetModules();
    vi.doMock("../_lib/locale-policy", () => ({
      instanceLocalePolicy: {
        defaultLocale: "en",
        supportedLocales: ["ar", "en"],
      },
    }));
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://client.booking.example");
    vi.stubEnv("WLBP_BRAND_CONFIG_JSON", serializedBrand);
    vi.stubEnv("WLBP_INSTANCE_CONTENT_JSON", serializedContent);

    const { getClientLocaleMetadata } = await import("../_lib/site-metadata");
    const metadata = getClientLocaleMetadata("en");

    expect(metadata.alternates?.languages).toMatchObject({
      "x-default": new URL("https://client.booking.example/en"),
    });
    vi.doUnmock("../_lib/locale-policy");
  }, 20_000);

  it("fails closed when a production build has no public origin", async () => {
    const { getClientSiteOrigin } = await import("../_lib/site-origin");

    expect(() => getClientSiteOrigin("", "production")).toThrow(
      "Public site URL is required",
    );
  });
});
