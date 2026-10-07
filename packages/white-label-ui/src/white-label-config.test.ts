import { describe, expect, it } from "vitest";

import { parseBrandConfig } from "./brand-config.js";
import { neutralBrandTokens, validateBrandTokens } from "./brand-tokens.js";
import { createInstanceText, parseInstanceContent } from "./instance-content.js";
import { brandSupportsDarkMode, createBrandStyle } from "./index.js";

const darkColors = {
  background: "#0c0a09",
  surface: "#1c1917",
  text: "#f5f5f4",
  muted: "#a8a29e",
  border: "#78716c",
  primary: "#f26b6b",
  onPrimary: "#1c0a0a",
  success: "#4ade80",
  onSuccess: "#052e16",
  warning: "#facc15",
  onWarning: "#1c1917",
  danger: "#f87171",
  onDanger: "#1c0a0a",
  focus: "#fb923c",
};

const assets = {
  logoLight: "/assets/logo-light.png",
  logoDark: "/assets/logo-dark.png",
  icon: "/assets/icon.png",
  favicon: "/assets/favicon.png",
  socialImage: "/assets/social.png",
};

describe("dark palette tokens", () => {
  it("accepts a contrast-valid dark palette and emits its variables", () => {
    const tokens = { ...neutralBrandTokens, colorDark: darkColors };
    expect(validateBrandTokens(tokens)).toEqual([]);
    expect(brandSupportsDarkMode(tokens)).toBe(true);
    expect(createBrandStyle(tokens)).toMatchObject({
      "--brand-dark-color-background": "#0c0a09",
      "--brand-dark-color-on-primary": "#1c0a0a",
      "--brand-color-background": neutralBrandTokens.color.background,
    });
  });

  it("refuses an unreadable dark palette with a colorDark-scoped issue", () => {
    const issues = validateBrandTokens({
      ...neutralBrandTokens,
      colorDark: { ...darkColors, text: "#1c1917" },
    });
    expect(
      issues.some((issue) =>
        issue.startsWith("colorDark.text on colorDark.background"),
      ),
    ).toBe(true);
  });

  it("emits no dark variables when the brand has no dark palette", () => {
    expect(brandSupportsDarkMode(neutralBrandTokens)).toBe(false);
    expect(
      Object.keys(createBrandStyle(neutralBrandTokens)).some((key) =>
        key.includes("dark"),
      ),
    ).toBe(false);
  });
});

describe("brand appearance", () => {
  it("defaults to the light theme", () => {
    expect(
      parseBrandConfig({ name: "X", assets, tokens: neutralBrandTokens }).appearance,
    ).toEqual({
      defaultTheme: "light",
    });
  });

  it("refuses a dark default without a dark palette", () => {
    expect(() =>
      parseBrandConfig({
        name: "X",
        assets,
        tokens: neutralBrandTokens,
        appearance: { defaultTheme: "dark" },
      }),
    ).toThrow(/requires tokens.colorDark/u);
  });

  it("refuses unknown appearance options", () => {
    expect(() =>
      parseBrandConfig({
        name: "X",
        assets,
        tokens: neutralBrandTokens,
        appearance: { defaultTheme: "light", font: "Comic" },
      }),
    ).toThrow(/unexpected key/u);
  });
});

describe("instance content", () => {
  const content = parseInstanceContent({
    en: { "brand.name": "Your Business", "home.greeting": "Welcome, {name}" },
    ar: { "brand.name": "منشأتك", "home.greeting": "أهلاً {name}" },
  });

  it("translates and interpolates per locale", () => {
    expect(createInstanceText(content, "ar")("home.greeting", { name: "سارة" })).toBe(
      "أهلاً سارة",
    );
    expect(createInstanceText(content, "en")("brand.name")).toBe("Your Business");
  });

  it("fails loudly on a missing key instead of falling back to English", () => {
    expect(() => createInstanceText(content, "ar")("home.missing")).toThrow(
      /missing "home.missing"/u,
    );
  });

  it("refuses mismatched locales and empty strings", () => {
    expect(() => parseInstanceContent({ en: { a: "A" }, ar: {} })).toThrow(
      /identical keys/u,
    );
    expect(() => parseInstanceContent({ en: { a: " " }, ar: { a: "أ" } })).toThrow(
      /non-empty/u,
    );
  });
});
