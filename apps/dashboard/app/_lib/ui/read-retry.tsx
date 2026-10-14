"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@wlbp/ui-foundation";
import type { Locale } from "@wlbp/i18n";
export function ReadRetry({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      loading={pending}
      loadingLabel={locale === "ar" ? "جارٍ التحميل…" : "Loading…"}
      onClick={() => startTransition(() => router.refresh())}
    >
      {locale === "ar" ? "إعادة المحاولة" : "Retry"}
    </Button>
  );
}
