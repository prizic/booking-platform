"use server";

import { parseActionInput } from "@wlbp/ui-foundation/actions";
import { runOperatorAction, type OperatorActionResult } from "../operator-action";
import {
  approveSupportSchema,
  requestSupportSchema,
  revokeSupportSchema,
  type ApproveSupportInput,
  type RequestSupportInput,
  type RevokeSupportInput,
} from "../schemas/support";

export async function requestSupportAction(
  input: RequestSupportInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(requestSupportSchema, input);
  if (!parsed.ok) return parsed.result;
  const { tenantId, reason, ticket, minutes } = parsed.data;
  return (
    await runOperatorAction({
      action: "support.request",
      fn: "request_support_grant_v1",
      args: {
        p_tenant_id: tenantId,
        p_reason: reason,
        p_ticket_reference: ticket,
        p_minutes: minutes,
      },
      tenantId,
      targetKind: "support_grant",
    })
  ).result;
}

/**
 * Grant actions take only the grant id. A failure row names the grant as its
 * target; no browser-supplied tenant is attributed to it.
 */
export async function approveSupportAction(
  input: ApproveSupportInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(approveSupportSchema, input);
  if (!parsed.ok) return parsed.result;
  const { grantId, minutes } = parsed.data;
  return (
    await runOperatorAction({
      action: "support.approve",
      fn: "approve_support_access_v1",
      args: { p_grant_id: grantId, p_minutes: minutes },
      targetKind: "support_grant",
      targetId: grantId,
    })
  ).result;
}

export async function revokeSupportAction(
  input: RevokeSupportInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(revokeSupportSchema, input);
  if (!parsed.ok) return parsed.result;
  const { grantId, reason } = parsed.data;
  return (
    await runOperatorAction({
      action: "support.revoke",
      fn: "revoke_support_grant_v1",
      args: { p_grant_id: grantId, p_reason: reason },
      targetKind: "support_grant",
      targetId: grantId,
    })
  ).result;
}
