import { describe, expect, it } from "vitest";

import {
  LOCALE_COOKIE,
  THEME_COOKIE,
  preferenceCookie,
  resolveTheme,
  resolveSidebarCollapsed,
  SIDEBAR_COOKIE,
} from "./preferences.js";

describe("resolveTheme", () => {
  it("uses the brand default for a first visit", () => {
    expect(resolveTheme(undefined, "light", true)).toBe("light");
    expect(resolveTheme(undefined, "dark", true)).toBe("dark");
  });

  it("honours the visitor's saved choice", () => {
    expect(resolveTheme("dark", "light", true)).toBe("dark");
    expect(resolveTheme("light", "dark", true)).toBe("light");
  });

  it("ignores tampered values and brands without a dark palette", () => {
    expect(resolveTheme("purple", "light", true)).toBe("light");
    expect(resolveTheme("dark", "light", false)).toBe("light");
  });
});

describe("desktop sidebar preference", () => {
  it("resolves saved choices for server rendering and ignores malformed cookies", () => {
    expect(resolveSidebarCollapsed(undefined)).toBe(false);
    expect(resolveSidebarCollapsed("collapsed")).toBe(true);
    expect(resolveSidebarCollapsed("expanded", true)).toBe(false);
    expect(resolveSidebarCollapsed("unexpected")).toBe(false);
    expect(resolveSidebarCollapsed("unexpected", true)).toBe(true);
    expect(preferenceCookie(SIDEBAR_COOKIE, "collapsed")).toBe(
      "wlbp-sidebar=collapsed; Path=/; Max-Age=31536000; SameSite=Lax",
    );
  });
});

describe("preferenceCookie", () => {
  it("writes a year-long, path-wide, lax cookie", () => {
    expect(preferenceCookie(THEME_COOKIE, "dark")).toBe(
      "wlbp-theme=dark; Path=/; Max-Age=31536000; SameSite=Lax",
    );
    expect(LOCALE_COOKIE).toBe("wlbp-locale");
  });
});
