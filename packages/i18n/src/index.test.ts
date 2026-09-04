import { describe, expect, it } from "vitest";

import {
  createTranslator,
  formatCurrency,
  formatNumber,
  formatTime,
  getDirection,
  isLocale,
} from "./index.js";

describe("locale foundation", () => {
  it("accepts only the supported locale prefixes", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("ar")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });

  it("derives semantic direction from the locale", () => {
    expect(getDirection("en")).toBe("ltr");
    expect(getDirection("ar")).toBe("rtl");
  });

  it("interpolates named values without concatenated message fragments", () => {
    const translate = createTranslator("en", { greeting: "Hello, {name}." });
    expect(translate("greeting", { name: "Nadia" })).toBe("Hello, Nadia.");
  });

  it("formats integer minor units using the currency exponent", () => {
    expect(formatCurrency(1250, "USD", "en")).toContain("12.50");
    expect(formatCurrency(1250, "JPY", "en")).toContain("1,250");
  });

  it("localizes semantic numbers and time while retaining the IANA zone", () => {
    expect(formatNumber(8, "ar")).toMatch(/[٠-٩]/u);
    expect(formatTime("2026-01-01T09:00:00.000Z", "ar", "UTC")).toMatch(/[٠-٩]/u);
  });
});
