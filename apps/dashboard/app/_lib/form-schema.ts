import { z } from "zod";

import { resolveProposedInstant } from "./proposed-instant";

/**
 * Building blocks shared by the Dashboard's form schemas. Browser-safe: no
 * server imports. Messages are error codes, rendered by the form in the
 * operator's language (see `form-messages.ts`).
 */
export const localeField = z.enum(["en", "ar"], { error: "invalid" });

/** Record ids are 8-4-4-4-12 hex; synthetic fixtures use non-RFC versions. */
export const recordIdField = z.guid({ error: "invalid" });

/** A revision the operator read; the database refuses a stale one. */
export const revisionField = z
  .number({ error: "invalid_integer" })
  .int({ error: "invalid_integer" });

/** Optional free text: trimmed, bounded, "" when absent. */
export function optionalText(max: number) {
  return z.string().trim().max(max, { error: "too_long" });
}

/** Required free text: trimmed, non-empty, bounded. */
export function requiredText(max: number) {
  return z
    .string()
    .trim()
    .min(1, { error: "required" })
    .max(max, { error: "too_long" });
}

/** The server's `trimmed()` contract: blank text is no value at all. */
export function textOrNull(value: string): string | null {
  return value === "" ? null : value;
}

/**
 * Which occurrence of a repeated local time is meant. Radix Select cannot hold
 * "", so "none" stands for "no choice"; only "0" and "1" reach the database.
 */
export const foldField = z.enum(["none", "0", "1"], { error: "invalid" });
export type FoldChoice = z.infer<typeof foldField>;

export function foldValue(fold: FoldChoice): "0" | "1" | null {
  return fold === "none" ? null : fold;
}

/** The location's zone, or UTC when the read carried none (the old fallback). */
export function zoneOrUtc(timeZone: string): string {
  return timeZone === "" ? "UTC" : timeZone;
}

/**
 * A local YYYY-MM-DDTHH:MM in the location's zone must name exactly one
 * instant: a spring-forward gap is refused, and a repeated fall-back time
 * needs its occurrence chosen. Adds the issue at `path` when it does not.
 */
export function checkLocalDateTime(
  context: z.RefinementCtx,
  path: string,
  value: string,
  timeZone: string,
  fold: FoldChoice,
): void {
  if (value === "") {
    context.addIssue({ code: "custom", message: "required", path: [path] });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value)) {
    context.addIssue({ code: "custom", message: "invalid_date", path: [path] });
    return;
  }
  if (resolveProposedInstant(value, zoneOrUtc(timeZone), foldValue(fold)) === null) {
    context.addIssue({
      code: "custom",
      message: "local_time_unresolved",
      path: [path],
    });
  }
}
