import type { StampState } from "@wlbp/ui-foundation";

/**
 * The stamp drawn beside a workspace status word (see workspaceStatus). The
 * word always carries the meaning; the stamp only reinforces it.
 */
export function workspaceStamp(status: string): StampState {
  switch (status) {
    case "delivered":
    case "succeeded":
    case "confirmed":
    case "active":
    case "published":
    case "reconciled":
    case "enabled":
      return "confirmed";
    case "queued":
    case "sending":
    case "pending":
    case "draft":
      return "pending";
    case "failed":
    case "bounced":
    case "dead_lettered":
    case "requires_action":
    case "restricted":
    case "disconnected":
      return "failed";
    case "complained":
    case "requirements_due":
    case "suspended":
    case "requested":
      return "requested";
    case "suppressed":
    case "cancelled":
    case "revoked":
      return "cancelled";
    case "completed":
    case "retired":
      return "completed";
    case "sent":
      // Accepted by the provider is not delivery.
      return "active";
    default:
      return "neutral";
  }
}
