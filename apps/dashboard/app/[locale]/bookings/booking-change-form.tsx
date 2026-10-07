"use client";

import type { Locale } from "@wlbp/i18n";
import {
  Button,
  DialogFooter,
  Form,
  FormControl,
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
import { changeBookingAction } from "./actions";
import { bookingChangeSchema } from "./booking-schema";

const changes = [
  { action: "reschedule", label: "bookingsReschedule", variant: "default" },
  { action: "resend", label: "bookingsResend", variant: "outline" },
  { action: "cancel", label: "bookingsCancel", variant: "destructive-outline" },
] as const satisfies readonly {
  action: "reschedule" | "resend" | "cancel";
  label: DashboardMessageKey;
  variant: "default" | "outline" | "destructive-outline";
}[];

/** Reschedule, resend or cancel one booking. The pressed button names the change. */
export function BookingChangeForm({
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
  const form = useZodForm(bookingChangeSchema, {
    defaultValues: {
      locale,
      bookingId,
      expectedRevision: bookingRevision,
      locationTimeZone,
      action: "reschedule",
      newStartAt: "",
      fold: "none",
      publicReason: "",
      internalReason: "",
    },
  });
  useSyncedValue(form, "expectedRevision", bookingRevision);
  const mutation = useWorkspaceMutation(changeBookingAction, form, {
    clearOnCommit: ["newStartAt", "fold", "publicReason", "internalReason"],
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
        <ProposedTimeFields
          locale={locale}
          label={message("bookingsNewTimeLabel")}
          timeName="newStartAt"
        />
        <FormField
          control={form.control}
          name="publicReason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{message("requestsPublicReasonLabel")}</FormLabel>
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
              <FormControl>
                <Textarea {...field} maxLength={500} rows={2} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <MutationErrors mutation={mutation} />
        <DialogFooter className="sm:justify-start">
          {changes.map((change) => (
            <Button
              key={change.action}
              name="action"
              type="submit"
              value={change.action}
              variant={change.variant}
              className={change.action === "cancel" ? "sm:ms-auto" : undefined}
              disabled={mutation.isPending}
              loading={pendingAction === change.action}
              {...(change.action === "resend"
                ? { loadingLabel: message("bookingsResending") }
                : change.action === "cancel"
                  ? { loadingLabel: message("bookingsCancelling") }
                  : {})}
              onClick={() => form.setValue("action", change.action)}
            >
              {message(change.label)}
            </Button>
          ))}
        </DialogFooter>
      </form>
    </Form>
  );
}
