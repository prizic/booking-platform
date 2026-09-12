import type { DashboardMessageKey } from "../../_lib/copy";

/**
 * One place where a privacy outcome becomes a sentence, for the same reason the
 * booking surfaces have one: a refusal that reads two ways depending on which
 * button produced it is a refusal an operator will retry wrongly.
 */
const shared = {
  "backend-unavailable": "requestsResultUnavailable",
  "invalid-request": "requestsResultInvalid",
  "not-authorized": "requestsResultNotAuthorized",
  "revision-conflict": "requestsResultConflict",
} as const satisfies Record<string, DashboardMessageKey>;

export const customerResultKeys = {
  ...shared,
  corrected: "customersResultCorrected",
  "deletion-blocked": "customersResultDeletionBlocked",
  deleted: "customersResultDeleted",
  exported: "customersResultExported",
  held: "customersResultHeld",
  released: "customersResultReleased",
  restricted: "customersResultRestricted",
  unrestricted: "customersResultUnrestricted",
} as const satisfies Record<string, DashboardMessageKey>;

/** Which outcomes report success. Everything else is reported as a warning. */
export const positiveCustomerResults: ReadonlySet<string> = new Set([
  "corrected",
  "deleted",
  "exported",
  "held",
  "released",
  "restricted",
  "unrestricted",
]);
