import type { Locale } from "@wlbp/i18n";
import {
  Button,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@wlbp/ui-foundation";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { fill, formCopy } from "../copy";

export type Column = { label: string; sort?: string; numeric?: boolean };

/**
 * Below md each row is a stacked card (primary cell as title, the other cells
 * as label/value pairs, unlabelled action cells last); from md up it is a
 * table whose wide content scrolls inside its own labelled region. Only one of
 * the two is displayed at a time, so assistive technology meets one copy.
 */
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
  const isAction = (index: number) => !columns[index]?.label;
  return (
    <>
      <ul aria-label={caption} className="grid gap-3 md:hidden">
        {rows.map((row) => {
          const [title, ...rest] = row.cells;
          const others = rest.map((cell, offset) => [offset + 1, cell] as const);
          const details = others.filter(([index]) => !isAction(index));
          const actions = others.filter(([index]) => isAction(index));
          return (
            <li
              key={row.key}
              className="grid min-w-0 gap-3 rounded-lg border bg-card p-4 text-sm text-card-foreground"
            >
              <div className="min-w-0 text-base font-semibold break-words">{title}</div>
              {details.length ? (
                <dl className="grid min-w-0 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-4 gap-y-2">
                  {details.map(([index, cell]) => (
                    <div
                      key={`${columns[index]?.label ?? ""}:${index}`}
                      className="contents"
                    >
                      <dt className="text-muted-foreground">{columns[index]?.label}</dt>
                      <dd className="min-w-0 break-words">{cell}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {actions.length ? (
                <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                  {actions.map(([index, cell]) => (
                    <div key={index} className="min-w-0">
                      {cell}
                    </div>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="hidden min-w-0 md:block">
        <Table label={caption}>
          <TableCaption id={id} className="sr-only">
            {caption}
          </TableCaption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((column, index) => {
                const direction = !column.sort
                  ? undefined
                  : sort === column.sort
                    ? "ascending"
                    : sort === `-${column.sort}`
                      ? "descending"
                      : "none";
                const next = sort === column.sort ? `-${column.sort}` : column.sort;
                const Icon =
                  direction === "ascending"
                    ? ArrowUp
                    : direction === "descending"
                      ? ArrowDown
                      : ArrowUpDown;
                return (
                  <TableHead
                    key={`${column.label}:${index}`}
                    aria-sort={direction}
                    className={cn(column.numeric && "text-end")}
                  >
                    {column.sort && sortHref && next ? (
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "-mx-3 h-11 text-xs text-muted-foreground hover:text-foreground",
                          direction !== "none" && "text-foreground",
                        )}
                      >
                        <Link
                          href={sortHref(next)}
                          aria-label={fill(locale, formCopy.sortBy, {
                            column: column.label,
                          })}
                        >
                          {column.label}
                          <Icon
                            aria-hidden="true"
                            className={cn(
                              "size-3.5",
                              direction === "none" && "opacity-50",
                            )}
                          />
                        </Link>
                      </Button>
                    ) : column.label ? (
                      column.label
                    ) : null}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                {row.cells.map((cell, index) => (
                  <TableCell
                    key={`${columns[index]?.label ?? ""}:${index}`}
                    className={cn(
                      "align-top",
                      columns[index]?.numeric && "text-end whitespace-nowrap",
                    )}
                  >
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
