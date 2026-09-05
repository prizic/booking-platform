import type { Metadata } from "next";
import type { Locale } from "@wlbp/i18n";
import { clientBrand } from "./brand";
import { getClientMessage } from "./copy";
import { instanceLocalePolicy } from "./locale-policy";
import { getClientSiteOrigin } from "./site-origin";

export function getClientLocaleMetadata(locale: Locale): Metadata {
  const siteOrigin = getClientSiteOrigin();

  return {
    metadataBase: siteOrigin,
    title: `${clientBrand.name} — ${getClientMessage(locale, "title")}`,
    description: getClientMessage(locale, "summary"),
    icons: {
      icon: clientBrand.assets.favicon,
      apple: clientBrand.assets.icon,
    },
    openGraph: {
      images: [new URL(clientBrand.assets.socialImage, siteOrigin)],
      siteName: clientBrand.name,
    },
    alternates: {
      canonical: new URL(`/${locale}`, siteOrigin),
      languages: {
        en: new URL("/en", siteOrigin),
        ar: new URL("/ar", siteOrigin),
        "x-default": new URL(`/${instanceLocalePolicy.defaultLocale}`, siteOrigin),
      },
    },
  };
}
