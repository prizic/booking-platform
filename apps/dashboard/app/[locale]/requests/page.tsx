import Link from "next/link";
import type { Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  Badge,
  EmptyState,
  Facts,
  PageHeader,
  ReferenceCode,
  StatusStamp,
} from "@wlbp/ui-foundation";
import { Inbox } from "lucide-react";
import type { BookingRequestV1 } from "@wlbp/api-contracts";

import { getDashboardMessage } from "../../_lib/copy";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { workspaceStatus } from "../../_lib/workspace-status";
import { countLabel } from "../../_lib/workspace-copy";
import { dominantZone } from "../../_lib/booking-display";
import { Money } from "../../_lib/ui/money";
import { ServiceDye } from "../../_lib/ui/service-dye";
import { When } from "../../_lib/ui/when";
import { ZoneNote } from "../../_lib/ui/zone-note";
import { ResultAlert } from "../../_lib/ui/result-alert";
import { textLinkClass } from "../../_lib/ui/text-link";
import { RequestDecisionForm } from "./request-decision-form";

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
  // The zone most requests use is named once; other zones show per line.
  const viewZone = dominantZone(
    (requests ?? []).map((booking) => booking.locationTimeZone),
    "Asia/Riyadh",
  );

  return (
    <WorkspaceShell current="requests" labelledBy="requests-title" locale={locale}>
      <PageHeader
        titleId="requests-title"
        title={message("requestsTitle")}
        description={message("requestsSummary")}
        meta={
          requests && requests.length > 0 ? (
            <>
              <Badge tone="warning">
                {countLabel(locale, "requests", requests.length)}
              </Badge>
              <ZoneNote locale={locale} timeZone={viewZone} />
            </>
          ) : null
        }
      />
      {resultKey === null ? null : (
        <ResultAlert
          positive={
            result === "accepted" || result === "proposed" || result === "rejected"
          }
        >
          {message(resultKey)}
        </ResultAlert>
      )}
      {requests === null ? (
        <Alert tone="danger">
          <AlertDescription className="text-foreground">
            {message("requestsUnavailable")}
          </AlertDescription>
        </Alert>
      ) : requests.length === 0 ? (
        <EmptyState
          icon={<Inbox aria-hidden="true" />}
          title={message("requestsEmpty")}
        />
      ) : (
        <ul
          aria-label={message("requestsQueueLabel")}
          className="grid gap-4 2xl:grid-cols-2"
        >
          {requests.map((booking) => (
            <li key={booking.bookingId}>
              <article
                aria-labelledby={`request-${booking.bookingId}`}
                className="grid gap-5 rounded-lg border bg-card p-5"
              >
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <ReferenceCode>{booking.publicReference}</ReferenceCode>
                    <h2
                      id={`request-${booking.bookingId}`}
                      className="text-lg leading-snug font-semibold"
                    >
                      <ServiceDye name={booking.serviceName} />
                    </h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusStamp state="requested">
                      {workspaceStatus(locale, "requested")}
                    </StatusStamp>
                    <Link
                      className={textLinkClass}
                      href={`/${locale}/bookings/${booking.bookingId}`}
                    >
                      {message("calendarOpenBooking")}
                    </Link>
                  </div>
                </header>
                <Facts
                  columns={3}
                  items={[
                    {
                      key: "when",
                      label: message("requestsRequestedAtLabel"),
                      value: (
                        <When
                          instant={booking.startAt}
                          locale={locale}
                          timeZone={booking.locationTimeZone}
                          viewTimeZone={viewZone}
                        />
                      ),
                    },
                    {
                      key: "deadline",
                      label: message("requestsDeadlineLabel"),
                      value: (
                        <When
                          className="text-warning"
                          instant={booking.approvalDeadline}
                          locale={locale}
                          timeZone={booking.locationTimeZone}
                          viewTimeZone={viewZone}
                        />
                      ),
                    },
                    {
                      key: "customer",
                      label: message("requestsCustomerLabel"),
                      value:
                        booking.customerDisplayName ??
                        message("requestsCustomerHidden"),
                    },
                    {
                      key: "intake",
                      label: message("requestsIntakeLabel"),
                      value: booking.hasIntake
                        ? message("requestsIntakePresent")
                        : message("requestsIntakeAbsent"),
                    },
                    {
                      key: "price",
                      label: message("requestsPriceLabel"),
                      value: (
                        <Money
                          minor={booking.price.minorUnits}
                          currency={booking.price.currency}
                          locale={locale}
                        />
                      ),
                    },
                  ]}
                />
                {booking.proposal === null ? null : (
                  <Alert tone="warning">
                    <AlertDescription className="text-foreground">
                      {message("requestsProposalLabel")}:{" "}
                      <When
                        instant={booking.proposal.startAt}
                        locale={locale}
                        timeZone={booking.locationTimeZone}
                        viewTimeZone={viewZone}
                      />
                    </AlertDescription>
                  </Alert>
                )}

                <RequestDecisionForm
                  locale={locale}
                  bookingId={booking.bookingId}
                  bookingRevision={booking.bookingRevision}
                  locationTimeZone={booking.locationTimeZone}
                />
              </article>
            </li>
          ))}
        </ul>
      )}
    </WorkspaceShell>
  );
}
