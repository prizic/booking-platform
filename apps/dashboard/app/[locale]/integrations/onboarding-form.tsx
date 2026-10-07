"use client";
import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Link2, RefreshCw } from "lucide-react";
import type { Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  Button,
  useActionMutation,
  useZodForm,
} from "@wlbp/ui-foundation";
import { startPaymentOnboarding } from "./actions";
import { paymentOnboardingSchema } from "./onboarding-schema";

function Attempt({ locale, attempt }: { locale: Locale; attempt: string }) {
  // Preparing a link changes nothing on this page, so nothing is refreshed.
  const mutation = useActionMutation(startPaymentOnboarding, { refresh: false });
  // No visible fields: the attempt id and language are the whole input.
  const form = useZodForm(paymentOnboardingSchema, {
    defaultValues: { locale, requestId: attempt },
  });
  const m = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const destination = mutation.data?.ok ? mutation.data.data.destination : null;
  const refused = mutation.isError || mutation.data?.ok === false;
  return (
    <form
      noValidate
      className="grid gap-3"
      onSubmit={form.handleSubmit(() => mutation.mutate(form.getValues()))}
    >
      <p className="text-sm leading-relaxed text-muted-foreground">
        {m(
          "Recent MFA is required. The provider link alone does not confirm that charges or payouts are enabled.",
          "يلزم تحقق حديث متعدد العوامل. رابط المزود وحده لا يُثبت تفعيل التحصيل أو التحويلات.",
        )}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          loading={mutation.isPending}
          loadingLabel={m("Preparing provider link…", "جارٍ تجهيز رابط المزود…")}
        >
          <Link2 aria-hidden="true" />
          {m("Prepare secure onboarding link", "تجهيز رابط إعداد آمن")}
        </Button>
        {destination ? (
          <Button asChild variant="outline">
            <Link href={destination} rel="noreferrer">
              <ExternalLink aria-hidden="true" />
              {m("Continue at Stripe", "المتابعة لدى Stripe")}
            </Link>
          </Button>
        ) : null}
      </div>
      {refused ? (
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
