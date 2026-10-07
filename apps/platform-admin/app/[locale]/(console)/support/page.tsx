import {
  Alert,
  AlertDescription,
  Field,
  FieldDescription,
  Input,
  Label,
  ReferenceCode,
  RequiredMark,
  TextField,
} from "@wlbp/ui-foundation";
import Link from "next/link";
import { actionCopy as a } from "../../../_lib/action-copy";
import {
  approveSupportAction,
  requestSupportAction,
  revokeSupportAction,
} from "../../../_lib/actions/support";
import { copyFor, formCopy, say, statusCopy } from "../../../_lib/copy";
import { supportCopy as c } from "../../../_lib/health-support-copy";
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

const statuses = ["pending", "active", "expired", "revoked"] as const;
const spec = { filters: { status: statuses, tenant: "uuid" }, pageSize: 25 } as const;

export default async function SupportPage({
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
  const path = `/${locale}/support`;
  const operatorRole = atLeast(operator.role, "operator");
  const [result, tenants] = await Promise.all([
    callOperator("list_support_grants_v2", {
      p_status: list.filters.status,
      p_tenant_id: list.filters.tenant,
      p_limit: list.pageSize,
      p_offset: list.offset,
    }),
    operatorRole
      ? callOperator("list_tenants_v1", {
          p_status: "active",
          p_sort: "name",
          p_limit: 100,
        })
      : null,
  ]);

  return (
    <div className="grid gap-6">
      <PageHeader
        locale={locale}
        timesInUtc
        title={say(locale, c.title)}
        description={say(locale, c.description)}
        actions={
          operatorRole && tenants?.ok && tenants.data.length ? (
            <ActionDialog
              locale={locale}
              action={requestSupportAction}
              trigger={say(locale, a.requestSupport.trigger)}
              triggerVariant="primary"
              title={say(locale, a.requestSupport.title)}
              description={say(locale, a.requestSupport.body)}
              submit={say(locale, a.requestSupport.submit)}
              successMessage={say(locale, a.requestSupport.done)}
              reason={{ minLength: 10 }}
            >
              <SelectField
                name="tenantId"
                label={say(locale, c.tenantField)}
                value={list.filters.tenant}
                options={tenants.data.map((t) => [t.tenant_id, t.name] as const)}
              />
              <TextField
                id="support-ticket"
                name="ticket"
                label={say(locale, a.fields.ticket)}
                required
                maxLength={120}
              />
              <Field>
                <Label htmlFor="support-minutes">
                  {say(locale, a.fields.minutes)}
                  <RequiredMark />
                </Label>
                <Input
                  id="support-minutes"
                  type="number"
                  name="minutes"
                  min={5}
                  max={480}
                  defaultValue={60}
                  required
                  aria-describedby="support-minutes-hint"
                />
                <FieldDescription id="support-minutes-hint">
                  {say(locale, a.fields.minutesHint)}
                </FieldDescription>
              </Field>
            </ActionDialog>
          ) : null
        }
      />
      <Alert>
        <AlertDescription>{say(locale, c.rules)}</AlertDescription>
      </Alert>
      <FilterBar locale={locale} path={path}>
        <SelectFilter
          name="status"
          label={say(locale, c.status)}
          value={list.filters.status}
          allLabel={say(locale, formCopy.all)}
          options={statuses.map((s) => [s, copyFor(statusCopy, s, locale)] as const)}
        />
        {list.filters.tenant ? (
          <input type="hidden" name="tenant" value={list.filters.tenant} />
        ) : null}
      </FilterBar>
      {!result.ok ? (
        <UnavailableState locale={locale} code={result.code} />
      ) : result.data.length === 0 ? (
        <EmptyState locale={locale} filtered={Object.keys(list.filters).length > 0} />
      ) : (
        <>
          <DataTable
            id="grants-table"
            locale={locale}
            caption={say(locale, c.title)}
            columns={[
              { label: say(locale, c.tenant) },
              { label: say(locale, c.status) },
              { label: say(locale, c.ticket) },
              { label: say(locale, c.requestedBy) },
              { label: say(locale, c.approvedBy) },
              { label: say(locale, c.scope) },
              { label: say(locale, c.expires) },
              { label: say(locale, c.actions) },
            ]}
            rows={result.data.map((g) => ({
              key: g.grant_id,
              cells: [
                <Link
                  key="t"
                  href={`/${locale}/tenants/${g.tenant_id}#support`}
                  className="font-semibold text-primary underline-offset-4 hover:underline"
                >
                  <bdi>{g.tenant_name}</bdi>
                </Link>,
                <StatusBadge key="s" locale={locale} status={g.status} />,
                <div key="k" className="grid gap-0.5">
                  <ReferenceCode>{g.ticket_reference}</ReferenceCode>
                  <span className="text-xs text-muted-foreground">{g.reason}</span>
                </div>,
                <bdi key="r">{g.requested_by_email ?? "—"}</bdi>,
                g.approved_by_email ? (
                  <bdi key="a">{g.approved_by_email}</bdi>
                ) : (
                  <Unknown key="a" locale={locale} kind="none" />
                ),
                say(locale, c.readOnly),
                <TimeValue key="e" locale={locale} value={g.expires_at} empty="none" />,
                <div key="x" className="flex flex-wrap items-center gap-2">
                  {g.status === "pending" && atLeast(operator.role, "admin") ? (
                    <ActionDialog
                      locale={locale}
                      action={approveSupportAction}
                      trigger={say(locale, c.approve)}
                      triggerVariant="quiet"
                      title={say(locale, c.approveTitle)}
                      description={say(locale, c.approveBody)}
                      submit={say(locale, c.approve)}
                      successMessage={say(locale, c.approved)}
                      hidden={{ grantId: g.grant_id, tenantId: g.tenant_id }}
                    >
                      <Field>
                        <Label htmlFor={`approve-minutes-${g.grant_id}`}>
                          {say(locale, c.duration)}
                          <RequiredMark />
                        </Label>
                        <Input
                          id={`approve-minutes-${g.grant_id}`}
                          type="number"
                          name="minutes"
                          min={5}
                          max={480}
                          defaultValue={60}
                          required
                        />
                      </Field>
                    </ActionDialog>
                  ) : null}
                  {(g.status === "pending" || g.status === "active") && operatorRole ? (
                    <ActionDialog
                      locale={locale}
                      action={revokeSupportAction}
                      trigger={say(locale, c.revoke)}
                      triggerVariant="quiet"
                      danger
                      title={say(locale, c.revokeTitle)}
                      submit={say(locale, c.revoke)}
                      successMessage={say(locale, c.revoked)}
                      reason={{ minLength: 5 }}
                      hidden={{ grantId: g.grant_id, tenantId: g.tenant_id }}
                    />
                  ) : null}
                </div>,
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
