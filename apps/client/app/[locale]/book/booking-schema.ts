import { z } from "zod";

import {
  localeField,
  nonEmptyText,
  opaqueKeyField,
  timeZoneField,
  utcInstantField,
} from "../../_lib/schema-primitives";
import { e164Pattern, normalizeWhatsAppNumber } from "../../_lib/whatsapp-phone";

/** Domain codes the booking forms emit; their text lives in the copy module. */
export const bookingFormCodes = {
  consentRequired: "booking_consent_required",
  emailRequired: "booking_email_required",
  fieldRequired: "booking_field_required",
  nameRequired: "booking_name_required",
  whatsAppPhoneInvalid: "booking_whatsapp_phone_invalid",
  whatsAppPhoneRequired: "booking_whatsapp_phone_required",
} as const;

// The contract's own address rule, so the browser and route agree exactly.
const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;
const phonePattern = /^[+0-9 ()-]+$/u;

/**
 * `POST /api/holds`. No customer types anything here: the hold is the chosen
 * slot plus technical keys. The idempotency key is derived from the slot and
 * the tab's session, so a retried tap is the same hold.
 */
export const createHoldSchema = z.object({
  expectedCacheTag: nonEmptyText.nullable(),
  idempotencyKey: opaqueKeyField,
  locale: localeField,
  locationId: nonEmptyText,
  partySize: z.literal(1, { error: "invalid" }),
  serviceId: nonEmptyText,
  sessionToken: opaqueKeyField,
  staffPreferenceId: nonEmptyText.nullable(),
  startAt: utcInstantField.refine((value) => Date.parse(value) % 60_000 === 0, {
    error: "invalid_time",
  }),
});

export type CreateHoldInput = z.input<typeof createHoldSchema>;

/**
 * The WhatsApp opt-in carried inside the booking contact. The phone is
 * required only once the box is ticked, because only then does the object
 * exist. The browser knows the chosen country and turns a national number
 * into E.164; the route (no country) accepts only E.164. The consent text and
 * version are what the customer was shown; the route checks them against the
 * instance content for the booking's locale.
 */
function whatsAppOptInSchema(dialCode: string | null) {
  return z.strictObject(
    {
      consentText: z
        .string({ error: "invalid" })
        .trim()
        .min(1, { error: "invalid" })
        .max(2000, { error: "too_long" }),
      consentVersion: z
        .string({ error: "invalid" })
        .regex(/^[A-Za-z0-9._-]{1,40}$/u, { error: "invalid" }),
      phoneE164: z
        .string({ error: bookingFormCodes.whatsAppPhoneRequired })
        .trim()
        .min(1, { abort: true, error: bookingFormCodes.whatsAppPhoneRequired })
        .transform((value) => normalizeWhatsAppNumber(value, dialCode))
        .refine((value) => e164Pattern.test(value), {
          error: bookingFormCodes.whatsAppPhoneInvalid,
        }),
    },
    { error: "invalid" },
  );
}

/**
 * The details step and the body of `POST /api/bookings` and
 * `POST /api/checkout`. Customer fields (contact, intake answers, consent)
 * sit beside the hidden technical values the hold produced. Every transform
 * is idempotent, so the browser's parsed output re-validates unchanged on the
 * route.
 */
function detailsSchema(whatsAppDialCode: string | null) {
  return z.object({
    consent: z
      .boolean({ error: bookingFormCodes.consentRequired })
      .refine((value) => value, { error: bookingFormCodes.consentRequired }),
    consentVersion: nonEmptyText.pipe(z.string().max(40, { error: "too_long" })),
    contact: z.object({
      email: z
        .string({ error: bookingFormCodes.emailRequired })
        .trim()
        .toLowerCase()
        .max(320, { error: "too_long" })
        .regex(emailPattern, { error: bookingFormCodes.emailRequired }),
      fullName: z
        .string({ error: bookingFormCodes.nameRequired })
        .trim()
        .min(1, { error: bookingFormCodes.nameRequired })
        .max(160, { error: "too_long" }),
      // Optional. An empty answer is sent as null, never as "".
      phone: z
        .union([z.null(), z.string().trim()])
        .transform((value) => (value === "" ? null : value))
        .refine(
          (value) =>
            value === null ||
            (value.length >= 3 && value.length <= 40 && phonePattern.test(value)),
          { error: "invalid_phone" },
        ),
      // Optional. Present only when the customer ticked the WhatsApp box; null
      // (unticked) is dropped, so the body never carries an empty opt-in.
      whatsappOptIn: whatsAppOptInSchema(whatsAppDialCode)
        // nullable(), not a union, so a ticked box keeps the phone's own error.
        .nullable()
        .optional()
        .transform((value) => value ?? undefined),
    }),
    customerTimeZone: timeZoneField,
    holdId: nonEmptyText,
    idempotencyKey: opaqueKeyField,
    // Unanswered optional questions are dropped rather than sent empty.
    intake: z
      .record(
        z.string().refine((key) => key.trim() !== "" && key.length <= 80, {
          error: "invalid",
        }),
        z.string({ error: "invalid" }).trim().max(2000, { error: "too_long" }),
      )
      .transform((answers) =>
        Object.fromEntries(
          Object.entries(answers).filter(([, answer]) => answer !== ""),
        ),
      )
      .refine((answers) => Object.keys(answers).length <= 50, { error: "invalid" }),
    locale: localeField,
    sessionToken: opaqueKeyField,
  });
}

export const bookingDetailsSchema = detailsSchema(null);

export type BookingDetailsInput = z.input<typeof bookingDetailsSchema>;
export type BookingDetailsValues = z.output<typeof bookingDetailsSchema>;

/**
 * Splits validated details into the shared booking contract request and the
 * optional WhatsApp opt-in, which the contract parser does not know about and
 * which the data source puts back inside `p_contact`.
 */
export function splitBookingDetails(values: BookingDetailsValues) {
  const {
    consent: _consent,
    contact: { whatsappOptIn, ...contact },
    ...rest
  } = values;
  return { request: { ...rest, contact }, whatsappOptIn: whatsappOptIn ?? null };
}

export interface IntakeQuestion {
  readonly key: string;
  readonly required: boolean;
}

/**
 * The browser's view of the same schema for one hold: which questions that
 * publication marks required, and only those questions' answers are sent. The
 * route cannot know the publication's questions, so it validates the shared
 * schema and the database enforces the rest. The WhatsApp country is browser
 * knowledge too: the form sends E.164, which the route re-validates unchanged.
 */
export function bookingDetailsFormSchema(
  questions: readonly IntakeQuestion[],
  options: { readonly whatsAppDialCode?: string } = {},
) {
  const asked = new Set(questions.map((question) => question.key));
  return detailsSchema(options.whatsAppDialCode ?? null)
    .superRefine((value, context) => {
      for (const question of questions) {
        if (question.required && (value.intake[question.key] ?? "") === "") {
          context.addIssue({
            code: "custom",
            message: bookingFormCodes.fieldRequired,
            path: ["intake", question.key],
          });
        }
      }
    })
    .transform((value) => ({
      ...value,
      intake: Object.fromEntries(
        Object.entries(value.intake).filter(([key]) => asked.has(key)),
      ),
    }));
}

/** `POST /api/checkout/status`: which hold the customer came back from. */
export const checkoutStatusSchema = z.object({
  holdId: z.string({ error: "invalid" }),
  sessionToken: z.string({ error: "invalid" }),
});

export type CheckoutStatusInput = z.input<typeof checkoutStatusSchema>;
