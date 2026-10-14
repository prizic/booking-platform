import type { MetadataRoute } from "next";
import { instanceLocalePolicy } from "./_lib/locale-policy";
import { getClientSiteOrigin } from "./_lib/site-origin";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getClientSiteOrigin();

  return ["", "/services", "/about", "/contact"].flatMap((path) =>
    instanceLocalePolicy.supportedLocales.map((locale) => ({
      url: new URL(`/${locale}${path}`, origin).toString(),
      alternates: {
        languages: {
          en: new URL(`/en${path}`, origin).toString(),
          ar: new URL(`/ar${path}`, origin).toString(),
          "x-default": new URL(
            `/${instanceLocalePolicy.defaultLocale}${path}`,
            origin,
          ).toString(),
        },
      },
    })),
  );
}
