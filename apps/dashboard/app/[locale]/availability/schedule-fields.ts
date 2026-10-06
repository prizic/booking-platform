import { canonicalizeTimeZone, resolveZonedLocalDateTime } from "@wlbp/i18n";
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
export class ScheduleFieldError extends Error {
  constructor(
    readonly field: string,
    readonly code: "invalid" | "gap" | "fold",
  ) {
    super(code);
  }
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
export function scheduleUuid(value: unknown): value is string {
  return typeof value === "string" && uuid.test(value);
}
function text(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}
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
export function minuteInput(value: string, end = false): number {
  if (end && value === "24:00") return 1440;
  const match = /^(\d{2}):(\d{2})$/u.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59)
    throw new ScheduleFieldError("time", "invalid");
  return Number(match[1]) * 60 + Number(match[2]);
}
export function schedulePayload(form: FormData): {
  operation: ScheduleKind;
  payload: Record<string, unknown>;
  expectedRevision: number | null;
  requestId: string;
} {
  const operation = text(form, "operation") as ScheduleKind;
  if (!scheduleKinds.includes(operation))
    throw new ScheduleFieldError("operation", "invalid");
  const payload: Record<string, unknown> = {};
  const requestId = text(form, "requestId");
  if (!scheduleUuid(requestId)) throw new ScheduleFieldError("requestId", "invalid");
  for (const [field, key] of [
    ["id", "id"],
    ["scopeId", "scope_id"],
    ["locationId", "location_id"],
    ["staffId", "staff_id"],
    ["resourceId", "resource_id"],
    ["serviceId", "service_id"],
  ]) {
    const value = text(form, field!);
    if (value && !scheduleUuid(value)) throw new ScheduleFieldError(field!, "invalid");
    payload[key!] = value || null;
  }
  const revision = text(form, "expectedRevision");
  if (
    revision &&
    (!/^\d+$/u.test(revision) ||
      !Number.isSafeInteger(Number(revision)) ||
      Number(revision) < 1)
  )
    throw new ScheduleFieldError("expectedRevision", "invalid");
  const expectedRevision = revision ? Number(revision) : null;
  if (payload.id && expectedRevision === null)
    throw new ScheduleFieldError("expectedRevision", "invalid");
  const timeZone = canonicalizeTimeZone(text(form, "timeZone"));
  payload.time_zone = timeZone;
  payload.scope_kind = text(form, "scopeKind");
  if (operation === "weekly" || operation === "break" || operation === "exception") {
    if (!payload.scope_id || expectedRevision === null)
      throw new ScheduleFieldError("scopeId", "invalid");
    if (operation === "exception") {
      payload.local_date = text(form, "localDate");
      payload.exception_kind = text(form, "exceptionKind");
      payload.fold = ["0", "1"].includes(text(form, "fold"))
        ? Number(text(form, "fold"))
        : null;
    } else {
      const day = Number(text(form, "dayOfWeek"));
      if (!Number.isInteger(day) || day < 0 || day > 6)
        throw new ScheduleFieldError("dayOfWeek", "invalid");
      payload.day_of_week = day;
    }
    if (operation !== "exception" || payload.exception_kind === "override") {
      const start = minuteInput(text(form, "startTime"));
      const end =
        text(form, "endOfDay") === "yes"
          ? 1440
          : minuteInput(text(form, "endTime"), true);
      if (end <= start) throw new ScheduleFieldError("endTime", "invalid");
      payload.start_minute = start;
      payload.end_minute = end;
      if (operation === "exception") {
        civilInstant(
          `${payload.local_date}T${text(form, "startTime")}`,
          timeZone,
          text(form, "fold"),
          "startTime",
        );
        if (end !== 1440)
          civilInstant(
            `${payload.local_date}T${text(form, "endTime")}`,
            timeZone,
            text(form, "fold"),
            "endTime",
          );
      }
    }
  }
  if (["time_off", "blackout", "maintenance"].includes(operation)) {
    payload.starts_at = civilInstant(
      text(form, "startsAt"),
      timeZone,
      text(form, "startFold"),
      "startsAt",
    );
    payload.ends_at = civilInstant(
      text(form, "endsAt"),
      timeZone,
      text(form, "endFold"),
      "endsAt",
    );
    if (String(payload.ends_at) <= String(payload.starts_at))
      throw new ScheduleFieldError("endsAt", "invalid");
    payload.reason = text(form, "reason");
    if (String(payload.reason).length > 500)
      throw new ScheduleFieldError("reason", "invalid");
  }
  if (operation === "holiday") {
    payload.local_date = text(form, "localDate");
    payload.name = text(form, "reason");
    if (!payload.name || String(payload.name).length > 160)
      throw new ScheduleFieldError("reason", "invalid");
  }
  if (operation === "policy") {
    const key = text(form, "policyKey") as keyof typeof policyBounds;
    const raw = text(form, "value");
    if (!(key in policyBounds)) throw new ScheduleFieldError("policyKey", "invalid");
    const value = raw === "" && key === "daily_limit_per_staff" ? null : Number(raw);
    const [min, max] = policyBounds[key];
    if (
      value !== null &&
      (!Number.isInteger(value) ||
        value < min ||
        value > max ||
        (key === "slot_interval_minutes" && ![5, 10, 15, 20, 30, 60].includes(value)))
    )
      throw new ScheduleFieldError("value", "invalid");
    payload.policy_key = key;
    payload.value = value;
  }
  return { operation, payload, expectedRevision, requestId };
}
