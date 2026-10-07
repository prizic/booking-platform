import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDirection, isLocale, type Locale } from "@wlbp/i18n";
import { THEME_COOKIE, resolveTheme } from "@wlbp/ui-foundation/preferences";
import { cookies } from "next/headers";
import { say, shellCopy } from "../_lib/copy";
import "../globals.css";

type LocaleLayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>;

export const dynamic = "force-dynamic";

function requireLocale(value: string): Locale {
  if (!isLocale(value)) notFound();
  return value;
}

export async function generateMetadata({
  params,
}: LocaleLayoutProps): Promise<Metadata> {
  const locale = requireLocale((await params).locale);
  return {
    title: {
      default: `${say(locale, shellCopy.brand)} · ${say(locale, shellCopy.brandDetail)}`,
      template: `%s · ${say(locale, shellCopy.brand)}`,
    },
    robots: { index: false, follow: false },
  };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const locale = requireLocale((await params).locale);
  const theme = resolveTheme((await cookies()).get(THEME_COOKIE)?.value, "light", true);
  return (
    <html
      lang={locale}
      dir={getDirection(locale)}
      className={theme === "dark" ? "dark" : undefined}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
