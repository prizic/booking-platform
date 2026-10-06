import { formatNumber } from "@wlbp/i18n";
import Link from "next/link";
import { copyFor, formCopy, say, statusCopy } from "../../../_lib/copy";
import { listHref, parseListParams } from "../../../_lib/list-params";
import { callOperator } from "../../../_lib/operator-api";
import { getOperator } from "../../../_lib/operator-page";
import { operationsCopy } from "../../../_lib/operations-copy";
import { pageLocale } from "../../../_lib/page-locale";
import { PageHeader } from "../../../_lib/shell/page-header";
import { DataTable } from "../../../_lib/ui/data-table";
import { FilterBar, SelectFilter } from "../../../_lib/ui/filter-bar";
import { Pagination } from "../../../_lib/ui/pagination";
import { EmptyState, Unknown, UnavailableState } from "../../../_lib/ui/states";
import { StatusBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const c = operationsCopy.jobs;
const kinds = Object.keys(
  operationsCopy.kinds,
) as (keyof typeof operationsCopy.kinds)[];
const spec = {
  filters: {
    status: [
      "queued",
      "running",
      "failed",
      "succeeded",
      "cancelled",
      "awaiting_approval",
    ],
    kind: kinds,
    tenant: "uuid",
  },
  pageSize: 25,
} as const;

export default async function JobsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await pageLocale(params);
  if (!(await getOperator(locale))) return null;
  const list = parseListParams(await searchParams, spec);
  const path = `/${locale}/jobs`;
  const result = await callOperator("list_jobs_v1", {
    p_status: list.filters.status,
    p_kind: list.filters.kind,
    p_tenant_id: list.filters.tenant,
    p_limit: list.pageSize,
    p_offset: list.offset,
  });
  const kindLabel = (k: string) =>
    say(locale, operationsCopy.kinds[k as keyof typeof operationsCopy.kinds] ?? [k, k]);

  return (
    <>
      <PageHeader
        locale={locale}
        title={say(locale, c.title)}
        description={say(locale, c.description)}
      />
      <FilterBar locale={locale} path={path}>
        <SelectFilter
          name="status"
          label={say(locale, c.status)}
          value={list.filters.status}
          allLabel={say(locale, formCopy.all)}
          options={spec.filters.status.map(
            (s) => [s, copyFor(statusCopy, s, locale)] as const,
          )}
        />
        <SelectFilter
          name="kind"
          label={say(locale, c.kind)}
          value={list.filters.kind}
          allLabel={say(locale, formCopy.all)}
          options={kinds.map((k) => [k, kindLabel(k)] as const)}
        />
        {list.filters.tenant ? (
          <input type="hidden" name="tenant" value={list.filters.tenant} />
        ) : null}
      </FilterBar>
      {!result.ok ? (
        <UnavailableState locale={locale} code={result.code} />
      ) : result.data.length === 0 ? (
        <EmptyState locale={locale} filtered={Object.keys(list.filters).length > 0} />
      ) : (
        <>
          <DataTable
            id="jobs-table"
            locale={locale}
            caption={say(locale, c.title)}
            columns={[
              { label: say(locale, c.kind) },
              { label: say(locale, c.status) },
              { label: say(locale, c.tenant) },
              { label: say(locale, c.attempts), numeric: true },
              { label: say(locale, c.requestedBy) },
              { label: say(locale, c.created) },
            ]}
            rows={result.data.map((row) => ({
              key: row.job_id,
              cells: [
                <Link key="k" href={`${path}/${row.job_id}`}>
                  {kindLabel(row.kind)}
                </Link>,
                <>
                  <StatusBadge
                    locale={locale}
                    status={row.needs_approval ? "awaiting_approval" : row.status}
                  />
                  {row.last_error_code ? (
                    <span className="secondary">
                      <bdi>{row.last_error_code}</bdi>
                    </span>
                  ) : null}
                </>,
                row.tenant_id ? (
                  <Link key="t" href={`/${locale}/tenants/${row.tenant_id}`}>
                    <bdi>{row.tenant_name}</bdi>
                  </Link>
                ) : (
                  <Unknown key="t" locale={locale} kind="none" />
                ),
                formatNumber(row.attempts, locale),
                <bdi key="r">{row.requested_by_email ?? "—"}</bdi>,
                <TimeValue key="c" locale={locale} value={row.created_at} />,
              ],
            }))}
          />
          <Pagination
            locale={locale}
            page={list.page}
            pageSize={list.pageSize}
            total={Number(result.data[0]?.total_count ?? 0)}
            href={(page) => listHref(path, list, { page })}
          />
        </>
      )}
    </>
  );
}
