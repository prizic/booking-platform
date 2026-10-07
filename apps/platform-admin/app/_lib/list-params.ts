export type ListSpec = {
  sorts?: readonly string[];
  defaultSort?: string;
  filters?: Record<string, readonly string[] | "uuid" | "text" | "date">;
  pageSize?: number;
};

export type ListParams = {
  q: string;
  page: number;
  sort: string;
  defaultSort: string;
  filters: Record<string, string>;
  pageSize: number;
  offset: number;
};

/** What a select filter submits for "All": Radix Select cannot hold an empty value. */
export const ALL_FILTER = "all";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function validDate(value: string): boolean {
  if (!datePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function parseListParams(
  raw: Record<string, string | string[] | undefined>,
  spec: ListSpec,
): ListParams {
  const pageSize = spec.pageSize ?? 25;
  const page = Math.min(Math.max(Number.parseInt(first(raw.page), 10) || 1, 1), 1000);
  const defaultSort = spec.defaultSort ?? "";
  const requestedSort = first(raw.sort);
  const sort = spec.sorts?.includes(requestedSort) ? requestedSort : defaultSort;
  const filters: Record<string, string> = {};
  for (const [name, rule] of Object.entries(spec.filters ?? {})) {
    const value = first(raw[name]).trim();
    if (!value || value === ALL_FILTER) continue;
    if (rule === "uuid") {
      if (uuidPattern.test(value.toLowerCase())) filters[name] = value.toLowerCase();
    } else if (rule === "date") {
      if (validDate(value)) filters[name] = value;
    } else if (rule === "text") {
      filters[name] = value.slice(0, 100);
    } else if (rule.includes(value)) {
      filters[name] = value;
    }
  }
  return {
    q: first(raw.q).trim().slice(0, 100),
    page,
    sort,
    defaultSort,
    filters,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

/** Shareable URL for a list; defaults are omitted and any change returns to page 1. */
export function listHref(
  path: string,
  params: ListParams,
  overrides: {
    q?: string;
    page?: number;
    sort?: string;
    filters?: Record<string, string>;
  } = {},
): string {
  const search = new URLSearchParams();
  const q = overrides.q ?? params.q;
  if (q) search.set("q", q);
  for (const [name, value] of Object.entries({
    ...params.filters,
    ...overrides.filters,
  })) {
    if (value) search.set(name, value);
  }
  const sort = overrides.sort ?? params.sort;
  if (sort && sort !== params.defaultSort) search.set("sort", sort);
  const resetPage =
    overrides.filters !== undefined ||
    overrides.q !== undefined ||
    overrides.sort !== undefined;
  const page = overrides.page ?? (resetPage ? 1 : params.page);
  if (page > 1) search.set("page", String(page));
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
