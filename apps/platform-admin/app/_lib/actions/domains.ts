"use server";

import { parseActionInput } from "@wlbp/ui-foundation/actions";
import { runOperatorAction, type OperatorActionResult } from "../operator-action";
import {
  addDomainSchema,
  requestDomainVerificationSchema,
  type AddDomainInput,
  type RequestDomainVerificationInput,
} from "../schemas/domains";

export async function addDomainAction(
  input: AddDomainInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(addDomainSchema, input);
  if (!parsed.ok) return parsed.result;
  const { tenantId, instanceId, hostname, application, idempotencyKey } = parsed.data;
  return (
    await runOperatorAction({
      action: "domain.add",
      fn: "add_tenant_domain_v1",
      args: {
        p_tenant_id: tenantId,
        p_instance_id: instanceId,
        p_hostname: hostname,
        p_application: application,
        p_idempotency_key: idempotencyKey,
      },
      tenantId,
      targetKind: "domain",
    })
  ).result;
}

/**
 * The domain id is the whole input. A failure row names the domain as its
 * target; no browser-supplied tenant is attributed to it.
 */
export async function requestDomainVerificationAction(
  input: RequestDomainVerificationInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(requestDomainVerificationSchema, input);
  if (!parsed.ok) return parsed.result;
  const { domainId } = parsed.data;
  return (
    await runOperatorAction({
      action: "domain.request_verification",
      fn: "request_domain_verification_v1",
      args: { p_domain_id: domainId },
      targetKind: "domain",
      targetId: domainId,
    })
  ).result;
}
