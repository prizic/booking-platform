import { z } from "zod";

import { localeField, recordIdField } from "../../../_lib/form-schema";
import { validCivilDate } from "../../calendar/calendar-range";

/**
 * The three steps of booking on a customer's behalf, one schema per form:
 * find times (search), hold one (hold), confirm with contact and consent
 * (confirm). The server actions re-validate with the same schemas; the booking
 * functions in the database remain the authority on time, capacity and price.
 */

/** "Any eligible staff" — Radix Select cannot hold "". */
export const anyStaff = "any";

/** An offer is a published service at one location: `serviceId:locationId`. */
export const offerKeyField = z
  .string()
  .regex(/^[a-f0-9-]{36}:[a-f0-9-]{36}$/iu, { error: "required" });

export function offerKey(offer: { id: string; locationId: string }): string {
  return `${offer.id}:${offer.locationId}`;
}

export function splitOfferKey(key: string): { serviceId: string; locationId: string } {
  const [serviceId = "", locationId = ""] = key.split(":");
  return { serviceId, locationId };
}

const staffField = z.union([z.literal(anyStaff), recordIdField], { error: "invalid" });

export const onBehalfSearchSchema = z.object({
  locale: localeField,
  offer: offerKeyField,
  /** The offer location's zone; the day is read as a civil day there. */
  timeZone: z.string().min(1, { error: "invalid_time_zone" }),
  date: z
    .string()
    .min(1, { error: "required" })
    .refine(validCivilDate, { error: "invalid_date" }),
  staffId: staffField,
});
export type OnBehalfSearchInput = z.input<typeof onBehalfSearchSchema>;

export const onBehalfHoldSchema = z.object({
  locale: localeField,
  offer: offerKeyField,
  staffId: staffField,
  start: z.string().min(1, { error: "required" }),
  /** Opaque browser session evidence: rate limiting only, never authorization. */
  sessionToken: z.string().min(16, { error: "invalid" }).max(200, { error: "invalid" }),
  /** This attempt; the hold and booking idempotency keys derive from it. */
  requestId: recordIdField,
});
export type OnBehalfHoldInput = z.input<typeof onBehalfHoldSchema>;

const intakeRuleField = z.object({
  key: z.string().min(1).max(80),
  required: z.boolean(),
  maxLength: z.number().int().min(1).max(2000),
});

export const onBehalfConfirmSchema = z
  .object({
    locale: localeField,
    fullName: z
      .string()
      .trim()
      .min(1, { error: "required" })
      .max(160, { error: "too_long" }),
    email: z
      .string()
      .trim()
      .min(1, { error: "required" })
      .max(254, { error: "too_long" })
      .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/u, { error: "invalid_email" }),
    phone: z
      .string()
      .trim()
      .max(32, { error: "too_long" })
      .refine(
        (phone) => phone === "" || (phone.length >= 3 && /^[+0-9 ()-]+$/u.test(phone)),
        {
          error: "invalid_phone",
        },
      ),
    consented: z.boolean().refine((checked) => checked, { error: "required" }),
    answers: z.record(z.string(), z.string()),
    /** The held form's declared intake fields, so required answers can be checked. */
    intakeFields: z.array(intakeRuleField).max(50),
    holdId: recordIdField,
    sessionToken: z
      .string()
      .min(16, { error: "invalid" })
      .max(200, { error: "invalid" }),
    requestId: recordIdField,
    consentVersion: z.string().min(1).max(40),
    customerTimeZone: z.string().min(1),
  })
  .superRefine((value, context) => {
    for (const field of value.intakeFields) {
      const answer = value.answers[field.key] ?? "";
      if (field.required && answer.trim() === "")
        context.addIssue({
          code: "custom",
          message: "required",
          path: ["answers", field.key],
        });
      else if (answer.length > field.maxLength)
        context.addIssue({
          code: "custom",
          message: "too_long",
          path: ["answers", field.key],
        });
    }
  });
export type OnBehalfConfirmInput = z.input<typeof onBehalfConfirmSchema>;
