import type { DashboardMessageKey } from "../../_lib/copy";

/**
 * One place where a redirect result becomes a sentence. The list and the detail
 * share the outcomes they share, so the same refusal never reads two ways
 * depending on which surface the operator happened to act from.
 */
const shared = {
  "backend-unavailable": "requestsResultUnavailable",
  "invalid-request": "requestsResultInvalid",
  "not-authorized": "requestsResultNotAuthorized",
  "revision-conflict": "requestsResultConflict",
  "slot-unavailable": "requestsResultSlotUnavailable",
} as const satisfies Record<string, DashboardMessageKey>;

export const listResultKeys = {
  ...shared,
  moved: "bookingsResultMoved",
  rejected: "bookingsResultCancelled",
  "resend-unavailable": "bookingsResendUnavailable",
  resent: "bookingsResultResent",
} as const satisfies Record<string, DashboardMessageKey>;

export const detailResultKeys = {
  ...shared,
  // Only the detail acts on the lifecycle, so only the detail can be refused
  // by it.
  "not-allowed": "bookingsResultNotAllowed",
  "reason-required": "bookingsResultReasonRequired",
  "checked-in": "bookingsResultCheckedIn",
  completed: "bookingsResultCompleted",
  corrected: "bookingsResultCorrected",
  "no-show": "bookingsResultNoShow",
  "note-added": "bookingsResultNoteAdded",
} as const satisfies Record<string, DashboardMessageKey>;

/** Which outcomes report success. Everything else is reported as a warning. */
export const positiveResults: ReadonlySet<string> = new Set([
  "checked-in",
  "completed",
  "corrected",
  "moved",
  "no-show",
  "note-added",
  "rejected",
  "resent",
]);
