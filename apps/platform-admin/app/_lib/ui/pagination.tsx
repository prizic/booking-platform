import { formatNumber, type Locale } from "@wlbp/i18n";
import { Button, PaginationBar } from "@wlbp/ui-foundation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { fill, formCopy, say } from "../copy";

export function Pagination({
  locale,
  page,
  pageSize,
  total,
  href,
}: {
  locale: Locale;
  page: number;
  pageSize: number;
  total: number;
  href: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <PaginationBar
      label={say(locale, formCopy.pagination)}
      summary={`${fill(locale, formCopy.results, { total: formatNumber(total, locale) })} · ${fill(
        locale,
        formCopy.pageOf,
        {
          page: formatNumber(Math.min(page, pages), locale),
          pages: formatNumber(pages, locale),
        },
      )}`}
      previous={
        page > 1 ? (
          <Button asChild variant="outline">
            <Link rel="prev" href={href(page - 1)}>
              <ChevronLeft aria-hidden="true" />
              {say(locale, formCopy.previous)}
            </Link>
          </Button>
        ) : null
      }
      next={
        page < pages ? (
          <Button asChild variant="outline">
            <Link rel="next" href={href(page + 1)}>
              {say(locale, formCopy.next)}
              <ChevronRight aria-hidden="true" />
            </Link>
          </Button>
        ) : null
      }
    />
  );
}
