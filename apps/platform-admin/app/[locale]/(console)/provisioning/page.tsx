import { formatNumber } from "@wlbp/i18n";
import { Button } from "@wlbp/ui-foundation";
import { Plus } from "lucide-react";
import Link from "next/link";
import { copyFor, formCopy, reasonCopy, say, statusCopy } from "../../../_lib/copy";
import { listHref, parseListParams } from "../../../_lib/list-params";
import { callOperator } from "../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../_lib/operator-page";
import { operationsCopy } from "../../../_lib/operations-copy";
import { pageLocale } from "../../../_lib/page-locale";
import { PageHeader } from "../../../_lib/shell/page-header";
import { DataTable } from "../../../_lib/ui/data-table";
import { FilterBar, SelectFilter } from "../../../_lib/ui/filter-bar";
import { Pagination } from "../../../_lib/ui/pagination";
import { EmptyState, UnavailableState } from "../../../_lib/ui/states";
import { StatusBadge } from "../../../_lib/ui/status-badge";
import { MachineCode, SubText, TextLink } from "../../../_lib/ui/text";
import { TimeValue } from "../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const c = operationsCopy.provisioning;
const spec = {
  filters: { state: ["in_progress", "waiting", "failed", "active", "deactivated"] },
  pageSize: 25,
} as const;

export default async function ProvisioningPage({
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
  const path = `/${locale}/provisioning`;
  const result = await callOperator("list_provisioning_runs_v1", {
    p_state: list.filters.state,
    p_search: list.q || undefined,
    p_limit: list.pageSize,
    p_offset: list.offset,
  });
  const stateLabel = (s: string) =>
    s === "in_progress"
      ? say(locale, c.inProgress)
      : s === "waiting"
        ? say(locale, c.waiting)
        : copyFor(statusCopy, s, locale);

  return (
    <>
      <PageHeader
        locale={locale}
        timesInUtc
        title={say(locale, c.title)}
        description={say(locale, c.description)}
        actions={
          atLeast(operator.role, "operator") ? (
            <Button asChild>
              <Link href={`${path}/new`}>
                <Plus aria-hidden="true" />
                {say(locale, c.request)}
              </Link>
            </Button>
          ) : null
        }
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
          options={spec.filters.state.map((s) => [s, stateLabel(s)] as const)}
        />
      </FilterBar>
      {!result.ok ? (
        <UnavailableState locale={locale} code={result.code} />
      ) : result.data.length === 0 ? (
        <EmptyState locale={locale} filtered={Boolean(list.q || list.filters.state)} />
      ) : (
        <>
          <DataTable
            id="runs-table"
            locale={locale}
            caption={say(locale, c.title)}
            columns={[
              { label: say(locale, c.slug) },
              { label: say(locale, c.tenant) },
              { label: say(locale, c.state) },
              { label: say(locale, c.steps), numeric: true },
              { label: say(locale, c.release) },
              { label: say(locale, c.updated) },
            ]}
            rows={result.data.map((row) => ({
              key: row.run_id,
              cells: [
                <TextLink key="s" href={`${path}/${row.run_id}`}>
                  <MachineCode className="text-sm">{row.slug}</MachineCode>
                </TextLink>,
                <TextLink key="t" href={`/${locale}/tenants/${row.tenant_id}`}>
                  <bdi>{row.tenant_name}</bdi>
                </TextLink>,
                <>
                  <StatusBadge
                    locale={locale}
                    status={row.waiting_reason ? "waiting" : row.state}
                  />
                  {row.waiting_reason ? (
                    <SubText>
                      {copyFor(reasonCopy, `waiting_${row.waiting_reason}`, locale)}
                    </SubText>
                  ) : null}
                  {row.last_error_code ? (
                    <SubText>
                      <MachineCode>{row.last_error_code}</MachineCode>
                    </SubText>
                  ) : null}
                </>,
                `${formatNumber(row.steps_succeeded, locale)} / ${formatNumber(row.steps_total, locale)}`,
                <MachineCode key="r" className="text-sm">
                  {row.desired_release}
                </MachineCode>,
                <TimeValue key="u" locale={locale} value={row.updated_at} />,
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
