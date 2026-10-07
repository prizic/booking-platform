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
