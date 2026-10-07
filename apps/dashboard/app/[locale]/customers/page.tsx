import type { Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Label,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Toolbar,
} from "@wlbp/ui-foundation";
import { Search, UserX } from "lucide-react";
import Link from "next/link";

import { getDashboardMessage } from "../../_lib/copy";
import type { CustomerRowV1 } from "../../_lib/dashboard-access";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { formatCount, formatWhen } from "../../_lib/booking-display";
import { RecordCard, RecordCards, TableFrame } from "../../_lib/ui/record-cards";
import { ZoneNote } from "../../_lib/ui/zone-note";
import { workspaceMessage } from "../../_lib/workspace-copy";
import { ResultAlert } from "../../_lib/ui/result-alert";
import { customerResultKeys, positiveCustomerResults } from "./results";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type CustomersPageProps = {
  readonly params: Promise<{ locale: Locale }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function single(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" && candidate.trim() !== ""
    ? candidate.trim()
    : null;
}

async function loadCustomers(
  locale: Locale,
  filters: { includeErased: boolean; query: string | null },
): Promise<readonly CustomerRowV1[] | null> {
  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.searchCustomers === undefined
  ) {
    return null;
  }
  // A failed read shows the unavailable copy rather than an empty directory,
  // so nobody reads "no customers" as "this tenant has none".
  return request.source
    .searchCustomers({
      includeErased: filters.includeErased,
      query: filters.query,
      tenantId: request.state.context.tenantId,
    })
    .catch(() => null);
}

export default async function CustomersPage({
  params,
  searchParams,
}: CustomersPageProps) {
  const { locale } = await params;
  const query = await searchParams;
  const message = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);

  const filters = {
    includeErased: single(query.erased) === "1",
    query: single(query.q),
  };
  const customers = await loadCustomers(locale, filters);
  const result = typeof query.result === "string" ? query.result : null;
  const resultKey =
    result !== null && result in customerResultKeys
      ? customerResultKeys[result as keyof typeof customerResultKeys]
      : null;

  return (
    <WorkspaceShell current="customers" labelledBy="customers-title" locale={locale}>
      <PageHeader
        titleId="customers-title"
        title={message("customersTitle")}
        description={message("customersSummary")}
        meta={<ZoneNote locale={locale} timeZone="UTC" />}
      />
      {resultKey === null ? null : (
        <ResultAlert positive={positiveCustomerResults.has(result ?? "")}>
          {message(resultKey)}
        </ResultAlert>
      )}

      <form action={`/${locale}/customers`} method="get" role="search">
        <Toolbar>
          <Field className="md:min-w-80">
            <Label htmlFor="customers-query">{message("customersSearchLabel")}</Label>
            <Input
              defaultValue={filters.query ?? ""}
              id="customers-query"
              name="q"
              type="search"
            />
          </Field>
          <Field orientation="horizontal" className="min-h-11 self-end">
            <Checkbox
              defaultChecked={filters.includeErased}
              id="customers-erased"
              name="erased"
              value="1"
            />
            <Label htmlFor="customers-erased">
              {message("customersIncludeErased")}
            </Label>
          </Field>
          <Button type="submit" variant="secondary">
            <Search aria-hidden="true" />
            {message("customersSearchAction")}
          </Button>
        </Toolbar>
      </form>

      {customers === null ? (
        <Alert tone="danger">
          <AlertDescription className="text-foreground">
            {message("customersUnavailable")}
          </AlertDescription>
        </Alert>
      ) : customers.length === 0 ? (
        <EmptyState
          icon={<UserX aria-hidden="true" />}
          title={message("customersEmpty")}
        />
      ) : (
        <>
          <TableFrame>
            <Table label={message("customersListLabel")}>
              <TableHeader>
                <TableRow>
                  <TableHead>{message("customersNameLabel")}</TableHead>
                  <TableHead>{message("customersEmailLabel")}</TableHead>
                  <TableHead>{message("customersPhoneLabel")}</TableHead>
                  <TableHead className="text-end">
                    {message("customersBookingCountLabel")}
                  </TableHead>
                  <TableHead>{message("customersLastBookingLabel")}</TableHead>
                  <TableHead>
                    <span className="sr-only">
                      {workspaceMessage(locale, "actions")}
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.customerId}>
                    <TableCell>
                      <div className="grid gap-1.5">
                        <span
                          id={`customer-${customer.customerId}`}
                          className="font-semibold text-foreground"
                        >
                          {customer.fullName ?? message("customersErasedName")}
                        </span>
                        {/* Every state that changes how this record may be used is
                        stated on the row, because an operator who cannot see a
                        hold will ask why a deletion refused. */}
                        {customer.erased ||
                        customer.legalHold ||
                        customer.restricted ||
                        customer.suppressed ? (
                          <div className="flex flex-wrap gap-1.5">
                            {customer.erased ? (
                              <Badge tone="neutral">
                                {message("customersBadgeErased")}
                              </Badge>
                            ) : null}
                            {customer.legalHold ? (
                              <Badge tone="warning">
                                {message("customersBadgeHold")}
                              </Badge>
                            ) : null}
                            {customer.restricted ? (
                              <Badge tone="danger">
                                {message("customersBadgeRestricted")}
                              </Badge>
                            ) : null}
                            {customer.suppressed ? (
                              <Badge tone="neutral">
                                {message("customersBadgeSuppressed")}
                              </Badge>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <bdi>{customer.email ?? message("customersErasedValue")}</bdi>
                    </TableCell>
                    <TableCell>
                      <bdi>{customer.phone ?? message("customersNoPhone")}</bdi>
                    </TableCell>
                    <TableCell className="text-end">
                      {formatCount(customer.bookingCount, locale)}
                    </TableCell>
                    <TableCell className="min-w-44">
                      {customer.lastBookingAt === null
                        ? message("customersNeverBooked")
                        : formatWhen(customer.lastBookingAt, locale, "UTC")}
                    </TableCell>
                    <TableCell className="text-end">
                      <Button asChild variant="ghost">
                        <Link
                          href={`/${locale}/customers/${customer.customerId}`}
                          aria-describedby={`customer-${customer.customerId}`}
                        >
                          {message("customersOpenDetail")}
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
          <RecordCards label={message("customersListLabel")}>
            {customers.map((customer) => (
              <RecordCard
                key={customer.customerId}
                title={
                  <>
                    <span
                      id={`customer-card-${customer.customerId}`}
                      className="font-semibold text-foreground"
                    >
                      {customer.fullName ?? message("customersErasedName")}
                    </span>
                    {customer.erased ||
                    customer.legalHold ||
                    customer.restricted ||
                    customer.suppressed ? (
                      <span className="flex flex-wrap gap-1.5">
                        {customer.erased ? (
                          <Badge tone="neutral">
                            {message("customersBadgeErased")}
                          </Badge>
                        ) : null}
                        {customer.legalHold ? (
                          <Badge tone="warning">{message("customersBadgeHold")}</Badge>
                        ) : null}
                        {customer.restricted ? (
                          <Badge tone="danger">
                            {message("customersBadgeRestricted")}
                          </Badge>
                        ) : null}
                        {customer.suppressed ? (
                          <Badge tone="neutral">
                            {message("customersBadgeSuppressed")}
                          </Badge>
                        ) : null}
                      </span>
                    ) : null}
                  </>
                }
                facts={[
                  {
                    key: "email",
                    label: message("customersEmailLabel"),
                    value: (
                      <bdi className="break-all">
                        {customer.email ?? message("customersErasedValue")}
                      </bdi>
                    ),
                  },
                  {
                    key: "phone",
                    label: message("customersPhoneLabel"),
                    value: <bdi>{customer.phone ?? message("customersNoPhone")}</bdi>,
                  },
                  {
                    key: "count",
                    label: message("customersBookingCountLabel"),
                    value: formatCount(customer.bookingCount, locale),
                  },
                  {
                    key: "last",
                    label: message("customersLastBookingLabel"),
                    value:
                      customer.lastBookingAt === null
                        ? message("customersNeverBooked")
                        : formatWhen(customer.lastBookingAt, locale, "UTC"),
                  },
                ]}
                actions={
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={`/${locale}/customers/${customer.customerId}`}
                      aria-describedby={`customer-card-${customer.customerId}`}
                    >
                      {message("customersOpenDetail")}
                    </Link>
                  </Button>
                }
              />
            ))}
          </RecordCards>
        </>
      )}
    </WorkspaceShell>
  );
}
