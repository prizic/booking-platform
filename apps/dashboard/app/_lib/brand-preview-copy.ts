import type { Locale } from "@wlbp/i18n";

export type BrandPreviewMessageKey =
  | "title"
  | "summary"
  | "back"
  | "buttonsTitle"
  | "buttonDefault"
  | "buttonSecondary"
  | "buttonHover"
  | "buttonFocus"
  | "buttonActive"
  | "buttonDisabled"
  | "buttonLoading"
  | "formTitle"
  | "formLabel"
  | "formDescription"
  | "formError"
  | "formErrorTitle"
  | "calendarTitle"
  | "calendarDescription"
  | "available"
  | "held"
  | "unavailable"
  | "selected"
  | "past"
  | "overCapacity"
  | "emptyTitle"
  | "emptyDescription"
  | "emailTitle"
  | "emailSubject"
  | "emailGreeting"
  | "emailBody"
  | "assetTitle"
  | "lightAsset"
  | "darkAsset"
  | "longName";

export const brandPreviewCopy: Record<
  Locale,
  Record<BrandPreviewMessageKey, string>
> = {
  en: {
    title: "Brand system preview",
    summary:
      "A single review surface for semantic states, bilingual content, and customer communications.",
    back: "Back to Today",
    buttonsTitle: "Button states",
    buttonDefault: "Book appointment",
    buttonSecondary: "View details",
    buttonHover: "Hover preview",
    buttonFocus: "Focus preview",
    buttonActive: "Active preview",
    buttonDisabled: "Unavailable",
    buttonLoading: "Checking availability",
    formTitle: "Form and validation",
    formLabel: "Customer email",
    formDescription: "We use this address for the booking confirmation.",
    formError: "Enter a complete email address, such as name@example.test.",
    formErrorTitle: "Check the highlighted field",
    calendarTitle: "Calendar states",
    calendarDescription:
      "All states include a text label and never rely on color alone.",
    available: "Available",
    held: "Held",
    unavailable: "Unavailable",
    selected: "Selected",
    past: "Past",
    overCapacity: "Over capacity",
    emptyTitle: "No matching appointments",
    emptyDescription: "Change the date or service to see more times.",
    emailTitle: "Email preview",
    emailSubject: "Your consultation is confirmed",
    emailGreeting: "Hello Rawan Al‑Abdulrahman Al‑Qahtani,",
    emailBody:
      "Your appointment is confirmed for 8 September 2026 at 6:30 PM (Asia/Riyadh).",
    assetTitle: "Light and dark brand assets",
    lightAsset: "Light surface logo",
    darkAsset: "Dark surface logo",
    longName: "Nawa Center for Family Wellness and Community Consultation Services",
  },
  ar: {
    title: "معاينة نظام الهوية",
    summary: "واجهة مراجعة واحدة للحالات الدلالية والمحتوى الثنائي ومراسلات العملاء.",
    back: "العودة إلى اليوم",
    buttonsTitle: "حالات الأزرار",
    buttonDefault: "حجز موعد",
    buttonSecondary: "عرض التفاصيل",
    buttonHover: "معاينة التحويم",
    buttonFocus: "معاينة التركيز",
    buttonActive: "معاينة الضغط",
    buttonDisabled: "غير متاح",
    buttonLoading: "جارٍ التحقق من المواعيد",
    formTitle: "النموذج والتحقق",
    formLabel: "البريد الإلكتروني للعميل",
    formDescription: "نستخدم هذا العنوان لإرسال تأكيد الحجز.",
    formError: "أدخل عنوان بريد إلكتروني كاملًا مثل name@example.test.",
    formErrorTitle: "راجع الحقل المحدد",
    calendarTitle: "حالات التقويم",
    calendarDescription: "تتضمن كل حالة تسمية نصية ولا تعتمد على اللون وحده.",
    available: "متاح",
    held: "محجوز مؤقتًا",
    unavailable: "غير متاح",
    selected: "محدد",
    past: "مضى",
    overCapacity: "تجاوز السعة",
    emptyTitle: "لا توجد مواعيد مطابقة",
    emptyDescription: "غيّر التاريخ أو الخدمة لعرض أوقات إضافية.",
    emailTitle: "معاينة البريد الإلكتروني",
    emailSubject: "تم تأكيد موعد الاستشارة",
    emailGreeting: "مرحبًا روان عبدالرحمن القحطاني،",
    emailBody: "تم تأكيد موعدك في ٨ سبتمبر ٢٠٢٦ الساعة ٦:٣٠ م (Asia/Riyadh).",
    assetTitle: "أصول الهوية للوضعين الفاتح والداكن",
    lightAsset: "شعار السطح الفاتح",
    darkAsset: "شعار السطح الداكن",
    longName: "مركز نوى للعافية الأسرية وخدمات الاستشارات المجتمعية المتكاملة",
  },
};

export function getBrandPreviewMessage(
  locale: Locale,
  key: BrandPreviewMessageKey,
): string {
  return brandPreviewCopy[locale][key];
}
