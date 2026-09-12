import { formatCurrency, type Locale } from "@wlbp/i18n";
import { Button, StatusMessage, Surface } from "@wlbp/ui-foundation";

import { getDashboardMessage } from "../../_lib/copy";
import { columnsOf, renderCsv } from "../../_lib/csv";
import type {
  BookingReportV1,
  ReportExportV1,
  RevenueReportV1,
  UtilizationRowV1,
} from "../../_lib/dashboard-access";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { runReportExportAction } from "./actions";
import { positiveReportResults, reportResultKeys } from "./results";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type ReportsPageProps = {
  readonly params: Promise<{ locale: Locale }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function single(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" && candidate.trim() !== ""
    ? candidate.trim()
    : null;
}

/** A plain ISO date, or null. Never passed on to the database unvalidated. */
function isoDate(value: string | null): string | null {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : null;
}

function percent(bps: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(bps / 10000);
}

export default async function ReportsPage({ params, searchParams }: ReportsPageProps) {
  const { locale } = await params;
  const query = await searchParams;
  const message = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);

  const today = new Date().toISOString().slice(0, 10);
  const from = isoDate(single(query.from)) ?? today;
  const to = isoDate(single(query.to)) ?? today;
  const timeZone = single(query.tz) ?? "UTC";
  const exportId = single(query.export);

  const request = await loadDashboardRequestAccess(locale);
  const ready = request.source !== null && request.state.kind === "ready";
  const tenantId = ready ? request.state.context.tenantId : null;
  const scope = { from, locationId: null, tenantId: tenantId ?? "", timeZone, to };

  // Each read is independent: a member who may run the day but not see the
  // money gets the operational panels and no revenue panel, rather than an
  // error page or a panel full of zeroes.
  const booking: BookingReportV1 | null =
    ready && tenantId !== null
      ? ((await request.source?.getBookingReport?.(scope).catch(() => null)) ?? null)
      : null;
  const utilization: readonly UtilizationRowV1[] =
    ready && tenantId !== null
      ? ((await request.source?.getUtilizationReport?.(scope).catch(() => [])) ?? [])
      : [];
  const revenue: RevenueReportV1 | null =
    ready && tenantId !== null
      ? ((await request.source?.getRevenueReport?.(scope).catch(() => null)) ?? null)
      : null;
  const exported: ReportExportV1 | null =
    ready && tenantId !== null && exportId !== null
      ? ((await request.source
          ?.getReportExport?.({ exportId, tenantId })
          .catch(() => null)) ?? null)
      : null;

  const result = single(query.result);
  const resultKey =
    result !== null && result in reportResultKeys
      ? reportResultKeys[result as keyof typeof reportResultKeys]
      : null;

  return (
    <WorkspaceShell current="reports" labelledBy="reports-title" locale={locale}>
      <Surface as="section" className="requests-queue" labelledBy="reports-title">
        <h1 id="reports-title">{message("reportsTitle")}</h1>
        <p>{message("reportsSummary")}</p>
        {resultKey === null ? null : (
          <StatusMessage
            tone={positiveReportResults.has(result ?? "") ? "positive" : "warning"}
          >
            {message(resultKey)}
          </StatusMessage>
        )}

        <form action={`/${locale}/reports`} className="calendar-filters" method="get">
          <label htmlFor="reports-from">{message("reportsFromLabel")}</label>
          <input defaultValue={from} id="reports-from" name="from" type="date" />
          <label htmlFor="reports-to">{message("reportsToLabel")}</label>
          <input defaultValue={to} id="reports-to" name="to" type="date" />
          <label htmlFor="reports-tz">{message("reportsTimeZoneLabel")}</label>
          <input defaultValue={timeZone} id="reports-tz" name="tz" type="text" />
          <Button type="submit">{message("reportsApplyAction")}</Button>
        </form>

        {booking === null ? (
          <p>{message("reportsUnavailable")}</p>
        ) : (
          <section aria-labelledby="reports-bookings-title">
            <h2 id="reports-bookings-title">{message("reportsBookingsTitle")}</h2>
            {/* The denominator is shown, not implied. A rate whose denominator
                is ambiguous is a number two people read two ways. */}
            <p>
              {message("reportsDenominatorNote")} {booking.outcomeDenominator}
            </p>
            {booking.outcomeDenominator === 0 ? (
              <StatusMessage tone="neutral">
                {message("reportsEmptyWindow")}
              </StatusMessage>
            ) : null}
            <dl>
              <div>
                <dt>{message("reportsCreatedLabel")}</dt>
                <dd>{booking.bookingsCreated}</dd>
              </div>
              <div>
                <dt>{message("reportsCompletedLabel")}</dt>
                <dd>{booking.bookingsCompleted}</dd>
              </div>
              <div>
                <dt>{message("reportsNoShowLabel")}</dt>
                <dd>{booking.bookingsNoShow}</dd>
              </div>
              <div>
                <dt>{message("reportsCancelledLabel")}</dt>
                <dd>{booking.bookingsCancelled}</dd>
              </div>
              <div>
                <dt>{message("reportsNoShowRateLabel")}</dt>
                <dd>{percent(booking.noShowRateBps, locale)}</dd>
              </div>
              <div>
                <dt>{message("reportsCompletionRateLabel")}</dt>
                <dd>{percent(booking.completionRateBps, locale)}</dd>
              </div>
              <div>
                <dt>{message("reportsMedianLeadLabel")}</dt>
                <dd>{booking.medianLeadTimeMinutes}</dd>
              </div>
              <div>
                <dt>{message("reportsDefinitionLabel")}</dt>
                <dd dir="ltr">v{booking.reportDefinitionVersion}</dd>
              </div>
            </dl>
          </section>
        )}

        <section aria-labelledby="reports-utilization-title">
          <h2 id="reports-utilization-title">{message("reportsUtilizationTitle")}</h2>
          <p>{message("reportsUtilizationNote")}</p>
          {utilization.length === 0 ? (
            <p>{message("reportsUtilizationEmpty")}</p>
          ) : (
            <ul>
              {utilization.map((row) => (
                <li key={row.staffId}>
                  {row.staffName ?? row.staffId} · {percent(row.utilizationBps, locale)}{" "}
                  · {row.bookedMinutes}/{row.offeredMinutes} · {row.bookingCount}{" "}
                  {message("reportsBookingsUnit")}
                </li>
              ))}
            </ul>
          )}
        </section>

        {revenue === null ? null : (
          <section aria-labelledby="reports-revenue-title">
            <h2 id="reports-revenue-title">{message("reportsRevenueTitle")}</h2>
            {revenue.unsettledPayments > 0 ? (
              // A total that is still moving says so, instead of being read
              // as final and quoted somewhere it cannot be taken back.
              <StatusMessage tone="warning">
                {message("reportsUnsettledNote")} {revenue.unsettledPayments}
              </StatusMessage>
            ) : null}
            <dl>
              <div>
                <dt>{message("reportsChargedLabel")}</dt>
                <dd>
                  {formatCurrency(
                    revenue.chargedMinor,
                    revenue.currency || "USD",
                    locale,
                  )}
                </dd>
              </div>
              <div>
                <dt>{message("reportsRefundedLabel")}</dt>
                <dd>
                  {formatCurrency(
                    revenue.refundedMinor,
                    revenue.currency || "USD",
                    locale,
                  )}
                </dd>
              </div>
              <div>
                <dt>{message("reportsNetLabel")}</dt>
                <dd>
                  {formatCurrency(revenue.netMinor, revenue.currency || "USD", locale)}
                </dd>
              </div>
              <div>
                <dt>{message("reportsAovLabel")}</dt>
                <dd>
                  {formatCurrency(
                    revenue.averageOrderValueMinor,
                    revenue.currency || "USD",
                    locale,
                  )}
                </dd>
              </div>
              <div>
                <dt>{message("reportsOutstandingLabel")}</dt>
                <dd>
                  {formatCurrency(
                    revenue.outstandingMinor,
                    revenue.currency || "USD",
                    locale,
                  )}
                </dd>
              </div>
            </dl>
          </section>
        )}

        <section aria-labelledby="reports-export-title">
          <h2 id="reports-export-title">{message("reportsExportTitle")}</h2>
          <form action={runReportExportAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="from" value={from} />
            <input type="hidden" name="to" value={to} />
            <input type="hidden" name="timeZone" value={timeZone} />
            <label htmlFor="reports-export-key">{message("reportsExportWhich")}</label>
            <select defaultValue="bookings" id="reports-export-key" name="reportKey">
              <option value="bookings">{message("reportsBookingsTitle")}</option>
              <option value="utilization">{message("reportsUtilizationTitle")}</option>
              <option value="revenue">{message("reportsRevenueTitle")}</option>
              <option value="customers">{message("reportsCustomersTitle")}</option>
            </select>
            <Button type="submit">{message("reportsExportAction")}</Button>
          </form>

          {exported === null || exported.rows.length === 0 ? null : (
            <>
              <p>
                {message("reportsExportRows")} {exported.rowCount}
              </p>
              {/* ponytail: the CSV is rendered here rather than served as a
                  download, because there is nowhere durable to put a file yet —
                  the same recoverability gate that keeps exports out of Storage
                  until issue #39. Escaping and formula-injection safety live in
                  `_lib/csv.ts` and are unit tested. */}
              <label htmlFor="reports-export-csv">{message("reportsExportCsv")}</label>
              <textarea
                dir="ltr"
                id="reports-export-csv"
                readOnly
                rows={8}
                value={renderCsv(columnsOf(exported.rows), exported.rows)}
              />
            </>
          )}
        </section>
      </Surface>
    </WorkspaceShell>
  );
}
