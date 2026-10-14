"use client";
import { isLocale } from "@wlbp/i18n";
import { LoadingState } from "@wlbp/ui-foundation";
import { useParams } from "next/navigation";
import { say, stateCopy } from "../../_lib/copy";
export default function Loading() {
  const { locale } = useParams<{ locale: string }>();
  return (
    <LoadingState
      rows={6}
      label={say(isLocale(locale) ? locale : "en", stateCopy.loading)}
    />
  );
}
