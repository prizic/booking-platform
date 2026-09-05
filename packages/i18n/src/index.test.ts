import { describe, expect, it } from "vitest";

import {
  assertMessageParity,
  canonicalizeTimeZone,
  createTranslator,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPlural,
  formatTime,
  formatValidationMessage,
  getDirection,
  isLocale,
  resolveZonedLocalDateTime,
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

  it("fails closed when a complete message value is missing", () => {
    const translate = createTranslator("en", {
      confirmation: "Booking {reference} starts at {time}.",
    });

    expect(() => translate("confirmation", { reference: "A-42" })).toThrow(
      "Missing en message value: time",
    );
  });

  it("formats integer minor units using the currency exponent", () => {
    expect(formatCurrency(1250, "USD", "en")).toContain("12.50");
    expect(formatCurrency(1250, "JPY", "en")).toContain("1,250");
    expect(formatCurrency(1250, "KWD", "en")).toContain("1.250");
    expect(formatCurrency(1250, "SAR", "ar")).toMatch(/[١٢]/u);
  });

  it("localizes semantic numbers and time while retaining the IANA zone", () => {
    expect(formatNumber(8, "ar")).toMatch(/[٠-٩]/u);
    expect(formatTime("2026-01-01T09:00:00.000Z", "ar", "UTC")).toMatch(/[٠-٩]/u);
  });

  it("keeps the canonical IANA timezone beside every formatted bookable time", () => {
    const instant = "2026-01-15T14:30:00.000Z";

    expect(formatTime(instant, "en", "US/Eastern")).toContain("America/New_York");
    expect(formatDateTime(instant, "ar", "Asia/Riyadh")).toContain(
      "\u2068Asia/Riyadh\u2069",
    );
  });

  it("distinguishes duplicate wall times with their localized UTC offsets", () => {
    const firstOccurrence = formatTime(
      "2026-11-01T05:30:00.000Z",
      "en",
      "America/New_York",
    );
    const secondOccurrence = formatTime(
      "2026-11-01T06:30:00.000Z",
      "en",
      "America/New_York",
    );

    expect(firstOccurrence).toContain("01:30");
    expect(secondOccurrence).toContain("01:30");
    expect(firstOccurrence).not.toBe(secondOccurrence);
    expect(firstOccurrence).toContain("GMT-04:00");
    expect(secondOccurrence).toContain("GMT-05:00");
  });

  it("rejects wall-clock strings that do not identify an instant", () => {
    expect(() => formatTime("2026-11-01T01:30:00", "en", "UTC")).toThrow(
      /explicit UTC offset/u,
    );
  });

  it("formats the calendar date in the requested IANA timezone", () => {
    expect(formatDate("2026-01-15T23:30:00.000Z", "en", "Asia/Riyadh")).toBe(
      "Jan 16, 2026",
    );
    expect(formatDate("2026-01-15T23:30:00.000Z", "ar", "Asia/Riyadh")).toMatch(
      /[١٦].*٢٠٢٦/u,
    );
  });

  it("selects locale plural rules and localizes the interpolated count", () => {
    expect(
      formatPlural(1, "en", {
        one: "{count} appointment",
        other: "{count} appointments",
      }),
    ).toBe("1 appointment");
    expect(
      formatPlural(3, "ar", {
        few: "{count} مواعيد",
        other: "{count} موعد",
      }),
    ).toBe("٣ مواعيد");
  });

  it("reports message-key parity gaps for email and downloadable catalogs", () => {
    expect(() =>
      assertMessageParity({
        en: {
          "email.confirmed": "Confirmed",
          "export.heading": "Bookings",
        },
        ar: { "email.confirmed": "تم التأكيد" },
      }),
    ).toThrow("ar missing [export.heading]");
  });

  it("formats complete bilingual validation messages by stable code", () => {
    expect(formatValidationMessage({ code: "required" }, "en")).toBe(
      "This field is required.",
    );
    const arabicGap = formatValidationMessage(
      { code: "nonexistentLocalTime", timeZone: "US/Eastern" },
      "ar",
    );
    expect(arabicGap).toContain("America/New_York");
    expect(arabicGap).toContain("غير موجود");
  });

  it("resolves an exact local wall time to one UTC instant", () => {
    expect(
      resolveZonedLocalDateTime(
        { year: 2026, month: 1, day: 16, hour: 2, minute: 30 },
        "Asia/Riyadh",
      ),
    ).toEqual({
      kind: "exact",
      instants: ["2026-01-15T23:30:00.000Z"],
    });
  });

  it("identifies a spring-forward wall time that does not exist", () => {
    expect(
      resolveZonedLocalDateTime(
        { year: 2026, month: 3, day: 8, hour: 2, minute: 30 },
        "America/New_York",
      ),
    ).toEqual({ kind: "gap", instants: [] });
  });

  it("returns both UTC instants for a repeated fall-back wall time", () => {
    expect(
      resolveZonedLocalDateTime(
        { year: 2026, month: 11, day: 1, hour: 1, minute: 30 },
        "America/New_York",
      ),
    ).toEqual({
      kind: "ambiguous",
      instants: ["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"],
    });
  });

  it("rejects numeric offsets as timezone models", () => {
    expect(() => canonicalizeTimeZone("+03:00")).toThrow(/IANA timezone/u);
  });

  it("rejects impossible local calendar values before timezone resolution", () => {
    expect(() =>
      resolveZonedLocalDateTime(
        { year: 2026, month: 2, day: 30, hour: 12, minute: 0 },
        "Asia/Riyadh",
      ),
    ).toThrow("Expected a valid local date and time");
  });
});
