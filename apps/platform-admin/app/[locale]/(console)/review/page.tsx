import { copyFor, formCopy, say, statusCopy } from "../../../_lib/copy";
import { reviewCopy as c } from "../../../_lib/lifecycle-copy";
import { listHref, parseListParams } from "../../../_lib/list-params";
import { callOperator } from "../../../_lib/operator-api";
import { getOperator } from "../../../_lib/operator-page";
import { pageLocale } from "../../../_lib/page-locale";
import { DataPage } from "../../../_lib/shell/data-page";
import { DataTable } from "../../../_lib/ui/data-table";
import { FilterBar, SelectFilter } from "../../../_lib/ui/filter-bar";
import { Pagination } from "../../../_lib/ui/pagination";
import { EmptyState, UnavailableState, Unknown } from "../../../_lib/ui/states";
import { StatusBadge } from "../../../_lib/ui/status-badge";
import { TextLink } from "../../../_lib/ui/text";
import { TimeValue } from "../../../_lib/ui/time";
export const dynamic = "force-dynamic";
const spec = {
  filters: { status: ["pending", "approved", "rejected"], kind: ["job", "support"] },
  pageSize: 25,
} as const;
export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await pageLocale(params);
  if (!(await getOperator(locale))) return null;
  const raw = await searchParams;
  const list = parseListParams({ ...raw, status: raw.status ?? "pending" }, spec);
  const path = `/${locale}/review`;
  const result = await callOperator("list_operator_reviews_v1", {
    p_status: list.filters.status ?? null,
    p_kind: list.filters.kind ?? null,
    p_limit: list.pageSize,
    p_offset: list.offset,
  });
  return (
    <DataPage
      locale={locale}
      title={say(locale, c.title)}
      description={say(locale, c.description)}
      timesInUtc
      toolbar={
        <FilterBar locale={locale} path={path}>
          <SelectFilter
            name="status"
            label={say(locale, c.status)}
            value={list.filters.status}
            allLabel={say(locale, c.allHistory)}
            options={spec.filters.status.map(
              (s) => [s, copyFor(statusCopy, s, locale)] as const,
            )}
          />
          <SelectFilter
            name="kind"
            label={say(locale, c.kind)}
            value={list.filters.kind}
            allLabel={say(locale, c.allKinds)}
            options={spec.filters.kind.map((s) => [s, say(locale, c[s])] as const)}
          />
        </FilterBar>
      }
      pagination={
        result.ok ? (
          <Pagination
            locale={locale}
            page={list.page}
            pageSize={list.pageSize}
            total={result.data.total_count}
            href={(page) =>
              listHref(path, list, {
                page,
                filters: { status: list.filters.status ?? "all" },
              })
            }
          />
        ) : null
      }
    >
      {!result.ok ? (
        <UnavailableState locale={locale} code={result.code} />
      ) : result.data.items.length === 0 ? (
        <EmptyState
          locale={locale}
          title={say(
            locale,
            list.filters.status === "pending" ? c.pendingEmpty : c.historyEmpty,
          )}
        />
      ) : (
        <DataTable
          id="review-table"
          locale={locale}
          caption={say(locale, c.title)}
          columns={[
            { label: say(locale, c.tenant) },
            { label: say(locale, c.action) },
            { label: say(locale, c.requester) },
            { label: say(locale, c.reason) },
            { label: say(locale, c.status) },
            { label: say(locale, c.requestedAt) },
            { label: say(locale, formCopy.actions), kind: "actions" },
          ]}
          rows={result.data.items.map((row) => ({
            key: `${row.kind}:${row.id}`,
            cells: [
              row.tenant_id ? (
                <TextLink key="t" href={`/${locale}/tenants/${row.tenant_id}`}>
                  <bdi>{row.tenant_name ?? row.tenant_id}</bdi>
                </TextLink>
              ) : (
                <Unknown key="t" locale={locale} kind="none" />
              ),
              copyFor(c, row.action, locale),
              row.requested_by ? (
                <bdi key="r">{row.requested_by}</bdi>
              ) : (
                <Unknown key="r" locale={locale} kind="notReported" />
              ),
              row.reason ?? <Unknown key="reason" locale={locale} kind="notReported" />,
              <StatusBadge key="s" locale={locale} status={row.status} />,
              <TimeValue key="at" locale={locale} value={row.requested_at} />,
              <TextLink key="i" href={`${path}/${row.kind}/${row.id}`}>
                {say(locale, c.inspect)}
              </TextLink>,
            ],
          }))}
        />
      )}
    </DataPage>
  );
}
