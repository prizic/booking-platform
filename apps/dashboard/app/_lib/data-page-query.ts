export type PageQuery = Record<string, string | string[] | undefined>;
export function paginateRows<T>(
  rows: readonly T[],
  query: PageQuery,
  pageSize = 25,
  pageKey = "page",
) {
  const value = query[pageKey];
  const raw = typeof value === "string" && /^\d{1,6}$/u.test(value) ? Number(value) : 1;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(pageCount, Math.max(1, raw));
  return {
    page,
    pageCount,
    count: rows.length,
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
  };
}
export function pageHref(
  path: string,
  query: PageQuery,
  page: number,
  pageKey = "page",
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (
      key !== pageKey &&
      key !== "result" &&
      typeof value === "string" &&
      value.length <= 2048
    )
      params.set(key, value);
  params.set(pageKey, String(page));
  return `${path}?${params}`;
}
