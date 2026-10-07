"use client";
import { featureLabel } from "./feature-label";
import { useRouter } from "next/navigation";
import { ArrowUp, Plus, Trash2 } from "lucide-react";
import { useFieldArray } from "react-hook-form";
import { formatNumber, type Locale } from "@wlbp/i18n";
import {
  Button,
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
  Form,
  StatusStamp,
  applyActionErrors,
  useActionMutation,
  useZodForm,
} from "@wlbp/ui-foundation";
import type { TenantConfigurationV1 } from "../../_lib/dashboard-access";
import { getDashboardMessage, type DashboardMessageKey } from "../../_lib/copy";
import { settingsNavigation } from "./settings-document";
import { settingsRoutes, settingsSchema, type SettingsInput } from "./settings-schema";
import { saveStructuredSettingsAction } from "./actions";
import { FormActions } from "../services/form-kit";
import { CheckboxField, SelectField, TextField } from "../services/form-fields";
import { newAttemptId, useAuthoritativeDefaults } from "../services/form-hooks";
import { MutationFeedback } from "../services/mutation-feedback";
import { dashboardFormMessages } from "../../_lib/form-messages";
import { dashboardToast } from "../../_lib/ui/use-workspace-mutation";

const panel = "grid gap-5 rounded-lg border bg-card p-5 md:p-6";

const errorKeys = [
  "requestsResultInvalid",
  "requestsResultNotAuthorized",
  "requestsResultConflict",
  "requestsResultUnavailable",
  "settingsUnavailable",
  "settingsResultInvalid",
  "brandResultUnsafe",
] as const satisfies readonly DashboardMessageKey[];

/** The editor's values for the stored configuration, as the controls hold them. */
export function settingsDefaults(
  locale: Locale,
  configuration: TenantConfigurationV1,
): SettingsInput {
  const settings = configuration.settings;
  return {
    locale,
    expectedRevision: String(configuration.revision),
    defaultLocale: String(
      settings.defaultLocale ?? configuration.defaultLocale,
    ) as SettingsInput["defaultLocale"],
    replyToEmail: String(settings.replyToEmail ?? ""),
    currency: String(settings.currency ?? "USD"),
    taxRateBps: String(settings.taxRateBps ?? ""),
    bookingHorizonDays: String(settings.bookingHorizonDays ?? ""),
    navigation: settingsNavigation(configuration.navigation).map((row) => ({
      rowKey: row.rowKey,
      en: row.label.en,
      ar: row.label.ar,
      destination: row.route ?? row.href ?? "",
    })),
    features: Object.keys(configuration.entitlements).map((key) => ({
      key,
      enabled:
        configuration.entitlements[key] === true &&
        configuration.featureConfiguration[key]?.enabled === true,
    })),
  };
}

export function SettingsForm({
  locale,
  configuration,
}: {
  locale: Locale;
  configuration: TenantConfigurationV1;
}) {
  const router = useRouter();
  const m = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const messages = {
    ...dashboardFormMessages(locale),
    ...Object.fromEntries(
      errorKeys.map((key) => [key, getDashboardMessage(locale, key)]),
    ),
    invalid: getDashboardMessage(locale, "settingsResultInvalid"),
    settings_destination_invalid: m(
      "Choose an approved route or enter an https:// link.",
      "اختر مسارًا معتمدًا أو أدخل رابطًا يبدأ بـ https://.",
    ),
  };
  const defaults = settingsDefaults(locale, configuration);
  const form = useZodForm(settingsSchema, { defaultValues: defaults });
  useAuthoritativeDefaults(form, defaults);
  const control = form.control;
  const items = useFieldArray({ control, name: "navigation", keyName: "fieldId" });
  const mutation = useActionMutation(saveStructuredSettingsAction, {
    toast: dashboardToast(locale, {
      messages,
      success: (data) =>
        data === undefined
          ? getDashboardMessage(locale, "settingsResultSaved")
          : getDashboardMessage(locale, data.message),
    }),
    onFailure: (result) => applyActionErrors(form, result),
  });
  const pending = mutation.isPending;
  const currentCurrency = configuration.settings.currency;
  return (
    <Form form={form} locale={locale} messages={messages}>
      <form
        noValidate
        className="grid gap-6"
        onSubmit={form.handleSubmit(() => mutation.mutate(form.getValues()))}
      >
        <FieldSet disabled={pending} className={panel}>
          <FieldLegend>
            {m("Language and customer communication", "اللغة والتواصل مع العملاء")}
          </FieldLegend>
          <FieldGroup columns={2}>
            <SelectField
              control={control}
              name="defaultLocale"
              label={m("Default language", "اللغة الافتراضية")}
              options={[
                { value: "ar", label: <span lang="ar">العربية</span> },
                { value: "en", label: <span lang="en">English</span> },
              ]}
            />
            <TextField
              control={control}
              name="replyToEmail"
              label={m("Reply-to email", "بريد الرد")}
              type="email"
              dir="ltr"
              maxLength={254}
            />
          </FieldGroup>
        </FieldSet>
        <FieldSet disabled={pending} className={panel}>
          <FieldLegend>
            {m("Money and booking preferences", "التفضيلات المالية وتفضيلات الحجز")}
          </FieldLegend>
          <FieldGroup columns={3}>
            <SelectField
              control={control}
              name="currency"
              label={m("Currency", "العملة")}
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
            <TextField
              control={control}
              name="taxRateBps"
              label={m("Tax rate (basis points)", "معدل الضريبة (نقاط أساس)")}
              type="number"
              min={0}
              max={3000}
              step={1}
              description={m(
                `${formatNumber(100, "en")} = ${formatNumber(1, "en")}%`,
                `${formatNumber(100, "ar")} نقطة = ${formatNumber(1, "ar")}٪`,
              )}
            />
            <TextField
              control={control}
              name="bookingHorizonDays"
              label={m(
                "Booking horizon preference (days)",
                "أفق الحجز المفضّل (بالأيام)",
              )}
              type="number"
              min={1}
              max={730}
              step={1}
              description={m(
                `From ${formatNumber(1, "en")} to ${formatNumber(730, "en")} days.`,
                `من ${formatNumber(1, "ar")} إلى ${formatNumber(730, "ar")} يومًا.`,
              )}
            />
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
          {items.fields.map((row, index) => (
            <div
              key={row.fieldId}
              className="grid gap-4 border-b pb-5 last-of-type:border-b-0 last-of-type:pb-0"
            >
              <FieldGroup columns={3}>
                <TextField
                  control={control}
                  name={`navigation.${index}.en`}
                  htmlName={`nav-${index}-en`}
                  label={m("English label", "التسمية بالإنجليزية")}
                  required
                  maxLength={160}
                  lang="en"
                  dir="ltr"
                />
                <TextField
                  control={control}
                  name={`navigation.${index}.ar`}
                  htmlName={`nav-${index}-ar`}
                  label={m("Arabic label", "التسمية بالعربية")}
                  required
                  maxLength={160}
                  lang="ar"
                  dir="rtl"
                />
                <TextField
                  control={control}
                  name={`navigation.${index}.destination`}
                  htmlName={`nav-${index}-destination`}
                  label={m("Approved route or HTTPS link", "مسار معتمد أو رابط HTTPS")}
                  required
                  list="settings-route-options"
                  dir="ltr"
                />
              </FieldGroup>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={index === 0}
                  onClick={() => items.swap(index - 1, index)}
                >
                  <ArrowUp aria-hidden="true" />
                  {m("Move up", "نقل للأعلى")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => items.remove(index)}
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
              disabled={items.fields.length >= 50}
              onClick={() =>
                items.append({
                  rowKey: newAttemptId(),
                  en: "",
                  ar: "",
                  destination: "/book",
                })
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
            {defaults.features.map((feature, index) => (
              <CheckboxField
                key={feature.key}
                control={control}
                name={`features.${index}.enabled`}
                htmlName={`feature-${feature.key}`}
                disabled={configuration.entitlements[feature.key] !== true}
                label={
                  <>
                    <bdi>{featureLabel(locale, feature.key)}</bdi>
                    <StatusStamp
                      state={
                        configuration.entitlements[feature.key]
                          ? "confirmed"
                          : "neutral"
                      }
                    >
                      {m(
                        configuration.entitlements[feature.key]
                          ? "Granted"
                          : "Unavailable",
                        configuration.entitlements[feature.key] ? "متاح" : "غير متاح",
                      )}
                    </StatusStamp>
                  </>
                }
              />
            ))}
          </div>
        </FieldSet>
        <MutationFeedback
          locale={locale}
          messages={messages}
          result={mutation.data}
          transportFailed={mutation.isError}
          success={
            mutation.data?.ok
              ? getDashboardMessage(locale, mutation.data.data.message)
              : null
          }
          reload={{
            codes: ["requestsResultConflict"],
            label: m("Reload and review", "إعادة التحميل والمراجعة"),
            onReload: () => router.refresh(),
          }}
        />
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
    </Form>
  );
}
