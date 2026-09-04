import { isLocale, type Locale } from "@wlbp/i18n";

type Preference = {
  locale: Locale;
  quality: number;
  position: number;
};

type LocalePolicy = Readonly<{
  defaultLocale: Locale;
  supportedLocales: readonly Locale[];
}>;

export function negotiateLocale(
  acceptLanguage: string | null,
  policy: LocalePolicy,
): Locale {
  if (!acceptLanguage) {
    return policy.defaultLocale;
  }

  const preferences = acceptLanguage
    .split(",")
    .map((entry, position): Preference | null => {
      const [rawTag, ...parameters] = entry.trim().split(";");
      const primaryTag = rawTag?.toLowerCase().split("-")[0];

      if (!isLocale(primaryTag) || !policy.supportedLocales.includes(primaryTag)) {
        return null;
      }

      const qualityParameter = parameters.find((parameter) =>
        parameter.trim().startsWith("q="),
      );
      const quality = qualityParameter
        ? Number.parseFloat(qualityParameter.trim().slice(2))
        : 1;

      if (!Number.isFinite(quality) || quality <= 0) {
        return null;
      }

      return { locale: primaryTag, quality: Math.min(quality, 1), position };
    })
    .filter((preference): preference is Preference => preference !== null)
    .sort(
      (first, second) =>
        second.quality - first.quality || first.position - second.position,
    );

  return preferences[0]?.locale ?? policy.defaultLocale;
}
