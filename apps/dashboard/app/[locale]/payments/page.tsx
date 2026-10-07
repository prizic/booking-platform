import { workspaceStatus } from "../../_lib/workspace-status";
import type { Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  EmptyState,
  Facts,
  Field,
  Label,
  PageHeader,
  ReferenceCode,
  Section,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusStamp,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Toolbar,
} from "@wlbp/ui-foundation";
import { CircleCheck, Mail, ReceiptText } from "lucide-react";
import Link from "next/link";

import { getDashboardMessage } from "../../_lib/copy";
import type { PaymentExceptionV1, RefundRowV1 } from "../../_lib/dashboard-access";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { formatWhen, stampStateFor } from "../../_lib/booking-display";
import { Money } from "../../_lib/ui/money";
import { RecordCard, RecordCards, TableFrame } from "../../_lib/ui/record-cards";
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
      <PageHeader
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
      />
      {resultKey === null ? null : (
        <ResultAlert positive={positivePaymentResults.has(result ?? "")}>
          {message(resultKey)}
        </ResultAlert>
      )}

      <form action={`/${locale}/payments`} method="get">
        <Toolbar>
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
        </Toolbar>
      </form>

      {loaded === null ? (
        <Alert tone="danger">
          <AlertDescription className="text-foreground">
            {message("paymentsUnavailable")}
          </AlertDescription>
        </Alert>
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
                            ...(item.amountMinorUnits === null || item.currency === null
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
                            ...(item.publicReference === null || item.bookingId === null
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
              <Alert tone="danger">
                <AlertDescription className="text-foreground">
                  {message("paymentsUnavailable")}
                </AlertDescription>
              </Alert>
            ) : loaded.refunds.length === 0 ? (
              <EmptyState
                icon={<ReceiptText aria-hidden="true" />}
                title={message("paymentsRefundsEmpty")}
              />
            ) : (
              <>
                <TableFrame>
                  <Table label={message("paymentsRefundsTitle")}>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{workspaceMessage(locale, "reference")}</TableHead>
                        <TableHead className="text-end">
                          {message("paymentsAmountLabel")}
                        </TableHead>
                        <TableHead>{message("bookingsStatusLabel")}</TableHead>
                        <TableHead>
                          {workspaceMessage(locale, "refundAttempts")}
                        </TableHead>
                        <TableHead>
                          {workspaceMessage(locale, "refundFailure")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loaded.refunds.map((refund) => (
                        <TableRow key={refund.refundId}>
                          <TableCell>
                            {refund.publicReference === null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <ReferenceCode>{refund.publicReference}</ReferenceCode>
                            )}
                          </TableCell>
                          <TableCell className="text-end whitespace-nowrap">
                            <Money
                              minor={refund.amountMinorUnits}
                              currency={refund.currency}
                              locale={locale}
                            />
                          </TableCell>
                          <TableCell>
                            <StatusStamp state={stampStateFor(refund.status)}>
                              {workspaceStatus(locale, refund.status)}
                            </StatusStamp>
                          </TableCell>
                          <TableCell>
                            {refund.attempts === 0
                              ? null
                              : countLabel(locale, "attempts", refund.attempts)}
                          </TableCell>
                          <TableCell>
                            {refund.failureCode === null ? null : (
                              <span dir="ltr" className="font-latin text-xs">
                                {refund.failureCode}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableFrame>
                <RecordCards label={message("paymentsRefundsTitle")}>
                  {loaded.refunds.map((refund) => (
                    <RecordCard
                      key={refund.refundId}
                      title={
                        refund.publicReference === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <ReferenceCode>{refund.publicReference}</ReferenceCode>
                        )
                      }
                      aside={
                        <StatusStamp state={stampStateFor(refund.status)}>
                          {workspaceStatus(locale, refund.status)}
                        </StatusStamp>
                      }
                      facts={[
                        {
                          key: "amount",
                          label: message("paymentsAmountLabel"),
                          value: (
                            <Money
                              minor={refund.amountMinorUnits}
                              currency={refund.currency}
                              locale={locale}
                            />
                          ),
                        },
                        {
                          key: "attempts",
                          label: workspaceMessage(locale, "refundAttempts"),
                          value:
                            refund.attempts === 0
                              ? "—"
                              : countLabel(locale, "attempts", refund.attempts),
                        },
                        ...(refund.failureCode === null
                          ? []
                          : [
                              {
                                key: "failure",
                                label: workspaceMessage(locale, "refundFailure"),
                                value: (
                                  <span
                                    dir="ltr"
                                    className="font-latin text-xs break-all"
                                  >
                                    {refund.failureCode}
                                  </span>
                                ),
                              },
                            ]),
                      ]}
                    />
                  ))}
                </RecordCards>
              </>
            )}
          </Section>
        </>
      )}
    </WorkspaceShell>
  );
}
