"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import type { Locale } from "@wlbp/i18n";
import { startPaymentOnboarding } from "./actions";
function Attempt({ locale, attempt }: { locale: Locale; attempt: string }) {
  const [state, action, pending] = useActionState(startPaymentOnboarding, {});
  const requestId = attempt;
  const m = (en: string, ar: string) => (locale === "ar" ? ar : en);
  return (
    <form action={action}>
      <input name="locale" type="hidden" value={locale} />
      <input name="requestId" type="hidden" value={requestId} />
      <p>
        {m(
          "Recent MFA is required. The provider link alone does not confirm that charges or payouts are enabled.",
          "يلزم تحقق متعدد العوامل حديث. لا يُثبت رابط المزود تفعيل التحصيل أو التحويلات.",
        )}
      </p>
      <button type="submit" disabled={pending}>
        {m(
          pending ? "Preparing provider link…" : "Prepare secure onboarding link",
          pending ? "جارٍ تجهيز رابط المزود…" : "تجهيز رابط إعداد آمن",
        )}
      </button>
      {state.destination ? (
        <p>
          <Link href={state.destination} rel="noreferrer">
            {m("Continue at Stripe", "المتابعة لدى Stripe")}
          </Link>
        </p>
      ) : null}
      {state.refused ? (
        <p role="alert">
          {m(
            "Onboarding is unavailable or your recent MFA/permission is insufficient. Verify your account and retry.",
            "الإعداد غير متاح أو أن التحقق الحديث أو الصلاحيات غير كافية. تحقق من حسابك ثم أعد المحاولة.",
          )}{" "}
          <Link
            href={`/${locale}/auth/mfa?returnTo=${encodeURIComponent(`/${locale}/integrations`)}`}
          >
            {m("Verify account", "التحقق من الحساب")}
          </Link>
        </p>
      ) : null}
    </form>
  );
}

export function OnboardingForm({
  locale,
  attempt,
}: {
  locale: Locale;
  attempt: string;
}) {
  const [current, setCurrent] = useState(attempt);
  return (
    <>
      <Attempt key={current} locale={locale} attempt={current} />
      <button type="button" onClick={() => setCurrent(crypto.randomUUID())}>
        {locale === "ar" ? "بدء محاولة رابط جديدة" : "Start a fresh link attempt"}
      </button>
    </>
  );
}
