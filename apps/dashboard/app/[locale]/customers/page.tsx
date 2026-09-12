import { formatDateTime, type Locale } from "@wlbp/i18n";
import { Badge, Button, StatusMessage, Surface } from "@wlbp/ui-foundation";
import Link from "next/link";

import { getDashboardMessage } from "../../_lib/copy";
import type { CustomerRowV1 } from "../../_lib/dashboard-access";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { WorkspaceShell } from "../../_lib/workspace-shell";
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
      <Surface as="section" className="requests-queue" labelledBy="customers-title">
        <h1 id="customers-title">{message("customersTitle")}</h1>
        <p>{message("customersSummary")}</p>
        {resultKey === null ? null : (
          <StatusMessage
            tone={positiveCustomerResults.has(result ?? "") ? "positive" : "warning"}
          >
            {message(resultKey)}
          </StatusMessage>
        )}

        <form action={`/${locale}/customers`} className="calendar-filters" method="get">
          <label htmlFor="customers-query">{message("customersSearchLabel")}</label>
          <input
            defaultValue={filters.query ?? ""}
            id="customers-query"
            name="q"
            type="search"
          />
          <label htmlFor="customers-erased">{message("customersIncludeErased")}</label>
          <input
            defaultChecked={filters.includeErased}
            id="customers-erased"
            name="erased"
            type="checkbox"
            value="1"
          />
          <Button type="submit">{message("customersSearchAction")}</Button>
        </form>

        {customers === null ? (
          <p>{message("customersUnavailable")}</p>
        ) : customers.length === 0 ? (
          <p>{message("customersEmpty")}</p>
        ) : (
          <ul aria-label={message("customersListLabel")} className="requests-list">
            {customers.map((customer) => (
              <li key={customer.customerId}>
                <article aria-labelledby={`customer-${customer.customerId}`}>
                  <h2 id={`customer-${customer.customerId}`}>
                    {customer.fullName ?? message("customersErasedName")}
                  </h2>
                  <dl>
                    <div>
                      <dt>{message("customersEmailLabel")}</dt>
                      <dd>
                        <bdi>{customer.email ?? message("customersErasedValue")}</bdi>
                      </dd>
                    </div>
                    <div>
                      <dt>{message("customersPhoneLabel")}</dt>
                      <dd>
                        <bdi>{customer.phone ?? message("customersNoPhone")}</bdi>
                      </dd>
                    </div>
                    <div>
                      <dt>{message("customersBookingCountLabel")}</dt>
                      <dd>{customer.bookingCount}</dd>
                    </div>
                    <div>
                      <dt>{message("customersLastBookingLabel")}</dt>
                      <dd>
                        {customer.lastBookingAt === null
                          ? message("customersNeverBooked")
                          : formatDateTime(customer.lastBookingAt, locale, "UTC")}
                      </dd>
                    </div>
                  </dl>
                  {/* Every state that changes how this record may be used is
                      stated on the row, because an operator who cannot see a
                      hold will ask why a deletion refused. */}
                  <p>
                    {customer.erased ? (
                      <Badge>{message("customersBadgeErased")}</Badge>
                    ) : null}
                    {customer.legalHold ? (
                      <Badge>{message("customersBadgeHold")}</Badge>
                    ) : null}
                    {customer.restricted ? (
                      <Badge>{message("customersBadgeRestricted")}</Badge>
                    ) : null}
                    {customer.suppressed ? (
                      <Badge>{message("customersBadgeSuppressed")}</Badge>
                    ) : null}
                  </p>
                  <Link href={`/${locale}/customers/${customer.customerId}`}>
                    {message("customersOpenDetail")}
                  </Link>
                </article>
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </WorkspaceShell>
  );
}
