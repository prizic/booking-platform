import type { Locale } from "@wlbp/i18n";

/*
 * Every string of the installable Dashboard: the manifest name suffix, the
 * update prompt, the offline page, and the browser-specific install steps.
 * The tenant brand name itself comes from instance/content ("brand.name").
 */
const en = {
  appNameSuffix: "Workspace",
  offlineTitle: "You are offline",
  offlineBody:
    "The workspace needs an internet connection to show live bookings. Check your connection, then try again.",
  installTitle: "Install the workspace app",
  installIntro:
    "Open {name} from your home screen or desktop in one tap. The app always loads live data; nothing about your bookings or customers is stored for offline use.",
  installLink: "Install the app",
  updateTitle: "A new version is ready",
  updateBody:
    "Update when you are ready. Anything you are typing stays here until you choose.",
  updateAccept: "Update now",
  updateDismiss: "Later",
  offlineRetry: "Try again",
  offlineHome: "Go to today",
  installAction: "Install app",
  installInstalled: "The app is installed on this device.",
  installUnavailable:
    "Your browser has not offered one-tap install here. Follow the steps for your device below.",
  installIosTitle: "iPhone and iPad (Safari)",
  installIosStep1: "Open this site in Safari.",
  installIosStep2: "Tap the Share button.",
  installIosStep3: "Choose Add to Home Screen, then tap Add.",
  installAndroidTitle: "Android (Chrome)",
  installAndroidStep1: "Open this site in Chrome.",
  installAndroidStep2: "Tap the menu (three dots).",
  installAndroidStep3: "Choose Install app or Add to Home screen, then confirm.",
  installDesktopTitle: "Computer (Chrome or Edge)",
  installDesktopStep1: "Open this site in Chrome or Microsoft Edge.",
  installDesktopStep2: "Select the install icon at the end of the address bar.",
  installDesktopStep3: "Select Install.",
  installRemoveTitle: "Removing the app",
  installRemoveBody:
    "Remove it like any other app: press and hold its icon on a phone, or open the app's menu on a computer and choose Uninstall.",
} as const;

export type PwaMessageKey = keyof typeof en;

const ar: Readonly<Record<PwaMessageKey, string>> = {
  appNameSuffix: "لوحة التحكم",
  offlineTitle: "لا يوجد اتصال بالإنترنت",
  offlineBody:
    "تحتاج لوحة التحكم إلى اتصال بالإنترنت لعرض الحجوزات المباشرة. تحقّق من اتصالك، ثم أعد المحاولة.",
  installTitle: "ثبّت تطبيق لوحة التحكم",
  installIntro:
    "افتح {name} من الشاشة الرئيسية أو سطح المكتب بنقرة واحدة. يحمّل التطبيق البيانات المباشرة دائمًا، ولا يحفظ أي بيانات عن حجوزاتك أو عملائك للاستخدام دون اتصال.",
  installLink: "ثبّت التطبيق",
  updateTitle: "يتوفر إصدار جديد",
  updateBody: "حدّث متى كنت مستعدًا، ويبقى ما تكتبه كما هو حتى تختار التحديث.",
  updateAccept: "حدّث الآن",
  updateDismiss: "لاحقًا",
  offlineRetry: "أعد المحاولة",
  offlineHome: "انتقل إلى اليوم",
  installAction: "ثبّت التطبيق",
  installInstalled: "التطبيق مثبّت على هذا الجهاز.",
  installUnavailable: "لم يعرض متصفحك التثبيت بنقرة واحدة هنا. اتبع خطوات جهازك أدناه.",
  installIosTitle: "آيفون وآيباد (سفاري)",
  installIosStep1: "افتح هذا الموقع في متصفح سفاري.",
  installIosStep2: "اضغط زر المشاركة.",
  installIosStep3: "اختر «إضافة إلى الشاشة الرئيسية» ثم اضغط «إضافة».",
  installAndroidTitle: "أندرويد (كروم)",
  installAndroidStep1: "افتح هذا الموقع في متصفح كروم.",
  installAndroidStep2: "اضغط القائمة (النقاط الثلاث).",
  installAndroidStep3: "اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية» ثم أكّد.",
  installDesktopTitle: "الحاسوب (كروم أو إيدج)",
  installDesktopStep1: "افتح هذا الموقع في متصفح كروم أو مايكروسوفت إيدج.",
  installDesktopStep2: "اختر أيقونة التثبيت في نهاية شريط العنوان.",
  installDesktopStep3: "اختر «تثبيت».",
  installRemoveTitle: "إزالة التطبيق",
  installRemoveBody:
    "أزِله كأي تطبيق آخر: اضغط مطوّلًا على أيقونته في الهاتف، أو افتح قائمة التطبيق في الحاسوب واختر «إلغاء التثبيت».",
};

export const pwaCopy: Readonly<
  Record<Locale, Readonly<Record<PwaMessageKey, string>>>
> = Object.freeze({ en, ar });

export function pwaMessage(locale: Locale, key: PwaMessageKey): string {
  return pwaCopy[locale][key];
}
