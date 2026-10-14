"use client";
import type { Locale } from "@wlbp/i18n";
import { Button } from "@wlbp/ui-foundation";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { formCopy, say } from "../copy";
export function ReadRetry({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      loading={pending}
      loadingLabel={say(locale, formCopy.working)}
      onClick={() => startTransition(() => router.refresh())}
    >
      {say(locale, formCopy.retry)}
    </Button>
  );
}
