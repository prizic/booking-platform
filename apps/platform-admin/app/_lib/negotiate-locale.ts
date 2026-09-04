import { isLocale, type Locale } from "@wlbp/i18n";

export function negotiateLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) {
    return "en";
  }

  const preferences = acceptLanguage
    .split(",")
    .map((entry, position) => {
      const [rawTag, ...parameters] = entry.trim().split(";");
      const primaryTag = rawTag?.toLowerCase().split("-")[0];

      if (!isLocale(primaryTag)) {
        return null;
      }

      const qualityParameter = parameters.find((parameter) =>
        parameter.trim().startsWith("q="),
      );
      const quality = qualityParameter
        ? Number.parseFloat(qualityParameter.trim().slice(2))
        : 1;

      return Number.isFinite(quality) && quality > 0
        ? { locale: primaryTag, quality: Math.min(quality, 1), position }
        : null;
    })
    .filter(
      (
        preference,
      ): preference is { locale: Locale; quality: number; position: number } =>
        preference !== null,
    )
    .sort(
      (first, second) =>
        second.quality - first.quality || first.position - second.position,
    );

  return preferences[0]?.locale ?? "en";
}
