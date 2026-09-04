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
