import type { MetadataRoute } from "next";
import { instanceLocalePolicy } from "./_lib/locale-policy";

const fallbackOrigin = "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? fallbackOrigin);

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
