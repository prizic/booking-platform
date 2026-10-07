/** Display locale for Intl: Arabic uses Arabic-Indic digits, matching every app. */
export function intlLocale(locale: string): string {
  return locale === "ar" || locale.startsWith("ar-") ? "ar-u-nu-arab" : locale;
}
