import type { Locale } from "@wlbp/i18n";
import { TextField } from "@wlbp/ui-foundation";
import Link from "next/link";
import {
  requestIntegrationCheckAction,
  saveFlagAction,
  saveReferencesAction,
} from "../../../_lib/actions/settings";
import { settingsCopy as c } from "../../../_lib/admin-copy";
import { say, stateCopy } from "../../../_lib/copy";
import { callOperator, type RpcRow } from "../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../_lib/operator-page";
import { pageLocale } from "../../../_lib/page-locale";
import { PageHeader } from "../../../_lib/shell/page-header";
import { ActionDialog } from "../../../_lib/ui/action-dialog";
import { DataTable } from "../../../_lib/ui/data-table";
import { OperatorForm } from "../../../_lib/ui/operator-form";
import { SelectField } from "../../../_lib/ui/select-field";
import { EmptyState, Unknown, UnavailableState } from "../../../_lib/ui/states";
import { StatusBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";

export const dynamic = "force-dynamic";

type Flag = RpcRow<"list_platform_flags_v1">;
const kinds = [
  "feature",
  "incident_banner",
  "maintenance_window",
  "kill_switch",
] as const;

function FlagFields({ locale, flag }: { locale: Locale; flag?: Flag }) {
  return (
    <>
      {flag ? (
        <input type="hidden" name="key" value={flag.key} />
      ) : (
        <TextField
          id="flag-key"
          name="key"
          label={say(locale, c.key)}
          required
          maxLength={61}
          autoComplete="off"
        />
      )}
      <SelectField
        name="kind"
        label={say(locale, c.kind)}
        value={flag?.kind ?? "incident_banner"}
        options={kinds.map((k) => [k, say(locale, c.kinds[k])] as const)}
      />
      <label className="checkbox">
        <input type="checkbox" name="enabled" defaultChecked={flag?.enabled ?? false} />{" "}
        {say(locale, c.enabled)}
      </label>
      <label className="field">
        <span>{say(locale, c.messageEn)}</span>
        <textarea
          name="messageEn"
          lang="en"
          dir="ltr"
          maxLength={500}
          defaultValue={flag?.message_en ?? ""}
        />
      </label>
      <label className="field">
        <span>{say(locale, c.messageAr)}</span>
        <textarea
          name="messageAr"
          lang="ar"
          dir="rtl"
          maxLength={500}
          defaultValue={flag?.message_ar ?? ""}
        />
      </label>
      <div className="form-grid">
        <label className="field">
          <span>{say(locale, c.startsAt)}</span>
          <input
            type="datetime-local"
            name="startsAt"
            defaultValue={flag?.starts_at?.slice(0, 16)}
          />
        </label>
        <label className="field">
          <span>{say(locale, c.endsAt)}</span>
          <input
            type="datetime-local"
            name="endsAt"
            defaultValue={flag?.ends_at?.slice(0, 16)}
          />
        </label>
      </div>
    </>
  );
}

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = await pageLocale(params);
  const operator = await getOperator(locale);
  if (!operator) return null;
  const [flags, integrations] = await Promise.all([
    callOperator("list_platform_flags_v1"),
    callOperator("list_integrations_v1"),
  ]);
  const admin = atLeast(operator.role, "admin");
  const canQueue = atLeast(operator.role, "operator");

  return (
    <>
      <PageHeader
        locale={locale}
        title={say(locale, c.title)}
        description={say(locale, c.description)}
      />
      {!admin ? <p className="notice">{say(locale, stateCopy.roleRequired)}</p> : null}

      <section className="section" aria-labelledby="flags-title">
        <div className="section-header">
          <h2 id="flags-title">{say(locale, c.flags)}</h2>
          {admin ? (
            <ActionDialog
              locale={locale}
              action={saveFlagAction}
              trigger={say(locale, c.newFlag)}
              title={say(locale, c.flagTitle)}
              description={say(locale, c.flagBody)}
              submit={say(locale, c.newFlag)}
              successMessage={say(locale, c.flagSaved)}
              reason={{ minLength: 5 }}
            >
              <FlagFields locale={locale} />
            </ActionDialog>
          ) : null}
        </div>
        {!flags.ok ? (
          <UnavailableState locale={locale} code={flags.code} />
        ) : flags.data.length === 0 ? (
          <EmptyState locale={locale} title={say(locale, c.noFlags)} />
        ) : (
          <DataTable
            id="flags-table"
            locale={locale}
            caption={say(locale, c.flags)}
            columns={[
              { label: say(locale, c.key) },
              { label: say(locale, c.kind) },
              { label: say(locale, c.enabled) },
              { label: say(locale, c.messageEn) },
              { label: say(locale, c.endsAt) },
              { label: say(locale, c.updatedBy) },
              { label: "" },
            ]}
            rows={flags.data.map((flag) => ({
              key: flag.key,
              cells: [
                <bdi key="k">{flag.key}</bdi>,
                say(
                  locale,
                  c.kinds[flag.kind as keyof typeof c.kinds] ?? c.kinds.feature,
                ),
                say(locale, flag.enabled ? stateCopy.yes : stateCopy.no),
                flag.message_en ? (
                  <>
                    <span lang="en" dir="ltr">
                      {flag.message_en}
                    </span>
                    <span className="secondary" lang="ar" dir="rtl">
                      {flag.message_ar}
                    </span>
                  </>
                ) : (
                  <Unknown locale={locale} kind="none" />
                ),
                <TimeValue key="e" locale={locale} value={flag.ends_at} empty="none" />,
                <>
                  <bdi>{flag.updated_by_email ?? "—"}</bdi>{" "}
                  <TimeValue locale={locale} value={flag.updated_at} />
                </>,
                admin ? (
                  <ActionDialog
                    key="x"
                    locale={locale}
                    action={saveFlagAction}
                    trigger={say(locale, c.editFlag)}
                    triggerVariant="quiet"
                    title={say(locale, c.flagTitle)}
                    description={say(locale, c.flagBody)}
                    submit={say(locale, c.editFlag)}
                    successMessage={say(locale, c.flagSaved)}
                    reason={{ minLength: 5 }}
                  >
                    <FlagFields locale={locale} flag={flag} />
                  </ActionDialog>
                ) : null,
              ],
            }))}
          />
        )}
      </section>

      <section className="section" aria-labelledby="integrations-title">
        <div className="section-header">
          <h2 id="integrations-title">{say(locale, c.integrations)}</h2>
        </div>
        <p className="notice">{say(locale, c.integrationsNote)}</p>
        {!integrations.ok ? (
          <UnavailableState locale={locale} code={integrations.code} />
        ) : (
          <DataTable
            id="integrations-table"
            locale={locale}
            caption={say(locale, c.integrations)}
            columns={[
              { label: say(locale, c.provider) },
              { label: say(locale, c.status) },
              { label: say(locale, c.references) },
              { label: say(locale, c.lastCheck) },
              { label: say(locale, c.verifiedAt) },
              { label: "" },
            ]}
            rows={integrations.data.map((i) => ({
              key: i.provider,
              cells: [
                <bdi key="p">{i.provider}</bdi>,
                <>
                  <StatusBadge locale={locale} status={i.status} />
                  {i.status !== "verified" ? (
                    <span className="secondary">{say(locale, c.remaining)}</span>
                  ) : null}
                </>,
                <bdi key="r">
                  {i.secret_references.join(", ") || say(locale, stateCopy.none)}
                </bdi>,
                i.last_check_at ? (
                  <>
                    <TimeValue locale={locale} value={i.last_check_at} />{" "}
                    <bdi>
                      {i.last_check_outcome}
                      {i.last_check_error_code ? ` · ${i.last_check_error_code}` : ""}
                    </bdi>
                  </>
                ) : (
                  <Unknown locale={locale} kind="never" />
                ),
                <TimeValue key="v" locale={locale} value={i.verified_at} />,
                <div key="a" className="page-actions">
                  {i.pending_check_job_id ? (
                    <Link href={`/${locale}/jobs/${i.pending_check_job_id}`}>
                      {say(locale, c.checkPending)}
                    </Link>
                  ) : canQueue ? (
                    <OperatorForm
                      locale={locale}
                      action={requestIntegrationCheckAction}
                      submit={say(locale, c.check)}
                      successMessage={say(locale, c.checkQueued)}
                      className="inline-form"
                    >
                      <input type="hidden" name="provider" value={i.provider} />
                    </OperatorForm>
                  ) : null}
                  {admin ? (
                    <ActionDialog
                      locale={locale}
                      action={saveReferencesAction}
                      trigger={say(locale, c.editReferences)}
                      triggerVariant="quiet"
                      title={say(locale, c.referencesTitle)}
                      submit={say(locale, c.editReferences)}
                      successMessage={say(locale, c.referencesSaved)}
                      hidden={{ provider: i.provider }}
                    >
                      <label className="field">
                        <span>{say(locale, c.references)}</span>
                        <textarea
                          name="references"
                          dir="ltr"
                          rows={5}
                          defaultValue={i.secret_references.join("\n")}
                        />
                        <small>{say(locale, c.referencesHint)}</small>
                      </label>
                    </ActionDialog>
                  ) : null}
                </div>,
              ],
            }))}
          />
        )}
      </section>
    </>
  );
}
