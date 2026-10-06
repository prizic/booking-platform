"use client";

import { isLocale } from "@wlbp/i18n";
import { useParams } from "next/navigation";
import { say, stateCopy } from "../../_lib/copy";

export default function Loading() {
  const { locale } = useParams<{ locale: string }>();
  return (
    <p className="state" role="status" aria-live="polite">
      {say(isLocale(locale) ? locale : "en", stateCopy.loading)}
    </p>
  );
}
