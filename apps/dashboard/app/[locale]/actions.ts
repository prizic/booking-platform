"use server";

import { parseTenantChoicesV1 } from "@wlbp/api-contracts";
import { normalizeHostname } from "@wlbp/tenant-resolution";
import { parseActionInput, type ActionResult } from "@wlbp/ui-foundation/actions";
import { redirect } from "next/navigation";

import { createDashboardRequestDataSource } from "../_lib/dashboard-server";
import { tenantSelectSchema, type TenantSelectInput } from "./tenant-select-schema";

/**
 * Opens the chosen workspace on its own hostname. The choice must be one of
 * the caller's current memberships, re-read here; anything else stays put.
 */
export async function selectTenant(input: TenantSelectInput): Promise<ActionResult> {
  const parsed = parseActionInput(tenantSelectSchema, input);
  if (!parsed.ok) return parsed.result;
  const { locale, tenantId } = parsed.data;

  const source = await createDashboardRequestDataSource();
  if (source === null || (await source.getVerifiedIdentity()) === null) {
    redirect(`/${locale}`);
  }

  const choices = parseTenantChoicesV1(await source.listTenantChoices());
  const selected = choices.find((choice) => choice.tenantId === tenantId);
  if (selected === undefined) redirect(`/${locale}`);

  const hostname = normalizeHostname(selected.dashboardHostname);
  redirect(`https://${hostname}/${locale}`);
}
