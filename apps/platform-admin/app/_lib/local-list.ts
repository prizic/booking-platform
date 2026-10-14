import type { ListParams } from "./list-params";
export function localList<T>(
  rows: readonly T[],
  list: ListParams,
  text: (row: T) => string,
  matches: (row: T) => boolean = () => true,
) {
  const needle = list.q.toLocaleLowerCase();
  const filtered = rows.filter(
    (row) => matches(row) && text(row).toLocaleLowerCase().includes(needle),
  );
  return {
    total: filtered.length,
    rows: filtered.slice(list.offset, list.offset + list.pageSize),
  };
}
