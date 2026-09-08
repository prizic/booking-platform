import { formatDateTime, type Locale } from "@wlbp/i18n";
import { Badge, Button, StatusMessage, Surface } from "@wlbp/ui-foundation";
import { BrandShell } from "@wlbp/white-label-ui";
import Image from "next/image";
import Link from "next/link";

import { dashboardBrand } from "../../_lib/brand";
import { getDashboardMessage } from "../../_lib/copy";
import type { BookingSummaryRowV1 } from "../../_lib/dashboard-access";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { changeBookingAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type BookingsPageProps = {
  readonly params: Promise<{ locale: Locale }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const resultKeys = {
  "backend-unavailable": "requestsResultUnavailable",
  "invalid-request": "requestsResultInvalid",
  moved: "bookingsResultMoved",
  "not-authorized": "requestsResultNotAuthorized",
  rejected: "bookingsResultCancelled",
  "resend-unavailable": "bookingsResendUnavailable",
  resent: "bookingsResultResent",
  "revision-conflict": "requestsResultConflict",
  "slot-unavailable": "requestsResultSlotUnavailable",
} as const;

async function loadBookings(
  locale: Locale,
): Promise<readonly BookingSummaryRowV1[] | null> {
  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.listBookings === undefined
  ) {
    return null;
  }
  // A failed read shows the unavailable copy rather than an empty list, so
  // nobody reads "no bookings" as "nothing to do".
  return request.source.listBookings(request.state.context.tenantId).catch(() => null);
}

export default async function BookingsPage({
  params,
  searchParams,
}: BookingsPageProps) {
  const { locale } = await params;
  const query = await searchParams;
  const bookings = await loadBookings(locale);
  const message = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);
  const result = typeof query.result === "string" ? query.result : null;
  const resultKey =
    result !== null && result in resultKeys
      ? resultKeys[result as keyof typeof resultKeys]
      : null;

  return (
    <BrandShell
      className="dashboard-shell"
      labelledBy="bookings-title"
      tokens={dashboardBrand.tokens}
    >
      <aside className="dashboard-sidebar">
        <Link
          aria-label={dashboardBrand.name}
          className="dashboard-brand"
          href={`/${locale}`}
        >
          <Image
            alt=""
            aria-hidden="true"
            height={36}
            src={dashboardBrand.assets.icon}
            width={36}
          />
          <strong>{dashboardBrand.name}</strong>
        </Link>
        <nav aria-label={message("primaryNavigation")}>
          <Link href={`/${locale}`}>
            <span aria-hidden="true">01</span>
            {message("navToday")}
          </Link>
          <Link aria-current="page" href={`/${locale}/bookings`}>
            <span aria-hidden="true">02</span>
            {message("navBookings")}
          </Link>
          <Link href={`/${locale}/requests`}>
            <span aria-hidden="true">03</span>
            {message("navRequests")}
          </Link>
        </nav>
        <Badge tone="positive">{message("privateStatus")}</Badge>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-toolbar">
          <Link href={`/${locale}`}>{message("navToday")}</Link>
          <nav aria-label={message("languageNavigation")}>
            <Link
              href="/en/bookings"
              aria-current={locale === "en" ? "page" : undefined}
            >
              <span aria-hidden="true">EN</span>
              <span className="sr-only">{message("languageEnglish")}</span>
            </Link>
            <Link
              href="/ar/bookings"
              aria-current={locale === "ar" ? "page" : undefined}
            >
              <span aria-hidden="true">عربي</span>
              <span className="sr-only">{message("languageArabic")}</span>
            </Link>
          </nav>
        </header>

        <Surface as="section" className="requests-queue" labelledBy="bookings-title">
          <h1 id="bookings-title">{message("bookingsTitle")}</h1>
          <p>{message("bookingsSummary")}</p>
          {resultKey === null ? null : (
            <StatusMessage
              tone={
                result === "moved" || result === "rejected" ? "positive" : "warning"
              }
            >
              {message(resultKey)}
            </StatusMessage>
          )}

          {bookings === null ? (
            <p>{message("bookingsUnavailable")}</p>
          ) : bookings.length === 0 ? (
            <p>{message("bookingsEmpty")}</p>
          ) : (
            <ul aria-label={message("bookingsListLabel")} className="requests-list">
              {bookings.map((booking) => (
                <li key={booking.bookingId}>
                  <article aria-labelledby={`booking-${booking.bookingId}`}>
                    <h2 id={`booking-${booking.bookingId}`}>
                      {booking.serviceName} · <bdi>{booking.publicReference}</bdi>
                    </h2>
                    <dl>
                      <div>
                        <dt>{message("bookingsWhenLabel")}</dt>
                        <dd>
                          {formatDateTime(
                            booking.startAt,
                            locale,
                            booking.locationTimeZone,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>{message("bookingsStatusLabel")}</dt>
                        <dd>{booking.status}</dd>
                      </div>
                      <div>
                        <dt>{message("bookingsDeliveryLabel")}</dt>
                        <dd>{booking.notificationStatus}</dd>
                      </div>
                    </dl>
                    <form action={changeBookingAction}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="bookingId" value={booking.bookingId} />
                      <input
                        type="hidden"
                        name="expectedRevision"
                        value={booking.bookingRevision}
                      />
                      <input
                        type="hidden"
                        name="locationTimeZone"
                        value={booking.locationTimeZone}
                      />
                      <label htmlFor={`new-start-${booking.bookingId}`}>
                        {message("bookingsNewTimeLabel")}
                      </label>
                      <input
                        id={`new-start-${booking.bookingId}`}
                        name="newStartAt"
                        type="datetime-local"
                      />
                      <label htmlFor={`public-${booking.bookingId}`}>
                        {message("requestsPublicReasonLabel")}
                      </label>
                      <textarea
                        id={`public-${booking.bookingId}`}
                        maxLength={500}
                        name="publicReason"
                        rows={2}
                      />
                      <label htmlFor={`internal-${booking.bookingId}`}>
                        {message("requestsInternalReasonLabel")}
                      </label>
                      <textarea
                        id={`internal-${booking.bookingId}`}
                        maxLength={500}
                        name="internalReason"
                        rows={2}
                      />
                      <div className="requests-actions">
                        <Button name="action" type="submit" value="reschedule">
                          {message("bookingsReschedule")}
                        </Button>
                        <Button
                          name="action"
                          type="submit"
                          value="cancel"
                          variant="secondary"
                        >
                          {message("bookingsCancel")}
                        </Button>
                        <Button
                          name="action"
                          type="submit"
                          value="resend"
                          variant="secondary"
                        >
                          {message("bookingsResend")}
                        </Button>
                      </div>
                    </form>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </Surface>
      </div>
    </BrandShell>
  );
}
