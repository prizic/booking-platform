import { describe, expect, it } from "vitest";

import {
  initialLiveState,
  parseEnvelope,
  reduceLive,
  type LiveEvent,
} from "./live-updates";

const message = (bookingId: string, bookingRevision: number): LiveEvent => ({
  kind: "message",
  payload: {
    booking_id: bookingId,
    booking_revision: bookingRevision,
    status: "confirmed",
  },
});

/** Apply a sequence and report how many refetches it asked for. */
function run(events: readonly LiveEvent[]) {
  let state = initialLiveState;
  let refetches = 0;
  for (const event of events) {
    const transition = reduceLive(state, event);
    state = transition.state;
    if (transition.refetch) refetches += 1;
  }
  return { refetches, state };
}

describe("workspace live updates", () => {
  it("does not refetch on the first subscription, because the server just rendered", () => {
    const { refetches, state } = run([{ kind: "subscribed" }]);
    expect(refetches).toBe(0);
    expect(state.status).toBe("live");
  });

  it("refetches once per booking change", () => {
    const { refetches } = run([
      { kind: "subscribed" },
      message("booking-a", 1),
      message("booking-b", 1),
    ]);
    expect(refetches).toBe(2);
  });

  it("ignores a duplicate delivery", () => {
    const { refetches } = run([
      { kind: "subscribed" },
      message("booking-a", 4),
      message("booking-a", 4),
      message("booking-a", 4),
    ]);
    expect(refetches).toBe(1);
  });

  it("ignores a message that arrives out of order", () => {
    const { refetches, state } = run([
      { kind: "subscribed" },
      message("booking-a", 9),
      message("booking-a", 7),
    ]);
    expect(refetches).toBe(1);
    expect(state.seen.get("booking-a")).toBe(9);
  });

  it("shows reconnecting when the socket drops, and does not refetch on the drop itself", () => {
    const { refetches, state } = run([
      { kind: "subscribed" },
      { kind: "disconnected" },
    ]);
    expect(refetches).toBe(0);
    expect(state.status).toBe("reconnecting");
  });

  it("refetches once on reconnect, because what was missed is unknowable", () => {
    const { refetches, state } = run([
      { kind: "subscribed" },
      { kind: "disconnected" },
      { kind: "subscribed" },
    ]);
    expect(refetches).toBe(1);
    expect(state.status).toBe("live");
  });

  it("stops for good when the subscription is refused", () => {
    const { refetches, state } = run([
      { kind: "subscribed" },
      { kind: "refused" },
      // A retry loop must not reconnect a member who lost access.
      { kind: "subscribed" },
      message("booking-a", 1),
    ]);
    expect(refetches).toBe(0);
    expect(state.status).toBe("ended");
  });

  it("never refetches on a payload that is not what the database sends", () => {
    const { refetches } = run([
      { kind: "subscribed" },
      { kind: "message", payload: null },
      { kind: "message", payload: "booking-a" },
      { kind: "message", payload: { booking_id: "booking-a" } },
      { kind: "message", payload: { booking_id: 7, booking_revision: 1 } },
      { kind: "message", payload: { booking_id: "booking-a", booking_revision: "1" } },
    ]);
    expect(refetches).toBe(0);
  });

  it("reads two fields and nothing else, so nothing on the wire can be displayed", () => {
    const envelope = parseEnvelope({
      booking_id: "booking-a",
      booking_revision: 3,
      customer_name: "should never be read",
      status: "cancelled",
    });
    expect(envelope).toEqual({ bookingId: "booking-a", bookingRevision: 3 });
  });
});
