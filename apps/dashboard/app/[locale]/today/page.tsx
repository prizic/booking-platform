import { workspaceStatus } from "../../_lib/workspace-status";
import type { Locale } from "@wlbp/i18n";
import {
  Badge,
  Button,
  DataPage,
  EmptyState,
  ErrorState,
  ReferenceCode,
  ScheduleBands,
  Section,
  StatusStamp,
  Toolbar,
} from "@wlbp/ui-foundation";
import { CalendarCheck, CalendarPlus, Inbox } from "lucide-react";
import Link from "next/link";
import { getDashboardMessage } from "../../_lib/copy";
import type { TodayItemV1 } from "../../_lib/dashboard-access";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { buildDayBands, uniqueBookings } from "../../_lib/booking-bands";
import { formatTimeRange, stampStateFor } from "../../_lib/booking-display";
import { countLabel, workspaceMessage } from "../../_lib/workspace-copy";
import { BookingAgenda } from "../../_lib/ui/booking-agenda";
import { textLinkClass } from "../../_lib/ui/text-link";
import { ServiceDye } from "../../_lib/ui/service-dye";
import { When } from "../../_lib/ui/when";
import { ReadRetry } from "../../_lib/ui/read-retry";
import { loadToday } from "./today-data";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function QueueRows({
  items,
  locale,
  timeZone,
  review = false,
}: {
  items: readonly TodayItemV1[];
  locale: Locale;
  timeZone: string;
  review?: boolean;
}) {
  const message = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {items.map((item) => (
        <li key={item.bookingId}>
          <article
            aria-label={`${item.publicReference} · ${item.serviceName}`}
            className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
          >
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="font-semibold">
                  <ServiceDye name={item.serviceName} />
                </h3>
                <ReferenceCode>{item.publicReference}</ReferenceCode>
                <StatusStamp state={stampStateFor(item.status)}>
                  {workspaceStatus(locale, item.status)}
                </StatusStamp>
              </div>
              <p className="text-sm text-muted-foreground">
                {item.customerDisplayName ?? message("requestsCustomerHidden")} ·{" "}
                <When
                  instant={item.startAt}
                  locale={locale}
                  timeZone={item.locationTimeZone}
                  viewTimeZone={timeZone}
                />
              </p>
              {review && item.approvalDeadline ? (
                <p className="text-sm font-semibold">
                  {message("requestsDeadlineLabel")}:{" "}
                  <When
                    instant={item.approvalDeadline}
                    locale={locale}
                    timeZone={item.locationTimeZone}
                    viewTimeZone={timeZone}
                  />
                </p>
              ) : null}
              {!review && item.queue === "exceptions" ? (
                <p className="text-sm">
                  {message("bookingsDeliveryLabel")}:{" "}
                  {workspaceStatus(locale, item.notificationStatus)}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {review ? (
                <Button asChild>
                  <Link href={`/${locale}/requests#request-${item.bookingId}`}>
                    {workspaceMessage(locale, "reviewRequest")}
                  </Link>
                </Button>
              ) : null}
              <Link
                className={textLinkClass}
                href={`/${locale}/bookings/${item.bookingId}`}
              >
                {message("calendarOpenBooking")}
              </Link>
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}
export default async function TodayPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  const result = await loadToday(locale);
  const loaded = result.kind === "ready" ? result : null;
  const message = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);
  const now = new Date();
  const rows = (queue: TodayItemV1["queue"]) =>
    loaded?.items.filter((item) => item.queue === queue) ?? [];
  const todayItems = loaded
    ? uniqueBookings(loaded.items).filter(
        (item) =>
          Date.parse(item.startAt) >= Date.parse(loaded.range.from) &&
          Date.parse(item.startAt) < Date.parse(loaded.range.to),
      )
    : [];
  const bands = loaded
    ? buildDayBands({
        items: todayItems,
        ...loaded.range,
        locale,
        timeZone: loaded.timeZone,
        now,
        laneBy: "staff",
        staff: loaded.choices.staff,
        resources: loaded.choices.resources,
        bookingHref: (id) => `/${locale}/bookings/${id}`,
        customerHidden: message("requestsCustomerHidden"),
        showEmptyLanes: true,
      })
    : null;
  const nowText = loaded
    ? formatTimeRange(now.toISOString(), now.toISOString(), locale, loaded.timeZone)
    : "";
  const remaining = [
    { key: "payments", label: "todayQueuePayments", tone: "warning" },
    { key: "cancellations", label: "todayQueueCancellations", tone: "neutral" },
    { key: "upcoming", label: "todayQueueUpcoming", tone: "neutral" },
  ] as const;
  return (
    <WorkspaceShell current="today" labelledBy="today-title" locale={locale}>
      <DataPage
        titleId="today-title"
        title={message("todayTitle")}
        description={message("todayIntro")}
        meta={
          <p className="text-sm text-muted-foreground">
            {workspaceMessage(locale, "todayWindow")}
            {loaded ? (
              <>
                {" "}
                · {workspaceMessage(locale, "timeZoneLabel")}:{" "}
                <bdi>{loaded.timeZone}</bdi>
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
        feedback={
          result.kind === "failure" && "correlation" in result ? (
            <p className="text-xs text-muted-foreground">
              {locale === "ar" ? "مرجع القراءة" : "Read reference"}:{" "}
              <bdi>{result.correlation}</bdi>
            </p>
          ) : null
        }
        toolbar={
          <Toolbar role="toolbar" aria-label={locale === "ar" ? "التصفية" : "Filters"}>
            <Button asChild variant="outline" size="sm">
              <Link href={`/${locale}/calendar`}>{message("calendarTitle")}</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/${locale}/requests`}>{message("requestsTitle")}</Link>
            </Button>
          </Toolbar>
        }
      >
        {!loaded || !bands ? (
          <ErrorState
            title={message("todayUnavailable")}
            description={
              result.kind === "failure" && result.outcome === "tenant_setup"
                ? locale === "ar"
                  ? "تحقق من إعدادات نطاق المنشأة والموقع والمنطقة الزمنية."
                  : "Check the workspace domain, location and timezone setup."
                : result.kind === "failure" && result.outcome === "access_denied"
                  ? locale === "ar"
                    ? "سجّل الدخول بحساب لديه صلاحية لهذه المنشأة."
                    : "Sign in with current access to this workspace."
                  : locale === "ar"
                    ? "تعذّر تحميل بيانات اليوم. أعد المحاولة."
                    : "Today could not load. Retry the read."
            }
            retry={<ReadRetry locale={locale} />}
          />
        ) : (
          <>
            <Section
              id="queue-requests"
              title={message("todayQueueRequests")}
              actions={
                <Badge tone="warning">
                  {countLabel(locale, "items", rows("requests").length)}
                </Badge>
              }
            >
              {rows("requests").length ? (
                <QueueRows
                  items={rows("requests")}
                  locale={locale}
                  timeZone={loaded.timeZone}
                  review
                />
              ) : (
                <EmptyState
                  icon={<Inbox aria-hidden="true" />}
                  title={workspaceMessage(locale, "requestsColumnEmpty")}
                />
              )}
            </Section>
            {rows("exceptions").length ? (
              <Section
                id="today-urgent-exceptions"
                title={message("todayQueueExceptions")}
                actions={
                  <Badge tone="warning">
                    {countLabel(locale, "items", rows("exceptions").length)}
                  </Badge>
                }
              >
                <QueueRows
                  items={rows("exceptions")}
                  locale={locale}
                  timeZone={loaded.timeZone}
                />
              </Section>
            ) : null}
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
                      nowLabel: workspaceMessage(locale, "nowAt", { time: nowText }),
                    })}
                label={workspaceMessage(locale, "scheduleLabel", {
                  date: new Intl.DateTimeFormat(locale, {
                    dateStyle: "full",
                    timeZone: loaded.timeZone,
                  }).format(now),
                })}
                emptyLaneLabel={workspaceMessage(locale, "scheduleEmptyLane")}
                listAlternative={
                  todayItems.length ? (
                    <BookingAgenda
                      items={todayItems}
                      locale={locale}
                      label={workspaceMessage(locale, "agendaLabel")}
                      displayTimeZone={loaded.timeZone}
                      customerHidden={message("requestsCustomerHidden")}
                      openLabel={message("calendarOpenBooking")}
                    />
                  ) : (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CalendarCheck aria-hidden="true" className="size-4" />
                      {loaded.items.length
                        ? workspaceMessage(locale, "scheduleEmptyDay")
                        : message("todayEmpty")}
                    </p>
                  )
                }
              />
            </Section>
            {remaining.map((queue) =>
              rows(queue.key).length ? (
                <Section
                  key={queue.key}
                  id={`queue-${queue.key}`}
                  title={message(queue.label)}
                  actions={
                    <Badge tone={queue.tone}>
                      {countLabel(locale, "items", rows(queue.key).length)}
                    </Badge>
                  }
                >
                  <QueueRows
                    items={rows(queue.key)}
                    locale={locale}
                    timeZone={loaded.timeZone}
                  />
                </Section>
              ) : null,
            )}
          </>
        )}
      </DataPage>
    </WorkspaceShell>
  );
}
