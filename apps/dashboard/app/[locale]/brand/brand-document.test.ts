import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBrandConfig } from "@wlbp/white-label-ui";
import { brandChangedSections, brandDraft } from "./brand-document";
import {
  brandEditorSchema,
  brandPreviewSchema,
  brandPublishSchema,
  brandRollbackSchema,
  type BrandEditorInput,
} from "./brand-schema";
const sourceBrand = new URL(
  "../../../../../instance-template/instance/brand.json",
  import.meta.url,
);
const fixtureBrand = existsSync(sourceBrand)
  ? sourceBrand
  : new URL("../../../../../instance/brand.json", import.meta.url);
const config = parseBrandConfig(JSON.parse(readFileSync(fixtureBrand, "utf8")));
const content = {
  title: { en: "Example", ar: "مثال", fr: "Exemple" },
  contact: { email: "hello@example.invalid", phone: "+10000000000" },
  legal: {
    privacyUrl: "https://example.invalid/privacy",
    termsUrl: "https://example.invalid/terms",
  },
  advanced: { retained: true },
};
function input(overrides: Partial<BrandEditorInput> = {}): BrandEditorInput {
  return {
    locale: "en",
    brandKey: "example",
    contentHash: "",
    name: "Updated",
    titleEn: "Updated",
    titleAr: "محدث",
    email: "hello@example.invalid",
    privacyUrl: "https://example.invalid/privacy",
    termsUrl: "https://example.invalid/terms",
    colors: { ...config.tokens.color },
    fonts: {
      bodyFamily: config.tokens.typography.bodyFamily,
      displayFamily: config.tokens.typography.displayFamily,
      arabicBodyFamily: config.tokens.typography.arabicBodyFamily,
      arabicDisplayFamily: config.tokens.typography.arabicDisplayFamily,
    },
    ...overrides,
  };
}
function issues(values: BrandEditorInput) {
  const parsed = brandEditorSchema.safeParse(values);
  return parsed.success
    ? []
    : parsed.error.issues.map((issue) => `${issue.path.join(".")}:${issue.message}`);
}
describe("brand editor lossless authoring", () => {
  it("retains unrepresented content, tokens and validated paths", () => {
    const result = brandDraft({ config, content }, brandEditorSchema.parse(input()));
    expect(result.content.advanced).toEqual(content.advanced);
    expect(result.content.title).toMatchObject({ fr: "Exemple" });
    expect(result.config.assets).toEqual(config.assets);
    expect(result.config.tokens).toEqual(config.tokens);
  });
  it("refuses unreadable contrast and unsafe legal links", () => {
    const unreadable = brandEditorSchema.parse(
      input({
        colors: { ...config.tokens.color, text: config.tokens.color.background },
      }),
    );
    expect(() => brandDraft({ config, content }, unreadable)).toThrow();
    expect(issues(input({ privacyUrl: "javascript:alert(1)" }))).toContain(
      "privacyUrl:brand_link_invalid",
    );
    expect(issues(input({ termsUrl: "http://example.invalid/terms" }))).toContain(
      "termsUrl:brand_link_invalid",
    );
    expect(issues(input({ termsUrl: "https://user:pw@example.invalid/" }))).toContain(
      "termsUrl:brand_link_invalid",
    );
  });
  it("requires both display names, a contact email and hex colours", () => {
    expect(issues(input({ titleAr: " " }))).toContain("titleAr:required");
    expect(issues(input({ titleEn: "x".repeat(161) }))).toContain("titleEn:too_long");
    expect(issues(input({ email: "nobody" }))).toContain("email:invalid_email");
    expect(
      issues(input({ colors: { ...config.tokens.color, primary: "blue" } })),
    ).toContain("colors.primary:brand_color_invalid");
    expect(issues(input({ contentHash: "not-a-hash" }))).toContain(
      "contentHash:invalid",
    );
  });
  it("reports actual changed sections", () => {
    const draft = {
      brandKey: "example",
      revisionId: "id",
      revision: 2,
      state: "draft",
      contentHash: "a".repeat(64),
      config: { ...config, name: "Changed" },
      content,
      published: { config, content },
    };
    expect(brandChangedSections(draft)).toEqual(["identity"]);
  });
});
describe("brand publication, rollback and preview", () => {
  it("requires the explicit confirmation from the dialog", () => {
    const publish = { locale: "en", brandRevisionId: "r", contentHash: "a".repeat(64) };
    expect(brandPublishSchema.safeParse(publish).success).toBe(false);
    expect(brandPublishSchema.safeParse({ ...publish, confirm: "yes" }).success).toBe(
      true,
    );
    const rollback = { locale: "en", brandId: "b", toRevision: "1" };
    expect(brandRollbackSchema.safeParse(rollback).success).toBe(false);
    expect(brandRollbackSchema.parse({ ...rollback, confirm: "yes" }).toRevision).toBe(
      1,
    );
    expect(
      brandRollbackSchema.safeParse({ ...rollback, confirm: "yes", toRevision: "1.5" })
        .success,
    ).toBe(false);
  });
  it("previews only a revision identifier", () => {
    expect(
      brandPreviewSchema.safeParse({ locale: "en", brandRevisionId: "../x" }).success,
    ).toBe(false);
  });
});

describe("optional tenant Contact About and store content", () => {
  it("persists the exact optional contract and preserves unrelated content", () => {
    const values = brandEditorSchema.parse(
      input({
        phone: "+966500000001",
        whatsapp: "+966500000002",
        experienceEn: "Experience",
        experienceAr: "الخبرة",
        whyChooseUsEn: "Choose us",
        whyChooseUsAr: "اخترنا",
        addressEn: "Address",
        addressAr: "العنوان",
        mapUrl: "https://example.invalid/map",
        appStoreUrl: "https://example.invalid/app",
        googlePlayUrl: "https://example.invalid/play",
      }),
    );
    const draft = brandDraft({ config, content }, values);
    expect(draft.content.contact).toMatchObject({
      email: content.contact.email,
      phone: values.phone,
      whatsapp: values.whatsapp,
    });
    expect(draft.content.about).toEqual({
      experience: { en: "Experience", ar: "الخبرة" },
      whyChooseUs: { en: "Choose us", ar: "اخترنا" },
      address: { en: "Address", ar: "العنوان" },
      mapUrl: values.mapUrl,
    });
    expect(draft.content.appStores).toEqual({
      appStoreUrl: values.appStoreUrl,
      googlePlayUrl: values.googlePlayUrl,
    });
    expect(draft.content.advanced).toEqual(content.advanced);
  });
  it("clears optional fields while old inputs preserve fields they do not represent", () => {
    const base = {
      ...content,
      about: { experience: { en: "Experience", ar: "الخبرة" } },
      appStores: { appStoreUrl: "https://example.invalid/app" },
    };
    const legacyInput = brandEditorSchema.parse(input());
    const preserved = brandDraft({ config, content: base }, legacyInput).content;
    expect(preserved.title).toEqual({
      en: legacyInput.titleEn,
      ar: legacyInput.titleAr,
      fr: base.title.fr,
    });
    expect(preserved.contact).toEqual(base.contact);
    expect(preserved.about).toEqual(base.about);
    expect(preserved.appStores).toEqual(base.appStores);
    expect(preserved.advanced).toEqual(base.advanced);
    expect(preserved.legal).toEqual(base.legal);
    const cleared = brandDraft(
      { config, content: base },
      brandEditorSchema.parse(
        input({ phone: "", experienceEn: "", experienceAr: "", appStoreUrl: "" }),
      ),
    ).content;
    expect(cleared).not.toHaveProperty("about");
    expect(cleared).not.toHaveProperty("appStores");
    expect(cleared.contact).not.toHaveProperty("phone");
  });
  it("refuses locale gaps markup long address unsafe URL schemes credentials and non-E164 numbers", () => {
    expect(issues(input({ experienceEn: "Experience", experienceAr: "" }))).toContain(
      "experienceAr:brand_locale_pair",
    );
    expect(
      issues(input({ addressEn: "x".repeat(1001), addressAr: "العنوان" })),
    ).toContain("addressEn:too_long");
    expect(
      issues(input({ experienceEn: "<script>", experienceAr: "الخبرة" })),
    ).toContain("experienceEn:unsafe-content");
    for (const mapUrl of [
      "javascript:alert(1)",
      "http://example.invalid/map",
      "https://user:pw@example.invalid/map",
    ])
      expect(brandEditorSchema.safeParse(input({ mapUrl })).success).toBe(false);
    expect(issues(input({ phone: "0500000001" }))).toContain(
      "phone:brand_phone_invalid",
    );
    expect(issues(input({ whatsapp: "https://wa.me/966500000001" }))).toContain(
      "whatsapp:too_long",
    );
  });
});
