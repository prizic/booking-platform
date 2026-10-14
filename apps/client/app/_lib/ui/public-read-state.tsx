import type { Locale } from "@wlbp/i18n";
import { Alert, AlertDescription, AlertTitle, EmptyState } from "@wlbp/ui-foundation";
import { CalendarDays } from "lucide-react";
import { getClientMessage } from "../copy";
import { journeyMessage } from "../journey-copy";
import { ReadRetry } from "./read-retry";

export function PublicReadError({
  locale,
  kind,
}: {
  readonly locale: Locale;
  readonly kind: "catalog" | "content";
}) {
  return (
    <Alert tone="danger">
      <AlertTitle>
        {journeyMessage(
          locale,
          kind === "catalog" ? "catalogErrorTitle" : "contentErrorTitle",
        )}
      </AlertTitle>
      <AlertDescription>
        <p>
          {journeyMessage(
            locale,
            kind === "catalog" ? "catalogErrorBody" : "contentErrorBody",
          )}
        </p>
        <ReadRetry label={journeyMessage(locale, "retry")} />
      </AlertDescription>
    </Alert>
  );
}
export function CatalogEmpty({ locale }: { readonly locale: Locale }) {
  return (
    <EmptyState
      icon={<CalendarDays aria-hidden="true" />}
      title={getClientMessage(locale, "catalogEmptyTitle")}
      description={getClientMessage(locale, "catalogEmptyBody")}
    />
  );
}
