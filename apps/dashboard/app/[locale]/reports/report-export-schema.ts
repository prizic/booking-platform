import { z } from "zod";

import { localeField } from "../../_lib/form-schema";

/** The reports an operator can export. */
export const reportExportKeys = [
  "bookings",
  "customers",
  "revenue",
  "utilization",
] as const;

/**
 * Queue an export of the window the page is showing. The window, zone and
 * location come from the page's current filters; the database validates them
 * and computes the rows under the caller's own row level security.
 */
export const reportExportSchema = z.object({
  locale: localeField,
  reportKey: z.enum(reportExportKeys, { error: "invalid" }),
  from: z.string(),
  to: z.string(),
  timeZone: z.string(),
  /** "" for every permitted location; only a well-formed id is ever passed on. */
  locationId: z.string(),
});
export type ReportExportInput = z.input<typeof reportExportSchema>;
