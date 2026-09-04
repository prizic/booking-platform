import { describe, expect, it } from "vitest";
import { negotiateLocale } from "./negotiate-locale";

const englishDefault = {
  defaultLocale: "en",
  supportedLocales: ["en", "ar"],
} as const;

describe("negotiateLocale", () => {
  it("selects Arabic when it has the highest accepted quality", () => {
    expect(negotiateLocale("en-US;q=0.7, ar-SA;q=0.9", englishDefault)).toBe("ar");
  });

  it("keeps source order when supported locales have equal quality", () => {
    expect(negotiateLocale("ar, en", englishDefault)).toBe("ar");
  });

  it("ignores unsupported and explicitly rejected locales", () => {
    expect(negotiateLocale("fr, ar;q=0, de;q=0.8", englishDefault)).toBe("en");
  });

  it("uses the generated instance default when no supported preference matches", () => {
    expect(
      negotiateLocale("fr-FR", {
        defaultLocale: "ar",
        supportedLocales: ["en", "ar"],
      }),
    ).toBe("ar");
  });
});
