import { formatCurrency, formatDateTime, type Locale } from "@wlbp/i18n";
import { Badge, Button, StatusMessage, Surface } from "@wlbp/ui-foundation";
import Link from "next/link";

import { getDashboardMessage } from "../../_lib/copy";
import type { BookingSearchRowV1 } from "../../_lib/dashboard-access";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { changeBookingAction } from "./actions";
import { listResultKeys, positiveResults } from "./results";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type BookingsPageProps = {
  readonly params: Promise<{ locale: Locale }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// The operational statuses an operator filters by. The list deliberately
// offers the vocabulary the database uses, so a filter and a status badge can
// never describe the same booking differently.
const statuses = [
  "requested",
  "confirmed",
  "checked_in",
  "completed",
  "no_show",
  "cancelled",
] as const;

function single(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" && candidate.trim() !== ""
    ? candidate.trim()
    : null;
}

async function loadBookings(
  locale: Locale,
  filters: { query: string | null; status: string | null },
): Promise<readonly BookingSearchRowV1[] | null> {
  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.searchBookings === undefined
  ) {
    return null;
  }
  // A failed read shows the unavailable copy rather than an empty list, so
  // nobody reads "no bookings" as "nothing to do".
  return request.source
    .searchBookings({
      from: null,
      locationId: null,
      query: filters.query,
      staffId: null,
      status: filters.status,
      tenantId: request.state.context.tenantId,
      to: null,
    })
    .catch(() => null);
}

export default async function BookingsPage({
  params,
  searchParams,
}: BookingsPageProps) {
  const { locale } = await params;
  const query = await searchParams;
  const message = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);

  const requestedStatus = single(query.status);
  const filters = {
    query: single(query.q),
    status: statuses.includes(requestedStatus as (typeof statuses)[number])
      ? requestedStatus
      : null,
  };
  const bookings = await loadBookings(locale, filters);
  const result = typeof query.result === "string" ? query.result : null;
  const resultKey =
    result !== null && result in listResultKeys
      ? listResultKeys[result as keyof typeof listResultKeys]
      : null;

  return (
    <WorkspaceShell current="bookings" labelledBy="bookings-title" locale={locale}>
      <Surface as="section" className="requests-queue" labelledBy="bookings-title">
        <h1 id="bookings-title">{message("bookingsTitle")}</h1>
        <p>{message("bookingsSummary")}</p>
        {resultKey === null ? null : (
          <StatusMessage
            tone={positiveResults.has(result ?? "") ? "positive" : "warning"}
          >
            {message(resultKey)}
          </StatusMessage>
        )}

        <form action={`/${locale}/bookings`} className="calendar-filters" method="get">
          <label htmlFor="bookings-query">{message("bookingsSearchLabel")}</label>
          <input
            defaultValue={filters.query ?? ""}
            id="bookings-query"
            name="q"
            type="search"
          />
          <label htmlFor="bookings-status">
            {message("bookingsStatusFilterLabel")}
          </label>
          <select
            defaultValue={filters.status ?? ""}
            id="bookings-status"
            name="status"
          >
            <option value="">{message("bookingsStatusAll")}</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <Button type="submit">{message("bookingsSearchAction")}</Button>
        </form>

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
                      <dt>{message("detailPaymentLabel")}</dt>
                      <dd>{booking.paymentStatus}</dd>
                    </div>
                    <div>
                      <dt>{message("bookingsDeliveryLabel")}</dt>
                      <dd>{booking.notificationStatus}</dd>
                    </div>
                    <div>
                      <dt>{message("requestsCustomerLabel")}</dt>
                      <dd>
                        {booking.customerDisplayName ??
                          message("requestsCustomerHidden")}
                      </dd>
                    </div>
                    <div>
                      <dt>{message("detailPriceLabel")}</dt>
                      <dd>
                        {formatCurrency(booking.priceMinor, booking.currency, locale)}
                      </dd>
                    </div>
                  </dl>
                  {/* The lifecycle lives on the detail, so this list never
                      becomes a second place where status can change. */}
                  <Link href={`/${locale}/bookings/${booking.bookingId}`}>
                    {message("bookingsOpenDetail")}{" "}
                    <Badge>
                      {booking.noteCount} {message("bookingsNotesLabel")}
                    </Badge>
                  </Link>

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
    </WorkspaceShell>
  );
}
