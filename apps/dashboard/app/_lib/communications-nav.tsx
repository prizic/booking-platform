import Link from "next/link";
import type { Locale } from "@wlbp/i18n";
import { cn } from "@wlbp/ui-foundation";
import { notificationText } from "./notification-copy";

export type CommunicationsView = "messages" | "settings" | "preferences";

/**
 * The Communications area's own sections as links (each is a page with its
 * own URL, so the email footer can link straight to preferences).
 */
export function CommunicationsNav({
  locale,
  current,
  showSettings,
}: {
  readonly locale: Locale;
  readonly current: CommunicationsView;
  readonly showSettings: boolean;
}) {
  const items: (readonly [CommunicationsView, string, string])[] = [
    [
      "messages",
      `/${locale}/communications`,
      notificationText(locale, "commsNavMessages"),
    ],
  ];
  if (showSettings)
    items.push([
      "settings",
      `/${locale}/communications/settings`,
      notificationText(locale, "commsNavSettings"),
    ]);
  items.push([
    "preferences",
    `/${locale}/communications/preferences`,
    notificationText(locale, "commsNavPreferences"),
  ]);
  return (
    <nav aria-label={notificationText(locale, "commsNavLabel")}>
      <ul className="inline-flex w-fit max-w-full flex-wrap items-center gap-1 rounded-lg bg-neutral-2 p-1">
        {items.map(([view, href, label]) => (
          <li key={view}>
            <Link
              href={href}
              aria-current={view === current ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40",
                view === current && "bg-card text-foreground shadow-sm",
              )}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
