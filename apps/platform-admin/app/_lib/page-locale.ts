import { isLocale, type Locale } from "@wlbp/i18n";
import { notFound } from "next/navigation";

export async function pageLocale(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return locale;
}
