/*
 * One schema for the schedule rule editor and one for rule removal: the
 * browser form validates with them and the availability server actions
 * validate the same input again. Civil times are resolved in the rule's IANA
 * timezone: a spring-forward gap is refused, and a repeated fall-back time
 * needs its occurrence chosen explicitly. The database remains the final
 * authority for overlaps, scope membership and permissions.
 */
import { canonicalizeTimeZone, resolveZonedLocalDateTime } from "@wlbp/i18n";
import { z } from "zod";
import { UUID_PATTERN, confirmed, localeField, uuid } from "../services/schema-kit";

export const scheduleKinds = [
  "scope",
  "weekly",
  "break",
  "exception",
  "time_off",
  "holiday",
  "blackout",
  "maintenance",
  "policy",
] as const;
export type ScheduleKind = (typeof scheduleKinds)[number];

export const policyBounds = {
  minimum_notice_minutes: [0, 43200],
  horizon_days: [1, 365],
  slot_interval_minutes: [5, 60],
  daily_limit_per_staff: [1, 50],
  buffer_before_minutes: [0, 120],
  buffer_after_minutes: [0, 120],
  turnover_minutes: [0, 1440],
  travel_minutes: [0, 1440],
} as const;

/**
 * Select value for "the local time is not repeated". Only "0" or "1" name an
 * explicit occurrence; this sentinel (or "") means no explicit choice.
 */
export const UNAMBIGUOUS_FOLD = "auto";

export function scheduleUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** A civil-time refusal: the code is the error the editor shows on `field`. */
export class ScheduleFieldError extends Error {
  constructor(
    readonly field: string,
    readonly code: "invalid" | "gap" | "fold",
  ) {
    super(code);
  }
}

/** The instant a local YYYY-MM-DDTHH:MM names in `timeZone`, or a refusal. */
export function civilInstant(
  value: string,
  timeZone: string,
  fold: string,
  field: string,
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u.exec(value);
  if (!match) throw new ScheduleFieldError(field, "invalid");
  try {
    const result = resolveZonedLocalDateTime(
      {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
        hour: Number(match[4]),
        minute: Number(match[5]),
        second: 0,
      },
      timeZone,
    );
    if (result.kind === "gap") throw new ScheduleFieldError(field, "gap");
    if (result.kind === "ambiguous" && fold !== "0" && fold !== "1")
      throw new ScheduleFieldError(field, "fold");
    return result.instants[result.kind === "ambiguous" ? Number(fold) : 0]!;
  } catch (error) {
    if (error instanceof ScheduleFieldError) throw error;
    throw new ScheduleFieldError(field, "invalid");
  }
}

/** Minutes since midnight for HH:MM; "24:00" only as an exclusive end. */
export function minuteInput(value: string, end = false): number {
  if (end && value === "24:00") return 1440;
  const match = /^(\d{2}):(\d{2})$/u.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59)
    throw new ScheduleFieldError("time", "invalid");
  return Number(match[1]) * 60 + Number(match[2]);
}

const idOrEmpty = z.union([z.literal(""), uuid]);

/** Every value the rule editor holds, before validation (as the controls hold them). */
const scheduleRuleFields = z.object({
  locale: localeField,
  operation: z.enum(scheduleKinds, { error: "invalid" }),
  requestId: uuid,
  id: idOrEmpty,
  scopeId: idOrEmpty,
  locationId: idOrEmpty,
  staffId: idOrEmpty,
  resourceId: idOrEmpty,
  serviceId: idOrEmpty,
  expectedRevision: z.string().max(20),
  scopeKind: z.string().max(20),
  timeZone: z.string().trim().max(100),
  dayOfWeek: z.string().max(2),
  localDate: z.string().trim().max(10),
  exceptionKind: z.string().max(20),
  fold: z.string().max(5),
  startTime: z.string().max(5),
  endTime: z.string().max(5),
  endOfDay: z.boolean(),
  startsAt: z.string().max(16),
  startFold: z.string().max(5),
  endsAt: z.string().max(16),
  endFold: z.string().max(5),
  reason: z.string().trim(),
  policyKey: z.string().max(40),
  value: z.string().trim().max(10),
});
export type ScheduleRuleInput = z.input<typeof scheduleRuleFields>;

const errorCode = { invalid: "invalid", gap: "gap", fold: "foldError" } as const;

/**
 * Validates the editor's values and produces the exact payload the schedule
 * RPC receives. Each refusal is reported on the field the operator fixes.
 */
export const scheduleRuleSchema = scheduleRuleFields.transform((value, context) => {
  const fail = (path: string, message: string) => {
    context.addIssue({ code: "custom", message, path: [path] });
    return z.NEVER;
  };
  const operation = value.operation;
  const payload: Record<string, unknown> = {
    id: value.id || null,
    scope_id: value.scopeId || null,
    location_id: value.locationId || null,
    staff_id: value.staffId || null,
    resource_id: value.resourceId || null,
    service_id: value.serviceId || null,
  };
  const revision = value.expectedRevision;
  if (
    revision &&
    (!/^\d+$/u.test(revision) ||
      !Number.isSafeInteger(Number(revision)) ||
      Number(revision) < 1)
  )
    return fail("expectedRevision", "invalid");
  const expectedRevision = revision ? Number(revision) : null;
  if (payload.id && expectedRevision === null)
    return fail("expectedRevision", "invalid");
  let timeZone: string;
  try {
    timeZone = canonicalizeTimeZone(value.timeZone);
  } catch {
    return fail("timeZone", "invalid_time_zone");
  }
  payload.time_zone = timeZone;
  payload.scope_kind = value.scopeKind;
  try {
    if (operation === "weekly" || operation === "break" || operation === "exception") {
      if (!payload.scope_id || expectedRevision === null)
        return fail("scopeId", value.scopeId ? "invalid" : "required");
      if (operation === "exception") {
        payload.local_date = value.localDate;
        payload.exception_kind = value.exceptionKind;
        payload.fold = ["0", "1"].includes(value.fold) ? Number(value.fold) : null;
      } else {
        const day = Number(value.dayOfWeek);
        if (value.dayOfWeek === "" || !Number.isInteger(day) || day < 0 || day > 6)
          return fail("dayOfWeek", "invalid");
        payload.day_of_week = day;
      }
      if (operation !== "exception" || payload.exception_kind === "override") {
        let start: number;
        let end: number;
        try {
          start = minuteInput(value.startTime);
        } catch {
          return fail("startTime", value.startTime ? "invalid_time" : "required");
        }
        try {
          end = value.endOfDay ? 1440 : minuteInput(value.endTime, true);
        } catch {
          return fail("endTime", value.endTime ? "invalid_time" : "required");
        }
        if (end <= start) return fail("endTime", "end_before_start");
        payload.start_minute = start;
        payload.end_minute = end;
        if (operation === "exception") {
          civilInstant(
            `${value.localDate}T${value.startTime}`,
            timeZone,
            value.fold,
            "startTime",
          );
          if (end !== 1440)
            civilInstant(
              `${value.localDate}T${value.endTime}`,
              timeZone,
              value.fold,
              "endTime",
            );
        }
      }
    }
    if (
      operation === "time_off" ||
      operation === "blackout" ||
      operation === "maintenance"
    ) {
      if (!value.startsAt) return fail("startsAt", "required");
      if (!value.endsAt) return fail("endsAt", "required");
      payload.starts_at = civilInstant(
        value.startsAt,
        timeZone,
        value.startFold,
        "startsAt",
      );
      payload.ends_at = civilInstant(value.endsAt, timeZone, value.endFold, "endsAt");
      if (String(payload.ends_at) <= String(payload.starts_at))
        return fail("endsAt", "end_before_start");
      if (value.reason.length > 500) return fail("reason", "too_long");
      payload.reason = value.reason;
    }
    if (operation === "holiday") {
      payload.local_date = value.localDate;
      if (!value.reason) return fail("reason", "required");
      if (value.reason.length > 160) return fail("reason", "too_long");
      payload.name = value.reason;
    }
    if (operation === "policy") {
      const key = value.policyKey as keyof typeof policyBounds;
      if (!(key in policyBounds)) return fail("policyKey", "invalid");
      const amount =
        value.value === "" && key === "daily_limit_per_staff"
          ? null
          : Number(value.value);
      const [min, max] = policyBounds[key];
      if (
        amount !== null &&
        (value.value === "" ||
          !Number.isInteger(amount) ||
          amount < min ||
          amount > max ||
          (key === "slot_interval_minutes" &&
            ![5, 10, 15, 20, 30, 60].includes(amount)))
      )
        return fail("value", "invalid");
      payload.policy_key = key;
      payload.value = amount;
    }
  } catch (error) {
    if (error instanceof ScheduleFieldError)
      return fail(error.field, errorCode[error.code]);
    throw error;
  }
  return { operation, payload, expectedRevision, requestId: value.requestId };
});
export type ScheduleRule = z.output<typeof scheduleRuleSchema>;

/** Removing one rule: the server still requires the dialog's explicit confirmation. */
export const scheduleRemovalSchema = z.object({
  locale: localeField,
  requestId: uuid,
  operation: z.enum(scheduleKinds, { error: "invalid" }),
  id: uuid,
  expectedRevision: z
    .string()
    .regex(/^\d+$/u, { error: "invalid" })
    .transform(Number)
    .refine((value) => Number.isSafeInteger(value) && value >= 1, { error: "invalid" }),
  expectedScopeRevision: z
    .string()
    .refine(
      (value) =>
        value === "" || (Number.isSafeInteger(Number(value)) && Number(value) >= 1),
      { error: "invalid" },
    )
    .transform((value) => (value === "" ? null : Number(value))),
  confirm: confirmed,
});
export type ScheduleRemovalInput = z.input<typeof scheduleRemovalSchema>;
