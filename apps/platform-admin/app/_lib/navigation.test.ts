import { describe, expect, it } from "vitest";
import { getNavigation, isActive, navHref } from "./navigation";

describe("navigation", () => {
  it("lists every area once, grouped, with bilingual labels", () => {
    const en = getNavigation("en").flatMap((g) => g.items);
    const ar = getNavigation("ar").flatMap((g) => g.items);
    const expected = [
      "overview",
      "tenants",
      "instances",
      "domains",
      "provisioning",
      "jobs",
      "plans",
      "subscriptions",
      "releases",
      "rollouts",
      "review",
      "health",
      "support",
      "operators",
      "audit",
      "settings",
    ];
    expect(en.map((i) => i.key)).toEqual(expected);
    expect(ar.map((i) => i.key)).toEqual(expected);
    expect(new Set(en.map((i) => i.key)).size).toBe(16);
    expect(ar.every((i) => /[؀-ۿ]/u.test(i.label))).toBe(true);
  });
  it("builds locale-prefixed hrefs", () => {
    expect(navHref("ar", "overview")).toBe("/ar");
    expect(navHref("en", "tenants")).toBe("/en/tenants");
    expect(navHref("en", "review")).toBe("/en/review");
    expect(navHref("ar", "review")).toBe("/ar/review");
  });
  it("places operator Review in Operations and keeps it active on the selected review", () => {
    for (const locale of ["en", "ar"] as const) {
      const group = getNavigation(locale).find((g) => g.group === "operations");
      expect(group?.items.find((i) => i.key === "review")).toMatchObject({
        href: `/${locale}/review`,
        label: locale === "en" ? "Review" : "المراجعة",
      });
      expect(
        isActive(`/${locale}/review/job/record`, `/${locale}/review`, locale),
      ).toBe(true);
      expect(
        isActive(`/${locale}/review/support/record`, `/${locale}/review`, locale),
      ).toBe(true);
      expect(isActive(`/${locale}/reviews`, `/${locale}/review`, locale)).toBe(false);
    }
  });
  it("marks the overview active only on itself, others on their subtree", () => {
    expect(isActive("/en", "/en", "en")).toBe(true);
    expect(isActive("/en/tenants", "/en", "en")).toBe(false);
    expect(isActive("/en/tenants/abc", "/en/tenants", "en")).toBe(true);
    expect(isActive("/en/tenants-old", "/en/tenants", "en")).toBe(false);
  });
});
