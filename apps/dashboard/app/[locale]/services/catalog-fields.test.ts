import { describe, expect, it } from "vitest";
import {
  CATALOG_NO_LINK,
  catalogDraftDocument,
  catalogPriceInput,
} from "./catalog-fields";
describe("exact service money editing", () => {
  it("round-trips the largest safe minor amount without floating division", () => {
    expect(catalogPriceInput(9007199254740991)).toBe("90071992547409.91");
    expect(catalogPriceInput(1)).toBe("0.01");
    expect(catalogPriceInput(0)).toBe("0.00");
  });
  it("rejects values outside the integer contract", () => {
    for (const value of [-1, 0.1, Number.POSITIVE_INFINITY, 9007199254740992])
      expect(() => catalogPriceInput(value)).toThrow();
  });
});
describe("service link selects", () => {
  const location = "10000000-0000-4000-8000-000000000001";
  const category = "10000000-0000-4000-8000-000000000002";
  function serviceForm(links: Record<string, string>) {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      key: "consultation",
      name_en: "Consultation",
      name_ar: "استشارة",
      description_en: "",
      description_ar: "",
      currency: "USD",
      price: "10.00",
      duration_minutes: "30",
      buffer_before_minutes: "0",
      buffer_after_minutes: "0",
      tax_rate_bps: "0",
      payment_mode: "none",
      booking_mode: "appointment",
      assignment_mode: "any_available",
      fixed_staff_id: "",
      location_ids: location,
      consent_version: "1",
      consent_en: "I agree.",
      consent_ar: "أوافق.",
      deposit_percent_bps: "5000",
      intake_count: "0",
      ...links,
    }))
      form.set(key, value);
    return form;
  }
  it("reads the explicit no-link sentinel as no link", () => {
    const document = catalogDraftDocument(
      "service",
      serviceForm({ category_id: CATALOG_NO_LINK, resource_type_id: CATALOG_NO_LINK }),
      undefined,
      true,
    );
    expect(document?.metadata).toMatchObject({
      category_id: null,
      resource_type_id: null,
      fixed_staff_id: null,
    });
  });
  it("keeps a chosen link and still refuses any other non-identifier value", () => {
    const chosen = catalogDraftDocument(
      "service",
      serviceForm({ category_id: category, resource_type_id: CATALOG_NO_LINK }),
      undefined,
      true,
    );
    expect(chosen?.metadata).toMatchObject({ category_id: category });
    expect(
      catalogDraftDocument(
        "service",
        serviceForm({ category_id: "all", resource_type_id: CATALOG_NO_LINK }),
        undefined,
        true,
      ),
    ).toBeNull();
  });
});
