import { z } from "zod";
import { optionalInstant, reason, recordId, requiredText } from "./fields";
import { rolloutRings } from "./releases";

export const subscriptionStates = [
  "trialing",
  "active",
  "past_due",
  "cancelled",
] as const;
const ring = z.enum(rolloutRings, { error: "required" });

export const assignSubscriptionSchema = z.object({
  tenantId: recordId,
  planKey: requiredText(),
  ring,
  reason: reason(5),
});
export type AssignSubscriptionInput = z.input<typeof assignSubscriptionSchema>;

export const updateSubscriptionSchema = z.object({
  tenantId: recordId,
  state: z.enum(subscriptionStates, { error: "required" }),
  endsAt: optionalInstant,
  ring,
  reason: reason(5),
  expectedUpdatedAt: z.string({ error: "stale_revision" }),
});
export type UpdateSubscriptionInput = z.input<typeof updateSubscriptionSchema>;

export const setEntitlementOverrideSchema = z.object({
  tenantId: recordId,
  featureKey: requiredText(61).transform((value) => value.toLowerCase()),
  granted: z
    .enum(["yes", "no"], { error: "required" })
    .transform((value) => value === "yes"),
  expiresAt: optionalInstant,
  reason: reason(5),
});
export type SetEntitlementOverrideInput = z.input<typeof setEntitlementOverrideSchema>;

export const clearEntitlementOverrideSchema = z.object({
  tenantId: recordId,
  featureKey: requiredText(),
  reason: reason(5),
});
export type ClearEntitlementOverrideInput = z.input<
  typeof clearEntitlementOverrideSchema
>;
