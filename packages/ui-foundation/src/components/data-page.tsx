import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { ComponentProps, ReactElement, ReactNode } from "react";

import { cn } from "../lib/cn.js";
import { Button } from "./button.js";
import { NavigationLink, type LinkRenderer } from "./navigation-link.js";
import { PageHeader, PaginationBar, Toolbar } from "./patterns.js";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Skeleton,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type BadgeTone,
} from "./surfaces.js";

export interface DataPageProps extends ComponentProps<typeof PageHeader> {
  readonly toolbar?: ReactNode;
  /** Inline mutation success/refusal, independent of the read state. */
  readonly feedback?: ReactNode;
  readonly pagination?: ReactNode;
  readonly children: ReactNode;
  readonly busy?: boolean;
}

/** Header → filters → feedback → table/list/read state → pagination. No DAL or URL ownership. */
export function DataPage({
  title,
  description,
  actions,
  meta,
  titleId,
  toolbar,
  feedback,
  children,
  pagination,
  busy,
  className,
}: DataPageProps) {
  return (
    <section
      data-slot="data-page"
      aria-labelledby={titleId}
      className={cn("grid min-w-0 content-start gap-6", className)}
    >
      <PageHeader
        title={title}
        description={description}
        actions={actions}
        meta={meta}
        {...(titleId !== undefined ? { titleId } : {})}
      />
      {toolbar}
      {feedback}
      <div
        data-slot="data-page-body"
        className="grid min-w-0 gap-4"
        aria-busy={busy || undefined}
      >
        {children}
      </div>
      {pagination}
    </section>
  );
}

export interface FilterBarProps extends ComponentProps<"form"> {
  readonly label: string;
  readonly actions?: ReactNode;
}

/** Apps supply named fields, retained hidden query parameters, and explicit submit/reset controls. */
export function FilterBar({
  label,
  children,
  actions,
  className,
  method = "get",
  ...props
}: FilterBarProps) {
  return (
    <form
      data-slot="filter-bar"
      aria-label={label}
      method={method}
      className={className}
      {...props}
    >
      <Toolbar>
        {children}
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </Toolbar>
    </form>
  );
}

/** A visible label for Input/Select/Textarea; htmlFor must match the control's id. */
export function FilterField({
  label,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div data-slot="filter-field" className={cn("grid min-w-0 gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-semibold text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

export interface DataColumn {
  readonly key: string;
  /** Required even for actions; action headers are visually hidden, never unnamed. */
  readonly label: string;
  readonly kind?: "data" | "actions";
  readonly sort?: string;
  readonly className?: string;
}

export interface DataRow {
  readonly key: string;
  /** One cell per column. Apps own formatting, links, permission-aware actions and status mapping. */
  readonly cells: readonly ReactNode[];
}

export interface DataTableProps {
  readonly id: string;
  readonly caption: string;
  readonly columns: readonly DataColumn[];
  readonly rows: readonly DataRow[];
  readonly sort?: string;
  readonly sortHref?: (sort: string) => string;
  /** Complete localized accessible name for the next sort action. */
  readonly sortLabel?: (column: DataColumn, next: "ascending" | "descending") => string;
  readonly renderLink?: LinkRenderer;
  readonly className?: string;
}

/** Desktop semantic table and mobile labelled record list share the same cells and actions. */
export function DataTable({
  id,
  caption,
  columns,
  rows,
  sort,
  sortHref,
  sortLabel,
  renderLink,
  className,
}: DataTableProps) {
  return (
    <div data-slot="data-table" className={cn("min-w-0", className)}>
      {sortHref && columns.some((column) => column.sort) ? (
        <div
          className="mb-3 flex flex-wrap gap-2 md:hidden"
          role="group"
          aria-label={caption}
        >
          {columns
            .filter((column) => column.sort)
            .map((column) => {
              const next = sort === column.sort ? "descending" : "ascending";
              const nextSort = next === "descending" ? `-${column.sort}` : column.sort;
              const Icon =
                sort === column.sort
                  ? ArrowUp
                  : sort === `-${column.sort}`
                    ? ArrowDown
                    : ArrowUpDown;
              return nextSort ? (
                <Button key={column.key} asChild variant="outline" size="sm">
                  <NavigationLink
                    href={sortHref(nextSort)}
                    {...(renderLink !== undefined ? { renderLink } : {})}
                    aria-label={sortLabel?.(column, next)}
                  >
                    {column.label}
                    <Icon aria-hidden="true" />
                  </NavigationLink>
                </Button>
              ) : null;
            })}
        </div>
      ) : null}
      <ul aria-label={caption} className="grid min-w-0 gap-3 md:hidden">
        {rows.map((row) => (
          <li
            key={row.key}
            className="grid min-w-0 gap-3 rounded-lg border bg-card p-4 text-sm text-card-foreground"
          >
            <dl className="grid min-w-0 gap-2">
              {columns.map((column, index) =>
                column.kind === "actions" ? null : (
                  <div
                    key={column.key}
                    className="grid min-w-0 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4"
                  >
                    <dt className="text-muted-foreground">{column.label}</dt>
                    <dd
                      className={cn(
                        "min-w-0 break-words",
                        index === 0 && "font-semibold",
                      )}
                    >
                      {row.cells[index]}
                    </dd>
                  </div>
                ),
              )}
            </dl>
            {columns.some((column) => column.kind === "actions") ? (
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                {columns.map((column, index) =>
                  column.kind === "actions" ? (
                    <div key={column.key} className="min-w-0">
                      {row.cells[index]}
                    </div>
                  ) : null,
                )}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="hidden min-w-0 md:block">
        <Table label={caption} aria-labelledby={`${id}-caption`}>
          <TableCaption id={`${id}-caption`} className="sr-only">
            {caption}
          </TableCaption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((column) => {
                const direction = !column.sort
                  ? undefined
                  : sort === column.sort
                    ? "ascending"
                    : sort === `-${column.sort}`
                      ? "descending"
                      : "none";
                const next = sort === column.sort ? "descending" : "ascending";
                const nextSort =
                  next === "descending" ? `-${column.sort}` : column.sort;
                const Icon =
                  direction === "ascending"
                    ? ArrowUp
                    : direction === "descending"
                      ? ArrowDown
                      : ArrowUpDown;
                return (
                  <TableHead
                    key={column.key}
                    aria-sort={direction}
                    className={column.className}
                  >
                    {column.sort && sortHref && nextSort ? (
                      <NavigationLink
                        href={sortHref(nextSort)}
                        {...(renderLink !== undefined ? { renderLink } : {})}
                        aria-label={sortLabel?.(column, next)}
                        className="inline-flex min-h-10 items-center gap-2 rounded-sm text-foreground underline-offset-4 hover:underline"
                      >
                        {column.label}
                        <Icon aria-hidden="true" className="size-3.5" />
                      </NavigationLink>
                    ) : (
                      <span
                        className={column.kind === "actions" ? "sr-only" : undefined}
                      >
                        {column.label}
                      </span>
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                {columns.map((column, index) => (
                  <TableCell
                    key={column.key}
                    className={cn("break-words", column.className)}
                  >
                    {row.cells[index]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export interface DataPaginationProps {
  readonly label: string;
  readonly summary: ReactNode;
  /** Complete localized text, e.g. “Page 2 of 4”; numbers formatted by the app. */
  readonly pageLabel: string;
  readonly page: number;
  readonly pageCount: number;
  readonly previousLabel: string;
  readonly nextLabel: string;
  readonly previousHref?: string;
  readonly nextHref?: string;
  readonly renderLink?: LinkRenderer;
  readonly className?: string;
}

/** Page boundaries render disabled buttons without hrefs or hidden active links. */
export function DataPagination({
  label,
  summary,
  pageLabel,
  page,
  pageCount,
  previousLabel,
  nextLabel,
  previousHref,
  nextHref,
  renderLink,
  className,
}: DataPaginationProps) {
  const previous = page > 1 ? previousHref : undefined;
  const next = page < pageCount ? nextHref : undefined;
  const previousContent = (
    <>
      <ChevronLeft aria-hidden="true" />
      <span>{previousLabel}</span>
    </>
  );
  const nextContent = (
    <>
      <span>{nextLabel}</span>
      <ChevronRight aria-hidden="true" />
    </>
  );
  return (
    <PaginationBar
      label={label}
      summary={summary}
      {...(className !== undefined ? { className } : {})}
      current={
        <span
          aria-current="page"
          className="text-sm font-medium [font-variant-numeric:tabular-nums]"
        >
          {pageLabel}
        </span>
      }
      previous={
        previous ? (
          <Button asChild variant="outline" size="sm">
            <NavigationLink
              href={previous}
              {...(renderLink !== undefined ? { renderLink } : {})}
              rel="prev"
            >
              {previousContent}
            </NavigationLink>
          </Button>
        ) : (
          <Button disabled variant="outline" size="sm">
            {previousContent}
          </Button>
        )
      }
      next={
        next ? (
          <Button asChild variant="outline" size="sm">
            <NavigationLink
              href={next}
              {...(renderLink !== undefined ? { renderLink } : {})}
              rel="next"
            >
              {nextContent}
            </NavigationLink>
          </Button>
        ) : (
          <Button disabled variant="outline" size="sm">
            {nextContent}
          </Button>
        )
      }
    />
  );
}

/** Loading has a named live status; placeholder geometry carries no accessible content. */
export function LoadingState({
  label,
  rows = 4,
  className,
}: {
  label: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div
      data-slot="loading-state"
      className={cn("grid gap-3 rounded-lg border bg-card p-5", className)}
    >
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {label}
      </p>
      <div aria-hidden="true" className="grid gap-3">
        {Array.from(
          { length: Math.min(12, Math.max(0, Math.floor(rows))) },
          (_, index) => (
            <Skeleton key={index} className="h-11 w-full" />
          ),
        )}
      </div>
    </div>
  );
}

/** Retry is an explicit app-owned read action. Never show raw exception/provider details here. */
export function ErrorState({
  title,
  description,
  retry,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  retry: ReactElement;
  className?: string;
}) {
  return (
    <Alert data-slot="error-state" tone="danger" className={className}>
      <AlertTitle as="h2">{title}</AlertTitle>
      {description ? <AlertDescription>{description}</AlertDescription> : null}
      <div className="flex flex-wrap gap-2 pt-2">{retry}</div>
    </Alert>
  );
}

export function SuccessState({
  title,
  description,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <Alert data-slot="success-state" tone="positive" className={className}>
      <AlertTitle>{title}</AlertTitle>
      {description ? <AlertDescription>{description}</AlertDescription> : null}
    </Alert>
  );
}

/** Presentation only. The app maps its private lifecycle to a tone and localized label. */
export function StatusBadge({
  label,
  tone = "neutral",
  icon,
  ...props
}: Omit<ComponentProps<"span">, "children"> & {
  label: string;
  tone?: BadgeTone;
  icon?: ReactNode;
}) {
  return (
    <Badge tone={tone} {...props}>
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {label}
    </Badge>
  );
}
