import { cva, type VariantProps } from "class-variance-authority";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "../lib/cn.js";

/* ---------------------------------------------------------------- Card */

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex min-w-0 flex-col gap-5 rounded-lg border bg-card py-5 text-card-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.04)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "grid auto-rows-min items-start gap-1.5 px-5 has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  as: Heading = "h2",
  ...props
}: ComponentProps<"h2"> & { as?: "h2" | "h3" | "h4" }) {
  return (
    <Heading
      data-slot="card-title"
      className={cn("text-base leading-snug font-semibold text-balance", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-sm leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}

export function CardAction({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className,
      )}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex flex-wrap items-center gap-3 px-5", className)}
      {...props}
    />
  );
}

/* --------------------------------------------------------------- Badge */

export const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs leading-5 font-semibold whitespace-nowrap [&>svg]:size-3.5 [&>svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "border-border bg-neutral-1 text-foreground",
        primary: "border-transparent bg-primary-soft text-primary-ink",
        positive: "border-transparent bg-success-soft text-success-ink",
        warning: "border-transparent bg-warning-soft text-warning-ink",
        danger: "border-transparent bg-destructive-soft text-destructive-ink",
        solid: "border-transparent bg-primary text-primary-foreground",
        outline: "border-border-strong bg-transparent text-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

export function Badge({
  className,
  tone,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ tone }), className)}
      {...props}
    />
  );
}

/* --------------------------------------------------------------- Alert */

const alertVariants = cva(
  "relative grid w-full grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 rounded-lg border px-4 py-3.5 text-sm [&>svg]:mt-0.5 [&>svg]:size-4.5 [&>svg]:shrink-0",
  {
    variants: {
      tone: {
        info: "border-border bg-card text-foreground [&>svg]:text-muted-foreground",
        positive:
          "border-success/30 bg-success-soft text-foreground [&>svg]:text-success",
        warning:
          "border-warning/35 bg-warning-soft text-foreground [&>svg]:text-warning",
        danger:
          "border-destructive/35 bg-destructive-soft text-foreground [&>svg]:text-destructive",
      },
    },
    defaultVariants: { tone: "info" },
  },
);

const alertIcons = {
  info: Info,
  positive: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
} as const;

export type AlertTone = keyof typeof alertIcons;

/**
 * Inline message. `danger` announces assertively (role=alert); every other
 * tone is a polite status so routine confirmations don't interrupt.
 */
export function Alert({
  className,
  tone = "info",
  children,
  icon = true,
  ...props
}: ComponentProps<"div"> & { tone?: AlertTone; icon?: boolean }) {
  const Icon = alertIcons[tone];
  return (
    <div
      data-slot="alert"
      role={tone === "danger" ? "alert" : "status"}
      aria-live={tone === "danger" ? "assertive" : "polite"}
      aria-atomic="true"
      className={cn(alertVariants({ tone }), !icon && "grid-cols-1", className)}
      {...props}
    >
      {icon ? <Icon aria-hidden="true" /> : null}
      <div className="col-start-auto grid min-w-0 gap-1">{children}</div>
    </div>
  );
}

/** Pass `as="h2"` (or h3) when the alert is a page's state, so it stays in the heading outline. */
export function AlertTitle({
  className,
  as: Element = "p",
  ...props
}: ComponentProps<"p"> & { as?: "p" | "h2" | "h3" }) {
  return (
    <Element
      data-slot="alert-title"
      className={cn("text-sm leading-snug font-semibold", className)}
      {...props}
    />
  );
}

export function AlertDescription({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "leading-relaxed text-muted-foreground [&_p]:leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}

/* ----------------------------------------------------- Separator & co. */

export function Separator({
  className,
  orientation = "horizontal",
  ...props
}: ComponentProps<"div"> & { orientation?: "horizontal" | "vertical" }) {
  return (
    <div
      data-slot="separator"
      role="separator"
      aria-orientation={orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px self-stretch",
        className,
      )}
      {...props}
    />
  );
}

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-neutral-3", className)}
      {...props}
    />
  );
}

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1 font-latin text-[0.6875rem] font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

/* --------------------------------------------------------------- Table */

/** A table that scrolls inside its own labelled region on narrow screens. */
export function Table({
  className,
  label,
  ...props
}: ComponentProps<"table"> & { label?: string }) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto rounded-lg border bg-card"
      role={label ? "region" : undefined}
      aria-label={label}
      tabIndex={label ? 0 : undefined}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom border-collapse text-sm", className)}
        {...props}
      />
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("bg-neutral-1 [&_tr]:border-b", className)}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-neutral-1 data-[state=selected]:bg-primary-soft",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      scope="col"
      className={cn(
        "h-10 px-4 text-start align-middle text-xs font-semibold whitespace-nowrap text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-4 py-3 align-middle [font-variant-numeric:tabular-nums]",
        className,
      )}
      {...props}
    />
  );
}

export function TableCaption({ className, ...props }: ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("px-4 py-3 text-start text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}
