import type { Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  Button,
  DatePicker,
  Input,
  EmptyState,
  Facts,
  Field,
  Label,
  PageHeader,
  Section,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  Toolbar,
} from "@wlbp/ui-foundation";
import { ChartColumn, Download } from "lucide-react";

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
import { formatCount, intlLocale } from "../../_lib/booking-display";
import { countLabel, workspaceMessage } from "../../_lib/workspace-copy";
import { Money } from "../../_lib/ui/money";
import { RecordCard, RecordCards, TableFrame } from "../../_lib/ui/record-cards";
import { ResultAlert } from "../../_lib/ui/result-alert";
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
  return new Intl.NumberFormat(intlLocale(locale), {
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
  const choices =
    ready && tenantId
      ? await request.source
          ?.getOperationalChoices?.(tenantId, locale)
          .catch(() => null)
      : null;
  const locations = [
    ...new Map(
      (choices?.offers ?? []).map((o) => [
        o.locationId,
        { id: o.locationId, name: o.locationName },
      ]),
    ).values(),
  ];
  const locationId = locations.some((c) => c.id === single(query.location))
    ? single(query.location)
    : null;
  const scope = { from, locationId, tenantId: tenantId ?? "", timeZone, to };

  // Each read is independent: a member who may run the day but not see the
  // money gets the operational panels and no revenue panel, rather than an
  // error page or a panel full of zeroes.
  const booking: BookingReportV1 | null =
    ready && tenantId !== null
      ? ((await request.source?.getBookingReport?.(scope).catch(() => null)) ?? null)
      : null;
  const utilization: readonly UtilizationRowV1[] | null =
    ready && tenantId !== null
      ? ((await request.source?.getUtilizationReport?.(scope).catch(() => null)) ??
        null)
      : null;
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

  const money = (minor: number) =>
    revenue === null ? (
      ""
    ) : (
      <Money minor={minor} currency={revenue.currency || "USD"} locale={locale} />
    );

  return (
    <WorkspaceShell current="reports" labelledBy="reports-title" locale={locale}>
      <PageHeader
        titleId="reports-title"
        title={message("reportsTitle")}
        description={message("reportsSummary")}
      />
      {resultKey === null ? null : (
        <ResultAlert positive={positiveReportResults.has(result ?? "")}>
          {message(resultKey)}
        </ResultAlert>
      )}

      <form action={`/${locale}/reports`} method="get">
        <Toolbar>
          <Field>
            <Label htmlFor="reports-from">{message("reportsFromLabel")}</Label>
            <DatePicker
              defaultValue={from}
              id="reports-from"
              name="from"
              locale={locale}
              placeholder={workspaceMessage(locale, "datePlaceholder")}
            />
          </Field>
          <Field>
            <Label htmlFor="reports-to">{message("reportsToLabel")}</Label>
            <DatePicker
              defaultValue={to}
              id="reports-to"
              name="to"
              locale={locale}
              placeholder={workspaceMessage(locale, "datePlaceholder")}
            />
          </Field>
          <Field>
            <Label htmlFor="reports-location">
              {workspaceMessage(locale, "reportsLocation")}
            </Label>
            {/* "all" stands in for the empty choice Radix cannot carry; only a
                permitted location id is ever read back, so it means no filter. */}
            <Select name="location" defaultValue={locationId ?? "all"}>
              <SelectTrigger id="reports-location">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {workspaceMessage(locale, "reportsAllLocations")}
                </SelectItem>
                {locations.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <Label htmlFor="reports-tz">{message("reportsTimeZoneLabel")}</Label>
            <Input
              defaultValue={timeZone}
              dir="ltr"
              id="reports-tz"
              name="tz"
              type="text"
            />
          </Field>
          <Button type="submit" variant="secondary">
            {message("reportsApplyAction")}
          </Button>
        </Toolbar>
      </form>

      {booking === null ? (
        <Alert tone="danger">
          <AlertDescription className="text-foreground">
            {message("reportsUnavailable")}
          </AlertDescription>
        </Alert>
      ) : (
        <Section
          id="reports-bookings"
          title={message("reportsBookingsTitle")}
          // The denominator is shown, not implied. A rate whose denominator is
          // ambiguous is a number two people read two ways.
          description={`${message("reportsDenominatorNote")} ${formatCount(
            booking.outcomeDenominator,
            locale,
          )}`}
        >
          {booking.outcomeDenominator === 0 ? (
            <Alert tone="info">
              <AlertDescription>{message("reportsEmptyWindow")}</AlertDescription>
            </Alert>
          ) : null}
          <Facts
            columns={3}
            className="rounded-lg border bg-card p-5"
            items={[
              {
                key: "created",
                label: message("reportsCreatedLabel"),
                value: formatCount(booking.bookingsCreated, locale),
              },
              {
                key: "completed",
                label: message("reportsCompletedLabel"),
                value: formatCount(booking.bookingsCompleted, locale),
              },
              {
                key: "noshow",
                label: message("reportsNoShowLabel"),
                value: formatCount(booking.bookingsNoShow, locale),
              },
              {
                key: "cancelled",
                label: message("reportsCancelledLabel"),
                value: formatCount(booking.bookingsCancelled, locale),
              },
              {
                key: "noshow-rate",
                label: message("reportsNoShowRateLabel"),
                value: percent(booking.noShowRateBps, locale),
              },
              {
                key: "completion-rate",
                label: message("reportsCompletionRateLabel"),
                value: percent(booking.completionRateBps, locale),
              },
              {
                key: "lead",
                label: message("reportsMedianLeadLabel"),
                value: formatCount(booking.medianLeadTimeMinutes, locale),
              },
              {
                key: "definition",
                label: message("reportsDefinitionLabel"),
                value: (
                  <span dir="ltr" className="font-latin">
                    v{booking.reportDefinitionVersion}
                  </span>
                ),
              },
            ]}
          />
        </Section>
      )}

      <Section
        id="reports-utilization"
        title={message("reportsUtilizationTitle")}
        description={message("reportsUtilizationNote")}
      >
        {utilization === null ? (
          <Alert tone="danger">
            <AlertDescription className="text-foreground">
              {message("reportsUnavailable")}
            </AlertDescription>
          </Alert>
        ) : utilization.length === 0 ? (
          <EmptyState
            icon={<ChartColumn aria-hidden="true" />}
            title={message("reportsUtilizationEmpty")}
          />
        ) : (
          <>
            <TableFrame>
              <Table label={message("reportsUtilizationTitle")}>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {workspaceMessage(locale, "utilizationMember")}
                    </TableHead>
                    <TableHead className="text-end">
                      {message("reportsUtilizationTitle")}
                    </TableHead>
                    <TableHead className="text-end">
                      {workspaceMessage(locale, "utilizationMinutes")}
                    </TableHead>
                    <TableHead className="text-end">
                      {message("reportsBookingsTitle")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {utilization.map((row) => (
                    <TableRow key={row.staffId}>
                      <TableCell className="font-medium">
                        {row.staffName ?? (
                          <bdi className="font-latin text-xs">{row.staffId}</bdi>
                        )}
                      </TableCell>
                      <TableCell className="text-end font-semibold">
                        {percent(row.utilizationBps, locale)}
                      </TableCell>
                      <TableCell className="text-end">
                        <bdi>
                          {formatCount(row.bookedMinutes, locale)} /{" "}
                          {formatCount(row.offeredMinutes, locale)}
                        </bdi>
                      </TableCell>
                      <TableCell className="text-end">
                        {countLabel(locale, "bookings", row.bookingCount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableFrame>
            <RecordCards label={message("reportsUtilizationTitle")}>
              {utilization.map((row) => (
                <RecordCard
                  key={row.staffId}
                  title={
                    <span className="font-semibold">
                      {row.staffName ?? (
                        <bdi className="font-latin text-xs break-all">
                          {row.staffId}
                        </bdi>
                      )}
                    </span>
                  }
                  aside={
                    <span className="text-lg font-semibold [font-variant-numeric:tabular-nums]">
                      {percent(row.utilizationBps, locale)}
                    </span>
                  }
                  facts={[
                    {
                      key: "minutes",
                      label: workspaceMessage(locale, "utilizationMinutes"),
                      value: (
                        <bdi>
                          {formatCount(row.bookedMinutes, locale)} /{" "}
                          {formatCount(row.offeredMinutes, locale)}
                        </bdi>
                      ),
                    },
                    {
                      key: "bookings",
                      label: message("reportsBookingsTitle"),
                      value: countLabel(locale, "bookings", row.bookingCount),
                    },
                  ]}
                />
              ))}
            </RecordCards>
          </>
        )}
      </Section>

      {revenue === null ? null : (
        <Section id="reports-revenue" title={message("reportsRevenueTitle")}>
          {revenue.unsettledPayments > 0 ? (
            // A total that is still moving says so, instead of being read
            // as final and quoted somewhere it cannot be taken back.
            <Alert tone="warning">
              <AlertDescription className="text-foreground">
                {message("reportsUnsettledNote")}{" "}
                {formatCount(revenue.unsettledPayments, locale)}
              </AlertDescription>
            </Alert>
          ) : null}
          <Facts
            columns={3}
            className="rounded-lg border bg-card p-5"
            items={[
              {
                key: "charged",
                label: message("reportsChargedLabel"),
                value: money(revenue.chargedMinor),
              },
              {
                key: "refunded",
                label: message("reportsRefundedLabel"),
                value: money(revenue.refundedMinor),
              },
              {
                key: "net",
                label: message("reportsNetLabel"),
                value: money(revenue.netMinor),
              },
              {
                key: "aov",
                label: message("reportsAovLabel"),
                value: money(revenue.averageOrderValueMinor),
              },
              {
                key: "outstanding",
                label: message("reportsOutstandingLabel"),
                value: money(revenue.outstandingMinor),
              },
            ]}
          />
        </Section>
      )}

      <Section id="reports-export" title={message("reportsExportTitle")}>
        <form
          action={runReportExportAction}
          className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4"
        >
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="to" value={to} />
          <input type="hidden" name="timeZone" value={timeZone} />
          <input type="hidden" name="locationId" value={locationId ?? ""} />
          <Field className="min-w-56">
            <Label htmlFor="reports-export-key">{message("reportsExportWhich")}</Label>
            <Select defaultValue="bookings" name="reportKey">
              <SelectTrigger id="reports-export-key">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bookings">
                  {message("reportsBookingsTitle")}
                </SelectItem>
                <SelectItem value="utilization">
                  {message("reportsUtilizationTitle")}
                </SelectItem>
                <SelectItem value="revenue">
                  {message("reportsRevenueTitle")}
                </SelectItem>
                <SelectItem value="customers">
                  {message("reportsCustomersTitle")}
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Button type="submit">
            <Download aria-hidden="true" />
            {message("reportsExportAction")}
          </Button>
        </form>

        {exported === null || exported.rows.length === 0 ? null : (
          <Field>
            {/* ponytail: the CSV is rendered here rather than served as a
                download, because there is nowhere durable to put a file yet —
                the same recoverability gate that keeps exports out of Storage
                until issue #39. Escaping and formula-injection safety live in
                `_lib/csv.ts` and are unit tested. */}
            <Label htmlFor="reports-export-csv">
              {message("reportsExportCsv")}
              <span className="font-normal text-muted-foreground">
                · {countLabel(locale, "rows", exported.rowCount)}
              </span>
            </Label>
            <Textarea
              dir="ltr"
              id="reports-export-csv"
              readOnly
              rows={8}
              className="font-latin text-xs"
              value={renderCsv(columnsOf(exported.rows), exported.rows)}
            />
          </Field>
        )}
      </Section>
    </WorkspaceShell>
  );
}
