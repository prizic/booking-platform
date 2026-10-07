"use client";
import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Control } from "react-hook-form";
import { Eye, Plus, X } from "lucide-react";
import type {
  NotificationSettingItemV1,
  NotificationSettingsV1,
  NotificationTemplateKeyV1,
} from "@wlbp/api-contracts";
import type { Locale } from "@wlbp/i18n";
import {
  Button,
  FieldDescription,
  FieldError,
  FieldLegend,
  FieldSet,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Label,
  StatusStamp,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
  applyActionErrors,
  formErrorMessage,
  useActionMutation,
  useZodForm,
} from "@wlbp/ui-foundation";
import {
  formatLeadTime,
  notificationFormMessages,
  notificationText,
  templateDescription,
  templateLabel,
} from "../../../_lib/notification-copy";
import { FormActions } from "../../services/form-kit";
import { newAttemptId, useAuthoritativeDefaults } from "../../services/form-hooks";
import { MutationFeedback } from "../../services/mutation-feedback";
import { saveNotificationSettingsAction } from "./actions";
import { EmailPreviewDialog } from "./email-preview-dialog";
import {
  notificationSettingsSchema,
  parseCustomLeadTime,
  reminderPresetMinutes,
  type NotificationSettingsInput,
} from "./notification-settings-schema";
import { dashboardToast } from "../../../_lib/ui/use-workspace-mutation";

const panel = "grid gap-4 rounded-lg border bg-card p-5 md:p-6";
const linkClass = "font-semibold text-primary underline-offset-4 hover:underline";

type SettingsControl = Control<NotificationSettingsInput>;

export function notificationSettingsDefaults(
  locale: Locale,
  settings: NotificationSettingsV1,
  attempt: string,
): NotificationSettingsInput {
  return {
    locale,
    expectedRevision: settings.revision,
    requestId: attempt,
    items: settings.items.map((item) => ({
      templateKey: item.templateKey,
      emailEnabled: item.emailEnabled,
      whatsappEnabled: item.whatsappEnabled,
    })),
    reminderOffsets: [...settings.reminderOffsetsMinutes],
  };
}

/** One channel switch with a visible label that also names the message. */
function ChannelSwitch({
  control,
  index,
  channel,
  label,
  messageName,
  disabled,
}: {
  readonly control: SettingsControl;
  readonly index: number;
  readonly channel: "emailEnabled" | "whatsappEnabled";
  readonly label: string;
  readonly messageName: string;
  readonly disabled: boolean;
}) {
  return (
    <FormField
      control={control}
      name={`items.${index}.${channel}`}
      render={({ field }) => (
        <FormItem className="flex min-h-11 items-center gap-2">
          <FormControl>
            <Switch
              ref={field.ref}
              name={`${channel === "emailEnabled" ? "email" : "whatsapp"}-${index}`}
              checked={field.value === true}
              onCheckedChange={(checked) => field.onChange(checked)}
              onBlur={field.onBlur}
              disabled={disabled}
            />
          </FormControl>
          <FormLabel className="font-medium">
            {label}
            <span className="sr-only"> — {messageName}</span>
          </FormLabel>
        </FormItem>
      )}
    />
  );
}

function MessageRow({
  locale,
  control,
  item,
  index,
  whatsappAvailable,
  onPreview,
}: {
  readonly locale: Locale;
  readonly control: SettingsControl;
  readonly item: NotificationSettingItemV1;
  readonly index: number;
  readonly whatsappAvailable: boolean;
  readonly onPreview: (key: NotificationTemplateKeyV1) => void;
}) {
  const t = (
    key: Parameters<typeof notificationText>[1],
    values?: Record<string, string>,
  ) => notificationText(locale, key, values);
  const name = templateLabel(locale, item.templateKey);
  return (
    <li
      className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4"
      data-template-key={item.templateKey}
    >
      <div className="grid min-w-0 flex-1 basis-64 gap-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          <span>{name}</span>
          {item.editable ? null : (
            <StatusStamp state="neutral">{t("alwaysSent")}</StatusStamp>
          )}
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {templateDescription(locale, item.templateKey)}
        </p>
        {item.editable ? null : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t(
              item.templateKey.startsWith("auth.")
                ? "alwaysSentAuth"
                : "alwaysSentBooking",
            )}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <ChannelSwitch
          control={control}
          index={index}
          channel="emailEnabled"
          label={t("columnEmail")}
          messageName={name}
          disabled={!item.editable}
        />
        {whatsappAvailable ? (
          item.whatsappCapable ? (
            <ChannelSwitch
              control={control}
              index={index}
              channel="whatsappEnabled"
              label={t("columnWhatsApp")}
              messageName={name}
              disabled={false}
            />
          ) : (
            <span className="text-sm text-muted-foreground">
              {t("whatsappNotCapable")}
            </span>
          )
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={() => onPreview(item.templateKey)}
        >
          <Eye aria-hidden="true" />
          {t("previewAction")}
          <span className="sr-only"> — {name}</span>
        </Button>
      </div>
    </li>
  );
}

/** 1–4 lead times: presets as a multi-select toggle group, plus custom minutes. */
function ReminderOffsetsField({
  locale,
  control,
  messages,
  disabled,
}: {
  readonly locale: Locale;
  readonly control: SettingsControl;
  readonly messages: Readonly<Record<string, string>>;
  readonly disabled: boolean;
}) {
  const t = (
    key: Parameters<typeof notificationText>[1],
    values?: Record<string, string>,
  ) => notificationText(locale, key, values);
  const id = useId();
  const [custom, setCustom] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  return (
    <FormField
      control={control}
      name="reminderOffsets"
      render={({ field }) => {
        const chosen: number[] = Array.isArray(field.value) ? field.value : [];
        const sorted = [...chosen].sort((a, b) => a - b);
        const full = chosen.length >= 4;
        const set = (next: number[]) => field.onChange(next.sort((a, b) => b - a));
        const addCustom = () => {
          const parsed = parseCustomLeadTime(custom);
          if (!parsed.ok) return setCustomError(parsed.code);
          if (chosen.includes(parsed.minutes))
            return setCustomError("reminder_offset_duplicate");
          if (full) return setCustomError("reminder_offsets_too_many");
          setCustomError(null);
          setCustom("");
          set([...chosen, parsed.minutes]);
        };
        return (
          <FormItem className="gap-5">
            <div className="grid gap-2">
              <p id={`${id}-presets`} className="text-sm font-medium">
                {t("remindersPresets")}
              </p>
              <FormControl>
                <ToggleGroup
                  type="multiple"
                  aria-labelledby={`${id}-presets`}
                  value={chosen.map(String)}
                  disabled={disabled}
                  onValueChange={(values) => {
                    const presets = new Set<number>(reminderPresetMinutes);
                    set([
                      ...chosen.filter((value) => !presets.has(value)),
                      ...values.map(Number).filter((value) => presets.has(value)),
                    ]);
                  }}
                >
                  {reminderPresetMinutes.map((minutes) => (
                    <ToggleGroupItem
                      key={minutes}
                      value={String(minutes)}
                      className="min-h-11"
                      disabled={full && !chosen.includes(minutes)}
                    >
                      {formatLeadTime(minutes, locale)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </FormControl>
            </div>
            <div className="grid gap-2">
              <p id={`${id}-chosen`} className="text-sm font-medium">
                {t("remindersChosen")}
              </p>
              {sorted.length ? (
                <ul aria-labelledby={`${id}-chosen`} className="flex flex-wrap gap-2">
                  {sorted.map((minutes) => {
                    const value = formatLeadTime(minutes, locale);
                    return (
                      <li
                        key={minutes}
                        className="inline-flex items-center gap-1 rounded-full border bg-primary-soft ps-3 text-sm font-medium"
                      >
                        {t("remindersBefore", { value })}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="size-11 rounded-full"
                          disabled={disabled}
                          aria-label={t("remindersRemove", { value })}
                          onClick={() =>
                            set(chosen.filter((entry) => entry !== minutes))
                          }
                        >
                          <X aria-hidden="true" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("remindersNone")}</p>
              )}
            </div>
            <div className="grid gap-2 sm:max-w-md">
              <Label htmlFor={`${id}-custom`}>{t("remindersCustom")}</Label>
              <div className="flex gap-2">
                <Input
                  id={`${id}-custom`}
                  name="reminder-custom-minutes"
                  type="number"
                  inputMode="numeric"
                  dir="ltr"
                  min={15}
                  max={10080}
                  step={1}
                  value={custom}
                  disabled={disabled}
                  aria-invalid={customError ? true : undefined}
                  aria-describedby={`${id}-custom-hint${customError ? ` ${id}-custom-error` : ""}`}
                  onChange={(event) => setCustom(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addCustom();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled || full}
                  onClick={addCustom}
                >
                  <Plus aria-hidden="true" />
                  {t("remindersAdd")}
                </Button>
              </div>
              <FieldDescription id={`${id}-custom-hint`}>
                {messages.remindersCustomHint}
              </FieldDescription>
              <FieldError id={`${id}-custom-error`}>
                {customError ? formErrorMessage(customError, locale, messages) : null}
              </FieldError>
            </div>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

export function NotificationSettingsForm({
  locale,
  settings,
  attempt,
}: {
  readonly locale: Locale;
  readonly settings: NotificationSettingsV1;
  readonly attempt: string;
}) {
  const router = useRouter();
  const t = (
    key: Parameters<typeof notificationText>[1],
    values?: Record<string, string>,
  ) => notificationText(locale, key, values);
  const messages = notificationFormMessages(locale);
  const defaults = notificationSettingsDefaults(locale, settings, attempt);
  const form = useZodForm(notificationSettingsSchema, { defaultValues: defaults });
  useAuthoritativeDefaults(form, defaults);
  const control = form.control as unknown as SettingsControl;
  const [preview, setPreview] = useState<NotificationTemplateKeyV1 | null>(null);
  const mutation = useActionMutation(saveNotificationSettingsAction, {
    toast: dashboardToast(locale, { messages, success: t("settingsSaved") }),
    onFailure: (result) => applyActionErrors(form, result),
    // A later save is a new request; a retry after a failure reuses this id.
    onSuccess: () => form.setValue("requestId", newAttemptId()),
  });
  const pending = mutation.isPending;
  const groups: readonly ["customer" | "staff", ReactNode, ReactNode][] = [
    ["customer", t("customerGroup"), t("customerGroupHint")],
    ["staff", t("staffGroup"), t("staffGroupHint")],
  ];

  return (
    <Form form={form} locale={locale} messages={messages}>
      <form
        noValidate
        className="grid gap-6"
        onSubmit={form.handleSubmit(() => mutation.mutate(form.getValues()))}
      >
        {settings.whatsappAvailable ? null : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("whatsappOffHint")}{" "}
            <Link
              className={linkClass}
              href={`/${locale}/integrations#integrations-whatsapp`}
            >
              {t("whatsappSetupLink")}
            </Link>
          </p>
        )}
        {groups.map(([audience, legend, hint]) => (
          <FieldSet key={audience} disabled={pending} className={panel}>
            <FieldLegend>{legend}</FieldLegend>
            <FieldDescription className="-mt-2">{hint}</FieldDescription>
            <ul className="-mx-5 grid divide-y border-t md:-mx-6">
              {settings.items.map((item, index) =>
                item.audience === audience ? (
                  <MessageRow
                    key={item.templateKey}
                    locale={locale}
                    control={control}
                    item={item}
                    index={index}
                    whatsappAvailable={settings.whatsappAvailable}
                    onPreview={setPreview}
                  />
                ) : null,
              )}
            </ul>
          </FieldSet>
        ))}
        <FieldSet disabled={pending} className={panel} id="notification-reminders">
          <FieldLegend>{t("remindersTitle")}</FieldLegend>
          <FieldDescription className="-mt-2">{t("remindersHint")}</FieldDescription>
          <ReminderOffsetsField
            locale={locale}
            control={control}
            messages={messages}
            disabled={pending}
          />
        </FieldSet>
        <MutationFeedback
          locale={locale}
          messages={messages}
          result={mutation.data}
          transportFailed={mutation.isError}
          success={t("settingsSaved")}
          reload={{
            codes: ["settingsConflict"],
            label: t("reload"),
            onReload: () => router.refresh(),
          }}
        />
        <FormActions sticky>
          <Button type="submit" loading={pending} loadingLabel={t("saving")}>
            {t("saveSettings")}
          </Button>
        </FormActions>
      </form>
      <EmailPreviewDialog
        locale={locale}
        templateKey={preview}
        onClose={() => setPreview(null)}
      />
    </Form>
  );
}
