/*
 * Builds the catalog draft document from already-validated editor values.
 * Validation lives in catalog-schema.ts; this only merges the typed values
 * into the stored record so fields the editor does not represent survive.
 */
import type { CatalogEntityV1, CatalogKindV1 } from "@wlbp/api-contracts";
import type { CatalogContent, CatalogDraft } from "./catalog-schema";

function emptyDocument(): Record<string, unknown> {
  return {
    metadata: {},
    name_en: "",
    name_ar: "",
    description_en: "",
    description_ar: "",
    address_en: "",
    address_ar: "",
    duration_minutes: 30,
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
    price_minor: 0,
    currency: "USD",
    tax_rate_bps: 0,
    payment_mode: "none",
    booking_mode: "appointment",
    approval_required: false,
    policy: {},
    policy_ar: {},
    intake_schema: { fields: [] },
    intake_schema_ar: { fields: [] },
  };
}

function previousField(
  schema: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  return Array.isArray(schema?.fields)
    ? (schema.fields.find(
        (field: unknown) =>
          typeof field === "object" &&
          field !== null &&
          "key" in field &&
          field.key === key,
      ) as Record<string, unknown> | undefined)
    : undefined;
}

/**
 * `full` is the parsed full editor when the server decided the operator may
 * publish; otherwise only names and descriptions change, and an operator
 * without that authority cannot create a record (returns null).
 */
export function catalogDraftDocument(
  kind: CatalogKindV1,
  content: CatalogContent,
  full: CatalogDraft | null,
  base: CatalogEntityV1 | undefined,
): Record<string, unknown> | null {
  const document: Record<string, unknown> = base ? { ...base } : emptyDocument();
  delete document.id;
  delete document.kind;
  delete document.revision;
  delete document.state;
  document.name_en = content.name_en;
  document.name_ar = content.name_ar;
  document.description_en = content.description_en;
  document.description_ar = content.description_ar;
  if (full === null) return base ? document : null;
  if (full.kind !== kind) return null;
  const metadata: Record<string, unknown> = {
    ...base?.metadata,
    key: full.key,
    retire: full.retire,
  };
  document.metadata = metadata;
  if (full.kind === "category") metadata.sort_order = full.sort_order;
  if (full.kind === "location") {
    metadata.time_zone = full.time_zone;
    document.address_en = full.address_en;
    document.address_ar = full.address_ar;
  }
  if (full.kind === "service") {
    document.price_minor = full.price;
    document.currency = full.currency;
    document.duration_minutes = full.duration_minutes;
    document.buffer_before_minutes = full.buffer_before_minutes;
    document.buffer_after_minutes = full.buffer_after_minutes;
    document.tax_rate_bps = full.tax_rate_bps;
    document.payment_mode = full.payment_mode;
    document.booking_mode = full.booking_mode;
    document.approval_required = full.approval_required;
    metadata.assignment_mode = full.assignment_mode;
    metadata.category_id = full.category_id;
    metadata.fixed_staff_id =
      full.assignment_mode === "fixed_staff" ? full.fixed_staff_id : null;
    metadata.resource_type_id = full.resource_type_id;
    metadata.location_ids = full.location_ids;
    for (const locale of ["en", "ar"] as const) {
      const key = locale === "en" ? "policy" : "policy_ar";
      const policy: Record<string, unknown> = {
        ...(locale === "en" ? base?.policy : base?.policy_ar),
        consent_text: locale === "en" ? full.consent_en : full.consent_ar,
        consent_version: full.consent_version,
        deposit_percent_bps: full.deposit_percent_bps,
      };
      delete policy.deposit_minor_units;
      document[key] = policy;
    }
    const en = full.intake.map((question) => ({
      ...previousField(base?.intake_schema, question.key),
      key: question.key,
      label: question.en,
      required: question.required,
      maxLength: previousField(base?.intake_schema, question.key)?.maxLength ?? 2000,
    }));
    const ar = full.intake.map((question) => ({
      ...previousField(base?.intake_schema_ar, question.key),
      key: question.key,
      label: question.ar,
      required: question.required,
      maxLength: previousField(base?.intake_schema_ar, question.key)?.maxLength ?? 2000,
    }));
    document.intake_schema = { ...base?.intake_schema, fields: en };
    document.intake_schema_ar = { ...base?.intake_schema_ar, fields: ar };
  }
  return document;
}
