import { formatCurrency, formatDateTime, type Locale } from "@wlbp/i18n";
import { Badge, StatusMessage, Surface } from "@wlbp/ui-foundation";
import Link from "next/link";

import { getDashboardMessage } from "../../_lib/copy";
import type { TodayItemV1 } from "../../_lib/dashboard-access";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { WorkspaceShell } from "../../_lib/workspace-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type TodayPageProps = {
  readonly params: Promise<{ locale: Locale }>;
};

// Order is operational, not alphabetical: what expires soonest comes first.
const queues = [
  { key: "requests", label: "todayQueueRequests", tone: "warning" },
  { key: "exceptions", label: "todayQueueExceptions", tone: "warning" },
  { key: "payments", label: "todayQueuePayments", tone: "warning" },
  { key: "arrivals", label: "todayQueueArrivals", tone: "positive" },
  { key: "cancellations", label: "todayQueueCancellations", tone: "neutral" },
  { key: "upcoming", label: "todayQueueUpcoming", tone: "neutral" },
] as const;

async function loadToday(locale: Locale): Promise<readonly TodayItemV1[] | null> {
  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.getTodayWorkspace === undefined
  ) {
    return null;
  }
  const now = new Date();
  const endOfDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  // A failed read shows the unavailable copy rather than an empty day, so
  // nobody reads "nothing waiting" as "nothing to do".
  return request.source
    .getTodayWorkspace({
      from: now.toISOString(),
      tenantId: request.state.context.tenantId,
      to: endOfDay.toISOString(),
    })
    .catch(() => null);
}

export default async function TodayPage({ params }: TodayPageProps) {
  const { locale } = await params;
  const items = await loadToday(locale);
  const message = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);
  const now = new Date().toISOString();

  return (
    <WorkspaceShell current="today" labelledBy="today-title" locale={locale}>
      <Surface as="section" className="requests-queue" labelledBy="today-title">
        <h1 id="today-title">{message("todayTitle")}</h1>
        <p>{message("todayIntro")}</p>
        {items === null ? (
          <p>{message("todayUnavailable")}</p>
        ) : items.length === 0 ? (
          <p>{message("todayEmpty")}</p>
        ) : (
          <>
            <StatusMessage>
              {message("todayNowLabel")}:{" "}
              {formatDateTime(now, locale, items[0]?.locationTimeZone ?? "UTC")}
            </StatusMessage>
            {queues.map((queue) => {
              const rows = items.filter((item) => item.queue === queue.key);
              if (rows.length === 0) return null;
              return (
                <section
                  aria-labelledby={`queue-${queue.key}`}
                  className="today-queue"
                  key={queue.key}
                >
                  <h2 id={`queue-${queue.key}`}>
                    {message(queue.label)}{" "}
                    <Badge tone={queue.tone}>
                      {rows.length} {message("todayCountLabel")}
                    </Badge>
                  </h2>
                  <ul className="requests-list">
                    {rows.map((item) => (
                      <li key={`${queue.key}:${item.bookingId}`}>
                        <article
                          aria-labelledby={`item-${queue.key}-${item.bookingId}`}
                        >
                          <h3 id={`item-${queue.key}-${item.bookingId}`}>
                            {item.serviceName} · <bdi>{item.publicReference}</bdi>
                          </h3>
                          <dl>
                            <div>
                              <dt>{message("bookingsWhenLabel")}</dt>
                              <dd>
                                {formatDateTime(
                                  item.startAt,
                                  locale,
                                  item.locationTimeZone,
                                )}{" "}
                                <bdi>({item.locationTimeZone})</bdi>
                              </dd>
                            </div>
                            <div>
                              <dt>{message("bookingsStatusLabel")}</dt>
                              {/* Status is words, never colour alone. */}
                              <dd>{item.status}</dd>
                            </div>
                            <div>
                              <dt>{message("bookingsDeliveryLabel")}</dt>
                              <dd>{item.notificationStatus}</dd>
                            </div>
                            <div>
                              <dt>{message("requestsCustomerLabel")}</dt>
                              <dd>
                                {item.customerDisplayName ??
                                  message("requestsCustomerHidden")}
                              </dd>
                            </div>
                            {item.approvalDeadline === null ? null : (
                              <div>
                                <dt>{message("requestsDeadlineLabel")}</dt>
                                <dd>
                                  {formatDateTime(
                                    item.approvalDeadline,
                                    locale,
                                    item.locationTimeZone,
                                  )}
                                </dd>
                              </div>
                            )}
                            <div>
                              <dt>{message("requestsPriceLabel")}</dt>
                              <dd>
                                {formatCurrency(item.priceMinor, item.currency, locale)}
                              </dd>
                            </div>
                          </dl>
                          {/* Every action lives on the surface that owns it, so
                              this queue never becomes a second way to act. */}
                          <Link
                            href={
                              queue.key === "requests"
                                ? `/${locale}/requests`
                                : `/${locale}/bookings/${item.bookingId}`
                            }
                          >
                            {queue.key === "requests"
                              ? message("navRequests")
                              : message("calendarOpenBooking")}
                          </Link>
                        </article>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </>
        )}
      </Surface>
    </WorkspaceShell>
  );
}
