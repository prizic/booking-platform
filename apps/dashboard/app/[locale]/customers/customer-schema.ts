import { z } from "zod";

import {
  localeField,
  optionalText,
  recordIdField,
  requiredText,
  revisionField,
} from "../../_lib/form-schema";

/**
 * Correcting identity. Name and email are required; phone and the
 * comma-separated tags are optional. Past bookings keep their snapshots.
 */
export const customerCorrectionSchema = z.object({
  locale: localeField,
  customerId: recordIdField,
  expectedRevision: revisionField,
  fullName: requiredText(160),
  email: requiredText(320).pipe(z.email({ error: "invalid_email" })),
  phone: optionalText(40),
  tags: optionalText(400),
});
export type CustomerCorrectionInput = z.input<typeof customerCorrectionSchema>;

/** Restriction and legal hold: both reversible, both recorded, both audited. */
export const customerFlagSchema = z.object({
  locale: localeField,
  customerId: recordIdField,
  action: z.enum(["restrict", "unrestrict", "hold", "release"], { error: "invalid" }),
  reason: optionalText(500),
});
export type CustomerFlagInput = z.input<typeof customerFlagSchema>;

/** Export or deletion, opened and run as one operator intent. */
export const privacyRequestSchema = z.object({
  locale: localeField,
  customerId: recordIdField,
  kind: z.enum(["export", "deletion"], { error: "invalid" }),
});
export type PrivacyRequestInput = z.input<typeof privacyRequestSchema>;

/** The server's split of the tags field: comma-separated, trimmed, no blanks. */
export function splitTags(tags: string): string[] {
  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
}
