import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDirection, isLocale, type Locale } from "@wlbp/i18n";
import { AppToaster, QueryProvider } from "@wlbp/ui-foundation";
import { THEME_COOKIE, resolveTheme } from "@wlbp/ui-foundation/preferences";
import { createBrandStyle } from "@wlbp/white-label-ui";
import { cookies } from "next/headers";
import { dashboardBrand } from "../_lib/brand";
import { instanceLocalePolicy } from "../_lib/locale-policy";
import { pwaMessage } from "../_lib/pwa-copy";
import { PwaRegistration } from "../_lib/pwa-registration";
import { getDashboardLocaleMetadata } from "../_lib/site-metadata";
import "../globals.css";

type LocaleLayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>;

export const dynamic = "force-dynamic";

function requireLocale(value: string): Locale {
  if (!isLocale(value)) {
    notFound();
  }

  return value;
}

/** Browser and installed-app chrome take the brand primary colour. */
export const viewport: Viewport = {
  themeColor: dashboardBrand.tokens.colorDark
    ? [
        {
          media: "(prefers-color-scheme: light)",
          color: dashboardBrand.tokens.color.primary,
        },
        {
          media: "(prefers-color-scheme: dark)",
          color: dashboardBrand.tokens.colorDark.primary,
        },
      ]
    : dashboardBrand.tokens.color.primary,
};

export async function generateMetadata({
  params,
}: LocaleLayoutProps): Promise<Metadata> {
  const locale = requireLocale((await params).locale);
  return getDashboardLocaleMetadata(locale);
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const locale = requireLocale((await params).locale);

  const theme = resolveTheme(
    (await cookies()).get(THEME_COOKIE)?.value,
    dashboardBrand.appearance.defaultTheme,
    dashboardBrand.tokens.colorDark !== undefined,
  );

  // Browser extensions can add attributes to the document root before hydration.
  return (
    <html
      lang={locale}
      dir={getDirection(locale)}
      className={theme === "dark" ? "dark" : undefined}
      style={createBrandStyle(dashboardBrand.tokens)}
      suppressHydrationWarning
    >
      <body>
        <QueryProvider>{children}</QueryProvider>
        <AppToaster locale={locale} />
        <PwaRegistration
          defaultLocale={instanceLocalePolicy.defaultLocale}
          version={process.env.WLBP_PWA_VERSION ?? "dev"}
          labels={{
            title: pwaMessage(locale, "updateTitle"),
            body: pwaMessage(locale, "updateBody"),
            accept: pwaMessage(locale, "updateAccept"),
            dismiss: pwaMessage(locale, "updateDismiss"),
          }}
        />
      </body>
    </html>
  );
}
