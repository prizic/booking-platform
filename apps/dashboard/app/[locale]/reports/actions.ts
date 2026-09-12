"use server";

import type { Locale } from "@wlbp/i18n";
import { redirect } from "next/navigation";

import type { ReportKey } from "../../_lib/dashboard-access";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { decisionOutcomeFor } from "../../_lib/request-decisions";

const reportKeys: readonly ReportKey[] = [
  "bookings",
  "customers",
  "revenue",
  "utilization",
];

/**
 * Queues an export and sends the operator to it. The rows are computed under
 * the caller's own row level security, so a location-limited member exports
 * their locations and nobody else's.
 */
export async function runReportExportAction(formData: FormData): Promise<never> {
  const locale: Locale = formData.get("locale") === "ar" ? "ar" : "en";
  const reportKey = formData.get("reportKey");
  const from = formData.get("from");
  const to = formData.get("to");
  const timeZone = formData.get("timeZone");
  const base = `/${locale}/reports`;
  if (
    !reportKeys.includes(reportKey as ReportKey) ||
    typeof from !== "string" ||
    typeof to !== "string" ||
    typeof timeZone !== "string"
  ) {
    redirect(`${base}?result=invalid-request`);
  }

  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.runReportExport === undefined
  ) {
    redirect(`${base}?result=not-authorized`);
  }

  const query = `from=${from}&to=${to}&tz=${encodeURIComponent(timeZone)}`;
  try {
    const exportId = await request.source.runReportExport({
      from,
      locationId: null,
      reportKey: reportKey as ReportKey,
      tenantId: request.state.context.tenantId,
      timeZone,
      to,
    });
    redirect(`${base}?${query}&export=${exportId}&result=exported`);
  } catch (error) {
    // `redirect` throws by design, so a redirect must not be mistaken for a
    // failed export.
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    redirect(`${base}?${query}&result=${decisionOutcomeFor(error)}`);
  }
}
