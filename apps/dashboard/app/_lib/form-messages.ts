import type { Locale } from "@wlbp/i18n";

import { dashboardCopy } from "./copy";

/**
 * Domain error codes a Dashboard server action can return as an ActionResult
 * `formError` (or a field error), rendered in the form's language by
 * `<Form messages={dashboardFormMessages(locale)}>`. Generic validation codes
 * ("required", "too_long", ...) come from the design system; this map only
 * adds what is specific to the Dashboard. Outcome codes reuse the sentences
 * the result banners already use, so a refusal reads the same in a form as in
 * the page that reports it.
 */
export const dashboardFormMessageMap: Readonly<
  Record<Locale, Readonly<Record<string, string>>>
> = {
  en: {
    network:
      "The workspace could not be reached, so nothing was saved. Check your connection and try again.",
    unavailable: "This action is temporarily unavailable. Nothing changed.",
    denied: "Your current membership cannot do this.",
    local_time_unresolved:
      "That local time does not exist, or happens twice, in the location's time zone. Choose another time or the occurrence you mean.",
    "backend-unavailable": dashboardCopy.en.requestsResultUnavailable,
    "invalid-request": dashboardCopy.en.requestsResultInvalid,
    "not-authorized": dashboardCopy.en.requestsResultNotAuthorized,
    "revision-conflict": dashboardCopy.en.requestsResultConflict,
    "slot-unavailable": dashboardCopy.en.requestsResultSlotUnavailable,
    "not-allowed": dashboardCopy.en.bookingsResultNotAllowed,
    "reason-required": dashboardCopy.en.bookingsResultReasonRequired,
    "resend-unavailable": dashboardCopy.en.bookingsResendUnavailable,
    "already-resolved": dashboardCopy.en.paymentsResultAlreadyResolved,
    "not-eligible": dashboardCopy.en.paymentsResultNotEligible,
  },
  ar: {
    network:
      "تعذّر الوصول إلى مساحة العمل، فلم يُحفظ شيء. تحقّق من الاتصال ثم أعد المحاولة.",
    unavailable: "هذا الإجراء غير متاح مؤقتًا، ولم يتغيّر شيء.",
    denied: "لا تسمح عضويتك الحالية بهذا الإجراء.",
    local_time_unresolved:
      "هذا الوقت المحلي غير موجود أو يتكرر مرتين في المنطقة الزمنية للموقع. اختر وقتًا آخر أو حدّد أيّ الوقتين تقصد.",
    "backend-unavailable": dashboardCopy.ar.requestsResultUnavailable,
    "invalid-request": dashboardCopy.ar.requestsResultInvalid,
    "not-authorized": dashboardCopy.ar.requestsResultNotAuthorized,
    "revision-conflict": dashboardCopy.ar.requestsResultConflict,
    "slot-unavailable": dashboardCopy.ar.requestsResultSlotUnavailable,
    "not-allowed": dashboardCopy.ar.bookingsResultNotAllowed,
    "reason-required": dashboardCopy.ar.bookingsResultReasonRequired,
    "resend-unavailable": dashboardCopy.ar.bookingsResendUnavailable,
    "already-resolved": dashboardCopy.ar.paymentsResultAlreadyResolved,
    "not-eligible": dashboardCopy.ar.paymentsResultNotEligible,
  },
};

/** The Dashboard's domain error-code dictionary for one locale. */
export function dashboardFormMessages(
  locale: Locale,
): Readonly<Record<string, string>> {
  return dashboardFormMessageMap[locale];
}
