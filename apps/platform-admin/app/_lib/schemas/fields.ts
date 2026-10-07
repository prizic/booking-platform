/**
 * Zod building blocks shared by every Platform Admin form schema. They replace
 * the old FormData helpers (`text`, `uuid`, `integer`, `instant`, `lines`,
 * `localeOf`) with the same normalisation, now applied identically in the
 * browser form and again inside the server action.
 *
 * Messages are codes: generic ones from @wlbp/ui-foundation, or operator error
 * codes from `operator-errors.ts` (rendered through `form-messages.ts`).
 * The database stays the final authority for every rule.
 */
import { isLocale, type Locale } from "@wlbp/i18n";
import { z } from "zod";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Lower-cased UUID, or undefined when the value is not one. */
export function asUuid(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  return uuidPattern.test(trimmed) ? trimmed.toLowerCase() : undefined;
}

/** A record identifier rendered by the page. Malformed means a stale page. */
export const recordId = z
  .string({ error: "not_found" })
  .trim()
  .regex(uuidPattern, { error: "not_found" })
  .transform((value) => value.toLowerCase());

/** Trimmed text that must not be empty. */
export function requiredText(max?: number) {
  const base = z.string({ error: "required" }).trim().min(1, { error: "required" });
  return max === undefined ? base : base.max(max, { error: "too_long" });
}

/** Trimmed text; empty becomes undefined so the database default applies. */
export function optionalText(max?: number) {
  const base = z.string().trim();
  return (max === undefined ? base : base.max(max, { error: "too_long" }))
    .optional()
    .transform((value) => value || undefined);
}

/** An audit reason with the dialog's minimum length; the database re-checks it. */
export function reason(minLength: number) {
  return z
    .string({ error: "reason_required" })
    .trim()
    .min(minLength, { error: "reason_required" })
    .max(500, { error: "too_long" });
}

/** Whole number typed into a text/number control. */
export function integerText(range?: { min?: number; max?: number }) {
  return z
    .string({ error: "required" })
    .trim()
    .min(1, { error: "required" })
    .regex(/^-?\d+$/u, { error: "invalid_integer" })
    .transform(Number)
    .refine((value) => range?.min === undefined || value >= range.min, {
      error: "too_small",
    })
    .refine((value) => range?.max === undefined || value <= range.max, {
      error: "too_large",
    });
}

/**
 * `YYYY-MM-DDTHH:MM`, entered and shown in UTC, as an ISO instant. Empty means
 * "no time" (null clears the value in the database).
 */
export const optionalInstant = z
  .string()
  .trim()
  .optional()
  .transform((value, context) => {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value)) {
      context.addIssue({ code: "custom", message: "invalid_date" });
      return z.NEVER;
    }
    const date = new Date(`${value}:00Z`);
    if (Number.isNaN(date.getTime())) {
      context.addIssue({ code: "custom", message: "invalid_date" });
      return z.NEVER;
    }
    return date.toISOString();
  });

/** One entry per line or comma, trimmed, blanks dropped. */
export function splitLines(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[\n,]/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Notes may contain commas, so they split on line breaks only. */
export function splitNotes(value: string | undefined): string[] {
  return (value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export const lineList = z.string().optional().transform(splitLines);
export const noteList = z.string().optional().transform(splitNotes);

/** The interface language of the form; anything else falls back to English. */
export const formLocale = z
  .string()
  .optional()
  .transform((value): Locale => (value && isLocale(value) ? value : "en"));

/**
 * Generated once per form open (see the operator form kit) and re-sent on a
 * retry of the same submission, so a double submit replays instead of
 * creating twice. Same shape the database accepts.
 */
export const idempotencyKey = z
  .string({ error: "idempotency_key_invalid" })
  .regex(/^[A-Za-z0-9:_-]{16,200}$/u, { error: "idempotency_key_invalid" });
