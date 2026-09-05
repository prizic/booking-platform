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
  | "appointmentLabel"
  | "timezoneLabel"
  | "priceLabel"
  | "customerNameLabel"
  | "customerNameDescription"
  | "submitAction"
  | "errorSummaryTitle"
  | "nameRequired"
  | "successMessage"
  | "notFoundTitle"
  | "returnHome";

export const clientCopy: Record<Locale, Record<ClientMessageKey, string>> = {
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
    appointmentLabel: "Selected appointment",
    timezoneLabel: "Time zone",
    priceLabel: "Total",
    customerNameLabel: "Your name",
    customerNameDescription: "Used to identify this booking preview.",
    submitAction: "Review booking",
    errorSummaryTitle: "We could not review your booking",
    nameRequired: "Enter your name to continue.",
    successMessage: "Booking preview ready for {name}.",
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
    appointmentLabel: "الموعد المحدد",
    timezoneLabel: "المنطقة الزمنية",
    priceLabel: "الإجمالي",
    customerNameLabel: "اسمك",
    customerNameDescription: "يُستخدم للتعرّف على معاينة هذا الحجز.",
    submitAction: "مراجعة الحجز",
    errorSummaryTitle: "تعذّرت مراجعة حجزك",
    nameRequired: "أدخل اسمك للمتابعة.",
    successMessage: "معاينة الحجز جاهزة باسم {name}.",
    notFoundTitle: "الصفحة غير موجودة",
    returnHome: "العودة إلى الحجز",
  },
};

export function getClientMessage(locale: Locale, key: ClientMessageKey) {
  return clientCopy[locale][key];
}
