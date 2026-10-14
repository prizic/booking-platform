import { describe, expect, it } from "vitest";
import type { BookingContextV1 } from "@wlbp/api-contracts";
import { canDisplayBookingContact, intakeLabel } from "./booking-context-display";
const context: BookingContextV1 = {
  contractVersion: 1,
  bookingId: "booking",
  contactAccess: "allowed",
  intake: { access: "allowed", schema: {}, answers: {} },
  request: {
    approvalStatus: "not_required",
    approvalDeadline: null,
    publicReason: null,
    submittedAt: "2026-10-13T00:00:00Z",
  },
  customer: { access: "restricted" },
};
const activeContext: BookingContextV1 = {
  ...context,
  customer: {
    access: "allowed",
    customerId: "customer",
    state: "active",
    history: [],
  },
};
const unrestricted = { erased: false, restricted: false };
describe("booking detail disclosure", () => {
  it("shows contact only when every explicit condition holds", () => {
    expect(canDisplayBookingContact(activeContext, unrestricted)).toBe(true);
  });
  it("refuses the restricted-context historical snapshot with no loaded customer", () => {
    expect(canDisplayBookingContact(context, null)).toBe(false);
  });
  it("refuses a fully valid active context with no loaded customer", () => {
    expect(canDisplayBookingContact(activeContext, null)).toBe(false);
  });
  it("refuses inconsistent contexts even with a loaded unrestricted customer", () => {
    expect(canDisplayBookingContact(null, unrestricted)).toBe(false);
    expect(
      canDisplayBookingContact(
        { ...activeContext, contactAccess: "restricted" },
        unrestricted,
      ),
    ).toBe(false);
    expect(
      canDisplayBookingContact(
        { ...activeContext, customer: { access: "restricted" } },
        unrestricted,
      ),
    ).toBe(false);
    expect(
      canDisplayBookingContact(
        {
          ...activeContext,
          customer: {
            access: "allowed",
            customerId: "customer",
            state: "restricted",
            history: [],
          },
        },
        unrestricted,
      ),
    ).toBe(false);
    expect(
      canDisplayBookingContact(
        {
          ...activeContext,
          customer: {
            access: "allowed",
            customerId: "customer",
            state: "erased",
            history: [],
          },
        },
        unrestricted,
      ),
    ).toBe(false);
  });
  it("refuses erased or restricted customers under a valid active context", () => {
    expect(
      canDisplayBookingContact(activeContext, { erased: true, restricted: false }),
    ).toBe(false);
    expect(
      canDisplayBookingContact(activeContext, { erased: false, restricted: true }),
    ).toBe(false);
  });

  it("renders the immutable bilingual intake label with a safe key fallback", () => {
    const schema = {
      fields: [{ key: "reason", label: { en: "Saved reason", ar: "السبب المحفوظ" } }],
    };
    expect(intakeLabel(schema, "reason", "ar")).toBe("السبب المحفوظ");
    expect(intakeLabel(schema, "reason", "en")).toBe("Saved reason");
    expect(intakeLabel(schema, "unmapped", "en")).toBe("unmapped");
  });
});
