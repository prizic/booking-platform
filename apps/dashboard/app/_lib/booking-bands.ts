import type { Locale } from "@wlbp/i18n";
import { dyeIndexFor, type BandLane, type BandSegment } from "@wlbp/ui-foundation";
import type { TodayItemV1 } from "./dashboard-access";
import { bandStateFor, formatHour, formatTimeRange } from "./booking-display";
import { workspaceMessage } from "./workspace-copy";
import { workspaceStatus } from "./workspace-status";

type Named = { readonly id: string; readonly name: string };

export interface DayBands {
  readonly lanes: readonly BandLane[];
  readonly segments: readonly BandSegment[];
  readonly startMinute: number;
  readonly endMinute: number;
  readonly nowMinute: number | undefined;
  readonly hourLabel: (minute: number) => string;
}

/** One booking per id, earliest first; a booking may sit in several queues. */
export function uniqueBookings(items: readonly TodayItemV1[]): readonly TodayItemV1[] {
  return [...new Map(items.map((item) => [item.bookingId, item])).values()].sort(
    (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt),
  );
}

/**
 * Lays a civil day's bookings out as woven bands: one lane per team member
 * (or per resource when the booking has no staff, or per resource only when
 * `laneBy` is "resource"). Minutes count elapsed time from the day's first
 * instant in its zone, so a DST day still draws its true length.
 */
export function buildDayBands(input: {
  readonly items: readonly TodayItemV1[];
  readonly from: string;
  readonly to: string;
  readonly locale: Locale;
  readonly timeZone: string;
  readonly now: Date;
  readonly laneBy: "staff" | "resource";
  readonly staff: readonly Named[];
  readonly resources: readonly Named[];
  readonly bookingHref: (bookingId: string) => string;
  readonly customerHidden: string;
  /**
   * Draw a lane for every active member (or resource) even when it holds no
   * booking, so the day reads as the whole team's loom, not only the busy part.
   */
  readonly showEmptyLanes?: boolean;
}): DayBands {
  const { locale } = input;
  const dayStart = Date.parse(input.from);
  const dayLength = Math.max(60, (Date.parse(input.to) - dayStart) / 60000);
  const bookings = uniqueBookings(input.items);

  const laneFor = (item: TodayItemV1): BandLane => {
    const resourceLane = (id: string): BandLane => ({
      id: `resource:${id}`,
      label:
        input.resources.find((resource) => resource.id === id)?.name ??
        workspaceMessage(locale, "scheduleUnknownResource"),
    });
    if (input.laneBy === "resource") {
      return item.resourceId
        ? resourceLane(item.resourceId)
        : { id: "unassigned", label: workspaceMessage(locale, "calendarNoResource") };
    }
    if (item.staffId) {
      return {
        id: `staff:${item.staffId}`,
        label:
          input.staff.find((member) => member.id === item.staffId)?.name ??
          workspaceMessage(locale, "scheduleUnknownMember"),
      };
    }
    if (item.resourceId) return resourceLane(item.resourceId);
    return { id: "unassigned", label: workspaceMessage(locale, "scheduleUnassigned") };
  };

  const lanes = new Map<string, BandLane>();
  if (input.showEmptyLanes) {
    // Lanes follow the same order as the workspace choices. Staff come first
    // on the staff view; a tenant without staff falls back to its resources.
    const seed =
      input.laneBy === "staff" && input.staff.length > 0
        ? input.staff.map((member) => ({
            id: `staff:${member.id}`,
            label: member.name,
          }))
        : input.resources.map((resource) => ({
            id: `resource:${resource.id}`,
            label: resource.name,
          }));
    for (const lane of seed) if (!lanes.has(lane.id)) lanes.set(lane.id, lane);
  }
  const segments: BandSegment[] = [];
  for (const item of bookings) {
    const lane = laneFor(item);
    if (!lanes.has(lane.id)) lanes.set(lane.id, lane);
    const startMinute = Math.max(0, (Date.parse(item.startAt) - dayStart) / 60000);
    const endMinute = Math.min(dayLength, (Date.parse(item.endAt) - dayStart) / 60000);
    const time = formatTimeRange(
      item.startAt,
      item.endAt,
      locale,
      item.locationTimeZone,
    );
    const customer = item.customerDisplayName ?? input.customerHidden;
    const status = workspaceStatus(locale, item.status);
    segments.push({
      id: item.bookingId,
      laneId: lane.id,
      startMinute,
      endMinute: Math.max(endMinute, startMinute + 5),
      title: item.serviceName,
      subtitle: item.customerDisplayName ?? time,
      description: [
        time,
        item.serviceName,
        customer,
        status,
        item.publicReference,
      ].join(locale === "ar" ? "، " : ", "),
      href: input.bookingHref(item.bookingId),
      state: bandStateFor(item.status),
      // The read carries no service id, so the service name keys the dye:
      // the same service keeps the same colour on every screen.
      dye: dyeIndexFor(item.serviceName),
    });
  }

  // An empty day still draws the working window (08:00–18:00).
  const earliest = Math.min(8 * 60, ...segments.map((segment) => segment.startMinute));
  const latest = Math.max(18 * 60, ...segments.map((segment) => segment.endMinute));
  const startMinute = Math.max(0, Math.min(8 * 60, Math.floor(earliest / 60) * 60));
  const endMinute = Math.min(
    dayLength,
    Math.max(18 * 60, Math.ceil(latest / 60) * 60, startMinute + 60),
  );
  const nowOffset = (input.now.getTime() - dayStart) / 60000;

  return {
    lanes: [...lanes.values()],
    segments,
    startMinute,
    endMinute,
    nowMinute: nowOffset >= 0 && nowOffset <= dayLength ? nowOffset : undefined,
    hourLabel: (minute) =>
      formatHour(dayStart + minute * 60000, locale, input.timeZone),
  };
}
