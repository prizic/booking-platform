import type { Locale } from "@wlbp/i18n";
import { Alert, AlertDescription, FieldGroup, Section } from "@wlbp/ui-foundation";
import Link from "next/link";
import { settingsCopy as c } from "../../../_lib/admin-copy";
import { say, stateCopy } from "../../../_lib/copy";
import { callOperator, type RpcRow } from "../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../_lib/operator-page";
import { pageLocale } from "../../../_lib/page-locale";
import { PageHeader } from "../../../_lib/shell/page-header";
import { ActionDialog } from "../../../_lib/ui/action-dialog";
import { DataTable } from "../../../_lib/ui/data-table";
import {
  CheckboxFormField,
  DateTimeFormField,
  SelectFormField,
  TextFormField,
  TextareaFormField,
} from "../../../_lib/ui/form-fields";
import { OperatorForm } from "../../../_lib/ui/operator-form";
import { flagKinds } from "../../../_lib/schemas/settings";
import { EmptyState, Unknown, UnavailableState } from "../../../_lib/ui/states";
import { StatusBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";

export const dynamic = "force-dynamic";

type Flag = RpcRow<"list_platform_flags_v1">;
const kinds = flagKinds;

const linkClass = "font-semibold text-primary underline-offset-4 hover:underline";

/** Visible starting values; editing pins the key as a hidden value. */
function flagValues(flag?: Flag) {
  return {
    key: flag?.key ?? "",
    kind: flag?.kind ?? "incident_banner",
    enabled: flag?.enabled ?? false,
    messageEn: flag?.message_en ?? "",
    messageAr: flag?.message_ar ?? "",
    startsAt: flag?.starts_at?.slice(0, 16) ?? "",
    endsAt: flag?.ends_at?.slice(0, 16) ?? "",
  };
}

function FlagFields({ locale, flag }: { locale: Locale; flag?: Flag }) {
  const id = (field: string) => `flag-${flag?.key ?? "new"}-${field}`;
  return (
    <>
      {flag ? null : (
        <TextFormField
          id="flag-key"
          name="key"
          label={say(locale, c.key)}
          required
          maxLength={61}
          autoComplete="off"
        />
      )}
      <SelectFormField
        name="kind"
        label={say(locale, c.kind)}
        options={kinds.map((k) => [k, say(locale, c.kinds[k])] as const)}
      />
      <CheckboxFormField
        id={id("enabled")}
        name="enabled"
        label={say(locale, c.enabled)}
      />
      <TextareaFormField
        id={id("message-en")}
        name="messageEn"
        label={say(locale, c.messageEn)}
        lang="en"
        dir="ltr"
        maxLength={500}
      />
      <TextareaFormField
        id={id("message-ar")}
        name="messageAr"
        label={say(locale, c.messageAr)}
        lang="ar"
        dir="rtl"
        maxLength={500}
      />
      <FieldGroup columns={2}>
        <DateTimeFormField
          id={id("starts")}
          name="startsAt"
          locale={locale}
          label={say(locale, c.startsAt)}
        />
        <DateTimeFormField
          id={id("ends")}
          name="endsAt"
          locale={locale}
          label={say(locale, c.endsAt)}
        />
      </FieldGroup>
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
    <div className="grid gap-8">
      <PageHeader
        locale={locale}
        timesInUtc
        title={say(locale, c.title)}
        description={say(locale, c.description)}
      />
      {!admin ? (
        <Alert>
          <AlertDescription>{say(locale, stateCopy.roleRequired)}</AlertDescription>
        </Alert>
      ) : null}

      <Section
        id="flags"
        title={say(locale, c.flags)}
        actions={
          admin ? (
            <ActionDialog
              locale={locale}
              operation="saveFlag"
              trigger={say(locale, c.newFlag)}
              title={say(locale, c.flagTitle)}
              description={say(locale, c.flagBody)}
              submit={say(locale, c.newFlag)}
              successMessage={say(locale, c.flagSaved)}
              values={flagValues()}
            >
              <FlagFields locale={locale} />
            </ActionDialog>
          ) : null
        }
      >
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
                <bdi key="k" className="font-semibold">
                  {flag.key}
                </bdi>,
                say(
                  locale,
                  c.kinds[flag.kind as keyof typeof c.kinds] ?? c.kinds.feature,
                ),
                say(locale, flag.enabled ? stateCopy.yes : stateCopy.no),
                flag.message_en ? (
                  <div key="m" className="grid gap-0.5">
                    <span lang="en" dir="ltr">
                      {flag.message_en}
                    </span>
                    <span className="text-xs text-muted-foreground" lang="ar" dir="rtl">
                      {flag.message_ar}
                    </span>
                  </div>
                ) : (
                  <Unknown key="m" locale={locale} kind="none" />
                ),
                <TimeValue key="e" locale={locale} value={flag.ends_at} empty="none" />,
                <div key="u" className="grid gap-0.5">
                  <bdi>{flag.updated_by_email ?? "—"}</bdi>
                  <TimeValue locale={locale} value={flag.updated_at} />
                </div>,
                admin ? (
                  <ActionDialog
                    key="x"
                    locale={locale}
                    operation="saveFlag"
                    trigger={say(locale, c.editFlag)}
                    triggerVariant="quiet"
                    title={say(locale, c.flagTitle)}
                    description={say(locale, c.flagBody)}
                    submit={say(locale, c.editFlag)}
                    successMessage={say(locale, c.flagSaved)}
                    hidden={{ key: flag.key }}
                    values={flagValues(flag)}
                  >
                    <FlagFields locale={locale} flag={flag} />
                  </ActionDialog>
                ) : null,
              ],
            }))}
          />
        )}
      </Section>

      <Section id="integrations" title={say(locale, c.integrations)}>
        <Alert>
          <AlertDescription>{say(locale, c.integrationsNote)}</AlertDescription>
        </Alert>
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
                <bdi key="p" className="font-semibold">
                  {i.provider}
                </bdi>,
                <div key="s" className="grid justify-items-start gap-1">
                  <StatusBadge locale={locale} status={i.status} />
                  {i.status !== "verified" ? (
                    <span className="text-xs text-muted-foreground">
                      {say(locale, c.remaining)}
                    </span>
                  ) : null}
                </div>,
                <bdi key="r" className="text-muted-foreground">
                  {i.secret_references.join(", ") || say(locale, stateCopy.none)}
                </bdi>,
                i.last_check_at ? (
                  <div key="l" className="grid gap-0.5">
                    <TimeValue locale={locale} value={i.last_check_at} />
                    <bdi className="text-xs text-muted-foreground">
                      {i.last_check_outcome}
                      {i.last_check_error_code ? ` · ${i.last_check_error_code}` : ""}
                    </bdi>
                  </div>
                ) : (
                  <Unknown key="l" locale={locale} kind="never" />
                ),
                <TimeValue key="v" locale={locale} value={i.verified_at} />,
                <div key="a" className="flex flex-wrap items-center gap-2">
                  {i.pending_check_job_id ? (
                    <Link
                      href={`/${locale}/jobs/${i.pending_check_job_id}`}
                      className={linkClass}
                    >
                      {say(locale, c.checkPending)}
                    </Link>
                  ) : canQueue ? (
                    <OperatorForm
                      locale={locale}
                      operation="requestIntegrationCheck"
                      submit={say(locale, c.check)}
                      successMessage={say(locale, c.checkQueued)}
                      className="flex items-center"
                      hidden={{ provider: i.provider }}
                    />
                  ) : null}
                  {admin ? (
                    <ActionDialog
                      locale={locale}
                      operation="saveReferences"
                      trigger={say(locale, c.editReferences)}
                      triggerVariant="quiet"
                      title={say(locale, c.referencesTitle)}
                      submit={say(locale, c.editReferences)}
                      successMessage={say(locale, c.referencesSaved)}
                      hidden={{ provider: i.provider }}
                      values={{ references: i.secret_references.join("\n") }}
                    >
                      <TextareaFormField
                        id={`references-${i.provider}`}
                        name="references"
                        label={say(locale, c.references)}
                        description={say(locale, c.referencesHint)}
                        dir="ltr"
                        rows={5}
                      />
                    </ActionDialog>
                  ) : null}
                </div>,
              ],
            }))}
          />
        )}
      </Section>
    </div>
  );
}
