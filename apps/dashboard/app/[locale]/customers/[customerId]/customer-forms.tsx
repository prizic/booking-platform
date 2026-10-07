"use client";

import type { Locale } from "@wlbp/i18n";
import {
  Button,
  FieldGroup,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Textarea,
  useZodForm,
} from "@wlbp/ui-foundation";

import { getDashboardMessage, type DashboardMessageKey } from "../../../_lib/copy";
import { dashboardFormMessages } from "../../../_lib/form-messages";
import { MutationErrors } from "../../../_lib/ui/mutation-errors";
import {
  useSyncedValue,
  useWorkspaceMutation,
} from "../../../_lib/ui/use-workspace-mutation";
import {
  correctCustomerAction,
  runPrivacyRequestAction,
  setCustomerFlagAction,
} from "../actions";
import {
  customerCorrectionSchema,
  customerFlagSchema,
  privacyRequestSchema,
} from "../customer-schema";

/** Corrects the customer's identity; past bookings keep their snapshots. */
export function CustomerCorrectionForm({
  locale,
  customerId,
  revision,
  fullName,
  email,
  phone,
  tags,
}: {
  readonly locale: Locale;
  readonly customerId: string;
  readonly revision: number;
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
  readonly tags: string;
}) {
  const message = (key: DashboardMessageKey) => getDashboardMessage(locale, key);
  const form = useZodForm(customerCorrectionSchema, {
    defaultValues: {
      locale,
      customerId,
      expectedRevision: revision,
      fullName,
      email,
      phone,
      tags,
    },
  });
  useSyncedValue(form, "expectedRevision", revision);
  const mutation = useWorkspaceMutation(correctCustomerAction, form);

  return (
    <Form form={form} locale={locale} messages={dashboardFormMessages(locale)}>
      <form
        noValidate
        data-customer-id={customerId}
        data-expected-revision={revision}
        className="grid gap-5 rounded-lg border bg-card p-5"
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
      >
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>{message("customersNameLabel")}</FormLabel>
              <FormControl>
                <Input {...field} type="text" maxLength={160} autoComplete="off" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FieldGroup columns={2}>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{message("customersEmailLabel")}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="email"
                    dir="ltr"
                    maxLength={320}
                    autoComplete="off"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{message("customersPhoneLabel")}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="tel"
                    dir="ltr"
                    maxLength={40}
                    autoComplete="off"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FieldGroup>
        <FormField
          control={form.control}
          name="tags"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{message("customersTagsLabel")}</FormLabel>
              <FormControl>
                <Input {...field} type="text" maxLength={400} autoComplete="off" />
              </FormControl>
              <FormDescription>{message("customersCorrectHint")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <MutationErrors mutation={mutation} />
        <Button type="submit" className="w-fit" loading={mutation.isPending}>
          {message("customersCorrectAction")}
        </Button>
      </form>
    </Form>
  );
}

/**
 * Restriction, legal hold, export and deletion. Every control is offered; the
 * database decides which one this record can actually accept. Hiding a button
 * is presentation, and presentation is never authorization.
 */
export function CustomerRightsForms({
  locale,
  customerId,
  restricted,
  legalHold,
}: {
  readonly locale: Locale;
  readonly customerId: string;
  readonly restricted: boolean;
  readonly legalHold: boolean;
}) {
  const message = (key: DashboardMessageKey) => getDashboardMessage(locale, key);
  const messages = dashboardFormMessages(locale);

  const flagForm = useZodForm(customerFlagSchema, {
    defaultValues: {
      locale,
      customerId,
      action: restricted ? "unrestrict" : "restrict",
      reason: "",
    },
  });
  const flag = useWorkspaceMutation(setCustomerFlagAction, flagForm, {
    clearOnCommit: ["reason"],
  });
  const flagPending = flag.isPending ? flag.variables?.action : undefined;
  const restriction = restricted ? "unrestrict" : "restrict";
  const hold = legalHold ? "release" : "hold";

  const privacyForm = useZodForm(privacyRequestSchema, {
    defaultValues: { locale, customerId, kind: "export" },
  });
  const privacy = useWorkspaceMutation(runPrivacyRequestAction, privacyForm);
  const privacyPending = privacy.isPending ? privacy.variables?.kind : undefined;

  return (
    <div className="grid gap-5 rounded-lg border bg-card p-5">
      <Form form={flagForm} locale={locale} messages={messages}>
        <form
          noValidate
          className="grid gap-4"
          onSubmit={flagForm.handleSubmit((values) => flag.mutate(values))}
        >
          <FormField
            control={flagForm.control}
            name="reason"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{message("customersReasonLabel")}</FormLabel>
                <FormControl>
                  <Textarea {...field} maxLength={500} rows={2} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <MutationErrors mutation={flag} />
          <div className="flex flex-wrap gap-2">
            <Button
              name="action"
              type="submit"
              value={restriction}
              variant="outline"
              disabled={flag.isPending}
              loading={flagPending === restriction}
              onClick={() => flagForm.setValue("action", restriction)}
            >
              {message(
                restricted ? "customersUnrestrictAction" : "customersRestrictAction",
              )}
            </Button>
            <Button
              name="action"
              type="submit"
              value={hold}
              variant="outline"
              disabled={flag.isPending}
              loading={flagPending === hold}
              onClick={() => flagForm.setValue("action", hold)}
            >
              {message(
                legalHold ? "customersReleaseHoldAction" : "customersPlaceHoldAction",
              )}
            </Button>
          </div>
        </form>
      </Form>

      <Form form={privacyForm} locale={locale} messages={messages}>
        <form
          noValidate
          className="grid gap-4 border-t pt-5"
          onSubmit={privacyForm.handleSubmit((values) => privacy.mutate(values))}
        >
          <p className="text-sm leading-relaxed text-muted-foreground">
            {message("customersJobsHint")}
          </p>
          <MutationErrors mutation={privacy} />
          <div className="flex flex-wrap gap-2">
            <Button
              name="kind"
              type="submit"
              value="export"
              variant="secondary"
              disabled={privacy.isPending}
              loading={privacyPending === "export"}
              onClick={() => privacyForm.setValue("kind", "export")}
            >
              {message("customersExportAction")}
            </Button>
            <Button
              name="kind"
              type="submit"
              value="deletion"
              variant="destructive-outline"
              disabled={privacy.isPending}
              loading={privacyPending === "deletion"}
              onClick={() => privacyForm.setValue("kind", "deletion")}
            >
              {message("customersDeleteAction")}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
