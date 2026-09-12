import type { DashboardMessageKey } from "../../_lib/copy";

/** One place where a money outcome becomes a sentence. */
export const paymentResultKeys = {
  "backend-unavailable": "requestsResultUnavailable",
  "invalid-request": "requestsResultInvalid",
  "not-authorized": "requestsResultNotAuthorized",
  // Somebody else closed it first. Telling the second person is better than
  // letting them believe they did it.
  "already-resolved": "paymentsResultAlreadyResolved",
  "not-eligible": "paymentsResultNotEligible",
  refunded: "paymentsResultRefundRequested",
  resolved: "paymentsResultResolved",
} as const satisfies Record<string, DashboardMessageKey>;

export const positivePaymentResults: ReadonlySet<string> = new Set([
  "refunded",
  "resolved",
]);
