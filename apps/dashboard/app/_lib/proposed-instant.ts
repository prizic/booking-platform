import { resolveZonedLocalDateTime } from "@wlbp/i18n";

/**
 * The Dashboard picker submits local civil time. The instant it means is
 * resolved against the location's own timezone, never the reader's browser.
 * A nonexistent spring-forward time has no instant and is refused; a duplicated
 * fall-back time resolves to the earlier of the two, which is the one the
 * customer sees first.
 *
 * Browser-safe (no server imports) so the form schemas can run the same rule
 * the server action enforces.
 */
export function resolveProposedInstant(
  localDateTime: string | null,
  timeZone: string,
  fold: "0" | "1" | null = null,
): string | null {
  const match =
    localDateTime === null
      ? null
      : /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u.exec(localDateTime);
  if (match === null) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  try {
    const resolution = resolveZonedLocalDateTime(
      { day, hour, minute, month, year },
      timeZone,
    );
    if (resolution.kind === "gap" || (resolution.instants.length > 1 && fold === null))
      return null;
    return resolution.instants[fold === "1" ? 1 : 0] ?? null;
  } catch {
    return null;
  }
}
