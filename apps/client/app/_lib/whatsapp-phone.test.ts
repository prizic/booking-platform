import { describe, expect, it } from "vitest";

import {
  dialCodeForRegion,
  normalizeWhatsAppNumber,
  whatsAppRegionForTimeZone,
} from "./whatsapp-phone";

describe("WhatsApp phone numbers", () => {
  it("defaults the country from the location time zone, else Saudi Arabia", () => {
    expect(whatsAppRegionForTimeZone("Asia/Dubai")).toBe("AE");
    expect(whatsAppRegionForTimeZone("Africa/Cairo")).toBe("EG");
    expect(whatsAppRegionForTimeZone("America/New_York")).toBe("SA");
    expect(dialCodeForRegion("SA")).toBe("966");
    expect(dialCodeForRegion("ZZ")).toBe("966");
  });

  it("is idempotent, so the route re-validates the browser's output unchanged", () => {
    const once = normalizeWhatsAppNumber("050 123 4567", "971");
    expect(once).toBe("+971501234567");
    expect(normalizeWhatsAppNumber(once, "971")).toBe(once);
    expect(normalizeWhatsAppNumber(once, null)).toBe(once);
  });

  it("leaves a national number unresolved when no country is known", () => {
    expect(normalizeWhatsAppNumber("0512345678", null)).toBe("0512345678");
  });
});
