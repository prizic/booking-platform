import { ReferenceCode } from "@wlbp/ui-foundation";
import Link from "next/link";
import { notFound } from "next/navigation";
import { say } from "../../../../_lib/copy";
import { callOperator } from "../../../../_lib/operator-api";
import { getOperator } from "../../../../_lib/operator-page";
import { pageLocale } from "../../../../_lib/page-locale";
import { PageHeader } from "../../../../_lib/shell/page-header";
import { UnavailableState } from "../../../../_lib/ui/states";
import { StatusBadge } from "../../../../_lib/ui/status-badge";
import { tenantsCopy as c } from "../copy";
import {
  AuditSection,
  DomainsSection,
  EntitlementsSection,
  IdentitySection,
  InstancesSection,
  JobsSection,
  LifecycleSection,
  ProvisioningSection,
  SubscriptionSection,
  SupportSection,
  type TenantDetail,
} from "./sections";

export const dynamic = "force-dynamic";

export default async function TenantPage({
  params,
}: {
  params: Promise<{ locale: string; tenantId: string }>;
}) {
  const locale = await pageLocale(params);
  const { tenantId } = await params;
  const operator = await getOperator(locale);
  if (!operator) return null;
  if (!/^[0-9a-f-]{36}$/u.test(tenantId)) notFound();
  const [result, plans] = await Promise.all([
    callOperator("get_tenant_v1", { p_tenant_id: tenantId }),
    callOperator("list_plans_v1"),
  ]);
  if (!result.ok && result.code === "not_found") notFound();
  const crumbs = [[say(locale, c.title), `/${locale}/tenants`]] as const;
  if (!result.ok) {
    return (
      <>
        <PageHeader locale={locale} title={say(locale, c.title)} breadcrumbs={crumbs} />
        <UnavailableState locale={locale} code={result.code} />
      </>
    );
  }
  const detail = result.data as unknown as TenantDetail;
  const props = { locale, detail, operator };
  const sectionIds = Object.keys(c.sections) as (keyof typeof c.sections)[];

  return (
    <>
      <PageHeader
        locale={locale}
        timesInUtc
        title={detail.tenant.name}
        breadcrumbs={[...crumbs, [detail.tenant.name]]}
        meta={<ReferenceCode>{detail.tenant.id}</ReferenceCode>}
        actions={<StatusBadge locale={locale} status={detail.tenant.status} />}
      />
      <nav
        aria-label={detail.tenant.name}
        className="-mx-1 flex gap-1 overflow-x-auto border-b pb-px [scrollbar-width:thin]"
      >
        {sectionIds.map((id) => (
          <Link
            key={id}
            href={`#${id}`}
            className="inline-flex min-h-11 shrink-0 items-center rounded-md px-3 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {say(locale, c.sections[id])}
          </Link>
        ))}
      </nav>
      <IdentitySection {...props} />
      <LifecycleSection {...props} />
      <SubscriptionSection {...props} plans={plans.ok ? plans.data : []} />
      <EntitlementsSection {...props} />
      <DomainsSection {...props} />
      <InstancesSection locale={locale} detail={detail} />
      <ProvisioningSection {...props} />
      <JobsSection locale={locale} detail={detail} />
      <SupportSection {...props} />
      <AuditSection locale={locale} detail={detail} />
    </>
  );
}
