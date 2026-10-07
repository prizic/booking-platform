import { canonicalizeTimeZone, type Locale } from "@wlbp/i18n";

/**
 * Date and time without the zone suffix, for views that state their time zone
 * once (with `formatTimeZone`) instead of after every time.
 */
export function formatWallDateTime(
  instant: Date | number | string,
  locale: Locale,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-u-nu-arab" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: canonicalizeTimeZone(timeZone),
  }).format(instant instanceof Date ? instant : new Date(instant));
}
