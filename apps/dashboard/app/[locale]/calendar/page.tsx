import Link from "next/link";
import type { Locale } from "@wlbp/i18n";
import type { TodayItemV1 } from "../../_lib/dashboard-access";
import type { OperationalChoices } from "../../_lib/operational-choices";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { DashboardAccessPanel } from "../../_lib/dashboard-access-panel";
import { getDashboardMessage } from "../../_lib/copy";
import { calendarRange, civilDate, validCivilDate } from "./calendar-range";
import { CalendarView, type CalendarMode } from "./calendar-view";
import { CalendarFilters } from "./calendar-filters";
export const dynamic = "force-dynamic";
export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const m = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);
  const request = await loadDashboardRequestAccess(locale);
  let body;
  const value = (key: string) => (typeof query[key] === "string" ? query[key] : "");
  if (request.state.kind !== "ready")
    body = <DashboardAccessPanel locale={locale} state={request.state} />;
  else {
    const context = request.state.context;
    const loaded = await (async () => {
      try {
        if (!request.source?.getOperationalChoices || !request.source.listCalendar)
          throw new Error();
        const choices: OperationalChoices = await request.source.getOperationalChoices(
          context.tenantId,
          locale,
        );
        const allowedZone = choices.offers.some(
          (o) => o.timeZone === value("timeZone"),
        );
        const timeZone = allowedZone
          ? value("timeZone")
          : (choices.offers[0]?.timeZone ?? "Asia/Riyadh");
        const date = validCivilDate(value("date"))
          ? value("date")
          : civilDate(new Date(), timeZone);
        const view = (
          ["day", "week", "resource", "list"].includes(value("view"))
            ? value("view")
            : "list"
        ) as CalendarMode;
        const permitted = (kind: "location" | "staff" | "service") => {
          const id = value(kind);
          return (
            kind === "staff"
              ? choices.staff.some((c) => c.id === id)
              : choices.offers.some(
                  (c) => (kind === "location" ? c.locationId : c.id) === id,
                )
          )
            ? id
            : null;
        };
        const filters = {
          locationId: permitted("location"),
          staffId: permitted("staff"),
          serviceId: permitted("service"),
        };
        const range = calendarRange(date, timeZone, view === "week" ? 7 : 1);
        const rows: readonly TodayItemV1[] = await request.source.listCalendar({
          ...range,
          ...filters,
          tenantId: context.tenantId,
        });
        const listQuery = new URLSearchParams({
          view: "list",
          date,
          timeZone,
          ...(filters.locationId ? { location: filters.locationId } : {}),
          ...(filters.staffId ? { staff: filters.staffId } : {}),
          ...(filters.serviceId ? { service: filters.serviceId } : {}),
        });
        return { choices, date, view, timeZone, filters, rows, listQuery };
      } catch {
        return null;
      }
    })();
    if (loaded) {
      const { choices, date, view, timeZone, filters, rows, listQuery } = loaded;
      body = (
        <>
          <CalendarFilters
            locale={locale}
            choices={choices}
            date={date}
            view={view}
            timeZone={timeZone}
            filters={filters}
          />
          <p>
            <time dateTime={date}>{date}</time> · <bdi>{timeZone}</bdi>
          </p>
          {choices.offers.some((o) => o.canCreate) ? (
            <Link className="wlbp-button" href={`/${locale}/bookings/new`}>
              {locale === "ar" ? "حجز جديد" : "New booking"}
            </Link>
          ) : null}
          <p>
            <Link href={`/${locale}/calendar?${listQuery}`}>
              {m("calendarListAlternative")}
            </Link>{" "}
            · <Link href={`/${locale}/availability`}>{m("navAvailability")}</Link>
          </p>
          {rows.length ? (
            <CalendarView
              locale={locale}
              choices={choices}
              rows={rows}
              view={view}
              date={date}
              timeZone={timeZone}
            />
          ) : (
            <p>{m("calendarEmpty")}</p>
          )}
        </>
      );
    } else {
      body = <p role="alert">{m("calendarUnavailable")}</p>;
    }
  }
  return (
    <WorkspaceShell locale={locale} current="calendar" labelledBy="calendar-title">
      <header className="dashboard-intro">
        <h1 id="calendar-title">{m("calendarTitle")}</h1>
        <p>{m("calendarSummary")}</p>
      </header>
      {body}
    </WorkspaceShell>
  );
}
