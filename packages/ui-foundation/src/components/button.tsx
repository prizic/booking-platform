import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { Slot } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "../lib/cn.js";

/**
 * The one button for every app. Links that look like buttons use
 * `<Button asChild><a href="…">…</a></Button>`.
 */
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-[color,background-color,border-color,box-shadow] duration-150 ease-out outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 rtl:[&_svg.lucide-arrow-right]:-scale-x-100 rtl:[&_svg.lucide-chevron-right]:-scale-x-100 rtl:[&_svg.lucide-arrow-left]:-scale-x-100 rtl:[&_svg.lucide-chevron-left]:-scale-x-100",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 active:bg-primary/85",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-neutral-3 active:bg-neutral-4",
        outline:
          "border border-input bg-card text-foreground shadow-xs hover:bg-accent active:bg-neutral-3",
        ghost: "text-foreground hover:bg-accent active:bg-neutral-3",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/40",
        "destructive-outline":
          "border border-destructive/60 bg-card text-destructive hover:bg-destructive-soft",
        success: "bg-success text-success-foreground shadow-xs hover:bg-success/90",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline",
        rail: "justify-start text-rail-muted hover:bg-rail-accent hover:text-rail-foreground aria-[current=page]:bg-rail-accent aria-[current=page]:text-rail-foreground",
        /** @deprecated alias of `default`, kept for incremental migration. */
        primary:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 active:bg-primary/85",
        /** @deprecated alias of `ghost`, kept for incremental migration. */
        quiet: "text-foreground hover:bg-accent active:bg-neutral-3",
      },
      size: {
        default: "h-11 px-4",
        sm: "h-9 gap-1.5 px-3 text-[0.8125rem]",
        lg: "h-12 px-6 text-base",
        icon: "size-11",
        "icon-sm": "size-9",
      },
      block: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      block: false,
    },
  },
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>;

export interface ButtonProps
  extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  readonly asChild?: boolean;
  /** Shows a spinner, sets aria-busy and blocks repeat submission. */
  readonly loading?: boolean;
  /** Optional text that replaces the label while loading. */
  readonly loadingLabel?: ReactNode;
}

export function Button({
  asChild = false,
  block,
  children,
  className,
  disabled,
  loading = false,
  loadingLabel,
  size,
  type,
  variant,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, block }), className);

  if (asChild) {
    return (
      <Slot.Root data-slot="button" className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }

  return (
    <button
      data-slot="button"
      className={classes}
      type={type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
      {loading && loadingLabel !== undefined ? loadingLabel : children}
    </button>
  );
}
