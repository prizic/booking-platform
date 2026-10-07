import type { ComponentProps, ReactNode } from "react";

import { cn } from "../lib/cn.js";

/** Groups related fields under a visible legend (renders <fieldset>). */
export function FieldSet({ className, ...props }: ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn("grid min-w-0 gap-5 border-0 p-0", className)}
      {...props}
    />
  );
}

export function FieldLegend({ className, ...props }: ComponentProps<"legend">) {
  return (
    <legend
      data-slot="field-legend"
      className={cn("mb-1 text-base font-semibold text-foreground", className)}
      {...props}
    />
  );
}

/** Lays fields out in a responsive grid: one column on phones, `columns` from md. */
export function FieldGroup({
  className,
  columns = 1,
  ...props
}: ComponentProps<"div"> & { columns?: 1 | 2 | 3 }) {
  return (
    <div
      data-slot="field-group"
      className={cn(
        "grid gap-5",
        columns === 2 && "md:grid-cols-2",
        columns === 3 && "md:grid-cols-3",
        className,
      )}
      {...props}
    />
  );
}

/** One field: label, control, description and error stacked with consistent rhythm. */
export function Field({
  className,
  orientation = "vertical",
  invalid,
  ...props
}: ComponentProps<"div"> & {
  orientation?: "vertical" | "horizontal";
  invalid?: boolean;
}) {
  return (
    <div
      data-slot="field"
      data-invalid={invalid || undefined}
      className={cn(
        "group/field grid min-w-0 gap-2",
        orientation === "horizontal" &&
          "flex items-center gap-3 [&>[data-slot=label]]:font-medium",
        className,
      )}
      {...props}
    />
  );
}

export function FieldDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn("text-sm leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}

export function FieldError({
  className,
  children,
  ...props
}: ComponentProps<"p"> & { children?: ReactNode }) {
  if (children === undefined || children === null || children === false) return null;
  return (
    <p
      data-slot="field-error"
      className={cn("text-sm font-medium text-destructive", className)}
      {...props}
    >
      {children}
    </p>
  );
}

/** Marks a field as required for sighted users; pair with the native `required`. */
export function RequiredMark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("text-destructive", className)}>
      *
    </span>
  );
}
