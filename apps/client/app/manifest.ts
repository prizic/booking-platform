import type { MetadataRoute } from "next";
import { getDirection } from "@wlbp/i18n";
import { clientBrand } from "./_lib/brand";
import { instanceText } from "./_lib/instance-text";
import { instanceLocalePolicy } from "./_lib/locale-policy";
import { pwaManifestIcons } from "./_lib/pwa-icons";

/**
 * The installable-app manifest, built from the instance: name and language
 * from instance/content in the default locale, colours from brand.json, and
 * icons generated from the brand icon at build time (docs/pwa.md).
 */
export default function manifest(): MetadataRoute.Manifest {
  const locale = instanceLocalePolicy.defaultLocale;
  const text = instanceText(locale);
  const name = text("brand.name");

  return {
    id: "/",
    name,
    short_name: name,
    description: text("site.description"),
    lang: locale,
    dir: getDirection(locale),
    // `/` redirects to the remembered language, otherwise the instance default.
    start_url: "/",
    scope: "/",
    display: "standalone",
    theme_color: clientBrand.tokens.color.primary,
    background_color: clientBrand.tokens.color.background,
    icons: [...pwaManifestIcons],
  };
}
