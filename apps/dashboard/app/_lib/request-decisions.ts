import type { Locale } from "@wlbp/i18n";

import { DashboardRpcError } from "./dashboard-data-source";

export type DecisionOutcome =
  | "accepted"
  | "backend-unavailable"
  | "invalid-request"
  | "not-authorized"
  | "proposed"
  | "rejected"
  | "revision-conflict"
  | "slot-unavailable";

export function decisionResultUrl(locale: Locale, outcome: DecisionOutcome): string {
  const query = new URLSearchParams({ result: outcome });
  return `/${locale}/requests?${query.toString()}`;
}

/** Stable database errors map to one outcome each; nothing else is disclosed. */
export function decisionOutcomeFor(error: unknown): DecisionOutcome {
  const stable = error instanceof DashboardRpcError ? (error.stableMessage ?? "") : "";
  switch (stable) {
    case "revision_conflict":
      return "revision-conflict";
    case "slot_unavailable":
    case "capacity_exhausted":
    case "payment_pending":
      return "slot-unavailable";
    case "policy_denied":
    case "booking_context_required":
      return "not-authorized";
    default:
      return stable.startsWith("booking_invalid")
        ? "invalid-request"
        : "backend-unavailable";
  }
}

/** Browser-safe home of the civil-time rule, re-exported for existing callers. */
export { resolveProposedInstant } from "./proposed-instant";
