import { describe, expect, it } from "vitest";
import { catalogDraftDocument } from "./catalog-document";
import {
  CATALOG_NO_LINK,
  catalogContentSchema,
  catalogDraftSchema,
  catalogPriceInput,
  catalogPublicationSchema,
  type CatalogEditorValues,
} from "./catalog-schema";

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

const location = "10000000-0000-4000-8000-000000000001";
const category = "10000000-0000-4000-8000-000000000002";
const requestId = "10000000-0000-4000-8000-000000000003";

function service(overrides: Partial<CatalogEditorValues> = {}): CatalogEditorValues {
  return {
    locale: "en",
    kind: "service",
    entityId: "",
    expectedRevision: "",
    requestId,
    key: "consultation",
    retire: false,
    name_en: "Consultation",
    name_ar: "استشارة",
    description_en: "",
    description_ar: "",
    sort_order: "0",
    time_zone: "America/New_York",
    address_en: "",
    address_ar: "",
    currency: "USD",
    price: "10.00",
    duration_minutes: "30",
    buffer_before_minutes: "0",
    buffer_after_minutes: "0",
    tax_rate_bps: "0",
    payment_mode: "none",
    booking_mode: "appointment",
    assignment_mode: "any_available",
    approval_required: false,
    category_id: CATALOG_NO_LINK,
    fixed_staff_id: "",
    resource_type_id: CATALOG_NO_LINK,
    location_ids: [location],
    consent_version: "1",
    consent_en: "I agree.",
    consent_ar: "أوافق.",
    deposit_percent_bps: "5000",
    intake: [],
    ...overrides,
  };
}

function document(values: CatalogEditorValues) {
  const content = catalogContentSchema.parse(values);
  const full = catalogDraftSchema.parse(values);
  return catalogDraftDocument(values.kind, content, full, undefined);
}

function issues(values: CatalogEditorValues) {
  const parsed = catalogDraftSchema.safeParse(values);
  return parsed.success
    ? []
    : parsed.error.issues.map((issue) => `${issue.path.join(".")}:${issue.message}`);
}

describe("service link selects", () => {
  it("reads the explicit no-link sentinel as no link", () => {
    expect(document(service())?.metadata).toMatchObject({
      category_id: null,
      resource_type_id: null,
      fixed_staff_id: null,
    });
  });
  it("keeps a chosen link and still refuses any other non-identifier value", () => {
    expect(document(service({ category_id: category }))?.metadata).toMatchObject({
      category_id: category,
    });
    expect(catalogDraftSchema.safeParse(service({ category_id: "all" })).success).toBe(
      false,
    );
  });
  it("requires the assigned staff only for fixed-staff assignment", () => {
    expect(issues(service({ assignment_mode: "fixed_staff" }))).toContain(
      "fixed_staff_id:required",
    );
    expect(
      document(service({ assignment_mode: "round_robin", fixed_staff_id: category }))
        ?.metadata,
    ).toMatchObject({ fixed_staff_id: null });
  });
});

describe("service money and bounds", () => {
  it("stores exact minor units and refuses excess decimals, grouping and other currencies", () => {
    expect(document(service({ price: "42.5" }))?.price_minor).toBe(4250);
    expect(document(service({ price: "٤٢٫٠٠" }))?.price_minor).toBe(4200);
    expect(issues(service({ price: "1.005" }))).toContain(
      "price:catalog_price_invalid",
    );
    expect(issues(service({ price: "1,000.00" }))).toContain(
      "price:catalog_price_invalid",
    );
    expect(issues(service({ currency: "EUR" }))).toContain(
      "currency:catalog_first_release_invalid",
    );
  });
  it("keeps every integer bound", () => {
    expect(issues(service({ duration_minutes: "0" }))).toContain(
      "duration_minutes:too_small",
    );
    expect(issues(service({ duration_minutes: "1441" }))).toContain(
      "duration_minutes:too_large",
    );
    expect(issues(service({ tax_rate_bps: "3001" }))).toContain(
      "tax_rate_bps:too_large",
    );
    expect(issues(service({ deposit_percent_bps: "10001" }))).toContain(
      "deposit_percent_bps:too_large",
    );
    expect(issues(service({ buffer_after_minutes: "1.5" }))).toContain(
      "buffer_after_minutes:invalid_integer",
    );
  });
  it("requires a location, bilingual consent and unique intake keys", () => {
    expect(issues(service({ location_ids: [] }))).toContain("location_ids:choose_one");
    expect(issues(service({ consent_ar: "  " }))).toContain("consent_ar:required");
    const question = { key: "reason", en: "Reason", ar: "السبب", required: true };
    expect(issues(service({ intake: [question, question] }))).toContain(
      "intake.1.key:catalog_intake_key_duplicate",
    );
    expect(issues(service({ intake: [{ ...question, key: "Reason" }] }))).toContain(
      "intake.0.key:catalog_intake_key_invalid",
    );
    expect(document(service({ intake: [question] }))?.intake_schema).toEqual({
      fields: [{ key: "reason", label: "Reason", required: true, maxLength: 2000 }],
    });
  });
});

describe("catalog content and other kinds", () => {
  it("trims names, requires both languages and a revision for an existing record", () => {
    expect(catalogContentSchema.parse(service({ name_en: "  Spa  " })).name_en).toBe(
      "Spa",
    );
    expect(catalogContentSchema.safeParse(service({ name_ar: " " })).success).toBe(
      false,
    );
    expect(
      catalogContentSchema.safeParse(
        service({ entityId: location, expectedRevision: "" }),
      ).success,
    ).toBe(false);
    expect(
      catalogContentSchema.parse(service({ entityId: location, expectedRevision: "3" }))
        .expectedRevision,
    ).toBe(3);
  });
  it("refuses keys outside the URL key grammar and unknown time zones", () => {
    expect(issues(service({ key: "Bad Key" }))).toContain("key:catalog_key_invalid");
    expect(issues(service({ kind: "location", time_zone: "Mars/Olympus" }))).toContain(
      "time_zone:catalog_time_zone_invalid",
    );
    expect(issues(service({ kind: "category", sort_order: "100001" }))).toContain(
      "sort_order:too_large",
    );
  });
  it("does not let an operator without authority create a record", () => {
    const content = catalogContentSchema.parse(service());
    expect(catalogDraftDocument("service", content, null, undefined)).toBeNull();
  });
});

describe("catalog publication", () => {
  it("requires the explicit confirmation and positive safe revisions", () => {
    const base = { locale: "en", requestId, revisions: { [location]: 2 } };
    expect(catalogPublicationSchema.safeParse(base).success).toBe(false);
    expect(
      catalogPublicationSchema.safeParse({ ...base, confirm: "yes" }).success,
    ).toBe(true);
    expect(
      catalogPublicationSchema.safeParse({
        ...base,
        confirm: "yes",
        revisions: { [location]: 0 },
      }).success,
    ).toBe(false);
    expect(
      catalogPublicationSchema.safeParse({
        ...base,
        confirm: "yes",
        revisions: { "not-an-id": 1 },
      }).success,
    ).toBe(false);
  });
});
