"use server";

import { parseActionInput } from "@wlbp/ui-foundation/actions";
import { runOperatorAction, type OperatorActionResult } from "../operator-action";
import {
  addOperatorSchema,
  operatorStandingSchema,
  setOperatorRoleSchema,
  type AddOperatorInput,
  type OperatorStandingInput,
  type SetOperatorRoleInput,
} from "../schemas/operators";

export async function addOperatorAction(
  input: AddOperatorInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(addOperatorSchema, input);
  if (!parsed.ok) return parsed.result;
  const { email, role, expiresAt, reason } = parsed.data;
  return (
    await runOperatorAction({
      action: "operator.add",
      fn: "add_operator_v1",
      args: { p_email: email, p_role: role, p_expires_at: expiresAt, p_reason: reason },
      targetKind: "operator",
    })
  ).result;
}

export async function setOperatorRoleAction(
  input: SetOperatorRoleInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(setOperatorRoleSchema, input);
  if (!parsed.ok) return parsed.result;
  const { operatorId, role, expiresAt, reason } = parsed.data;
  return (
    await runOperatorAction({
      action: "operator.change_role",
      fn: "set_operator_role_v1",
      args: {
        p_operator_id: operatorId,
        p_role: role,
        p_expires_at: expiresAt,
        p_reason: reason,
      },
      targetKind: "operator",
      targetId: operatorId,
    })
  ).result;
}

export async function disableOperatorAction(
  input: OperatorStandingInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(operatorStandingSchema, input);
  if (!parsed.ok) return parsed.result;
  const { operatorId, reason } = parsed.data;
  return (
    await runOperatorAction({
      action: "operator.disable",
      fn: "disable_operator_v1",
      args: { p_operator_id: operatorId, p_reason: reason },
      targetKind: "operator",
      targetId: operatorId,
    })
  ).result;
}

export async function enableOperatorAction(
  input: OperatorStandingInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(operatorStandingSchema, input);
  if (!parsed.ok) return parsed.result;
  const { operatorId, reason } = parsed.data;
  return (
    await runOperatorAction({
      action: "operator.enable",
      fn: "enable_operator_v1",
      args: { p_operator_id: operatorId, p_reason: reason },
      targetKind: "operator",
      targetId: operatorId,
    })
  ).result;
}
