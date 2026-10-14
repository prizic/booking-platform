import { describe, expect, it } from "vitest";
import {
  isSafeBrandHttpsUrlV1,
  parseBookingRecoveryV1Response,
  parsePublishedBrandContentV1,
} from "./brand-content.js";

describe("published site content v1", () => {
  it("R2-R4 accepts old contact documents and keeps absent channels/stores absent", () => {
    expect(
      parsePublishedBrandContentV1({ contact: { email: "desk@example.invalid" } }),
    ).toStrictEqual({
      contact: { email: "desk@example.invalid" },
    });
    expect(parsePublishedBrandContentV1({})).toStrictEqual({});
  });
  it("omits every optional group when its input value is undefined", () => {
    const result = parsePublishedBrandContentV1({
      title: undefined,
      contact: undefined,
      about: undefined,
      appStores: undefined,
      legal: undefined,
    });
    expect(result).toStrictEqual({});
    expect(Object.keys(result)).toEqual([]);
    expect(Object.isFrozen(result)).toBe(true);
  });
  it("preserves supplied empty groups without inserting undefined fields", () => {
    const result = parsePublishedBrandContentV1({
      contact: { email: undefined, phone: undefined, whatsapp: undefined },
      about: {
        experience: undefined,
        whyChooseUs: undefined,
        address: undefined,
        mapUrl: undefined,
      },
      appStores: { appStoreUrl: undefined, googlePlayUrl: undefined },
      legal: { privacyUrl: undefined, termsUrl: undefined },
    });
    expect(result).toStrictEqual({ contact: {}, about: {}, appStores: {}, legal: {} });
  });
  it("R2-R4 projects only published public fields in both languages", () => {
    const content = {
      title: { en: "Studio", ar: "الاستوديو", secret: "ignored" },
      contact: {
        email: "desk@example.invalid",
        phone: "+12125550100",
        whatsapp: "+12125550101",
        internal: "private",
      },
      about: {
        experience: { en: "Experienced team", ar: "فريق ذو خبرة" },
        whyChooseUs: { en: "Time for you", ar: "وقت مخصص لك" },
        address: { en: "Example Avenue", ar: "شارع المثال" },
        mapUrl: "https://maps.example.invalid/place",
      },
      appStores: {
        appStoreUrl: "https://apps.apple.com/app/example",
        googlePlayUrl: "https://play.google.com/store/apps/details?id=example",
      },
      legal: { termsUrl: "https://studio.example.invalid/terms" },
      staff: [{ email: "private@example.invalid" }],
    };
    const result = parsePublishedBrandContentV1(content);
    expect(result.contact).toEqual({
      email: "desk@example.invalid",
      phone: "+12125550100",
      whatsapp: "+12125550101",
    });
    expect(result.about).toEqual(content.about);
    expect(result.appStores).toEqual(content.appStores);
    expect(result.title).toEqual({ en: "Studio", ar: "الاستوديو" });
    expect(result).not.toHaveProperty("staff");
  });
  it.each([
    "javascript:alert(1)",
    "http://maps.example.invalid",
    "https://user:pass@maps.example.invalid",
    "https://maps.example.invalid/<>x",
    "https://maps.example.invalid\\x",
    "//maps.example.invalid",
  ])("rejects unsafe URL %s", (url) => {
    expect(isSafeBrandHttpsUrlV1(url)).toBe(false);
    expect(() => parsePublishedBrandContentV1({ about: { mapUrl: url } })).toThrow(
      "brand_invalid_content",
    );
    expect(() =>
      parsePublishedBrandContentV1({ appStores: { appStoreUrl: url } }),
    ).toThrow("brand_invalid_content");
  });
  it.each([
    { contact: { whatsapp: "https://wa.me/12125550100" } },
    { contact: { phone: "212-555-0100" } },
    { about: { experience: { en: "No Arabic" } } },
    { about: { whyChooseUs: { en: "<iframe>", ar: "نص" } } },
    { about: { address: { en: "a".repeat(1001), ar: "عنوان" } } },
  ])("refuses malformed optional content", (content) => {
    expect(() => parsePublishedBrandContentV1(content)).toThrow(
      "brand_invalid_content",
    );
  });
});

describe("R5 recovery response", () => {
  it("accepts exactly the uniform acknowledgment", () => {
    expect(
      parseBookingRecoveryV1Response({ contractVersion: 1, outcome: "accepted" }),
    ).toEqual({ contractVersion: 1, outcome: "accepted" });
  });
  it.each([
    { contractVersion: 1, outcome: "found" },
    { contractVersion: 1, outcome: "accepted", bookings: [] },
    { contractVersion: 1, outcome: "accepted", token: "not-a-credential" },
    { contractVersion: 1, outcome: "accepted", count: 0 },
  ])("refuses an enumeration or credential-bearing response", (value) => {
    expect(() => parseBookingRecoveryV1Response(value)).toThrow(
      "recovery_invalid_response",
    );
  });
});
