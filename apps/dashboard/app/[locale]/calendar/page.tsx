import Link from "next/link";
import type { Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  Button,
  EmptyState,
  PageHeader,
} from "@wlbp/ui-foundation";
import { CalendarPlus, CalendarX } from "lucide-react";
import type { TodayItemV1 } from "../../_lib/dashboard-access";
import type { OperationalChoices } from "../../_lib/operational-choices";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { getDashboardMessage } from "../../_lib/copy";
import { calendarRange, civilDate, validCivilDate } from "./calendar-range";
import { CalendarView, type CalendarMode } from "./calendar-view";
import { CalendarFilters } from "./calendar-filters";
import { workspaceMessage } from "../../_lib/workspace-copy";
import { textLinkClass } from "../../_lib/ui/text-link";
import { intlLocale } from "../../_lib/booking-display";
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
  let canCreate = false;
  const value = (key: string) => (typeof query[key] === "string" ? query[key] : "");
  // The frame already explains a missing session, tenant or configuration.
  if (request.state.kind !== "ready") body = null;
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
      canCreate = choices.offers.some((o) => o.canCreate);
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
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>
              <time dateTime={date} className="font-semibold text-foreground">
                {new Intl.DateTimeFormat(intlLocale(locale), {
                  dateStyle: "full",
                  timeZone: "UTC",
                }).format(new Date(`${date}T12:00:00Z`))}
              </time>{" "}
              · <bdi>{timeZone}</bdi>
            </span>
            <Link className={textLinkClass} href={`/${locale}/calendar?${listQuery}`}>
              {m("calendarListAlternative")}
            </Link>
            <Link className={textLinkClass} href={`/${locale}/availability`}>
              {m("navAvailability")}
            </Link>
          </p>
          {/* Day and resource views always draw every lane, even on an
              empty day; the list and week views state the empty result. */}
          {rows.length || view === "day" || view === "resource" ? (
            <CalendarView
              locale={locale}
              choices={choices}
              rows={rows}
              view={view}
              date={date}
              timeZone={timeZone}
              filters={filters}
            />
          ) : (
            <EmptyState
              icon={<CalendarX aria-hidden="true" />}
              title={m("calendarEmpty")}
            />
          )}
        </>
      );
    } else {
      body = (
        <Alert tone="danger">
          <AlertDescription className="text-foreground">
            {m("calendarUnavailable")}
          </AlertDescription>
        </Alert>
      );
    }
  }
  return (
    <WorkspaceShell locale={locale} current="calendar" labelledBy="calendar-title">
      <PageHeader
        titleId="calendar-title"
        title={m("calendarTitle")}
        description={m("calendarSummary")}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href={`/${locale}/bookings/new`}>
                <CalendarPlus aria-hidden="true" />
                {workspaceMessage(locale, "newBooking")}
              </Link>
            </Button>
          ) : null
        }
      />
      {body}
    </WorkspaceShell>
  );
}
