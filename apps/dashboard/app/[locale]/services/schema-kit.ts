/*
 * Small Zod building blocks shared by the Operate editors' schemas (catalog,
 * team, availability, brand, settings). Server-safe and browser-safe: no
 * "use client", no server-only imports. Every message is a stable error code
 * rendered in the operator's language by the form, never prose.
 */
import { z } from "zod";

export const UUID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
export const KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/**
 * The page language the operator submitted from. Used only for paths and
 * messages, never for authority; anything but "ar" is English, as before.
 */
export const localeField = z
  .string()
  .max(5)
  .transform((value): "ar" | "en" => (value === "ar" ? "ar" : "en"));

/** A record or attempt identifier. */
export const uuid = z.string().regex(UUID_PATTERN, { error: "invalid" });

/** "" (no record yet) or a record identifier. */
export const optionalUuid = z.union([z.literal(""), uuid]);

/**
 * A whole number typed into (or rendered as) a text control, within bounds.
 * Grouping separators, signs and decimals are refused exactly like the former
 * `/^\d+$/` parsers.
 */
export function integerText(min: number, max: number) {
  return z
    .string()
    .trim()
    .min(1, { error: "required" })
    .regex(/^\d+$/u, { error: "invalid_integer" })
    .transform((value) => Number(value))
    .refine((value) => Number.isSafeInteger(value), { error: "too_large" })
    .refine((value) => value >= min, { error: "too_small" })
    .refine((value) => value <= max, { error: "too_large" });
}

/** A rendered revision: "" (new record) or a positive safe integer. */
export const optionalRevision = z
  .union([z.literal(""), z.string().regex(/^\d+$/u, { error: "invalid" })])
  .refine(
    (value) =>
      value === "" || (Number.isSafeInteger(Number(value)) && Number(value) >= 1),
    { error: "invalid" },
  )
  .transform((value) => (value === "" ? null : Number(value)));

/** Required text, trimmed, with a maximum length. */
export function requiredText(max: number) {
  return z
    .string()
    .trim()
    .min(1, { error: "required" })
    .max(max, { error: "too_long" });
}

/** Optional text with a maximum length (whitespace kept as typed). */
export function optionalText(max: number) {
  return z.string().max(max, { error: "too_long" });
}

/** The explicit confirmation a dangerous submit carries only from its dialog. */
export const confirmed = z.literal("yes", { error: "invalid" });

/** A same-origin email shape the former parsers accepted. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
