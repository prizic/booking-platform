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
  | "returnHome"
  | "availabilityTitle"
  | "availabilitySummary"
  | "availabilityDateLabel"
  | "availabilityTimeZoneLabel"
  | "availabilityPartySizeLabel"
  | "availabilitySearch"
  | "availabilitySearching"
  | "availabilityResults"
  | "availabilityEmpty"
  | "availabilityEmptyAction"
  | "availabilityErrorTitle"
  | "availabilityError"
  | "availabilityRetry"
  | "availabilityAdvisory"
  | "availabilityLocationTimeZone"
  | "availabilitySelect"
  | "availabilitySelected"
  | "availabilitySelectedAnnouncement"
  | "availabilityUnavailable"
  | "availabilityNoSlotsCapacity"
  | "availabilityNoSlotsMatching"
  | "availabilityNoSlotsWindow"
  | "availabilityNoSlotsPolicy";

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
    availabilityTitle: "Find an available time",
    availabilitySummary: "Search a seven-day window in the timezone you prefer.",
    availabilityDateLabel: "Starting date",
    availabilityTimeZoneLabel: "Your timezone",
    availabilityPartySizeLabel: "Guests",
    availabilitySearch: "Find times",
    availabilitySearching: "Finding available times",
    availabilityResults: "Available times",
    availabilityEmpty: "No times matched this search.",
    availabilityEmptyAction: "Try another date or timezone.",
    availabilityErrorTitle: "We could not load available times",
    availabilityError:
      "Availability is temporarily unavailable. Your booking has not changed.",
    availabilityRetry: "Try again",
    availabilityAdvisory: "Times can change until your booking is confirmed.",
    availabilityLocationTimeZone: "Service timezone",
    availabilitySelect: "Select",
    availabilitySelected: "Selected",
    availabilitySelectedAnnouncement:
      "Selected {time}. Availability will be checked again before confirmation.",
    availabilityUnavailable: "Choose a published service before searching for a time.",
    availabilityNoSlotsCapacity: "Those times no longer have enough capacity.",
    availabilityNoSlotsMatching: "No bookable times match this search.",
    availabilityNoSlotsWindow: "These dates are outside the booking window.",
    availabilityNoSlotsPolicy: "The current booking policy does not allow these times.",
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
    availabilityTitle: "ابحث عن وقت متاح",
    availabilitySummary: "ابحث ضمن سبعة أيام بالمنطقة الزمنية التي تفضلها.",
    availabilityDateLabel: "تاريخ البدء",
    availabilityTimeZoneLabel: "منطقتك الزمنية",
    availabilityPartySizeLabel: "عدد الضيوف",
    availabilitySearch: "البحث عن أوقات",
    availabilitySearching: "جارٍ البحث عن الأوقات المتاحة",
    availabilityResults: "الأوقات المتاحة",
    availabilityEmpty: "لا توجد أوقات مطابقة لهذا البحث.",
    availabilityEmptyAction: "جرّب تاريخًا أو منطقة زمنية أخرى.",
    availabilityErrorTitle: "تعذر تحميل الأوقات المتاحة",
    availabilityError: "التوافر غير متاح مؤقتًا. لم يتغير حجزك.",
    availabilityRetry: "إعادة المحاولة",
    availabilityAdvisory: "قد تتغير الأوقات حتى يتم تأكيد حجزك.",
    availabilityLocationTimeZone: "المنطقة الزمنية للخدمة",
    availabilitySelect: "اختيار",
    availabilitySelected: "تم الاختيار",
    availabilitySelectedAnnouncement:
      "تم اختيار {time}. سيُتحقق من التوافر مرة أخرى قبل التأكيد.",
    availabilityUnavailable: "اختر خدمة منشورة قبل البحث عن وقت.",
    availabilityNoSlotsCapacity: "لم تعد السعة كافية في هذه الأوقات.",
    availabilityNoSlotsMatching: "لا توجد أوقات قابلة للحجز تطابق هذا البحث.",
    availabilityNoSlotsWindow: "تقع هذه التواريخ خارج نافذة الحجز.",
    availabilityNoSlotsPolicy: "لا تسمح سياسة الحجز الحالية بهذه الأوقات.",
  },
};

export function getClientMessage(locale: Locale, key: ClientMessageKey) {
  return clientCopy[locale][key];
}
