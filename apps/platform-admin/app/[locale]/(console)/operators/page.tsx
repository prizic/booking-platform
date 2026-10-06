import { TextField } from "@wlbp/ui-foundation";
import {
  addOperatorAction,
  disableOperatorAction,
  enableOperatorAction,
  setOperatorRoleAction,
} from "../../../_lib/actions/operators";
import { operatorsCopy as c } from "../../../_lib/admin-copy";
import { copyFor, roleCopy, say, stateCopy } from "../../../_lib/copy";
import { callOperator } from "../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../_lib/operator-page";
import { pageLocale } from "../../../_lib/page-locale";
import { PageHeader } from "../../../_lib/shell/page-header";
import { ActionDialog } from "../../../_lib/ui/action-dialog";
import { DataTable } from "../../../_lib/ui/data-table";
import { SelectField } from "../../../_lib/ui/select-field";
import { EmptyState, UnavailableState } from "../../../_lib/ui/states";
import { RoleBadge, StatusBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const roles = ["viewer", "operator", "admin", "break_glass"] as const;

export default async function OperatorsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = await pageLocale(params);
  const operator = await getOperator(locale);
  if (!operator) return null;
  const result = await callOperator("list_operators_v1");
  // eslint-disable-next-line react-hooks/purity -- This dynamic server page evaluates expiry once per request.
  const now = Date.now();
  const admin = atLeast(operator.role, "admin");
  const roleOptions = roles.map((r) => [r, copyFor(roleCopy, r, locale)] as const);
  const roleFields = (role?: string, expires?: string | null) => (
    <>
      <SelectField
        name="role"
        label={say(locale, c.role)}
        value={role ?? "viewer"}
        options={roleOptions}
      />
      <label className="field">
        <span>{say(locale, c.expiresAt)}</span>
        <input
          type="datetime-local"
          name="expiresAt"
          defaultValue={expires?.slice(0, 16)}
        />
        <small>{say(locale, c.expiresHint)}</small>
      </label>
    </>
  );

  return (
    <>
      <PageHeader
        locale={locale}
        title={say(locale, c.title)}
        description={say(locale, c.description)}
        actions={
          admin ? (
            <ActionDialog
              locale={locale}
              action={addOperatorAction}
              trigger={say(locale, c.add)}
              triggerVariant="primary"
              title={say(locale, c.addTitle)}
              description={say(locale, c.addBody)}
              submit={say(locale, c.add)}
              successMessage={say(locale, c.added)}
              reason={{ minLength: 5 }}
            >
              <TextField
                id="op-email"
                name="email"
                type="email"
                label={say(locale, c.email)}
                required
                autoComplete="off"
              />
              {roleFields()}
            </ActionDialog>
          ) : null
        }
      />
      <p className="notice">{say(locale, c.roles)}</p>
      {!admin ? (
        <p className="secondary">{say(locale, stateCopy.roleRequired)}</p>
      ) : null}
      {!result.ok ? (
        <UnavailableState locale={locale} code={result.code} />
      ) : result.data.length === 0 ? (
        <EmptyState locale={locale} />
      ) : (
        <DataTable
          id="operators-table"
          locale={locale}
          caption={say(locale, c.title)}
          columns={[
            { label: say(locale, c.email) },
            { label: say(locale, c.role) },
            { label: say(locale, c.mfa) },
            { label: say(locale, c.status) },
            { label: say(locale, c.expires) },
            { label: say(locale, c.lastSignIn) },
            { label: say(locale, c.actions) },
          ]}
          rows={result.data.map((row) => {
            const self = row.operator_id === operator.operatorId;
            const expired =
              row.expires_at !== null && new Date(row.expires_at).getTime() <= now;
            const state = row.disabled_at ? "disabled" : expired ? "expired" : "active";
            return {
              key: row.operator_id,
              cells: [
                <>
                  <bdi>{row.email}</bdi>
                  {self ? <> {say(locale, c.you)}</> : null}
                  {row.usable_admin ? (
                    <span className="secondary">{say(locale, c.usable)}</span>
                  ) : null}
                </>,
                <RoleBadge key="r" locale={locale} role={row.role} />,
                say(locale, row.mfa_verified ? c.verified : c.missing),
                <StatusBadge key="s" locale={locale} status={state} />,
                <TimeValue
                  key="e"
                  locale={locale}
                  value={row.expires_at}
                  empty="none"
                />,
                <TimeValue key="l" locale={locale} value={row.last_sign_in_at} />,
                admin ? (
                  <div key="a" className="page-actions">
                    <ActionDialog
                      locale={locale}
                      action={setOperatorRoleAction}
                      trigger={say(locale, c.changeRole)}
                      triggerVariant="quiet"
                      title={say(locale, c.changeRoleTitle)}
                      submit={say(locale, c.changeRole)}
                      successMessage={say(locale, c.roleChanged)}
                      reason={{ minLength: 5 }}
                      hidden={{ operatorId: row.operator_id }}
                    >
                      {roleFields(row.role, row.expires_at)}
                    </ActionDialog>
                    {row.disabled_at ? (
                      <ActionDialog
                        locale={locale}
                        action={enableOperatorAction}
                        trigger={say(locale, c.enable)}
                        triggerVariant="quiet"
                        title={say(locale, c.enableTitle)}
                        submit={say(locale, c.enable)}
                        successMessage={say(locale, c.enabled)}
                        reason={{ minLength: 5 }}
                        hidden={{ operatorId: row.operator_id }}
                      />
                    ) : (
                      <ActionDialog
                        locale={locale}
                        action={disableOperatorAction}
                        trigger={say(locale, c.disable)}
                        triggerVariant="quiet"
                        danger
                        title={say(locale, c.disableTitle)}
                        description={say(locale, c.disableBody)}
                        submit={say(locale, c.disable)}
                        successMessage={say(locale, c.disabled)}
                        reason={{ minLength: 5 }}
                        hidden={{ operatorId: row.operator_id }}
                      />
                    )}
                  </div>
                ) : null,
              ],
            };
          })}
        />
      )}
    </>
  );
}
