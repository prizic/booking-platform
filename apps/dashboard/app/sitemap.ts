import type { MetadataRoute } from "next";
import { instanceLocalePolicy } from "./_lib/locale-policy";
import { getDashboardSiteOrigin } from "./_lib/site-origin";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getDashboardSiteOrigin();
  const routes = ["", "/brand-preview", "/team-resources"] as const;

  return routes.flatMap((route) =>
    instanceLocalePolicy.supportedLocales.map((locale) => ({
      url: new URL(`/${locale}${route}`, origin).toString(),
      alternates: {
        languages: {
          en: new URL(`/en${route}`, origin).toString(),
          ar: new URL(`/ar${route}`, origin).toString(),
          "x-default": new URL(
            `/${instanceLocalePolicy.defaultLocale}${route}`,
            origin,
          ).toString(),
        },
      },
    })),
  );
}
