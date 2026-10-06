"use server";

import { instant, text, uuid } from "../form-data";
import { runOperatorAction, type ActionResult } from "../operator-action";
import { missing } from "./guard";

export async function addOperatorAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return (
    await runOperatorAction({
      action: "operator.add",
      fn: "add_operator_v1",
      args: {
        p_email: text(form, "email"),
        p_role: text(form, "role"),
        p_expires_at: instant(form, "expiresAt") ?? null,
        p_reason: text(form, "reason"),
      },
      targetKind: "operator",
    })
  ).result;
}

export async function setOperatorRoleAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const operatorId = uuid(form, "operatorId");
  const invalid = missing(operatorId);
  if (invalid) return invalid;
  return (
    await runOperatorAction({
      action: "operator.change_role",
      fn: "set_operator_role_v1",
      args: {
        p_operator_id: operatorId!,
        p_role: text(form, "role"),
        p_expires_at: instant(form, "expiresAt") ?? null,
        p_reason: text(form, "reason"),
      },
      targetKind: "operator",
      targetId: operatorId,
    })
  ).result;
}

export async function disableOperatorAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const operatorId = uuid(form, "operatorId");
  const invalid = missing(operatorId);
  if (invalid) return invalid;
  return (
    await runOperatorAction({
      action: "operator.disable",
      fn: "disable_operator_v1",
      args: { p_operator_id: operatorId!, p_reason: text(form, "reason") },
      targetKind: "operator",
      targetId: operatorId,
    })
  ).result;
}

export async function enableOperatorAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const operatorId = uuid(form, "operatorId");
  const invalid = missing(operatorId);
  if (invalid) return invalid;
  return (
    await runOperatorAction({
      action: "operator.enable",
      fn: "enable_operator_v1",
      args: { p_operator_id: operatorId!, p_reason: text(form, "reason") },
      targetKind: "operator",
      targetId: operatorId,
    })
  ).result;
}
