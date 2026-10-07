import { Alert } from "@wlbp/ui-foundation";
import { TextLink } from "../../../_lib/ui/text";
import { actionCopy as a } from "../../../_lib/action-copy";
import { copyFor, formCopy, say, stateCopy, statusCopy } from "../../../_lib/copy";
import { listHref, parseListParams } from "../../../_lib/list-params";
import { callOperator } from "../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../_lib/operator-page";
import { operationsCopy } from "../../../_lib/operations-copy";
import { pageLocale } from "../../../_lib/page-locale";
import { PageHeader } from "../../../_lib/shell/page-header";
import { DataTable } from "../../../_lib/ui/data-table";
import { FilterBar, SelectFilter } from "../../../_lib/ui/filter-bar";
import { OperatorForm } from "../../../_lib/ui/operator-form";
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

  return (
    <>
      <PageHeader
        locale={locale}
        timesInUtc
        title={say(locale, c.title)}
        description={say(locale, c.description)}
      />
      <Alert tone="info">{say(locale, c.certificateNote)}</Alert>
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
              { label: say(locale, c.pendingJob) },
            ]}
            rows={result.data.map((row) => ({
              key: row.domain_id,
              cells: [
                <bdi key="h">{row.hostname}</bdi>,
                <TextLink key="t" href={`/${locale}/tenants/${row.tenant_id}#domains`}>
                  <bdi>{row.tenant_name}</bdi>
                </TextLink>,
                <bdi key="a">{row.application}</bdi>,
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
                row.pending_job_id ? (
                  <TextLink key="j" href={`/${locale}/jobs/${row.pending_job_id}`}>
                    {copyFor(statusCopy, "queued", locale)}
                  </TextLink>
                ) : canQueue && row.verification_status !== "verified" ? (
                  <OperatorForm
                    key="q"
                    locale={locale}
                    operation="requestDomainVerification"
                    submit={say(locale, a.verifyDomain.submit)}
                    successMessage={say(locale, a.verifyDomain.done)}
                    compact
                    hidden={{ domainId: row.domain_id }}
                  />
                ) : (
                  <Unknown locale={locale} kind="none" />
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
