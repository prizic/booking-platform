"use client";
import { useActionState } from "react";
import type { Locale } from "@wlbp/i18n";
import { Alert, AlertDescription } from "@wlbp/ui-foundation";
import { ConfirmSubmit } from "../services/confirm-submit";
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
    <form action={action} className="grid justify-items-end gap-2">
      <input name="locale" type="hidden" value={locale} />
      <input name="bookingId" type="hidden" value={bookingId} />
      <ConfirmSubmit
        variant="outline"
        size="sm"
        label={m("Retry email", "إعادة محاولة البريد")}
        pending={pending}
        pendingLabel={m("Retrying…", "جارٍ إعادة المحاولة…")}
        title={m("Retry this booking email?", "هل تريد إعادة محاولة بريد هذا الحجز؟")}
        description={m(
          "The message is queued again. Queuing does not confirm delivery.",
          "تُضاف الرسالة إلى قائمة الإرسال مجددًا. الإضافة إلى القائمة لا تؤكد التسليم.",
        )}
        confirmLabel={m("Retry email", "إعادة محاولة البريد")}
        cancelLabel={m("Cancel", "إلغاء")}
      />
      {state.error ? (
        <Alert tone="danger" className="text-start">
          <AlertDescription className="text-foreground">
            {m(
              "Retry refused or unavailable. Check permission and suppression status.",
              "رُفضت إعادة المحاولة أو أنها غير متاحة. تحقّق من الصلاحيات وحالة منع الإرسال.",
            )}
          </AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
