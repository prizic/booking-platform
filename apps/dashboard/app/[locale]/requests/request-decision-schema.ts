import { z } from "zod";

import {
  checkLocalDateTime,
  foldField,
  localeField,
  optionalText,
  recordIdField,
  revisionField,
} from "../../_lib/form-schema";

/**
 * Accept, propose or reject a booking request. The suggested time is only
 * required (and must name one real instant in the location's zone) when the
 * operator proposes; the database remains the authority on the decision.
 */
export const requestDecisionSchema = z
  .object({
    locale: localeField,
    bookingId: recordIdField,
    expectedRevision: revisionField,
    locationTimeZone: z.string(),
    action: z.enum(["accept", "propose", "reject"], { error: "invalid" }),
    publicReason: optionalText(500),
    internalReason: optionalText(500),
    proposedStartAt: z.string(),
    fold: foldField,
  })
  .superRefine((value, context) => {
    if (value.action === "propose")
      checkLocalDateTime(
        context,
        "proposedStartAt",
        value.proposedStartAt,
        value.locationTimeZone,
        value.fold,
      );
  });

export type RequestDecisionInput = z.input<typeof requestDecisionSchema>;
