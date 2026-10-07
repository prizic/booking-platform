import { Surface } from "@wlbp/ui-foundation";
import type { CSSProperties, ReactNode } from "react";

import {
  neutralBrandTokens,
  parseBrandTokens,
  type BrandTokens,
} from "./brand-tokens.js";

export * from "./brand-assets.js";
export * from "./brand-config.js";
export * from "./brand-tokens.js";
export * from "./instance-content.js";

type BrandStyle = CSSProperties & Readonly<Record<`--brand-${string}`, string>>;

const colorVariables = [
  ["background", "background"],
  ["surface", "surface"],
  ["text", "text"],
  ["muted", "muted"],
  ["border", "border"],
  ["primary", "primary"],
  ["onPrimary", "on-primary"],
  ["success", "success"],
  ["onSuccess", "on-success"],
  ["warning", "warning"],
  ["onWarning", "on-warning"],
  ["danger", "danger"],
  ["onDanger", "on-danger"],
  ["focus", "focus"],
] as const;

/** Whether the brand ships a validated dark palette; the theme toggle is hidden otherwise. */
export function brandSupportsDarkMode(tokens: BrandTokens): boolean {
  return parseBrandTokens(tokens).colorDark !== undefined;
}

export function createBrandStyle(tokens: BrandTokens): BrandStyle {
  const validated = parseBrandTokens(tokens);
  const dark = validated.colorDark;
  const darkVariables = Object.fromEntries(
    dark === undefined
      ? []
      : colorVariables.map(([key, name]) => [`--brand-dark-color-${name}`, dark[key]]),
  );
  return {
    ...darkVariables,
    "--brand-color-background": validated.color.background,
    "--brand-color-surface": validated.color.surface,
    "--brand-color-text": validated.color.text,
    "--brand-color-muted": validated.color.muted,
    "--brand-color-border": validated.color.border,
    "--brand-color-primary": validated.color.primary,
    "--brand-color-on-primary": validated.color.onPrimary,
    "--brand-color-success": validated.color.success,
    "--brand-color-on-success": validated.color.onSuccess,
    "--brand-color-warning": validated.color.warning,
    "--brand-color-on-warning": validated.color.onWarning,
    "--brand-color-danger": validated.color.danger,
    "--brand-color-on-danger": validated.color.onDanger,
    "--brand-color-focus": validated.color.focus,
    "--brand-radius-control": validated.radius.control,
    "--brand-radius-surface": validated.radius.surface,
    "--brand-radius-pill": validated.radius.pill,
    "--brand-border-width-default": validated.borderWidth.default,
    "--brand-border-width-strong": validated.borderWidth.strong,
    "--brand-space-xxs": validated.spacing.xxs,
    "--brand-space-xs": validated.spacing.xs,
    "--brand-space-sm": validated.spacing.sm,
    "--brand-space-md": validated.spacing.md,
    "--brand-space-lg": validated.spacing.lg,
    "--brand-space-xl": validated.spacing.xl,
    "--brand-space-xxl": validated.spacing.xxl,
    "--brand-content-width-form": validated.contentWidth.form,
    "--brand-content-width-reading": validated.contentWidth.reading,
    "--brand-content-width-wide": validated.contentWidth.wide,
    "--brand-motion-fast": validated.motion.fast,
    "--brand-motion-standard": validated.motion.standard,
    "--brand-motion-slow": validated.motion.slow,
    "--brand-motion-reduced-fast": validated.motion.reducedFast,
    "--brand-motion-reduced": validated.motion.reduced,
    "--brand-motion-reduced-slow": validated.motion.reducedSlow,
    "--brand-motion-easing-standard": validated.motion.easingStandard,
    "--brand-motion-easing-exit": validated.motion.easingExit,
    "--brand-font-body": validated.typography.bodyFamily,
    "--brand-font-display": validated.typography.displayFamily,
    "--brand-font-arabic-body": validated.typography.arabicBodyFamily,
    "--brand-font-arabic-display": validated.typography.arabicDisplayFamily,
    "--brand-font-size-caption": validated.typography.size.caption,
    "--brand-font-size-body": validated.typography.size.body,
    "--brand-font-size-label": validated.typography.size.label,
    "--brand-font-size-title": validated.typography.size.title,
    "--brand-font-size-display": validated.typography.size.display,
    "--brand-font-weight-regular": validated.typography.weight.regular,
    "--brand-font-weight-medium": validated.typography.weight.medium,
    "--brand-font-weight-semibold": validated.typography.weight.semibold,
    "--brand-font-weight-bold": validated.typography.weight.bold,
    "--brand-line-height-compact": validated.typography.lineHeight.compact,
    "--brand-line-height-body": validated.typography.lineHeight.body,
    "--brand-line-height-relaxed": validated.typography.lineHeight.relaxed,
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
