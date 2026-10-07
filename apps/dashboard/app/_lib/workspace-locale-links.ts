import type { Locale } from "@wlbp/i18n";

const supportedFilters = new Set([
  "date",
  "view",
  "location",
  "staff",
  "service",
  "locationId",
  "staffId",
  "serviceId",
  "status",
  "from",
  "to",
  "timeZone",
]);
export function workspaceLocaleHref(
  locale: Locale,
  pathname: string,
  search: string,
): string {
  const path =
    pathname.startsWith("/") &&
    !pathname.startsWith("//") &&
    !(/[\\?#%]/u.test(pathname) || [...pathname].some((c) => c.charCodeAt(0) <= 32))
      ? pathname
      : "/en/today";
  const withoutLocale = path.replace(/^\/(?:en|ar)(?=\/|$)/u, "");
  const safePath = /^\/auth(?:\/|$)|^\/brand-preview(?:\/|$)/u.test(withoutLocale)
    ? "/today"
    : withoutLocale || "/today";
  const input = new URLSearchParams(search);
  const output = new URLSearchParams();
  for (const [key, value] of input)
    if (
      supportedFilters.has(key) &&
      value.length <= 100 &&
      ![...value].some((c) => c.charCodeAt(0) < 32)
    )
      output.set(key, value);
  const query = output.toString();
  return `/${locale}${safePath}${query ? `?${query}` : ""}`;
}
