import { describe, it, expect } from "vitest";
import { isBookingInvalidation } from "./workspace-live-events";
describe("private invalidations", () => {
  const event = {
    booking_id: "10000000-0000-4000-8000-000000000001",
    location_id: "10000000-0000-4000-8000-000000000002",
    booking_revision: 2,
    starts_at: "2026-10-05T10:00:00Z",
    status: "confirmed",
  };
  it("accepts duplicate and out-of-order hints without applying state", () => {
    expect(isBookingInvalidation(event)).toBe(true);
    expect(isBookingInvalidation({ ...event, booking_revision: 1 })).toBe(true);
  });
  it("rejects malformed or non-minimal payloads", () => {
    expect(isBookingInvalidation({ ...event, email: "private@example.test" })).toBe(
      false,
    );
    expect(isBookingInvalidation({ ...event, booking_revision: -1 })).toBe(false);
  });
  it("accepts the database transport UUID without accepting private fields", () => {
    const delivered = { ...event, id: "10000000-0000-4000-8000-000000000003" };
    expect(isBookingInvalidation(delivered)).toBe(true);
    expect(isBookingInvalidation({ ...delivered, email: "private@example.test" })).toBe(
      false,
    );
    expect(isBookingInvalidation({ ...delivered, id: 42 })).toBe(false);
  });
});
