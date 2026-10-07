"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Control } from "react-hook-form";
import { ShieldCheck } from "lucide-react";
import type { WhatsAppConfigV1 } from "@wlbp/api-contracts";
import type { Locale } from "@wlbp/i18n";
import {
  Button,
  FieldDescription,
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
  applyActionErrors,
  useActionMutation,
  useZodForm,
} from "@wlbp/ui-foundation";
import {
  notificationFormMessages,
  notificationText,
  templateLabel,
} from "../../_lib/notification-copy";
import { FormActions } from "../services/form-kit";
import { TextField } from "../services/form-fields";
import { newAttemptId, useAuthoritativeDefaults } from "../services/form-hooks";
import { MutationFeedback } from "../services/mutation-feedback";
import { saveWhatsAppConfigAction } from "./actions";
import {
  whatsAppCapableKeys,
  whatsAppConfigSchema,
  type WhatsAppConfigInput,
} from "./whatsapp-schema";

const panel = "grid gap-5 rounded-lg border bg-card p-5 md:p-6";

export function whatsAppDefaults(
  locale: Locale,
  config: WhatsAppConfigV1,
  attempt: string,
): WhatsAppConfigInput {
  return {
    locale,
    requestId: attempt,
    expectedRevision: config.revision,
    enabled: config.enabled,
    phoneNumberId: config.phoneNumberId ?? "",
    businessAccountId: config.businessAccountId ?? "",
    // Write-only: the stored reference is never read back into the browser.
    accessTokenSecretRef: "",
    tokenConfigured: config.accessTokenConfigured,
    templates: whatsAppCapableKeys.map((templateKey) => ({
      templateKey,
      name: config.templateMap[templateKey]?.name ?? "",
      language: config.templateMap[templateKey]?.language ?? "",
    })),
  };
}

export function WhatsAppForm({
  locale,
  config,
  attempt,
  tokenReference,
}: {
  readonly locale: Locale;
  readonly config: WhatsAppConfigV1;
  readonly attempt: string;
  /** This tenant's own `env:` reference, shown as the value to enter. */
  readonly tokenReference: string;
}) {
  const router = useRouter();
  const t = (
    key: Parameters<typeof notificationText>[1],
    values?: Record<string, string>,
  ) => notificationText(locale, key, values);
  const messages = notificationFormMessages(locale, { reference: tokenReference });
  const defaults = whatsAppDefaults(locale, config, attempt);
  const form = useZodForm(whatsAppConfigSchema, { defaultValues: defaults });
  useAuthoritativeDefaults(form, defaults);
  const control = form.control as unknown as Control<WhatsAppConfigInput>;
  const mutation = useActionMutation(saveWhatsAppConfigAction, {
    onFailure: (result) => applyActionErrors(form, result),
    onSuccess: () => {
      form.setValue("requestId", newAttemptId());
      // The reference was sent once; the field never shows it again.
      form.resetField("accessTokenSecretRef", { defaultValue: "" });
    },
  });
  const pending = mutation.isPending;
  const verifyHref = `/${locale}/auth/mfa?returnTo=${encodeURIComponent(`/${locale}/integrations`)}`;
  const [hintBefore = "", hintAfter = ""] = t("waTokenHint").split("{reference}");
  const verifyLink = (
    <Button asChild variant="outline" size="sm">
      <Link href={verifyHref}>
        <ShieldCheck aria-hidden="true" />
        {t("waVerify")}
      </Link>
    </Button>
  );

  return (
    <Form form={form} locale={locale} messages={messages}>
      <form
        noValidate
        className="grid gap-6"
        onSubmit={form.handleSubmit(() => mutation.mutate(form.getValues()))}
      >
        <FieldSet disabled={pending} className={panel}>
          <FieldLegend>{t("waConnection")}</FieldLegend>
          <FormField
            control={control}
            name="enabled"
            render={({ field }) => (
              <FormItem className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                <div className="grid min-w-0 flex-1 basis-56 gap-1">
                  <FormLabel className="font-medium">{t("waEnabled")}</FormLabel>
                  <FormDescription>{t("waEnabledHint")}</FormDescription>
                  <FormMessage />
                </div>
                <FormControl>
                  <Switch
                    ref={field.ref}
                    name="whatsapp-enabled"
                    className="mt-2"
                    checked={field.value === true}
                    onCheckedChange={(checked) => field.onChange(checked)}
                    onBlur={field.onBlur}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <div className="grid gap-5 md:grid-cols-2">
            <TextField
              control={control}
              name="phoneNumberId"
              label={t("waPhoneId")}
              description={t("waIdHint")}
              dir="ltr"
              maxLength={32}
              autoComplete="off"
              inputClassName="font-latin"
            />
            <TextField
              control={control}
              name="businessAccountId"
              label={t("waAccountId")}
              description={t("waIdHint")}
              dir="ltr"
              maxLength={32}
              autoComplete="off"
              inputClassName="font-latin"
            />
          </div>
          <TextField
            control={control}
            name="accessTokenSecretRef"
            label={t("waTokenRef")}
            dir="ltr"
            maxLength={160}
            autoComplete="off"
            inputClassName="font-latin"
            description={
              <>
                <span className="font-medium text-foreground">
                  {t(
                    config.accessTokenConfigured
                      ? "waTokenConfigured"
                      : "waTokenMissing",
                  )}
                </span>{" "}
                {hintBefore}
                <bdi dir="ltr" className="font-latin break-all">
                  {tokenReference}
                </bdi>
                {hintAfter}
              </>
            }
          />
        </FieldSet>

        <FieldSet disabled={pending} className={panel}>
          <FieldLegend>{t("waTemplatesTitle")}</FieldLegend>
          <FieldDescription className="-mt-3">{t("waTemplatesHint")}</FieldDescription>
          <ul className="-mx-5 grid divide-y border-t md:-mx-6">
            {whatsAppCapableKeys.map((key, index) => {
              const name = templateLabel(locale, key);
              return (
                <li
                  key={key}
                  className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,0.8fr)] md:items-start md:px-6"
                >
                  <p className="font-medium md:pt-8">{name}</p>
                  <TextField
                    control={control}
                    name={`templates.${index}.name`}
                    htmlName={`whatsapp-template-${key}`}
                    label={
                      <>
                        {t("waTemplateName")}
                        <span className="sr-only"> — {name}</span>
                      </>
                    }
                    dir="ltr"
                    maxLength={512}
                    autoComplete="off"
                    inputClassName="font-latin"
                  />
                  <TextField
                    control={control}
                    name={`templates.${index}.language`}
                    htmlName={`whatsapp-language-${key}`}
                    label={
                      <>
                        {t("waTemplateLanguage")}
                        <span className="sr-only"> — {name}</span>
                      </>
                    }
                    dir="ltr"
                    maxLength={6}
                    autoComplete="off"
                    inputClassName="font-latin"
                  />
                </li>
              );
            })}
          </ul>
        </FieldSet>

        <MutationFeedback
          locale={locale}
          messages={messages}
          result={mutation.data}
          transportFailed={mutation.isError}
          success={t("waSaved")}
          extra={(code) => (code === "waStepUpRequired" ? verifyLink : null)}
          reload={{
            codes: ["waConflict"],
            label: t("reload"),
            onReload: () => router.refresh(),
          }}
        />
        <FormActions sticky>
          <p className="me-auto text-sm text-muted-foreground">{messages.waStepUp}</p>
          {verifyLink}
          <Button type="submit" loading={pending} loadingLabel={t("saving")}>
            {t("waSave")}
          </Button>
        </FormActions>
      </form>
    </Form>
  );
}
