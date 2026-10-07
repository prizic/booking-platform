import type { ContractLocale } from "@wlbp/api-contracts";

import { safeLinkUrl, safeOrigin, type EmailBrand } from "./brand.js";
import type { DailyDigest } from "./digest.js";
import {
  renderEmailHtml,
  renderEmailText,
  type CardRow,
  type EmailAction,
  type EmailDocument,
} from "./layout.js";

/**
 * Canonical template identity. The platform owns these keys, their variables,
 * and their bodies: a tenant configures its brand and its policy text, never
 * the legally required parts of a message.
 */
export const notificationTemplateKeys = [
  "booking.confirmed",
  "booking.requested",
  "booking.rejected",
  "booking.request_expired",
  "booking.proposal_created",
  "booking.proposal_declined",
  "booking.rescheduled",
  "booking.cancelled",
  "management.otp_requested",
  "payment.refunded",
  "payment.refund_failed",
  "booking.reminder",
  "staff.request_pending",
  "staff.payment_exception",
  "staff.booking_cancelled",
  "staff.delivery_failed",
  // Issue #101. Auth mail is the one message sent to somebody who may not be a
  // customer yet, so the platform owns every word of it.
  "auth.sign_in_link",
  "auth.password_reset",
  "auth.email_change",
  // The opt-in morning agenda for a staff member, at their location's time.
  "staff.daily_digest",
] as const;

export type NotificationTemplateKey = (typeof notificationTemplateKeys)[number];

export function isNotificationTemplateKey(
  value: unknown,
): value is NotificationTemplateKey {
  return (
    typeof value === "string" &&
    (notificationTemplateKeys as readonly string[]).includes(value)
  );
}

export type TemplateAudience = "auth" | "customer" | "staff";

export interface TemplateMetadata {
  readonly audience: TemplateAudience;
  /**
   * The recipient (or tenant) may turn this message off, so it carries a
   * preferences/unsubscribe link. Transactional mail never does.
   */
  readonly optional: boolean;
}

export interface RenderedEmail {
  readonly html: string;
  readonly subject: string;
  /** Meaningful plain text, not a stripped-tag afterthought. */
  readonly text: string;
}

export interface TemplateContext {
  readonly brandName: string;
  readonly locale: ContractLocale;
  /** Already localized and timezone-formatted by the caller. */
  readonly variables: Readonly<Record<string, string>>;
  /** Published brand presentation. Optional: a name alone still renders. */
  readonly brand?: EmailBrand;
  /** A Dashboard "send a test to me" message. Marked in subject and body. */
  readonly isTest?: boolean;
  /** Overrides the derived preferences link for optional messages. */
  readonly preferencesUrl?: string;
  /** Required by `staff.daily_digest`, ignored by every other template. */
  readonly digest?: DailyDigest;
}

type LabelKey =
  | "amount"
  | "answerBy"
  | "code"
  | "expires"
  | "location"
  | "newWhen"
  | "proposedWhen"
  | "reference"
  | "refund"
  | "refunded"
  | "requestedWhen"
  | "service"
  | "staff"
  | "total"
  | "when";

type ActionKey =
  | "calendar"
  | "confirmEmail"
  | "directions"
  | "followRequest"
  | "manage"
  | "openDashboard"
  | "openToday"
  | "proposal"
  | "resetPassword"
  | "signIn";

interface CardField {
  readonly label: LabelKey;
  readonly value: string;
  readonly secondary?: string;
  readonly ltr?: boolean;
}

interface ActionField {
  readonly action: ActionKey;
  readonly kind: "primary" | "secondary";
}

interface TemplateCopy {
  readonly heading: string;
  readonly intro: readonly string[];
  readonly notes?: readonly string[];
  readonly preheader: string;
  readonly subject: string;
}

interface TemplateSpec extends TemplateMetadata {
  readonly actions: readonly ActionField[];
  readonly card: readonly CardField[];
  readonly copy: Record<ContractLocale, TemplateCopy>;
  /** Variables without which the message is useless, so it must not send. */
  readonly required?: readonly string[];
  /** Dashboard path for `openDashboard`/`openToday`, after `/{locale}`. */
  readonly dashboardPath?: string;
}

// ---------------------------------------------------------------------------
// Shared vocabulary
// ---------------------------------------------------------------------------

const labels: Record<ContractLocale, Record<LabelKey, string>> = {
  ar: {
    amount: "المبلغ",
    answerBy: "موعد الرد",
    code: "الرمز",
    expires: "تنتهي صلاحيته",
    location: "المكان",
    newWhen: "الموعد الجديد",
    proposedWhen: "الموعد المقترح",
    reference: "رقم المرجع",
    refund: "الاسترداد",
    refunded: "المبلغ المُعاد",
    requestedWhen: "الموعد المطلوب",
    service: "الخدمة",
    staff: "مقدّم الخدمة",
    total: "الإجمالي",
    when: "الموعد",
  },
  en: {
    amount: "Amount",
    answerBy: "Answer by",
    code: "Code",
    expires: "Expires",
    location: "Location",
    newWhen: "New time",
    proposedWhen: "Suggested time",
    reference: "Reference",
    refund: "Refund",
    refunded: "Refunded",
    requestedWhen: "Requested time",
    service: "Service",
    staff: "With",
    total: "Total",
    when: "Date and time",
  },
};

const actionLabels: Record<ContractLocale, Record<ActionKey, string>> = {
  ar: {
    calendar: "أضف إلى التقويم",
    confirmEmail: "تأكيد البريد الإلكتروني",
    directions: "عرض الاتجاهات",
    followRequest: "متابعة طلبك",
    manage: "إدارة الحجز",
    openDashboard: "فتح في لوحة التحكم",
    openToday: "فتح جدول اليوم",
    proposal: "مراجعة الموعد المقترح",
    resetPassword: "اختيار كلمة مرور جديدة",
    signIn: "تسجيل الدخول",
  },
  en: {
    calendar: "Add to calendar",
    confirmEmail: "Confirm email address",
    directions: "Get directions",
    followRequest: "View your request",
    manage: "Manage booking",
    openDashboard: "Open in Dashboard",
    openToday: "Open today's schedule",
    proposal: "Review the suggested time",
    resetPassword: "Choose a new password",
    signIn: "Sign in",
  },
};

const chrome: Record<
  ContractLocale,
  {
    readonly agenda: {
      readonly customer: string;
      readonly empty: string;
      readonly more: string;
      readonly service: string;
      readonly staff: string;
      readonly time: string;
      readonly timeZoneNote: string;
    };
    readonly fallbackLink: string;
    readonly preferences: string;
    readonly stopReminders: string;
    readonly support: string;
    readonly testBanner: string;
    readonly testSubjectPrefix: string;
    readonly why: Record<TemplateAudience | "otp", string>;
  }
> = {
  ar: {
    agenda: {
      customer: "العميل",
      empty: "لا توجد حجوزات في جدول اليوم.",
      more: "ويمكنك عرض البقية ({count}) في لوحة التحكم.",
      service: "الخدمة",
      staff: "مقدّم الخدمة",
      time: "الوقت",
      timeZoneNote: "الأوقات بتوقيت",
    },
    fallbackLink: "إذا لم يعمل الزر، فانسخ هذا الرابط والصقه في المتصفح:",
    preferences: "إدارة تفضيلات البريد الإلكتروني",
    stopReminders: "إيقاف رسائل التذكير",
    support: "للاستفسار:",
    testBanner:
      "رسالة تجريبية — أُرسلت من لوحة التحكم لمعاينة شكل هذه الرسالة، ولم يتغير أي حجز.",
    testSubjectPrefix: "[تجربة] ",
    why: {
      auth: "وصلتك هذه الرسالة لأن أحدهم طلب استخدام هذا العنوان لدى {brandName}.",
      customer: "وصلتك هذه الرسالة لأنك حجزت لدى {brandName}.",
      otp: "وصلتك هذه الرسالة لأن أحدهم طلب رمزًا لإدارة حجز لدى {brandName}.",
      staff: "وصلتك هذه الرسالة لأنك عضو في فريق {brandName}.",
    },
  },
  en: {
    agenda: {
      customer: "Customer",
      empty: "Nothing is booked for today.",
      more: "Plus {count} more in the Dashboard.",
      service: "Service",
      staff: "With",
      time: "Time",
      timeZoneNote: "Times are shown in",
    },
    fallbackLink: "If the button does not work, copy this link into your browser:",
    preferences: "Manage your email preferences",
    stopReminders: "Stop reminder emails",
    support: "Questions? Contact",
    testBanner:
      "Test message — sent from the Dashboard to check how this email looks. No booking was changed.",
    testSubjectPrefix: "[Test] ",
    why: {
      auth: "You received this email because someone asked to use this address with {brandName}.",
      customer: "You received this email because you made a booking with {brandName}.",
      otp: "You received this email because someone asked for a code to manage a booking with {brandName}.",
      staff:
        "You received this email because you are a member of the {brandName} team.",
    },
  },
};

// Card building blocks, so every booking card says the same thing the same way.
const service: CardField = { label: "service", value: "{serviceName}" };
const when: CardField = { label: "when", secondary: "{timeZone}", value: "{startAt}" };
const location: CardField = {
  label: "location",
  secondary: "{locationAddress}",
  value: "{locationName}",
};
const staff: CardField = { label: "staff", value: "{staffName}" };
const reference: CardField = {
  label: "reference",
  ltr: true,
  value: "{publicReference}",
};

const bookingActions: readonly ActionField[] = [
  { action: "manage", kind: "primary" },
  { action: "calendar", kind: "secondary" },
  { action: "directions", kind: "secondary" },
];

const templates: Record<NotificationTemplateKey, TemplateSpec> = {
  "auth.sign_in_link": {
    actions: [{ action: "signIn", kind: "primary" }],
    audience: "auth",
    card: [],
    copy: {
      ar: {
        heading: "رابط تسجيل الدخول",
        intro: ["استخدم الزر أدناه لتسجيل الدخول. يعمل الرابط مرة واحدة فقط."],
        notes: ["إذا لم تطلب هذا الرابط، فتجاهل هذه الرسالة."],
        preheader: "رابط تسجيل الدخول إلى {brandName}، صالح لمرة واحدة.",
        subject: "تسجيل الدخول إلى {brandName}",
      },
      en: {
        heading: "Your sign-in link",
        intro: ["Use the button below to sign in. The link works once."],
        notes: ["If you did not ask for this link, ignore this message."],
        preheader: "Your one-time link to sign in to {brandName}.",
        subject: "Sign in to {brandName}",
      },
    },
    optional: false,
    required: ["actionUrl"],
  },
  "auth.password_reset": {
    actions: [{ action: "resetPassword", kind: "primary" }],
    audience: "auth",
    card: [],
    copy: {
      ar: {
        heading: "إعادة تعيين كلمة المرور",
        intro: [
          "استخدم الزر أدناه لاختيار كلمة مرور جديدة. يعمل الرابط مرة واحدة فقط.",
        ],
        notes: ["إذا لم تطلب ذلك، فكلمة مرورك لم تتغير."],
        preheader: "اختر كلمة مرور جديدة لحسابك لدى {brandName}.",
        subject: "إعادة تعيين كلمة المرور لدى {brandName}",
      },
      en: {
        heading: "Reset your password",
        intro: ["Use the button below to choose a new password. The link works once."],
        notes: ["If you did not ask for this, your password has not changed."],
        preheader: "Choose a new password for {brandName}.",
        subject: "Reset your {brandName} password",
      },
    },
    optional: false,
    required: ["actionUrl"],
  },
  "auth.email_change": {
    actions: [{ action: "confirmEmail", kind: "primary" }],
    audience: "auth",
    card: [],
    copy: {
      ar: {
        heading: "تأكيد البريد الإلكتروني",
        intro: ["أكّد عنوان بريدك الإلكتروني الجديد من خلال الزر أدناه."],
        notes: ["لن يتغير عنوانك حتى تؤكده."],
        preheader: "أكّد عنوان بريدك الإلكتروني الجديد لدى {brandName}.",
        subject: "تأكيد بريدك الإلكتروني الجديد لدى {brandName}",
      },
      en: {
        heading: "Confirm your email address",
        intro: ["Confirm your new email address with the button below."],
        notes: ["Your address does not change until you confirm it."],
        preheader: "Confirm your new email address for {brandName}.",
        subject: "Confirm your new {brandName} email address",
      },
    },
    optional: false,
    required: ["actionUrl"],
  },
  "booking.confirmed": {
    actions: bookingActions,
    audience: "customer",
    card: [
      service,
      when,
      location,
      staff,
      { label: "total", value: "{price}" },
      reference,
    ],
    copy: {
      ar: {
        heading: "تم تأكيد حجزك",
        intro: ["شكرًا لحجزك لدى {brandName}. إليك تفاصيل الحجز."],
        preheader: "{serviceName}، {startAt}",
        subject: "تم تأكيد حجزك — {publicReference}",
      },
      en: {
        heading: "Your booking is confirmed",
        intro: [
          "Thank you for booking with {brandName}. Here are your booking details.",
        ],
        preheader: "{serviceName}, {startAt}",
        subject: "Your booking is confirmed — {publicReference}",
      },
    },
    optional: false,
  },
  "booking.requested": {
    actions: [{ action: "followRequest", kind: "primary" }],
    audience: "customer",
    card: [
      service,
      { ...when, label: "requestedWhen" },
      location,
      staff,
      { label: "answerBy", value: "{decisionDeadline}" },
      reference,
    ],
    copy: {
      ar: {
        heading: "تم إرسال طلبك",
        intro: ["وصل طلبك إلى {brandName}.", "سيصلك الرد قبل {decisionDeadline}."],
        notes: ["لا يُعدّ الموعد مؤكدًا حتى يُقبل الطلب."],
        preheader: "سيصلك الرد قبل {decisionDeadline}.",
        subject: "استلمنا طلبك — {publicReference}",
      },
      en: {
        heading: "Your request has been sent",
        intro: [
          "Your request has reached {brandName}.",
          "You will get an answer by {decisionDeadline}.",
        ],
        notes: ["The time is not confirmed until the request is accepted."],
        preheader: "You will get an answer by {decisionDeadline}.",
        subject: "We received your request — {publicReference}",
      },
    },
    optional: false,
  },
  "booking.rejected": {
    actions: [],
    audience: "customer",
    card: [service, reference],
    copy: {
      ar: {
        heading: "لم يُقبل طلبك",
        intro: ["نعتذر، تعذّر قبول طلبك.", "{publicReason}"],
        preheader: "نعتذر، تعذّر قبول طلبك.",
        subject: "تعذّر قبول طلبك — {publicReference}",
      },
      en: {
        heading: "Your request was not accepted",
        intro: ["Sorry, your request could not be accepted.", "{publicReason}"],
        preheader: "Sorry, your request could not be accepted.",
        subject: "Your request was not accepted — {publicReference}",
      },
    },
    optional: false,
  },
  "booking.request_expired": {
    actions: [],
    audience: "customer",
    card: [service, reference],
    copy: {
      ar: {
        heading: "أُغلق طلبك",
        intro: ["لم نتمكن من الرد في الوقت المحدد، ويمكنك طلب موعد آخر."],
        preheader: "لم نتمكن من الرد في الوقت المحدد.",
        subject: "انتهت مهلة طلبك — {publicReference}",
      },
      en: {
        heading: "Your request has closed",
        intro: ["We could not answer in time. You can request another time."],
        preheader: "We could not answer in time.",
        subject: "Your request has closed — {publicReference}",
      },
    },
    optional: false,
  },
  "booking.proposal_created": {
    actions: [{ action: "proposal", kind: "primary" }],
    audience: "customer",
    card: [
      service,
      { label: "proposedWhen", secondary: "{timeZone}", value: "{proposedStartAt}" },
      reference,
    ],
    copy: {
      ar: {
        heading: "اقتُرح عليك موعد جديد",
        intro: [
          "اقترح {brandName} موعدًا مختلفًا لطلبك. يمكنك قبوله أو رفضه من الزر أدناه.",
        ],
        preheader: "الموعد المقترح: {proposedStartAt}",
        subject: "موعد مقترح لطلبك — {publicReference}",
      },
      en: {
        heading: "A new time has been suggested",
        intro: [
          "{brandName} suggested a different time for your request. Accept or decline it with the button below.",
        ],
        preheader: "Suggested time: {proposedStartAt}",
        subject: "A new time was suggested — {publicReference}",
      },
    },
    optional: false,
  },
  "booking.proposal_declined": {
    actions: [],
    audience: "customer",
    card: [service, reference],
    copy: {
      ar: {
        heading: "طلبك الأصلي ما زال قائمًا",
        intro: ["ما زال طلبك الأصلي قائمًا لدى {brandName}."],
        preheader: "ما زال طلبك الأصلي قائمًا.",
        subject: "طلبك ما زال قائمًا — {publicReference}",
      },
      en: {
        heading: "Your original request is still open",
        intro: ["Your original request is still open with {brandName}."],
        preheader: "Your original request is still open.",
        subject: "Your request is still open — {publicReference}",
      },
    },
    optional: false,
  },
  "booking.rescheduled": {
    actions: bookingActions,
    audience: "customer",
    card: [service, { ...when, label: "newWhen" }, location, staff, reference],
    copy: {
      ar: {
        heading: "تغيّر موعد حجزك",
        intro: ["أصبح لحجزك موعد جديد، وهذه تفاصيله المحدّثة."],
        preheader: "الموعد الجديد: {startAt}",
        subject: "تغيّر موعد حجزك — {publicReference}",
      },
      en: {
        heading: "Your booking has been moved",
        intro: ["Your booking has a new time. The updated details are below."],
        preheader: "New time: {startAt}",
        subject: "Your booking has moved — {publicReference}",
      },
    },
    optional: false,
  },
  "booking.cancelled": {
    actions: [],
    audience: "customer",
    card: [service, { label: "refund", value: "{refund}" }, reference],
    copy: {
      ar: {
        heading: "تم إلغاء حجزك",
        intro: ["أُلغي حجزك لدى {brandName}.", "{publicReason}"],
        preheader: "أُلغي حجزك لدى {brandName}.",
        subject: "تم إلغاء حجزك — {publicReference}",
      },
      en: {
        heading: "Your booking is cancelled",
        intro: ["Your booking with {brandName} has been cancelled.", "{publicReason}"],
        preheader: "Your booking with {brandName} has been cancelled.",
        subject: "Your booking is cancelled — {publicReference}",
      },
    },
    optional: false,
  },
  // Issue #23. Money moving back is its own message: a customer who was
  // refunded and never told assumes they were not.
  "payment.refunded": {
    actions: [],
    audience: "customer",
    card: [service, { label: "refunded", value: "{refund}" }, reference],
    copy: {
      ar: {
        heading: "أُعيد إليك المبلغ",
        intro: [],
        notes: ["قد يستغرق ظهور المبلغ في حسابك بضعة أيام."],
        preheader: "قد يستغرق ظهور المبلغ في حسابك بضعة أيام.",
        subject: "أُعيد إليك مبلغ حجزك — {publicReference}",
      },
      en: {
        heading: "Your refund has been issued",
        intro: [],
        notes: ["It can take a few days to reach your account."],
        preheader: "It can take a few days to reach your account.",
        subject: "Your refund for {publicReference} is on its way",
      },
    },
    optional: false,
  },
  // Issue #20. The customer's reminder. It carries the manage link, because the
  // most useful thing a reminder can do is let somebody who cannot come say so.
  "booking.reminder": {
    actions: bookingActions,
    audience: "customer",
    card: [service, when, location, staff, reference],
    copy: {
      ar: {
        heading: "اقترب موعدك",
        intro: ["موعدك لدى {brandName} {leadLabel}."],
        notes: ["لا تستطيع الحضور؟ يمكنك تعديل الموعد أو إلغاؤه من زر «إدارة الحجز»."],
        preheader: "{serviceName}، {startAt}",
        subject: "تذكير بموعدك — {publicReference}",
      },
      en: {
        heading: "Your appointment is coming up",
        intro: ["Your appointment with {brandName} is {leadLabel}."],
        notes: ["Need to change or cancel? Use Manage booking above."],
        preheader: "{serviceName}, {startAt}",
        subject: "Reminder: your appointment — {publicReference}",
      },
    },
    optional: true,
  },
  // The staff alerts. These go to the tenant's own team, so they say what
  // needs doing and never carry a customer's details.
  "staff.request_pending": {
    actions: [{ action: "openDashboard", kind: "primary" }],
    audience: "staff",
    card: [service, { ...when, label: "requestedWhen" }, location, reference],
    copy: {
      ar: {
        heading: "طلب حجز بانتظار قرارك",
        intro: ["يمكنك قبوله أو اقتراح موعد آخر أو رفضه من لوحة التحكم."],
        preheader: "{serviceName}، {startAt}",
        subject: "طلب حجز بانتظار قرارك — {publicReference}",
      },
      en: {
        heading: "A booking request is waiting for a decision",
        intro: ["Accept it, suggest another time, or decline it from the Dashboard."],
        preheader: "{serviceName}, {startAt}",
        subject: "A booking request is waiting — {publicReference}",
      },
    },
    dashboardPath: "/requests",
    optional: true,
  },
  "staff.payment_exception": {
    actions: [{ action: "openDashboard", kind: "primary" }],
    audience: "staff",
    card: [service, reference],
    copy: {
      ar: {
        heading: "دفعة تحتاج إلى متابعة",
        intro: ["يُرجى معالجتها من قائمة استثناءات المدفوعات."],
        preheader: "يُرجى معالجتها من قائمة استثناءات المدفوعات.",
        subject: "دفعة تحتاج إلى متابعة — {publicReference}",
      },
      en: {
        heading: "A payment needs attention",
        intro: ["Please resolve it from the payment exceptions queue."],
        preheader: "Please resolve it from the payment exceptions queue.",
        subject: "A payment needs attention — {publicReference}",
      },
    },
    dashboardPath: "/payments",
    optional: false,
  },
  "staff.booking_cancelled": {
    actions: [{ action: "openDashboard", kind: "primary" }],
    audience: "staff",
    card: [service, when, location, reference],
    copy: {
      ar: {
        heading: "أُلغي حجز",
        intro: ["أُلغي هذا الحجز، وأصبح وقته متاحًا في الجدول."],
        preheader: "{serviceName}، {startAt}",
        subject: "أُلغي حجز — {publicReference}",
      },
      en: {
        heading: "A booking was cancelled",
        intro: [
          "This booking was cancelled and its time is free again on the schedule.",
        ],
        preheader: "{serviceName}, {startAt}",
        subject: "A booking was cancelled — {publicReference}",
      },
    },
    dashboardPath: "/bookings",
    optional: true,
  },
  "staff.delivery_failed": {
    actions: [{ action: "openDashboard", kind: "primary" }],
    audience: "staff",
    card: [service, reference],
    copy: {
      ar: {
        heading: "تعذّر إيصال رسالة",
        intro: ["ربما لم تصل الرسالة إلى العميل، فيُرجى التواصل معه بطريقة أخرى."],
        preheader: "ربما لم تصل الرسالة إلى العميل.",
        subject: "تعذّر إيصال رسالة — {publicReference}",
      },
      en: {
        heading: "A message could not be delivered",
        intro: [
          "The customer may not have received their message. Please reach them another way.",
        ],
        preheader: "The customer may not have received their message.",
        subject: "A message could not be delivered — {publicReference}",
      },
    },
    dashboardPath: "/communications",
    optional: true,
  },
  // Sent to staff, not the customer: the customer should hear from a person.
  "payment.refund_failed": {
    actions: [{ action: "openDashboard", kind: "primary" }],
    audience: "staff",
    card: [service, { label: "amount", value: "{refund}" }, reference],
    copy: {
      ar: {
        heading: "استرداد يحتاج إلى متابعة",
        intro: [
          "رفض مزوّد الدفع عملية الاسترداد هذه. يُرجى معالجتها من قائمة استثناءات المدفوعات.",
        ],
        preheader: "رفض مزوّد الدفع عملية الاسترداد هذه.",
        subject: "تعذّر إتمام استرداد مبلغ الحجز {publicReference}",
      },
      en: {
        heading: "This refund needs attention",
        intro: [
          "The payment provider did not accept this refund. Please resolve it from the payment exceptions queue.",
        ],
        preheader: "The payment provider did not accept this refund.",
        subject: "A refund for {publicReference} could not be completed",
      },
    },
    dashboardPath: "/payments",
    optional: false,
  },
  "management.otp_requested": {
    actions: [],
    audience: "customer",
    card: [
      { label: "code", ltr: true, value: "{code}" },
      { label: "expires", value: "{expiresAt}" },
    ],
    copy: {
      ar: {
        heading: "رمز التأكيد",
        intro: ["أدخل هذا الرمز للمتابعة."],
        notes: ["إذا لم تطلب هذا الرمز، فتجاهل هذه الرسالة."],
        preheader: "تنتهي صلاحية الرمز في {expiresAt}.",
        subject: "رمز التأكيد الخاص بك",
      },
      en: {
        heading: "Your confirmation code",
        intro: ["Enter this code to continue."],
        notes: ["If you did not ask for this code, ignore this message."],
        preheader: "The code expires at {expiresAt}.",
        subject: "Your confirmation code",
      },
    },
    optional: false,
    required: ["code"],
  },
  "staff.daily_digest": {
    actions: [{ action: "openToday", kind: "primary" }],
    audience: "staff",
    card: [],
    copy: {
      ar: {
        heading: "جدولك ليوم {digestDate}",
        intro: ["في جدول اليوم: {bookingCount}."],
        preheader: "في جدول اليوم: {bookingCount}.",
        subject: "جدول اليوم في {brandName}: {bookingCount}",
      },
      en: {
        heading: "Your agenda for {digestDate}",
        intro: ["On today's schedule: {bookingCount}."],
        preheader: "On today's schedule: {bookingCount}.",
        subject: "Today at {brandName}: {bookingCount}",
      },
    },
    dashboardPath: "/today",
    optional: true,
    required: ["digestDate", "bookingCount"],
  },
};

export const notificationTemplateCatalog: Readonly<
  Record<NotificationTemplateKey, TemplateMetadata>
> = Object.fromEntries(
  notificationTemplateKeys.map((key) => [
    key,
    { audience: templates[key].audience, optional: templates[key].optional },
  ]),
) as Record<NotificationTemplateKey, TemplateMetadata>;

/** Where a staff member manages their own email preferences in the Dashboard. */
export const staffPreferencesPath = "/communications/preferences";

/**
 * Substitutes declared variables only. An undeclared placeholder is a defect
 * in the caller, so it fails here rather than mailing a literal `{token}` to a
 * customer, and a line whose only variable is missing is dropped instead of
 * shipping an empty label.
 */
function fill(
  line: string,
  variables: Readonly<Record<string, string>>,
): string | null {
  let missing = false;
  const filled = line.replaceAll(/\{(\w+)\}/gu, (_match, name: string) => {
    const value = variables[name];
    if (value === undefined || value === "") {
      missing = true;
      return "";
    }
    return value;
  });
  return missing ? null : filled;
}

function present<T>(value: T | null): value is T {
  return value !== null;
}

function dashboardLink(
  brand: EmailBrand | undefined,
  locale: ContractLocale,
  path: string | undefined,
): string | null {
  const origin = safeOrigin(brand?.dashboardOrigin);
  return origin === null || path === undefined ? null : `${origin}/${locale}${path}`;
}

function directionsLink(variables: Readonly<Record<string, string>>): string | null {
  const explicit = safeLinkUrl(variables.directionsUrl);
  if (explicit !== null) return explicit;
  const address = variables.locationAddress?.trim() ?? "";
  // Directions only make sense for a real street address.
  if (address === "") return null;
  const query = [variables.locationName?.trim() ?? "", address]
    .filter((part) => part !== "")
    .join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function actionUrl(
  action: ActionKey,
  spec: TemplateSpec,
  context: TemplateContext,
  variables: Readonly<Record<string, string>>,
): string | null {
  switch (action) {
    case "manage":
    case "followRequest":
      return safeLinkUrl(variables.manageUrl);
    case "calendar":
      return safeLinkUrl(variables.calendarUrl);
    case "directions":
      return directionsLink(variables);
    case "proposal":
      return safeLinkUrl(variables.proposalUrl);
    case "signIn":
    case "resetPassword":
    case "confirmEmail":
      return safeLinkUrl(variables.actionUrl);
    case "openDashboard":
    case "openToday":
      return (
        safeLinkUrl(variables.dashboardUrl) ??
        dashboardLink(context.brand, context.locale, spec.dashboardPath)
      );
  }
}

function digestVariables(
  digest: DailyDigest | undefined,
): Readonly<Record<string, string>> {
  return digest === undefined
    ? {}
    : { bookingCount: digest.countLabel, digestDate: digest.dateLabel };
}

export function renderNotificationEmail(
  key: NotificationTemplateKey,
  context: TemplateContext,
): RenderedEmail {
  const spec = templates[key];
  const { locale } = context;
  const template = spec.copy[locale];
  const strings = chrome[locale];
  const variables: Readonly<Record<string, string>> = {
    ...context.variables,
    ...(key === "staff.daily_digest" ? digestVariables(context.digest) : {}),
    brandName: context.brandName,
  };

  const baseSubject = fill(template.subject, variables);
  if (baseSubject === null) {
    throw new Error(`Template ${key} is missing a subject variable`);
  }
  for (const name of spec.required ?? []) {
    if ((variables[name] ?? "") === "") {
      throw new Error(`Template ${key} is missing required variable ${name}`);
    }
  }
  const heading = fill(template.heading, variables);
  if (heading === null)
    throw new Error(`Template ${key} is missing a heading variable`);

  const subject =
    context.isTest === true
      ? `${strings.testSubjectPrefix}${baseSubject}`
      : baseSubject;

  const card: CardRow[] = spec.card
    .map((field): CardRow | null => {
      const value = fill(field.value, variables);
      if (value === null) return null;
      const secondary =
        field.secondary === undefined ? null : fill(field.secondary, variables);
      return {
        label: labels[locale][field.label],
        value,
        ...(secondary === null ? {} : { secondary }),
        ...(field.ltr === true ? { ltr: true } : {}),
      };
    })
    .filter(present);

  const actions: EmailAction[] = spec.actions
    .map((field): EmailAction | null => {
      const url = actionUrl(field.action, spec, context, variables);
      return url === null
        ? null
        : { kind: field.kind, label: actionLabels[locale][field.action], url };
    })
    .filter(present);
  for (const name of spec.required ?? []) {
    // A required link that is not a safe URL is as useless as a missing one.
    if (name === "actionUrl" && !actions.some((action) => action.kind === "primary")) {
      throw new Error(`Template ${key} has no usable ${name}`);
    }
  }

  const footerAudience = key === "management.otp_requested" ? "otp" : spec.audience;
  const why = fill(strings.why[footerAudience], variables) ?? "";
  const preferencesUrl = !spec.optional
    ? null
    : (safeLinkUrl(context.preferencesUrl) ??
      (spec.audience === "staff"
        ? dashboardLink(context.brand, locale, staffPreferencesPath)
        : safeLinkUrl(variables.unsubscribeUrl)));
  const preferencesLabel =
    spec.audience === "staff" ? strings.preferences : strings.stopReminders;
  const supportEmail = context.brand?.supportEmail;

  const digest = key === "staff.daily_digest" ? context.digest : undefined;
  const document: EmailDocument = {
    actions,
    ...(digest === undefined
      ? {}
      : {
          agenda: {
            digest,
            labels: {
              ...strings.agenda,
              more: strings.agenda.more.replace(
                "{count}",
                new Intl.NumberFormat(locale).format(digest.hiddenCount),
              ),
            },
          },
        }),
    ...(context.brand === undefined ? {} : { brand: context.brand }),
    brandName: context.brandName,
    card,
    fallbackLinkLabel: strings.fallbackLink,
    footer: {
      why,
      ...(preferencesUrl === null
        ? {}
        : { preferences: { label: preferencesLabel, url: preferencesUrl } }),
      ...(spec.audience !== "customer" || supportEmail === undefined
        ? {}
        : { support: { email: supportEmail, label: strings.support } }),
    },
    heading,
    intro: template.intro.map((line) => fill(line, variables)).filter(present),
    locale,
    notes: (template.notes ?? []).map((line) => fill(line, variables)).filter(present),
    preheader: fill(template.preheader, variables) ?? heading,
    subject,
    ...(context.isTest === true ? { testBanner: strings.testBanner } : {}),
  };

  return { html: renderEmailHtml(document), subject, text: renderEmailText(document) };
}
