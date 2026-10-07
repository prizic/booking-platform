import type { Locale } from "@wlbp/i18n";
import { PageHeader as FoundationPageHeader } from "@wlbp/ui-foundation";
import { ChevronRight, Clock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { say, shellCopy, stateCopy } from "../copy";

/**
 * The page's one h1, with an optional breadcrumb trail above it. Pages that
 * list times pass `timesInUtc`, so the zone is stated once here, not per row.
 */
export function PageHeader({
  locale,
  title,
  description,
  breadcrumbs,
  actions,
  meta,
  timesInUtc,
}: {
  locale: Locale;
  title: string;
  description?: string;
  breadcrumbs?: readonly (readonly [label: string, href?: string])[];
  actions?: ReactNode;
  meta?: ReactNode;
  timesInUtc?: boolean;
}) {
  const zoneNote = timesInUtc ? (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <Clock aria-hidden="true" className="size-3.5 shrink-0" />
      {say(locale, stateCopy.timesInUtc)}
    </span>
  ) : null;
  const allMeta =
    meta && zoneNote ? (
      <>
        {meta}
        {zoneNote}
      </>
    ) : (
      (meta ?? zoneNote)
    );
  return (
    <div className="grid gap-3">
      {breadcrumbs?.length ? (
        <nav aria-label={say(locale, shellCopy.breadcrumbs)}>
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            {breadcrumbs.map(([label, href], index) => (
              <li key={label} className="flex min-w-0 items-center gap-1.5">
                {index > 0 ? (
                  <ChevronRight
                    aria-hidden="true"
                    className="size-3.5 shrink-0 rtl:-scale-x-100"
                  />
                ) : null}
                {href ? (
                  <Link
                    href={href}
                    className="rounded-sm font-medium underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    {label}
                  </Link>
                ) : (
                  <span aria-current="page" className="truncate text-foreground">
                    <bdi>{label}</bdi>
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <FoundationPageHeader
        title={<bdi>{title}</bdi>}
        {...(description ? { description } : {})}
        {...(actions ? { actions } : {})}
        {...(allMeta ? { meta: allMeta } : {})}
      />
    </div>
  );
}
