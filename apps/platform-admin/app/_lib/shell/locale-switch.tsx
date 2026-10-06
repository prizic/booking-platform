"use client";

import type { Locale } from "@wlbp/i18n";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function LocaleSwitch({
  locale,
  label,
  names,
}: {
  locale: Locale;
  label: string;
  names: { en: string; ar: string };
}) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const hrefFor = (target: Locale) => {
    const rest = pathname.replace(/^\/(en|ar)(?=\/|$)/u, "");
    return `/${target}${rest}${search ? `?${search}` : ""}`;
  };
  return (
    <nav className="locale-switch" aria-label={label}>
      {(["en", "ar"] as const).map((target) => (
        <Link
          key={target}
          href={hrefFor(target)}
          lang={target}
          hrefLang={target}
          aria-current={target === locale ? "true" : undefined}
        >
          <span aria-hidden="true">{target === "en" ? "EN" : "عربي"}</span>
          <span className="sr-only">{names[target]}</span>
        </Link>
      ))}
    </nav>
  );
}
