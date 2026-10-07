import { formatCurrency, type Locale } from "@wlbp/i18n";
import { cn } from "@wlbp/ui-foundation";

/**
 * An amount from the shared currency formatter. Intl's own ordering is kept;
 * the value is isolated so the currency code never reorders Arabic text.
 */
export function Money({
  minor,
  currency,
  locale,
  className,
}: {
  readonly minor: number;
  readonly currency: string;
  readonly locale: Locale;
  readonly className?: string;
}) {
  return (
    <bdi
      className={cn("whitespace-nowrap [font-variant-numeric:tabular-nums]", className)}
    >
      {formatCurrency(minor, currency, locale)}
    </bdi>
  );
}
