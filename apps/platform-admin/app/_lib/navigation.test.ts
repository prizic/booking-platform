import { describe, expect, it } from "vitest";
import { getNavigation, isActive, navHref } from "./navigation";

describe("navigation", () => {
  it("lists every area once, grouped, with bilingual labels", () => {
    const en = getNavigation("en").flatMap((g) => g.items);
    const ar = getNavigation("ar").flatMap((g) => g.items);
    expect(new Set(en.map((i) => i.key)).size).toBe(15);
    expect(ar.every((i) => /[؀-ۿ]/u.test(i.label))).toBe(true);
  });
  it("builds locale-prefixed hrefs", () => {
    expect(navHref("ar", "overview")).toBe("/ar");
    expect(navHref("en", "tenants")).toBe("/en/tenants");
  });
  it("marks the overview active only on itself, others on their subtree", () => {
    expect(isActive("/en", "/en", "en")).toBe(true);
    expect(isActive("/en/tenants", "/en", "en")).toBe(false);
    expect(isActive("/en/tenants/abc", "/en/tenants", "en")).toBe(true);
    expect(isActive("/en/tenants-old", "/en/tenants", "en")).toBe(false);
  });
});
