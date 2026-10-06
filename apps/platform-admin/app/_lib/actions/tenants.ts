"use server";

import { localeOf, text, uuid } from "../form-data";
import { runOperatorAction, type ActionResult } from "../operator-action";
import { missing } from "./guard";

export async function createTenantAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const locale = localeOf(form);
  const { result, data } = await runOperatorAction({
    action: "tenant.create",
    fn: "create_tenant_v2",
    args: {
      p_name: text(form, "name"),
      p_brand_key: text(form, "brandKey").toLowerCase(),
      p_idempotency_key: text(form, "idempotencyKey"),
    },
    targetKind: "tenant",
  });
  const tenantId = data?.[0]?.tenant_id;
  if (result.kind !== "success" || !tenantId) return result;
  return { ...result, href: `/${locale}/tenants/${tenantId}` };
}

export async function renameTenantAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const tenantId = uuid(form, "tenantId");
  const invalid = missing(tenantId);
  if (invalid) return invalid;
  return (
    await runOperatorAction({
      action: "tenant.rename",
      fn: "update_tenant_v1",
      args: {
        p_tenant_id: tenantId!,
        p_name: text(form, "name"),
        p_expected_updated_at: text(form, "expectedUpdatedAt"),
      },
      tenantId,
      targetKind: "tenant",
      targetId: tenantId,
    })
  ).result;
}

export async function setTenantStatusAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const tenantId = uuid(form, "tenantId");
  const invalid = missing(tenantId);
  if (invalid) return invalid;
  const status = text(form, "status");
  return (
    await runOperatorAction({
      action: status === "suspended" ? "tenant.suspend" : "tenant.reactivate",
      fn: "set_tenant_status_v1",
      args: {
        p_tenant_id: tenantId!,
        p_status: status,
        p_reason: text(form, "reason"),
        p_expected_status: text(form, "expectedStatus"),
      },
      tenantId,
      targetKind: "tenant",
      targetId: tenantId,
    })
  ).result;
}

export async function requestTenantClosureAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const tenantId = uuid(form, "tenantId");
  const invalid = missing(tenantId);
  if (invalid) return invalid;
  return (
    await runOperatorAction({
      action: "tenant.request_closure",
      fn: "request_tenant_closure_v1",
      args: {
        p_tenant_id: tenantId!,
        p_reason: text(form, "reason"),
        p_confirmation: text(form, "confirmation"),
        p_idempotency_key: text(form, "idempotencyKey"),
      },
      tenantId,
      targetKind: "tenant",
      targetId: tenantId,
    })
  ).result;
}
