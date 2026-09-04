import { isLocale, type Locale } from "@wlbp/i18n";

import source from "../../instance-locale-policy.json";

if (
  !isLocale(source.defaultLocale) ||
  source.supportedLocales.length === 0 ||
  source.supportedLocales.some((locale) => !isLocale(locale)) ||
  !source.supportedLocales.includes(source.defaultLocale)
) {
  throw new Error("Generated Dashboard locale policy is invalid");
}

export const instanceLocalePolicy = Object.freeze({
  defaultLocale: source.defaultLocale,
  supportedLocales: Object.freeze([...source.supportedLocales]) as readonly Locale[],
});
