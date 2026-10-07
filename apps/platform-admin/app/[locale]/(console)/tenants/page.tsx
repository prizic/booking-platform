import { formatNumber } from "@wlbp/i18n";
import { Button } from "@wlbp/ui-foundation";
import { Plus } from "lucide-react";
import Link from "next/link";
import { copyFor, formCopy, say, statusCopy } from "../../../_lib/copy";
import { listHref, parseListParams } from "../../../_lib/list-params";
import { callOperator } from "../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../_lib/operator-page";
import { pageLocale } from "../../../_lib/page-locale";
import { PageHeader } from "../../../_lib/shell/page-header";
import { DataTable } from "../../../_lib/ui/data-table";
import { FilterBar, SelectFilter } from "../../../_lib/ui/filter-bar";
import { Pagination } from "../../../_lib/ui/pagination";
import { EmptyState, Unknown, UnavailableState } from "../../../_lib/ui/states";
import { StatusBadge } from "../../../_lib/ui/status-badge";
import { MachineCode, SubText, TextLink } from "../../../_lib/ui/text";
import { TimeValue } from "../../../_lib/ui/time";
import { tenantsCopy as c } from "./copy";

export const dynamic = "force-dynamic";

const spec = {
  sorts: ["name", "-name", "created", "-created", "status"],
  defaultSort: "-created",
  filters: { status: ["active", "suspended", "closed"], plan: "text" },
  pageSize: 25,
} as const;

export default async function TenantsPage({
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
  const path = `/${locale}/tenants`;
  const [result, plans] = await Promise.all([
    callOperator("list_tenants_v1", {
      p_search: list.q || undefined,
      p_status: list.filters.status,
      p_plan_key: list.filters.plan,
      p_sort: list.sort,
      p_limit: list.pageSize,
      p_offset: list.offset,
    }),
    callOperator("list_plans_v1"),
  ]);
  const filtered = Boolean(list.q || Object.keys(list.filters).length);

  return (
    <>
      <PageHeader
        locale={locale}
        timesInUtc
        title={say(locale, c.title)}
        description={say(locale, c.description)}
        actions={
          atLeast(operator.role, "admin") ? (
            <Button asChild>
              <Link href={`${path}/new`}>
                <Plus aria-hidden="true" />
                {say(locale, c.register)}
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
          name="status"
          label={say(locale, c.status)}
          value={list.filters.status}
          allLabel={say(locale, formCopy.all)}
          options={spec.filters.status.map(
            (s) => [s, copyFor(statusCopy, s, locale)] as const,
          )}
        />
        <SelectFilter
          name="plan"
          label={say(locale, c.plan)}
          value={list.filters.plan}
          allLabel={say(locale, formCopy.all)}
          options={[
            ["none", say(locale, c.noPlan)] as const,
            ...(plans.ok ? plans.data.map((p) => [p.key, p.name] as const) : []),
          ]}
        />
      </FilterBar>
      {!result.ok ? (
        <UnavailableState locale={locale} code={result.code} />
      ) : result.data.length === 0 ? (
        <EmptyState
          locale={locale}
          filtered={filtered}
          title={filtered ? undefined : say(locale, c.emptyTitle)}
          body={filtered ? undefined : say(locale, c.emptyBody)}
        />
      ) : (
        <>
          <DataTable
            id="tenants-table"
            locale={locale}
            caption={say(locale, c.caption)}
            sort={list.sort}
            sortHref={(sort) => listHref(path, list, { sort })}
            columns={[
              { label: say(locale, c.name), sort: "name" },
              { label: say(locale, c.status), sort: "status" },
              { label: say(locale, c.plan) },
              { label: say(locale, c.instances), numeric: true },
              { label: say(locale, c.provisioning) },
              { label: say(locale, c.created), sort: "created" },
            ]}
            rows={result.data.map((row) => ({
              key: row.tenant_id,
              cells: [
                <>
                  <TextLink href={`${path}/${row.tenant_id}`}>
                    <bdi>{row.name}</bdi>
                  </TextLink>
                  <SubText>
                    <MachineCode>{row.brand_keys}</MachineCode>
                  </SubText>
                </>,
                <StatusBadge key="status" locale={locale} status={row.status} />,
                row.plan_key ? (
                  <>
                    <bdi>{row.plan_key}</bdi>{" "}
                    <StatusBadge locale={locale} status={row.subscription_state} />
                  </>
                ) : (
                  <Unknown locale={locale} kind="none" />
                ),
                `${formatNumber(row.active_instances, locale)} / ${formatNumber(row.instance_count, locale)}`,
                row.provisioning_state ? (
                  <StatusBadge locale={locale} status={row.provisioning_state} />
                ) : (
                  <Unknown locale={locale} kind="none" />
                ),
                <TimeValue key="created" locale={locale} value={row.created_at} />,
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
