import { Alert } from "@wlbp/ui-foundation";
import { TextLink } from "../../../_lib/ui/text";
import { copyFor, formCopy, say, stateCopy, statusCopy } from "../../../_lib/copy";
import {
  canRequestDomainVerification,
  domainRetirementState,
} from "../../../_lib/domain-lifecycle";
import { lifecycleCopy } from "../../../_lib/lifecycle-copy";
import { listHref, parseListParams } from "../../../_lib/list-params";
import { callOperator } from "../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../_lib/operator-page";
import { operationsCopy } from "../../../_lib/operations-copy";
import { pageLocale } from "../../../_lib/page-locale";
import { DataPage } from "../../../_lib/shell/data-page";
import { DataTable } from "../../../_lib/ui/data-table";
import { FilterBar, SelectFilter } from "../../../_lib/ui/filter-bar";
import {
  DomainRetirementDialog,
  VerifyDomainDialog,
} from "../../../_lib/ui/domain-actions";
import { DomainReplacement, DomainRetiredAt } from "../../../_lib/ui/domain-retirement";
import type { TenantDetail } from "../tenants/[tenantId]/sections";
import { Pagination } from "../../../_lib/ui/pagination";
import { EmptyState, Unknown, UnavailableState } from "../../../_lib/ui/states";
import { StatusBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const c = operationsCopy.domains;
const spec = {
  filters: { status: ["pending", "verified", "failed"] },
  pageSize: 25,
} as const;

export default async function DomainsPage({
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
  const path = `/${locale}/domains`;
  const result = await callOperator("list_domains_v1", {
    p_search: list.q || undefined,
    p_status: list.filters.status,
    p_limit: list.pageSize,
    p_offset: list.offset,
  });
  const canQueue = atLeast(operator.role, "operator");
  const admin = atLeast(operator.role, "admin");
  // Tenant detail contains all domains, so a filtered/paged list never limits valid replacement choices.
  const contextResults =
    admin && result.ok
      ? await Promise.all(
          [...new Set(result.data.map((row) => row.tenant_id))].map(
            async (tenantId) =>
              [
                tenantId,
                await callOperator("get_tenant_v1", { p_tenant_id: tenantId }),
              ] as const,
          ),
        )
      : [];
  const replacementContexts = new Map(
    contextResults.map(
      ([tenantId, context]) =>
        [
          tenantId,
          context.ok
            ? (context.data as unknown as TenantDetail).domains.map((domain) => ({
                ...domain,
                tenant_id: tenantId,
              }))
            : null,
        ] as const,
    ),
  );

  return (
    <DataPage
      locale={locale}
      timesInUtc
      title={say(locale, c.title)}
      description={say(locale, c.description)}
      toolbar={
        <FilterBar
          locale={locale}
          path={path}
          search={{ label: say(locale, c.search), value: list.q }}
        >
          <SelectFilter
            name="status"
            label={say(locale, c.verification)}
            value={list.filters.status}
            allLabel={say(locale, formCopy.all)}
            options={spec.filters.status.map(
              (s) => [s, copyFor(statusCopy, s, locale)] as const,
            )}
          />
        </FilterBar>
      }
      pagination={
        result.ok ? (
          <Pagination
            locale={locale}
            page={list.page}
            pageSize={list.pageSize}
            total={Number(result.data[0]?.total_count ?? 0)}
            href={(page) => listHref(path, list, { page })}
          />
        ) : null
      }
    >
      <Alert tone="info">{say(locale, c.certificateNote)}</Alert>

      {!result.ok ? (
        <UnavailableState locale={locale} code={result.code} />
      ) : result.data.length === 0 ? (
        <EmptyState locale={locale} filtered={Boolean(list.q || list.filters.status)} />
      ) : (
        <>
          <DataTable
            id="domains-table"
            locale={locale}
            caption={say(locale, c.title)}
            columns={[
              { label: say(locale, c.hostname) },
              { label: say(locale, c.tenant) },
              { label: say(locale, c.application) },
              { label: say(locale, c.verification) },
              { label: say(locale, c.certificate) },
              { label: say(locale, c.serving) },
              { label: say(locale, lifecycleCopy.retiredAt) },
              { label: say(locale, lifecycleCopy.replacement) },
              { label: say(locale, c.pendingJob) },
              { label: say(locale, formCopy.actions), kind: "actions" },
            ]}
            rows={result.data.map((row) => ({
              key: row.domain_id,
              cells: [
                <TextLink
                  key="h"
                  href={`${path}/${row.domain_id}?tenant=${row.tenant_id}`}
                >
                  <bdi>{row.hostname}</bdi>
                </TextLink>,
                <TextLink key="t" href={`/${locale}/tenants/${row.tenant_id}#domains`}>
                  <bdi>{row.tenant_name}</bdi>
                </TextLink>,
                say(
                  locale,
                  row.application === "client"
                    ? lifecycleCopy.client
                    : lifecycleCopy.dashboard,
                ),
                <>
                  <StatusBadge locale={locale} status={row.verification_status} />{" "}
                  <TimeValue locale={locale} value={row.verified_at} empty="none" />
                </>,
                row.certificate_status ? (
                  <>
                    <bdi>{row.certificate_status}</bdi>{" "}
                    <TimeValue
                      locale={locale}
                      value={row.certificate_observed_at}
                      staleAfterMinutes={1440}
                    />
                  </>
                ) : (
                  <Unknown locale={locale} kind="notReported" />
                ),
                say(locale, row.active ? stateCopy.yes : stateCopy.no),
                <DomainRetiredAt key="retired" locale={locale} domain={row} />,
                <DomainReplacement
                  key="replacement"
                  locale={locale}
                  domain={row}
                  tenantId={row.tenant_id}
                  domains={replacementContexts.get(row.tenant_id) ?? []}
                />,
                row.pending_retirement_job_id ? (
                  <TextLink
                    key="retirement-job"
                    href={`/${locale}/review/job/${row.pending_retirement_job_id}`}
                  >
                    {say(locale, lifecycleCopy.openReview)} ·{" "}
                    {copyFor(statusCopy, "awaiting_approval", locale)}
                  </TextLink>
                ) : row.pending_job_id ? (
                  <TextLink key="j" href={`/${locale}/jobs/${row.pending_job_id}`}>
                    {copyFor(statusCopy, "queued", locale)}
                  </TextLink>
                ) : canQueue && canRequestDomainVerification(row) ? (
                  <VerifyDomainDialog locale={locale} domainId={row.domain_id} />
                ) : (
                  <Unknown locale={locale} kind="none" />
                ),
                domainRetirementState(row) === "retired" ? (
                  <StatusBadge locale={locale} status="retired" />
                ) : admin && !row.pending_retirement_job_id ? (
                  replacementContexts.get(row.tenant_id) ? (
                    <DomainRetirementDialog
                      locale={locale}
                      domain={{ ...row, id: row.domain_id }}
                      domains={replacementContexts.get(row.tenant_id)!}
                    />
                  ) : (
                    <UnavailableState locale={locale} />
                  )
                ) : null,
              ],
            }))}
          />
        </>
      )}
    </DataPage>
  );
}
