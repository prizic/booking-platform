"use server";

import { text, uuid } from "../form-data";
import { runOperatorAction, type ActionResult } from "../operator-action";
import { missing } from "./guard";

export async function addDomainAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const tenantId = uuid(form, "tenantId");
  const instanceId = uuid(form, "instanceId");
  const invalid = missing(tenantId, instanceId);
  if (invalid) return invalid;
  return (
    await runOperatorAction({
      action: "domain.add",
      fn: "add_tenant_domain_v1",
      args: {
        p_tenant_id: tenantId!,
        p_instance_id: instanceId!,
        p_hostname: text(form, "hostname").toLowerCase(),
        p_application: text(form, "application"),
        p_idempotency_key: text(form, "idempotencyKey"),
      },
      tenantId,
      targetKind: "domain",
    })
  ).result;
}

export async function requestDomainVerificationAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const domainId = uuid(form, "domainId");
  const invalid = missing(domainId);
  if (invalid) return invalid;
  return (
    await runOperatorAction({
      action: "domain.request_verification",
      fn: "request_domain_verification_v1",
      args: { p_domain_id: domainId! },
      tenantId: uuid(form, "tenantId"),
      targetKind: "domain",
      targetId: domainId,
    })
  ).result;
}
