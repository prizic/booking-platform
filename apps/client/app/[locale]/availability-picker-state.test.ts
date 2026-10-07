import { describe, expect, it } from "vitest";

import {
  availabilityQueryKey,
  availabilitySearchParams,
  availabilitySlotIdentity,
  type AvailabilityQuerySnapshot,
  type AvailabilityTarget,
} from "./availability-picker-state";
import { availabilitySearchSchema } from "./availability-schema";

const snapshot = {
  date: "2026-11-01",
  partySize: 1,
  timeZone: "America/New_York",
} satisfies AvailabilityQuerySnapshot;

const target = {
  locale: "en",
  locationId: "location-a",
  serviceId: "service-a",
} satisfies AvailabilityTarget;

const slot = {
  allocationKind: "appointment",
  endAt: "2026-11-01T06:30:00.000Z",
  staffId: null,
  startAt: "2026-11-01T05:30:00.000Z",
} as const;

describe("availability picker state", () => {
  it("keeps same-time staff slots distinct, including a null staff identity", () => {
    const first = { ...slot, staffId: "staff-a" };
    const second = { ...first, staffId: "staff-b" };
    const unassigned = { ...first, staffId: null };

    expect(availabilitySlotIdentity(first)).not.toBe(availabilitySlotIdentity(second));
    expect(availabilitySlotIdentity(first)).not.toBe(
      availabilitySlotIdentity(unassigned),
    );
    expect(availabilitySlotIdentity(second)).toBe(
      availabilitySlotIdentity({ ...second }),
    );
  });

  it("gives a changed timezone its own cache entry, so earlier results never show", () => {
    const before = availabilityQueryKey(target, snapshot);
    const after = availabilityQueryKey(target, {
      ...snapshot,
      timeZone: "Europe/Istanbul",
    });

    expect(after).not.toEqual(before);
    expect(after).toContain("Europe/Istanbul");
    expect(availabilityQueryKey(target, { ...snapshot })).toEqual(before);
  });

  it("keys every filter and the target, so a superseded response cannot land in a newer search", () => {
    const base = availabilityQueryKey(target, snapshot);
    for (const changed of [
      availabilityQueryKey(target, { ...snapshot, date: "2026-11-02" }),
      availabilityQueryKey(target, { ...snapshot, partySize: 2 }),
      availabilityQueryKey({ ...target, serviceId: "service-b" }, snapshot),
      availabilityQueryKey({ ...target, locationId: "location-b" }, snapshot),
      availabilityQueryKey({ ...target, locale: "ar" }, snapshot),
    ]) {
      expect(changed).not.toEqual(base);
    }
  });

  it("asks for seven days from local midnight in the chosen zone", () => {
    expect(Object.fromEntries(availabilitySearchParams(target, snapshot))).toEqual({
      endBefore: "2026-11-08T05:00:00.000Z",
      locale: "en",
      locationId: "location-a",
      partySize: "1",
      serviceId: "service-a",
      startAfter: "2026-11-01T04:00:00.000Z",
      timeZone: "America/New_York",
    });
  });

  it("refuses to build a request the route would refuse", () => {
    expect(() =>
      availabilitySearchParams(target, { ...snapshot, partySize: 51 }),
    ).toThrow();
  });
});

describe("availability search form", () => {
  it("asks for a starting date before searching", () => {
    const parsed = availabilitySearchSchema.safeParse({
      date: "",
      partySize: "1",
      timeZone: "Asia/Riyadh",
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]).toMatchObject({
      message: "availability_date_required",
      path: ["date"],
    });
  });

  it("coerces the party size the number control yields", () => {
    expect(
      availabilitySearchSchema.parse({
        date: "2026-11-01",
        partySize: "3",
        timeZone: "Asia/Riyadh",
      }),
    ).toEqual({ date: "2026-11-01", partySize: 3, timeZone: "Asia/Riyadh" });
  });

  it.each([
    ["0", "too_small"],
    ["51", "too_large"],
    ["1.5", "invalid_integer"],
  ])("refuses a party size of %s", (partySize, code) => {
    const parsed = availabilitySearchSchema.safeParse({
      date: "2026-11-01",
      partySize,
      timeZone: "Asia/Riyadh",
    });
    expect(parsed.error?.issues[0]?.message).toBe(code);
  });

  it("refuses a timezone that is not IANA", () => {
    const parsed = availabilitySearchSchema.safeParse({
      date: "2026-11-01",
      partySize: "1",
      timeZone: "Mars/Olympus",
    });
    expect(parsed.error?.issues[0]?.message).toBe("invalid_time_zone");
  });
});
