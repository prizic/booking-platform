import Link from "next/link";
import { actionCopy as a } from "../../../_lib/action-copy";
import {
  assignSubscriptionAction,
  updateSubscriptionAction,
} from "../../../_lib/actions/subscriptions";
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
import { Pagination } from "../../../_lib/ui/pagination";
import { SelectField } from "../../../_lib/ui/select-field";
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
    <>
      <PageHeader
        locale={locale}
        title={say(locale, c.title)}
        description={say(locale, c.description)}
      />
      <p className="notice">{say(locale, c.billingNote)}</p>
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
                <Link key="t" href={`/${locale}/tenants/${row.tenant_id}#subscription`}>
                  <bdi>{row.tenant_name}</bdi>
                </Link>,
                row.plan_key ? (
                  <bdi key="p">{row.plan_name ?? row.plan_key}</bdi>
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
                  <div key="a" className="page-actions">
                    <ActionDialog
                      locale={locale}
                      action={assignSubscriptionAction}
                      trigger={say(locale, a.assignPlan.trigger)}
                      triggerVariant="quiet"
                      title={say(locale, a.assignPlan.title)}
                      description={say(locale, a.assignPlan.body)}
                      submit={say(locale, a.assignPlan.submit)}
                      successMessage={say(locale, a.assignPlan.done)}
                      reason={{ minLength: 5 }}
                      hidden={{ tenantId: row.tenant_id }}
                    >
                      <SelectField
                        name="planKey"
                        label={say(locale, a.fields.plan)}
                        value={row.plan_key ?? undefined}
                        options={planOptions}
                      />
                      <SelectField
                        name="ring"
                        label={say(locale, a.fields.ring)}
                        value={row.rollout_ring ?? "general"}
                        options={ringOptions}
                      />
                    </ActionDialog>
                    {row.updated_at ? (
                      <ActionDialog
                        locale={locale}
                        action={updateSubscriptionAction}
                        trigger={say(locale, a.updateSubscription.trigger)}
                        triggerVariant="quiet"
                        title={say(locale, a.updateSubscription.title)}
                        description={say(locale, a.updateSubscription.body)}
                        submit={say(locale, a.updateSubscription.submit)}
                        successMessage={say(locale, a.updateSubscription.done)}
                        reason={{ minLength: 5 }}
                        hidden={{
                          tenantId: row.tenant_id,
                          expectedUpdatedAt: row.updated_at,
                        }}
                      >
                        <SelectField
                          name="state"
                          label={say(locale, a.fields.state)}
                          value={row.state}
                          options={states
                            .filter((s) => s !== "none")
                            .map((s) => [s, status(s)] as const)}
                        />
                        <label className="field">
                          <span>{say(locale, a.fields.endsAt)}</span>
                          <input
                            type="datetime-local"
                            name="endsAt"
                            defaultValue={row.ends_at?.slice(0, 16)}
                          />
                        </label>
                        <SelectField
                          name="ring"
                          label={say(locale, a.fields.ring)}
                          value={row.rollout_ring ?? "general"}
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
    </>
  );
}
