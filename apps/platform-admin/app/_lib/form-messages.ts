import type { Locale } from "@wlbp/i18n";
import { authCopy } from "./auth-copy";
import { errorCopy, say, type Copy } from "./copy";

/** Form error codes the browser adds to the operator error codes. */
export const formErrorCopy = {
  network: [
    "The request did not reach Platform Admin. Check your connection, then refresh and check the current state before retrying.",
    "لم يصل الطلب إلى إدارة المنصة. تحقّق من اتصالك، ثم حدّث الصفحة وتأكد من الحالة الحالية قبل إعادة المحاولة.",
  ],
  fields_invalid: [
    "Some values need attention. Check the highlighted fields.",
    "بعض القيم تحتاج إلى مراجعة. تحقّق من الحقول المميّزة.",
  ],
  code_format: [
    "Enter the 6-digit code from your authenticator app.",
    "أدخل الرمز المكوّن من ٦ أرقام من تطبيق المصادقة.",
  ],
} as const satisfies Record<string, Copy>;

function inLocale(
  locale: Locale,
  entries: Record<string, Copy>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(entries).map(([code, copy]) => [code, say(locale, copy)]),
  );
}

/** Dictionary for `<Form messages>` on every operator mutation form. */
export function operatorFormMessages(locale: Locale): Record<string, string> {
  return inLocale(locale, { ...errorCopy, ...formErrorCopy });
}

/** Sign-in and authenticator failures, by code. */
export const authErrorCodes = {
  invalid_credentials: authCopy.invalidCredentials,
  invalid_code: authCopy.invalidCode,
  no_factor: authCopy.noFactor,
  auth_unavailable: authCopy.unavailable,
  enroll_failed: authCopy.enrollFailed,
} as const satisfies Record<string, Copy>;

/** Dictionary for `<Form messages>` on the sign-in, MFA and step-up forms. */
export function authFormMessages(locale: Locale): Record<string, string> {
  return inLocale(locale, { ...formErrorCopy, ...authErrorCodes });
}
