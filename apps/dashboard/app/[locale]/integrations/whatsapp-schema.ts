/*
 * One schema for the WhatsApp channel form: the browser form and
 * `saveWhatsAppConfigAction` validate the same input. The token itself is
 * never entered anywhere: only a reference to a platform-held secret.
 */
import { z } from "zod";
import { localeField, uuid } from "../services/schema-kit";

/**
 * The message types the platform can send on WhatsApp (docs/whatsapp.md and
 * the database catalog); every other type stays on email.
 */
export const whatsAppCapableKeys = [
  "booking.confirmed",
  "booking.requested",
  "booking.rejected",
  "booking.request_expired",
  "booking.proposal_created",
  "booking.proposal_declined",
  "booking.rescheduled",
  "booking.cancelled",
  "booking.reminder",
] as const;

const metaId = z
  .string()
  .trim()
  .refine((value) => value === "" || /^[0-9]{5,32}$/u.test(value), {
    error: "wa_id_invalid",
  });

/** `env:WHATSAPP_TOKEN_<32 hex>[_SUFFIX]` or `vault:<uuid>`; "" keeps the stored one. */
export const secretReferencePattern =
  /^(vault:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|env:WHATSAPP_TOKEN_[0-9A-F]{32}(_[A-Z0-9]{1,16})?)$/u;

export const whatsAppConfigSchema = z
  .object({
    locale: localeField,
    requestId: uuid,
    expectedRevision: z
      .number({ error: "invalid" })
      .int({ error: "invalid" })
      .min(0, { error: "invalid" })
      .max(Number.MAX_SAFE_INTEGER, { error: "invalid" }),
    enabled: z.boolean({ error: "invalid" }),
    phoneNumberId: metaId,
    businessAccountId: metaId,
    accessTokenSecretRef: z
      .string()
      .trim()
      .max(160, { error: "too_long" })
      .refine((value) => value === "" || secretReferencePattern.test(value), {
        error: "wa_secret_ref_invalid",
      }),
    /** Whether a reference is already stored (read-only; the database decides). */
    tokenConfigured: z.boolean({ error: "invalid" }),
    templates: z
      .array(
        z.object({
          templateKey: z.enum(whatsAppCapableKeys, { error: "invalid" }),
          name: z
            .string()
            .trim()
            .max(512, { error: "too_long" })
            .refine((value) => value === "" || /^[a-z0-9_]+$/u.test(value), {
              error: "wa_template_name_invalid",
            }),
          language: z
            .string()
            .trim()
            .refine(
              (value) => value === "" || /^[a-z]{2,3}(_[A-Z]{2})?$/u.test(value),
              {
                error: "wa_template_language_invalid",
              },
            ),
        }),
      )
      .max(whatsAppCapableKeys.length, { error: "too_large" }),
  })
  .superRefine((value, context) => {
    value.templates.forEach((row, index) => {
      if ((row.name === "") === (row.language === "")) return;
      context.addIssue({
        code: "custom",
        path: ["templates", index, row.name === "" ? "name" : "language"],
        message: "wa_template_incomplete",
      });
    });
    if (
      value.enabled &&
      (value.phoneNumberId === "" ||
        value.businessAccountId === "" ||
        (value.accessTokenSecretRef === "" && !value.tokenConfigured))
    )
      context.addIssue({
        code: "custom",
        path: ["enabled"],
        message: "wa_enable_incomplete",
      });
  });
export type WhatsAppConfigInput = z.input<typeof whatsAppConfigSchema>;
