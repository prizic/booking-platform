/*
 * One schema for a member's own email preferences: the browser form and
 * `saveMyNotificationPreferencesAction` validate the same input.
 */
import { z } from "zod";
import { staffPreferenceKeysV1 } from "@wlbp/api-contracts";
import { localeField, uuid } from "../../services/schema-kit";

/** The member's alert types other than the daily agenda, which has its own control. */
export const staffAlertKeys = staffPreferenceKeysV1.filter(
  (key): key is Exclude<(typeof staffPreferenceKeysV1)[number], "staff.daily_digest"> =>
    key !== "staff.daily_digest",
);

export const myPreferencesSchema = z.object({
  locale: localeField,
  requestId: uuid,
  alerts: z
    .array(
      z.object({
        templateKey: z.enum(staffAlertKeys as [string, ...string[]], {
          error: "invalid",
        }),
        enabled: z.boolean({ error: "invalid" }),
      }),
    )
    .max(16, { error: "too_large" }),
  digestEnabled: z.boolean({ error: "invalid" }),
  /** Wall-clock `HH:MM` in the member's location time zone. */
  digestLocalTime: z
    .string()
    .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/u, { error: "invalid_time" }),
});
export type MyPreferencesInput = z.input<typeof myPreferencesSchema>;
