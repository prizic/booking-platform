import { formatNumber, type Locale } from "@wlbp/i18n";
import { DataPagination } from "@wlbp/ui-foundation";
import { fill, formCopy, say } from "../copy";
import { renderOperatorLink } from "./navigation-link";
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
    <DataPagination
      label={say(locale, formCopy.pagination)}
      summary={fill(locale, formCopy.results, { total: formatNumber(total, locale) })}
      pageLabel={fill(locale, formCopy.pageOf, {
        page: formatNumber(page, locale),
        pages: formatNumber(pages, locale),
      })}
      page={page}
      pageCount={pages}
      previousLabel={say(locale, formCopy.previous)}
      nextLabel={say(locale, formCopy.next)}
      {...(page > 1 ? { previousHref: href(page - 1) } : {})}
      {...(page < pages ? { nextHref: href(page + 1) } : {})}
      renderLink={renderOperatorLink}
    />
  );
}
