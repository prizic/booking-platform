import Link from "next/link";
import { formatNumber, type Locale } from "@wlbp/i18n";
import { DataPagination } from "@wlbp/ui-foundation";
import { pageHref, type PageQuery } from "../data-page-query";
export function WorkspacePagination({
  locale,
  path,
  query,
  page,
  pageCount,
  count,
  pageKey = "page",
  unknownTotal = false,
}: {
  locale: Locale;
  path: string;
  query: PageQuery;
  page: number;
  pageCount: number;
  count: number;
  pageKey?: string;
  /**
   * Customers reads only know whether a next page exists (lookahead), never the
   * real total; show "Page N" instead of an invented one. `pageCount` then
   * drives only the next/previous boundaries.
   */
  unknownTotal?: boolean;
}) {
  const n = (value: number) => formatNumber(value, locale);
  const pageLabel = unknownTotal
    ? locale === "ar"
      ? `الصفحة ${n(page)}`
      : `Page ${n(page)}`
    : locale === "ar"
      ? `الصفحة ${n(page)} من ${n(pageCount)}`
      : `Page ${n(page)} of ${n(pageCount)}`;
  return (
    <DataPagination
      label={locale === "ar" ? "التنقل بين الصفحات" : "Pagination"}
      summary={
        locale === "ar"
          ? `${n(count)} نتيجة في هذه القراءة`
          : `${n(count)} results in this read`
      }
      pageLabel={pageLabel}
      page={page}
      pageCount={pageCount}
      previousLabel={locale === "ar" ? "الصفحة السابقة" : "Previous page"}
      nextLabel={locale === "ar" ? "الصفحة التالية" : "Next page"}
      previousHref={pageHref(path, query, page - 1, pageKey)}
      nextHref={pageHref(path, query, page + 1, pageKey)}
      renderLink={({ onClick, onMouseEnter, onTouchStart, ...props }) => (
        <Link
          {...props}
          {...(onClick === undefined ? {} : { onClick })}
          {...(onMouseEnter === undefined ? {} : { onMouseEnter })}
          {...(onTouchStart === undefined ? {} : { onTouchStart })}
        />
      )}
    />
  );
}
