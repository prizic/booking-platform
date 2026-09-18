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
  | "notFoundCode"
  | "loginTitle"
  | "loginEmailLabel"
  | "loginPasswordLabel"
  | "loginSubmit"
  | "loginMfaCodeLabel"
  | "loginMfaSubmit"
  | "loginErrorTitle"
  | "mfaEnrollTitle"
  | "mfaEnrollInstructions"
  | "mfaEnrollSecretLabel"
  | "mfaEnrollCodeLabel"
  | "mfaEnrollSubmit"
  | "mfaEnrollErrorTitle"
  | "signOut"
  | "createTenantTitle"
  | "tenantNameLabel"
  | "tenantBrandKeyLabel"
  | "tenantBrandKeyDescription"
  | "createTenantSubmit"
  | "createTenantErrorTitle"
  | "createTenantSuccess";

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
    loginTitle: "Sign in to the control plane",
    loginEmailLabel: "Email",
    loginPasswordLabel: "Password",
    loginSubmit: "Sign in",
    loginMfaCodeLabel: "6-digit authenticator code",
    loginMfaSubmit: "Verify",
    loginErrorTitle: "Sign-in failed",
    mfaEnrollTitle: "Set up your authenticator app",
    mfaEnrollInstructions:
      "Scan this key with an authenticator app, then enter the 6-digit code it shows to finish enrollment.",
    mfaEnrollSecretLabel: "Setup key",
    mfaEnrollCodeLabel: "6-digit code",
    mfaEnrollSubmit: "Verify and enable",
    mfaEnrollErrorTitle: "Could not enroll",
    signOut: "Sign out",
    createTenantTitle: "Register a new tenant",
    tenantNameLabel: "Tenant name",
    tenantBrandKeyLabel: "Brand key",
    tenantBrandKeyDescription: "Lowercase, hyphen-separated, e.g. lighthouse-studio.",
    createTenantSubmit: "Create tenant",
    createTenantErrorTitle: "Could not create tenant",
    createTenantSuccess: "Tenant created. Provisioning can now be requested for it.",
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
    loginTitle: "تسجيل الدخول إلى لوحة التحكم",
    loginEmailLabel: "البريد الإلكتروني",
    loginPasswordLabel: "كلمة المرور",
    loginSubmit: "تسجيل الدخول",
    loginMfaCodeLabel: "رمز التحقق المكوّن من ٦ أرقام",
    loginMfaSubmit: "تحقق",
    loginErrorTitle: "فشل تسجيل الدخول",
    mfaEnrollTitle: "إعداد تطبيق المصادقة",
    mfaEnrollInstructions:
      "امسح هذا المفتاح باستخدام تطبيق مصادقة، ثم أدخل الرمز المكوّن من ٦ أرقام لإكمال الإعداد.",
    mfaEnrollSecretLabel: "مفتاح الإعداد",
    mfaEnrollCodeLabel: "رمز من ٦ أرقام",
    mfaEnrollSubmit: "تحقق وفعّل",
    mfaEnrollErrorTitle: "تعذّر الإعداد",
    signOut: "تسجيل الخروج",
    createTenantTitle: "تسجيل مستأجر جديد",
    tenantNameLabel: "اسم المستأجر",
    tenantBrandKeyLabel: "مفتاح العلامة التجارية",
    tenantBrandKeyDescription: "أحرف صغيرة مفصولة بشرطات، مثل lighthouse-studio.",
    createTenantSubmit: "إنشاء المستأجر",
    createTenantErrorTitle: "تعذّر إنشاء المستأجر",
    createTenantSuccess: "تم إنشاء المستأجر. يمكن الآن طلب التهيئة له.",
  },
};

export function getAdminMessage(locale: Locale, key: AdminMessageKey) {
  return adminCopy[locale][key];
}
