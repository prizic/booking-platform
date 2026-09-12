import { formatCurrency, formatDateTime, type Locale } from "@wlbp/i18n";
import { Badge, Button, StatusMessage, Surface } from "@wlbp/ui-foundation";
import Link from "next/link";

import type { BookingDetailV1 } from "../../../_lib/dashboard-access";
import { getDashboardMessage } from "../../../_lib/copy";
import { loadDashboardRequestAccess } from "../../../_lib/dashboard-server";
import { WorkspaceShell } from "../../../_lib/workspace-shell";
import { addBookingNoteAction, transitionBookingAction } from "../actions";
import { detailResultKeys, positiveResults } from "../results";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type BookingDetailPageProps = {
  readonly params: Promise<{ bookingId: string; locale: Locale }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Every action is offered; the database decides which one this booking can
// actually make. Hiding a control is presentation, never authorization, and a
// hidden control would also hide the honest refusal that teaches an operator
// what state the booking is really in.
const actions = [
  { key: "check_in", label: "detailCheckIn" },
  { key: "complete", label: "detailComplete" },
  { key: "no_show", label: "detailNoShow" },
  { key: "correct", label: "detailCorrect" },
] as const;

async function loadDetail(
  locale: Locale,
  bookingId: string,
): Promise<BookingDetailV1 | null> {
  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.getBookingDetail === undefined
  ) {
    return null;
  }
  return request.source
    .getBookingDetail({ bookingId, tenantId: request.state.context.tenantId })
    .catch(() => null);
}

export default async function BookingDetailPage({
  params,
  searchParams,
}: BookingDetailPageProps) {
  const { bookingId, locale } = await params;
  const query = await searchParams;
  const booking = await loadDetail(locale, bookingId);
  const message = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);
  const result = typeof query.result === "string" ? query.result : null;
  const resultKey =
    result !== null && result in detailResultKeys
      ? detailResultKeys[result as keyof typeof detailResultKeys]
      : null;

  return (
    <WorkspaceShell current="bookings" labelledBy="detail-title" locale={locale}>
      <Surface as="section" className="requests-queue" labelledBy="detail-title">
        <h1 id="detail-title">
          {booking === null ? (
            message("detailTitle")
          ) : (
            <>
              {booking.serviceName} · <bdi>{booking.publicReference}</bdi>
            </>
          )}
        </h1>
        <Link href={`/${locale}/bookings`}>{message("detailBackToList")}</Link>
        {resultKey === null ? null : (
          <StatusMessage
            tone={positiveResults.has(result ?? "") ? "positive" : "warning"}
          >
            {message(resultKey)}
          </StatusMessage>
        )}

        {booking === null ? (
          <p>{message("detailUnavailable")}</p>
        ) : (
          <>
            <dl>
              <div>
                <dt>{message("bookingsWhenLabel")}</dt>
                <dd>
                  {formatDateTime(booking.startAt, locale, booking.locationTimeZone)}{" "}
                  <bdi>({booking.locationTimeZone})</bdi>
                </dd>
              </div>
              <div>
                <dt>{message("bookingsStatusLabel")}</dt>
                {/* Status is words, never colour alone. */}
                <dd>{booking.status}</dd>
              </div>
              <div>
                <dt>{message("detailDurationLabel")}</dt>
                <dd>{booking.durationMinutes}</dd>
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
                <dt>{message("detailPriceLabel")}</dt>
                <dd>{formatCurrency(booking.priceMinor, booking.currency, locale)}</dd>
              </div>
              <div>
                <dt>{message("detailRescheduleCountLabel")}</dt>
                <dd>{booking.rescheduleCount}</dd>
              </div>
              <div>
                <dt>{message("detailLocationLabel")}</dt>
                <dd>{booking.locationName}</dd>
              </div>
              {booking.cancelledAt === null ? null : (
                <div>
                  <dt>{message("detailCancelledAtLabel")}</dt>
                  <dd>
                    {formatDateTime(
                      booking.cancelledAt,
                      locale,
                      booking.locationTimeZone,
                    )}
                  </dd>
                </div>
              )}
              {booking.refundEligibleMinor === null ? null : (
                <div>
                  <dt>{message("detailRefundLabel")}</dt>
                  <dd>
                    {formatCurrency(
                      booking.refundEligibleMinor,
                      booking.currency,
                      locale,
                    )}
                  </dd>
                </div>
              )}
              <div>
                <dt>{message("detailCustomerLabel")}</dt>
                {/* Absent, not blanked: the read never carried it. */}
                <dd>{booking.customerFullName ?? message("detailContactHidden")}</dd>
              </div>
              <div>
                <dt>{message("detailEmailLabel")}</dt>
                <dd>
                  {booking.customerEmail === null ? (
                    message("detailContactHidden")
                  ) : (
                    <bdi>{booking.customerEmail}</bdi>
                  )}
                </dd>
              </div>
              <div>
                <dt>{message("detailPhoneLabel")}</dt>
                <dd>
                  {booking.customerPhone === null ? (
                    message("detailContactHidden")
                  ) : (
                    <bdi>{booking.customerPhone}</bdi>
                  )}
                </dd>
              </div>
              <div>
                <dt>{message("bookingsListLabel")}</dt>
                <dd>
                  {booking.hasIntake
                    ? message("detailIntakePresent")
                    : message("detailIntakeAbsent")}
                </dd>
              </div>
            </dl>

            <section aria-labelledby="detail-actions">
              <h2 id="detail-actions">{message("detailLifecycleTitle")}</h2>
              <p>{message("detailLifecycleHint")}</p>
              <form action={transitionBookingAction}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="bookingId" value={booking.bookingId} />
                <input
                  type="hidden"
                  name="expectedRevision"
                  value={booking.bookingRevision}
                />
                <label htmlFor="transition-reason">
                  {message("detailReasonLabel")}
                </label>
                <textarea
                  id="transition-reason"
                  maxLength={500}
                  name="reason"
                  rows={2}
                />
                <div className="requests-actions">
                  {actions.map((action) => (
                    <Button
                      key={action.key}
                      name="action"
                      type="submit"
                      value={action.key}
                      variant={action.key === "check_in" ? "primary" : "secondary"}
                    >
                      {message(action.label)}
                    </Button>
                  ))}
                </div>
              </form>
            </section>

            <section aria-labelledby="detail-history">
              <h2 id="detail-history">{message("detailHistoryTitle")}</h2>
              <ol className="requests-list">
                {booking.history.map((entry) => (
                  <li key={entry.sequence}>
                    <article>
                      <h3>{entry.eventType}</h3>
                      <dl>
                        <div>
                          <dt>{message("bookingsWhenLabel")}</dt>
                          <dd>
                            {formatDateTime(
                              entry.createdAt,
                              locale,
                              booking.locationTimeZone,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>{message("detailHistoryActorLabel")}</dt>
                          <dd>{entry.actorKind}</dd>
                        </div>
                      </dl>
                      {entry.reason === null ? null : <p>{entry.reason}</p>}
                    </article>
                  </li>
                ))}
              </ol>
            </section>

            <section aria-labelledby="detail-notes">
              <h2 id="detail-notes">{message("detailNotesTitle")}</h2>
              {booking.notes.length === 0 ? (
                <p>{message("detailNotesEmpty")}</p>
              ) : (
                <ul className="requests-list">
                  {booking.notes.map((note) => (
                    <li key={note.noteId}>
                      <article>
                        <Badge
                          tone={note.visibility === "sensitive" ? "warning" : "neutral"}
                        >
                          {message(
                            note.visibility === "sensitive"
                              ? "detailNoteSensitive"
                              : "detailNoteOperational",
                          )}
                        </Badge>
                        <p>{note.body}</p>
                      </article>
                    </li>
                  ))}
                </ul>
              )}

              <form action={addBookingNoteAction}>
                <h3>{message("detailAddNoteTitle")}</h3>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="bookingId" value={booking.bookingId} />
                <label htmlFor="note-body">{message("detailNoteBodyLabel")}</label>
                <textarea id="note-body" maxLength={2000} name="body" rows={3} />
                <label htmlFor="note-visibility">
                  {message("detailNoteVisibilityLabel")}
                </label>
                <select id="note-visibility" name="visibility">
                  <option value="operational">
                    {message("detailNoteOperational")}
                  </option>
                  <option value="sensitive">{message("detailNoteSensitive")}</option>
                </select>
                <Button type="submit">{message("detailAddNote")}</Button>
              </form>
            </section>
          </>
        )}
      </Surface>
    </WorkspaceShell>
  );
}
