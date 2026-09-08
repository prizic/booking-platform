import { formatCurrency, formatDateTime, type Locale } from "@wlbp/i18n";
import { Badge, Button, StatusMessage, Surface } from "@wlbp/ui-foundation";
import { BrandShell } from "@wlbp/white-label-ui";
import Image from "next/image";
import Link from "next/link";
import type { BookingRequestV1 } from "@wlbp/api-contracts";

import { dashboardBrand } from "../../_lib/brand";
import { getDashboardMessage } from "../../_lib/copy";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { decideRequestAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type RequestsPageProps = {
  readonly params: Promise<{ locale: Locale }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const resultKeys = {
  accepted: "requestsResultAccepted",
  "backend-unavailable": "requestsResultUnavailable",
  "invalid-request": "requestsResultInvalid",
  "not-authorized": "requestsResultNotAuthorized",
  proposed: "requestsResultProposed",
  rejected: "requestsResultRejected",
  "revision-conflict": "requestsResultConflict",
  "slot-unavailable": "requestsResultSlotUnavailable",
} as const;

async function loadRequests(
  locale: Locale,
): Promise<readonly BookingRequestV1[] | null> {
  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.listBookingRequests === undefined
  ) {
    return null;
  }
  // A read that fails closed shows the unavailable copy rather than an empty
  // queue, so nobody reads "no requests" as "nothing to decide".
  return request.source
    .listBookingRequests(request.state.context.tenantId)
    .catch(() => null);
}

export default async function RequestsPage({
  params,
  searchParams,
}: RequestsPageProps) {
  const { locale } = await params;
  const query = await searchParams;
  const requests = await loadRequests(locale);
  const message = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);
  const result = typeof query.result === "string" ? query.result : null;
  const resultKey =
    result !== null && result in resultKeys
      ? resultKeys[result as keyof typeof resultKeys]
      : null;
  const proposalLink =
    typeof query.link === "string" && /^[a-f0-9]{64}$/u.test(query.link)
      ? query.link
      : null;

  return (
    <BrandShell
      className="dashboard-shell"
      labelledBy="requests-title"
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
          <Link aria-current="page" href={`/${locale}/requests`}>
            <span aria-hidden="true">02</span>
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
              href="/en/requests"
              aria-current={locale === "en" ? "page" : undefined}
            >
              <span aria-hidden="true">EN</span>
              <span className="sr-only">{message("languageEnglish")}</span>
            </Link>
            <Link
              href="/ar/requests"
              aria-current={locale === "ar" ? "page" : undefined}
            >
              <span aria-hidden="true">عربي</span>
              <span className="sr-only">{message("languageArabic")}</span>
            </Link>
          </nav>
        </header>

        <Surface as="section" className="requests-queue" labelledBy="requests-title">
          <h1 id="requests-title">{message("requestsTitle")}</h1>
          <p>{message("requestsSummary")}</p>
          {resultKey === null ? null : (
            <StatusMessage
              tone={
                result === "accepted" || result === "proposed" || result === "rejected"
                  ? "positive"
                  : "warning"
              }
            >
              {message(resultKey)}
            </StatusMessage>
          )}
          {proposalLink === null ? null : (
            <div className="requests-queue__link">
              <p>{message("requestsProposalLinkHint")}</p>
              <label htmlFor="proposal-link">
                {message("requestsProposalLinkLabel")}
              </label>
              <input
                dir="ltr"
                id="proposal-link"
                name="proposalLink"
                readOnly
                value={`/${locale}/proposal?token=${proposalLink}`}
              />
            </div>
          )}

          {requests === null ? (
            <p>{message("requestsUnavailable")}</p>
          ) : requests.length === 0 ? (
            <p>{message("requestsEmpty")}</p>
          ) : (
            <ul aria-label={message("requestsQueueLabel")} className="requests-list">
              {requests.map((booking) => (
                <li key={booking.bookingId}>
                  <article aria-labelledby={`request-${booking.bookingId}`}>
                    <h2 id={`request-${booking.bookingId}`}>
                      {booking.serviceName} · <bdi>{booking.publicReference}</bdi>
                    </h2>
                    <dl>
                      <div>
                        <dt>{message("requestsRequestedAtLabel")}</dt>
                        <dd>
                          {formatDateTime(
                            booking.startAt,
                            locale,
                            booking.locationTimeZone,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>{message("requestsDeadlineLabel")}</dt>
                        <dd>
                          {formatDateTime(
                            booking.approvalDeadline,
                            locale,
                            booking.locationTimeZone,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>{message("requestsCustomerLabel")}</dt>
                        <dd>
                          {booking.customerDisplayName ??
                            message("requestsCustomerHidden")}
                        </dd>
                      </div>
                      <div>
                        <dt>{message("requestsIntakeLabel")}</dt>
                        <dd>
                          {booking.hasIntake
                            ? message("requestsIntakePresent")
                            : message("requestsIntakeAbsent")}
                        </dd>
                      </div>
                      <div>
                        <dt>{message("requestsPriceLabel")}</dt>
                        <dd>
                          {formatCurrency(
                            booking.price.minorUnits,
                            booking.price.currency,
                            locale,
                          )}
                        </dd>
                      </div>
                    </dl>
                    {booking.proposal === null ? null : (
                      <StatusMessage tone="warning">
                        {message("requestsProposalLabel")}:{" "}
                        {formatDateTime(
                          booking.proposal.startAt,
                          locale,
                          booking.locationTimeZone,
                        )}
                      </StatusMessage>
                    )}

                    <form action={decideRequestAction}>
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
                      <label htmlFor={`public-${booking.bookingId}`}>
                        {message("requestsPublicReasonLabel")}
                      </label>
                      <p id={`public-hint-${booking.bookingId}`}>
                        {message("requestsPublicReasonHint")}
                      </p>
                      <textarea
                        aria-describedby={`public-hint-${booking.bookingId}`}
                        id={`public-${booking.bookingId}`}
                        maxLength={500}
                        name="publicReason"
                        rows={2}
                      />
                      <label htmlFor={`internal-${booking.bookingId}`}>
                        {message("requestsInternalReasonLabel")}
                      </label>
                      <p id={`internal-hint-${booking.bookingId}`}>
                        {message("requestsInternalReasonHint")}
                      </p>
                      <textarea
                        aria-describedby={`internal-hint-${booking.bookingId}`}
                        id={`internal-${booking.bookingId}`}
                        maxLength={500}
                        name="internalReason"
                        rows={2}
                      />
                      <label htmlFor={`proposed-${booking.bookingId}`}>
                        {message("requestsProposeTimeLabel")}
                      </label>
                      <input
                        id={`proposed-${booking.bookingId}`}
                        name="proposedStartAt"
                        type="datetime-local"
                      />
                      <div className="requests-actions">
                        <Button name="action" type="submit" value="accept">
                          {message("requestsAccept")}
                        </Button>
                        <Button
                          name="action"
                          type="submit"
                          value="propose"
                          variant="secondary"
                        >
                          {message("requestsPropose")}
                        </Button>
                        <Button
                          name="action"
                          type="submit"
                          value="reject"
                          variant="secondary"
                        >
                          {message("requestsReject")}
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
