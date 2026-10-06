import { Badge } from "@wlbp/ui-foundation";
import Link from "next/link";
import { copyFor, formCopy, say, statusCopy } from "../../../_lib/copy";
import { healthCopy as c } from "../../../_lib/health-support-copy";
import { listHref, parseListParams } from "../../../_lib/list-params";
import { callOperator } from "../../../_lib/operator-api";
import { getOperator } from "../../../_lib/operator-page";
import { pageLocale } from "../../../_lib/page-locale";
import { PageHeader } from "../../../_lib/shell/page-header";
import { DataTable } from "../../../_lib/ui/data-table";
import { FilterBar, SelectFilter } from "../../../_lib/ui/filter-bar";
import { Pagination } from "../../../_lib/ui/pagination";
import { EmptyState, Unknown, UnavailableState } from "../../../_lib/ui/states";
import { StatusBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";
import { overviewCopy } from "../copy";

export const dynamic = "force-dynamic";

const spec = {
  filters: {
    status: ["failing", "degraded", "unknown", "stale", "healthy"],
    kind: ["instance", "integration"],
  },
  pageSize: 50,
} as const;

export default async function HealthPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await pageLocale(params);
  if (!(await getOperator(locale))) return null;
  const list = parseListParams(await searchParams, spec);
  const path = `/${locale}/health`;
  const [alerts, health] = await Promise.all([
    callOperator("list_alerts_v1"),
    callOperator("list_health_v1", {
      p_status: list.filters.status,
      p_subject_kind: list.filters.kind,
      p_limit: list.pageSize,
      p_offset: list.offset,
    }),
  ]);
  const p = (path: string) => `/${locale}/${path}`;

  return (
    <>
      <PageHeader
        locale={locale}
        title={say(locale, c.title)}
        description={say(locale, c.description)}
        actions={
          <>
            <Link href={p("jobs?status=queued")}>{say(locale, c.queuedJobs)}</Link>
            <Link href={p("jobs?status=failed")}>{say(locale, c.failedJobs)}</Link>
            <Link href={p("provisioning?state=waiting")}>
              {say(locale, c.waitingRuns)}
            </Link>
          </>
        }
      />
      <p className="notice">{say(locale, c.scope)}</p>

      <section className="section" aria-labelledby="alerts-title">
        <div className="section-header">
          <h2 id="alerts-title">{say(locale, c.alerts)}</h2>
        </div>
        {!alerts.ok ? (
          <UnavailableState locale={locale} code={alerts.code} />
        ) : alerts.data.length === 0 ? (
          <EmptyState locale={locale} title={say(locale, c.noAlerts)} />
        ) : (
          <DataTable
            id="alerts-table"
            locale={locale}
            caption={say(locale, c.alerts)}
            columns={[
              { label: say(locale, c.status) },
              { label: say(locale, c.kind) },
              { label: say(locale, c.tenant) },
              { label: say(locale, c.signal) },
              { label: say(locale, c.observed) },
            ]}
            rows={alerts.data.map((a, index) => ({
              key: `${a.kind}:${a.subject_id}:${index}`,
              cells: [
                <Badge key="s" tone={a.severity === "critical" ? "danger" : "warning"}>
                  {say(
                    locale,
                    a.severity === "critical"
                      ? overviewCopy.severityCritical
                      : overviewCopy.severityWarning,
                  )}
                </Badge>,
                say(
                  locale,
                  overviewCopy.alertKinds[
                    a.kind as keyof typeof overviewCopy.alertKinds
                  ] ?? overviewCopy.alerts,
                ),
                a.tenant_id ? (
                  <Link key="t" href={p(`tenants/${a.tenant_id}`)}>
                    <bdi>{a.tenant_name}</bdi>
                  </Link>
                ) : (
                  <Unknown key="t" locale={locale} kind="none" />
                ),
                a.code ? (
                  <bdi key="c">{a.code}</bdi>
                ) : (
                  <Unknown key="c" locale={locale} kind="none" />
                ),
                <TimeValue
                  key="o"
                  locale={locale}
                  value={a.observed_at}
                  empty="notReported"
                />,
              ],
            }))}
          />
        )}
      </section>

      <section className="section" aria-labelledby="obs-title">
        <div className="section-header">
          <h2 id="obs-title">{say(locale, c.observations)}</h2>
        </div>
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
            options={spec.filters.kind.map(
              (k) => [k, say(locale, c.kinds[k])] as const,
            )}
          />
        </FilterBar>
        {!health.ok ? (
          <UnavailableState locale={locale} code={health.code} />
        ) : health.data.length === 0 ? (
          <EmptyState locale={locale} filtered={Object.keys(list.filters).length > 0} />
        ) : (
          <>
            <DataTable
              id="health-table"
              locale={locale}
              caption={say(locale, c.observations)}
              columns={[
                { label: say(locale, c.subject) },
                { label: say(locale, c.tenant) },
                { label: say(locale, c.signal) },
                { label: say(locale, c.status) },
                { label: say(locale, c.freshness) },
                { label: say(locale, c.observed) },
              ]}
              rows={health.data.map((h, index) => ({
                key: `${h.instance_id ?? h.subject_key}:${h.signal}:${index}`,
                cells: [
                  h.instance_id ? (
                    <Link key="i" href={p(`instances/${h.instance_id}`)}>
                      {say(locale, c.kinds.instance)}{" "}
                      <bdi>{h.instance_id.slice(0, 8)}</bdi>
                    </Link>
                  ) : (
                    <>
                      {say(locale, c.kinds.integration)} <bdi>{h.subject_key}</bdi>
                    </>
                  ),
                  h.tenant_name ? (
                    <bdi key="t">{h.tenant_name}</bdi>
                  ) : (
                    <Unknown key="t" locale={locale} kind="none" />
                  ),
                  <bdi key="s">
                    {h.subject_key} · {h.signal}
                  </bdi>,
                  <>
                    <StatusBadge locale={locale} status={h.status} />
                    {h.error_code ? (
                      <span className="secondary">
                        <bdi>{h.error_code}</bdi>
                      </span>
                    ) : null}
                  </>,
                  <StatusBadge key="f" locale={locale} status={h.freshness} />,
                  <TimeValue
                    key="o"
                    locale={locale}
                    value={h.observed_at}
                    empty="notObserved"
                    staleAfterMinutes={30}
                  />,
                ],
              }))}
            />
            <Pagination
              locale={locale}
              page={list.page}
              pageSize={list.pageSize}
              total={Number(health.data[0]?.total_count ?? 0)}
              href={(page) => listHref(path, list, { page })}
            />
          </>
        )}
      </section>
    </>
  );
}
