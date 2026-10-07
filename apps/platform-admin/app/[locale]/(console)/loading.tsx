"use client";

import { isLocale } from "@wlbp/i18n";
import { Skeleton } from "@wlbp/ui-foundation";
import { useParams } from "next/navigation";
import { say, stateCopy } from "../../_lib/copy";

export default function Loading() {
  const { locale } = useParams<{ locale: string }>();
  return (
    <div className="grid gap-6">
      <p className="sr-only" role="status" aria-live="polite">
        {say(isLocale(locale) ? locale : "en", stateCopy.loading)}
      </p>
      <div className="grid gap-3">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-16 w-full" />
      <div className="grid gap-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-11 w-full" />
        ))}
      </div>
    </div>
  );
}
