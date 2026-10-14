import { afterEach, describe, expect, it, vi } from "vitest";
const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("./published-site-content", () => ({ loadPublishedSiteContent: load }));
import { getPublicPageMetadata } from "./public-page-metadata";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("R2 R3 R5 public route metadata", () => {
  it("keeps canonical and language alternates on the selected public route", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://client.tenant.example.invalid");
    load.mockResolvedValue({
      outcome: "ready",
      content: { title: { en: "Published Business", ar: "المنشأة المنشورة" } },
    });
    const result = await getPublicPageMetadata("ar", "/about", "about");
    expect(result.title).toBe("من نحن · المنشأة المنشورة");
    expect(result.alternates?.canonical).toEqual(
      new URL("https://client.tenant.example.invalid/ar/about"),
    );
    expect(result.alternates?.languages).toMatchObject({
      en: new URL("https://client.tenant.example.invalid/en/about"),
      ar: new URL("https://client.tenant.example.invalid/ar/about"),
    });
  });
  it("does not substitute a static tenant identity when published content is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://client.tenant.example.invalid");
    load.mockResolvedValue({ outcome: "empty" });
    expect((await getPublicPageMetadata("en", "/contact", "contact")).title).toBe(
      "Contact",
    );
  });
});
