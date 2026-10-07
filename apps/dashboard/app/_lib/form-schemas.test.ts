import { parseActionInput } from "@wlbp/ui-foundation/actions";
import { describe, expect, it } from "vitest";

import {
  bookingChangeSchema,
  bookingNoteSchema,
} from "../[locale]/bookings/booking-schema";
import { onBehalfConfirmSchema } from "../[locale]/bookings/new/on-behalf-schema";
import {
  customerCorrectionSchema,
  splitTags,
} from "../[locale]/customers/customer-schema";
import { requestDecisionSchema } from "../[locale]/requests/request-decision-schema";
import { signInSchema, updatePasswordSchema } from "./auth-schema";

const id = "d8000000-0000-0000-0000-000000000001";

function decision(overrides: Record<string, unknown> = {}) {
  return {
    locale: "en",
    bookingId: id,
    expectedRevision: 3,
    locationTimeZone: "America/New_York",
    action: "accept",
    publicReason: "",
    internalReason: "",
    proposedStartAt: "",
    fold: "none",
    ...overrides,
  };
}

function errorsOf(schema: Parameters<typeof parseActionInput>[0], input: unknown) {
  const parsed = parseActionInput(schema, input);
  return parsed.ok ? null : parsed.result.ok ? null : parsed.result.fieldErrors;
}

describe("request decision schema", () => {
  it("accepts or rejects without a suggested time", () => {
    expect(errorsOf(requestDecisionSchema, decision())).toBeNull();
    expect(errorsOf(requestDecisionSchema, decision({ action: "reject" }))).toBeNull();
  });

  it("requires a whole-minute local time only when proposing", () => {
    expect(errorsOf(requestDecisionSchema, decision({ action: "propose" }))).toEqual({
      proposedStartAt: ["required"],
    });
    expect(
      errorsOf(
        requestDecisionSchema,
        decision({ action: "propose", proposedStartAt: "2026-07-15T09:00:30" }),
      ),
    ).toEqual({ proposedStartAt: ["invalid_date"] });
    expect(
      errorsOf(
        requestDecisionSchema,
        decision({ action: "propose", proposedStartAt: "2026-07-15T09:00" }),
      ),
    ).toBeNull();
  });

  it("refuses a spring-forward gap and an unresolved fall-back repeat", () => {
    expect(
      errorsOf(
        requestDecisionSchema,
        decision({ action: "propose", proposedStartAt: "2026-03-08T02:30" }),
      ),
    ).toEqual({ proposedStartAt: ["local_time_unresolved"] });
    expect(
      errorsOf(
        requestDecisionSchema,
        decision({ action: "propose", proposedStartAt: "2026-11-01T01:30" }),
      ),
    ).toEqual({ proposedStartAt: ["local_time_unresolved"] });
    expect(
      errorsOf(
        requestDecisionSchema,
        decision({ action: "propose", proposedStartAt: "2026-11-01T01:30", fold: "1" }),
      ),
    ).toBeNull();
  });

  it("refuses unknown decisions, fractional revisions and long reasons", () => {
    expect(
      errorsOf(requestDecisionSchema, decision({ action: "delete" })),
    ).toHaveProperty("action");
    expect(
      errorsOf(requestDecisionSchema, decision({ expectedRevision: 1.5 })),
    ).toEqual({
      expectedRevision: ["invalid_integer"],
    });
    expect(
      errorsOf(requestDecisionSchema, decision({ publicReason: "x".repeat(501) })),
    ).toEqual({ publicReason: ["too_long"] });
    expect(errorsOf(requestDecisionSchema, "action=accept")).not.toBeNull();
  });
});

describe("booking change schema", () => {
  const change = (overrides: Record<string, unknown>) => ({
    ...decision(),
    action: "cancel",
    newStartAt: "",
    ...overrides,
  });
  it("needs a new time only to reschedule", () => {
    expect(errorsOf(bookingChangeSchema, change({}))).toBeNull();
    expect(errorsOf(bookingChangeSchema, change({ action: "resend" }))).toBeNull();
    expect(errorsOf(bookingChangeSchema, change({ action: "reschedule" }))).toEqual({
      newStartAt: ["required"],
    });
  });

  it("requires a note body and a known visibility", () => {
    const note = { locale: "ar", bookingId: id, body: "  ", visibility: "operational" };
    expect(errorsOf(bookingNoteSchema, note)).toEqual({ body: ["required"] });
    expect(
      errorsOf(bookingNoteSchema, { ...note, body: "ok", visibility: "public" }),
    ).toHaveProperty("visibility");
  });
});

describe("customer correction schema", () => {
  const correction = {
    locale: "en",
    customerId: id,
    expectedRevision: 1,
    fullName: " Sara ",
    email: "sara@example.invalid",
    phone: "",
    tags: "vip, , regular ",
  };
  it("requires a name and a valid email", () => {
    expect(errorsOf(customerCorrectionSchema, correction)).toBeNull();
    expect(
      errorsOf(customerCorrectionSchema, { ...correction, fullName: "", email: "x" }),
    ).toEqual({ fullName: ["required"], email: ["invalid_email"] });
  });

  it("splits tags the way the server always has", () => {
    expect(splitTags(correction.tags)).toEqual(["vip", "regular"]);
    expect(splitTags("")).toEqual([]);
  });
});

describe("account schemas", () => {
  it("keeps the sign-in email rule", () => {
    const base = { locale: "en", email: "a@b.co", password: "x", returnTo: "" };
    expect(errorsOf(signInSchema, base)).toBeNull();
    expect(errorsOf(signInSchema, { ...base, email: "a b@c.d" })).toEqual({
      email: ["invalid_email"],
    });
    expect(errorsOf(signInSchema, { ...base, password: "" })).toEqual({
      password: ["required"],
    });
  });

  it("needs eight characters and a matching confirmation", () => {
    expect(
      errorsOf(updatePasswordSchema, {
        locale: "ar",
        password: "short",
        confirmation: "short",
      }),
    ).toEqual({ password: ["too_short"] });
    expect(
      errorsOf(updatePasswordSchema, {
        locale: "ar",
        password: "long enough",
        confirmation: "different",
      }),
    ).toEqual({ confirmation: ["mismatch"] });
  });
});

describe("on-behalf confirmation schema", () => {
  const base = {
    locale: "en",
    fullName: "Guest",
    email: "guest@example.invalid",
    phone: "",
    consented: true,
    answers: { reason: "", note: "" },
    intakeFields: [
      { key: "reason", required: true, maxLength: 10 },
      { key: "note", required: false, maxLength: 2000 },
    ],
    holdId: id,
    sessionToken: "a".repeat(64),
    requestId: id,
    consentVersion: "v1",
    customerTimeZone: "Asia/Riyadh",
  };
  it("checks declared intake answers and consent", () => {
    expect(errorsOf(onBehalfConfirmSchema, base)).toEqual({
      "answers.reason": ["required"],
    });
    expect(
      errorsOf(onBehalfConfirmSchema, {
        ...base,
        consented: false,
        answers: { reason: "x".repeat(11) },
      }),
    ).toEqual({ consented: ["required"], "answers.reason": ["too_long"] });
    expect(
      errorsOf(onBehalfConfirmSchema, { ...base, answers: { reason: "Checkup" } }),
    ).toBeNull();
  });

  it("keeps the booking contract's phone rule", () => {
    expect(
      errorsOf(onBehalfConfirmSchema, {
        ...base,
        answers: { reason: "Checkup" },
        phone: "call me",
      }),
    ).toEqual({ phone: ["invalid_phone"] });
  });
});
