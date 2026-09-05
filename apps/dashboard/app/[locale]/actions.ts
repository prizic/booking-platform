"use server";

import { parseTenantChoicesV1 } from "@wlbp/api-contracts";
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
