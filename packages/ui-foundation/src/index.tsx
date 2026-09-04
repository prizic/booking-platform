import type { AnchorHTMLAttributes, ReactNode } from "react";

type SurfaceElement = "article" | "div" | "main" | "section";

export interface SurfaceProps {
  readonly as?: SurfaceElement;
  readonly children: ReactNode;
  readonly className?: string;
  readonly labelledBy?: string;
}

export function Surface({
  as: Element = "section",
  children,
  className,
  labelledBy,
}: SurfaceProps) {
  const classes = ["wlbp-surface", className].filter(Boolean).join(" ");

  return (
    <Element aria-labelledby={labelledBy} className={classes}>
      {children}
    </Element>
  );
}

export type BadgeTone = "neutral" | "positive" | "warning" | "danger";

export interface BadgeProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly tone?: BadgeTone;
}

export function Badge({ children, className, tone = "neutral" }: BadgeProps) {
  const classes = ["wlbp-badge", `wlbp-badge--${tone}`, className]
    .filter(Boolean)
    .join(" ");

  return <span className={classes}>{children}</span>;
}

export interface LinkButtonProps extends Pick<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "aria-current" | "aria-label" | "download" | "hrefLang" | "rel" | "target"
> {
  readonly children: ReactNode;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly href: string;
  readonly variant?: "primary" | "secondary" | "quiet";
}

export function LinkButton({
  children,
  className,
  disabled = false,
  href,
  variant = "primary",
  ...anchorProps
}: LinkButtonProps) {
  const classes = ["wlbp-link-button", `wlbp-link-button--${variant}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <a
      {...anchorProps}
      aria-disabled={disabled || undefined}
      className={classes}
      href={disabled ? undefined : href}
      tabIndex={disabled ? -1 : undefined}
    >
      {children}
    </a>
  );
}
