"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { Locale } from "@wlbp/i18n";
import { getDashboardMessage } from "./copy";
import { workspaceLocaleHref } from "./workspace-locale-links";

export function WorkspaceLocaleNavigation({ locale }: { readonly locale: Locale }) {
  const pathname = usePathname();
  const search = useSearchParams();
  return (
    <nav aria-label={getDashboardMessage(locale, "languageNavigation")}>
      {(["en", "ar"] as const).map((target) => (
        <Link
          key={target}
          href={workspaceLocaleHref(target, pathname, search.toString())}
          aria-current={locale === target ? "page" : undefined}
        >
          <span aria-hidden="true">{target === "en" ? "EN" : "عربي"}</span>
          <span className="sr-only">
            {getDashboardMessage(
              locale,
              target === "en" ? "languageEnglish" : "languageArabic",
            )}
          </span>
        </Link>
      ))}
    </nav>
  );
}
