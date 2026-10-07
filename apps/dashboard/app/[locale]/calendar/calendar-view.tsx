import { occupiesStartCell } from "./calendar-cells";
import Link from "next/link";
import type { Locale } from "@wlbp/i18n";
import {
  ReferenceCode,
  ScheduleBands,
  StatusStamp,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wlbp/ui-foundation";
import type { TodayItemV1 } from "../../_lib/dashboard-access";
import type { OperationalChoices } from "../../_lib/operational-choices";
import { workspaceStatus } from "../../_lib/workspace-status";
import { getDashboardMessage } from "../../_lib/copy";
import { buildDayBands, uniqueBookings } from "../../_lib/booking-bands";
import { formatTimeRange, intlLocale, stampStateFor } from "../../_lib/booking-display";
import { workspaceMessage } from "../../_lib/workspace-copy";
import { BookingAgenda } from "../../_lib/ui/booking-agenda";
import { textLinkClass } from "../../_lib/ui/text-link";
import { ServiceDye } from "../../_lib/ui/service-dye";
import { calendarRange, shiftCivilDate } from "./calendar-range";
export type CalendarMode = "day" | "week" | "resource" | "list";

/** Where an item needs attention elsewhere, the link to that surface. */
function FollowUps({ row, locale }: { row: TodayItemV1; locale: Locale }) {
  return (
    <>
      {row.status === "requested" ? (
        <Link className={textLinkClass} href={`/${locale}/requests`}>
          {workspaceMessage(locale, "reviewRequest")}
        </Link>
      ) : null}
      {row.paymentStatus === "failed" ? (
        <Link className={textLinkClass} href={`/${locale}/payments`}>
          {workspaceMessage(locale, "reviewPayment")}
        </Link>
      ) : null}
      {row.notificationStatus === "failed" ? (
        <Link className={textLinkClass} href={`/${locale}/communications`}>
          {workspaceMessage(locale, "reviewCommunications")}
        </Link>
      ) : null}
    </>
  );
}

/** A compact booking for a timetable cell. */
function Event({
  row,
  locale,
  timeZone,
}: {
  row: TodayItemV1;
  locale: Locale;
  timeZone: string;
}) {
  return (
    <article className="grid gap-1 rounded-md border bg-card p-2 text-start shadow-xs">
      <h3 className="text-sm leading-snug font-semibold">
        <Link
          className="outline-none hover:underline focus-visible:underline"
          href={`/${locale}/bookings/${row.bookingId}`}
        >
          <ServiceDye name={row.serviceName} />
        </Link>
      </h3>
      <ReferenceCode className="text-xs">{row.publicReference}</ReferenceCode>
      <p className="text-xs text-muted-foreground [font-variant-numeric:tabular-nums]">
        <time dateTime={row.startAt}>
          {formatTimeRange(row.startAt, row.endAt, locale, timeZone)}
        </time>
      </p>
      <StatusStamp state={stampStateFor(row.status)}>
        {workspaceStatus(locale, row.status)}
      </StatusStamp>
      {row.customerDisplayName ? (
        <p className="truncate text-xs text-muted-foreground">
          {row.customerDisplayName}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-x-3 text-xs">
        <FollowUps row={row} locale={locale} />
      </div>
    </article>
  );
}

export function CalendarView({
  rows,
  view,
  date,
  timeZone,
  locale,
  choices,
  filters = { locationId: null, staffId: null },
}: {
  rows: readonly TodayItemV1[];
  view: CalendarMode;
  date: string;
  timeZone: string;
  locale: Locale;
  choices: OperationalChoices;
  /** Narrows the empty lanes to the filtered location or member. */
  filters?: { locationId: string | null; staffId: string | null };
}) {
  const m = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);
  const agenda = (
    <BookingAgenda
      items={uniqueBookings(rows)}
      locale={locale}
      label={m("calendarListAlternative")}
      displayTimeZone={timeZone}
      customerHidden={m("requestsCustomerHidden")}
      openLabel={m("calendarOpenBooking")}
      extra={(row) => <FollowUps row={row} locale={locale} />}
    />
  );
  if (view === "list") return agenda;
  const unique = <T extends { id: string }>(list: readonly T[]) => [
    ...new Map(list.map((entry) => [entry.id, entry])).values(),
  ];
  const inScope = (entry: { id: string; locationId: string }) =>
    filters.locationId === null || entry.locationId === filters.locationId;

  if (view === "day" || view === "resource") {
    const range = calendarRange(date, timeZone);
    const bands = buildDayBands({
      items: rows,
      from: range.from,
      to: range.to,
      locale,
      timeZone,
      now: new Date(),
      laneBy: view === "resource" ? "resource" : "staff",
      staff: unique(choices.staff).filter(
        (member) =>
          inScope(member) &&
          (filters.staffId === null || member.id === filters.staffId),
      ),
      resources: unique(choices.resources).filter(inScope),
      bookingHref: (id) => `/${locale}/bookings/${id}`,
      customerHidden: m("requestsCustomerHidden"),
      showEmptyLanes: true,
    });
    const dayLabel = new Intl.DateTimeFormat(intlLocale(locale), {
      dateStyle: "full",
      timeZone: "UTC",
    }).format(new Date(`${date}T12:00:00Z`));
    return (
      <ScheduleBands
        lanes={bands.lanes}
        segments={bands.segments}
        startMinute={bands.startMinute}
        endMinute={bands.endMinute}
        hourLabel={bands.hourLabel}
        {...(bands.nowMinute === undefined ? {} : { nowMinute: bands.nowMinute })}
        label={workspaceMessage(
          locale,
          view === "resource" ? "calendarResourceLabel" : "scheduleLabel",
          { date: dayLabel },
        )}
        emptyLaneLabel={workspaceMessage(locale, "scheduleEmptyLane")}
        listAlternative={
          rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{m("calendarEmpty")}</p>
          ) : (
            agenda
          )
        }
      />
    );
  }

  const days = Array.from({ length: 7 }, (_, index) => shiftCivilDate(date, index));
  const hourFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
  return (
    <Table
      label={workspaceMessage(locale, "calendarTimetable")}
      className="min-w-[56rem]"
    >
      <TableCaption>
        {workspaceMessage(locale, "calendarTimetableCaption")} · <bdi>{timeZone}</bdi>
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20">
            {workspaceMessage(locale, "calendarHour")}
          </TableHead>
          {days.map((day) => (
            <TableHead key={day}>
              <time dateTime={day}>
                {new Intl.DateTimeFormat(intlLocale(locale), {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                }).format(new Date(`${day}T12:00:00Z`))}
              </time>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 24 }, (_, h) => (
          <TableRow key={h} className="hover:bg-transparent">
            <TableHead
              scope="row"
              className="h-auto py-3 align-top font-medium [font-variant-numeric:tabular-nums]"
            >
              <bdi>{hourFormat.format(new Date(Date.UTC(2000, 0, 1, h)))}</bdi>
            </TableHead>
            {days.map((day) => (
              <TableCell key={day} className="min-w-32 align-top">
                <div className="grid gap-2">
                  {rows
                    .filter((row) =>
                      occupiesStartCell(row.startAt, row.endAt, day, h, timeZone),
                    )
                    .map((row) => (
                      <Event
                        key={row.bookingId}
                        row={row}
                        locale={locale}
                        timeZone={timeZone}
                      />
                    ))}
                </div>
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
