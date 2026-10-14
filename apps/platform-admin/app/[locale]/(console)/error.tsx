"use client";
import { isLocale } from "@wlbp/i18n";
import { Button, ErrorState } from "@wlbp/ui-foundation";
import { useParams } from "next/navigation";
import { useTransition } from "react";
import { formCopy, say, stateCopy } from "../../_lib/copy";
import { DataPage } from "../../_lib/shell/data-page";
/** Unexpected render failures stay sanitized in development too; retry is always explicit. */
export default function ConsoleError({ retry }: { retry: () => void }) {
  const { locale: raw } = useParams<{ locale: string }>();
  const locale = isLocale(raw) ? raw : "en";
  const [pending, startTransition] = useTransition();
  return (
    <DataPage locale={locale} title={say(locale, stateCopy.unavailableTitle)}>
      <ErrorState
        title={say(locale, formCopy.errorTitle)}
        description={say(locale, stateCopy.unavailableBody)}
        retry={
          <Button
            variant="outline"
            loading={pending}
            loadingLabel={say(locale, formCopy.working)}
            onClick={() => startTransition(() => retry())}
          >
            {say(locale, formCopy.retry)}
          </Button>
        }
      />
    </DataPage>
  );
}
