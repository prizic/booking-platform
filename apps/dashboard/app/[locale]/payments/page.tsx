import { formatCurrency, formatDateTime, type Locale } from "@wlbp/i18n";
import { Badge, Button, StatusMessage, Surface } from "@wlbp/ui-foundation";
import Link from "next/link";

import { getDashboardMessage } from "../../_lib/copy";
import type { PaymentExceptionV1, RefundRowV1 } from "../../_lib/dashboard-access";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { requestRefundAction, resolveExceptionAction } from "./actions";
import { paymentResultKeys, positivePaymentResults } from "./results";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type PaymentsPageProps = {
  readonly params: Promise<{ locale: Locale }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// How an operator can close an item. The database re-checks every one of these;
// offering them here is presentation, never authorization.
const resolutions = [
  "refunded",
  "written_off",
  "contested",
  "reconciled",
  "no_action_needed",
] as const;

async function load(
  locale: Locale,
  status: string | null,
): Promise<{
  exceptions: readonly PaymentExceptionV1[];
  refunds: readonly RefundRowV1[];
} | null> {
  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.listPaymentExceptions === undefined
  ) {
    return null;
  }
  const tenantId = request.state.context.tenantId;
  // A failed read shows the unavailable copy rather than an empty queue, so
  // nobody reads "nothing to do" as "nothing is wrong".
  const exceptions = await request.source
    .listPaymentExceptions({ status, tenantId })
    .catch(() => null);
  if (exceptions === null) return null;
  const refunds =
    (await request.source
      .listRefunds?.({ bookingId: null, tenantId })
      .catch(() => [])) ?? [];
  return { exceptions, refunds };
}

export default async function PaymentsPage({
  params,
  searchParams,
}: PaymentsPageProps) {
  const { locale } = await params;
  const query = await searchParams;
  const message = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);

  const requested = typeof query.status === "string" ? query.status : "open";
  const status = requested === "all" ? null : requested;
  const loaded = await load(locale, status);
  const result = typeof query.result === "string" ? query.result : null;
  const resultKey =
    result !== null && result in paymentResultKeys
      ? paymentResultKeys[result as keyof typeof paymentResultKeys]
      : null;

  return (
    <WorkspaceShell current="payments" labelledBy="payments-title" locale={locale}>
      <Surface as="section" className="requests-queue" labelledBy="payments-title">
        <h1 id="payments-title">{message("paymentsTitle")}</h1>
        <p>{message("paymentsSummary")}</p>
        {resultKey === null ? null : (
          <StatusMessage
            tone={positivePaymentResults.has(result ?? "") ? "positive" : "warning"}
          >
            {message(resultKey)}
          </StatusMessage>
        )}

        <form action={`/${locale}/payments`} className="calendar-filters" method="get">
          <label htmlFor="payments-status">{message("paymentsStatusLabel")}</label>
          <select defaultValue={requested} id="payments-status" name="status">
            <option value="open">{message("paymentsStatusOpen")}</option>
            <option value="resolved">{message("paymentsStatusResolved")}</option>
            <option value="all">{message("paymentsStatusAll")}</option>
          </select>
          <Button type="submit">{message("paymentsFilterAction")}</Button>
        </form>

        {loaded === null ? (
          <p>{message("paymentsUnavailable")}</p>
        ) : (
          <>
            <section aria-labelledby="payments-queue-title">
              <h2 id="payments-queue-title">{message("paymentsQueueTitle")}</h2>
              {loaded.exceptions.length === 0 ? (
                <p>{message("paymentsQueueEmpty")}</p>
              ) : (
                <ul
                  aria-label={message("paymentsQueueTitle")}
                  className="requests-list"
                >
                  {loaded.exceptions.map((item) => (
                    <li key={item.exceptionId}>
                      <article aria-labelledby={`exception-${item.exceptionId}`}>
                        <h3 id={`exception-${item.exceptionId}`}>
                          {/* A stable kind code. It is deliberately not
                              translated: operators search and escalate on these
                              strings, and a localized one cannot be searched. */}
                          <span dir="ltr">{item.kind}</span>{" "}
                          <Badge
                            tone={item.severity === "urgent" ? "warning" : "neutral"}
                          >
                            {item.severity}
                          </Badge>
                        </h3>
                        <dl>
                          <div>
                            <dt>{message("paymentsDetailLabel")}</dt>
                            {/* A stable code, never a provider body: this queue
                                is read by operators and must never quote a
                                customer back at them. */}
                            <dd dir="ltr">{item.detailCode}</dd>
                          </div>
                          {item.amountMinorUnits === null ||
                          item.currency === null ? null : (
                            <div>
                              <dt>{message("paymentsAmountLabel")}</dt>
                              <dd>
                                {formatCurrency(
                                  item.amountMinorUnits,
                                  item.currency,
                                  locale,
                                )}
                              </dd>
                            </div>
                          )}
                          <div>
                            <dt>{message("paymentsRaisedLabel")}</dt>
                            <dd>{formatDateTime(item.createdAt, locale, "UTC")}</dd>
                          </div>
                          {item.publicReference === null ? null : (
                            <div>
                              <dt>{message("bookingsTitle")}</dt>
                              <dd>
                                <Link
                                  href={`/${locale}/bookings/${item.bookingId ?? ""}`}
                                >
                                  <bdi>{item.publicReference}</bdi>
                                </Link>
                              </dd>
                            </div>
                          )}
                        </dl>

                        {item.status !== "open" ? (
                          <p>
                            {message("paymentsResolvedAs")} {item.resolution}
                          </p>
                        ) : (
                          <>
                            {item.bookingId === null ? null : (
                              <form action={requestRefundAction}>
                                <input type="hidden" name="locale" value={locale} />
                                <input
                                  type="hidden"
                                  name="bookingId"
                                  value={item.bookingId}
                                />
                                <Button type="submit" variant="secondary">
                                  {message("paymentsRetryRefund")}
                                </Button>
                              </form>
                            )}
                            <form action={resolveExceptionAction}>
                              <input type="hidden" name="locale" value={locale} />
                              <input
                                type="hidden"
                                name="exceptionId"
                                value={item.exceptionId}
                              />
                              <label htmlFor={`note-${item.exceptionId}`}>
                                {message("paymentsNoteLabel")}
                              </label>
                              <textarea
                                id={`note-${item.exceptionId}`}
                                maxLength={500}
                                name="note"
                                rows={2}
                              />
                              <label htmlFor={`resolution-${item.exceptionId}`}>
                                {message("paymentsResolutionLabel")}
                              </label>
                              <select
                                defaultValue="reconciled"
                                id={`resolution-${item.exceptionId}`}
                                name="resolution"
                              >
                                {resolutions.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                              <Button type="submit">
                                {message("paymentsResolveAction")}
                              </Button>
                            </form>
                          </>
                        )}
                      </article>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="payments-refunds-title">
              <h2 id="payments-refunds-title">{message("paymentsRefundsTitle")}</h2>
              {loaded.refunds.length === 0 ? (
                <p>{message("paymentsRefundsEmpty")}</p>
              ) : (
                <ul aria-label={message("paymentsRefundsTitle")}>
                  {loaded.refunds.map((refund) => (
                    <li key={refund.refundId}>
                      {formatCurrency(refund.amountMinorUnits, refund.currency, locale)}{" "}
                      · {refund.status}
                      {refund.publicReference === null ? null : (
                        <>
                          {" "}
                          · <bdi>{refund.publicReference}</bdi>
                        </>
                      )}
                      {refund.attempts === 0
                        ? null
                        : ` · ${refund.attempts} ${message("paymentsAttempts")}`}
                      {refund.failureCode === null ? null : (
                        <>
                          {" "}
                          · <span dir="ltr">{refund.failureCode}</span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </Surface>
    </WorkspaceShell>
  );
}
