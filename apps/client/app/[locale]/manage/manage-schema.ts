import type { ManagementIntentV1 } from "@wlbp/api-contracts";
import { z } from "zod";

import {
  isoDateField,
  linkTokenField,
  resolveExactWallTime,
  timeZoneField,
  utcInstantField,
  wallClockField,
} from "../../_lib/schema-primitives";

/** Domain codes the manage forms emit; their text lives in the copy module. */
export const manageFormCodes = {
  codeFormat: "manage_code_format",
  timeUnavailable: "manage_time_unavailable",
} as const;

const intents = [
  "view",
  "reschedule",
  "cancel",
  "refund_request",
  "request_alternative",
  "data_export",
  "data_correction_request",
  "data_deletion_request",
  "data_restriction_request",
] as const satisfies readonly ManagementIntentV1[];

/** Every `/api/manage` body carries the link token, and nothing works without it. */
export const manageTokenSchema = z.object({ token: linkTokenField });

/** Redeem the link to read the booking. An unknown intent reads as `view`. */
export const manageViewSchema = z.object({
  intent: z.enum(intents).catch("view"),
  token: linkTokenField,
});

export type ManageViewInput = z.input<typeof manageViewSchema>;

/** Ask for a one-time code by email. */
export const requestStepUpSchema = z.object({
  action: z.literal("request-step-up"),
  token: linkTokenField,
});

export type RequestStepUpInput = z.input<typeof requestStepUpSchema>;

/** The one-time code form, and the body the route verifies. */
export const verifyStepUpSchema = z.object({
  action: z.literal("verify-step-up"),
  code: z
    .string({ error: manageFormCodes.codeFormat })
    .trim()
    .regex(/^[0-9]{6}$/u, { error: manageFormCodes.codeFormat }),
  token: linkTokenField,
});

export type VerifyStepUpInput = z.input<typeof verifyStepUpSchema>;

/**
 * Cancel or move the booking at the revision the customer was shown. A move
 * names its new instant and a cancellation must not carry one.
 */
export const manageActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("cancel"),
    // The route always accepted a numeric string here; keep that, deliberately.
    expectedRevision: z.coerce.number().int().min(1),
    newStartAt: z
      .null()
      .optional()
      .transform(() => null),
    token: linkTokenField,
  }),
  z.object({
    action: z.literal("reschedule"),
    expectedRevision: z.coerce.number().int().min(1),
    newStartAt: utcInstantField,
    token: linkTokenField,
  }),
]);

export type ManageActionInput = z.input<typeof manageActionSchema>;

/**
 * The reschedule form. The customer picks a wall time in their own booking
 * timezone; it must name exactly one instant there. A time skipped by a DST
 * change, or repeated by one, is refused rather than guessed. The resolved
 * instant (`rescheduleStartAt`) is what the action body carries.
 */
export const rescheduleFormSchema = z
  .object({
    customerTimeZone: timeZoneField,
    date: isoDateField,
    time: wallClockField,
  })
  .superRefine((value, context) => {
    const complete =
      isoDateField.safeParse(value.date).success &&
      wallClockField.safeParse(value.time).success;
    if (
      complete &&
      resolveExactWallTime(value.date, value.time, value.customerTimeZone) === null
    ) {
      context.addIssue({
        code: "custom",
        message: manageFormCodes.timeUnavailable,
        path: ["time"],
      });
    }
  });

export type RescheduleFormInput = z.input<typeof rescheduleFormSchema>;

/** The one instant a valid reschedule form names. */
export function rescheduleStartAt(
  values: z.output<typeof rescheduleFormSchema>,
): string {
  const instant = resolveExactWallTime(
    values.date,
    values.time,
    values.customerTimeZone,
  );
  if (instant === null)
    throw new Error("The schema refuses a wall time that does not resolve");
  return instant;
}
