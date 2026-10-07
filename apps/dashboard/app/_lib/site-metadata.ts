import type { Metadata } from "next";
import type { Locale } from "@wlbp/i18n";
import { dashboardBrand } from "./brand";
import { getDashboardMessage } from "./copy";
import { instanceLocalePolicy } from "./locale-policy";
import { pwaAppleTouchIcon } from "./pwa-icons";
import { getDashboardSiteOrigin } from "./site-origin";

export function getDashboardLocaleMetadata(locale: Locale): Metadata {
  const siteOrigin = getDashboardSiteOrigin();

  return {
    metadataBase: siteOrigin,
    title: `${dashboardBrand.name} — ${getDashboardMessage(locale, "title")}`,
    description: getDashboardMessage(locale, "summary"),
    icons: {
      icon: dashboardBrand.assets.favicon,
      // Opaque 180 px icon generated from the brand icon (iOS shows transparent areas as black).
      apple: pwaAppleTouchIcon,
    },
    manifest: "/manifest.webmanifest",
    openGraph: {
      images: [new URL(dashboardBrand.assets.socialImage, siteOrigin)],
      siteName: dashboardBrand.name,
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
