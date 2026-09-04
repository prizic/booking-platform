import type { Locale } from "@wlbp/i18n";

export type ClientMessageKey =
  | "eyebrow"
  | "title"
  | "summary"
  | "stepDiscover"
  | "stepChoose"
  | "stepConfirm"
  | "status"
  | "timezone"
  | "primaryAction"
  | "secondaryAction"
  | "previewLabel"
  | "languageNavigation"
  | "languageEnglish"
  | "languageArabic"
  | "notFoundTitle"
  | "returnHome";

const clientCopy: Record<Locale, Record<ClientMessageKey, string>> = {
  en: {
    eyebrow: "Public booking experience",
    title: "Book the right time, without the back-and-forth.",
    summary: "A calm, accessible path from service discovery to a confirmed booking.",
    stepDiscover: "Discover a service",
    stepChoose: "Choose a valid time",
    stepConfirm: "Review and confirm",
    status: "Booking client shell ready",
    timezone: "Times are shown in Asia/Riyadh",
    primaryAction: "Explore services",
    secondaryAction: "Manage a booking",
    previewLabel: "Booking journey preview",
    languageNavigation: "Language",
    languageEnglish: "English",
    languageArabic: "Arabic",
    notFoundTitle: "Page not found",
    returnHome: "Return to booking",
  },
  ar: {
    eyebrow: "تجربة الحجز العامة",
    title: "احجز الموعد المناسب دون مراسلات متكررة.",
    summary: "مسار هادئ وميسّر يبدأ باكتشاف الخدمة وينتهي بحجز مؤكّد.",
    stepDiscover: "اكتشف خدمة",
    stepChoose: "اختر وقتًا متاحًا",
    stepConfirm: "راجع وأكّد",
    status: "واجهة تطبيق الحجز جاهزة",
    timezone: "تُعرض الأوقات حسب توقيت آسيا/الرياض",
    primaryAction: "استكشف الخدمات",
    secondaryAction: "إدارة حجز",
    previewLabel: "معاينة رحلة الحجز",
    languageNavigation: "اللغة",
    languageEnglish: "الإنجليزية",
    languageArabic: "العربية",
    notFoundTitle: "الصفحة غير موجودة",
    returnHome: "العودة إلى الحجز",
  },
};

export function getClientMessage(locale: Locale, key: ClientMessageKey) {
  return clientCopy[locale][key];
}
