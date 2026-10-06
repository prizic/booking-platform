import Link from "next/link";
import { exportAuditAction } from "../../../_lib/actions/audit";
import { auditCopy as c } from "../../../_lib/admin-copy";
import {
  auditActionCopy,
  auditFamilies,
  outcomeCopy,
  type AuditRow,
} from "../../../_lib/audit-copy";
import { auditRange } from "../../../_lib/audit-csv";
import { copyFor, formCopy, say } from "../../../_lib/copy";
import { listHref, parseListParams } from "../../../_lib/list-params";
import { callOperator } from "../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../_lib/operator-page";
import { pageLocale } from "../../../_lib/page-locale";
import { PageHeader } from "../../../_lib/shell/page-header";
import { ActionDialog } from "../../../_lib/ui/action-dialog";
import { DetailSummary } from "../../../_lib/ui/audit-list";
import { DataTable } from "../../../_lib/ui/data-table";
import { FilterBar, SelectFilter } from "../../../_lib/ui/filter-bar";
import { Pagination } from "../../../_lib/ui/pagination";
import { EmptyState, Unknown, UnavailableState } from "../../../_lib/ui/states";
import { StatusBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const families = Object.keys(auditFamilies) as (keyof typeof auditFamilies)[];
const outcomes = ["succeeded", "failed", "denied"] as const;
const spec = {
  filters: {
    family: families,
    outcome: outcomes,
    tenant: "uuid",
    from: "date",
    to: "date",
  },
  pageSize: 50,
} as const;

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await pageLocale(params);
  const operator = await getOperator(locale);
  if (!operator) return null;
  const list = parseListParams(await searchParams, spec);
  const path = `/${locale}/audit`;
  const range = auditRange(list.filters.from, list.filters.to);
  const result = await callOperator("list_audit_events_v1", {
    p_search: list.q || undefined,
    p_action: list.filters.family,
    p_tenant_id: list.filters.tenant,
    p_outcome: list.filters.outcome,
    p_from: range.from,
    p_to: range.to,
    p_limit: list.pageSize,
    p_offset: list.offset,
  });
  const exportFields = { q: list.q, ...list.filters };

  return (
    <>
      <PageHeader
        locale={locale}
        title={say(locale, c.title)}
        description={say(locale, c.description)}
        actions={
          atLeast(operator.role, "admin") ? (
            <ActionDialog
              locale={locale}
              action={exportAuditAction}
              trigger={say(locale, c.export)}
              title={say(locale, c.exportTitle)}
              description={say(locale, c.exportBody)}
              submit={say(locale, c.export)}
              successMessage={say(locale, c.exported)}
              hidden={Object.fromEntries(
                Object.entries(exportFields).filter(([, v]) => v),
              )}
            />
          ) : null
        }
      />
      {list.filters.tenant ? (
        <p className="notice">
          {say(locale, c.filteredTenant)}{" "}
          <Link href={listHref(path, list, { filters: { tenant: "" } })}>
            {say(locale, formCopy.clear)}
          </Link>
        </p>
      ) : null}
      <FilterBar
        locale={locale}
        path={path}
        search={{ label: say(locale, c.search), value: list.q }}
      >
        <SelectFilter
          name="family"
          label={say(locale, c.family)}
          value={list.filters.family}
          allLabel={say(locale, formCopy.all)}
          options={families.map((f) => [f, say(locale, auditFamilies[f])] as const)}
        />
        <SelectFilter
          name="outcome"
          label={say(locale, c.outcome)}
          value={list.filters.outcome}
          allLabel={say(locale, formCopy.all)}
          options={outcomes.map((o) => [o, say(locale, outcomeCopy[o])] as const)}
        />
        <label>
          {say(locale, c.from)}
          <input type="date" name="from" defaultValue={list.filters.from} />
        </label>
        <label>
          {say(locale, c.to)}
          <input type="date" name="to" defaultValue={list.filters.to} />
        </label>
        {list.filters.tenant ? (
          <input type="hidden" name="tenant" value={list.filters.tenant} />
        ) : null}
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
            id="audit-table"
            locale={locale}
            caption={say(locale, c.title)}
            columns={[
              { label: say(locale, c.time) },
              { label: say(locale, c.actor) },
              { label: say(locale, c.action) },
              { label: say(locale, c.outcome) },
              { label: say(locale, c.target) },
              { label: say(locale, c.tenant) },
              { label: say(locale, c.reason) },
              { label: say(locale, c.detail) },
            ]}
            rows={(result.data as unknown as AuditRow[]).map((row) => ({
              key: row.event_id,
              cells: [
                <TimeValue key="t" locale={locale} value={row.created_at} />,
                <bdi key="a">{row.operator_email ?? row.operator_id}</bdi>,
                <>
                  {copyFor(auditActionCopy, row.action, locale)}
                  <span className="secondary">
                    <bdi>{row.action}</bdi>
                  </span>
                </>,
                <StatusBadge key="o" locale={locale} status={row.outcome} />,
                row.target_kind ? (
                  <bdi key="g">
                    {row.target_kind}
                    {row.target_id ? ` · ${row.target_id}` : ""}
                  </bdi>
                ) : (
                  <Unknown key="g" locale={locale} kind="none" />
                ),
                row.tenant_id ? (
                  <Link key="n" href={`/${locale}/tenants/${row.tenant_id}`}>
                    <bdi>{row.tenant_name ?? row.tenant_id}</bdi>
                  </Link>
                ) : (
                  <Unknown key="n" locale={locale} kind="none" />
                ),
                row.reason ?? <Unknown key="r" locale={locale} kind="none" />,
                <DetailSummary key="d" detail={row.detail} />,
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
