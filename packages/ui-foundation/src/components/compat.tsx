/*
 * Earlier foundation APIs, now rendered with the shadcn/Tailwind system so
 * existing call sites keep working while pages migrate. Prefer the newer
 * components (Card, Field + Input, Alert, Button asChild) in new code.
 */
import type { ComponentProps, ReactNode } from "react";

import { cn } from "../lib/cn.js";
import { buttonVariants, type ButtonVariant } from "./button.js";
import { Field, FieldDescription, FieldError, RequiredMark } from "./field.js";
import { Input, Label } from "./form-controls.js";

type SurfaceElement = "article" | "div" | "main" | "section";

export function Surface({
  as: Element = "section",
  children,
  className,
  labelledBy,
}: {
  as?: SurfaceElement;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  return (
    <Element
      aria-labelledby={labelledBy}
      className={cn(
        "grid min-w-0 gap-5 rounded-lg border bg-card p-5 text-card-foreground md:p-6",
        className,
      )}
    >
      {children}
    </Element>
  );
}

export function VisuallyHidden({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn("sr-only", className)}>{children}</span>;
}

export interface TextFieldProps extends Omit<
  ComponentProps<"input">,
  "id" | "children"
> {
  readonly description?: ReactNode;
  readonly error?: ReactNode;
  readonly id: string;
  readonly label: ReactNode;
}

export function TextField({
  description,
  error,
  id,
  label,
  required = false,
  className,
  ...inputProps
}: TextFieldProps) {
  const descriptionId = description === undefined ? undefined : `${id}-description`;
  const errorId = error === undefined ? undefined : `${id}-error`;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <Field invalid={error !== undefined} className={className}>
      <Label htmlFor={id}>
        {label}
        {required ? <RequiredMark /> : null}
      </Label>
      {description === undefined ? null : (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      )}
      <Input
        {...inputProps}
        id={id}
        required={required}
        aria-describedby={describedBy}
        aria-invalid={error === undefined ? undefined : true}
      />
      <FieldError id={errorId}>{error}</FieldError>
    </Field>
  );
}

export function ErrorSummary({
  children,
  className,
  focusTarget = false,
  id,
  title,
}: {
  children: ReactNode;
  className?: string;
  focusTarget?: boolean;
  id?: string;
  title: ReactNode;
}) {
  return (
    <div
      aria-atomic="true"
      aria-live="assertive"
      role="alert"
      id={id}
      tabIndex={focusTarget ? -1 : undefined}
      className={cn(
        "grid gap-2 rounded-lg border border-destructive/40 bg-destructive-soft px-4 py-3.5 text-sm text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-destructive/40 [&_a]:font-semibold [&_a]:text-destructive [&_a]:underline [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-1 [&_ul]:ps-5",
        className,
      )}
    >
      <strong className="font-semibold text-destructive">{title}</strong>
      {children}
    </div>
  );
}

export function StatusMessage({
  children,
  className,
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  tone?: "neutral" | "positive" | "warning";
}) {
  return (
    <p
      aria-atomic="true"
      aria-live="polite"
      role="status"
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        tone === "neutral" && "bg-card text-foreground",
        tone === "positive" && "border-success/30 bg-success-soft text-foreground",
        tone === "warning" && "border-warning/35 bg-warning-soft text-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function LinkButton({
  children,
  className,
  disabled = false,
  href,
  variant = "default",
  size,
  ...anchorProps
}: Omit<ComponentProps<"a">, "href"> & {
  href: string;
  disabled?: boolean;
  variant?: ButtonVariant;
  size?: "default" | "sm" | "lg";
}) {
  return (
    <a
      {...anchorProps}
      aria-disabled={disabled || undefined}
      href={disabled ? undefined : href}
      tabIndex={disabled ? -1 : undefined}
      className={cn(buttonVariants({ variant, size }), className)}
    >
      {children}
    </a>
  );
}
