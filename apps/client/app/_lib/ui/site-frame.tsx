import { formatNumber, type Locale } from "@wlbp/i18n";
import { LocaleSwitch, ThemeToggle } from "@wlbp/ui-foundation";
import { THEME_COOKIE, resolveTheme } from "@wlbp/ui-foundation/preferences";
import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { clientBrand } from "../brand";
import { getClientMessage } from "../copy";
import { instanceText } from "../instance-text";

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
 * main landmark, and the tenant footer. Every tenant-facing word comes from
 * the instance content files.
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
  const brandName = text("brand.name");
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
            {/* The brand mark (instance/assets/icon.png) beside the localized name
                from instance/content: one source for every tenant. */}
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
            className="hidden items-center gap-1 md:flex"
          >
            <Link
              href={`/${locale}#services`}
              className="rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {text("navigation.services")}
            </Link>
            <Link
              href={`/${locale}#contact`}
              className="rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {text("navigation.contact")}
            </Link>
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
              {text("brand.tagline")}
            </p>
          </div>
          <div className="grid content-start gap-2">
            <h2 className="text-sm font-semibold">{text("footer.contact.title")}</h2>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              {text("footer.contact.body")}
            </p>
          </div>
        </div>
        <div className="border-t">
          <p className={`${containerClass} py-4 text-xs text-muted-foreground`}>
            {text("footer.rights", { name: brandName, year })}
          </p>
        </div>
      </footer>
    </div>
  );
}
