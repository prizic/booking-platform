import type { Locale } from "@wlbp/i18n";
import { Card, CardContent, CardHeader, LocaleSwitch } from "@wlbp/ui-foundation";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { dashboardBrand } from "./brand";
export { textLinkClass as authLinkClass } from "./ui/text-link";
import { getDashboardMessage } from "./copy";
import { instanceText } from "./instance-text";

/**
 * The signed-out frame: the tenant's mark, one card holding the task, and a
 * language switch that keeps the reader on the same auth step.
 */
export function AuthFrame({
  locale,
  titleId,
  title,
  intro,
  path,
  children,
  footer,
}: {
  readonly locale: Locale;
  readonly titleId: string;
  readonly title: ReactNode;
  readonly intro?: ReactNode;
  /** The auth step path without a locale, e.g. "/auth/sign-in". */
  readonly path: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}) {
  const brandName = instanceText(locale)("brand.name");
  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] bg-background">
      <header className="flex items-center justify-between gap-4 px-4 py-4 md:px-8">
        <Link
          href={`/${locale}/today`}
          className="flex items-center gap-3 rounded-md font-semibold text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Image
            alt=""
            aria-hidden="true"
            height={36}
            src={dashboardBrand.assets.icon}
            width={36}
            className="size-9 rounded-md"
          />
          <span>{brandName}</span>
        </Link>
        <LocaleSwitch
          label={getDashboardMessage(locale, "languageNavigation")}
          options={(["ar", "en"] as const).map((target) => ({
            locale: target,
            href: `/${target}${path}`,
            label: target === "ar" ? "العربية" : "English",
            current: target === locale,
          }))}
        />
      </header>
      <main
        id="main-content"
        aria-labelledby={titleId}
        className="grid place-items-start justify-center px-4 pt-6 pb-16 md:place-items-center md:pt-0"
      >
        <Card className="w-full max-w-md">
          <CardHeader className="gap-2">
            <h1 id={titleId} className="text-2xl leading-tight font-bold text-balance">
              {title}
            </h1>
            {intro ? (
              <p className="text-sm leading-relaxed text-muted-foreground">{intro}</p>
            ) : null}
          </CardHeader>
          <CardContent className="grid gap-5">{children}</CardContent>
          {footer ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-5 pt-4 text-sm">
              {footer}
            </div>
          ) : null}
        </Card>
      </main>
    </div>
  );
}
