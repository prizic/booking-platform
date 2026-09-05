import type { MetadataRoute } from "next";
import { instanceLocalePolicy } from "./_lib/locale-policy";
import { getDashboardSiteOrigin } from "./_lib/site-origin";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getDashboardSiteOrigin();

  return instanceLocalePolicy.supportedLocales.map((locale) => ({
    url: new URL(`/${locale}`, origin).toString(),
    alternates: {
      languages: {
        en: new URL("/en", origin).toString(),
        ar: new URL("/ar", origin).toString(),
        "x-default": new URL(
          `/${instanceLocalePolicy.defaultLocale}`,
          origin,
        ).toString(),
      },
    },
  }));
}
