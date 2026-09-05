import type { Locale } from "@wlbp/i18n";

export type DashboardMessageKey =
  | "eyebrow"
  | "title"
  | "summary"
  | "status"
  | "navToday"
  | "navCalendar"
  | "navBookings"
  | "navCustomers"
  | "navBrand"
  | "metricArrivals"
  | "metricRequests"
  | "metricPayments"
  | "scheduleTitle"
  | "scheduleEmpty"
  | "listAlternative"
  | "openCalendar"
  | "gridView"
  | "listView"
  | "viewSelector"
  | "viewChangedGrid"
  | "viewChangedList"
  | "timeZoneLabel"
  | "scheduleConsultation"
  | "scheduleFollowUp"
  | "statusConfirmed"
  | "statusRequested"
  | "primaryNavigation"
  | "languageNavigation"
  | "languageEnglish"
  | "languageArabic"
  | "brandLabel"
  | "todaySummary"
  | "notFoundTitle"
  | "returnHome";

export const dashboardCopy: Record<Locale, Record<DashboardMessageKey, string>> = {
  en: {
    eyebrow: "Tenant staff workspace",
    title: "Today stays clear, even when the schedule is full.",
    summary:
      "One operational view for arrivals, booking requests, payments, and exceptions.",
    status: "Dashboard shell ready",
    navToday: "Today",
    navCalendar: "Calendar",
    navBookings: "Bookings",
    navCustomers: "Customers",
    navBrand: "Brand & site",
    metricArrivals: "Today's arrivals",
    metricRequests: "Pending requests",
    metricPayments: "Payments needing action",
    scheduleTitle: "Next in the day",
    scheduleEmpty: "No live tenant data is connected in this foundation build.",
    listAlternative: "Accessible schedule list",
    openCalendar: "Open calendar",
    gridView: "Grid view",
    listView: "List view",
    viewSelector: "Schedule view",
    viewChangedGrid: "Schedule shown as a compact grid.",
    viewChangedList: "Schedule shown as an accessible list.",
    timeZoneLabel: "Time zone",
    scheduleConsultation: "Initial consultation · Layla Hassan",
    scheduleFollowUp: "Follow-up · Omar Kareem",
    statusConfirmed: "Confirmed",
    statusRequested: "Requested",
    primaryNavigation: "Primary navigation",
    languageNavigation: "Language",
    languageEnglish: "English",
    languageArabic: "Arabic",
    brandLabel: "Nawa operations",
    todaySummary: "Today summary",
    notFoundTitle: "Workspace not found",
    returnHome: "Return to the workspace",
  },
  ar: {
    eyebrow: "مساحة عمل فريق المستأجر",
    title: "يبقى يومك واضحًا حتى عندما يمتلئ الجدول.",
    summary: "واجهة تشغيلية واحدة للوصول والطلبات والمدفوعات والاستثناءات.",
    status: "واجهة لوحة التحكم جاهزة",
    navToday: "اليوم",
    navCalendar: "التقويم",
    navBookings: "الحجوزات",
    navCustomers: "العملاء",
    navBrand: "الهوية والموقع",
    metricArrivals: "وصول اليوم",
    metricRequests: "الطلبات المعلّقة",
    metricPayments: "مدفوعات تتطلب إجراءً",
    scheduleTitle: "التالي خلال اليوم",
    scheduleEmpty: "لا توجد بيانات مستأجر مباشرة متصلة في إصدار التأسيس هذا.",
    listAlternative: "قائمة الجدول الميسّرة",
    openCalendar: "فتح التقويم",
    gridView: "عرض شبكي",
    listView: "عرض كقائمة",
    viewSelector: "طريقة عرض الجدول",
    viewChangedGrid: "يُعرض الجدول في شبكة مختصرة.",
    viewChangedList: "يُعرض الجدول في قائمة ميسّرة.",
    timeZoneLabel: "المنطقة الزمنية",
    scheduleConsultation: "استشارة أولية · ليلى حسن",
    scheduleFollowUp: "متابعة · عمر كريم",
    statusConfirmed: "مؤكد",
    statusRequested: "قيد الطلب",
    primaryNavigation: "التنقل الرئيسي",
    languageNavigation: "اللغة",
    languageEnglish: "الإنجليزية",
    languageArabic: "العربية",
    brandLabel: "عمليات نوى",
    todaySummary: "ملخص اليوم",
    notFoundTitle: "مساحة العمل غير موجودة",
    returnHome: "العودة إلى مساحة العمل",
  },
};

export function getDashboardMessage(locale: Locale, key: DashboardMessageKey) {
  return dashboardCopy[locale][key];
}
