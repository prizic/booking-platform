"use client";

import type { Locale } from "@wlbp/i18n";
import { LocaleSwitch as FoundationLocaleSwitch } from "@wlbp/ui-foundation";
import { usePathname, useSearchParams } from "next/navigation";

/** Each language's own name: these are endonyms, identical in both locales. */
const endonyms: Record<Locale, string> = { ar: "العربية", en: "English" };

/** Switches language on the same page, keeping the path and query. */
export function LocaleSwitch({
  locale,
  label,
  className,
  tone,
}: {
  locale: Locale;
  label: string;
  /** Kept for callers; the switch shows each language by its own name. */
  names?: { en: string; ar: string };
  className?: string;
  tone?: "default" | "rail";
}) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const hrefFor = (target: Locale) => {
    const rest = pathname.replace(/^\/(en|ar)(?=\/|$)/u, "");
    return `/${target}${rest}${search ? `?${search}` : ""}`;
  };
  return (
    <FoundationLocaleSwitch
      label={label}
      {...(className ? { className } : {})}
      {...(tone ? { tone } : {})}
      options={(["ar", "en"] as const).map((target) => ({
        locale: target,
        href: hrefFor(target),
        label: endonyms[target],
        current: target === locale,
      }))}
    />
  );
}
