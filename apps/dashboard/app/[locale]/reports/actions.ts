"use server";

import {
  actionError,
  parseActionInput,
  type ActionResult,
} from "@wlbp/ui-foundation/actions";
import { redirect } from "next/navigation";

import type { ReportKey } from "../../_lib/dashboard-access";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { decisionOutcomeFor } from "../../_lib/request-decisions";
import { reportExportSchema, type ReportExportInput } from "./report-export-schema";

/**
 * Queues an export and sends the operator to it. The rows are computed under
 * the caller's own row level security, so a location-limited member exports
 * their locations and nobody else's. A refusal returns its outcome code to the
 * form instead of leaving the page.
 */
export async function runReportExportAction(
  input: ReportExportInput,
): Promise<ActionResult> {
  const parsed = parseActionInput(reportExportSchema, input);
  if (!parsed.ok) return parsed.result;
  const { from, locale, timeZone, to } = parsed.data;
  const reportKey: ReportKey = parsed.data.reportKey;
  const base = `/${locale}/reports`;

  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.runReportExport === undefined
  ) {
    return actionError("not-authorized");
  }

  const query = `from=${from}&to=${to}&tz=${encodeURIComponent(timeZone)}`;
  let exportId: string;
  try {
    exportId = await request.source.runReportExport({
      from,
      locationId: /^[a-f0-9-]{36}$/iu.test(parsed.data.locationId)
        ? parsed.data.locationId
        : null,
      reportKey,
      tenantId: request.state.context.tenantId,
      timeZone,
      to,
    });
  } catch (error) {
    return actionError(decisionOutcomeFor(error));
  }
  // The redirect stays outside the try: it signals by throwing.
  redirect(`${base}?${query}&export=${exportId}&result=exported`);
}
