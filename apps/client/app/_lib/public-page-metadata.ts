import type { Metadata } from "next";
import type { Locale } from "@wlbp/i18n";
import { journeyMessage } from "./journey-copy";
import { loadPublishedSiteContent } from "./published-site-content";
import { getClientSiteOrigin } from "./site-origin";
import { instanceLocalePolicy } from "./locale-policy";

/** Route-aware metadata uses only validated published identity; missing public
 * content never falls back to another tenant's static title. */
export async function getPublicPageMetadata(
  locale: Locale,
  path: string,
  titleKey: "services" | "about" | "contact" | "findBooking",
): Promise<Metadata> {
  const origin = getClientSiteOrigin();
  const published = await loadPublishedSiteContent();
  const name =
    published.outcome === "ready" ? published.content.title?.[locale] : undefined;
  const title = journeyMessage(locale, titleKey);
  return {
    title: name ? `${title} · ${name}` : title,
    alternates: {
      canonical: new URL(`/${locale}${path}`, origin),
      languages: {
        en: new URL(`/en${path}`, origin),
        ar: new URL(`/ar${path}`, origin),
        "x-default": new URL(`/${instanceLocalePolicy.defaultLocale}${path}`, origin),
      },
    },
    openGraph: { title, ...(name ? { siteName: name } : {}) },
  };
}
