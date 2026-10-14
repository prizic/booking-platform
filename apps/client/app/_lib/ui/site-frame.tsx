import { formatNumber, type Locale } from "@wlbp/i18n";
import { Button, LocaleSwitch, ThemeToggle } from "@wlbp/ui-foundation";
import { THEME_COOKIE, resolveTheme } from "@wlbp/ui-foundation/preferences";
import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { clientBrand } from "../brand";
import { getClientMessage } from "../copy";
import { instanceText } from "../instance-text";
import { journeyMessage } from "../journey-copy";
import { loadPublishedSiteContent } from "../published-site-content";
import { publicChannelLinks } from "../public-channel-links";

/** Each language is named in itself, so a visitor can always find their own. */
const localeNames: Readonly<Record<Locale, string>> = {
  ar: "العربية",
  en: "English",
};

const localeOrder: readonly Locale[] = ["ar", "en"];

const darkAvailable = clientBrand.tokens.colorDark !== undefined;

/** The one content width shared by the header, page sections and footer. */
export const siteContainerClass = "mx-auto w-full max-w-6xl px-4 md:px-6";
const containerClass = siteContainerClass;

interface SiteFrameProps {
  readonly children: ReactNode;
  readonly locale: Locale;
  /**
   * Path after the locale that the language switch keeps, e.g. "/book".
   * Token-bearing pages pass "" so a secret never appears in a link.
   */
  readonly switchPath?: string;
}

/**
 * The public Client chrome: brand header, the page's
 * main landmark, and footer. Optional tenant identity/channels/store links
 * come only from the routed brand's current published revision.
 */
export async function SiteFrame({ children, locale, switchPath = "" }: SiteFrameProps) {
  const text = instanceText(locale);
  const message = (key: Parameters<typeof getClientMessage>[1]) =>
    getClientMessage(locale, key);
  const theme = resolveTheme(
    (await cookies()).get(THEME_COOKIE)?.value,
    clientBrand.appearance.defaultTheme,
    darkAvailable,
  );
  const published = await loadPublishedSiteContent();
  const content = published.outcome === "ready" ? published.content : undefined;
  const brandName = content?.title?.[locale] ?? journeyMessage(locale, "brandFallback");
  const channels = publicChannelLinks(content?.contact);
  const navItems = [
    { path: "/services", key: "services" as const },
    { path: "/about", key: "about" as const },
    { path: "/contact", key: "contact" as const },
    { path: "/find-booking", key: "findBooking" as const },
  ];
  const year = formatNumber(new Date().getUTCFullYear(), locale, {
    useGrouping: false,
  });

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-card px-4 py-3 text-sm font-semibold text-foreground shadow-lg focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:outline-none focus:ring-[3px] focus:ring-ring/50"
      >
        {message("skipToContent")}
      </a>
      <header className="border-b bg-card">
        <div
          className={`${containerClass} flex min-h-16 flex-wrap items-center gap-x-6 gap-y-2 py-3`}
        >
          <Link
            href={`/${locale}`}
            className="me-auto flex min-w-0 items-center gap-3 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {/* The deployed validated brand mark; published identity is read per request. */}
            <Image
              alt=""
              className="size-9 shrink-0 rounded-md"
              height={72}
              priority
              src={clientBrand.assets.icon}
              width={72}
            />
            <span className="truncate text-base font-bold">{brandName}</span>
          </Link>
          <nav
            aria-label={message("siteNavigation")}
            className="order-last flex w-full flex-wrap items-center gap-1 md:order-none md:w-auto"
          >
            {navItems.map((item) => (
              <Button key={item.path} asChild variant="ghost" size="sm">
                <Link
                  href={`/${locale}${item.path}`}
                  aria-current={switchPath === item.path ? "page" : undefined}
                >
                  {journeyMessage(locale, item.key)}
                </Link>
              </Button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <LocaleSwitch
              label={message("languageNavigation")}
              options={localeOrder.map((option) => ({
                current: option === locale,
                href: `/${option}${switchPath}`,
                label: localeNames[option],
                locale: option,
              }))}
            />
            {darkAvailable ? (
              <ThemeToggle
                initialTheme={theme}
                labels={{
                  toDark: message("themeToDark"),
                  toLight: message("themeToLight"),
                }}
              />
            ) : null}
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>

      <footer id="contact" className="mt-16 border-t bg-card">
        <div className={`${containerClass} grid gap-8 py-10 md:grid-cols-2`}>
          <div className="grid content-start gap-2">
            <p className="text-base font-bold">{brandName}</p>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              {journeyMessage(locale, "footerIntro")}
            </p>
          </div>
          <div className="grid content-start gap-3">
            <h2 className="text-sm font-semibold">
              {journeyMessage(locale, "contact")}
            </h2>
            <div className="flex flex-wrap gap-2">
              {channels.email ? (
                <Button asChild variant="outline" size="sm">
                  <a href={channels.email} rel="noreferrer">
                    {journeyMessage(locale, "emailAction")}
                  </a>
                </Button>
              ) : null}
              {channels.phone ? (
                <Button asChild variant="outline" size="sm">
                  <a href={channels.phone} rel="noreferrer">
                    {journeyMessage(locale, "call")}
                  </a>
                </Button>
              ) : null}
              {channels.whatsapp ? (
                <Button asChild variant="outline" size="sm">
                  <a href={channels.whatsapp} rel="noreferrer">
                    {journeyMessage(locale, "whatsappAction")}
                  </a>
                </Button>
              ) : null}
              <Button asChild variant="ghost" size="sm">
                <Link href={`/${locale}/contact`}>
                  {journeyMessage(locale, "contactBusiness")}
                </Link>
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {content?.appStores?.appStoreUrl ? (
                <Button asChild variant="outline">
                  <a href={content.appStores.appStoreUrl} rel="noreferrer">
                    {journeyMessage(locale, "appStore")}
                  </a>
                </Button>
              ) : null}
              {content?.appStores?.googlePlayUrl ? (
                <Button asChild variant="outline">
                  <a href={content.appStores.googlePlayUrl} rel="noreferrer">
                    {journeyMessage(locale, "googlePlay")}
                  </a>
                </Button>
              ) : null}
            </div>
            {content?.legal?.privacyUrl || content?.legal?.termsUrl ? (
              <div className="flex flex-wrap gap-2">
                {content.legal.privacyUrl ? (
                  <Button asChild variant="link">
                    <a href={content.legal.privacyUrl} rel="noreferrer">
                      {journeyMessage(locale, "privacy")}
                    </a>
                  </Button>
                ) : null}
                {content.legal.termsUrl ? (
                  <Button asChild variant="link">
                    <a href={content.legal.termsUrl} rel="noreferrer">
                      {journeyMessage(locale, "terms")}
                    </a>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="border-t">
          <div
            className={`${containerClass} flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4 text-xs text-muted-foreground`}
          >
            <p>{text("footer.rights", { name: brandName, year })}</p>
            <Link
              href={`/${locale}/install`}
              className="inline-flex min-h-6 items-center rounded-sm font-semibold underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {text("footer.installApp")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
