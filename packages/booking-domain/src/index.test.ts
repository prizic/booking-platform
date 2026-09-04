import { describe, expect, it } from "vitest";

import {
  BookingDomainError,
  calculatePercentageAmount,
  canTransitionBooking,
  createMoney,
  createTimeRange,
  rangesOverlap,
  withBuffers,
} from "./index.js";

describe("money", () => {
  it("represents money as safe integer minor units plus ISO currency", () => {
    expect(createMoney(1_250, "usd")).toEqual({ minorUnits: 1_250, currency: "USD" });
    expect(() => createMoney(1.5, "USD")).toThrow(BookingDomainError);
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
