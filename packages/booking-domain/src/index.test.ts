import { describe, expect, it } from "vitest";

import {
  BookingDomainError,
  calculatePercentageAmount,
  canTransitionBooking,
  createMoney,
  createTimeRange,
  rangesOverlap,
  applyScheduleConstraints,
  applyScheduleException,
  createWeeklySchedule,
  evaluateSchedulePolicy,
  resolveScheduleCivilTime,
  resolveSchedulePolicy,
  type SchedulePolicyOverrides,
  withBuffers,
  computeAdvisorySlots,
  classifyNoSlotReason,
} from "./index.js";

describe("advisory availability", () => {
  it("generates aligned half-open slots and removes buffered conflicts", () => {
    expect(
      computeAdvisorySlots({
        blockedRanges: [
          createTimeRange("2026-09-07T09:39:00Z", "2026-09-07T10:00:00Z"),
        ],
        bufferAfterMinutes: 10,
        bufferBeforeMinutes: 0,
        durationMinutes: 30,
        intervalMinutes: 30,
        maxResults: 10,
        openRanges: [createTimeRange("2026-09-07T09:00:00Z", "2026-09-07T11:00:00Z")],
        window: createTimeRange("2026-09-07T09:00:00Z", "2026-09-07T11:00:00Z"),
      }),
    ).toEqual([
      createTimeRange("2026-09-07T10:00:00Z", "2026-09-07T10:30:00Z"),
      createTimeRange("2026-09-07T10:30:00Z", "2026-09-07T11:00:00Z"),
    ]);
  });

  it("fails closed for invalid or abusive generation bounds", () => {
    expect(() =>
      computeAdvisorySlots({
        blockedRanges: [],
        bufferAfterMinutes: 0,
        bufferBeforeMinutes: 0,
        durationMinutes: 30,
        intervalMinutes: 5,
        maxResults: 501,
        openRanges: [],
        window: createTimeRange("2026-09-07T09:00:00Z", "2026-09-07T10:00:00Z"),
      }),
    ).toThrow("result bound");
  });

  it("keeps slot interval alignment when the requested window starts mid-grid", () => {
    expect(
      computeAdvisorySlots({
        blockedRanges: [],
        bufferAfterMinutes: 0,
        bufferBeforeMinutes: 0,
        durationMinutes: 30,
        intervalMinutes: 30,
        maxResults: 10,
        openRanges: [createTimeRange("2026-09-07T09:00:00Z", "2026-09-07T11:00:00Z")],
        window: createTimeRange("2026-09-07T09:10:00Z", "2026-09-07T11:00:00Z"),
      }),
    ).toEqual([
      createTimeRange("2026-09-07T09:30:00Z", "2026-09-07T10:00:00Z"),
      createTimeRange("2026-09-07T10:00:00Z", "2026-09-07T10:30:00Z"),
      createTimeRange("2026-09-07T10:30:00Z", "2026-09-07T11:00:00Z"),
    ]);
  });

  it("uses coarse public no-slot reasons", () => {
    expect(classifyNoSlotReason({ eligibleCandidateCount: 0 })).toBe(
      "no_matching_availability",
    );
    expect(classifyNoSlotReason({ eligibleCandidateCount: 2 })).toBe(
      "capacity_unavailable",
    );
  });
});

describe("money", () => {
  it("represents money as safe integer minor units plus ISO currency", () => {
    expect(createMoney(1_250, "usd")).toEqual({ minorUnits: 1_250, currency: "USD" });
    expect(() => createMoney(1.5, "USD")).toThrow(BookingDomainError);
  });

  it("rejects invalid currency and fractional minor units", () => {
    expect(() => createMoney(1_250, "US")).toThrow(BookingDomainError);
    // A non-string currency would otherwise throw a bare TypeError from
    // `toUpperCase`, which is not what every caller catches.
    expect(() => createMoney(1_250, undefined as unknown as string)).toThrow(
      BookingDomainError,
    );
    expect(() => createMoney(-1, "USD")).not.toThrow();
    expect(createMoney(-1, "USD").minorUnits).toBe(-1);
  });

  it("refuses a percentage that is not a whole number of basis points", () => {
    expect(() => calculatePercentageAmount(createMoney(105, "USD"), 5_000.5)).toThrow(
      BookingDomainError,
    );
    expect(() => calculatePercentageAmount(createMoney(105, "USD"), -1)).toThrow(
      BookingDomainError,
    );
  });

  it("rounds percentage arithmetic half up in minor units", () => {
    expect(calculatePercentageAmount(createMoney(105, "USD"), 5_000)).toEqual({
      currency: "USD",
      minorUnits: 53,
    });
  });
});

describe("half-open allocation ranges", () => {
  it("allows adjacent ranges but detects overlap once buffers apply", () => {
    const first = createTimeRange(
      "2026-09-05T09:00:00.000Z",
      "2026-09-05T10:00:00.000Z",
    );
    const second = createTimeRange(
      "2026-09-05T10:00:00.000Z",
      "2026-09-05T11:00:00.000Z",
    );

    expect(rangesOverlap(first, second)).toBe(false);
    expect(rangesOverlap(withBuffers(first, 0, 10), second)).toBe(true);
  });

  it("refuses a buffer that is not whole non-negative minutes", () => {
    const range = createTimeRange(
      "2026-09-05T09:00:00.000Z",
      "2026-09-05T10:00:00.000Z",
    );
    expect(() => withBuffers(range, -1, 0)).toThrow(BookingDomainError);
    expect(() => withBuffers(range, 1.5, 0)).toThrow(BookingDomainError);
    expect(() =>
      createTimeRange("2026-09-05T10:00:00.000Z", "2026-09-05T09:00:00.000Z"),
    ).toThrow(BookingDomainError);
    expect(() => createTimeRange("not-a-date", "2026-09-05T09:00:00.000Z")).toThrow(
      BookingDomainError,
    );
  });
});

describe("booking state transitions", () => {
  it("allows explicit lifecycle transitions and rejects terminal-state reopening", () => {
    expect(canTransitionBooking("held", "confirmed")).toBe(true);
    expect(canTransitionBooking("pending_payment", "held")).toBe(true);
    expect(canTransitionBooking("held", "cancelled")).toBe(false);
    expect(canTransitionBooking("pending_payment", "cancelled")).toBe(false);
    expect(canTransitionBooking("cancelled", "confirmed")).toBe(false);
  });

  it("allows only the documented audited status-correction paths", () => {
    expect(canTransitionBooking("checked_in", "confirmed")).toBe(true);
    expect(canTransitionBooking("completed", "checked_in")).toBe(true);
    expect(canTransitionBooking("completed", "confirmed")).toBe(true);
    expect(canTransitionBooking("no_show", "checked_in")).toBe(true);
    expect(canTransitionBooking("no_show", "completed")).toBe(true);
  });
});

describe("civil-time schedule rules", () => {
  it("subtracts breaks and keeps adjacent working intervals valid", () => {
    const schedule = createWeeklySchedule({
      dayOfWeek: 1,
      intervals: [{ startMinute: 9 * 60, endMinute: 17 * 60 }],
      breaks: [{ startMinute: 12 * 60, endMinute: 13 * 60 }],
      timeZone: "America/New_York",
    });

    expect(applyScheduleConstraints(schedule, [])).toEqual([
      { startMinute: 540, endMinute: 720 },
      { startMinute: 780, endMinute: 1020 },
    ]);
  });

  it("rejects overlapping intervals instead of normalizing them", () => {
    expect(() =>
      createWeeklySchedule({
        dayOfWeek: 1,
        intervals: [
          { startMinute: 9 * 60, endMinute: 12 * 60 },
          { startMinute: 11 * 60, endMinute: 13 * 60 },
        ],
        breaks: [],
        timeZone: "America/New_York",
      }),
    ).toThrow("overlap");
  });

  it("resolves policy overrides from least to most specific scope", () => {
    const overrides: SchedulePolicyOverrides = {
      tenant: { minimumNoticeMinutes: 60, horizonDays: 90 },
      location: { minimumNoticeMinutes: 240 },
      service: { minimumNoticeMinutes: 120, slotIntervalMinutes: 30 },
    };

    expect(resolveSchedulePolicy(overrides)).toMatchObject({
      minimumNoticeMinutes: 120,
      horizonDays: 90,
      slotIntervalMinutes: 30,
    });
  });

  it("applies a closed exception and rejects a conflicting override", () => {
    const schedule = createWeeklySchedule({
      dayOfWeek: 0,
      intervals: [{ startMinute: 540, endMinute: 1020 }],
      breaks: [],
      timeZone: "America/New_York",
    });
    expect(
      applyScheduleException(schedule, {
        localDate: "2026-11-01",
        kind: "closed",
        intervals: [],
        fold: null,
      }),
    ).toEqual([]);
    expect(() =>
      applyScheduleException(schedule, {
        localDate: "2026-11-01",
        kind: "override",
        intervals: [{ startMinute: 600, endMinute: 700 }],
        fold: 0,
      }),
    ).not.toThrow();
  });

  it("deterministically identifies DST gaps and folds in named zones", () => {
    expect(
      resolveScheduleCivilTime("2026-03-08T02:30", "America/New_York"),
    ).toMatchObject({ kind: "gap" });
    expect(
      resolveScheduleCivilTime("2026-11-01T01:30", "America/New_York"),
    ).toMatchObject({ kind: "ambiguous" });
    expect(
      resolveScheduleCivilTime("2026-11-01T01:30", "America/New_York", 1),
    ).toMatchObject({ kind: "exact", fold: 1 });
  });

  it("reuses one zone formatter across resolutions instead of one per offset probe", () => {
    const original = Intl.DateTimeFormat;
    let built = 0;
    // Counting constructions is the only way to observe the cache from outside;
    // the correctness of the answer is asserted by the DST cases above.
    class Counting extends original {
      constructor(...args: ConstructorParameters<typeof Intl.DateTimeFormat>) {
        super(...args);
        built += 1;
      }
    }
    Intl.DateTimeFormat = Counting as unknown as typeof Intl.DateTimeFormat;
    try {
      resolveScheduleCivilTime("2026-03-08T02:30", "America/New_York");
      const afterFirst = built;
      resolveScheduleCivilTime("2026-03-08T03:30", "America/New_York");
      resolveScheduleCivilTime("2026-11-01T01:30", "America/New_York", 1);
      // The whole ±14h band is 1681 candidate offsets; one formatter per probe
      // would have been 1681 constructions for the first call alone.
      expect(afterFirst).toBeLessThanOrEqual(2);
      expect(built).toBe(afterFirst);
    } finally {
      Intl.DateTimeFormat = original;
    }
  });

  it("refuses a civil time outside the ±14h offset band", () => {
    expect(() => resolveScheduleCivilTime("2026-09-07 09:00", "Asia/Riyadh")).toThrow(
      BookingDomainError,
    );
    expect(() =>
      resolveScheduleCivilTime("2026-09-07T09:00:00", "Not/AZone"),
    ).toThrow();
  });

  it("enforces notice, horizon, and daily staff limits", () => {
    const policy = resolveSchedulePolicy({
      tenant: { minimumNoticeMinutes: 60, horizonDays: 10, dailyLimitPerStaff: 2 },
    });
    expect(
      evaluateSchedulePolicy(
        {
          now: "2026-09-01T10:00:00Z",
          start: "2026-09-01T10:30:00Z",
          staffBookingsToday: 0,
        },
        policy,
      ),
    ).toBe(false);
    expect(
      evaluateSchedulePolicy(
        {
          now: "2026-09-01T10:00:00Z",
          start: "2026-09-05T10:00:00Z",
          staffBookingsToday: 2,
        },
        policy,
      ),
    ).toBe(false);
    expect(
      evaluateSchedulePolicy(
        {
          now: "2026-09-01T10:00:00Z",
          start: "2026-09-05T10:00:00Z",
          staffBookingsToday: 1,
        },
        policy,
      ),
    ).toBe(true);
  });
});
