/*
 * One schema for the catalog draft editor (services, categories, locations):
 * the browser form validates with it and `saveCatalogDraftAction` validates
 * the same input again. The database stays the final authority for
 * publication, relations and legal content.
 */
import { parseCurrencyMinorUnits } from "@wlbp/i18n";
import { z } from "zod";
import {
  KEY_PATTERN,
  confirmed,
  integerText,
  localeField,
  optionalRevision,
  optionalText,
  optionalUuid,
  requiredText,
  uuid,
} from "./schema-kit";

/** Select value meaning "no category / staff / resource link" (Radix forbids ""). */
export const CATALOG_NO_LINK = "none";

/** "none" or "" mean no link; anything else must be an identifier. */
const link = z
  .union([z.literal(CATALOG_NO_LINK), z.literal(""), uuid])
  .transform((value) => (value === CATALOG_NO_LINK || value === "" ? null : value));

/**
 * Names, descriptions and the technical values every operator who may edit a
 * catalog record submits. Operators without full catalog authority can change
 * only these.
 */
export const catalogContentSchema = z
  .object({
    locale: localeField,
    kind: z.enum(["service", "category", "location"], { error: "invalid" }),
    entityId: optionalUuid,
    expectedRevision: optionalRevision,
    requestId: uuid,
    name_en: requiredText(160),
    name_ar: requiredText(160),
    description_en: optionalText(2000),
    description_ar: optionalText(2000),
  })
  .refine((value) => value.entityId === "" || value.expectedRevision !== null, {
    error: "invalid",
    path: ["expectedRevision"],
  });

const fullBase = {
  key: z
    .string()
    .max(100, { error: "too_long" })
    .regex(KEY_PATTERN, { error: "catalog_key_invalid" }),
  retire: z.boolean(),
};

const categoryFields = z.object({
  kind: z.literal("category"),
  ...fullBase,
  sort_order: integerText(0, 100000),
});

const locationFields = z.object({
  kind: z.literal("location"),
  ...fullBase,
  time_zone: z
    .string()
    .max(100, { error: "too_long" })
    .refine(
      (zone) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: zone }).format();
          return true;
        } catch {
          return false;
        }
      },
      { error: "catalog_time_zone_invalid" },
    ),
  address_en: optionalText(2000),
  address_ar: optionalText(2000),
});

export const INTAKE_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/u;

const intakeQuestion = z.object({
  /** Client-side row identity for stable rendering; never stored. */
  rowId: z.string().max(100).optional(),
  key: z.string().regex(INTAKE_KEY_PATTERN, { error: "catalog_intake_key_invalid" }),
  en: requiredText(500),
  ar: requiredText(500),
  required: z.boolean(),
});

const serviceFields = z
  .object({
    kind: z.literal("service"),
    ...fullBase,
    currency: z.literal("USD", { error: "catalog_first_release_invalid" }),
    // Exact decimal in the currency's minor units: no grouping separators and
    // no excess decimal places (the shared money parser decides).
    price: z
      .string()
      .min(1, { error: "required" })
      .transform((value, context) => {
        const amount = parseCurrencyMinorUnits(value, "USD");
        if (amount === null) {
          context.addIssue({ code: "custom", message: "catalog_price_invalid" });
          return z.NEVER;
        }
        return amount;
      }),
    duration_minutes: integerText(1, 1440),
    buffer_before_minutes: integerText(0, 1440),
    buffer_after_minutes: integerText(0, 1440),
    tax_rate_bps: integerText(0, 3000),
    payment_mode: z.enum(["none", "deposit", "full"], { error: "invalid" }),
    booking_mode: z.enum(["appointment", "exclusive_resource"], { error: "invalid" }),
    assignment_mode: z.enum(
      ["any_available", "fixed_staff", "customer_choice", "round_robin"],
      { error: "invalid" },
    ),
    approval_required: z.boolean(),
    category_id: link,
    fixed_staff_id: link,
    resource_type_id: link,
    location_ids: z
      .array(uuid)
      .min(1, { error: "choose_one" })
      .max(100, { error: "too_large" }),
    consent_version: requiredText(40),
    consent_en: z
      .string()
      .max(10000, { error: "too_long" })
      .refine((value) => value.trim() !== "", { error: "required" }),
    consent_ar: z
      .string()
      .max(10000, { error: "too_long" })
      .refine((value) => value.trim() !== "", { error: "required" }),
    deposit_percent_bps: integerText(0, 10000),
    intake: z.array(intakeQuestion).max(20, { error: "too_large" }),
  })
  .superRefine((value, context) => {
    if (value.assignment_mode === "fixed_staff" && value.fixed_staff_id === null)
      context.addIssue({
        code: "custom",
        message: "required",
        path: ["fixed_staff_id"],
      });
    const seen = new Set<string>();
    value.intake.forEach((question, index) => {
      if (seen.has(question.key))
        context.addIssue({
          code: "custom",
          message: "catalog_intake_key_duplicate",
          path: ["intake", index, "key"],
        });
      seen.add(question.key);
    });
  });

/**
 * The full editor: content plus the kind-specific authority fields. Used when
 * the operator may publish (the server decides that from the workspace, never
 * from the input).
 */
export const catalogDraftSchema = z.intersection(
  catalogContentSchema,
  z.discriminatedUnion("kind", [categoryFields, locationFields, serviceFields]),
);

/** One intake question row as the editor holds it. */
export interface CatalogIntakeValues {
  rowId?: string;
  key: string;
  en: string;
  ar: string;
  required: boolean;
}

/**
 * Every value the catalog editor holds, before validation. The content schema
 * reads the shared part; the full schema reads the part for the record's kind
 * (unknown keys are dropped by both).
 */
export interface CatalogEditorValues {
  locale: string;
  kind: "service" | "category" | "location";
  entityId: string;
  expectedRevision: string;
  requestId: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  key: string;
  retire: boolean;
  sort_order: string;
  time_zone: string;
  address_en: string;
  address_ar: string;
  currency: string;
  price: string;
  duration_minutes: string;
  buffer_before_minutes: string;
  buffer_after_minutes: string;
  tax_rate_bps: string;
  payment_mode: string;
  booking_mode: string;
  assignment_mode: string;
  approval_required: boolean;
  category_id: string;
  fixed_staff_id: string;
  resource_type_id: string;
  location_ids: string[];
  consent_version: string;
  consent_en: string;
  consent_ar: string;
  deposit_percent_bps: string;
  intake: CatalogIntakeValues[];
}

export type CatalogContentInput = z.input<typeof catalogContentSchema>;
export type CatalogContent = z.output<typeof catalogContentSchema>;
export type CatalogDraftInput = z.input<typeof catalogDraftSchema>;
export type CatalogDraft = z.output<typeof catalogDraftSchema>;

/** Publishing the listed drafts: the manifest is the reviewed draft revisions. */
export const catalogPublicationSchema = z.object({
  locale: localeField,
  requestId: uuid,
  confirm: confirmed,
  revisions: z
    .record(
      uuid,
      z
        .number()
        .int({ error: "invalid" })
        .min(1, { error: "invalid" })
        .max(Number.MAX_SAFE_INTEGER, { error: "invalid" }),
    )
    // The former manifest was capped at 100000 characters (about 2000 drafts).
    .refine((value) => Object.keys(value).length <= 2000, { error: "too_large" }),
});
export type CatalogPublicationInput = z.input<typeof catalogPublicationSchema>;

/** Renders stored minor units as the exact decimal the editor submits back. */
export function catalogPriceInput(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error("Invalid price");
  const amount = BigInt(minor);
  return `${amount / 100n}.${String(amount % 100n).padStart(2, "0")}`;
}
