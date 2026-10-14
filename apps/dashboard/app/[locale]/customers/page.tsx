import { ReadRetry } from "../../_lib/ui/read-retry";
import { WorkspacePagination } from "../../_lib/ui/workspace-pagination";
import type { Locale } from "@wlbp/i18n";
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Label,
  DataPage,
  FilterBar,
  DataTable,
  ErrorState,
} from "@wlbp/ui-foundation";
import { Search, UserX } from "lucide-react";
import Link from "next/link";

import { getDashboardMessage } from "../../_lib/copy";
import type { CustomerRowV1 } from "../../_lib/dashboard-access";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { formatCount, formatWhen } from "../../_lib/booking-display";

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

const CUSTOMERS_PAGE_SIZE = 25;
const CUSTOMERS_LOOKAHEAD_SIZE = CUSTOMERS_PAGE_SIZE + 1;

function requestedPage(raw: string | string[] | undefined): number {
  const value = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  return typeof value === "string" && /^\d{1,6}$/u.test(value)
    ? Math.max(1, Number(value))
    : 1;
}

async function loadCustomers(
  locale: Locale,
  filters: { includeErased: boolean; query: string | null },
  page: number,
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
      limit: CUSTOMERS_LOOKAHEAD_SIZE,
      offset: (page - 1) * CUSTOMERS_PAGE_SIZE,
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
  const requested = requestedPage(query.page);
  let effectivePage = requested;
  let allCustomers = await loadCustomers(locale, filters, effectivePage);
  if (allCustomers !== null && allCustomers.length === 0 && effectivePage > 1) {
    effectivePage = 1;
    allCustomers = await loadCustomers(locale, filters, effectivePage);
  }
  // The read carries one extra row as a lookahead so the UI can decide whether
  // a next page exists without loading the whole directory.
  const page = effectivePage;
  const hasMore = (allCustomers?.length ?? 0) > CUSTOMERS_PAGE_SIZE;
  const visibleCustomers =
    allCustomers === null
      ? null
      : hasMore
        ? allCustomers.slice(0, CUSTOMERS_PAGE_SIZE)
        : [...allCustomers];
  const paging = {
    page,
    // Lookahead boundary probe for the next link only: the label shows no
    // invented total because the read never carried one.
    pageCount: hasMore ? page + 1 : page,
    count: visibleCustomers?.length ?? 0,
    rows: visibleCustomers ?? [],
  };
  const customers = visibleCustomers;
  const result = typeof query.result === "string" ? query.result : null;
  const resultKey =
    result !== null && result in customerResultKeys
      ? customerResultKeys[result as keyof typeof customerResultKeys]
      : null;

  return (
    <WorkspaceShell current="customers" labelledBy="customers-title" locale={locale}>
      <DataPage
        pagination={
          allCustomers !== null ? (
            <WorkspacePagination
              locale={locale}
              path={`/${locale}/customers`}
              query={query}
              unknownTotal
              {...paging}
            />
          ) : null
        }
        titleId="customers-title"
        title={message("customersTitle")}
        description={message("customersSummary")}
        meta={<ZoneNote locale={locale} timeZone="UTC" />}
        toolbar={
          <FilterBar
            label={locale === "ar" ? "التصفية" : "Filters"}
            action={`/${locale}/customers`}
            method="get"
            role="search"
          >
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
          </FilterBar>
        }
      >
        {resultKey === null ? null : (
          <ResultAlert positive={positiveCustomerResults.has(result ?? "")}>
            {message(resultKey)}
          </ResultAlert>
        )}

        {customers === null ? (
          <ErrorState
            title={<>{message("customersUnavailable")}</>}
            retry={<ReadRetry locale={locale} />}
          />
        ) : customers.length === 0 ? (
          <EmptyState
            icon={<UserX aria-hidden="true" />}
            title={message("customersEmpty")}
            action={
              <Button asChild variant="outline">
                <Link href={`/${locale}/customers`}>
                  {locale === "ar" ? "مسح التصفية" : "Clear filters"}
                </Link>
              </Button>
            }
          />
        ) : (
          <>
            <DataTable
              id="customers-records"
              caption={message("customersListLabel")}
              columns={[
                { key: "column-0", label: message("customersNameLabel") },
                { key: "column-1", label: message("customersEmailLabel") },
                { key: "column-2", label: message("customersPhoneLabel") },
                { key: "column-3", label: message("customersBookingCountLabel") },
                { key: "column-4", label: message("customersLastBookingLabel") },
                {
                  key: "column-5",
                  label: workspaceMessage(locale, "actions"),
                  kind: "actions",
                },
              ]}
              rows={customers.map((customer) => ({
                key: customer.customerId,
                cells: [
                  <>
                    <div className="grid gap-1.5">
                      <span className="font-semibold text-foreground">
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
                  </>,
                  <>
                    <bdi>{customer.email ?? message("customersErasedValue")}</bdi>
                  </>,
                  <>
                    <bdi>{customer.phone ?? message("customersNoPhone")}</bdi>
                  </>,
                  <>{formatCount(customer.bookingCount, locale)}</>,
                  <>
                    {customer.lastBookingAt === null
                      ? message("customersNeverBooked")
                      : formatWhen(customer.lastBookingAt, locale, "UTC")}
                  </>,
                  <>
                    <Button asChild variant="ghost">
                      <Link href={`/${locale}/customers/${customer.customerId}`}>
                        {message("customersOpenDetail")}
                      </Link>
                    </Button>
                  </>,
                ],
              }))}
            />
          </>
        )}
      </DataPage>
    </WorkspaceShell>
  );
}
