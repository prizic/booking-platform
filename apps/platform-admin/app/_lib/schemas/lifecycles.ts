import { z } from "zod";
import { idempotencyKey, optionalText, reason, recordId } from "./fields";
export const updateInstanceConfigurationSchema = z.object({
  instanceId: recordId,
  displayName: optionalText(160),
  expectedRevision: z
    .number({ error: "stale_revision" })
    .int({ error: "stale_revision" })
    .nonnegative({ error: "stale_revision" }),
  reason: reason(10),
  idempotencyKey,
});
export const deactivateInstanceSchema = z.object({
  instanceId: recordId,
  expectedState: z.enum(["active", "provisioning"], {
    error: "transition_not_allowed",
  }),
  reason: reason(10),
  idempotencyKey,
});
export const requestInstanceClosureSchema = z
  .object({
    instanceId: recordId,
    confirmation: recordId,
    reason: reason(10),
    idempotencyKey,
  })
  .refine((input) => input.confirmation === input.instanceId, {
    path: ["confirmation"],
    error: "confirmation_mismatch",
  });
export const requestDomainRetirementSchema = z.object({
  domainId: recordId,
  replacementDomainId: z
    .union([z.literal("none"), z.literal(""), recordId])
    .optional()
    .transform((value) => (value && value !== "none" ? value : null)),
  reason: reason(10),
  idempotencyKey,
});
export const decideReviewSchema = z.object({
  kind: z.enum(["job", "support"], { error: "settings_invalid" }),
  id: recordId,
  decision: z.enum(["approve", "reject"], { error: "settings_invalid" }),
  reason: reason(10),
  idempotencyKey,
});
export type UpdateInstanceConfigurationInput = z.input<
  typeof updateInstanceConfigurationSchema
>;
export type DeactivateInstanceInput = z.input<typeof deactivateInstanceSchema>;
export type RequestInstanceClosureInput = z.input<typeof requestInstanceClosureSchema>;
export type RequestDomainRetirementInput = z.input<
  typeof requestDomainRetirementSchema
>;
export type DecideReviewInput = z.input<typeof decideReviewSchema>;
