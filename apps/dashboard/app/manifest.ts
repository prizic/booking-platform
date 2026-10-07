import type { MetadataRoute } from "next";
import { getDirection } from "@wlbp/i18n";
import { dashboardBrand } from "./_lib/brand";
import { getDashboardMessage } from "./_lib/copy";
import { instanceText } from "./_lib/instance-text";
import { instanceLocalePolicy } from "./_lib/locale-policy";
import { pwaMessage } from "./_lib/pwa-copy";
import { pwaManifestIcons } from "./_lib/pwa-icons";

/**
 * The installable workspace manifest: the tenant brand name (instance/content,
 * default locale) plus a localized "Workspace" suffix so it is never confused
 * with the public booking app, brand colours, and icons generated from the
 * brand icon at build time (docs/pwa.md).
 */
export default function manifest(): MetadataRoute.Manifest {
  const locale = instanceLocalePolicy.defaultLocale;
  const name = `${instanceText(locale)("brand.name")} — ${pwaMessage(locale, "appNameSuffix")}`;

  return {
    id: "/",
    name,
    short_name: name,
    description: getDashboardMessage(locale, "summary"),
    lang: locale,
    dir: getDirection(locale),
    // `/` redirects to the remembered language, otherwise the instance default.
    start_url: "/",
    scope: "/",
    display: "standalone",
    theme_color: dashboardBrand.tokens.color.primary,
    background_color: dashboardBrand.tokens.color.background,
    icons: [...pwaManifestIcons],
  };
}
