import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../published-site-content", () => ({ loadPublishedSiteContent: load }));
vi.mock("../public-page-metadata", () => ({ getPublicPageMetadata: vi.fn() }));
vi.mock("./site-frame", () => ({
  siteContainerClass: "container",
  SiteFrame: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("./read-retry", () => ({
  ReadRetry: ({ label }: { label: string }) => <span>{label}</span>,
}));
import AboutPage from "../../[locale]/about/page";
import ContactPage from "../../[locale]/contact/page";

const content = {
  contact: {
    email: "business@example.invalid",
    phone: "+15555550136",
    whatsapp: "+15555550137",
  },
  about: {
    experience: {
      en: "Twenty years serving our community",
      ar: "عشرون عامًا في خدمة مجتمعنا",
    },
    whyChooseUs: { en: "Thoughtful care", ar: "رعاية مدروسة" },
    address: { en: "136 Synthetic Street", ar: "١٣٦ شارع الاختبار" },
    mapUrl: "https://maps.example.invalid/location",
  },
};
beforeEach(() => {
  load.mockResolvedValue({
    outcome: "ready",
    content,
    revision: 1,
    revisionId: "revision",
    cacheTag: "brand:synthetic:1",
  });
});
describe("R2 R3 localized public pages", () => {
  it.each(["en", "ar"] as const)(
    "renders configured contact channels with named actions (%s)",
    async (locale) => {
      const html = renderToStaticMarkup(
        await ContactPage({ params: Promise.resolve({ locale }) }),
      );
      expect(html).toContain(locale === "en" ? "Contact" : "تواصل معنا");
      expect(html).toContain("mailto:business@example.invalid");
      expect(html).toContain("tel:+15555550136");
      expect(html).toContain("https://wa.me/15555550137");
      expect(html).toContain(
        locale === "en" ? "Message on WhatsApp" : "راسلنا على واتساب",
      );
    },
  );
  it.each(["en", "ar"] as const)(
    "renders localized plain text location and safe map affordance (%s)",
    async (locale) => {
      const html = renderToStaticMarkup(
        await AboutPage({ params: Promise.resolve({ locale }) }),
      );
      expect(html).toContain(locale === "en" ? "About" : "من نحن");
      for (const key of ["experience", "whyChooseUs", "address"] as const)
        expect(html).toContain(content.about[key][locale]);
      expect(html).toContain("https://maps.example.invalid/location");
      expect(html).toContain("tel:+15555550136");
      expect(html).not.toMatch(/<iframe|<script/u);
    },
  );
  it("hides absent tenant options and gives a successful empty explanation", async () => {
    load.mockResolvedValue({ outcome: "ready", content: {} });
    const contact = renderToStaticMarkup(
      await ContactPage({ params: Promise.resolve({ locale: "en" }) }),
    );
    const about = renderToStaticMarkup(
      await AboutPage({ params: Promise.resolve({ locale: "en" }) }),
    );
    expect(contact).toContain("Contact details are not published yet");
    expect(about).toContain("About information is not published yet");
    expect(contact + about).not.toMatch(/mailto:|tel:|wa.me|maps.example/u);
  });
  it("does not turn a read error into missing tenant information", async () => {
    load.mockResolvedValue({ outcome: "error", reason: "read" });
    for (const page of [ContactPage, AboutPage]) {
      const html = renderToStaticMarkup(
        await page({ params: Promise.resolve({ locale: "en" }) }),
      );
      expect(html).toContain('role="alert"');
      expect(html).toContain("Business information is unavailable");
      expect(html).not.toContain("not published yet");
    }
  });
});
