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
  Textarea,
  useZodForm,
} from "@wlbp/ui-foundation";

import { getDashboardMessage, type DashboardMessageKey } from "../../_lib/copy";
import { dashboardFormMessages } from "../../_lib/form-messages";
import { MutationErrors } from "../../_lib/ui/mutation-errors";
import { ProposedTimeFields } from "../../_lib/ui/proposed-time-fields";
import {
  useSyncedValue,
  useWorkspaceMutation,
} from "../../_lib/ui/use-workspace-mutation";
import { decideRequestAction } from "./actions";
import { requestDecisionSchema } from "./request-decision-schema";

const decisions = [
  { action: "accept", label: "requestsAccept", variant: "success" },
  { action: "propose", label: "requestsPropose", variant: "outline" },
  { action: "reject", label: "requestsReject", variant: "destructive-outline" },
] as const satisfies readonly {
  action: "accept" | "propose" | "reject";
  label: DashboardMessageKey;
  variant: "success" | "outline" | "destructive-outline";
}[];

/** One request's decision. The pressed button names the decision. */
export function RequestDecisionForm({
  locale,
  bookingId,
  bookingRevision,
  locationTimeZone,
}: {
  readonly locale: Locale;
  readonly bookingId: string;
  readonly bookingRevision: number;
  readonly locationTimeZone: string;
}) {
  const message = (key: DashboardMessageKey) => getDashboardMessage(locale, key);
  const form = useZodForm(requestDecisionSchema, {
    defaultValues: {
      locale,
      bookingId,
      expectedRevision: bookingRevision,
      locationTimeZone,
      action: "accept",
      publicReason: "",
      internalReason: "",
      proposedStartAt: "",
      fold: "none",
    },
  });
  useSyncedValue(form, "expectedRevision", bookingRevision);
  const mutation = useWorkspaceMutation(decideRequestAction, form, {
    clearOnCommit: ["publicReason", "internalReason", "proposedStartAt", "fold"],
  });
  const pendingAction = mutation.isPending ? mutation.variables?.action : undefined;

  return (
    <Form form={form} locale={locale} messages={dashboardFormMessages(locale)}>
      <form
        noValidate
        data-booking-id={bookingId}
        data-expected-revision={bookingRevision}
        className="grid gap-5"
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
      >
        <FieldGroup columns={2}>
          <FormField
            control={form.control}
            name="publicReason"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{message("requestsPublicReasonLabel")}</FormLabel>
                <FormDescription>{message("requestsPublicReasonHint")}</FormDescription>
                <FormControl>
                  <Textarea {...field} maxLength={500} rows={2} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="internalReason"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{message("requestsInternalReasonLabel")}</FormLabel>
                <FormDescription>
                  {message("requestsInternalReasonHint")}
                </FormDescription>
                <FormControl>
                  <Textarea {...field} maxLength={500} rows={2} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <ProposedTimeFields
            locale={locale}
            label={message("requestsProposeTimeLabel")}
            timeName="proposedStartAt"
          />
        </FieldGroup>
        <MutationErrors mutation={mutation} />
        <div className="flex flex-wrap gap-2">
          {decisions.map((decision) => (
            <Button
              key={decision.action}
              name="action"
              type="submit"
              value={decision.action}
              variant={decision.variant}
              className={decision.action === "reject" ? "sm:ms-auto" : undefined}
              disabled={mutation.isPending}
              loading={pendingAction === decision.action}
              onClick={() => form.setValue("action", decision.action)}
            >
              {message(decision.label)}
            </Button>
          ))}
        </div>
      </form>
    </Form>
  );
}
