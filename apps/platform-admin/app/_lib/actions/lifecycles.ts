"use server";
import { parseActionInput } from "@wlbp/ui-foundation/actions";
import { callOperator } from "../operator-api";
import {
  operatorOk,
  runOperatorAction,
  type OperatorActionResult,
} from "../operator-action";
import {
  updateInstanceConfigurationSchema,
  deactivateInstanceSchema,
  requestInstanceClosureSchema,
  requestDomainRetirementSchema,
  decideReviewSchema,
  type UpdateInstanceConfigurationInput,
  type DeactivateInstanceInput,
  type RequestInstanceClosureInput,
  type RequestDomainRetirementInput,
  type DecideReviewInput,
} from "../schemas/lifecycles";
async function instanceTenant(instanceId: string) {
  const outcome = await callOperator("get_instance_configuration_v1", {
    p_instance_id: instanceId,
  });
  return outcome.ok ? outcome.data.tenant_id : undefined;
}
export async function updateInstanceConfigurationAction(
  input: UpdateInstanceConfigurationInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(updateInstanceConfigurationSchema, input);
  if (!parsed.ok) return parsed.result;
  const d = parsed.data;
  return (
    await runOperatorAction({
      action: "instance.configuration.update",
      fn: "update_instance_configuration_v1",
      args: {
        p_instance_id: d.instanceId,
        p_display_name: d.displayName ?? null,
        p_expected_revision: d.expectedRevision,
        p_reason: d.reason,
        p_idempotency_key: d.idempotencyKey,
      },
      tenantOf: () => instanceTenant(d.instanceId),
      targetKind: "instance",
      targetId: d.instanceId,
    })
  ).result;
}
export async function deactivateInstanceAction(
  input: DeactivateInstanceInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(deactivateInstanceSchema, input);
  if (!parsed.ok) return parsed.result;
  const d = parsed.data;
  return (
    await runOperatorAction({
      action: "instance.deactivate",
      fn: "deactivate_instance_by_id_v1",
      args: {
        p_instance_id: d.instanceId,
        p_expected_state: d.expectedState,
        p_reason: d.reason,
        p_idempotency_key: d.idempotencyKey,
      },
      tenantOf: () => instanceTenant(d.instanceId),
      targetKind: "instance",
      targetId: d.instanceId,
    })
  ).result;
}
export async function requestInstanceClosureAction(
  input: RequestInstanceClosureInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(requestInstanceClosureSchema, input);
  if (!parsed.ok) return parsed.result;
  const d = parsed.data;
  return (
    await runOperatorAction({
      action: "instance.closure.request",
      fn: "request_instance_closure_v1",
      args: {
        p_instance_id: d.instanceId,
        p_confirmation: d.confirmation,
        p_reason: d.reason,
        p_idempotency_key: d.idempotencyKey,
      },
      tenantOf: () => instanceTenant(d.instanceId),
      targetKind: "instance",
      targetId: d.instanceId,
    })
  ).result;
}
export async function requestDomainRetirementAction(
  input: RequestDomainRetirementInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(requestDomainRetirementSchema, input);
  if (!parsed.ok) return parsed.result;
  const d = parsed.data;
  return (
    await runOperatorAction({
      action: "domain.retirement.request",
      fn: "request_domain_retirement_v1",
      args: {
        p_domain_id: d.domainId,
        p_replacement_domain_id: d.replacementDomainId,
        p_reason: d.reason,
        p_idempotency_key: d.idempotencyKey,
      },
      targetKind: "domain",
      targetId: d.domainId,
    })
  ).result;
}
export async function decideReviewAction(
  input: DecideReviewInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(decideReviewSchema, input);
  if (!parsed.ok) return parsed.result;
  const d = parsed.data;
  const { result } = await runOperatorAction({
    action: `review.${d.decision}`,
    fn: "decide_operator_review_v1",
    args: {
      p_kind: d.kind,
      p_id: d.id,
      p_decision: d.decision,
      p_reason: d.reason,
      p_idempotency_key: d.idempotencyKey,
    },
    targetKind: "operator_review",
    targetId: d.id,
  });
  return result.ok ? operatorOk() : result;
}
