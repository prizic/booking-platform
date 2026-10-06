import { formatNumber } from "@wlbp/i18n";
import { Badge } from "@wlbp/ui-foundation";
import Link from "next/link";
import { copyFor, formCopy, say, stateCopy, statusCopy } from "../../../_lib/copy";
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

const c = operationsCopy.instances;
const spec = {
  filters: {
    state: ["provisioning", "active", "suspended", "closed"],
    ring: ["canary", "early", "general"],
    drift: ["yes", "no"],
  },
  pageSize: 25,
} as const;

export default async function InstancesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await pageLocale(params);
  if (!(await getOperator(locale))) return null;
  const list = parseListParams(await searchParams, spec);
  const path = `/${locale}/instances`;
  const result = await callOperator("list_instances_v1", {
    p_search: list.q || undefined,
    p_state: list.filters.state,
    p_ring: list.filters.ring,
    p_drift:
      list.filters.drift === undefined ? undefined : list.filters.drift === "yes",
    p_limit: list.pageSize,
    p_offset: list.offset,
  });
  const status = (s: string) => copyFor(statusCopy, s, locale);

  return (
    <>
      <PageHeader
        locale={locale}
        title={say(locale, c.title)}
        description={say(locale, c.description)}
      />
      <FilterBar
        locale={locale}
        path={path}
        search={{ label: say(locale, c.search), value: list.q }}
      >
        <SelectFilter
          name="state"
          label={say(locale, c.state)}
          value={list.filters.state}
          allLabel={say(locale, formCopy.all)}
          options={spec.filters.state.map((s) => [s, status(s)] as const)}
        />
        <SelectFilter
          name="ring"
          label={say(locale, c.ring)}
          value={list.filters.ring}
          allLabel={say(locale, formCopy.all)}
          options={spec.filters.ring.map((s) => [s, status(s)] as const)}
        />
        <SelectFilter
          name="drift"
          label={say(locale, c.drift)}
          value={list.filters.drift}
          allLabel={say(locale, formCopy.all)}
          options={[
            ["yes", say(locale, c.driftOnly)],
            ["no", say(locale, c.noDrift)],
          ]}
        />
      </FilterBar>
      {!result.ok ? (
        <UnavailableState locale={locale} code={result.code} />
      ) : result.data.length === 0 ? (
        <EmptyState
          locale={locale}
          filtered={Boolean(list.q || Object.keys(list.filters).length)}
        />
      ) : (
        <>
          <DataTable
            id="instances-table"
            locale={locale}
            caption={say(locale, c.title)}
            columns={[
              { label: say(locale, c.tenant) },
              { label: say(locale, c.instance) },
              { label: say(locale, c.state) },
              { label: say(locale, c.ring) },
              { label: say(locale, c.release) },
              { label: say(locale, c.infrastructure), numeric: true },
              { label: say(locale, c.health) },
            ]}
            rows={result.data.map((row) => ({
              key: row.instance_id,
              cells: [
                <Link key="t" href={`/${locale}/tenants/${row.tenant_id}`}>
                  <bdi>{row.tenant_name}</bdi>
                </Link>,
                <Link key="i" href={`${path}/${row.instance_id}`}>
                  <bdi>{row.instance_id.slice(0, 8)}</bdi>
                </Link>,
                <StatusBadge key="s" locale={locale} status={row.deployment_state} />,
                row.rollout_ring ? (
                  status(row.rollout_ring)
                ) : (
                  <Unknown locale={locale} kind="none" />
                ),
                <>
                  <bdi>
                    {row.desired_release ?? "—"} →{" "}
                    {row.current_release ?? say(locale, stateCopy.notReported)}
                  </bdi>
                  {row.release_drifted ? (
                    <>
                      {" "}
                      <Badge tone="warning">{say(locale, c.drifted)}</Badge>
                    </>
                  ) : null}
                </>,
                `${formatNumber(row.infrastructure_failing, locale)} / ${formatNumber(row.infrastructure_drifted, locale)} / ${formatNumber(row.infrastructure_total, locale)}`,
                row.health_status ? (
                  <>
                    <StatusBadge locale={locale} status={row.health_status} />{" "}
                    <TimeValue
                      locale={locale}
                      value={row.health_observed_at}
                      staleAfterMinutes={30}
                    />
                  </>
                ) : (
                  <Unknown locale={locale} />
                ),
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
