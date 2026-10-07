"use client";
import type { Locale } from "@wlbp/i18n";
import { useActionMutation } from "@wlbp/ui-foundation";
import { ConfirmAction } from "../services/confirm-submit";
import { useResultNavigation } from "../services/form-hooks";
import { MutationFeedback } from "../services/mutation-feedback";
import { retryCommunication } from "./actions";
import { dashboardFormMessages } from "../../_lib/form-messages";

export function CommunicationRetry({
  bookingId,
  locale,
}: {
  bookingId: string;
  locale: Locale;
}) {
  const navigate = useResultNavigation();
  const mutation = useActionMutation(retryCommunication, {
    refresh: false,
    onSuccess: (data) => navigate(data.destination),
  });
  const m = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const refused = m(
    "Retry refused or unavailable. Check permission and suppression status.",
    "رُفضت إعادة المحاولة أو أنها غير متاحة. تحقّق من الصلاحيات وحالة منع الإرسال.",
  );
  return (
    <div className="grid justify-items-end gap-2" data-communication-retry={bookingId}>
      <ConfirmAction
        variant="outline"
        size="sm"
        label={m("Retry email", "إعادة محاولة البريد")}
        pending={mutation.isPending}
        pendingLabel={m("Retrying…", "جارٍ إعادة المحاولة…")}
        title={m("Retry this booking email?", "هل تريد إعادة محاولة بريد هذا الحجز؟")}
        description={m(
          "The message is queued again. Queuing does not confirm delivery.",
          "تُضاف الرسالة إلى قائمة الإرسال مجددًا. الإضافة إلى القائمة لا تؤكد التسليم.",
        )}
        confirmLabel={m("Retry email", "إعادة محاولة البريد")}
        cancelLabel={m("Cancel", "إلغاء")}
        onConfirm={() => mutation.mutate({ locale, bookingId, confirm: "yes" })}
      />
      <div className="text-start">
        <MutationFeedback
          locale={locale}
          // Every refusal (validation, permission, suppression, provider) reads the same.
          messages={{ ...dashboardFormMessages(locale), refused, invalid: refused }}
          result={mutation.data?.ok === false ? mutation.data : undefined}
          transportFailed={mutation.isError}
        />
      </div>
    </div>
  );
}
