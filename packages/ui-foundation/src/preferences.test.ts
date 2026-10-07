import { describe, expect, it } from "vitest";

import {
  LOCALE_COOKIE,
  THEME_COOKIE,
  preferenceCookie,
  resolveTheme,
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

describe("preferenceCookie", () => {
  it("writes a year-long, path-wide, lax cookie", () => {
    expect(preferenceCookie(THEME_COOKIE, "dark")).toBe(
      "wlbp-theme=dark; Path=/; Max-Age=31536000; SameSite=Lax",
    );
    expect(LOCALE_COOKIE).toBe("wlbp-locale");
  });
});
