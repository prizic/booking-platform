/*
 * One schema per notification-settings form: the browser validates with it
 * and the server action validates the same input again. Messages are codes
 * rendered by the form in the operator's language (notification-copy.ts).
 */
import { z } from "zod";
import {
  notificationTemplateKeysV1,
  reminderOffsetBoundsV1,
} from "@wlbp/api-contracts";
import { localeField, uuid } from "../../services/schema-kit";

/** Preset reminder lead times, in minutes: 15 min, 1 h, 2 h, 24 h, 48 h, 1 week. */
export const reminderPresetMinutes = [15, 60, 120, 1440, 2880, 10080] as const;

const reminderOffset = z
  .number({ error: "reminder_offset_range" })
  .int({ error: "reminder_offset_range" })
  .min(reminderOffsetBoundsV1.min, { error: "reminder_offset_range" })
  .max(reminderOffsetBoundsV1.max, { error: "reminder_offset_range" });

/** 1 to 4 distinct lead times, exactly as the database accepts them. */
export const reminderOffsetsField = z
  .array(reminderOffset)
  .min(1, { error: "reminder_offsets_required" })
  .max(reminderOffsetBoundsV1.maxCount, { error: "reminder_offsets_too_many" })
  .refine((offsets) => new Set(offsets).size === offsets.length, {
    error: "reminder_offset_duplicate",
  });

/** A custom lead time typed as text: a whole number of minutes within bounds. */
export function parseCustomLeadTime(
  value: string,
):
  | { readonly ok: true; readonly minutes: number }
  | { readonly ok: false; readonly code: "reminder_offset_range" } {
  const trimmed = value.trim();
  const minutes = Number(trimmed);
  return /^\d{1,6}$/u.test(trimmed) && reminderOffset.safeParse(minutes).success
    ? { ok: true, minutes }
    : { ok: false, code: "reminder_offset_range" };
}

export const templateKeyField = z.enum(notificationTemplateKeysV1, {
  error: "invalid",
});

export const notificationSettingsSchema = z.object({
  locale: localeField,
  /** The revision the operator read; 0 before the first save. */
  expectedRevision: z
    .number({ error: "invalid" })
    .int({ error: "invalid" })
    .min(0, { error: "invalid" })
    .max(Number.MAX_SAFE_INTEGER, { error: "invalid" }),
  requestId: uuid,
  items: z
    .array(
      z.object({
        templateKey: templateKeyField,
        emailEnabled: z.boolean({ error: "invalid" }),
        whatsappEnabled: z.boolean({ error: "invalid" }),
      }),
    )
    .max(64, { error: "too_large" }),
  reminderOffsets: reminderOffsetsField,
});
export type NotificationSettingsInput = z.input<typeof notificationSettingsSchema>;

export const emailLocaleField = z.enum(["ar", "en"], { error: "invalid" });

export const emailPreviewSchema = z.object({
  locale: localeField,
  templateKey: templateKeyField,
  emailLocale: emailLocaleField,
});
export type EmailPreviewInput = z.input<typeof emailPreviewSchema>;

export const testNotificationSchema = emailPreviewSchema.extend({ requestId: uuid });
export type TestNotificationInput = z.input<typeof testNotificationSchema>;
