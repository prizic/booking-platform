import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../published-site-content", () => ({ loadPublishedSiteContent: load }));
vi.mock("../brand", () => ({
  clientBrand: {
    tokens: {},
    appearance: { defaultTheme: "light" },
    assets: { icon: "/assets/icon.png" },
  },
}));
vi.mock("../instance-text", () => ({
  instanceText: () => (key: string, values?: { name?: string; year?: string }) =>
    key === "footer.rights"
      ? `© ${values?.year} ${values?.name}`
      : key === "footer.installApp"
        ? "Install the app"
        : "WRONG STATIC TENANT",
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/image", () => ({ default: () => null }));
import { SiteFrame } from "./site-frame";

const stores = {
  appStoreUrl: "https://apps.apple.com/app/synthetic",
  googlePlayUrl: "https://play.google.com/store/apps/details?id=synthetic",
};
beforeEach(() =>
  load.mockResolvedValue({
    outcome: "ready",
    content: {
      title: { en: "Published tenant", ar: "المنشأة المنشورة" },
      appStores: stores,
    },
  }),
);
describe("R2 R4 public chrome", () => {
  it.each(["en", "ar"] as const)(
    "has all discovery routes on one visible mobile/desktop nav and keeps the locale route (%s)",
    async (locale) => {
      const html = renderToStaticMarkup(
        await SiteFrame({ children: <p>Content</p>, locale, switchPath: "/contact" }),
      );
      for (const path of ["/services", "/about", "/contact", "/find-booking"])
        expect(html).toContain(`href="/${locale}${path}"`);
      expect(html).toContain('aria-current="page"');
      expect(html).toContain('href="/en/contact"');
      expect(html).toContain('href="/ar/contact"');
      expect(html).not.toContain("hidden items-center");
      expect(html).not.toContain("WRONG STATIC TENANT");
    },
  );
  it("keeps PWA installation alongside both configured store links", async () => {
    const html = renderToStaticMarkup(
      await SiteFrame({ children: null, locale: "en" }),
    );
    expect(html).toContain(stores.appStoreUrl);
    expect(html).toContain("https://play.google.com/store/apps/details?id=synthetic");
    expect(html).toContain('href="/en/install"');
    expect(html).toContain("Download on the App Store");
    expect(html).toContain("Get it on Google Play");
  });
  it.each([
    {},
    { appStoreUrl: stores.appStoreUrl },
    { googlePlayUrl: stores.googlePlayUrl },
  ])("hides every missing store button without inventing a URL", async (appStores) => {
    load.mockResolvedValue({ outcome: "ready", content: { appStores } });
    const html = renderToStaticMarkup(
      await SiteFrame({ children: null, locale: "en" }),
    );
    expect(html.includes("Download on the App Store")).toBe("appStoreUrl" in appStores);
    expect(html.includes("Get it on Google Play")).toBe("googlePlayUrl" in appStores);
    expect(html).toContain('href="/en/install"');
    expect(html).not.toContain("WRONG STATIC TENANT");
  });
  it("does not put management tokens or an email in language links", async () => {
    const html = renderToStaticMarkup(
      await SiteFrame({ children: null, locale: "en" }),
    );
    expect(html).toContain('href="/ar"');
    expect(html).not.toMatch(/token=|email=/u);
  });
});
