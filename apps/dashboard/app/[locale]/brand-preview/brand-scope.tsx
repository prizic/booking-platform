import type { CSSProperties, ReactNode } from "react";
import type { Locale } from "@wlbp/i18n";
import { cn } from "@wlbp/ui-foundation";
import { createBrandStyle, type BrandTokens } from "@wlbp/white-label-ui";

/*
 * The foundation theme resolves its semantic roles (--primary, --card, the
 * neutral ramp, …) once on <html> from the deployment's own brand. A preview
 * of a *different* brand — the authorised draft — therefore re-declares those
 * roles on its own subtree, so every foundation component inside renders with
 * the previewed palette, fonts and radii exactly as the Client would.
 */
const derivedRoles = {
  "--neutral-1": "color-mix(in oklab, var(--foreground) 3%, var(--background))",
  "--neutral-2": "color-mix(in oklab, var(--foreground) 6%, var(--background))",
  "--neutral-3": "color-mix(in oklab, var(--foreground) 11%, var(--background))",
  "--neutral-4": "color-mix(in oklab, var(--foreground) 18%, var(--background))",
  "--card-foreground": "var(--foreground)",
  "--popover": "var(--card)",
  "--popover-foreground": "var(--foreground)",
  "--secondary": "var(--neutral-2)",
  "--secondary-foreground": "var(--foreground)",
  "--muted": "var(--neutral-1)",
  "--accent": "var(--neutral-2)",
  "--accent-foreground": "var(--foreground)",
  "--border": "var(--neutral-3)",
  "--input": "var(--border-strong)",
  "--primary-soft": "color-mix(in oklab, var(--primary) 12%, var(--card))",
  "--success-soft": "color-mix(in oklab, var(--success) 12%, var(--card))",
  "--warning-soft": "color-mix(in oklab, var(--warning) 14%, var(--card))",
  "--destructive-soft": "color-mix(in oklab, var(--destructive) 12%, var(--card))",
} as const;

export function brandScopeStyle(
  tokens: BrandTokens,
  locale: Locale,
  theme: "light" | "dark" = "light",
): CSSProperties {
  // createBrandStyle validates the tokens (contrast included) before use.
  const brand = createBrandStyle(tokens);
  const color = theme === "dark" && tokens.colorDark ? tokens.colorDark : tokens.color;
  return {
    ...brand,
    "--background": color.background,
    "--foreground": color.text,
    "--card": color.surface,
    "--primary": color.primary,
    "--primary-foreground": color.onPrimary,
    "--muted-foreground": color.muted,
    "--border-strong": color.border,
    "--success": color.success,
    "--success-foreground": color.onSuccess,
    "--warning": color.warning,
    "--warning-foreground": color.onWarning,
    "--destructive": color.danger,
    "--destructive-foreground": color.onDanger,
    "--ring": color.focus,
    ...derivedRoles,
    "--radius": tokens.radius.control,
    "--radius-surface": tokens.radius.surface,
    "--font-latin": tokens.typography.bodyFamily,
    "--font-arabic": tokens.typography.arabicBodyFamily,
    "--font-active":
      locale === "ar"
        ? tokens.typography.arabicBodyFamily
        : tokens.typography.bodyFamily,
    colorScheme: theme,
  } as CSSProperties;
}

/** A subtree themed with another brand's tokens, rendered with foundation components. */
export function BrandScope({
  tokens,
  locale,
  theme = "light",
  className,
  children,
}: {
  tokens: BrandTokens;
  locale: Locale;
  theme?: "light" | "dark";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-brand-preview={theme}
      // Tenant brand tokens: genuinely dynamic values, so they arrive inline.
      style={brandScopeStyle(tokens, locale, theme)}
      className={cn("bg-background font-sans text-foreground", className)}
    >
      {children}
    </div>
  );
}
