import type { Locale } from "@wlbp/i18n";
import { cn } from "@wlbp/ui-foundation";
import { formatWhen, sameZone } from "../booking-display";

/**
 * A moment shown in its own zone. The view states its zone once, so the zone
 * is repeated here only when this line's zone differs from the view's.
 */
export function When({
  instant,
  locale,
  timeZone,
  viewTimeZone,
  className,
}: {
  readonly instant: string | Date;
  readonly locale: Locale;
  readonly timeZone: string;
  readonly viewTimeZone?: string;
  readonly className?: string;
}) {
  const iso = typeof instant === "string" ? instant : instant.toISOString();
  return (
    <span className={cn("[font-variant-numeric:tabular-nums]", className)}>
      <time dateTime={iso}>{formatWhen(instant, locale, timeZone)}</time>
      {viewTimeZone === undefined || sameZone(timeZone, viewTimeZone) ? null : (
        <>
          {" "}
          <bdi className="text-xs font-normal text-muted-foreground">{timeZone}</bdi>
        </>
      )}
    </span>
  );
}
