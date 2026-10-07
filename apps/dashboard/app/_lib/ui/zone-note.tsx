import type { Locale } from "@wlbp/i18n";
import { workspaceMessage } from "../workspace-copy";

/** States a view's time zone once, for the page header meta. */
export function ZoneNote({
  locale,
  timeZone,
}: {
  readonly locale: Locale;
  readonly timeZone: string;
}) {
  return (
    <p className="text-sm text-muted-foreground">
      {workspaceMessage(locale, "timesShownIn")}: <bdi>{timeZone}</bdi>
    </p>
  );
}
