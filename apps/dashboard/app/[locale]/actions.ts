"use server";

import { parseScheduleWorkspaceV1, parseTenantChoicesV1 } from "@wlbp/api-contracts";
import { normalizeHostname } from "@wlbp/tenant-resolution";
import { redirect } from "next/navigation";

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
  const locale = formData.get("locale") === "ar" ? "ar" : "en";
  const tenantId = formData.get("tenantId");
  const operation = formData.get("operation");
  if (
    typeof tenantId !== "string" ||
    tenantId.trim() === "" ||
    typeof operation !== "string"
  ) {
    redirect(`/${locale}/availability?error=invalid_request`);
  }
  const source = await createDashboardRequestDataSource();
  if (
    source === null ||
    (await source.getVerifiedIdentity()) === null ||
    source.saveScheduleConfig === undefined
  ) {
    redirect(`/${locale}/availability?error=not_authorized`);
  }
  const scopeId = formData.get("scopeId");
  const workspace =
    source.getScheduleWorkspace === undefined
      ? []
      : parseScheduleWorkspaceV1(await source.getScheduleWorkspace(tenantId));
  const selectedScope =
    typeof scopeId === "string"
      ? workspace.find((row) => row.kind === "scope" && row.id === scopeId)
      : undefined;
  const payload: Record<string, unknown> = {
    scope_id: typeof scopeId === "string" ? scopeId : "",
    scope_kind: String(formData.get("scopeKind") ?? "location"),
    location_id: String(formData.get("locationId") ?? ""),
    staff_id: String(formData.get("staffId") ?? ""),
    resource_id: String(formData.get("resourceId") ?? ""),
    service_id: String(formData.get("serviceId") ?? ""),
    day_of_week: Number(formData.get("dayOfWeek")),
    start_minute: Number(formData.get("startMinute")),
    end_minute: Number(formData.get("endMinute")),
    time_zone: String(formData.get("timeZone") ?? "UTC"),
    local_date: String(formData.get("localDate") ?? ""),
    exception_kind: String(formData.get("exceptionKind") ?? "closed"),
    starts_at: String(formData.get("startsAt") ?? ""),
    ends_at: String(formData.get("endsAt") ?? ""),
    reason: String(formData.get("reason") ?? ""),
    name: String(formData.get("name") ?? ""),
    policy_key: String(formData.get("policyKey") ?? "minimum_notice_minutes"),
    value:
      formData.get("value") === null || formData.get("value") === ""
        ? null
        : Number(formData.get("value")),
  };
  const expected = formData.get("expectedRevision");
  try {
    await source.saveScheduleConfig({
      tenantId,
      operation,
      payload,
      expectedRevision:
        operation === "scope"
          ? null
          : (selectedScope?.revision ??
            (typeof expected === "string" && expected !== ""
              ? Number(expected)
              : null)),
    });
  } catch {
    redirect(`/${locale}/availability?error=save_failed`);
  }
  redirect(`/${locale}/availability?saved=1`);
}
