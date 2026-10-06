"use server";

import { integer, text, uuid } from "../form-data";
import { runOperatorAction, type ActionResult } from "../operator-action";
import { missing } from "./guard";

export async function requestSupportAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const tenantId = uuid(form, "tenantId");
  const invalid = missing(tenantId);
  if (invalid) return invalid;
  return (
    await runOperatorAction({
      action: "support.request",
      fn: "request_support_grant_v1",
      args: {
        p_tenant_id: tenantId!,
        p_reason: text(form, "reason"),
        p_ticket_reference: text(form, "ticket"),
        p_minutes: integer(form, "minutes"),
      },
      tenantId,
      targetKind: "support_grant",
    })
  ).result;
}
export async function approveSupportAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const grantId = uuid(form, "grantId");
  const invalid = missing(grantId);
  if (invalid) return invalid;
  return (
    await runOperatorAction({
      action: "support.approve",
      fn: "approve_support_access_v1",
      args: { p_grant_id: grantId!, p_minutes: integer(form, "minutes") ?? 60 },
      tenantId: uuid(form, "tenantId"),
      targetKind: "support_grant",
      targetId: grantId,
    })
  ).result;
}

export async function revokeSupportAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const grantId = uuid(form, "grantId");
  const invalid = missing(grantId);
  if (invalid) return invalid;
  return (
    await runOperatorAction({
      action: "support.revoke",
      fn: "revoke_support_grant_v1",
      args: { p_grant_id: grantId!, p_reason: text(form, "reason") },
      tenantId: uuid(form, "tenantId"),
      targetKind: "support_grant",
      targetId: grantId,
    })
  ).result;
}
