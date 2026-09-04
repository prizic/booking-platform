import type { Locale } from "@wlbp/i18n";

export type AdminMessageKey =
  | "eyebrow"
  | "title"
  | "summary"
  | "privateStatus"
  | "fleetTitle"
  | "tenantRegistry"
  | "releaseChannels"
  | "platformHealth"
  | "pendingJobs"
  | "activeInstances"
  | "operatorNotice"
  | "brandLabel"
  | "platformOperations"
  | "languageNavigation"
  | "languageEnglish"
  | "languageArabic"
  | "systemReady"
  | "healthReady"
  | "notFoundTitle"
  | "returnHome"
  | "controlCode"
  | "notFoundCode";

const adminCopy: Record<Locale, Record<AdminMessageKey, string>> = {
  en: {
    eyebrow: "Private control plane",
    title: "Operate the fleet from one guarded surface.",
    summary:
      "Provisioning, releases, tenant health, and support access stay separate from every distributed instance.",
    privateStatus: "Platform-only shell",
    fleetTitle: "Fleet overview",
    tenantRegistry: "Tenant and instance registry",
    releaseChannels: "Release channels",
    platformHealth: "Platform health",
    pendingJobs: "Pending jobs",
    activeInstances: "Active instances",
    operatorNotice:
      "Operator authentication and live fleet data arrive in later M1 issues.",
    brandLabel: "Atlas platform operations",
    platformOperations: "Platform operations",
    languageNavigation: "Language",
    languageEnglish: "English",
    languageArabic: "Arabic",
    systemReady: "System ready",
    healthReady: "Ready",
    notFoundTitle: "Control surface not found",
    returnHome: "Return to the control plane",
    controlCode: "Control / 001",
    notFoundCode: "404 / Private",
  },
  ar: {
    eyebrow: "لوحة تحكم خاصة بالمنصة",
    title: "أدِر الأسطول من واجهة واحدة محمية.",
    summary:
      "تبقى عمليات التهيئة والإصدارات وصحة المستأجر ووصول الدعم منفصلة عن كل نسخة موزّعة.",
    privateStatus: "واجهة خاصة بالمنصة",
    fleetTitle: "نظرة عامة على الأسطول",
    tenantRegistry: "سجل المستأجرين والنسخ",
    releaseChannels: "قنوات الإصدار",
    platformHealth: "صحة المنصة",
    pendingJobs: "المهام المعلّقة",
    activeInstances: "النسخ النشطة",
    operatorNotice:
      "تصل مصادقة المشغل وبيانات الأسطول المباشرة في مهام لاحقة ضمن المرحلة الأولى.",
    brandLabel: "عمليات منصة أطلس",
    platformOperations: "عمليات المنصة",
    languageNavigation: "اللغة",
    languageEnglish: "الإنجليزية",
    languageArabic: "العربية",
    systemReady: "النظام جاهز",
    healthReady: "جاهز",
    notFoundTitle: "واجهة التحكم غير موجودة",
    returnHome: "العودة إلى لوحة تحكم المنصة",
    controlCode: "تحكم / ٠٠١",
    notFoundCode: "٤٠٤ / خاص",
  },
};

export function getAdminMessage(locale: Locale, key: AdminMessageKey) {
  return adminCopy[locale][key];
}
