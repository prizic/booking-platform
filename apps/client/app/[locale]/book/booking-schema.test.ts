import { parseConfirmBookingV1Request } from "@wlbp/api-contracts";
import { describe, expect, it } from "vitest";

import {
  bookingDetailsFormSchema,
  bookingDetailsSchema,
  checkoutStatusSchema,
  createHoldSchema,
  type BookingDetailsInput,
} from "./booking-schema";

const details = {
  consent: true,
  consentVersion: "2",
  contact: { email: " Guest@Example.Invalid ", fullName: " Test Guest ", phone: "" },
  customerTimeZone: "Asia/Riyadh",
  holdId: "0a3f2b64-0000-4000-8000-000000000001",
  idempotencyKey: "confirm-0a3f2b64-0000-4000-8000-000000000001",
  intake: { reason: " First visit ", notes: "" },
  locale: "en",
  sessionToken: "session-token-0000000000000000",
} satisfies BookingDetailsInput;

const questions = [
  { key: "reason", required: true },
  { key: "notes", required: false },
];

function codes(input: unknown, schema = bookingDetailsFormSchema(questions)) {
  const parsed = schema.safeParse(input);
  return parsed.success
    ? {}
    : Object.fromEntries(
        parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]),
      );
}

describe("booking details schema", () => {
  it("normalizes contact and answers the way the contract stores them", () => {
    const values = bookingDetailsFormSchema(questions).parse(details);
    expect(values.contact).toEqual({
      email: "guest@example.invalid",
      fullName: "Test Guest",
      phone: null,
    });
    // Empty optional answers are dropped, never sent as "".
    expect(values.intake).toEqual({ reason: "First visit" });
  });

  it("produces a body the route re-validates unchanged and the contract accepts", () => {
    const values = bookingDetailsFormSchema(questions).parse(details);
    expect(bookingDetailsSchema.parse(values)).toEqual(values);
    const { consent: _consent, ...body } = values;
    expect(() => parseConfirmBookingV1Request(body)).not.toThrow();
  });

  it("asks for a name, a deliverable address and consent before any request", () => {
    expect(
      codes({
        ...details,
        consent: false,
        contact: { email: "guest", fullName: "   ", phone: "" },
      }),
    ).toEqual({
      consent: "booking_consent_required",
      "contact.email": "booking_email_required",
      "contact.fullName": "booking_name_required",
    });
  });

  it("requires exactly the questions this hold marks required", () => {
    expect(codes({ ...details, intake: { reason: "  " } })).toEqual({
      "intake.reason": "booking_field_required",
    });
    expect(codes({ ...details, intake: {} }, bookingDetailsFormSchema([]))).toEqual({});
  });

  it("sends only the answers to this hold's questions", () => {
    const values = bookingDetailsFormSchema([{ key: "reason", required: true }]).parse({
      ...details,
      intake: { reason: "Visit", stale: "From an earlier hold" },
    });
    expect(values.intake).toEqual({ reason: "Visit" });
  });

  it.each([
    ["contact.fullName", { fullName: "x".repeat(161) }, "too_long"],
    ["contact.phone", { phone: "12" }, "invalid_phone"],
    ["contact.phone", { phone: "call me" }, "invalid_phone"],
  ])("bounds %s like the contract", (path, contact, code) => {
    expect(
      codes({ ...details, contact: { ...details.contact, ...contact } })[path],
    ).toBe(code);
  });

  it("refuses technical values the contract would refuse", () => {
    expect(
      bookingDetailsSchema.safeParse({ ...details, sessionToken: "short" }).success,
    ).toBe(false);
    expect(
      bookingDetailsSchema.safeParse({ ...details, customerTimeZone: "Mars/Olympus" })
        .success,
    ).toBe(false);
    expect(bookingDetailsSchema.safeParse({ ...details, locale: "fr" }).success).toBe(
      false,
    );
  });
});

describe("hold request schema", () => {
  const hold = {
    expectedCacheTag: null,
    idempotencyKey: "hold-2035-09-24T13:00:00.000Z-abc",
    locale: "en",
    locationId: "a5000000-0000-0000-0000-000000000001",
    partySize: 1,
    serviceId: "a7200000-0000-0000-0000-000000000001",
    sessionToken: "session-token-0000000000000000",
    staffPreferenceId: null,
    startAt: "2035-09-24T13:00:00.000Z",
  } as const;

  it("accepts the hold the booking flow sends", () => {
    expect(createHoldSchema.parse(hold)).toEqual(hold);
  });

  it.each([
    ["partySize", 2],
    ["startAt", "2035-09-24T13:00:30.000Z"],
    ["startAt", "2035-09-24T13:00"],
    ["idempotencyKey", "short"],
  ])("refuses %s %s", (key, value) => {
    expect(createHoldSchema.safeParse({ ...hold, [key]: value }).success).toBe(false);
  });
});

describe("checkout status schema", () => {
  it("accepts only string identifiers", () => {
    expect(
      checkoutStatusSchema.safeParse({ holdId: "h", sessionToken: "s" }).success,
    ).toBe(true);
    expect(
      checkoutStatusSchema.safeParse({ holdId: 1, sessionToken: "s" }).success,
    ).toBe(false);
  });
});
