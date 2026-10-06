import { formatNumber } from "@wlbp/i18n";
import Link from "next/link";
import { copyFor, formCopy, say, statusCopy } from "../../../_lib/copy";
import { listHref, parseListParams } from "../../../_lib/list-params";
import { callOperator } from "../../../_lib/operator-api";
import { getOperator } from "../../../_lib/operator-page";
import { pageLocale } from "../../../_lib/page-locale";
import { releaseCopy } from "../../../_lib/release-copy";
import { PageHeader } from "../../../_lib/shell/page-header";
import { DataTable } from "../../../_lib/ui/data-table";
import { FilterBar, SelectFilter } from "../../../_lib/ui/filter-bar";
import { Pagination } from "../../../_lib/ui/pagination";
import { EmptyState, UnavailableState } from "../../../_lib/ui/states";
import { StatusBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const c = releaseCopy.rollouts;
const statuses = [
  "draft",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
  "rolled_back",
] as const;
const spec = { filters: { status: statuses, release: "uuid" }, pageSize: 25 } as const;

export default async function RolloutsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await pageLocale(params);
  if (!(await getOperator(locale))) return null;
  const list = parseListParams(await searchParams, spec);
  const path = `/${locale}/rollouts`;
  const result = await callOperator("list_rollouts_v1", {
    p_status: list.filters.status,
    p_release_id: list.filters.release,
    p_limit: list.pageSize,
    p_offset: list.offset,
  });
  const status = (s: string) => copyFor(statusCopy, s, locale);
  const n = (value: number) => formatNumber(value, locale);

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
          options={statuses.map((s) => [s, status(s)] as const)}
        />
        {list.filters.release ? (
          <input type="hidden" name="release" value={list.filters.release} />
        ) : null}
      </FilterBar>
      {!result.ok ? (
        <UnavailableState locale={locale} code={result.code} />
      ) : result.data.length === 0 ? (
        <EmptyState
          locale={locale}
          title={say(locale, c.empty)}
          filtered={Object.keys(list.filters).length > 0}
        />
      ) : (
        <>
          <DataTable
            id="rollouts-table"
            locale={locale}
            caption={say(locale, c.title)}
            columns={[
              { label: say(locale, c.version) },
              { label: say(locale, c.status) },
              { label: say(locale, c.rings) },
              { label: say(locale, c.progress), numeric: true },
              { label: say(locale, c.createdBy) },
              { label: say(locale, c.started) },
            ]}
            rows={result.data.map((row) => ({
              key: row.rollout_id,
              cells: [
                <Link key="v" href={`${path}/${row.rollout_id}`}>
                  <bdi>{row.version}</bdi>
                </Link>,
                <StatusBadge key="s" locale={locale} status={row.status} />,
                row.target_rings.map(status).join(", ") || "—",
                `${n(Number(row.targets_succeeded))} / ${n(Number(row.targets_failed))} / ${n(Number(row.targets_queued))} / ${n(Number(row.targets_total))}`,
                <bdi key="b">{row.created_by_email ?? "—"}</bdi>,
                <TimeValue key="t" locale={locale} value={row.started_at} />,
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
