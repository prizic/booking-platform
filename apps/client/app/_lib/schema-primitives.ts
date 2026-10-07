import { resolveZonedLocalDateTime } from "@wlbp/i18n";
import { z } from "zod";

/*
 * Field rules shared by the Client's form schemas. Each mirrors the bound the
 * @wlbp/api-contracts request parser enforces, so the browser refuses what the
 * route would refuse. The database remains the authority on every booking rule.
 */

export const localeField = z.enum(["en", "ar"], { error: "invalid" });

export const nonEmptyText = z
  .string({ error: "required" })
  .refine((value) => value.trim() !== "", { error: "required" });

/** A canonical UTC instant, exactly as `Date#toISOString` writes it. */
export const utcInstantField = z.string({ error: "invalid_date" }).refine(
  (value) => {
    const epoch = Date.parse(value);
    return Number.isFinite(epoch) && new Date(epoch).toISOString() === value;
  },
  { error: "invalid_date" },
);

export function isIanaTimeZone(value: string): boolean {
  if (value.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export const timeZoneField = z
  .string({ error: "invalid_time_zone" })
  .refine(isIanaTimeZone, { error: "invalid_time_zone" });

/** Session tokens and idempotency keys share one bound in the contract. */
export const opaqueKeyField = z
  .string({ error: "invalid" })
  .min(16, { error: "invalid" })
  .max(200, { error: "invalid" })
  .refine((value) => value.trim() === value, { error: "invalid" });

/** Management and proposal links carry a 64-hex bearer token. */
export const linkTokenField = z
  .string({ error: "invalid" })
  .regex(/^[a-f0-9]{64}$/u, { error: "invalid" });

export const isoDateField = z
  .string({ error: "required" })
  .regex(/^\d{4}-\d{2}-\d{2}$/u, { error: "invalid_date" });

export const wallClockField = z
  .string({ error: "required" })
  .regex(/^\d{2}:\d{2}$/u, { error: "invalid_time" });

/**
 * One wall time (YYYY-MM-DD + HH:MM) in an IANA zone, resolved to exactly one
 * instant. A DST gap or a repeated hour returns null: the caller refuses it
 * rather than guessing which instant the customer meant.
 */
export function resolveExactWallTime(
  date: string,
  time: string,
  timeZone: string,
): string | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/u.exec(time);
  if (dateMatch === null || timeMatch === null) return null;
  try {
    const resolution = resolveZonedLocalDateTime(
      {
        year: Number(dateMatch[1]),
        month: Number(dateMatch[2]),
        day: Number(dateMatch[3]),
        hour: Number(timeMatch[1]),
        minute: Number(timeMatch[2]),
      },
      timeZone,
    );
    return resolution.kind === "exact" ? resolution.instants[0] : null;
  } catch {
    return null;
  }
}
