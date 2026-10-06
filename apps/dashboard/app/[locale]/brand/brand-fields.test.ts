import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBrandConfig } from "@wlbp/white-label-ui";
import { brandChangedSections, brandDraftFields } from "./brand-fields";
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
function form() {
  const f = new FormData();
  for (const [key, value] of Object.entries({
    name: "Updated",
    "title-en": "Updated",
    "title-ar": "محدث",
    email: "hello@example.invalid",
    privacyUrl: "https://example.invalid/privacy",
    termsUrl: "https://example.invalid/terms",
  }))
    f.set(key, value);
  return f;
}
describe("brand editor lossless authoring", () => {
  it("retains unrepresented content, tokens and validated paths", () => {
    const result = brandDraftFields({ config, content }, form());
    expect(result.content.advanced).toEqual(content.advanced);
    expect(result.content.title).toMatchObject({ fr: "Exemple" });
    expect(result.config.assets).toEqual(config.assets);
    expect(result.config.tokens).toEqual(config.tokens);
  });
  it("refuses unreadable contrast and unsafe legal links", () => {
    const f = form();
    f.set("color-text", config.tokens.color.background);
    expect(() => brandDraftFields({ config, content }, f)).toThrow();
    const unsafe = form();
    unsafe.set("privacyUrl", "javascript:alert(1)");
    expect(() => brandDraftFields({ config, content }, unsafe)).toThrow("privacyUrl");
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
