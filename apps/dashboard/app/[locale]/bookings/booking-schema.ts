import { z } from "zod";

import {
  checkLocalDateTime,
  foldField,
  localeField,
  optionalText,
  recordIdField,
  requiredText,
  revisionField,
} from "../../_lib/form-schema";

/**
 * Reschedule, cancel or resend from the bookings list. Only a reschedule needs
 * the new local time, and it must name one real instant in the location's
 * zone. Resending replays the existing message and needs nothing else.
 */
export const bookingChangeSchema = z
  .object({
    locale: localeField,
    bookingId: recordIdField,
    expectedRevision: revisionField,
    locationTimeZone: z.string(),
    action: z.enum(["reschedule", "cancel", "resend"], { error: "invalid" }),
    newStartAt: z.string(),
    fold: foldField,
    publicReason: optionalText(500),
    internalReason: optionalText(500),
  })
  .superRefine((value, context) => {
    if (value.action === "reschedule")
      checkLocalDateTime(
        context,
        "newStartAt",
        value.newStartAt,
        value.locationTimeZone,
        value.fold,
      );
  });
export type BookingChangeInput = z.input<typeof bookingChangeSchema>;

/** The lifecycle actions on the booking detail; the database decides which apply. */
export const bookingTransitionActions = [
  "check_in",
  "complete",
  "no_show",
  "correct",
] as const;

export const bookingTransitionSchema = z.object({
  locale: localeField,
  bookingId: recordIdField,
  expectedRevision: revisionField,
  action: z.enum(bookingTransitionActions, { error: "invalid" }),
  reason: optionalText(500),
});
export type BookingTransitionInput = z.input<typeof bookingTransitionSchema>;

export const bookingNoteSchema = z.object({
  locale: localeField,
  bookingId: recordIdField,
  body: requiredText(2000),
  visibility: z.enum(["operational", "sensitive"], { error: "invalid" }),
});
export type BookingNoteInput = z.input<typeof bookingNoteSchema>;
