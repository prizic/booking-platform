import { Alert, FieldGroup, TextField } from "@wlbp/ui-foundation";
import { randomUUID } from "node:crypto";
import { requestProvisioningAction } from "../../../../_lib/actions/operations";
import { say, stateCopy } from "../../../../_lib/copy";
import { callOperator } from "../../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../../_lib/operator-page";
import { operationsCopy } from "../../../../_lib/operations-copy";
import { readPages } from "../../../../_lib/read-pages";
import { pageLocale } from "../../../../_lib/page-locale";
import { PageHeader } from "../../../../_lib/shell/page-header";
import { OperatorForm } from "../../../../_lib/ui/operator-form";
import { SelectField } from "../../../../_lib/ui/select-field";
import { EmptyState, UnavailableState } from "../../../../_lib/ui/states";

export const dynamic = "force-dynamic";

const c = operationsCopy.provisioning;

export default async function RequestProvisioningPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await pageLocale(params);
  const operator = await getOperator(locale);
  if (!operator) return null;
  const preselectTenant = (await searchParams).tenant;
  const header = (
    <PageHeader
      locale={locale}
      title={say(locale, c.newTitle)}
      description={say(locale, c.newDescription)}
      breadcrumbs={[
        [say(locale, c.title), `/${locale}/provisioning`],
        [say(locale, c.newTitle)],
      ]}
    />
  );
  if (!atLeast(operator.role, "operator"))
    return (
      <>
        {header}
        <Alert tone="info">{say(locale, stateCopy.roleRequired)}</Alert>
      </>
    );

  const [instances, plans, releases] = await Promise.all([
    readPages((p_offset, p_limit) =>
      callOperator("list_instances_v1", { p_state: "provisioning", p_offset, p_limit }),
    ),
    callOperator("list_plans_v1"),
    readPages((p_offset, p_limit) =>
      callOperator("list_releases_v1", { p_status: "available", p_offset, p_limit }),
    ),
  ]);
  if (!instances.ok || !plans.ok || !releases.ok) {
    const code = !instances.ok
      ? instances.code
      : !plans.ok
        ? plans.code
        : !releases.ok
          ? releases.code
          : "unavailable";
    return (
      <>
        {header}
        <UnavailableState locale={locale} code={code} />
      </>
    );
  }
  if (instances.data.length === 0)
    return (
      <>
        {header}
        <EmptyState locale={locale} title={say(locale, c.noTargets)} />
      </>
    );
  if (releases.data.length === 0)
    return (
      <>
        {header}
        <EmptyState locale={locale} title={say(locale, c.noReleases)} />
      </>
    );

  const preselected = instances.data.find((i) => i.tenant_id === preselectTenant);
  if (preselectTenant && !preselected)
    return (
      <>
        {header}
        <EmptyState locale={locale} title={say(locale, c.noTargets)} />
      </>
    );
  return (
    <>
      {header}
      <section className="max-w-4xl rounded-lg border bg-card p-5 md:p-6">
        <OperatorForm
          locale={locale}
          action={requestProvisioningAction}
          submit={say(locale, c.request)}
          successMessage={say(locale, c.submitted)}
        >
          <input type="hidden" name="idempotencyKey" value={randomUUID()} />
          <FieldGroup columns={2}>
            <div className="md:col-span-2">
              <SelectField
                name="target"
                label={say(locale, c.target)}
                value={
                  preselected
                    ? `${preselected.tenant_id}|${preselected.instance_id}`
                    : undefined
                }
                options={instances.data.map(
                  (i) =>
                    [
                      `${i.tenant_id}|${i.instance_id}`,
                      `${i.tenant_name} · ${i.instance_id.slice(0, 8)}`,
                    ] as const,
                )}
              />
            </div>
            <TextField
              id="slug"
              name="slug"
              label={say(locale, c.slug)}
              description={say(locale, c.slugHint)}
              required
              minLength={3}
              maxLength={40}
              autoComplete="off"
            />
            <SelectField
              name="planKey"
              label={say(locale, c.plan)}
              options={plans.data
                .filter((p) => p.active)
                .map((p) => [p.key, p.name] as const)}
            />
            <SelectField
              name="releaseId"
              label={say(locale, c.releaseField)}
              options={releases.data.map(
                (r) => [r.release_id, `${r.version} · ${r.channel}`] as const,
              )}
            />
            <SelectField
              name="defaultLocale"
              label={say(locale, c.defaultLocale)}
              value={locale}
              options={[
                ["en", "English"],
                ["ar", "العربية"],
              ]}
            />
            <TextField
              id="timezone"
              name="timezone"
              label={say(locale, c.timezone)}
              description={say(locale, c.timezoneHint)}
              defaultValue="Asia/Riyadh"
              required
            />
            <TextField
              id="currency"
              name="currency"
              label={say(locale, c.currency)}
              defaultValue="SAR"
              required
              minLength={3}
              maxLength={3}
            />
            <TextField
              id="clientHostname"
              name="clientHostname"
              label={say(locale, c.clientHostname)}
              maxLength={253}
              autoComplete="off"
            />
            <TextField
              id="dashboardHostname"
              name="dashboardHostname"
              label={say(locale, c.dashboardHostname)}
              maxLength={253}
              autoComplete="off"
            />
          </FieldGroup>
        </OperatorForm>
      </section>
    </>
  );
}
