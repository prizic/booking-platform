import { formatNumber, type Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  Badge,
  Checkbox,
  Field,
  FieldDescription,
  Label,
  ReferenceCode,
  Textarea,
  TextField,
} from "@wlbp/ui-foundation";
import { savePlanAction } from "../../../_lib/actions/plans";
import { commercialCopy } from "../../../_lib/commercial-copy";
import { fill, say, stateCopy } from "../../../_lib/copy";
import { callOperator } from "../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../_lib/operator-page";
import { pageLocale } from "../../../_lib/page-locale";
import { PageHeader } from "../../../_lib/shell/page-header";
import { ActionDialog } from "../../../_lib/ui/action-dialog";
import { DataTable } from "../../../_lib/ui/data-table";
import { EmptyState, UnavailableState } from "../../../_lib/ui/states";
import { StatusBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const c = commercialCopy.plans;

function PlanFields({
  locale,
  plan,
}: {
  locale: Locale;
  plan?: { key: string; name: string; entitlements: string[]; active: boolean };
}) {
  const suffix = plan?.key ?? "new";
  return (
    <>
      <input type="hidden" name="mode" value={plan ? "edit" : "create"} />
      {plan ? (
        <input type="hidden" name="key" value={plan.key} />
      ) : (
        <TextField
          id="plan-key"
          name="key"
          label={say(locale, c.key)}
          description={say(locale, c.keyHint)}
          required
          minLength={2}
          maxLength={41}
          autoComplete="off"
        />
      )}
      <TextField
        id={`plan-name-${suffix}`}
        name="name"
        label={say(locale, c.name)}
        defaultValue={plan?.name}
        required
        maxLength={80}
      />
      <Field>
        <Label htmlFor={`plan-features-${suffix}`}>{say(locale, c.features)}</Label>
        <Textarea
          id={`plan-features-${suffix}`}
          name="features"
          defaultValue={plan?.entitlements.join("\n")}
          rows={6}
          dir="ltr"
          aria-describedby={`plan-features-${suffix}-hint`}
        />
        <FieldDescription id={`plan-features-${suffix}-hint`}>
          {say(locale, c.featuresHint)}
        </FieldDescription>
      </Field>
      <Field orientation="horizontal">
        <Checkbox
          id={`plan-active-${suffix}`}
          name="active"
          defaultChecked={plan?.active ?? true}
        />
        <Label htmlFor={`plan-active-${suffix}`}>{say(locale, c.active)}</Label>
      </Field>
    </>
  );
}

export default async function PlansPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = await pageLocale(params);
  const operator = await getOperator(locale);
  if (!operator) return null;
  const result = await callOperator("list_plans_v1");
  const admin = atLeast(operator.role, "admin");
  const known = result.ok
    ? [...new Set(result.data.flatMap((p) => p.entitlements))].sort()
    : [];

  return (
    <div className="grid gap-6">
      <PageHeader
        locale={locale}
        timesInUtc
        title={say(locale, c.title)}
        description={say(locale, c.description)}
        actions={
          admin ? (
            <ActionDialog
              locale={locale}
              action={savePlanAction}
              trigger={say(locale, c.create)}
              triggerVariant="primary"
              title={say(locale, c.createTitle)}
              submit={say(locale, c.create)}
              successMessage={say(locale, c.saved)}
              reason={{ minLength: 5 }}
            >
              <PlanFields locale={locale} />
            </ActionDialog>
          ) : null
        }
      />
      {!admin ? (
        <Alert>
          <AlertDescription>{say(locale, stateCopy.roleRequired)}</AlertDescription>
        </Alert>
      ) : null}
      {known.length ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {fill(locale, c.knownFeatures, { keys: known.join(", ") })}
        </p>
      ) : null}
      {!result.ok ? (
        <UnavailableState locale={locale} code={result.code} />
      ) : result.data.length === 0 ? (
        <EmptyState locale={locale} title={say(locale, c.empty)} />
      ) : (
        <DataTable
          id="plans-table"
          locale={locale}
          caption={say(locale, c.title)}
          columns={[
            { label: say(locale, c.name) },
            { label: say(locale, c.features) },
            { label: say(locale, c.subscribers), numeric: true },
            { label: say(locale, c.status) },
            { label: say(locale, c.created) },
            { label: "" },
          ]}
          rows={result.data.map((plan) => ({
            key: plan.key,
            cells: [
              <div key="n" className="grid gap-0.5">
                <span className="font-semibold text-foreground">{plan.name}</span>
                <ReferenceCode className="text-xs font-medium text-muted-foreground">
                  {plan.key}
                </ReferenceCode>
              </div>,
              <bdi key="f" className="text-muted-foreground">
                {plan.entitlements.join(", ") || say(locale, stateCopy.none)}
              </bdi>,
              formatNumber(Number(plan.subscriber_count), locale),
              plan.active ? (
                <StatusBadge key="s" locale={locale} status="active" />
              ) : (
                <Badge key="s" tone="neutral">
                  {say(locale, c.inactive)}
                </Badge>
              ),
              <TimeValue key="t" locale={locale} value={plan.created_at} />,
              admin ? (
                <ActionDialog
                  key="e"
                  locale={locale}
                  action={savePlanAction}
                  trigger={say(locale, c.edit)}
                  triggerVariant="quiet"
                  title={say(locale, c.editTitle)}
                  description={say(locale, c.editBody)}
                  submit={say(locale, c.edit)}
                  successMessage={say(locale, c.saved)}
                  reason={{ minLength: 5 }}
                >
                  <PlanFields locale={locale} plan={plan} />
                </ActionDialog>
              ) : null,
            ],
          }))}
        />
      )}
    </div>
  );
}
