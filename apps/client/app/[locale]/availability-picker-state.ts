import type { AvailabilitySlotV1 } from "@wlbp/api-contracts";
import { resolveZonedLocalDateTime, type Locale } from "@wlbp/i18n";

import { availabilityQuerySchema } from "./availability-schema";

/** The filters one availability search was submitted with. */
export interface AvailabilityQuerySnapshot {
  readonly date: string;
  readonly partySize: number;
  readonly timeZone: string;
}

export interface AvailabilityTarget {
  readonly locale: Locale;
  readonly locationId: string;
  readonly serviceId: string;
}

export function availabilitySlotIdentity(slot: AvailabilitySlotV1): string {
  return JSON.stringify([slot.startAt, slot.endAt, slot.allocationKind, slot.staffId]);
}

/**
 * One cache entry per submitted search. Results are only ever rendered under
 * the key they were fetched for, so a changed filter can never show the times
 * (or the selection) of an earlier search, and a slow earlier response can
 * never land in a newer search.
 */
export function availabilityQueryKey(
  target: AvailabilityTarget,
  snapshot: AvailabilityQuerySnapshot,
) {
  return [
    "availability",
    target.serviceId,
    target.locationId,
    snapshot.date,
    snapshot.timeZone,
    snapshot.partySize,
    target.locale,
  ] as const;
}

function localMidnight(localDate: string, timeZone: string): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const resolution = resolveZonedLocalDateTime(
    { year: year!, month: month!, day: day!, hour: 0, minute: 0 },
    timeZone,
  );
  if (resolution.kind === "gap") throw new Error("Invalid local date");
  return resolution.instants[0];
}

function addCalendarDays(localDate: string, days: number): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + days));
  return [
    date.getUTCFullYear().toString().padStart(4, "0"),
    (date.getUTCMonth() + 1).toString().padStart(2, "0"),
    date.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
}

/**
 * The seven-day window starting at local midnight of the chosen day, in the
 * chosen zone, as the query string the availability route validates. Throws
 * when the day cannot be resolved; the search then shows its error state.
 */
export function availabilitySearchParams(
  target: AvailabilityTarget,
  snapshot: AvailabilityQuerySnapshot,
): URLSearchParams {
  const query = {
    endBefore: localMidnight(addCalendarDays(snapshot.date, 7), snapshot.timeZone),
    locale: target.locale,
    locationId: target.locationId,
    partySize: String(snapshot.partySize),
    serviceId: target.serviceId,
    startAfter: localMidnight(snapshot.date, snapshot.timeZone),
    timeZone: snapshot.timeZone,
  };
  // The same schema the route applies, so a request it would refuse is never sent.
  availabilityQuerySchema.parse(query);
  return new URLSearchParams(query);
}
