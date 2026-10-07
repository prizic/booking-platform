import type { Locale } from "@wlbp/i18n";
import { implementedWorkspaceSections } from "./workspace-navigation";

export function normalizeAuthReturnPath(locale: Locale, value: unknown): string {
  const fallback = `/${locale}/today`;
  if (
    typeof value !== "string" ||
    value.length > 500 ||
    /[\\%#]/u.test(value) ||
    [...value].some((c) => c.charCodeAt(0) <= 32)
  )
    return fallback;
  const match = /^\/(en|ar)\/([a-z-]+)(?:\/([A-Za-z0-9_-]+))?(\?[^#]*)?$/u.exec(value);
  if (
    !match ||
    !implementedWorkspaceSections.includes(
      match[2] as (typeof implementedWorkspaceSections)[number],
    )
  )
    return fallback;
  if (
    match[3] &&
    !["bookings", "customers", "services", "categories", "locations"].includes(
      match[2]!,
    )
  )
    return fallback;
  const path = `/${locale}/${match[2]}${match[3] ? `/${match[3]}` : ""}`;
  // Only supported filter keys; recovery and preview material never returns.
  const query = new URLSearchParams(match[4]);
  const allowed = new Set([
    "date",
    "view",
    "location",
    "staff",
    "service",
    "locationId",
    "staffId",
    "serviceId",
    "status",
    "from",
    "to",
    "timeZone",
  ]);
  for (const key of [...query.keys()]) if (!allowed.has(key)) query.delete(key);
  return `${path}${query.size ? `?${query}` : ""}`;
}
