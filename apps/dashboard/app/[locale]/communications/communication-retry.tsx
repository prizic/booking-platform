"use client";
import { useActionState } from "react";
import type { Locale } from "@wlbp/i18n";
import { retryCommunication } from "./actions";
export function CommunicationRetry({
  bookingId,
  locale,
}: {
  bookingId: string;
  locale: Locale;
}) {
  const [state, action, pending] = useActionState(retryCommunication, {});
  const m = (en: string, ar: string) => (locale === "ar" ? ar : en);
  return (
    <form action={action}>
      <input name="locale" type="hidden" value={locale} />
      <input name="bookingId" type="hidden" value={bookingId} />
      <label>
        <input name="confirm" type="checkbox" value="yes" required disabled={pending} />
        {m("Confirm retry of this booking email", "تأكيد إعادة محاولة بريد هذا الحجز")}
      </label>
      <button type="submit" disabled={pending}>
        {m(
          pending ? "Retrying…" : "Retry email",
          pending ? "جارٍ إعادة المحاولة…" : "إعادة محاولة البريد",
        )}
      </button>
      {state.error ? (
        <p role="alert">
          {m(
            "Retry refused or unavailable. Check permission and suppression status.",
            "إعادة المحاولة مرفوضة أو غير متاحة. تحقق من الصلاحيات ومنع الإرسال.",
          )}
        </p>
      ) : null}
    </form>
  );
}
