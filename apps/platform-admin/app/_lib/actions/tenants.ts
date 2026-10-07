"use server";

import { parseActionInput } from "@wlbp/ui-foundation/actions";
import {
  operatorOk,
  runOperatorAction,
  type OperatorActionResult,
} from "../operator-action";
import {
  createTenantSchema,
  renameTenantSchema,
  requestTenantClosureSchema,
  setTenantStatusSchema,
  type CreateTenantInput,
  type RenameTenantInput,
  type RequestTenantClosureInput,
  type SetTenantStatusInput,
} from "../schemas/tenants";

export async function createTenantAction(
  input: CreateTenantInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(createTenantSchema, input);
  if (!parsed.ok) return parsed.result;
  const { name, brandKey, idempotencyKey, locale } = parsed.data;
  const { result, data } = await runOperatorAction({
    action: "tenant.create",
    fn: "create_tenant_v2",
    args: { p_name: name, p_brand_key: brandKey, p_idempotency_key: idempotencyKey },
    targetKind: "tenant",
  });
  const tenantId = data?.[0]?.tenant_id;
  if (!result.ok || !tenantId) return result;
  return operatorOk({ href: `/${locale}/tenants/${tenantId}` });
}

export async function renameTenantAction(
  input: RenameTenantInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(renameTenantSchema, input);
  if (!parsed.ok) return parsed.result;
  const { tenantId, name, expectedUpdatedAt } = parsed.data;
  return (
    await runOperatorAction({
      action: "tenant.rename",
      fn: "update_tenant_v1",
      args: {
        p_tenant_id: tenantId,
        p_name: name,
        p_expected_updated_at: expectedUpdatedAt,
      },
      tenantId,
      targetKind: "tenant",
      targetId: tenantId,
    })
  ).result;
}

export async function setTenantStatusAction(
  input: SetTenantStatusInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(setTenantStatusSchema, input);
  if (!parsed.ok) return parsed.result;
  const { tenantId, status, reason, expectedStatus } = parsed.data;
  return (
    await runOperatorAction({
      action: status === "suspended" ? "tenant.suspend" : "tenant.reactivate",
      fn: "set_tenant_status_v1",
      args: {
        p_tenant_id: tenantId,
        p_status: status,
        p_reason: reason,
        p_expected_status: expectedStatus,
      },
      tenantId,
      targetKind: "tenant",
      targetId: tenantId,
    })
  ).result;
}

export async function requestTenantClosureAction(
  input: RequestTenantClosureInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(requestTenantClosureSchema, input);
  if (!parsed.ok) return parsed.result;
  const { tenantId, reason, confirmation, idempotencyKey } = parsed.data;
  return (
    await runOperatorAction({
      action: "tenant.request_closure",
      fn: "request_tenant_closure_v1",
      args: {
        p_tenant_id: tenantId,
        p_reason: reason,
        p_confirmation: confirmation,
        p_idempotency_key: idempotencyKey,
      },
      tenantId,
      targetKind: "tenant",
      targetId: tenantId,
    })
  ).result;
}
