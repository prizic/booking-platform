import { Alert, ReferenceCode, Section } from "@wlbp/ui-foundation";
import { notFound } from "next/navigation";
import { say, stateCopy } from "../../../../_lib/copy";
import {
  canRequestDomainVerification,
  domainRetirementState,
} from "../../../../_lib/domain-lifecycle";
import { lifecycleCopy as c } from "../../../../_lib/lifecycle-copy";
import { operationsCopy } from "../../../../_lib/operations-copy";
import { callOperator } from "../../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../../_lib/operator-page";
import { pageLocale } from "../../../../_lib/page-locale";
import { asUuid } from "../../../../_lib/schemas/fields";
import { PageHeader } from "../../../../_lib/shell/page-header";
import { AuditList } from "../../../../_lib/ui/audit-list";
import {
  DomainRetirementDialog,
  VerifyDomainDialog,
} from "../../../../_lib/ui/domain-actions";
import {
  DomainReplacement,
  DomainRetiredAt,
} from "../../../../_lib/ui/domain-retirement";
import { Facts } from "../../../../_lib/ui/facts";
import { EmptyState, UnavailableState } from "../../../../_lib/ui/states";
import { StatusBadge } from "../../../../_lib/ui/status-badge";
import { TextLink } from "../../../../_lib/ui/text";
import { TimeValue } from "../../../../_lib/ui/time";
import type { TenantDetail } from "../../tenants/[tenantId]/sections";
export const dynamic = "force-dynamic";
export default async function DomainPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; domainId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await pageLocale(params);
  const { domainId } = await params;
  const raw = (await searchParams).tenant;
  const tenantId = asUuid(typeof raw === "string" ? raw : undefined);
  const operator = await getOperator(locale);
  if (!operator) return null;
  if (!asUuid(domainId) || !tenantId) notFound();
  // The URL is only a selector. This live operator RPC authorizes the tenant read.
  const result = await callOperator("get_tenant_v1", { p_tenant_id: tenantId });
  if (!result.ok && result.code === "not_found") notFound();
  if (!result.ok)
    return (
      <>
        <PageHeader locale={locale} title={say(locale, operationsCopy.domains.title)} />
        <UnavailableState locale={locale} code={result.code} />
      </>
    );
  const tenant = result.data as unknown as TenantDetail;
  const domain = tenant.domains.find((item) => item.id === domainId);
  if (!domain) notFound();
  const domains = tenant.domains.map((item) => ({ ...item, tenant_id: tenantId }));
  const selected = { ...domain, tenant_id: tenantId };
  const events = tenant.audit.filter(
    (event) => event.target_kind === "domain" && event.target_id === domainId,
  );
  return (
    <>
      <PageHeader
        locale={locale}
        title={domain.hostname}
        timesInUtc
        breadcrumbs={[
          [say(locale, operationsCopy.domains.title), `/${locale}/domains`],
          [domain.hostname],
        ]}
        meta={<ReferenceCode>{domain.id}</ReferenceCode>}
        actions={
          <>
            {atLeast(operator.role, "operator") &&
            canRequestDomainVerification(domain) ? (
              <VerifyDomainDialog locale={locale} domainId={domain.id} />
            ) : null}
            {atLeast(operator.role, "admin") &&
            domainRetirementState(domain) !== "retired" ? (
              <DomainRetirementDialog
                locale={locale}
                domain={selected}
                domains={domains}
              />
            ) : null}
          </>
        }
      />
      <Facts
        items={[
          [
            say(locale, operationsCopy.domains.tenant),
            <TextLink key="t" href={`/${locale}/tenants/${tenantId}`}>
              <bdi>{tenant.tenant.name}</bdi>
            </TextLink>,
          ],
          [
            say(locale, operationsCopy.instances.instance),
            <TextLink key="i" href={`/${locale}/instances/${domain.instance_id}`}>
              <ReferenceCode>{domain.instance_id}</ReferenceCode>
            </TextLink>,
          ],
          [
            say(locale, c.application),
            say(locale, domain.application === "client" ? c.client : c.dashboard),
          ],
          [
            say(locale, operationsCopy.domains.verification),
            <StatusBadge key="v" locale={locale} status={domain.verification_status} />,
          ],
          [
            say(locale, operationsCopy.domains.serving),
            say(locale, domain.active ? stateCopy.yes : stateCopy.no),
          ],
          [
            say(locale, c.retiredAt),
            <DomainRetiredAt key="retired" locale={locale} domain={domain} />,
          ],
          [
            say(locale, c.replacement),
            <DomainReplacement
              key="replacement"
              locale={locale}
              domain={domain}
              tenantId={tenantId}
              domains={tenant.domains}
            />,
          ],
          [
            say(locale, operationsCopy.instances.observedAt),
            <TimeValue
              key="at"
              locale={locale}
              value={domain.verified_at}
              empty="notObserved"
            />,
          ],
        ]}
      />
      <Alert tone="info">
        {say(
          locale,
          domainRetirementState(domain) === "retired" ? c.retiredBody : c.retireBody,
        )}
      </Alert>
      <Section
        id="domain-history"
        title={say(locale, ["Recorded domain history", "سجل النطاق الموثّق"])}
      >
        {events.length ? (
          <AuditList locale={locale} rows={events} />
        ) : (
          <EmptyState
            locale={locale}
            title={say(locale, [
              "No recent domain events",
              "لا توجد أحداث حديثة للنطاق",
            ])}
          />
        )}
        <TextLink href={`/${locale}/audit?tenant=${tenantId}&family=domain`}>
          {say(locale, ["Open full audit history", "فتح سجل التدقيق الكامل"])}
        </TextLink>
      </Section>
    </>
  );
}
