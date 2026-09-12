import type { ContractLocale } from "@wlbp/api-contracts";

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
] as const;

export type NotificationTemplateKey = (typeof notificationTemplateKeys)[number];

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
}

interface TemplateCopy {
  readonly body: readonly string[];
  readonly heading: string;
  readonly subject: string;
}

const copy: Record<NotificationTemplateKey, Record<ContractLocale, TemplateCopy>> = {
  "booking.confirmed": {
    ar: {
      subject: "تأكيد حجزك {publicReference}",
      heading: "تم تأكيد حجزك",
      body: [
        "{serviceName} في {locationName}",
        "{startAt} ({timeZone})",
        "الإجمالي: {price}",
        "رقم المرجع: {publicReference}",
        "لإدارة هذا الحجز: {manageUrl}",
      ],
    },
    en: {
      subject: "Your booking is confirmed — {publicReference}",
      heading: "Your booking is confirmed",
      body: [
        "{serviceName} at {locationName}",
        "{startAt} ({timeZone})",
        "Total: {price}",
        "Reference: {publicReference}",
        "Manage this booking: {manageUrl}",
      ],
    },
  },
  "booking.requested": {
    ar: {
      subject: "تم استلام طلبك {publicReference}",
      heading: "تم إرسال طلبك",
      body: [
        "{serviceName}",
        "الوقت المطلوب: {startAt} ({timeZone})",
        "سنرد قبل {decisionDeadline}.",
        "رقم المرجع: {publicReference}",
        "لمتابعة الطلب: {manageUrl}",
      ],
    },
    en: {
      subject: "We received your request — {publicReference}",
      heading: "Your request has been sent",
      body: [
        "{serviceName}",
        "Requested time: {startAt} ({timeZone})",
        "We will answer by {decisionDeadline}.",
        "Reference: {publicReference}",
        "Follow your request: {manageUrl}",
      ],
    },
  },
  "booking.rejected": {
    ar: {
      subject: "تعذّر قبول طلبك {publicReference}",
      heading: "لم يُقبل طلبك",
      body: ["{serviceName}", "{publicReason}", "رقم المرجع: {publicReference}"],
    },
    en: {
      subject: "Your request was not accepted — {publicReference}",
      heading: "Your request was not accepted",
      body: ["{serviceName}", "{publicReason}", "Reference: {publicReference}"],
    },
  },
  "booking.request_expired": {
    ar: {
      subject: "انتهت مهلة طلبك {publicReference}",
      heading: "أُغلق طلبك",
      body: [
        "{serviceName}",
        "لم نتمكن من الرد في الوقت المحدد، ويمكنك طلب وقت آخر.",
        "رقم المرجع: {publicReference}",
      ],
    },
    en: {
      subject: "Your request has closed — {publicReference}",
      heading: "Your request has closed",
      body: [
        "{serviceName}",
        "We could not answer in time. You can request another time.",
        "Reference: {publicReference}",
      ],
    },
  },
  "booking.proposal_created": {
    ar: {
      subject: "وقت مقترح لحجزك {publicReference}",
      heading: "تم اقتراح وقت جديد",
      body: [
        "{serviceName}",
        "الوقت المقترح: {proposedStartAt} ({timeZone})",
        "للقبول أو الرفض: {proposalUrl}",
      ],
    },
    en: {
      subject: "A new time was suggested — {publicReference}",
      heading: "A new time has been suggested",
      body: [
        "{serviceName}",
        "Suggested time: {proposedStartAt} ({timeZone})",
        "Accept or decline: {proposalUrl}",
      ],
    },
  },
  "booking.proposal_declined": {
    ar: {
      subject: "طلبك ما زال قائمًا {publicReference}",
      heading: "طلبك الأصلي ما زال قائمًا",
      body: ["{serviceName}", "رقم المرجع: {publicReference}"],
    },
    en: {
      subject: "Your request is still open — {publicReference}",
      heading: "Your original request is still open",
      body: ["{serviceName}", "Reference: {publicReference}"],
    },
  },
  "booking.rescheduled": {
    ar: {
      subject: "تم نقل حجزك {publicReference}",
      heading: "تم نقل حجزك",
      body: [
        "{serviceName}",
        "الوقت الجديد: {startAt} ({timeZone})",
        "رقم المرجع: {publicReference}",
        "لإدارة هذا الحجز: {manageUrl}",
      ],
    },
    en: {
      subject: "Your booking has moved — {publicReference}",
      heading: "Your booking has been moved",
      body: [
        "{serviceName}",
        "New time: {startAt} ({timeZone})",
        "Reference: {publicReference}",
        "Manage this booking: {manageUrl}",
      ],
    },
  },
  "booking.cancelled": {
    ar: {
      subject: "تم إلغاء حجزك {publicReference}",
      heading: "تم إلغاء حجزك",
      body: [
        "{serviceName}",
        "{publicReason}",
        "الاسترداد: {refund}",
        "رقم المرجع: {publicReference}",
      ],
    },
    en: {
      subject: "Your booking is cancelled — {publicReference}",
      heading: "Your booking is cancelled",
      body: [
        "{serviceName}",
        "{publicReason}",
        "Refund: {refund}",
        "Reference: {publicReference}",
      ],
    },
  },
  // Issue #23. Money moving back is its own message: a customer who was
  // refunded and never told assumes they were not.
  "payment.refunded": {
    ar: {
      subject: "تم استرداد مبلغ حجزك {publicReference}",
      heading: "تم استرداد المبلغ",
      body: [
        "{serviceName}",
        "المبلغ المسترد: {refund}",
        "قد يستغرق وصوله إلى حسابك بضعة أيام.",
        "رقم المرجع: {publicReference}",
      ],
    },
    en: {
      subject: "Your refund for {publicReference} is on its way",
      heading: "Your refund has been issued",
      body: [
        "{serviceName}",
        "Refunded: {refund}",
        "It can take a few days to reach your account.",
        "Reference: {publicReference}",
      ],
    },
  },
  // Sent to staff, not the customer: the customer should hear from a person.
  "payment.refund_failed": {
    ar: {
      subject: "تعذّر استرداد مبلغ الحجز {publicReference}",
      heading: "يحتاج استرداد المبلغ إلى تدخّل",
      body: [
        "{serviceName}",
        "المبلغ: {refund}",
        "لم يقبل مزوّد الدفع هذا الاسترداد. يرجى معالجته من قائمة استثناءات المدفوعات.",
        "رقم المرجع: {publicReference}",
      ],
    },
    en: {
      subject: "A refund for {publicReference} could not be completed",
      heading: "This refund needs attention",
      body: [
        "{serviceName}",
        "Amount: {refund}",
        "The payment provider did not accept this refund. Please resolve it from the payment exceptions queue.",
        "Reference: {publicReference}",
      ],
    },
  },
  "management.otp_requested": {
    ar: {
      subject: "رمز التأكيد الخاص بك",
      heading: "رمز التأكيد",
      body: [
        "الرمز: {code}",
        "تنتهي صلاحيته في {expiresAt}.",
        "إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة.",
      ],
    },
    en: {
      subject: "Your confirmation code",
      heading: "Your confirmation code",
      body: [
        "Code: {code}",
        "It expires at {expiresAt}.",
        "If you did not ask for this code, ignore this message.",
      ],
    },
  },
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

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

export function renderNotificationEmail(
  key: NotificationTemplateKey,
  context: TemplateContext,
): RenderedEmail {
  const template = copy[key][context.locale];
  const variables = { ...context.variables, brandName: context.brandName };
  const subject = fill(template.subject, variables);
  if (subject === null) {
    throw new Error(`Template ${key} is missing a subject variable`);
  }
  const lines = template.body
    .map((line) => fill(line, variables))
    .filter((line): line is string => line !== null);
  const direction = context.locale === "ar" ? "rtl" : "ltr";

  // The plain-text part carries the same facts in the same order, because a
  // client that shows text only must still be a complete message.
  const text = [template.heading, "", ...lines, "", context.brandName].join("\n");
  const html = [
    `<!doctype html><html lang="${context.locale}" dir="${direction}">`,
    '<head><meta charset="utf-8">',
    `<title>${escapeHtml(subject)}</title></head>`,
    `<body dir="${direction}" style="font-family:system-ui,sans-serif;line-height:1.5">`,
    `<h1>${escapeHtml(template.heading)}</h1>`,
    ...lines.map((line) => `<p>${escapeHtml(line)}</p>`),
    `<p><small>${escapeHtml(context.brandName)}</small></p>`,
    "</body></html>",
  ].join("");

  return { html, subject, text };
}
