"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { ExternalLink, Link2, RefreshCw } from "lucide-react";
import type { Locale } from "@wlbp/i18n";
import { Alert, AlertDescription, Button } from "@wlbp/ui-foundation";
import { startPaymentOnboarding } from "./actions";
function Attempt({ locale, attempt }: { locale: Locale; attempt: string }) {
  const [state, action, pending] = useActionState(startPaymentOnboarding, {});
  const requestId = attempt;
  const m = (en: string, ar: string) => (locale === "ar" ? ar : en);
  return (
    <form action={action} className="grid gap-3">
      <input name="locale" type="hidden" value={locale} />
      <input name="requestId" type="hidden" value={requestId} />
      <p className="text-sm leading-relaxed text-muted-foreground">
        {m(
          "Recent MFA is required. The provider link alone does not confirm that charges or payouts are enabled.",
          "يلزم تحقق حديث متعدد العوامل. رابط المزود وحده لا يُثبت تفعيل التحصيل أو التحويلات.",
        )}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          loading={pending}
          loadingLabel={m("Preparing provider link…", "جارٍ تجهيز رابط المزود…")}
        >
          <Link2 aria-hidden="true" />
          {m("Prepare secure onboarding link", "تجهيز رابط إعداد آمن")}
        </Button>
        {state.destination ? (
          <Button asChild variant="outline">
            <Link href={state.destination} rel="noreferrer">
              <ExternalLink aria-hidden="true" />
              {m("Continue at Stripe", "المتابعة لدى Stripe")}
            </Link>
          </Button>
        ) : null}
      </div>
      {state.refused ? (
        <Alert tone="danger">
          <AlertDescription className="text-foreground">
            {m(
              "Onboarding is unavailable or your recent MFA/permission is insufficient. Verify your account and retry.",
              "الإعداد غير متاح، أو أن التحقق الحديث أو الصلاحيات غير كافية. تحقّق من حسابك ثم أعد المحاولة.",
            )}{" "}
            <Link
              className="font-semibold text-primary underline-offset-4 hover:underline"
              href={`/${locale}/auth/mfa?returnTo=${encodeURIComponent(`/${locale}/integrations`)}`}
            >
              {m("Verify account", "التحقق من الحساب")}
            </Link>
          </AlertDescription>
        </Alert>
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
    <div className="grid gap-3">
      <Attempt key={current} locale={locale} attempt={current} />
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setCurrent(crypto.randomUUID())}
        >
          <RefreshCw aria-hidden="true" />
          {locale === "ar" ? "بدء محاولة رابط جديدة" : "Start a fresh link attempt"}
        </Button>
      </div>
    </div>
  );
}
