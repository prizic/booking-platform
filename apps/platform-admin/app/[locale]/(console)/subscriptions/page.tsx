import { Alert, AlertDescription } from "@wlbp/ui-foundation";
import Link from "next/link";
import { actionCopy as a } from "../../../_lib/action-copy";
import { commercialCopy } from "../../../_lib/commercial-copy";
import { copyFor, formCopy, say, statusCopy } from "../../../_lib/copy";
import { listHref, parseListParams } from "../../../_lib/list-params";
import { callOperator } from "../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../_lib/operator-page";
import { pageLocale } from "../../../_lib/page-locale";
import { PageHeader } from "../../../_lib/shell/page-header";
import { ActionDialog } from "../../../_lib/ui/action-dialog";
import { DataTable } from "../../../_lib/ui/data-table";
import { FilterBar, SelectFilter } from "../../../_lib/ui/filter-bar";
import { DateTimeFormField, SelectFormField } from "../../../_lib/ui/form-fields";
import { Pagination } from "../../../_lib/ui/pagination";
import { EmptyState, Unknown, UnavailableState } from "../../../_lib/ui/states";
import { StatusBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const c = commercialCopy.subscriptions;
const states = ["none", "trialing", "active", "past_due", "cancelled"] as const;
const rings = ["canary", "early", "general"] as const;
const spec = { filters: { state: states, plan: "text" }, pageSize: 25 } as const;

export default async function SubscriptionsPage({
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
  const path = `/${locale}/subscriptions`;
  const [result, plans] = await Promise.all([
    callOperator("list_subscriptions_v1", {
      p_state: list.filters.state,
      p_plan_key: list.filters.plan,
      p_search: list.q || undefined,
      p_limit: list.pageSize,
      p_offset: list.offset,
    }),
    callOperator("list_plans_v1"),
  ]);
  const admin = atLeast(operator.role, "admin");
  const status = (s: string) => copyFor(statusCopy, s, locale);
  const ringOptions = rings.map((r) => [r, status(r)] as const);
  const planOptions = plans.ok
    ? plans.data.filter((p) => p.active).map((p) => [p.key, p.name] as const)
    : [];

  return (
    <div className="grid gap-6">
      <PageHeader
        locale={locale}
        timesInUtc
        title={say(locale, c.title)}
        description={say(locale, c.description)}
      />
      <Alert>
        <AlertDescription>{say(locale, c.billingNote)}</AlertDescription>
      </Alert>
      <FilterBar
        locale={locale}
        path={path}
        search={{ label: say(locale, c.search), value: list.q }}
      >
        <SelectFilter
          name="state"
          label={say(locale, c.status)}
          value={list.filters.state}
          allLabel={say(locale, formCopy.all)}
          options={states.map((s) => [s, status(s)] as const)}
        />
        <SelectFilter
          name="plan"
          label={say(locale, c.plan)}
          value={list.filters.plan}
          allLabel={say(locale, formCopy.all)}
          options={plans.ok ? plans.data.map((p) => [p.key, p.name] as const) : []}
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
            id="subscriptions-table"
            locale={locale}
            caption={say(locale, c.title)}
            columns={[
              { label: say(locale, c.tenant) },
              { label: say(locale, c.plan) },
              { label: say(locale, c.status) },
              { label: say(locale, c.ring) },
              { label: say(locale, c.started) },
              { label: say(locale, c.ends) },
              { label: say(locale, c.updated) },
              { label: say(locale, c.actions) },
            ]}
            rows={result.data.map((row) => ({
              key: row.tenant_id,
              cells: [
                <Link
                  key="t"
                  href={`/${locale}/tenants/${row.tenant_id}#subscription`}
                  className="font-semibold text-primary underline-offset-4 hover:underline"
                >
                  <bdi>{row.tenant_name}</bdi>
                </Link>,
                row.plan_key ? (
                  <bdi key="p" className="font-medium">
                    {row.plan_name ?? row.plan_key}
                  </bdi>
                ) : (
                  <Unknown key="p" locale={locale} kind="none" />
                ),
                <StatusBadge key="s" locale={locale} status={row.state} />,
                row.rollout_ring ? (
                  status(row.rollout_ring)
                ) : (
                  <Unknown key="r" locale={locale} kind="none" />
                ),
                <TimeValue
                  key="st"
                  locale={locale}
                  value={row.started_at}
                  empty="none"
                />,
                <TimeValue key="e" locale={locale} value={row.ends_at} empty="none" />,
                <TimeValue
                  key="u"
                  locale={locale}
                  value={row.updated_at}
                  empty="none"
                />,
                admin ? (
                  <div key="a" className="flex flex-wrap items-center gap-2">
                    <ActionDialog
                      locale={locale}
                      operation="assignSubscription"
                      trigger={say(locale, a.assignPlan.trigger)}
                      triggerVariant="quiet"
                      title={say(locale, a.assignPlan.title)}
                      description={say(locale, a.assignPlan.body)}
                      submit={say(locale, a.assignPlan.submit)}
                      successMessage={say(locale, a.assignPlan.done)}
                      hidden={{ tenantId: row.tenant_id }}
                      values={{
                        planKey: row.plan_key ?? undefined,
                        ring: row.rollout_ring ?? "general",
                      }}
                    >
                      <SelectFormField
                        name="planKey"
                        label={say(locale, a.fields.plan)}
                        options={planOptions}
                      />
                      <SelectFormField
                        name="ring"
                        label={say(locale, a.fields.ring)}
                        options={ringOptions}
                      />
                    </ActionDialog>
                    {row.updated_at ? (
                      <ActionDialog
                        locale={locale}
                        operation="updateSubscription"
                        trigger={say(locale, a.updateSubscription.trigger)}
                        triggerVariant="quiet"
                        title={say(locale, a.updateSubscription.title)}
                        description={say(locale, a.updateSubscription.body)}
                        submit={say(locale, a.updateSubscription.submit)}
                        successMessage={say(locale, a.updateSubscription.done)}
                        hidden={{
                          tenantId: row.tenant_id,
                          expectedUpdatedAt: row.updated_at,
                        }}
                        values={{
                          state: row.state,
                          endsAt: row.ends_at?.slice(0, 16) ?? "",
                          ring: row.rollout_ring ?? "general",
                        }}
                      >
                        <SelectFormField
                          name="state"
                          label={say(locale, a.fields.state)}
                          options={states
                            .filter((s) => s !== "none")
                            .map((s) => [s, status(s)] as const)}
                        />
                        <DateTimeFormField
                          id={`subscription-ends-${row.tenant_id}`}
                          name="endsAt"
                          locale={locale}
                          label={say(locale, a.fields.endsAt)}
                        />
                        <SelectFormField
                          name="ring"
                          label={say(locale, a.fields.ring)}
                          options={ringOptions}
                        />
                      </ActionDialog>
                    ) : null}
                  </div>
                ) : null,
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
    </div>
  );
}
