import { describe, expect, it } from "vitest";
import { parseBookingContextV1 } from "./booking-context.js";

const restricted = {
  contractVersion: 1,
  bookingId: "booking-a",
  contactAccess: "restricted",
  intake: { access: "restricted" },
  customer: { access: "restricted" },
  request: {
    approvalStatus: "pending",
    approvalDeadline: "2026-10-14T09:00:00Z",
    publicReason: null,
    submittedAt: "2026-10-13T09:00:00Z",
  },
};

describe("R9 scoped booking context", () => {
  it("represents denied PII explicitly without returning an empty customer account", () => {
    expect(parseBookingContextV1(restricted)).toEqual(restricted);
  });
  it("refuses sensitive fields on restricted variants", () => {
    expect(() =>
      parseBookingContextV1({
        ...restricted,
        intake: { access: "restricted", answers: { request: "private" } },
      }),
    ).toThrow();
    expect(() =>
      parseBookingContextV1({
        ...restricted,
        customer: { access: "restricted", customerId: "guess" },
      }),
    ).toThrow();
  });
  it("accepts immutable answers and bounded customer history", () => {
    const context = {
      ...restricted,
      contactAccess: "allowed",
      intake: {
        access: "allowed",
        schema: { fields: [{ key: "request", label: "Request" }] },
        answers: { request: "Quiet room" },
      },
      customer: {
        access: "allowed",
        customerId: "customer-a",
        state: "restricted",
        history: [
          {
            bookingId: "earlier",
            publicReference: "0000000001",
            serviceName: "Consultation",
            status: "completed",
            startAt: "2026-10-01T09:00:00Z",
            endAt: "2026-10-01T10:00:00Z",
          },
        ],
      },
    };
    expect(parseBookingContextV1(context)).toEqual(context);
    expect(() =>
      parseBookingContextV1({
        ...context,
        customer: {
          ...context.customer,
          history: Array(21).fill(context.customer.history[0]),
        },
      }),
    ).toThrow();
  });
});
