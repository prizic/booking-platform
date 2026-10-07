import { z } from "zod";

import { localeField, optionalText, recordIdField } from "../../_lib/form-schema";

/** How an operator closes a payment exception; the database records the decision. */
export const paymentResolutions = [
  "contested",
  "no_action_needed",
  "reconciled",
  "refunded",
  "written_off",
] as const;

export const resolveExceptionSchema = z.object({
  locale: localeField,
  exceptionId: recordIdField,
  resolution: z.enum(paymentResolutions, { error: "invalid" }),
  note: optionalText(500),
});
export type ResolveExceptionInput = z.input<typeof resolveExceptionSchema>;

/** Retrying a refused refund names only the booking; the amount is the database's. */
export const refundRetrySchema = z.object({
  locale: localeField,
  bookingId: recordIdField,
});
export type RefundRetryInput = z.input<typeof refundRetrySchema>;
