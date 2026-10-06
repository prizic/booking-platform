"use server";

import { instant, text, uuid } from "../form-data";
import { runOperatorAction, type ActionResult } from "../operator-action";
import { missing } from "./guard";

export async function assignSubscriptionAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const tenantId = uuid(form, "tenantId");
  const invalid = missing(tenantId);
  if (invalid) return invalid;
  return (
    await runOperatorAction({
      action: "subscription.assign",
      fn: "assign_subscription_v1",
      args: {
        p_tenant_id: tenantId!,
        p_plan_key: text(form, "planKey"),
        p_rollout_ring: text(form, "ring"),
        p_reason: text(form, "reason"),
      },
      tenantId,
      targetKind: "subscription",
      targetId: tenantId,
    })
  ).result;
}

export async function updateSubscriptionAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const tenantId = uuid(form, "tenantId");
  const invalid = missing(tenantId);
  if (invalid) return invalid;
  return (
    await runOperatorAction({
      action: "subscription.update",
      fn: "update_subscription_v1",
      args: {
        p_tenant_id: tenantId!,
        p_state: text(form, "state"),
        p_ends_at: instant(form, "endsAt") ?? null,
        p_rollout_ring: text(form, "ring"),
        p_reason: text(form, "reason"),
        p_expected_updated_at: text(form, "expectedUpdatedAt"),
      },
      tenantId,
      targetKind: "subscription",
      targetId: tenantId,
    })
  ).result;
}

export async function setEntitlementOverrideAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const tenantId = uuid(form, "tenantId");
  const invalid = missing(tenantId);
  if (invalid) return invalid;
  const featureKey = text(form, "featureKey").toLowerCase();
  return (
    await runOperatorAction({
      action: "entitlement.override",
      fn: "set_entitlement_override_v1",
      args: {
        p_tenant_id: tenantId!,
        p_feature_key: featureKey,
        p_granted: text(form, "granted") === "yes",
        p_expires_at: instant(form, "expiresAt") ?? null,
        p_reason: text(form, "reason"),
      },
      tenantId,
      targetKind: "entitlement",
      targetId: /^[a-z][a-z0-9_.]{1,60}$/u.test(featureKey) ? featureKey : undefined,
    })
  ).result;
}

export async function clearEntitlementOverrideAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const tenantId = uuid(form, "tenantId");
  const invalid = missing(tenantId);
  if (invalid) return invalid;
  const featureKey = text(form, "featureKey");
  return (
    await runOperatorAction({
      action: "entitlement.clear_override",
      fn: "clear_entitlement_override_v1",
      args: {
        p_tenant_id: tenantId!,
        p_feature_key: featureKey,
        p_reason: text(form, "reason"),
      },
      tenantId,
      targetKind: "entitlement",
      targetId: featureKey,
    })
  ).result;
}
