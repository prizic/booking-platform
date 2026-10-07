"use client";
import { featureLabel } from "./feature-label";
import { useActionState, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Plus, RotateCw, Trash2 } from "lucide-react";
import { formatNumber, type Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  Button,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
  Input,
  Label,
  RequiredMark,
  StatusStamp,
} from "@wlbp/ui-foundation";
import type { TenantConfigurationV1 } from "../../_lib/dashboard-access";
import { getDashboardMessage } from "../../_lib/copy";
import { settingsNavigation, settingsRoutes } from "./settings-fields";
import { saveStructuredSettingsAction } from "./actions";
import {
  CheckboxRow,
  ChoiceSelect,
  FormActions,
  keepUnsavedInput,
} from "../services/form-kit";

const panel = "grid gap-5 rounded-lg border bg-card p-5 md:p-6";

export function SettingsForm({
  locale,
  configuration,
}: {
  locale: Locale;
  configuration: TenantConfigurationV1;
}) {
  const router = useRouter();
  const id = useId();
  const [state, action, pending] = useActionState(saveStructuredSettingsAction, {});
  const [items, setItems] = useState(() =>
    settingsNavigation(configuration.navigation),
  );
  const m = (en: string, ar: string) => (locale === "ar" ? ar : en);
  useEffect(() => {
    if (state.saved) router.refresh();
  }, [state, router]);
  const currentCurrency = configuration.settings.currency;
  return (
    <form action={action} className="grid gap-6" {...keepUnsavedInput}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="expectedRevision" value={configuration.revision} />
      <FieldSet disabled={pending} className={panel}>
        <FieldLegend>
          {m("Language and customer communication", "اللغة والتواصل مع العملاء")}
        </FieldLegend>
        <FieldGroup columns={2}>
          <Field>
            <Label htmlFor={`${id}-locale`}>
              {m("Default language", "اللغة الافتراضية")}
            </Label>
            <ChoiceSelect
              id={`${id}-locale`}
              name="defaultLocale"
              defaultValue={String(
                configuration.settings.defaultLocale ?? configuration.defaultLocale,
              )}
              options={[
                { value: "ar", label: <span lang="ar">العربية</span> },
                { value: "en", label: <span lang="en">English</span> },
              ]}
            />
          </Field>
          <Field>
            <Label htmlFor={`${id}-reply-to`}>{m("Reply-to email", "بريد الرد")}</Label>
            <Input
              id={`${id}-reply-to`}
              name="replyToEmail"
              type="email"
              dir="ltr"
              defaultValue={String(configuration.settings.replyToEmail ?? "")}
              maxLength={254}
            />
          </Field>
        </FieldGroup>
      </FieldSet>
      <FieldSet disabled={pending} className={panel}>
        <FieldLegend>
          {m("Money and booking preferences", "التفضيلات المالية وتفضيلات الحجز")}
        </FieldLegend>
        <FieldGroup columns={3}>
          <Field>
            <Label htmlFor={`${id}-currency`}>{m("Currency", "العملة")}</Label>
            <ChoiceSelect
              id={`${id}-currency`}
              name="currency"
              defaultValue={String(currentCurrency ?? "USD")}
              options={[
                { value: "USD", label: <bdi>USD</bdi> },
                ...(currentCurrency && currentCurrency !== "USD"
                  ? [
                      {
                        value: String(currentCurrency),
                        label: <bdi>{String(currentCurrency)}</bdi>,
                      },
                    ]
                  : []),
              ]}
            />
          </Field>
          <Field>
            <Label htmlFor={`${id}-tax`}>
              {m("Tax rate (basis points)", "معدل الضريبة (نقاط أساس)")}
            </Label>
            <Input
              id={`${id}-tax`}
              name="taxRateBps"
              type="number"
              min={0}
              max={3000}
              step={1}
              aria-describedby={`${id}-tax-hint`}
              defaultValue={String(configuration.settings.taxRateBps ?? "")}
            />
            <FieldDescription id={`${id}-tax-hint`}>
              {m(
                `${formatNumber(100, "en")} = ${formatNumber(1, "en")}%`,
                `${formatNumber(100, "ar")} نقطة = ${formatNumber(1, "ar")}٪`,
              )}
            </FieldDescription>
          </Field>
          <Field>
            <Label htmlFor={`${id}-horizon`}>
              {m("Booking horizon preference (days)", "أفق الحجز المفضّل (بالأيام)")}
            </Label>
            <Input
              id={`${id}-horizon`}
              name="bookingHorizonDays"
              type="number"
              min={1}
              max={730}
              step={1}
              aria-describedby={`${id}-horizon-hint`}
              defaultValue={String(configuration.settings.bookingHorizonDays ?? "")}
            />
            <FieldDescription id={`${id}-horizon-hint`}>
              {m(
                `From ${formatNumber(1, "en")} to ${formatNumber(730, "en")} days.`,
                `من ${formatNumber(1, "ar")} إلى ${formatNumber(730, "ar")} يومًا.`,
              )}
            </FieldDescription>
          </Field>
        </FieldGroup>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {m(
            "Authoritative notice, slot intervals and schedule limits are managed in Availability. Saved bookings keep their snapshots.",
            "تُدار مدة الإشعار وفواصل المواعيد وحدود الجدول من صفحة التوافر. وتحتفظ الحجوزات المحفوظة بنسخها الأصلية.",
          )}
        </p>
      </FieldSet>
      <FieldSet disabled={pending} className={panel}>
        <FieldLegend>{m("Customer navigation", "روابط التنقل للعملاء")}</FieldLegend>
        <input name="navigationCount" type="hidden" value={items.length} />
        {items.map((row, index) => (
          <div
            key={row.rowKey}
            className="grid gap-4 border-b pb-5 last-of-type:border-b-0 last-of-type:pb-0"
          >
            <input name={`nav-${index}-key`} type="hidden" value={row.rowKey} />
            <FieldGroup columns={3}>
              <Field>
                <Label htmlFor={`${id}-nav-${row.rowKey}-en`}>
                  {m("English label", "التسمية بالإنجليزية")}
                  <RequiredMark />
                </Label>
                <Input
                  id={`${id}-nav-${row.rowKey}-en`}
                  name={`nav-${index}-en`}
                  defaultValue={row.label.en}
                  maxLength={160}
                  required
                  lang="en"
                  dir="ltr"
                />
              </Field>
              <Field>
                <Label htmlFor={`${id}-nav-${row.rowKey}-ar`}>
                  {m("Arabic label", "التسمية بالعربية")}
                  <RequiredMark />
                </Label>
                <Input
                  id={`${id}-nav-${row.rowKey}-ar`}
                  name={`nav-${index}-ar`}
                  defaultValue={row.label.ar}
                  maxLength={160}
                  required
                  lang="ar"
                  dir="rtl"
                />
              </Field>
              <Field>
                <Label htmlFor={`${id}-nav-${row.rowKey}-destination`}>
                  {m("Approved route or HTTPS link", "مسار معتمد أو رابط HTTPS")}
                  <RequiredMark />
                </Label>
                <Input
                  id={`${id}-nav-${row.rowKey}-destination`}
                  name={`nav-${index}-destination`}
                  defaultValue={row.route ?? row.href}
                  list="settings-route-options"
                  required
                  dir="ltr"
                />
              </Field>
            </FieldGroup>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={index === 0}
                onClick={() => {
                  const next = [...items];
                  [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                  setItems(next);
                }}
              >
                <ArrowUp aria-hidden="true" />
                {m("Move up", "نقل للأعلى")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setItems(items.filter((item) => item.rowKey !== row.rowKey))
                }
              >
                <Trash2 aria-hidden="true" />
                {m("Remove link", "إزالة الرابط")}
              </Button>
            </div>
          </div>
        ))}
        <datalist id="settings-route-options">
          {settingsRoutes.map((route) => (
            <option key={route} value={route} />
          ))}
        </datalist>
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={items.length >= 50}
            onClick={() =>
              setItems([
                ...items,
                {
                  rowKey: crypto.randomUUID(),
                  route: "/book",
                  label: { en: "", ar: "" },
                },
              ])
            }
          >
            <Plus aria-hidden="true" />
            {m("Add link", "إضافة رابط")}
          </Button>
        </div>
      </FieldSet>
      <FieldSet disabled={pending} className={panel}>
        <FieldLegend>
          {m("Features granted by your plan", "الميزات المتاحة في خطتك")}
        </FieldLegend>
        <FieldDescription className="-mt-3">
          {getDashboardMessage(locale, "settingsPlanHint")}
        </FieldDescription>
        <div className="grid gap-x-6 md:grid-cols-2">
          {Object.keys(configuration.entitlements).map((key) => (
            <CheckboxRow
              key={key}
              id={`${id}-feature-${key}`}
              name={`feature-${key}`}
              defaultChecked={
                configuration.entitlements[key] === true &&
                configuration.featureConfiguration[key]?.enabled === true
              }
              disabled={configuration.entitlements[key] !== true}
            >
              <bdi>{featureLabel(locale, key)}</bdi>
              <StatusStamp
                state={configuration.entitlements[key] ? "confirmed" : "neutral"}
              >
                {m(
                  configuration.entitlements[key] ? "Granted" : "Unavailable",
                  configuration.entitlements[key] ? "متاح" : "غير متاح",
                )}
              </StatusStamp>
            </CheckboxRow>
          ))}
        </div>
      </FieldSet>
      {state.message ? (
        <Alert tone={state.saved ? "positive" : "danger"}>
          <AlertDescription className="flex flex-wrap items-center gap-3 text-foreground">
            <span>{getDashboardMessage(locale, state.message)}</span>
            {state.message === "requestsResultConflict" ? (
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => router.refresh()}
              >
                <RotateCw aria-hidden="true" />
                {m("Reload and review", "إعادة التحميل والمراجعة")}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {state.field ? (
        <Alert tone="danger">
          <AlertDescription className="text-foreground">
            {m("Review the configuration field:", "راجع حقل الإعدادات:")}{" "}
            <bdi>{state.field}</bdi>
          </AlertDescription>
        </Alert>
      ) : null}
      <FormActions sticky>
        <Button
          type="submit"
          loading={pending}
          loadingLabel={m("Saving…", "جارٍ الحفظ…")}
        >
          {m("Save settings", "حفظ الإعدادات")}
        </Button>
      </FormActions>
    </form>
  );
}
