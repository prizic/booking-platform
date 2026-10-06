"use server";

import { parseTenantChoicesV1 } from "@wlbp/api-contracts";
import { normalizeHostname } from "@wlbp/tenant-resolution";
import { redirect } from "next/navigation";

import { revalidatePath } from "next/cache";
import { loadDashboardRequestAccess } from "../_lib/dashboard-server";
import { DashboardRpcError } from "../_lib/dashboard-data-source";
import {
  schedulePayload,
  ScheduleFieldError,
  scheduleUuid,
} from "./availability/schedule-fields";
import type { ScheduleMessage } from "./availability/schedule-copy";
import { createDashboardRequestDataSource } from "../_lib/dashboard-server";

export async function selectTenant(formData: FormData): Promise<never> {
  const rawTenantId = formData.get("tenantId");
  const rawLocale = formData.get("locale");
  const locale = rawLocale === "ar" ? "ar" : "en";
  if (typeof rawTenantId !== "string" || rawTenantId.trim() === "") {
    redirect(`/${locale}`);
  }

  const source = await createDashboardRequestDataSource();
  if (source === null || (await source.getVerifiedIdentity()) === null) {
    redirect(`/${locale}`);
  }

  const choices = parseTenantChoicesV1(await source.listTenantChoices());
  const selected = choices.find((choice) => choice.tenantId === rawTenantId);
  if (selected === undefined) redirect(`/${locale}`);

  const hostname = normalizeHostname(selected.dashboardHostname);
  redirect(`https://${hostname}/${locale}`);
}

export async function saveSchedule(formData: FormData): Promise<never> {
  const result = await saveScheduleAction({}, formData);
  const locale = formData.get("locale") === "ar" ? "ar" : "en";
  redirect(
    `/${locale}/availability?${result.saved ? "saved=1" : `error=${result.message ?? "unavailable"}`}`,
  );
}
export interface ScheduleResult {
  readonly nextRequestId?: string;
  readonly saved?: boolean;
  readonly message?: ScheduleMessage;
  readonly field?: string;
}
export async function saveScheduleAction(
  _state: ScheduleResult,
  form: FormData,
): Promise<ScheduleResult> {
  const locale = form.get("locale") === "ar" ? "ar" : "en";
  const request = await loadDashboardRequestAccess(locale);
  if (request.state.kind !== "ready" || !request.source?.saveScheduleConfig)
    return { message: "denied" };
  try {
    const input = schedulePayload(form);
    await request.source.saveScheduleConfig({
      ...input,
      tenantId: request.state.context.tenantId,
    });
    for (const path of ["availability", "calendar", "today"])
      revalidatePath(`/${locale}/${path}`);
    return { saved: true, nextRequestId: crypto.randomUUID(), message: "saved" };
  } catch (error) {
    return scheduleError(error);
  }
}
export async function removeScheduleAction(
  _state: ScheduleResult,
  form: FormData,
): Promise<ScheduleResult> {
  const locale = form.get("locale") === "ar" ? "ar" : "en";
  const request = await loadDashboardRequestAccess(locale);
  if (request.state.kind !== "ready" || !request.source?.removeScheduleRecord)
    return { message: "denied" };
  const id = form.get("id"),
    requestId = form.get("requestId"),
    kind = form.get("operation");
  const expected = Number(form.get("expectedRevision"));
  const parent = form.get("expectedScopeRevision");
  if (
    form.get("confirm") !== "yes" ||
    !scheduleUuid(id) ||
    !scheduleUuid(requestId) ||
    typeof kind !== "string" ||
    !Number.isSafeInteger(expected) ||
    expected < 1 ||
    (parent && (!Number.isSafeInteger(Number(parent)) || Number(parent) < 1))
  )
    return { message: "invalid" };
  try {
    await request.source.removeScheduleRecord({
      tenantId: request.state.context.tenantId,
      kind,
      targetId: id,
      requestId,
      expectedRevision: expected,
      expectedScopeRevision: parent ? Number(parent) : null,
    });
    revalidatePath(`/${locale}/availability`);
    revalidatePath(`/${locale}/calendar`);
    return { saved: true, nextRequestId: crypto.randomUUID(), message: "removed" };
  } catch (error) {
    return scheduleError(error);
  }
}
function scheduleError(error: unknown): ScheduleResult {
  if (error instanceof ScheduleFieldError)
    return {
      message: error.code === "fold" ? "foldError" : error.code,
      field: error.field,
    };
  const code = error instanceof DashboardRpcError ? error.stableMessage : "";
  return {
    message:
      code === "schedule_revision_conflict" || code === "revision_conflict"
        ? "stale"
        : code === "schedule_not_authorized" ||
            code === "schedule_authorization_required" ||
            code === "policy_authorization_required"
          ? "denied"
          : code === "schedule_scope_not_empty"
            ? "scopeNotEmpty"
            : code === "schedule_break_outside_hours"
              ? "breakOutside"
              : code?.startsWith("schedule_")
                ? "invalid"
                : "unavailable",
  };
}
