import type { Locale } from "@wlbp/i18n";
import Link from "next/link";
import type { ReactNode } from "react";
import { fill, formCopy } from "../copy";

export type Column = { label: string; sort?: string; numeric?: boolean };

/** Wide tables scroll inside their own labelled, focusable region. */
export function DataTable({
  id,
  locale,
  caption,
  columns,
  rows,
  sort,
  sortHref,
}: {
  id: string;
  locale: Locale;
  caption: string;
  columns: readonly Column[];
  rows: readonly { key: string; cells: readonly ReactNode[] }[];
  sort?: string;
  sortHref?: (sort: string) => string;
}) {
  return (
    <div className="table-scroll" role="region" aria-labelledby={id} tabIndex={0}>
      <table className="data-table">
        <caption id={id}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => {
              const direction = !column.sort
                ? undefined
                : sort === column.sort
                  ? "ascending"
                  : sort === `-${column.sort}`
                    ? "descending"
                    : "none";
              const next = sort === column.sort ? `-${column.sort}` : column.sort;
              return (
                <th
                  key={column.label}
                  scope="col"
                  aria-sort={direction}
                  className={column.numeric ? "numeric" : undefined}
                >
                  {column.sort && sortHref && next ? (
                    <Link
                      href={sortHref(next)}
                      aria-label={fill(locale, formCopy.sortBy, {
                        column: column.label,
                      })}
                    >
                      {column.label}
                      <span aria-hidden="true">
                        {direction === "ascending"
                          ? " ▲"
                          : direction === "descending"
                            ? " ▼"
                            : ""}
                      </span>
                    </Link>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              {row.cells.map((cell, index) => (
                <td
                  key={columns[index]?.label ?? index}
                  className={columns[index]?.numeric ? "numeric" : undefined}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
