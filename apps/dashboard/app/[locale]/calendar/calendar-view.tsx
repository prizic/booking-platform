import { occupiesStartCell } from "./calendar-cells";
import Link from "next/link";
import { formatDateTime, type Locale } from "@wlbp/i18n";
import type { TodayItemV1 } from "../../_lib/dashboard-access";
import type { OperationalChoices } from "../../_lib/operational-choices";
import { workspaceStatus } from "../../_lib/workspace-status";
import { shiftCivilDate } from "./calendar-range";
export type CalendarMode = "day" | "week" | "resource" | "list";
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
    <article className="calendar-event">
      <h3>
        <Link href={`/${locale}/bookings/${row.bookingId}`}>
          {row.serviceName} · <bdi>{row.publicReference}</bdi>
        </Link>
      </h3>
      <p>
        <time dateTime={row.startAt}>
          {formatDateTime(row.startAt, locale, timeZone)}
        </time>{" "}
        –{" "}
        <time dateTime={row.endAt}>
          {new Intl.DateTimeFormat(locale, {
            timeZone,
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(row.endAt))}
        </time>
      </p>
      <p>
        {workspaceStatus(locale, row.status)} · {row.locationName}
      </p>
      {row.customerDisplayName ? <p>{row.customerDisplayName}</p> : null}
      {row.status === "requested" ? (
        <Link href={`/${locale}/requests`}>
          {locale === "ar" ? "مراجعة الطلب" : "Review request"}
        </Link>
      ) : null}
      {row.paymentStatus === "failed" ? (
        <Link href={`/${locale}/payments`}>
          {locale === "ar" ? "مراجعة الدفع" : "Review payment"}
        </Link>
      ) : null}
      {row.notificationStatus === "failed" ? (
        <Link href={`/${locale}/communications`}>
          {locale === "ar" ? "مراجعة المراسلات" : "Review communications"}
        </Link>
      ) : null}
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
}: {
  rows: readonly TodayItemV1[];
  view: CalendarMode;
  date: string;
  timeZone: string;
  locale: Locale;
  choices: OperationalChoices;
}) {
  if (view === "list")
    return (
      <ol className="calendar-agenda">
        {rows.map((row) => (
          <li key={row.bookingId}>
            <Event row={row} locale={locale} timeZone={timeZone} />
          </li>
        ))}
      </ol>
    );
  if (view === "resource") {
    const groups = new Map<string, TodayItemV1[]>();
    for (const row of rows) {
      const key = row.resourceId ?? "unallocated";
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return (
      <div className="calendar-resource-columns">
        {[...groups].map(([id, events], index) => (
          <section key={id} aria-labelledby={`resource-column-${index}`}>
            <h2 id={`resource-column-${index}`}>
              {choices.resources.find((c) => c.id === id)?.name ??
                (locale === "ar" ? "بلا مورد مخصص" : "No resource allocation")}
            </h2>
            {events.map((row) => (
              <Event
                key={row.bookingId}
                row={row}
                locale={locale}
                timeZone={timeZone}
              />
            ))}
          </section>
        ))}
      </div>
    );
  }
  const days = Array.from({ length: view === "week" ? 7 : 1 }, (_, index) =>
    shiftCivilDate(date, index),
  );
  return (
    <div
      className={`workspace-table-scroll calendar-timetable calendar-timetable--${view}`}
      role="region"
      tabIndex={0}
      aria-label={locale === "ar" ? "الجدول الزمني" : "Calendar timetable"}
    >
      <table>
        <caption>
          {locale === "ar"
            ? "أوقات البداية حسب المنطقة الزمنية"
            : "Start times in the selected timezone"}{" "}
          · <bdi>{timeZone}</bdi>
        </caption>
        <thead>
          <tr>
            <th scope="col">{locale === "ar" ? "الساعة" : "Hour"}</th>
            {days.map((day) => (
              <th key={day} scope="col">
                <time dateTime={day}>
                  {new Intl.DateTimeFormat(locale, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  }).format(new Date(`${day}T12:00:00Z`))}
                </time>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 24 }, (_, h) => (
            <tr key={h}>
              <th scope="row">
                <bdi>{String(h).padStart(2, "0")}:00</bdi>
              </th>
              {days.map((day) => (
                <td key={day}>
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
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
