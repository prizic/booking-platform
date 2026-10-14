import type { Locale } from "@wlbp/i18n";
import { ErrorState, EmptyState as FoundationEmptyState } from "@wlbp/ui-foundation";
import { Inbox, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { errorCopy, say, stateCopy } from "../copy";
import { ReadRetry } from "./read-retry";

export function EmptyState({
  locale,
  filtered,
  title,
  body,
  action,
}: {
  locale: Locale;
  filtered?: boolean;
  title?: string | undefined;
  body?: string | undefined;
  action?: ReactNode;
}) {
  const description =
    body ?? (filtered ? say(locale, stateCopy.emptyFiltered) : undefined);
  return (
    <div role="status">
      <FoundationEmptyState
        icon={filtered ? <SearchX aria-hidden="true" /> : <Inbox aria-hidden="true" />}
        title={title ?? say(locale, stateCopy.emptyTitle)}
        {...(description ? { description } : {})}
        {...(action ? { action } : {})}
      />
    </div>
  );
}

/** A failed read. Shown instead of data, never alongside a substitute value. */
export function UnavailableState({ locale, code }: { locale: Locale; code?: string }) {
  const specific = code && code !== "unavailable" ? errorCopy[code] : undefined;
  return (
    <ErrorState
      title={say(locale, stateCopy.unavailableTitle)}
      description={say(locale, specific ?? stateCopy.unavailableBody)}
      retry={<ReadRetry locale={locale} />}
    />
  );
}

const unknownKinds = {
  notObserved: stateCopy.notObserved,
  notReported: stateCopy.notReported,
  never: stateCopy.never,
  unknown: stateCopy.unknown,
  none: stateCopy.none,
} as const;

/** A value nobody has observed: said in words, never shown as zero or healthy. */
export function Unknown({
  locale,
  kind = "notObserved",
}: {
  locale: Locale;
  kind?: keyof typeof unknownKinds;
}) {
  return (
    <span className="text-muted-foreground">{say(locale, unknownKinds[kind])}</span>
  );
}
