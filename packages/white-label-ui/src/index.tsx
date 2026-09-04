import { Surface } from "@wlbp/ui-foundation";
import type { CSSProperties, ReactNode } from "react";

export interface BrandTokens {
  readonly color: {
    readonly background: string;
    readonly surface: string;
    readonly text: string;
    readonly muted: string;
    readonly border: string;
    readonly primary: string;
    readonly onPrimary: string;
    readonly success: string;
    readonly warning: string;
    readonly danger: string;
    readonly focus: string;
  };
  readonly radius: {
    readonly control: string;
    readonly surface: string;
  };
  readonly motion: {
    readonly reduced: string;
    readonly standard: string;
  };
  readonly typography: {
    readonly bodyFamily: string;
    readonly displayFamily: string;
  };
}

export const neutralBrandTokens: BrandTokens = {
  color: {
    background: "#f6f7f9",
    surface: "#ffffff",
    text: "#17202a",
    muted: "#52606d",
    border: "#cbd2d9",
    primary: "#174ea6",
    onPrimary: "#ffffff",
    success: "#137333",
    warning: "#8a4b00",
    danger: "#b3261e",
    focus: "#0b57d0",
  },
  radius: {
    control: "0.5rem",
    surface: "0.75rem",
  },
  motion: {
    reduced: "0ms",
    standard: "180ms",
  },
  typography: {
    bodyFamily: "system-ui, sans-serif",
    displayFamily: "system-ui, sans-serif",
  },
};

type BrandStyle = CSSProperties & Readonly<Record<`--brand-${string}`, string>>;

export function createBrandStyle(tokens: BrandTokens): BrandStyle {
  return {
    "--brand-color-background": tokens.color.background,
    "--brand-color-surface": tokens.color.surface,
    "--brand-color-text": tokens.color.text,
    "--brand-color-muted": tokens.color.muted,
    "--brand-color-border": tokens.color.border,
    "--brand-color-primary": tokens.color.primary,
    "--brand-color-on-primary": tokens.color.onPrimary,
    "--brand-color-success": tokens.color.success,
    "--brand-color-warning": tokens.color.warning,
    "--brand-color-danger": tokens.color.danger,
    "--brand-color-focus": tokens.color.focus,
    "--brand-radius-control": tokens.radius.control,
    "--brand-radius-surface": tokens.radius.surface,
    "--brand-motion-reduced": tokens.motion.reduced,
    "--brand-motion-standard": tokens.motion.standard,
    "--brand-font-body": tokens.typography.bodyFamily,
    "--brand-font-display": tokens.typography.displayFamily,
  };
}

export interface BrandShellProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly labelledBy?: string;
  readonly tokens?: BrandTokens;
}

export function BrandShell({
  children,
  className,
  labelledBy,
  tokens = neutralBrandTokens,
}: BrandShellProps) {
  const classes = ["wlbp-brand-shell", className].filter(Boolean).join(" ");

  return (
    <div className={classes} style={createBrandStyle(tokens)}>
      <Surface as="main" {...(labelledBy === undefined ? {} : { labelledBy })}>
        {children}
      </Surface>
    </div>
  );
}
