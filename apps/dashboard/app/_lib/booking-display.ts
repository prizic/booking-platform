import { canonicalizeTimeZone, type Locale } from "@wlbp/i18n";
import type { BandSegmentState, StampState } from "@wlbp/ui-foundation";

/** The Intl locale the shared formatters use, so digits match everywhere. */
export function intlLocale(locale: Locale): string {
  return locale === "ar" ? "ar-u-nu-arab" : "en";
}

/** Booking status → stamp. The word is always shown with it. */
export function stampStateFor(status: string): StampState {
  switch (status) {
    case "requested":
      return "requested";
    case "confirmed":
      return "confirmed";
    case "checked_in":
      return "active";
    case "completed":
      return "completed";
    case "cancelled":
    case "no_show":
    case "expired":
      return "cancelled";
    case "pending":
    case "queued":
    case "processing":
      return "pending";
    case "failed":
      return "failed";
    default:
      return "neutral";
  }
}

/** Booking status → woven band segment state. */
export function bandStateFor(status: string): BandSegmentState {
  switch (status) {
    case "requested":
      return "requested";
    case "completed":
      return "completed";
    case "cancelled":
    case "no_show":
    case "expired":
      return "cancelled";
    default:
      return "confirmed";
  }
}

/** "9:00 – 9:45 AM" in the given zone, without repeating the zone name. */
export function formatTimeRange(
  startAt: string,
  endAt: string,
  locale: Locale,
  timeZone: string,
): string {
  const formatter = new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "numeric",
    minute: "2-digit",
    timeZone: canonicalizeTimeZone(timeZone),
  });
  const start = new Date(startAt);
  const end = new Date(endAt);
  return end.getTime() > start.getTime()
    ? formatter.formatRange(start, end)
    : formatter.format(start);
}

/** A whole-hour axis label ("9 AM" / "٩ ص") for an instant. */
export function formatHour(instant: number, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "numeric",
    timeZone: canonicalizeTimeZone(timeZone),
  }).format(new Date(instant));
}

/** A plain integer in the locale's digits. */
export function formatCount(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}

/**
 * Date and time in the given zone without naming the zone. A view states its
 * zone once (ZoneNote); a line names its own zone only when it differs.
 */
export function formatWhen(
  instant: Date | number | string,
  locale: Locale,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: canonicalizeTimeZone(timeZone),
  }).format(new Date(instant));
}

/** True when two IANA names denote the same zone. */
export function sameZone(a: string, b: string): boolean {
  return canonicalizeTimeZone(a) === canonicalizeTimeZone(b);
}

/** The zone most lines of a view use, so it can be stated once. */
export function dominantZone(zones: readonly string[], fallback: string): string {
  const counts = new Map<string, number>();
  for (const zone of zones) counts.set(zone, (counts.get(zone) ?? 0) + 1);
  let best = fallback;
  let bestCount = 0;
  for (const [zone, count] of counts) {
    if (count > bestCount) {
      best = zone;
      bestCount = count;
    }
  }
  return best;
}
