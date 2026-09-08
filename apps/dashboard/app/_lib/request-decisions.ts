import { resolveZonedLocalDateTime, type Locale } from "@wlbp/i18n";

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

export function decisionResultUrl(
  locale: Locale,
  outcome: DecisionOutcome,
  token?: string,
): string {
  const query = new URLSearchParams({ result: outcome });
  // The customer link is returned once and never stored, so it travels back to
  // the deciding member in the redirect that renders it.
  if (token !== undefined) query.set("link", token);
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

/**
 * The Dashboard picker submits local civil time. The instant it means is
 * resolved against the location's own timezone, never the reader's browser.
 * A nonexistent spring-forward time has no instant and is refused; a duplicated
 * fall-back time resolves to the earlier of the two, which is the one the
 * customer sees first.
 */
export function resolveProposedInstant(
  localDateTime: string | null,
  timeZone: string,
): string | null {
  const match =
    localDateTime === null
      ? null
      : /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u.exec(localDateTime);
  if (match === null) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  try {
    const resolution = resolveZonedLocalDateTime(
      { day, hour, minute, month, year },
      timeZone,
    );
    return resolution.kind === "gap" ? null : (resolution.instants[0] ?? null);
  } catch {
    return null;
  }
}
