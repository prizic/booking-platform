import { calendarRange, civilDate } from "../calendar/calendar-range";
import { workspaceStatus } from "../../_lib/workspace-status";
import type { Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  ReferenceCode,
  ScheduleBands,
  Section,
  StatusStamp,
} from "@wlbp/ui-foundation";
import { CalendarCheck, CalendarPlus, Inbox } from "lucide-react";
import Link from "next/link";

import { getDashboardMessage } from "../../_lib/copy";
import type { TodayItemV1 } from "../../_lib/dashboard-access";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import type { OperationalChoices } from "../../_lib/operational-choices";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { buildDayBands, uniqueBookings } from "../../_lib/booking-bands";
import { formatTimeRange, sameZone, stampStateFor } from "../../_lib/booking-display";
import { countLabel, workspaceMessage } from "../../_lib/workspace-copy";
import { BookingAgenda } from "../../_lib/ui/booking-agenda";
import { textLinkClass } from "../../_lib/ui/text-link";
import { Money } from "../../_lib/ui/money";
import { ServiceDye } from "../../_lib/ui/service-dye";
import { When } from "../../_lib/ui/when";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type TodayPageProps = {
  readonly params: Promise<{ locale: Locale }>;
};

// Order is operational, not alphabetical: what expires soonest comes first.
// Requests sit beside the schedule; the rest follow it in this order.
const queues = [
  { key: "requests", label: "todayQueueRequests", tone: "warning" },
  { key: "exceptions", label: "todayQueueExceptions", tone: "warning" },
  { key: "payments", label: "todayQueuePayments", tone: "warning" },
  { key: "arrivals", label: "todayQueueArrivals", tone: "positive" },
  { key: "cancellations", label: "todayQueueCancellations", tone: "neutral" },
  { key: "upcoming", label: "todayQueueUpcoming", tone: "neutral" },
] as const;

async function loadToday(locale: Locale): Promise<{
  items: readonly TodayItemV1[];
  date: string;
  timeZone: string;
  range: { from: string; to: string };
  canCreate: boolean;
  choices: OperationalChoices | null;
} | null> {
  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.getTodayWorkspace === undefined
  ) {
    return null;
  }
  const choices = await request.source
    .getOperationalChoices?.(request.state.context.tenantId, locale)
    .catch(() => null);
  const timeZone = choices?.offers[0]?.timeZone ?? "Asia/Riyadh";
  const range = calendarRange(civilDate(new Date(), timeZone), timeZone);
  // A failed read shows the unavailable copy rather than an empty day, so
  // nobody reads "nothing waiting" as "nothing to do".
  const items = await request.source
    .getTodayWorkspace({
      from: range.from,
      tenantId: request.state.context.tenantId,
      to: range.to,
    })
    .catch(() => null);
  return items === null
    ? null
    : {
        items,
        date: civilDate(new Date(), timeZone),
        timeZone,
        range,
        canCreate: choices?.offers.some((o) => o.canCreate) ?? false,
        choices: choices ?? null,
      };
}

export default async function TodayPage({ params }: TodayPageProps) {
  const { locale } = await params;
  const loaded = await loadToday(locale);
  const items = loaded?.items ?? null;
  const message = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);
  const now = new Date();

  const queueRows = (key: (typeof queues)[number]["key"]) =>
    (items ?? []).filter((item) => item.queue === key);

  return (
    <WorkspaceShell current="today" labelledBy="today-title" locale={locale}>
      <PageHeader
        titleId="today-title"
        title={message("todayTitle")}
        description={message("todayIntro")}
        meta={
          <p className="text-sm text-muted-foreground">
            {workspaceMessage(locale, "todayWindow")}
            {loaded ? (
              <>
                {" "}
                <time dateTime={loaded.date} className="sr-only">
                  {loaded.date}
                </time>
                <span className="whitespace-nowrap">
                  {workspaceMessage(locale, "timeZoneLabel")}:{" "}
                  <bdi>{loaded.timeZone}</bdi>
                </span>
              </>
            ) : null}
          </p>
        }
        actions={
          loaded?.canCreate ? (
            <Button asChild>
              <Link href={`/${locale}/bookings/new`}>
                <CalendarPlus aria-hidden="true" />
                {workspaceMessage(locale, "newBooking")}
              </Link>
            </Button>
          ) : null
        }
      />

      {items === null || loaded === null ? (
        <Alert tone="danger">
          <AlertDescription className="text-foreground">
            {message("todayUnavailable")}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_21rem]">
            {(() => {
              // Only bookings that start inside today's window belong on the
              // day's bands; other queues (later, recently cancelled) list below.
              const dayStart = Date.parse(loaded.range.from);
              const dayEnd = Date.parse(loaded.range.to);
              const todayItems = uniqueBookings(items).filter((item) => {
                const start = Date.parse(item.startAt);
                return start >= dayStart && start < dayEnd;
              });
              const bands = buildDayBands({
                items: todayItems,
                from: loaded.range.from,
                to: loaded.range.to,
                locale,
                timeZone: loaded.timeZone,
                now,
                laneBy: "staff",
                staff: loaded.choices?.staff ?? [],
                resources: loaded.choices?.resources ?? [],
                bookingHref: (id) => `/${locale}/bookings/${id}`,
                customerHidden: message("requestsCustomerHidden"),
                showEmptyLanes: true,
              });
              const nowIso = now.toISOString();
              const nowText = formatTimeRange(nowIso, nowIso, locale, loaded.timeZone);
              return (
                <Section
                  id="today-schedule"
                  title={workspaceMessage(locale, "scheduleTitle")}
                  description={`${message("todayNowLabel")}: ${nowText}`}
                >
                  <ScheduleBands
                    lanes={bands.lanes}
                    segments={bands.segments}
                    startMinute={bands.startMinute}
                    endMinute={bands.endMinute}
                    hourLabel={bands.hourLabel}
                    {...(bands.nowMinute === undefined
                      ? {}
                      : {
                          nowMinute: bands.nowMinute,
                          nowLabel: workspaceMessage(locale, "nowAt", {
                            time: nowText,
                          }),
                        })}
                    label={workspaceMessage(locale, "scheduleLabel", {
                      date: new Intl.DateTimeFormat(locale, {
                        dateStyle: "full",
                        timeZone: loaded.timeZone,
                      }).format(now),
                    })}
                    emptyLaneLabel={workspaceMessage(locale, "scheduleEmptyLane")}
                    listAlternative={
                      todayItems.length === 0 ? (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                          <CalendarCheck
                            aria-hidden="true"
                            className="size-4 shrink-0"
                          />
                          {items.length === 0
                            ? message("todayEmpty")
                            : workspaceMessage(locale, "scheduleEmptyDay")}
                        </p>
                      ) : (
                        <BookingAgenda
                          items={todayItems}
                          locale={locale}
                          label={workspaceMessage(locale, "agendaLabel")}
                          displayTimeZone={loaded.timeZone}
                          customerHidden={message("requestsCustomerHidden")}
                          openLabel={message("calendarOpenBooking")}
                        />
                      )
                    }
                  />
                </Section>
              );
            })()}

            <Section
              id="queue-requests"
              title={message("todayQueueRequests")}
              actions={
                <Badge tone="warning">
                  {countLabel(locale, "items", queueRows("requests").length)}
                </Badge>
              }
            >
              {queueRows("requests").length === 0 ? (
                <EmptyState
                  icon={<Inbox aria-hidden="true" />}
                  title={workspaceMessage(locale, "requestsColumnEmpty")}
                />
              ) : (
                <ul className="grid gap-3">
                  {queueRows("requests").map((item) => (
                    <li key={`requests:${item.bookingId}`}>
                      <article
                        aria-labelledby={`item-requests-${item.bookingId}`}
                        className="grid gap-3 rounded-lg border border-dashed border-warning/60 bg-card p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <ReferenceCode>{item.publicReference}</ReferenceCode>
                          <StatusStamp state={stampStateFor(item.status)}>
                            {workspaceStatus(locale, item.status)}
                          </StatusStamp>
                        </div>
                        <div className="grid gap-0.5">
                          <h3
                            id={`item-requests-${item.bookingId}`}
                            className="font-semibold text-foreground"
                          >
                            <ServiceDye name={item.serviceName} />
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {item.customerDisplayName ??
                              message("requestsCustomerHidden")}
                          </p>
                        </div>
                        <dl className="grid gap-1.5 text-sm">
                          <div className="flex flex-wrap justify-between gap-x-3">
                            <dt className="text-muted-foreground">
                              {message("bookingsWhenLabel")}
                            </dt>
                            <dd className="font-medium">
                              <When
                                instant={item.startAt}
                                locale={locale}
                                timeZone={item.locationTimeZone}
                                viewTimeZone={loaded.timeZone}
                              />
                            </dd>
                          </div>
                          {item.approvalDeadline === null ? null : (
                            <div className="flex flex-wrap justify-between gap-x-3">
                              <dt className="text-muted-foreground">
                                {message("requestsDeadlineLabel")}
                              </dt>
                              <dd className="font-semibold text-warning">
                                <When
                                  instant={item.approvalDeadline}
                                  locale={locale}
                                  timeZone={item.locationTimeZone}
                                  viewTimeZone={loaded.timeZone}
                                />
                              </dd>
                            </div>
                          )}
                          <div className="flex flex-wrap justify-between gap-x-3">
                            <dt className="text-muted-foreground">
                              {message("requestsPriceLabel")}
                            </dt>
                            <dd className="font-medium">
                              <Money
                                minor={item.priceMinor}
                                currency={item.currency}
                                locale={locale}
                              />
                            </dd>
                          </div>
                        </dl>
                        {/* Decisions are taken on the requests surface that
                            owns them, so this queue never becomes a second way
                            to act on a booking. */}
                        <div className="flex flex-wrap gap-2">
                          <Button asChild>
                            <Link href={`/${locale}/requests`}>
                              {workspaceMessage(locale, "reviewRequest")}
                            </Link>
                          </Button>
                          <Button asChild variant="ghost">
                            <Link href={`/${locale}/bookings/${item.bookingId}`}>
                              {message("calendarOpenBooking")}
                            </Link>
                          </Button>
                        </div>
                      </article>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          {queues
            .filter((queue) => queue.key !== "requests")
            .map((queue) => {
              const rows = queueRows(queue.key);
              if (rows.length === 0) return null;
              return (
                <Section
                  key={queue.key}
                  id={`queue-${queue.key}`}
                  title={message(queue.label)}
                  actions={
                    <Badge tone={queue.tone}>
                      {countLabel(locale, "items", rows.length)}
                    </Badge>
                  }
                >
                  <ul className="divide-y rounded-lg border bg-card">
                    {rows.map((item) => (
                      <li key={`${queue.key}:${item.bookingId}`}>
                        <article
                          aria-labelledby={`item-${queue.key}-${item.bookingId}`}
                          className="grid gap-x-6 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                        >
                          <div className="grid min-w-0 gap-1">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <h3
                                id={`item-${queue.key}-${item.bookingId}`}
                                className="font-semibold text-foreground"
                              >
                                <ServiceDye name={item.serviceName} />
                              </h3>
                              <ReferenceCode>{item.publicReference}</ReferenceCode>
                              {/* Status is words, never colour alone. */}
                              <StatusStamp state={stampStateFor(item.status)}>
                                {workspaceStatus(locale, item.status)}
                              </StatusStamp>
                            </div>
                            <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                              <div className="flex gap-1.5">
                                <dt className="sr-only">
                                  {message("bookingsWhenLabel")}
                                </dt>
                                <dd className="[font-variant-numeric:tabular-nums]">
                                  <time dateTime={item.startAt}>
                                    {formatTimeRange(
                                      item.startAt,
                                      item.endAt,
                                      locale,
                                      item.locationTimeZone,
                                    )}
                                  </time>
                                  {sameZone(
                                    item.locationTimeZone,
                                    loaded.timeZone,
                                  ) ? null : (
                                    <>
                                      {" "}
                                      <bdi className="text-xs">
                                        {item.locationTimeZone}
                                      </bdi>
                                    </>
                                  )}
                                </dd>
                              </div>
                              <div className="flex gap-1.5">
                                <dt className="sr-only">
                                  {message("requestsCustomerLabel")}
                                </dt>
                                <dd>
                                  {item.customerDisplayName ??
                                    message("requestsCustomerHidden")}
                                </dd>
                              </div>
                              <div className="flex gap-1.5">
                                <dt>{message("bookingsDeliveryLabel")}:</dt>
                                <dd className="text-foreground">
                                  {workspaceStatus(locale, item.notificationStatus)}
                                </dd>
                              </div>
                              {item.approvalDeadline === null ? null : (
                                <div className="flex gap-1.5">
                                  <dt>{message("requestsDeadlineLabel")}:</dt>
                                  <dd className="text-foreground">
                                    <When
                                      instant={item.approvalDeadline}
                                      locale={locale}
                                      timeZone={item.locationTimeZone}
                                      viewTimeZone={loaded.timeZone}
                                    />
                                  </dd>
                                </div>
                              )}
                              <div className="flex gap-1.5">
                                <dt>{message("requestsPriceLabel")}:</dt>
                                <dd className="text-foreground">
                                  <Money
                                    minor={item.priceMinor}
                                    currency={item.currency}
                                    locale={locale}
                                  />
                                </dd>
                              </div>
                            </dl>
                          </div>
                          {/* Every action lives on the surface that owns it, so
                              this queue never becomes a second way to act. */}
                          <Link
                            className={textLinkClass}
                            href={`/${locale}/bookings/${item.bookingId}`}
                          >
                            {message("calendarOpenBooking")}
                          </Link>
                        </article>
                      </li>
                    ))}
                  </ul>
                </Section>
              );
            })}
        </>
      )}
    </WorkspaceShell>
  );
}
