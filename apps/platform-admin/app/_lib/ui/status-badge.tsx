import type { Locale } from "@wlbp/i18n";
import { Badge, StatusStamp, type StampState } from "@wlbp/ui-foundation";
import { copyFor, roleCopy, statusCopy, statusTone } from "../copy";

/** Ended records stay visible, struck through; they are never hidden. */
const ended = new Set(["cancelled", "revoked", "withdrawn"]);
/** Work that waits on someone: woven, like a booking request. */
const requested = new Set([
  "requested",
  "queued",
  "enqueued",
  "pending",
  "awaiting_approval",
  "rollback_queued",
  "domain_pending",
]);
/** Nothing observed yet: dashed, never mistaken for healthy. */
const unobserved = new Set([
  "unknown",
  "never",
  "not_configured",
  "configured",
  "waiting",
]);
/** In motion right now. */
const moving = new Set(["running", "provisioning", "claimed"]);

function stampFor(status: string): StampState | null {
  if (ended.has(status)) return "cancelled";
  if (requested.has(status)) return "requested";
  if (unobserved.has(status)) return "pending";
  if (moving.has(status)) return "active";
  switch (statusTone(status)) {
    case "positive":
      return "confirmed";
    case "danger":
      return "failed";
    case "neutral":
      return "neutral";
    default:
      return null;
  }
}

/** A record's state, always in words as well as colour. */
export function StatusBadge({
  locale,
  status,
}: {
  locale: Locale;
  status: string | null | undefined;
}) {
  const key = status ?? "unknown";
  const label = copyFor(statusCopy, key, locale);
  const stamp = stampFor(key);
  return stamp ? (
    <StatusStamp state={stamp}>{label}</StatusStamp>
  ) : (
    <Badge tone="warning">{label}</Badge>
  );
}

export function RoleBadge({ locale, role }: { locale: Locale; role: string }) {
  return (
    <Badge
      tone={
        role === "break_glass" ? "danger" : role === "admin" ? "warning" : "neutral"
      }
    >
      {copyFor(roleCopy, role, locale)}
    </Badge>
  );
}
