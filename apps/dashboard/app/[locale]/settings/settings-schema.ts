/*
 * One schema for the tenant settings editor: the browser form validates with
 * it and `saveStructuredSettingsAction` validates the same input again.
 * Merging into the stored documents (lossless) lives in settings-document.ts.
 */
import { z } from "zod";
import { EMAIL_PATTERN, localeField } from "../services/schema-kit";

export const settingsRoutes = [
  "/",
  "/book",
  "/manage",
  "/contact",
  "/privacy",
  "/terms",
  "/accessibility",
] as const;

/** "" clears the stored preference; otherwise a whole number within bounds. */
function optionalBoundedInteger(min: number, max: number) {
  return z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d+$/u.test(value), {
      error: "invalid_integer",
    })
    .refine((value) => value === "" || Number(value) >= min, { error: "too_small" })
    .refine(
      (value) =>
        value === "" || (Number.isSafeInteger(Number(value)) && Number(value) <= max),
      { error: "too_large" },
    );
}

const destination = z
  .string()
  .trim()
  .min(1, { error: "required" })
  .max(2048, { error: "too_long" })
  .refine(
    (value) =>
      (settingsRoutes.includes(value as (typeof settingsRoutes)[number]) ||
        /^https:\/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/|$)/u.test(value)) &&
      !/[<>]/u.test(value) &&
      ![...value].some((character) => character.charCodeAt(0) < 32),
    { error: "settings_destination_invalid" },
  );

const navigationItem = z.object({
  /** Identifies a stored row so its unrepresented fields survive. */
  rowKey: z.string().max(100),
  en: z.string().trim().min(1, { error: "required" }).max(160, { error: "too_long" }),
  ar: z.string().trim().min(1, { error: "required" }).max(160, { error: "too_long" }),
  destination,
});

export const settingsSchema = z.object({
  locale: localeField,
  expectedRevision: z
    .string()
    .regex(/^\d+$/u, { error: "invalid" })
    .transform(Number)
    .refine((value) => Number.isSafeInteger(value) && value >= 1, { error: "invalid" }),
  defaultLocale: z.enum(["", "en", "ar"], { error: "invalid" }),
  replyToEmail: z
    .string()
    .trim()
    .max(254, { error: "too_long" })
    .refine((value) => value === "" || EMAIL_PATTERN.test(value), {
      error: "invalid_email",
    }),
  // The release ships USD; a tenant already on another currency keeps it
  // (checked against the stored settings when merging).
  currency: z
    .string()
    .trim()
    .refine((value) => value === "" || /^[A-Z]{3}$/u.test(value), {
      error: "invalid",
    }),
  taxRateBps: optionalBoundedInteger(0, 3000),
  bookingHorizonDays: optionalBoundedInteger(1, 730),
  navigation: z.array(navigationItem).max(50, { error: "too_large" }),
  /** Requested feature states; only entitled features can be enabled. */
  features: z
    .array(z.object({ key: z.string().max(100), enabled: z.boolean() }))
    .max(200, { error: "too_large" }),
});

export type SettingsInput = z.input<typeof settingsSchema>;
export type SettingsValues = z.output<typeof settingsSchema>;
