import { z } from "zod";
import { formLocale, idempotencyKey, reason, recordId, requiredText } from "./fields";

export const createTenantSchema = z.object({
  name: requiredText(160),
  brandKey: requiredText(63).transform((value) => value.toLowerCase()),
  idempotencyKey,
  locale: formLocale,
});
export type CreateTenantInput = z.input<typeof createTenantSchema>;

export const renameTenantSchema = z.object({
  tenantId: recordId,
  name: requiredText(160),
  expectedUpdatedAt: z.string({ error: "stale_revision" }),
});
export type RenameTenantInput = z.input<typeof renameTenantSchema>;

export const setTenantStatusSchema = z.object({
  tenantId: recordId,
  status: z.enum(["suspended", "active"], { error: "transition_not_allowed" }),
  expectedStatus: z.string({ error: "stale_revision" }),
  reason: reason(10),
});
export type SetTenantStatusInput = z.input<typeof setTenantStatusSchema>;

export const requestTenantClosureSchema = z.object({
  tenantId: recordId,
  reason: reason(10),
  // The database compares it with the tenant name; the dialog also gates on it.
  confirmation: z
    .string({ error: "confirmation_mismatch" })
    .trim()
    .min(1, { error: "confirmation_mismatch" }),
  idempotencyKey,
});
export type RequestTenantClosureInput = z.input<typeof requestTenantClosureSchema>;
