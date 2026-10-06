import type { Locale } from "@wlbp/i18n";
import type { ReactNode } from "react";
import { errorCopy, say, stateCopy } from "../copy";

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
  return (
    <div className="state" role="status">
      <h2>{title ?? say(locale, stateCopy.emptyTitle)}</h2>
      <p>{body ?? (filtered ? say(locale, stateCopy.emptyFiltered) : "")}</p>
      {action}
    </div>
  );
}

/** A failed read. Shown instead of data, never alongside a substitute value. */
export function UnavailableState({ locale, code }: { locale: Locale; code?: string }) {
  const specific = code && code !== "unavailable" ? errorCopy[code] : undefined;
  return (
    <div className="state state--unavailable" role="alert">
      <h2>{say(locale, stateCopy.unavailableTitle)}</h2>
      <p>{say(locale, specific ?? stateCopy.unavailableBody)}</p>
    </div>
  );
}

const unknownKinds = {
  notObserved: stateCopy.notObserved,
  notReported: stateCopy.notReported,
  never: stateCopy.never,
  unknown: stateCopy.unknown,
  none: stateCopy.none,
} as const;

export function Unknown({
  locale,
  kind = "notObserved",
}: {
  locale: Locale;
  kind?: keyof typeof unknownKinds;
}) {
  return <span className="value-unknown">{say(locale, unknownKinds[kind])}</span>;
}
