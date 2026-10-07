"use server";

import { parseActionInput } from "@wlbp/ui-foundation/actions";
import { runOperatorAction, type OperatorActionResult } from "../operator-action";
import { dottedKeyPattern } from "../schemas/settings";
import {
  assignSubscriptionSchema,
  clearEntitlementOverrideSchema,
  setEntitlementOverrideSchema,
  updateSubscriptionSchema,
  type AssignSubscriptionInput,
  type ClearEntitlementOverrideInput,
  type SetEntitlementOverrideInput,
  type UpdateSubscriptionInput,
} from "../schemas/subscriptions";

export async function assignSubscriptionAction(
  input: AssignSubscriptionInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(assignSubscriptionSchema, input);
  if (!parsed.ok) return parsed.result;
  const { tenantId, planKey, ring, reason } = parsed.data;
  return (
    await runOperatorAction({
      action: "subscription.assign",
      fn: "assign_subscription_v1",
      args: {
        p_tenant_id: tenantId,
        p_plan_key: planKey,
        p_rollout_ring: ring,
        p_reason: reason,
      },
      tenantId,
      targetKind: "subscription",
      targetId: tenantId,
    })
  ).result;
}

export async function updateSubscriptionAction(
  input: UpdateSubscriptionInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(updateSubscriptionSchema, input);
  if (!parsed.ok) return parsed.result;
  const { tenantId, state, endsAt, ring, reason, expectedUpdatedAt } = parsed.data;
  return (
    await runOperatorAction({
      action: "subscription.update",
      fn: "update_subscription_v1",
      args: {
        p_tenant_id: tenantId,
        p_state: state,
        p_ends_at: endsAt,
        p_rollout_ring: ring,
        p_reason: reason,
        p_expected_updated_at: expectedUpdatedAt,
      },
      tenantId,
      targetKind: "subscription",
      targetId: tenantId,
    })
  ).result;
}

export async function setEntitlementOverrideAction(
  input: SetEntitlementOverrideInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(setEntitlementOverrideSchema, input);
  if (!parsed.ok) return parsed.result;
  const { tenantId, featureKey, granted, expiresAt, reason } = parsed.data;
  return (
    await runOperatorAction({
      action: "entitlement.override",
      fn: "set_entitlement_override_v1",
      args: {
        p_tenant_id: tenantId,
        p_feature_key: featureKey,
        p_granted: granted,
        p_expires_at: expiresAt,
        p_reason: reason,
      },
      tenantId,
      targetKind: "entitlement",
      targetId: dottedKeyPattern.test(featureKey) ? featureKey : undefined,
    })
  ).result;
}

export async function clearEntitlementOverrideAction(
  input: ClearEntitlementOverrideInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(clearEntitlementOverrideSchema, input);
  if (!parsed.ok) return parsed.result;
  const { tenantId, featureKey, reason } = parsed.data;
  return (
    await runOperatorAction({
      action: "entitlement.clear_override",
      fn: "clear_entitlement_override_v1",
      args: { p_tenant_id: tenantId, p_feature_key: featureKey, p_reason: reason },
      tenantId,
      targetKind: "entitlement",
      targetId: featureKey,
    })
  ).result;
}
