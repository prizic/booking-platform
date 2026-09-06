import type { AvailabilityV1Response } from "@wlbp/api-contracts";
import { describe, expect, it } from "vitest";

import {
  availabilityPickerReducer,
  availabilitySlotIdentity,
  initialAvailabilityPickerState,
  type AvailabilityQuerySnapshot,
} from "./availability-picker-state";

const snapshot = {
  date: "2026-11-01",
  partySize: 1,
  timeZone: "America/New_York",
} satisfies AvailabilityQuerySnapshot;

const response = {
  advisory: true,
  displayTimeZone: "America/New_York",
  locationTimeZone: "Asia/Riyadh",
  noSlotReason: null,
  providerHealth: "not_applicable",
  slots: [
    {
      allocationKind: "appointment",
      endAt: "2026-11-01T06:30:00.000Z",
      staffId: null,
      startAt: "2026-11-01T05:30:00.000Z",
    },
  ],
} satisfies AvailabilityV1Response;

describe("availability picker state", () => {
  it("keeps same-time staff slots distinct, including a null staff identity", () => {
    const first = { ...response.slots[0]!, staffId: "staff-a" };
    const second = { ...first, staffId: "staff-b" };
    const unassigned = { ...first, staffId: null };

    expect(availabilitySlotIdentity(first)).not.toBe(availabilitySlotIdentity(second));
    expect(availabilitySlotIdentity(first)).not.toBe(
      availabilitySlotIdentity(unassigned),
    );

    let state = availabilityPickerReducer(
      initialAvailabilityPickerState("Asia/Riyadh"),
      { requestId: 1, snapshot, type: "submitted" },
    );
    state = availabilityPickerReducer(state, {
      requestId: 1,
      response: { ...response, slots: [first, second] },
      type: "resolved",
    });
    state = availabilityPickerReducer(state, { slot: second, type: "selected" });

    expect(availabilitySlotIdentity(state.selected!)).toBe(
      availabilitySlotIdentity(second),
    );
    expect(availabilitySlotIdentity(state.selected!)).not.toBe(
      availabilitySlotIdentity(first),
    );
  });

  it("invalidates rendered results and selection when the timezone changes", () => {
    let state = availabilityPickerReducer(
      initialAvailabilityPickerState("Asia/Riyadh"),
      {
        requestId: 1,
        snapshot,
        type: "submitted",
      },
    );
    state = availabilityPickerReducer(state, {
      requestId: 1,
      response,
      type: "resolved",
    });
    state = availabilityPickerReducer(state, {
      slot: response.slots[0]!,
      type: "selected",
    });

    expect(state.result?.snapshot.timeZone).toBe("America/New_York");
    expect(state.selected).toBeDefined();

    state = availabilityPickerReducer(state, {
      field: "timeZone",
      type: "filterChanged",
      value: "Europe/Istanbul",
    });

    expect(state.filters.timeZone).toBe("Europe/Istanbul");
    expect(state.result).toBeUndefined();
    expect(state.selected).toBeUndefined();
  });

  it("ignores a superseded response that resolves out of order", () => {
    let state = availabilityPickerReducer(
      initialAvailabilityPickerState("Asia/Riyadh"),
      {
        requestId: 1,
        snapshot,
        type: "submitted",
      },
    );
    const newerSnapshot = { ...snapshot, timeZone: "Europe/Istanbul" };
    state = availabilityPickerReducer(state, {
      requestId: 2,
      snapshot: newerSnapshot,
      type: "submitted",
    });
    state = availabilityPickerReducer(state, {
      requestId: 1,
      response,
      type: "resolved",
    });

    expect(state.loading).toBe(true);
    expect(state.result).toBeUndefined();

    state = availabilityPickerReducer(state, {
      requestId: 2,
      response: { ...response, displayTimeZone: "Europe/Istanbul" },
      type: "resolved",
    });
    expect(state.loading).toBe(false);
    expect(state.result?.snapshot).toEqual(newerSnapshot);
    expect(state.result?.response.displayTimeZone).toBe("Europe/Istanbul");
  });
});
