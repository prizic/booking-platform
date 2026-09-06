export type CurrencyCode = string & { readonly __currencyCode: unique symbol };

export interface Money {
  readonly currency: CurrencyCode;
  readonly minorUnits: number;
}

export class BookingDomainError extends Error {
  constructor(
    readonly code:
      | "invalid_currency"
      | "invalid_money"
      | "invalid_percentage"
      | "invalid_time_range"
      | "invalid_buffer",
    message: string,
  ) {
    super(message);
    this.name = "BookingDomainError";
  }
}

export function createCurrencyCode(value: string): CurrencyCode {
  const normalized = value.toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new BookingDomainError(
      "invalid_currency",
      "Currency must be a three-letter ISO code",
    );
  }

  return normalized as CurrencyCode;
}

export function createMoney(minorUnits: number, currency: string): Money {
  if (!Number.isSafeInteger(minorUnits)) {
    throw new BookingDomainError(
      "invalid_money",
      "Money must be represented as safe integer minor units",
    );
  }

  return Object.freeze({
    currency: createCurrencyCode(currency),
    minorUnits,
  });
}

export function calculatePercentageAmount(money: Money, basisPoints: number): Money {
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new BookingDomainError(
      "invalid_percentage",
      "A percentage must be between 0 and 10,000 basis points",
    );
  }

  const numerator = BigInt(money.minorUnits) * BigInt(basisPoints);
  const denominator = 10_000n;
  const absolute = numerator < 0 ? -numerator : numerator;
  const roundedAbsolute = (absolute + denominator / 2n) / denominator;
  const rounded = numerator < 0 ? -roundedAbsolute : roundedAbsolute;
  const minorUnits = Number(rounded);

  if (!Number.isSafeInteger(minorUnits)) {
    throw new BookingDomainError(
      "invalid_money",
      "Percentage result exceeds safe minor units",
    );
  }

  return createMoney(minorUnits, money.currency);
}

export interface TimeRange {
  readonly endEpochMilliseconds: number;
  readonly startEpochMilliseconds: number;
}

function toEpochMilliseconds(value: Date | string): number {
  const result = value instanceof Date ? value.valueOf() : Date.parse(value);

  if (!Number.isFinite(result)) {
    throw new BookingDomainError("invalid_time_range", "Expected a valid UTC instant");
  }

  return result;
}

export function createTimeRange(start: Date | string, end: Date | string): TimeRange {
  const startEpochMilliseconds = toEpochMilliseconds(start);
  const endEpochMilliseconds = toEpochMilliseconds(end);

  if (startEpochMilliseconds >= endEpochMilliseconds) {
    throw new BookingDomainError(
      "invalid_time_range",
      "A half-open time range must end after it starts",
    );
  }

  return Object.freeze({ startEpochMilliseconds, endEpochMilliseconds });
}

export function rangesOverlap(left: TimeRange, right: TimeRange): boolean {
  return (
    left.startEpochMilliseconds < right.endEpochMilliseconds &&
    right.startEpochMilliseconds < left.endEpochMilliseconds
  );
}

export function withBuffers(
  range: TimeRange,
  beforeMinutes: number,
  afterMinutes: number,
): TimeRange {
  if (
    !Number.isSafeInteger(beforeMinutes) ||
    !Number.isSafeInteger(afterMinutes) ||
    beforeMinutes < 0 ||
    afterMinutes < 0
  ) {
    throw new BookingDomainError(
      "invalid_buffer",
      "Buffers must be non-negative whole minutes",
    );
  }

  return createTimeRange(
    new Date(range.startEpochMilliseconds - beforeMinutes * 60_000),
    new Date(range.endEpochMilliseconds + afterMinutes * 60_000),
  );
}

export interface CivilInterval {
  readonly startMinute: number;
  readonly endMinute: number;
}

export interface WeeklySchedule {
  readonly dayOfWeek: number;
  readonly intervals: readonly CivilInterval[];
  readonly breaks: readonly CivilInterval[];
  readonly timeZone: string;
}

export interface WeeklyScheduleInput {
  readonly dayOfWeek: number;
  readonly intervals: readonly CivilInterval[];
  readonly breaks: readonly CivilInterval[];
  readonly timeZone: string;
}

export interface ScheduleException {
  readonly localDate: string;
  readonly kind: "closed" | "override";
  readonly intervals: readonly CivilInterval[];
  readonly fold: 0 | 1 | null;
}

export type ScheduleCivilTimeResolution =
  | { readonly kind: "gap"; readonly instants: readonly [] }
  | { readonly kind: "exact"; readonly instants: readonly [string]; readonly fold: 0 }
  | { readonly kind: "ambiguous"; readonly instants: readonly [string, string] }
  | { readonly kind: "exact"; readonly instants: readonly [string]; readonly fold: 1 };

export type SchedulePolicy = {
  readonly minimumNoticeMinutes: number;
  readonly horizonDays: number;
  readonly slotIntervalMinutes: number;
  readonly dailyLimitPerStaff: number | null;
  readonly bufferBeforeMinutes: number;
  readonly bufferAfterMinutes: number;
  readonly turnoverMinutes: number;
  readonly travelMinutes: number;
};

export type SchedulePolicyOverrides = Readonly<{
  readonly tenant?: Partial<SchedulePolicy>;
  readonly location?: Partial<SchedulePolicy>;
  readonly service?: Partial<SchedulePolicy>;
  readonly staff?: Partial<SchedulePolicy>;
  readonly resource?: Partial<SchedulePolicy>;
}>;

const scheduleDefaults: SchedulePolicy = {
  minimumNoticeMinutes: 120,
  horizonDays: 60,
  slotIntervalMinutes: 15,
  dailyLimitPerStaff: null,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 10,
  turnoverMinutes: 0,
  travelMinutes: 0,
};

const scheduleIntervalsOverlap = (left: CivilInterval, right: CivilInterval) =>
  left.startMinute < right.endMinute && right.startMinute < left.endMinute;

function validateCivilInterval(interval: CivilInterval, label: string): CivilInterval {
  if (
    !Number.isSafeInteger(interval.startMinute) ||
    !Number.isSafeInteger(interval.endMinute) ||
    interval.startMinute < 0 ||
    interval.endMinute > 24 * 60 ||
    interval.startMinute >= interval.endMinute
  ) {
    throw new BookingDomainError("invalid_time_range", `${label} is invalid`);
  }
  return Object.freeze({
    startMinute: interval.startMinute,
    endMinute: interval.endMinute,
  });
}

function validateNonOverlappingIntervals(
  intervals: readonly CivilInterval[],
  label: string,
): readonly CivilInterval[] {
  const normalized = intervals
    .map((interval) => validateCivilInterval(interval, label))
    .sort((left, right) => left.startMinute - right.startMinute);
  for (let index = 1; index < normalized.length; index += 1) {
    if (scheduleIntervalsOverlap(normalized[index - 1]!, normalized[index]!)) {
      throw new BookingDomainError("invalid_time_range", `${label} overlap`);
    }
  }
  return Object.freeze(normalized);
}

export function createWeeklySchedule(input: WeeklyScheduleInput): WeeklySchedule {
  if (
    !Number.isSafeInteger(input.dayOfWeek) ||
    input.dayOfWeek < 0 ||
    input.dayOfWeek > 6
  ) {
    throw new BookingDomainError("invalid_time_range", "day of week is invalid");
  }

  try {
    new Intl.DateTimeFormat("en", { timeZone: input.timeZone }).format();
  } catch {
    throw new BookingDomainError("invalid_time_range", "time zone is invalid");
  }

  const intervals = validateNonOverlappingIntervals(
    input.intervals,
    "schedule interval",
  );
  const breaks = validateNonOverlappingIntervals(input.breaks, "schedule break");
  if (
    breaks.some(
      (breakInterval) =>
        !intervals.some(
          (interval) =>
            breakInterval.startMinute >= interval.startMinute &&
            breakInterval.endMinute <= interval.endMinute,
        ),
    )
  ) {
    throw new BookingDomainError(
      "invalid_time_range",
      "schedule break is outside working hours",
    );
  }

  return Object.freeze({
    dayOfWeek: input.dayOfWeek,
    intervals,
    breaks,
    timeZone: input.timeZone,
  });
}

export function applyScheduleConstraints(
  schedule: WeeklySchedule,
  additionalBreaks: readonly CivilInterval[],
): readonly CivilInterval[] {
  const breaks = validateNonOverlappingIntervals(
    [...schedule.breaks, ...additionalBreaks],
    "schedule break",
  );
  return Object.freeze(
    schedule.intervals.flatMap((interval) => {
      let remaining: CivilInterval[] = [interval];
      for (const breakInterval of breaks) {
        remaining = remaining.flatMap((candidate) => {
          if (!scheduleIntervalsOverlap(candidate, breakInterval)) return [candidate];
          return [
            ...(candidate.startMinute < breakInterval.startMinute
              ? [
                  {
                    startMinute: candidate.startMinute,
                    endMinute: breakInterval.startMinute,
                  },
                ]
              : []),
            ...(breakInterval.endMinute < candidate.endMinute
              ? [
                  {
                    startMinute: breakInterval.endMinute,
                    endMinute: candidate.endMinute,
                  },
                ]
              : []),
          ];
        });
      }
      return remaining;
    }),
  );
}

export function applyScheduleException(
  schedule: WeeklySchedule,
  exception: ScheduleException,
): readonly CivilInterval[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exception.localDate)) {
    throw new BookingDomainError("invalid_time_range", "exception date is invalid");
  }
  const [year, month, day] = exception.localDate.split("-").map(Number);
  if (new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay() !== schedule.dayOfWeek) {
    throw new BookingDomainError(
      "invalid_time_range",
      "exception date does not match schedule day",
    );
  }
  if (exception.kind === "closed") {
    if (exception.intervals.length > 0)
      throw new BookingDomainError(
        "invalid_time_range",
        "closed exception cannot contain intervals",
      );
    return Object.freeze([]);
  }
  if (exception.intervals.length === 0)
    throw new BookingDomainError(
      "invalid_time_range",
      "override exception needs intervals",
    );
  return applyScheduleConstraints(
    {
      ...schedule,
      intervals: validateNonOverlappingIntervals(
        exception.intervals,
        "exception interval",
      ),
    },
    [],
  );
}

function zonedParts(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  return Object.fromEntries(
    parts
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, Number(value)]),
  );
}

export function resolveScheduleCivilTime(
  localDateTime: string,
  timeZone: string,
  fold?: 0 | 1,
): ScheduleCivilTimeResolution {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localDateTime))
    throw new BookingDomainError("invalid_time_range", "local time is invalid");
  const [date, clock] = localDateTime.split("T");
  const [year, month, day] = date!.split("-").map(Number);
  const [hour, minute] = clock!.split(":").map(Number);
  const localMilliseconds = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  const instants: number[] = [];
  for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 1) {
    const instant = localMilliseconds - offsetMinutes * 60_000;
    const parts = zonedParts(instant, timeZone);
    if (
      parts.year === year &&
      parts.month === month &&
      parts.day === day &&
      parts.hour === hour &&
      parts.minute === minute &&
      !instants.includes(instant)
    )
      instants.push(instant);
  }
  instants.sort((left, right) => left - right);
  if (instants.length === 0) return { kind: "gap", instants: [] };
  if (instants.length > 2)
    throw new BookingDomainError(
      "invalid_time_range",
      "local time has too many instants",
    );
  if (instants.length === 2 && fold === undefined)
    return {
      kind: "ambiguous",
      instants: [
        new Date(instants[0]!).toISOString(),
        new Date(instants[1]!).toISOString(),
      ],
    };
  const selected = instants.length === 2 ? instants[fold!]! : instants[0]!;
  return {
    kind: "exact",
    instants: [new Date(selected).toISOString()],
    fold: instants.length === 2 ? fold! : 0,
  };
}

export interface SchedulePolicyEvaluationInput {
  readonly now: string;
  readonly start: string;
  readonly staffBookingsToday: number;
}

export function evaluateSchedulePolicy(
  input: SchedulePolicyEvaluationInput,
  policy: SchedulePolicy,
): boolean {
  const now = Date.parse(input.now);
  const start = Date.parse(input.start);
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(start) ||
    !Number.isSafeInteger(input.staffBookingsToday) ||
    input.staffBookingsToday < 0
  )
    return false;
  return (
    start - now >= policy.minimumNoticeMinutes * 60_000 &&
    start - now <= policy.horizonDays * 86_400_000 &&
    (policy.dailyLimitPerStaff === null ||
      input.staffBookingsToday < policy.dailyLimitPerStaff)
  );
}

export function resolveSchedulePolicy(
  overrides: SchedulePolicyOverrides = {},
): SchedulePolicy {
  const resolved = {
    ...scheduleDefaults,
    ...overrides.tenant,
    ...overrides.location,
    ...overrides.service,
    ...overrides.staff,
    ...overrides.resource,
  };
  if (
    !Number.isSafeInteger(resolved.minimumNoticeMinutes) ||
    resolved.minimumNoticeMinutes < 0 ||
    resolved.minimumNoticeMinutes > 43_200 ||
    !Number.isSafeInteger(resolved.horizonDays) ||
    resolved.horizonDays < 1 ||
    resolved.horizonDays > 365 ||
    ![5, 10, 15, 20, 30, 60].includes(resolved.slotIntervalMinutes) ||
    (resolved.dailyLimitPerStaff !== null &&
      (!Number.isSafeInteger(resolved.dailyLimitPerStaff) ||
        resolved.dailyLimitPerStaff < 1 ||
        resolved.dailyLimitPerStaff > 50)) ||
    !Number.isSafeInteger(resolved.bufferBeforeMinutes) ||
    resolved.bufferBeforeMinutes < 0 ||
    resolved.bufferBeforeMinutes > 120 ||
    !Number.isSafeInteger(resolved.bufferAfterMinutes) ||
    resolved.bufferAfterMinutes < 0 ||
    resolved.bufferAfterMinutes > 120 ||
    !Number.isSafeInteger(resolved.turnoverMinutes) ||
    resolved.turnoverMinutes < 0 ||
    resolved.turnoverMinutes > 1_440 ||
    !Number.isSafeInteger(resolved.travelMinutes) ||
    resolved.travelMinutes < 0 ||
    resolved.travelMinutes > 1_440
  ) {
    throw new BookingDomainError(
      "invalid_time_range",
      "schedule policy is outside platform bounds",
    );
  }
  return Object.freeze(resolved);
}

export type BookingStatus =
  | "held"
  | "requested"
  | "pending_payment"
  | "confirmed"
  | "checked_in"
  | "completed"
  | "cancelled"
  | "no_show"
  | "rejected"
  | "expired";

const bookingTransitions = {
  held: ["requested", "pending_payment", "confirmed", "expired"],
  requested: [
    "requested",
    "pending_payment",
    "confirmed",
    "rejected",
    "expired",
    "cancelled",
  ],
  pending_payment: ["held", "confirmed", "expired"],
  confirmed: ["confirmed", "checked_in", "completed", "cancelled", "no_show"],
  checked_in: ["confirmed", "completed", "cancelled"],
  completed: ["checked_in", "confirmed"],
  cancelled: [],
  no_show: ["checked_in", "completed"],
  rejected: [],
  expired: [],
} as const satisfies Record<BookingStatus, readonly BookingStatus[]>;

export function canTransitionBooking(from: BookingStatus, to: BookingStatus): boolean {
  return (bookingTransitions[from] as readonly BookingStatus[]).includes(to);
}
