"use client";
import { usePathname, useSearchParams } from "next/navigation";
import type { Locale } from "@wlbp/i18n";
import { LocaleSwitch } from "@wlbp/ui-foundation";
import { getDashboardMessage } from "./copy";
import { workspaceLocaleHref } from "./workspace-locale-links";

/** Each language's own name, so a reader finds theirs whatever is shown. */
const ownNames: Record<Locale, string> = { ar: "العربية", en: "English" };

export function WorkspaceLocaleNavigation({
  locale,
  tone = "default",
}: {
  readonly locale: Locale;
  readonly tone?: "default" | "rail";
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  return (
    <LocaleSwitch
      label={getDashboardMessage(locale, "languageNavigation")}
      tone={tone}
      options={(["ar", "en"] as const).map((target) => ({
        locale: target,
        // Keeps supported filters, drops credentials and auth-only paths.
        href: workspaceLocaleHref(target, pathname, search.toString()),
        label: ownNames[target],
        current: locale === target,
      }))}
    />
  );
}
