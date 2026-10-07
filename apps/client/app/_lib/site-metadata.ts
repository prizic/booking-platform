import type { Metadata } from "next";
import type { Locale } from "@wlbp/i18n";
import { clientBrand } from "./brand";
import { instanceText } from "./instance-text";
import { instanceLocalePolicy } from "./locale-policy";
import { getClientSiteOrigin } from "./site-origin";

export function getClientLocaleMetadata(locale: Locale): Metadata {
  const siteOrigin = getClientSiteOrigin();
  const text = instanceText(locale);

  return {
    metadataBase: siteOrigin,
    title: text("site.title"),
    description: text("site.description"),
    icons: {
      icon: clientBrand.assets.favicon,
      apple: clientBrand.assets.icon,
    },
    openGraph: {
      images: [new URL(clientBrand.assets.socialImage, siteOrigin)],
      siteName: text("brand.name"),
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
