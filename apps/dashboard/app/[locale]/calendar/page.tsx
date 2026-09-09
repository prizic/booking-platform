import { formatDateTime, type Locale } from "@wlbp/i18n";
import { Badge, Button, StatusMessage, Surface } from "@wlbp/ui-foundation";
import Link from "next/link";

import { getDashboardMessage } from "../../_lib/copy";
import type { TodayItemV1 } from "../../_lib/dashboard-access";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { WorkspaceShell } from "../../_lib/workspace-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type CalendarPageProps = {
  readonly params: Promise<{ locale: Locale }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const views = ["day", "week", "resource", "list"] as const;
type CalendarView = (typeof views)[number];

function single(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" && candidate.trim() !== "" ? candidate : null;
}

function identifier(value: string | string[] | undefined): string | null {
  const candidate = single(value);
  return candidate !== null &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(candidate)
    ? candidate
    : null;
}

/** The window a view covers, resolved from the chosen day. */
function windowFor(view: CalendarView, day: string): { from: string; to: string } {
  const start = new Date(`${day}T00:00:00.000Z`);
  const days = view === "week" ? 7 : 1;
  return {
    from: start.toISOString(),
    to: new Date(start.getTime() + days * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export default async function CalendarPage({
  params,
  searchParams,
}: CalendarPageProps) {
  const { locale } = await params;
  const query = await searchParams;
  const message = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);

  const requestedView = single(query.view);
  const view: CalendarView = views.includes(requestedView as CalendarView)
    ? (requestedView as CalendarView)
    : "list";
  const day =
    single(query.date) !== null && /^\d{4}-\d{2}-\d{2}$/u.test(single(query.date)!)
      ? single(query.date)!
      : new Date().toISOString().slice(0, 10);
  const filters = {
    locationId: identifier(query.location),
    serviceId: identifier(query.service),
    staffId: identifier(query.staff),
  };

  const request = await loadDashboardRequestAccess(locale);
  let bookings: readonly TodayItemV1[] | null = null;
  if (
    request.source !== null &&
    request.state.kind === "ready" &&
    request.source.listCalendar !== undefined
  ) {
    const range = windowFor(view, day);
    bookings = await request.source
      .listCalendar({
        ...range,
        ...filters,
        tenantId: request.state.context.tenantId,
      })
      .catch(() => null);
  }

  // Grouping is presentation only. Day and week group by local date; the
  // resource view groups by the person or room the allocation occupies. The
  // list carries every booking in one sequence, so a keyboard or screen-reader
  // user never depends on a grid to do the day's work.
  const groups = new Map<string, TodayItemV1[]>();
  for (const booking of bookings ?? []) {
    const key =
      view === "resource"
        ? (booking.staffId ?? message("calendarResourceUnassigned"))
        : formatDateTime(booking.startAt, locale, booking.locationTimeZone).split(
            ",",
          )[0]!;
    groups.set(key, [...(groups.get(key) ?? []), booking]);
  }

  return (
    <WorkspaceShell current="calendar" labelledBy="calendar-title" locale={locale}>
      <Surface as="section" className="requests-queue" labelledBy="calendar-title">
        <h1 id="calendar-title">{message("calendarTitle")}</h1>
        <p>{message("calendarSummary")}</p>

        <form action={`/${locale}/calendar`} className="calendar-filters" method="get">
          <fieldset>
            <legend>{message("calendarViewLabel")}</legend>
            {views.map((option) => (
              <label htmlFor={`view-${option}`} key={option}>
                <input
                  defaultChecked={option === view}
                  id={`view-${option}`}
                  name="view"
                  type="radio"
                  value={option}
                />
                <span>
                  {message(
                    option === "day"
                      ? "calendarViewDay"
                      : option === "week"
                        ? "calendarViewWeek"
                        : option === "resource"
                          ? "calendarViewResource"
                          : "calendarViewList",
                  )}
                </span>
              </label>
            ))}
          </fieldset>
          <label htmlFor="calendar-date">{message("calendarDateLabel")}</label>
          <input defaultValue={day} id="calendar-date" name="date" type="date" />
          <label htmlFor="calendar-location">{message("calendarFilterLocation")}</label>
          <input
            defaultValue={filters.locationId ?? ""}
            id="calendar-location"
            name="location"
            placeholder={message("calendarFilterAll")}
          />
          <label htmlFor="calendar-staff">{message("calendarFilterStaff")}</label>
          <input
            defaultValue={filters.staffId ?? ""}
            id="calendar-staff"
            name="staff"
            placeholder={message("calendarFilterAll")}
          />
          <label htmlFor="calendar-service">{message("calendarFilterService")}</label>
          <input
            defaultValue={filters.serviceId ?? ""}
            id="calendar-service"
            name="service"
            placeholder={message("calendarFilterAll")}
          />
          <Button type="submit">{message("calendarFilterApply")}</Button>
        </form>

        <StatusMessage>{message("calendarTimezoneNote")}</StatusMessage>
        {view === "list" ? null : <p>{message("calendarListAlternative")}</p>}

        {bookings === null ? (
          <p>{message("calendarUnavailable")}</p>
        ) : bookings.length === 0 ? (
          <p>{message("calendarEmpty")}</p>
        ) : (
          [...groups.entries()].map(([key, rows]) => (
            <section aria-labelledby={`group-${key}`} className="today-queue" key={key}>
              <h2 id={`group-${key}`}>
                {key} <Badge>{rows.length}</Badge>
              </h2>
              <ul className="requests-list">
                {rows.map((booking) => (
                  <li key={booking.bookingId}>
                    <article aria-labelledby={`calendar-${booking.bookingId}`}>
                      <h3 id={`calendar-${booking.bookingId}`}>
                        {booking.serviceName} · <bdi>{booking.publicReference}</bdi>
                      </h3>
                      <dl>
                        <div>
                          <dt>{message("bookingsWhenLabel")}</dt>
                          <dd>
                            {formatDateTime(
                              booking.startAt,
                              locale,
                              booking.locationTimeZone,
                            )}{" "}
                            <bdi>({booking.locationTimeZone})</bdi>
                          </dd>
                        </div>
                        <div>
                          <dt>{message("calendarStatusLabel")}</dt>
                          <dd>{booking.status}</dd>
                        </div>
                        <div>
                          <dt>{message("requestsCustomerLabel")}</dt>
                          <dd>
                            {booking.customerDisplayName ??
                              message("requestsCustomerHidden")}
                          </dd>
                        </div>
                      </dl>
                      <Link href={`/${locale}/bookings`}>
                        {message("calendarOpenBooking")}
                      </Link>
                    </article>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </Surface>
    </WorkspaceShell>
  );
}
