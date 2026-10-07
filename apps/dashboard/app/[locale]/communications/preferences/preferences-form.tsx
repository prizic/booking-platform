"use client";
import type { Control } from "react-hook-form";
import type {
  MyNotificationPreferencesV1,
  NotificationTemplateKeyV1,
} from "@wlbp/api-contracts";
import type { Locale } from "@wlbp/i18n";
import {
  Button,
  FieldLegend,
  FieldSet,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Switch,
  TimeSelect,
  applyActionErrors,
  useActionMutation,
  useZodForm,
} from "@wlbp/ui-foundation";
import {
  notificationFormMessages,
  notificationText,
  templateDescription,
  templateLabel,
} from "../../../_lib/notification-copy";
import { FormActions } from "../../services/form-kit";
import { newAttemptId, useAuthoritativeDefaults } from "../../services/form-hooks";
import { MutationFeedback } from "../../services/mutation-feedback";
import { saveMyNotificationPreferencesAction } from "./actions";
import {
  myPreferencesSchema,
  staffAlertKeys,
  type MyPreferencesInput,
} from "./preferences-schema";
import { dashboardToast } from "../../../_lib/ui/use-workspace-mutation";

const panel = "grid gap-4 rounded-lg border bg-card p-5 md:p-6";

type PreferencesControl = Control<MyPreferencesInput>;

export function myPreferencesDefaults(
  locale: Locale,
  preferences: MyNotificationPreferencesV1,
  attempt: string,
): MyPreferencesInput {
  const enabled = new Map(
    preferences.items.map((item) => [item.templateKey, item.enabled]),
  );
  return {
    locale,
    requestId: attempt,
    alerts: staffAlertKeys
      .filter((key) => enabled.has(key))
      .map((key) => ({ templateKey: key, enabled: enabled.get(key) === true })),
    digestEnabled: enabled.get("staff.daily_digest") === true,
    digestLocalTime: preferences.digestLocalTime,
  };
}

/** A switch row: the label and its explanation at the start, the switch at the end. */
function PreferenceSwitch({
  control,
  name,
  htmlName,
  label,
  description,
  note,
  disabled,
}: {
  readonly control: PreferencesControl;
  readonly name: `alerts.${number}.enabled` | "digestEnabled";
  readonly htmlName: string;
  readonly label: string;
  readonly description: string;
  readonly note?: string | null;
  readonly disabled: boolean;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 px-5 py-4">
          <div className="grid min-w-0 flex-1 basis-56 gap-1">
            <FormLabel className="font-medium">{label}</FormLabel>
            <FormDescription>
              {description}
              {note ? (
                <>
                  {" "}
                  <span className="font-medium text-foreground">{note}</span>
                </>
              ) : null}
            </FormDescription>
            <FormMessage />
          </div>
          <FormControl>
            <Switch
              ref={field.ref}
              name={htmlName}
              className="mt-2"
              checked={field.value === true}
              onCheckedChange={(checked) => field.onChange(checked)}
              onBlur={field.onBlur}
              disabled={disabled}
            />
          </FormControl>
        </FormItem>
      )}
    />
  );
}

export function MyPreferencesForm({
  locale,
  preferences,
  attempt,
}: {
  readonly locale: Locale;
  readonly preferences: MyNotificationPreferencesV1;
  readonly attempt: string;
}) {
  const t = (
    key: Parameters<typeof notificationText>[1],
    values?: Record<string, string>,
  ) => notificationText(locale, key, values);
  const messages = notificationFormMessages(locale);
  const defaults = myPreferencesDefaults(locale, preferences, attempt);
  const form = useZodForm(myPreferencesSchema, { defaultValues: defaults });
  useAuthoritativeDefaults(form, defaults);
  const control = form.control as unknown as PreferencesControl;
  const tenantEnabled = new Map<string, boolean>(
    preferences.items.map((item) => [item.templateKey, item.tenantEnabled]),
  );
  const mutation = useActionMutation(saveMyNotificationPreferencesAction, {
    toast: dashboardToast(locale, { messages, success: t("prefsSaved") }),
    onFailure: (result) => applyActionErrors(form, result),
    onSuccess: () => form.setValue("requestId", newAttemptId()),
  });
  const pending = mutation.isPending;
  const digestEnabled = form.watch("digestEnabled");
  const [zoneBefore = "", zoneAfter = ""] = t("prefsDigestZone").split("{zone}");
  const digestOff = tenantEnabled.get("staff.daily_digest") === false;
  const offNote = (key: NotificationTemplateKeyV1) =>
    tenantEnabled.get(key) === false ? t("prefsTurnedOffByBusiness") : null;

  return (
    <Form form={form} locale={locale} messages={messages}>
      <form
        noValidate
        className="grid gap-6"
        onSubmit={form.handleSubmit(() => mutation.mutate(form.getValues()))}
      >
        <FieldSet disabled={pending} className={panel}>
          <FieldLegend>{t("prefsAlertsLegend")}</FieldLegend>
          <div className="-mx-5 grid divide-y border-t md:-mx-6">
            {defaults.alerts.map((alert, index) => {
              const key = alert.templateKey as NotificationTemplateKeyV1;
              return (
                <PreferenceSwitch
                  key={key}
                  control={control}
                  name={`alerts.${index}.enabled`}
                  htmlName={`preference-${key}`}
                  label={templateLabel(locale, key)}
                  description={templateDescription(locale, key)}
                  note={offNote(key)}
                  disabled={tenantEnabled.get(key) === false}
                />
              );
            })}
          </div>
        </FieldSet>
        <FieldSet disabled={pending} className={panel}>
          <FieldLegend>{t("prefsDigestLegend")}</FieldLegend>
          <div className="-mx-5 grid border-t md:-mx-6">
            <PreferenceSwitch
              control={control}
              name="digestEnabled"
              htmlName="preference-staff.daily_digest"
              label={t("prefsDigestSwitch")}
              description={templateDescription(locale, "staff.daily_digest")}
              note={offNote("staff.daily_digest")}
              disabled={digestOff}
            />
          </div>
          <FormField
            control={control}
            name="digestLocalTime"
            render={({ field }) => (
              <FormItem className="sm:max-w-xs">
                <FormLabel>{t("prefsDigestTime")}</FormLabel>
                <FormControl>
                  <TimeSelect
                    ref={field.ref}
                    name="digest-local-time"
                    locale={locale}
                    value={String(field.value ?? "")}
                    onValueChange={field.onChange}
                    placeholder={t("timePlaceholder")}
                    disabled={pending || digestOff || digestEnabled !== true}
                  />
                </FormControl>
                <FormDescription>
                  {zoneBefore}
                  <bdi dir="ltr">{preferences.digestTimeZone}</bdi>
                  {zoneAfter}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </FieldSet>
        <MutationFeedback
          locale={locale}
          messages={messages}
          result={mutation.data}
          transportFailed={mutation.isError}
          success={t("prefsSaved")}
        />
        <FormActions sticky>
          <Button type="submit" loading={pending} loadingLabel={t("saving")}>
            {t("prefsSave")}
          </Button>
        </FormActions>
      </form>
    </Form>
  );
}
