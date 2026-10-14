import { paginateRows } from "../../_lib/data-page-query";
import { WorkspacePagination } from "../../_lib/ui/workspace-pagination";
import { ReadRetry } from "../../_lib/ui/read-retry";
import { workspaceStatus } from "../../_lib/workspace-status";
import type { Locale } from "@wlbp/i18n";
import {
  Badge,
  Button,
  EmptyState,
  Facts,
  Field,
  Label,
  DataPage,
  FilterBar,
  DataTable,
  ReferenceCode,
  Section,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusStamp,
  ErrorState,
} from "@wlbp/ui-foundation";
import { CircleCheck, Mail, ReceiptText } from "lucide-react";
import Link from "next/link";

import { getDashboardMessage } from "../../_lib/copy";
import type { PaymentExceptionV1, RefundRowV1 } from "../../_lib/dashboard-access";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { formatWhen, stampStateFor } from "../../_lib/booking-display";
import { Money } from "../../_lib/ui/money";

import { ZoneNote } from "../../_lib/ui/zone-note";
import { countLabel, workspaceMessage } from "../../_lib/workspace-copy";
import { ResultAlert } from "../../_lib/ui/result-alert";
import { textLinkClass } from "../../_lib/ui/text-link";
import { PaymentExceptionForms } from "./payment-forms";
import { paymentResultKeys, positivePaymentResults } from "./results";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type PaymentsPageProps = {
  readonly params: Promise<{ locale: Locale }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function load(
  locale: Locale,
  status: string | null,
): Promise<{
  exceptions: readonly PaymentExceptionV1[];
  refunds: readonly RefundRowV1[] | null;
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
      .catch(() => null)) ?? null;
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

  const requested =
    typeof query.status === "string" &&
    ["open", "resolved", "all"].includes(query.status)
      ? query.status
      : "open";
  const status = requested === "all" ? null : requested;
  const allLoaded = await load(locale, status);
  const exceptionPaging = paginateRows(allLoaded?.exceptions ?? [], query);
  const refundPaging = paginateRows(allLoaded?.refunds ?? [], query, 25, "refundPage");
  const loaded = allLoaded
    ? {
        ...allLoaded,
        exceptions: exceptionPaging.rows,
        refunds: allLoaded.refunds === null ? null : refundPaging.rows,
      }
    : null;
  const result = typeof query.result === "string" ? query.result : null;
  const resultKey =
    result !== null && result in paymentResultKeys
      ? paymentResultKeys[result as keyof typeof paymentResultKeys]
      : null;

  return (
    <WorkspaceShell current="payments" labelledBy="payments-title" locale={locale}>
      <DataPage
        pagination={
          allLoaded ? (
            <WorkspacePagination
              locale={locale}
              path={`/${locale}/payments`}
              query={query}
              {...exceptionPaging}
            />
          ) : null
        }
        titleId="payments-title"
        title={message("paymentsTitle")}
        description={message("paymentsSummary")}
        meta={<ZoneNote locale={locale} timeZone="UTC" />}
        actions={
          <Button asChild variant="outline">
            <Link href={`/${locale}/communications`}>
              <Mail aria-hidden="true" />
              {message("navCommunications")}
            </Link>
          </Button>
        }
        toolbar={
          <FilterBar
            label={locale === "ar" ? "التصفية" : "Filters"}
            action={`/${locale}/payments`}
            method="get"
          >
            <Field>
              <Label htmlFor="payments-status">{message("paymentsStatusLabel")}</Label>
              <Select defaultValue={requested} name="status">
                <SelectTrigger id="payments-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">{message("paymentsStatusOpen")}</SelectItem>
                  <SelectItem value="resolved">
                    {message("paymentsStatusResolved")}
                  </SelectItem>
                  <SelectItem value="all">{message("paymentsStatusAll")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Button type="submit" variant="secondary">
              {message("paymentsFilterAction")}
            </Button>
          </FilterBar>
        }
      >
        {resultKey === null ? null : (
          <ResultAlert positive={positivePaymentResults.has(result ?? "")}>
            {message(resultKey)}
          </ResultAlert>
        )}

        {loaded === null ? (
          <ErrorState
            title={<>{message("paymentsUnavailable")}</>}
            retry={<ReadRetry locale={locale} />}
          />
        ) : (
          <>
            <Section
              id="payments-queue"
              title={message("paymentsQueueTitle")}
              actions={
                loaded.exceptions.length > 0 ? (
                  <Badge tone="warning">
                    {countLabel(locale, "items", loaded.exceptions.length)}
                  </Badge>
                ) : null
              }
            >
              {loaded.exceptions.length === 0 ? (
                <EmptyState
                  icon={<CircleCheck aria-hidden="true" />}
                  title={message("paymentsQueueEmpty")}
                />
              ) : (
                <ul aria-label={message("paymentsQueueTitle")} className="grid gap-4">
                  {loaded.exceptions.map((item) => (
                    <li key={item.exceptionId}>
                      <article
                        aria-labelledby={`exception-${item.exceptionId}`}
                        className="grid gap-5 rounded-lg border bg-card p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]"
                      >
                        <div className="grid content-start gap-4">
                          <h3
                            id={`exception-${item.exceptionId}`}
                            className="flex flex-wrap items-center gap-3"
                          >
                            {/* A stable kind code. It is deliberately not
                              translated: operators search and escalate on these
                              strings, and a localized one cannot be searched. */}
                            <span
                              dir="ltr"
                              className="font-latin text-base font-semibold"
                            >
                              {item.kind}
                            </span>
                            <Badge
                              tone={item.severity === "urgent" ? "danger" : "neutral"}
                            >
                              {workspaceStatus(locale, item.severity)}
                            </Badge>
                          </h3>
                          <Facts
                            items={[
                              {
                                key: "detail",
                                label: message("paymentsDetailLabel"),
                                // A stable code, never a provider body: this queue
                                // is read by operators and must never quote a
                                // customer back at them.
                                value: (
                                  <span dir="ltr" className="font-latin">
                                    {item.detailCode}
                                  </span>
                                ),
                              },
                              ...(item.amountMinorUnits === null ||
                              item.currency === null
                                ? []
                                : [
                                    {
                                      key: "amount",
                                      label: message("paymentsAmountLabel"),
                                      value: (
                                        <Money
                                          minor={item.amountMinorUnits}
                                          currency={item.currency}
                                          locale={locale}
                                        />
                                      ),
                                    },
                                  ]),
                              {
                                key: "raised",
                                label: message("paymentsRaisedLabel"),
                                value: formatWhen(item.createdAt, locale, "UTC"),
                              },
                              ...(item.publicReference === null ||
                              item.bookingId === null
                                ? []
                                : [
                                    {
                                      key: "booking",
                                      label: message("bookingsTitle"),
                                      value: (
                                        <Link
                                          className={textLinkClass}
                                          href={`/${locale}/bookings/${item.bookingId ?? ""}`}
                                        >
                                          <ReferenceCode className="text-primary">
                                            {item.publicReference}
                                          </ReferenceCode>
                                        </Link>
                                      ),
                                    },
                                  ]),
                            ]}
                          />
                        </div>

                        {item.status !== "open" ? (
                          <p className="self-start text-sm">
                            {message("paymentsResolvedAs")}{" "}
                            <StatusStamp state="completed">
                              {workspaceStatus(locale, item.resolution ?? "open")}
                            </StatusStamp>
                          </p>
                        ) : (
                          <div className="grid content-start gap-4 border-t pt-4 lg:border-t-0 lg:border-s lg:ps-5 lg:pt-0">
                            <PaymentExceptionForms
                              locale={locale}
                              exceptionId={item.exceptionId}
                              bookingId={item.bookingId}
                            />
                          </div>
                        )}
                      </article>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section id="payments-refunds" title={message("paymentsRefundsTitle")}>
              {loaded.refunds === null ? (
                <ErrorState
                  title={<>{message("paymentsUnavailable")}</>}
                  retry={<ReadRetry locale={locale} />}
                />
              ) : loaded.refunds.length === 0 ? (
                <EmptyState
                  icon={<ReceiptText aria-hidden="true" />}
                  title={message("paymentsRefundsEmpty")}
                />
              ) : (
                <>
                  <DataTable
                    id="payments-records"
                    caption={message("paymentsRefundsTitle")}
                    columns={[
                      { key: "column-0", label: workspaceMessage(locale, "reference") },
                      { key: "column-1", label: message("paymentsAmountLabel") },
                      { key: "column-2", label: message("bookingsStatusLabel") },
                      {
                        key: "column-3",
                        label: workspaceMessage(locale, "refundAttempts"),
                      },
                      {
                        key: "column-4",
                        label: workspaceMessage(locale, "refundFailure"),
                      },
                    ]}
                    rows={loaded.refunds.map((refund) => ({
                      key: refund.refundId,
                      cells: [
                        <>
                          {refund.publicReference === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <ReferenceCode>{refund.publicReference}</ReferenceCode>
                          )}
                        </>,
                        <>
                          <Money
                            minor={refund.amountMinorUnits}
                            currency={refund.currency}
                            locale={locale}
                          />
                        </>,
                        <>
                          <StatusStamp state={stampStateFor(refund.status)}>
                            {workspaceStatus(locale, refund.status)}
                          </StatusStamp>
                        </>,
                        <>
                          {refund.attempts === 0
                            ? null
                            : countLabel(locale, "attempts", refund.attempts)}
                        </>,
                        <>
                          {refund.failureCode === null ? null : (
                            <span dir="ltr" className="font-latin text-xs">
                              {refund.failureCode}
                            </span>
                          )}
                        </>,
                      ],
                    }))}
                  />
                </>
              )}
              {allLoaded?.refunds ? (
                <WorkspacePagination
                  locale={locale}
                  path={`/${locale}/payments`}
                  query={query}
                  pageKey="refundPage"
                  {...refundPaging}
                />
              ) : null}
            </Section>
          </>
        )}
      </DataPage>
    </WorkspaceShell>
  );
}
