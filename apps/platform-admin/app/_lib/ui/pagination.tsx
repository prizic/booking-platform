import { formatNumber, type Locale } from "@wlbp/i18n";
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
    <nav className="pagination" aria-label={say(locale, formCopy.pagination)}>
      <span>
        {fill(locale, formCopy.results, { total: formatNumber(total, locale) })} ·{" "}
        {fill(locale, formCopy.pageOf, {
          page: formatNumber(Math.min(page, pages), locale),
          pages: formatNumber(pages, locale),
        })}
      </span>
      <div>
        {page > 1 ? (
          <Link rel="prev" href={href(page - 1)}>
            {say(locale, formCopy.previous)}
          </Link>
        ) : null}
        {page < pages ? (
          <Link rel="next" href={href(page + 1)}>
            {say(locale, formCopy.next)}
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
