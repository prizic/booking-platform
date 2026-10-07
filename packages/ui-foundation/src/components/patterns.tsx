import { cva } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "../lib/cn.js";

/* ---------------------------------------------------------- PageHeader */

/**
 * The page's one h1 with optional description and actions. No eyebrow or
 * kicker: the heading carries its own weight.
 */
export function PageHeader({
  title,
  description,
  actions,
  meta,
  className,
  titleId,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
  titleId?: string;
}) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-6 gap-y-4",
        className,
      )}
    >
      <div className="grid max-w-3xl min-w-0 gap-2">
        <h1
          id={titleId}
          className="text-2xl leading-tight font-bold tracking-tight text-balance text-foreground md:text-[1.75rem]"
        >
          {title}
        </h1>
        {description ? (
          <p className="text-[0.9375rem] leading-relaxed text-pretty text-muted-foreground">
            {description}
          </p>
        ) : null}
        {meta ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">{meta}</div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

/** A titled region of a page; more space above the heading than below it. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  headingLevel = 2,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  headingLevel?: 2 | 3;
  id?: string;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("grid min-w-0 gap-4 pt-2", className)}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <Heading
            id={headingId}
            className={cn(
              "leading-snug font-semibold text-balance text-foreground",
              headingLevel === 2 ? "text-lg" : "text-base",
            )}
          >
            {title}
          </Heading>
          {description ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/* ---------------------------------------------------------- EmptyState */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-dashed bg-card/60 px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="grid size-11 place-items-center rounded-full bg-neutral-2 text-muted-foreground [&_svg]:size-5">
          {icon}
        </div>
      ) : null}
      <p className="text-base font-semibold text-foreground">{title}</p>
      {description ? (
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

/* --------------------------------------------------------------- Facts */

/** Label/value pairs for a record (booking, tenant, instance). */
export function Facts({
  items,
  className,
  columns = 2,
}: {
  items: ReadonlyArray<{ label: ReactNode; value: ReactNode; key?: string }>;
  className?: string;
  columns?: 1 | 2 | 3;
}) {
  return (
    <dl
      data-slot="facts"
      className={cn(
        "grid gap-x-6 gap-y-4",
        columns >= 2 && "sm:grid-cols-2",
        columns === 3 && "lg:grid-cols-3",
        className,
      )}
    >
      {items.map((item, index) => (
        <div key={item.key ?? index} className="grid min-w-0 gap-1 border-b pb-3">
          <dt className="text-xs font-semibold text-muted-foreground">{item.label}</dt>
          <dd className="min-w-0 text-sm font-medium break-words text-foreground [font-variant-numeric:tabular-nums]">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------- ReferenceCode */

/** Booking/record references as the record's typographic anchor; always LTR-isolated. */
export function ReferenceCode({
  className,
  size = "default",
  ...props
}: ComponentProps<"span"> & { size?: "default" | "lg" }) {
  return (
    <bdi
      data-slot="reference-code"
      className={cn(
        "inline-block font-latin font-semibold tracking-[0.06em] text-foreground [font-variant-numeric:tabular-nums]",
        size === "lg" ? "text-xl" : "text-sm",
        className,
      )}
      dir="ltr"
      {...props}
    />
  );
}

/* ---------------------------------------------------------- StatusStamp */

const stampVariants = cva(
  "inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs leading-5 font-bold whitespace-nowrap",
  {
    variants: {
      state: {
        confirmed: "border-success/40 bg-success-soft text-success-ink",
        requested:
          "sadu-weave border-dashed border-warning/60 bg-card text-warning-ink",
        pending: "border-dashed border-border-strong bg-card text-muted-foreground",
        completed: "border-border bg-neutral-2 text-foreground",
        cancelled:
          "border-destructive/40 bg-card text-destructive line-through decoration-1",
        failed: "border-destructive/40 bg-destructive-soft text-destructive-ink",
        neutral: "border-border bg-neutral-1 text-foreground",
        active: "border-primary/30 bg-primary-soft text-primary-ink",
      },
    },
    defaultVariants: { state: "neutral" },
  },
);

export type StampState =
  | "confirmed"
  | "requested"
  | "pending"
  | "completed"
  | "cancelled"
  | "failed"
  | "neutral"
  | "active";

/**
 * A state stamped onto a record. Meaning is always carried by the word as
 * well as the color; cancelled stays visible, struck through, never removed.
 */
export function StatusStamp({
  state,
  className,
  ...props
}: ComponentProps<"span"> & { state: StampState }) {
  return (
    <span
      data-slot="status-stamp"
      className={cn(stampVariants({ state }), className)}
      {...props}
    />
  );
}

/* ------------------------------------------------------------ DualDate */

/** Gregorian and Umm al-Qura Hijri dates side by side, as on a Taqweem leaf. */
export function DualDate({
  date,
  locale,
  timeZone,
  className,
}: {
  date: Date;
  locale: string;
  timeZone: string;
  className?: string;
}) {
  // Arabic uses Arabic-Indic digits everywhere in the product (as @wlbp/i18n does).
  const arabic = locale === "ar" || locale.startsWith("ar-");
  const gregorian = new Intl.DateTimeFormat(arabic ? "ar-u-nu-arab" : locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(date);
  const hijri = new Intl.DateTimeFormat(
    arabic ? "ar-u-ca-islamic-umalqura-nu-arab" : `${locale}-u-ca-islamic-umalqura`,
    {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone,
    },
  ).format(date);
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-2 text-sm", className)}>
      <time dateTime={date.toISOString()} className="font-semibold text-foreground">
        {gregorian}
      </time>
      <span aria-hidden="true" className="text-muted-foreground">
        ·
      </span>
      <span className="text-muted-foreground">{hijri}</span>
    </p>
  );
}

/* ---------------------------------------------------------- Pagination */

export function PaginationBar({
  summary,
  previous,
  next,
  label,
  className,
}: {
  summary?: ReactNode;
  previous?: ReactNode;
  next?: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn("flex flex-wrap items-center justify-between gap-3", className)}
    >
      <p className="text-sm text-muted-foreground [font-variant-numeric:tabular-nums]">
        {summary}
      </p>
      <div className="flex items-center gap-2">
        {previous}
        {next}
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------ Toolbar */

/** A wrapping row of filters/controls above the content they scope. */
export function Toolbar({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="toolbar"
      className={cn(
        "flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3 [&>*]:min-w-[10rem] [&>*]:flex-1 md:[&>*]:flex-none",
        className,
      )}
      {...props}
    />
  );
}
