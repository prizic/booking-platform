import { intlLocale } from "./intl-locale.js";
import type { ContractLocale } from "@wlbp/api-contracts";

import {
  buildDailyDigest,
  type DailyDigest,
  type DigestBookingInput,
} from "./digest.js";

/**
 * The bridge between an outbox payload and a template. Outbox rows are written
 * by SQL in `snake_case` and carry raw facts (`starts_at`, `lead_minutes`, a
 * digest's `bookings`); templates read localized `camelCase` strings. This is
 * the only place that translation happens, so neither side has to know the
 * other's conventions, and a value the database already formatted always wins
 * over one derived here.
 */
export interface TemplateInput {
  readonly digest?: DailyDigest;
  readonly variables: Readonly<Record<string, string>>;
}

function camelCase(key: string): string {
  return key.replaceAll(/_([a-z0-9])/gu, (_match, letter: string) =>
    letter.toUpperCase(),
  );
}

function isValidTimeZone(zone: string | undefined): zone is string {
  if (zone === undefined || zone === "") return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function formatInstant(
  iso: string,
  timeZone: string,
  locale: ContractLocale,
): string | null {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime()) || !isValidTimeZone(timeZone)) return null;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "full",
    timeStyle: "short",
    timeZone,
  }).format(instant);
}

/** "tomorrow" / "in 2 hours" — how far ahead a reminder was sent. */
export function formatLead(minutes: number, locale: ContractLocale): string | null {
  if (!Number.isInteger(minutes) || minutes <= 0) return null;
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (minutes % 1440 === 0) return format.format(minutes / 1440, "day");
  if (minutes % 60 === 0) return format.format(minutes / 60, "hour");
  return format.format(minutes, "minute");
}

function text(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() === "" ? undefined : value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function field(
  row: Readonly<Record<string, unknown>>,
  name: string,
): string | undefined {
  return text(row[name]) ?? text(row[camelCase(name)]);
}

function digestRows(value: unknown, fallbackZone: string): DigestBookingInput[] {
  if (!Array.isArray(value)) return [];
  const rows: DigestBookingInput[] = [];
  for (const item of value as unknown[]) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const row = item as Readonly<Record<string, unknown>>;
    const startsAt = field(row, "starts_at");
    const serviceName = field(row, "service_name");
    if (startsAt === undefined || serviceName === undefined) continue;
    const customerFirstName = field(row, "customer_first_name");
    const locationName = field(row, "location_name");
    const staffName = field(row, "staff_name");
    rows.push({
      serviceName,
      startsAt,
      timeZone: field(row, "time_zone") ?? fallbackZone,
      ...(customerFirstName === undefined ? {} : { customerFirstName }),
      ...(locationName === undefined ? {} : { locationName }),
      ...(staffName === undefined ? {} : { staffName }),
    });
  }
  return rows;
}

export function normalizeNotificationPayload(
  payload: Readonly<Record<string, unknown>>,
  locale: ContractLocale,
): TemplateInput {
  const variables: Record<string, string> = {};
  // snake_case first, then explicit camelCase, so a formatted value wins.
  const entries = Object.entries(payload);
  for (const [key, value] of entries) {
    const string = text(value);
    if (string !== undefined && key.includes("_")) variables[camelCase(key)] = string;
  }
  for (const [key, value] of entries) {
    const string = text(value);
    if (string !== undefined && !key.includes("_")) variables[key] = string;
  }

  const zone = variables.timeZone;
  if (variables.startAt === undefined && variables.startsAt !== undefined && zone) {
    const formatted = formatInstant(variables.startsAt, zone, locale);
    if (formatted !== null) variables.startAt = formatted;
  }
  if (
    variables.proposedStartAt === undefined &&
    variables.proposedStartsAt !== undefined &&
    zone
  ) {
    const formatted = formatInstant(variables.proposedStartsAt, zone, locale);
    if (formatted !== null) variables.proposedStartAt = formatted;
  }
  if (variables.leadLabel === undefined && variables.leadMinutes !== undefined) {
    const lead = formatLead(Number(variables.leadMinutes), locale);
    if (lead !== null) variables.leadLabel = lead;
  }

  const bookings = payload.bookings ?? payload.agenda;
  // The day the digest covers, `YYYY-MM-DD` in the recipient's zone.
  const localDate = [variables.localDate, variables.digestDate].find(
    (value) => value !== undefined && /^\d{4}-\d{2}-\d{2}$/u.test(value),
  );
  if (Array.isArray(bookings) && localDate !== undefined) {
    const timeZone = isValidTimeZone(zone) ? zone : "UTC";
    return {
      digest: buildDailyDigest({
        bookings: digestRows(bookings, timeZone),
        locale,
        localDate,
        timeZone,
      }),
      variables,
    };
  }
  return { variables };
}
