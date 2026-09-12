import type { DashboardMessageKey } from "../../_lib/copy";

export const reportResultKeys = {
  "backend-unavailable": "requestsResultUnavailable",
  "invalid-request": "requestsResultInvalid",
  "not-authorized": "requestsResultNotAuthorized",
  exported: "reportsResultExported",
} as const satisfies Record<string, DashboardMessageKey>;

export const positiveReportResults: ReadonlySet<string> = new Set(["exported"]);
