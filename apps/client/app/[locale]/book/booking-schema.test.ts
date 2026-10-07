import { parseConfirmBookingV1Request } from "@wlbp/api-contracts";
import { describe, expect, it } from "vitest";

import {
  bookingDetailsFormSchema,
  bookingDetailsSchema,
  checkoutStatusSchema,
  createHoldSchema,
  splitBookingDetails,
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

describe("booking details schema: WhatsApp opt-in", () => {
  const optIn = {
    consentText: " I agree to WhatsApp updates. ",
    consentVersion: "1",
    phoneE164: "05 1234 5678",
  };
  const saudi = { whatsAppDialCode: "966" };

  function withOptIn(value: unknown) {
    return { ...details, contact: { ...details.contact, whatsappOptIn: value } };
  }

  it("is optional: absent or unticked (null) sends no opt-in at all", () => {
    for (const input of [details, withOptIn(null), withOptIn(undefined)]) {
      const values = bookingDetailsFormSchema(questions, saudi).parse(input);
      expect(values.contact.whatsappOptIn).toBeUndefined();
      const { request, whatsappOptIn } = splitBookingDetails(values);
      expect(whatsappOptIn).toBeNull();
      expect(Object.keys(request.contact).sort()).toEqual([
        "email",
        "fullName",
        "phone",
      ]);
      expect(() => parseConfirmBookingV1Request(request)).not.toThrow();
    }
  });

  it("normalizes a ticked national number to E.164 for the chosen country", () => {
    const values = bookingDetailsFormSchema(questions, saudi).parse(withOptIn(optIn));
    expect(values.contact.whatsappOptIn).toEqual({
      consentText: "I agree to WhatsApp updates.",
      consentVersion: "1",
      phoneE164: "+966512345678",
    });
    // The route has no country, and still accepts the browser's output unchanged.
    expect(bookingDetailsSchema.parse(values)).toEqual(values);
    const { request, whatsappOptIn } = splitBookingDetails(values);
    expect(whatsappOptIn?.phoneE164).toBe("+966512345678");
    expect(() => parseConfirmBookingV1Request(request)).not.toThrow();
  });

  it.each([
    ["+971 50 123 4567", "+971501234567"],
    ["00971501234567", "+971501234567"],
    ["٠٥١٢٣٤٥٦٧٨", "+966512345678"],
    ["(051) 234-5678", "+966512345678"],
  ])("reads %s as %s", (typed, expected) => {
    const values = bookingDetailsFormSchema(questions, saudi).parse(
      withOptIn({ ...optIn, phoneE164: typed }),
    );
    expect(values.contact.whatsappOptIn?.phoneE164).toBe(expected);
  });

  it("requires the phone only once the box is ticked", () => {
    expect(
      codes(
        withOptIn({ ...optIn, phoneE164: "  " }),
        bookingDetailsFormSchema(questions, saudi),
      ),
    ).toEqual({ "contact.whatsappOptIn.phoneE164": "booking_whatsapp_phone_required" });
    expect(codes(withOptIn(null), bookingDetailsFormSchema(questions, saudi))).toEqual(
      {},
    );
  });

  it.each(["12", "+0512345678", "+9665123456789012", "call me", "05123x5678"])(
    "refuses the invalid number %s",
    (phoneE164) => {
      expect(
        codes(
          withOptIn({ ...optIn, phoneE164 }),
          bookingDetailsFormSchema(questions, saudi),
        )["contact.whatsappOptIn.phoneE164"],
      ).toBe("booking_whatsapp_phone_invalid");
    },
  );

  it("accepts only E.164 on the route, where no country is known", () => {
    expect(bookingDetailsSchema.safeParse(withOptIn(optIn)).success).toBe(false);
    expect(
      bookingDetailsSchema.safeParse(
        withOptIn({ ...optIn, phoneE164: "+966512345678" }),
      ).success,
    ).toBe(true);
  });

  it("refuses a malformed opt-in object the database would refuse", () => {
    for (const value of [
      { ...optIn, consentText: "" },
      { ...optIn, consentVersion: "v 1" },
      { ...optIn, extra: "field" },
      "yes",
    ]) {
      expect(bookingDetailsSchema.safeParse(withOptIn(value)).success).toBe(false);
    }
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
