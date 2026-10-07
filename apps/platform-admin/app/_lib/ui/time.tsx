import { formatDateTime, formatNumber, formatTimeZone, type Locale } from "@wlbp/i18n";
import { Badge } from "@wlbp/ui-foundation";
import { fill, stateCopy } from "../copy";
import { Unknown } from "./states";

export function ageLabel(locale: Locale, minutes: number): string {
  if (minutes < 120)
    return fill(locale, stateCopy.minutes, { n: formatNumber(minutes, locale) });
  if (minutes < 2880)
    return fill(locale, stateCopy.hours, {
      n: formatNumber(Math.floor(minutes / 60), locale),
    });
  return fill(locale, stateCopy.days, {
    n: formatNumber(Math.floor(minutes / 1440), locale),
  });
}

/**
 * A UTC date and time without the zone suffix. Pages that show times state
 * the zone once in their header (PageHeader `timesInUtc`), not on every row.
 */
export function formatUtc(value: string, locale: Locale): string {
  const full = formatDateTime(value, locale, "UTC");
  const zone = formatTimeZone(value, locale, "UTC");
  return full.endsWith(zone) ? full.slice(0, -zone.length).trimEnd() : full;
}

/** Always UTC (stated once per page); optionally flags data older than a threshold. */
export function TimeValue({
  locale,
  value,
  staleAfterMinutes,
  empty = "never",
}: {
  locale: Locale;
  value: string | null | undefined;
  staleAfterMinutes?: number;
  empty?: "never" | "notObserved" | "notReported" | "none";
}) {
  if (!value) return <Unknown locale={locale} kind={empty} />;
  // eslint-disable-next-line react-hooks/purity -- Server-only timestamp formatting uses the current request time; no client clock is hydrated.
  const now = Date.now();
  const minutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60000));
  const stale = staleAfterMinutes !== undefined && minutes > staleAfterMinutes;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 [font-variant-numeric:tabular-nums]">
      <time dateTime={value} className="whitespace-nowrap">
        {formatUtc(value, locale)}
      </time>
      {stale ? (
        <Badge tone="warning">
          {fill(locale, stateCopy.staleSince, { age: ageLabel(locale, minutes) })}
        </Badge>
      ) : null}
    </span>
  );
}
