import type { Locale } from "@wlbp/i18n";
import type { Metadata } from "next";

import { instanceLocalePolicy } from "./locale-policy";
import { getDashboardSiteOrigin } from "./site-origin";
import { getTeamResourcesMessage } from "./team-resources-copy";

export function getTeamResourcesMetadata(locale: Locale): Metadata {
  const siteOrigin = getDashboardSiteOrigin();

  return {
    title: getTeamResourcesMessage(locale, "title"),
    description: getTeamResourcesMessage(locale, "summary"),
    alternates: {
      canonical: new URL(`/${locale}/team-resources`, siteOrigin),
      languages: {
        en: new URL("/en/team-resources", siteOrigin),
        ar: new URL("/ar/team-resources", siteOrigin),
        "x-default": new URL(
          `/${instanceLocalePolicy.defaultLocale}/team-resources`,
          siteOrigin,
        ),
      },
    },
  };
}
