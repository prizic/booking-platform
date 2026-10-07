import {
  reminderOffsetBoundsV1,
  type NotificationTemplateKeyV1,
} from "@wlbp/api-contracts";
import type { Locale } from "@wlbp/i18n";
import { dashboardFormMessages } from "./form-messages";

/*
 * Every string of the Communications notification surfaces: tenant
 * notification settings, email preview and test send, a member's own email
 * preferences, the team overview, and the Integrations WhatsApp card.
 * Placeholders are `{name}`; numbers are substituted already formatted for the
 * locale (Arabic-Indic digits come from Intl, never typed here).
 */
const en = {
  commsNavLabel: "Communications sections",
  commsNavMessages: "Messages",
  commsNavSettings: "Notification settings",
  commsNavPreferences: "My email preferences",

  settingsTitle: "Notification settings",
  settingsSummary:
    "Choose which emails your business sends and when customers get reminders. Email always works; WhatsApp is an optional second channel.",
  settingsDenied: "Your current role cannot change notification settings.",
  settingsUnavailable: "Notification settings are unavailable. Retry the read.",
  customerGroup: "Customer emails",
  customerGroupHint: "Sent to the customer who made the booking.",
  staffGroup: "Team emails",
  staffGroupHint:
    "Sent to team members. Each member can also turn their own alerts off in My email preferences.",
  columnMessage: "Message",
  columnEmail: "Email",
  columnWhatsApp: "WhatsApp",
  columnPreview: "Preview",
  alwaysSent: "Always sent",
  alwaysSentBooking:
    "Customers need this message to keep their booking, so it cannot be turned off.",
  alwaysSentAuth:
    "Sign-in and account security emails always go and are sent by the platform.",
  whatsappNotCapable: "Email only",
  whatsappOffHint:
    "WhatsApp columns appear when your plan includes WhatsApp and it is set up and turned on in Integrations.",
  whatsappSetupLink: "Set up WhatsApp",
  emailSwitchLabel: "Send “{name}” by email",
  whatsappSwitchLabel: "Send “{name}” on WhatsApp",
  previewAction: "Preview",
  previewActionLabel: "Preview “{name}”",
  remindersTitle: "Reminder lead times",
  remindersHint:
    "Choose 1 to 4 times before the appointment when the customer gets a reminder email.",
  remindersPresets: "Common lead times",
  remindersChosen: "Chosen lead times",
  remindersNone: "No lead time chosen yet.",
  remindersCustom: "Custom lead time (minutes)",
  remindersCustomHint: "A whole number from {min} to {max} minutes (one week).",
  remindersAdd: "Add lead time",
  remindersRemove: "Remove {value}",
  remindersBefore: "{value} before",
  reminder_offsets_required: "Choose at least one reminder time.",
  reminder_offsets_too_many: "Choose no more than {maxCount} reminder times.",
  reminder_offset_range: "Enter a whole number of minutes from {min} to {max}.",
  reminder_offset_duplicate: "That lead time is already chosen.",
  saveSettings: "Save notification settings",
  saving: "Saving…",
  settingsSaved: "Notification settings saved.",
  settingsConflict:
    "Someone saved these settings after you opened them. Your changes are still here: reload to see the latest values, then save again.",
  settingsInvalid: "The settings were not saved. Check the values and try again.",
  reload: "Reload and review",
  changedNotice: "You have unsaved changes.",

  previewTitle: "Preview: {name}",
  previewDescription:
    "Rendered with sample booking data in your published brand. Nothing is sent.",
  previewLanguage: "Email language",
  previewSubject: "Subject",
  previewHtmlTab: "Formatted email",
  previewTextTab: "Plain text",
  previewFrameTitle: "Rendered email: {name}",
  previewLoading: "Loading the preview…",
  previewFailed: "The preview is unavailable. Try again shortly.",
  previewBrandUnavailable:
    "Publish your brand first: the preview uses your published brand.",
  previewDenied: "Your current role cannot preview emails.",
  previewImagesNote:
    "Images hosted on another site may not show in this preview; they do in the delivered email.",
  previewRetry: "Try again",
  testSend: "Send a test to me",
  testSending: "Queuing the test…",
  testOnlyToYou:
    "Tests use sample data and go only to your own verified email address, in the language chosen above.",
  testQueued:
    "Test queued for your email address. Queued is not delivered: check your inbox in a few minutes.",
  testRateLimited:
    "You have reached the test limit ({count} per hour). Try again later.",
  testUnverified: "Your email address is not verified, so a test cannot be sent.",
  testFailed: "The test was not queued. Try again.",
  close: "Close",

  prefsTitle: "My email preferences",
  prefsSummary:
    "Choose which team alerts reach your inbox. These choices apply only to you.",
  prefsAlertsLegend: "Team alerts",
  prefsTurnedOffByBusiness:
    "Turned off for the whole business in Notification settings, so nobody receives it.",
  prefsDigestLegend: "Daily agenda",
  prefsDigestSwitch: "Email me the day’s agenda each morning",
  prefsDigestTime: "Send at",
  prefsDigestZone: "Local time in {zone}.",
  prefsSave: "Save my preferences",
  prefsSaved: "Your email preferences are saved.",
  prefsInvalid: "Your preferences were not saved. Check the values and try again.",
  prefsUnavailable: "Your email preferences are unavailable. Retry the read.",
  prefsNotMember: "Email preferences belong to a membership of this business.",
  timePlaceholder: "Choose a time",

  teamTitle: "Team preferences",
  teamSummary: "Read only. Each member changes their own preferences.",
  teamMember: "Member",
  teamDigestTime: "Agenda time",
  teamOn: "On",
  teamOff: "Off",
  teamEmpty: "No active team members.",
  teamUnavailable: "Team preferences are unavailable. Retry the read.",

  waTitle: "WhatsApp",
  waConnection: "Connection",
  waIntro:
    "An optional second channel through the Meta WhatsApp Cloud API. The email is always sent as well. Messages go only to customers who opted in for that booking, and only as Meta-approved templates.",
  waNotEntitled: "Your plan does not include WhatsApp notifications.",
  waRequest:
    "To request them, contact your platform operator. Once your plan includes WhatsApp, the setup form appears here.",
  waStatus: "Status",
  waAvailable: "Sending",
  waEnabledOnly: "Turned on, setup incomplete",
  waConfiguredOff: "Set up, turned off",
  waNotConfigured: "Not set up",
  waDenied: "Your current role cannot manage WhatsApp.",
  waUnavailable: "WhatsApp settings are unavailable. Retry the read.",
  waEnabled: "Send WhatsApp messages",
  waEnabledHint:
    "Needs the phone number ID, the business account ID and a token reference.",
  waPhoneId: "Phone number ID",
  waAccountId: "WhatsApp Business account ID",
  waIdHint: "Digits only, from WhatsApp Manager → API Setup.",
  waTokenRef: "Access token reference",
  waTokenConfigured: "Configured. Leave empty to keep the stored reference.",
  waTokenMissing: "Not configured yet.",
  waTokenHint:
    "Never paste the token itself. Ask your platform operator to store it, then enter {reference} (a rotated token adds _ and a suffix). A vault: reference is accepted but cannot be used for sending yet.",
  waTemplatesTitle: "Approved templates",
  waTemplatesHint:
    "For each message, the name of its Meta-approved template and the approved language code (for example ar or en_US). Leave a row empty to send that message by email only.",
  waTemplateName: "Template name",
  waTemplateLanguage: "Language code",
  waTemplateNameFor: "Template name for “{name}”",
  waTemplateLanguageFor: "Language code for “{name}”",
  waLegal:
    "Whether WhatsApp consent, sender registration and templates meet each market’s rules requires independent legal review.",
  waHowTitle: "How it works",
  waHow1:
    "A message goes only when your plan includes WhatsApp, it is turned on here, and the customer ticked the WhatsApp opt-in for that booking.",
  waHow2:
    "Only booking messages can use WhatsApp; payments, team alerts, codes and sign-in mail stay on email.",
  waHow3:
    "Templates must be Utility templates with body variables in the documented order. Links are never sent on WhatsApp; the email carries them.",
  waHow4:
    "Delivery status arrives through a signed webhook. Customer replies are not stored.",
  waStepUp: "Saving needs a verification from the last {minutes} minutes.",
  waStepUpRequired:
    "Verify your account again, then save. Changes need a verification from the last {minutes} minutes.",
  waVerify: "Verify account",
  waSave: "Save WhatsApp settings",
  waSaved: "WhatsApp settings saved.",
  waInvalid:
    "WhatsApp settings were not saved. Check the IDs, the token reference and the template names.",
  waNotEntitledError: "Your plan does not include WhatsApp, so it cannot be turned on.",
  waConflict:
    "Someone saved WhatsApp settings after you opened them. Your changes are still here: reload, then save again.",
  wa_id_invalid: "Enter {idMin} to {idMax} digits.",
  wa_secret_ref_invalid:
    "Use env:WHATSAPP_TOKEN_… or vault: followed by an ID. Never the token itself.",
  wa_secret_ref_foreign:
    "This reference does not belong to this business. Use {reference}.",
  wa_template_name_invalid: "Use lowercase letters, digits and underscores only.",
  wa_template_language_invalid: "Use a code such as ar, en or en_US.",
  wa_template_incomplete:
    "Enter both the template name and the language code, or neither.",
  wa_enable_incomplete: "To turn WhatsApp on, enter both IDs and a token reference.",
} as const;

export type NotificationMessageKey = keyof typeof en;

const ar: Record<NotificationMessageKey, string> = {
  commsNavLabel: "أقسام التواصل",
  commsNavMessages: "الرسائل",
  commsNavSettings: "إعدادات الإشعارات",
  commsNavPreferences: "تفضيلات بريدي",

  settingsTitle: "إعدادات الإشعارات",
  settingsSummary:
    "اختر رسائل البريد التي ترسلها منشأتك ومتى يصل التذكير إلى العملاء. البريد يعمل دائمًا، وواتساب قناة ثانية اختيارية.",
  settingsDenied: "لا يسمح دورك الحالي بتغيير إعدادات الإشعارات.",
  settingsUnavailable: "إعدادات الإشعارات غير متاحة. أعد محاولة القراءة.",
  customerGroup: "رسائل العملاء",
  customerGroupHint: "تُرسل إلى العميل صاحب الحجز.",
  staffGroup: "رسائل الفريق",
  staffGroupHint:
    "تُرسل إلى أعضاء الفريق، ويستطيع كل عضو أيضًا إيقاف تنبيهاته من «تفضيلات بريدي».",
  columnMessage: "الرسالة",
  columnEmail: "البريد",
  columnWhatsApp: "واتساب",
  columnPreview: "المعاينة",
  alwaysSent: "تُرسل دائمًا",
  alwaysSentBooking: "يحتاج العميل هذه الرسالة لمتابعة حجزه، لذا لا يمكن إيقافها.",
  alwaysSentAuth: "رسائل تسجيل الدخول وأمان الحساب تُرسل دائمًا وتتولاها المنصة.",
  whatsappNotCapable: "بالبريد فقط",
  whatsappOffHint:
    "يظهر عمود واتساب عندما تشمله خطتك ويكون مُعدًّا ومفعّلًا من صفحة التكاملات.",
  whatsappSetupLink: "إعداد واتساب",
  emailSwitchLabel: "إرسال «{name}» بالبريد",
  whatsappSwitchLabel: "إرسال «{name}» عبر واتساب",
  previewAction: "معاينة",
  previewActionLabel: "معاينة «{name}»",
  remindersTitle: "مواعيد التذكير",
  remindersHint:
    "اختر من وقت واحد إلى أربعة أوقات قبل الموعد يصل فيها بريد التذكير إلى العميل.",
  remindersPresets: "أوقات شائعة",
  remindersChosen: "الأوقات المختارة",
  remindersNone: "لم يُختر أي وقت بعد.",
  remindersCustom: "وقت مخصص (بالدقائق)",
  remindersCustomHint: "عدد صحيح من {min} إلى {max} دقيقة (أسبوع).",
  remindersAdd: "إضافة الوقت",
  remindersRemove: "إزالة {value}",
  remindersBefore: "قبل {value}",
  reminder_offsets_required: "اختر وقت تذكير واحدًا على الأقل.",
  reminder_offsets_too_many: "اختر {maxCount} أوقات تذكير على الأكثر.",
  reminder_offset_range: "أدخل عددًا صحيحًا من الدقائق بين {min} و{max}.",
  reminder_offset_duplicate: "هذا الوقت مختار بالفعل.",
  saveSettings: "حفظ إعدادات الإشعارات",
  saving: "جارٍ الحفظ…",
  settingsSaved: "حُفظت إعدادات الإشعارات.",
  settingsConflict:
    "حفظ شخص آخر هذه الإعدادات بعد أن فتحتها. تغييراتك ما زالت هنا: أعد التحميل لرؤية أحدث القيم ثم احفظ مجددًا.",
  settingsInvalid: "لم تُحفظ الإعدادات. تحقّق من القيم وأعد المحاولة.",
  reload: "إعادة التحميل والمراجعة",
  changedNotice: "لديك تغييرات غير محفوظة.",

  previewTitle: "معاينة: {name}",
  previewDescription:
    "تُعرض ببيانات حجز تجريبية وبهوية علامتك المنشورة، ولا يُرسل شيء.",
  previewLanguage: "لغة البريد",
  previewSubject: "الموضوع",
  previewHtmlTab: "البريد المنسّق",
  previewTextTab: "نص عادي",
  previewFrameTitle: "البريد كما يظهر: {name}",
  previewLoading: "جارٍ تحميل المعاينة…",
  previewFailed: "المعاينة غير متاحة. أعد المحاولة بعد قليل.",
  previewBrandUnavailable: "انشر هوية علامتك أولًا، فالمعاينة تستخدم الهوية المنشورة.",
  previewDenied: "لا يسمح دورك الحالي بمعاينة الرسائل.",
  previewImagesNote:
    "قد لا تظهر في هذه المعاينة الصور المستضافة على موقع آخر، لكنها تظهر في البريد المُرسل.",
  previewRetry: "إعادة المحاولة",
  testSend: "إرسال نسخة تجريبية إليّ",
  testSending: "جارٍ إضافة النسخة التجريبية…",
  testOnlyToYou:
    "تستخدم النسخ التجريبية بيانات نموذجية وتُرسل إلى بريدك المُوثَّق فقط، باللغة المختارة أعلاه.",
  testQueued:
    "أُضيفت النسخة التجريبية إلى قائمة الإرسال إلى بريدك. الإضافة إلى القائمة لا تعني التسليم: تحقّق من بريدك بعد دقائق.",
  testRateLimited: "بلغتَ حد النسخ التجريبية ({count} في الساعة). أعد المحاولة لاحقًا.",
  testUnverified: "بريدك الإلكتروني غير مُوثَّق، لذا لا يمكن إرسال نسخة تجريبية.",
  testFailed: "لم تُضف النسخة التجريبية. أعد المحاولة.",
  close: "إغلاق",

  prefsTitle: "تفضيلات بريدي",
  prefsSummary:
    "اختر تنبيهات الفريق التي تصل إلى بريدك. تنطبق هذه الاختيارات عليك وحدك.",
  prefsAlertsLegend: "تنبيهات الفريق",
  prefsTurnedOffByBusiness:
    "أوقفته المنشأة لجميع الأعضاء من إعدادات الإشعارات، لذا لا يصل إلى أحد.",
  prefsDigestLegend: "جدول اليوم",
  prefsDigestSwitch: "أرسل إليّ جدول اليوم كل صباح",
  prefsDigestTime: "وقت الإرسال",
  prefsDigestZone: "بالتوقيت المحلي في {zone}.",
  prefsSave: "حفظ تفضيلاتي",
  prefsSaved: "حُفظت تفضيلات بريدك.",
  prefsInvalid: "لم تُحفظ تفضيلاتك. تحقّق من القيم وأعد المحاولة.",
  prefsUnavailable: "تفضيلات بريدك غير متاحة. أعد محاولة القراءة.",
  prefsNotMember: "تفضيلات البريد مرتبطة بعضوية في هذه المنشأة.",
  timePlaceholder: "اختر وقتًا",

  teamTitle: "تفضيلات الفريق",
  teamSummary: "للعرض فقط؛ يغيّر كل عضو تفضيلاته بنفسه.",
  teamMember: "العضو",
  teamDigestTime: "وقت جدول اليوم",
  teamOn: "مفعّل",
  teamOff: "متوقف",
  teamEmpty: "لا يوجد أعضاء نشطون.",
  teamUnavailable: "تفضيلات الفريق غير متاحة. أعد محاولة القراءة.",

  waTitle: "واتساب",
  waConnection: "الاتصال",
  waIntro:
    "قناة ثانية اختيارية عبر WhatsApp Cloud API من Meta، ويُرسل البريد أيضًا في كل الأحوال. لا تصل الرسائل إلا إلى العملاء الذين وافقوا على ذلك في حجزهم، وبقوالب معتمدة من Meta فقط.",
  waNotEntitled: "لا تشمل خطتك إشعارات واتساب.",
  waRequest:
    "لطلبها تواصل مع مشغّل المنصة. عندما تشمل خطتك واتساب يظهر نموذج الإعداد هنا.",
  waStatus: "الحالة",
  waAvailable: "يُرسل",
  waEnabledOnly: "مفعّل، والإعداد غير مكتمل",
  waConfiguredOff: "مُعدّ، وغير مفعّل",
  waNotConfigured: "غير مُعدّ",
  waDenied: "لا يسمح دورك الحالي بإدارة واتساب.",
  waUnavailable: "إعدادات واتساب غير متاحة. أعد محاولة القراءة.",
  waEnabled: "إرسال رسائل واتساب",
  waEnabledHint: "يتطلب معرّف رقم الهاتف ومعرّف حساب الأعمال ومرجع رمز الوصول.",
  waPhoneId: "معرّف رقم الهاتف",
  waAccountId: "معرّف حساب واتساب للأعمال",
  waIdHint: "أرقام فقط، من WhatsApp Manager ← API Setup.",
  waTokenRef: "مرجع رمز الوصول",
  waTokenConfigured: "مُعدّ. اتركه فارغًا للإبقاء على المرجع المحفوظ.",
  waTokenMissing: "غير مُعدّ بعد.",
  waTokenHint:
    "لا تلصق الرمز نفسه أبدًا. اطلب من مشغّل المنصة حفظه، ثم أدخل {reference} (يُضاف _ ولاحقة عند تدوير الرمز). يُقبل مرجع vault: لكنه لا يُستخدم للإرسال بعد.",
  waTemplatesTitle: "القوالب المعتمدة",
  waTemplatesHint:
    "لكل رسالة: اسم قالبها المعتمد لدى Meta ورمز لغته المعتمد (مثل ar أو en_US). اترك الصف فارغًا لإرسال تلك الرسالة بالبريد فقط.",
  waTemplateName: "اسم القالب",
  waTemplateLanguage: "رمز اللغة",
  waTemplateNameFor: "اسم قالب «{name}»",
  waTemplateLanguageFor: "رمز لغة «{name}»",
  waLegal:
    "مدى استيفاء موافقة العملاء وتسجيل المرسل والقوالب عبر واتساب لقواعد كل سوق يتطلب مراجعة قانونية مستقلة (requires independent legal review).",
  waHowTitle: "طريقة العمل",
  waHow1:
    "لا تُرسل الرسالة إلا إذا شملت خطتك واتساب، وكان مفعّلًا هنا، ووافق العميل على رسائل واتساب في ذلك الحجز.",
  waHow2:
    "رسائل الحجز وحدها يمكن إرسالها عبر واتساب؛ أما المدفوعات وتنبيهات الفريق والرموز ورسائل الدخول فتبقى بالبريد.",
  waHow3:
    "يجب أن تكون القوالب من فئة Utility وأن تأتي متغيراتها بالترتيب الموثّق. لا تُرسل الروابط عبر واتساب أبدًا، فالبريد يحملها.",
  waHow4: "تصل حالة التسليم عبر webhook موقّع، ولا تُحفظ ردود العملاء.",
  waStepUp: "يتطلب الحفظ تحققًا خلال آخر {minutes} دقائق.",
  waStepUpRequired:
    "تحقّق من حسابك مجددًا ثم احفظ. تتطلب التغييرات تحققًا خلال آخر {minutes} دقائق.",
  waVerify: "التحقق من الحساب",
  waSave: "حفظ إعدادات واتساب",
  waSaved: "حُفظت إعدادات واتساب.",
  waInvalid: "لم تُحفظ إعدادات واتساب. تحقّق من المعرّفات ومرجع الرمز وأسماء القوالب.",
  waNotEntitledError: "لا تشمل خطتك واتساب، لذا لا يمكن تفعيله.",
  waConflict:
    "حفظ شخص آخر إعدادات واتساب بعد أن فتحتها. تغييراتك ما زالت هنا: أعد التحميل ثم احفظ مجددًا.",
  wa_id_invalid: "أدخل من {idMin} إلى {idMax} رقمًا.",
  wa_secret_ref_invalid:
    "استخدم env:WHATSAPP_TOKEN_… أو vault: متبوعًا بمعرّف، ولا تستخدم الرمز نفسه أبدًا.",
  wa_secret_ref_foreign: "هذا المرجع لا يخص هذه المنشأة. استخدم {reference}.",
  wa_template_name_invalid: "استخدم حروفًا إنجليزية صغيرة وأرقامًا وشرطة سفلية فقط.",
  wa_template_language_invalid: "استخدم رمزًا مثل ar أو en أو en_US.",
  wa_template_incomplete: "أدخل اسم القالب ورمز اللغة معًا، أو اتركهما فارغين.",
  wa_enable_incomplete: "لتفعيل واتساب أدخل المعرّفين ومرجع رمز الوصول.",
};

export const notificationCopy: Readonly<
  Record<Locale, Readonly<Record<NotificationMessageKey, string>>>
> = { en, ar };

/** One message, with `{placeholders}` replaced by already-formatted values. */
export function notificationText(
  locale: Locale,
  key: NotificationMessageKey,
  values: Readonly<Record<string, string>> = {},
): string {
  return notificationCopy[locale][key].replace(
    /\{(\w+)\}/gu,
    (match, name: string) => values[name] ?? match,
  );
}

/** What each message type is called, and when it is sent. */
const templateText: Readonly<
  Record<
    NotificationTemplateKeyV1,
    Readonly<Record<Locale, readonly [label: string, description: string]>>
  >
> = {
  "booking.confirmed": {
    en: ["Booking confirmed", "When a booking is confirmed."],
    ar: ["تأكيد الحجز", "عند تأكيد الحجز."],
  },
  "management.otp_requested": {
    en: [
      "Booking management code",
      "When a customer asks for a code to manage a booking.",
    ],
    ar: ["رمز إدارة الحجز", "عندما يطلب العميل رمزًا لإدارة حجزه."],
  },
  "booking.requested": {
    en: ["Request received", "When a customer asks for a booking that needs approval."],
    ar: ["استلام الطلب", "عندما يطلب العميل حجزًا يحتاج إلى موافقة."],
  },
  "booking.rejected": {
    en: ["Request declined", "When the team declines a booking request."],
    ar: ["رفض الطلب", "عندما يرفض الفريق طلب الحجز."],
  },
  "booking.request_expired": {
    en: ["Request expired", "When a request closes without a decision."],
    ar: ["انتهاء مهلة الطلب", "عندما تنتهي مهلة الطلب دون قرار."],
  },
  "booking.proposal_created": {
    en: ["New time suggested", "When the team suggests another time for a request."],
    ar: ["اقتراح موعد آخر", "عندما يقترح الفريق موعدًا آخر للطلب."],
  },
  "booking.proposal_declined": {
    en: ["Suggested time declined", "When the customer declines a suggested time."],
    ar: ["رفض الموعد المقترح", "عندما يرفض العميل الموعد المقترح."],
  },
  "booking.rescheduled": {
    en: ["Booking moved", "When a booking moves to a new time."],
    ar: ["تغيير موعد الحجز", "عند نقل الحجز إلى موعد جديد."],
  },
  "booking.cancelled": {
    en: ["Booking cancelled", "When a booking is cancelled."],
    ar: ["إلغاء الحجز", "عند إلغاء الحجز."],
  },
  "booking.reminder": {
    en: ["Appointment reminder", "Before the appointment, at the lead times below."],
    ar: ["تذكير بالموعد", "قبل الموعد، في الأوقات المحددة أدناه."],
  },
  "payment.refunded": {
    en: ["Refund issued", "When a refund is sent to the customer."],
    ar: ["إصدار استرداد", "عند إرسال مبلغ مسترد إلى العميل."],
  },
  "payment.refund_failed": {
    en: ["Refund failed", "When a refund could not be completed."],
    ar: ["تعذّر الاسترداد", "عندما يتعذّر إتمام الاسترداد."],
  },
  "auth.sign_in_link": {
    en: ["Sign-in link", "When someone asks for a sign-in link."],
    ar: ["رابط تسجيل الدخول", "عندما يطلب شخص رابطًا لتسجيل الدخول."],
  },
  "auth.password_reset": {
    en: ["Password reset", "When someone asks to reset their password."],
    ar: ["إعادة تعيين كلمة المرور", "عندما يطلب شخص إعادة تعيين كلمة المرور."],
  },
  "auth.email_change": {
    en: ["Email address change", "When someone changes their sign-in email."],
    ar: ["تغيير البريد الإلكتروني", "عندما يغيّر شخص بريد تسجيل الدخول."],
  },
  "staff.request_pending": {
    en: [
      "New booking request",
      "When a customer asks for a booking that needs approval.",
    ],
    ar: ["طلب حجز جديد", "عندما يطلب عميل حجزًا يحتاج إلى موافقة."],
  },
  "staff.booking_cancelled": {
    en: ["Cancellation alert", "When a booking is cancelled."],
    ar: ["تنبيه بالإلغاء", "عند إلغاء حجز."],
  },
  "staff.payment_exception": {
    en: ["Payment needs attention", "When a payment needs someone to look at it."],
    ar: ["دفعة تحتاج إلى متابعة", "عندما تحتاج دفعة إلى من يتابعها."],
  },
  "staff.delivery_failed": {
    en: ["Email not delivered", "When an email to a customer could not be delivered."],
    ar: ["تعذّر تسليم بريد", "عندما يتعذّر تسليم بريد إلى عميل."],
  },
  "staff.daily_digest": {
    en: ["Daily agenda", "A morning summary of the day’s bookings."],
    ar: ["جدول اليوم", "ملخص صباحي لحجوزات اليوم."],
  },
};

export function templateLabel(locale: Locale, key: NotificationTemplateKeyV1): string {
  return templateText[key][locale][0];
}

export function templateDescription(
  locale: Locale,
  key: NotificationTemplateKeyV1,
): string {
  return templateText[key][locale][1];
}

/** Every template key's label and description, for parity tests. */
export const notificationTemplateText = templateText;

/** A lead time in minutes as words: "2 hours", "أسبوع واحد". */
export function formatLeadTime(minutes: number, locale: Locale): string {
  const [value, unit] =
    minutes % 10080 === 0
      ? [minutes / 10080, "week"]
      : minutes % 60 === 0
        ? [minutes / 60, "hour"]
        : [minutes, "minute"];
  return new Intl.NumberFormat(locale === "ar" ? "ar-u-nu-arab" : "en", {
    style: "unit",
    unit,
    unitDisplay: "long",
  }).format(value);
}

/** A whole number in the locale's digits. */
export function formatWhole(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-u-nu-arab" : "en").format(value);
}

/**
 * The error-code dictionary for a notification form: the Dashboard's domain
 * codes plus every message here, with the bounds and the tenant's own token
 * reference already substituted in the locale's digits.
 */
export function notificationFormMessages(
  locale: Locale,
  values: Readonly<Record<string, string>> = {},
): Readonly<Record<string, string>> {
  const filled = {
    min: formatWhole(reminderOffsetBoundsV1.min, locale),
    max: formatWhole(reminderOffsetBoundsV1.max, locale),
    maxCount: formatWhole(reminderOffsetBoundsV1.maxCount, locale),
    idMin: formatWhole(5, locale),
    idMax: formatWhole(32, locale),
    minutes: formatWhole(5, locale),
    count: formatWhole(10, locale),
    ...values,
  };
  return {
    ...dashboardFormMessages(locale),
    ...Object.fromEntries(
      (Object.keys(en) as NotificationMessageKey[]).map((key) => [
        key,
        notificationText(locale, key, filled),
      ]),
    ),
  };
}
