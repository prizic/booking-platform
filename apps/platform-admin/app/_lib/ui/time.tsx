import { formatDateTime, formatNumber, type Locale } from "@wlbp/i18n";
import { Badge } from "@wlbp/ui-foundation";
import { fill, say, stateCopy } from "../copy";
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

/** Always UTC and labelled; optionally flags data older than a threshold. */
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
    <span>
      <time dateTime={value}>{formatDateTime(value, locale, "UTC")}</time>{" "}
      <span className="secondary">{say(locale, stateCopy.utc)}</span>
      {stale ? (
        <>
          {" "}
          <Badge tone="warning">
            {fill(locale, stateCopy.staleSince, { age: ageLabel(locale, minutes) })}
          </Badge>
        </>
      ) : null}
    </span>
  );
}
