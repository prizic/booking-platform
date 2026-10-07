"use client";

import type { Locale } from "@wlbp/i18n";
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
import { workspaceMessage } from "../../../_lib/workspace-copy";
import { addBookingNoteAction, transitionBookingAction } from "../actions";
import { bookingNoteSchema, bookingTransitionSchema } from "../booking-schema";

// Every action is offered; the database decides which one this booking can
// actually make. Hiding a control is presentation, never authorization, and a
// hidden control would also hide the honest refusal that teaches an operator
// what state the booking is really in.
const transitions = [
  { key: "check_in", label: "detailCheckIn" },
  { key: "complete", label: "detailComplete" },
  { key: "no_show", label: "detailNoShow" },
  { key: "correct", label: "detailCorrect" },
] as const satisfies readonly {
  key: "check_in" | "complete" | "no_show" | "correct";
  label: DashboardMessageKey;
}[];

/** The lifecycle actions; the pressed button names the transition. */
export function BookingTransitionForm({
  locale,
  bookingId,
  bookingRevision,
}: {
  readonly locale: Locale;
  readonly bookingId: string;
  readonly bookingRevision: number;
}) {
  const message = (key: DashboardMessageKey) => getDashboardMessage(locale, key);
  const form = useZodForm(bookingTransitionSchema, {
    defaultValues: {
      locale,
      bookingId,
      expectedRevision: bookingRevision,
      action: "check_in",
      reason: "",
    },
  });
  useSyncedValue(form, "expectedRevision", bookingRevision);
  const mutation = useWorkspaceMutation(transitionBookingAction, form, {
    clearOnCommit: ["reason"],
  });
  const pendingAction = mutation.isPending ? mutation.variables?.action : undefined;

  return (
    <Form form={form} locale={locale} messages={dashboardFormMessages(locale)}>
      <form
        noValidate
        aria-label={workspaceMessage(locale, "lifecycleActions")}
        data-booking-id={bookingId}
        data-expected-revision={bookingRevision}
        className="grid max-w-2xl gap-4"
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
      >
        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{message("detailReasonLabel")}</FormLabel>
              <FormControl>
                <Textarea {...field} maxLength={500} rows={2} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <MutationErrors mutation={mutation} />
        <div className="flex flex-wrap gap-2">
          {transitions.map((transition) => (
            <Button
              key={transition.key}
              name="action"
              type="submit"
              value={transition.key}
              variant={transition.key === "check_in" ? "default" : "outline"}
              disabled={mutation.isPending}
              loading={pendingAction === transition.key}
              onClick={() => form.setValue("action", transition.key)}
            >
              {message(transition.label)}
            </Button>
          ))}
        </div>
      </form>
    </Form>
  );
}

/** Adds an operational or sensitive note to the booking. */
export function BookingNoteForm({
  locale,
  bookingId,
}: {
  readonly locale: Locale;
  readonly bookingId: string;
}) {
  const message = (key: DashboardMessageKey) => getDashboardMessage(locale, key);
  const form = useZodForm(bookingNoteSchema, {
    defaultValues: { locale, bookingId, body: "", visibility: "operational" },
  });
  const mutation = useWorkspaceMutation(addBookingNoteAction, form, {
    clearOnCommit: ["body", "visibility"],
  });

  return (
    <Form form={form} locale={locale} messages={dashboardFormMessages(locale)}>
      <form
        noValidate
        aria-labelledby="detail-add-note-title"
        className="grid gap-4 border-t pt-4"
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
      >
        <h3 id="detail-add-note-title" className="text-base font-semibold">
          {message("detailAddNoteTitle")}
        </h3>
        <FormField
          control={form.control}
          name="body"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>{message("detailNoteBodyLabel")}</FormLabel>
              <FormControl>
                <Textarea {...field} maxLength={2000} rows={3} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="visibility"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{message("detailNoteVisibilityLabel")}</FormLabel>
              <Select
                name={field.name}
                value={field.value}
                onValueChange={field.onChange}
              >
                <FormControl>
                  <SelectTrigger onBlur={field.onBlur}>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="operational">
                    {message("detailNoteOperational")}
                  </SelectItem>
                  <SelectItem value="sensitive">
                    {message("detailNoteSensitive")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <MutationErrors mutation={mutation} />
        <Button type="submit" className="w-fit" loading={mutation.isPending}>
          {message("detailAddNote")}
        </Button>
      </form>
    </Form>
  );
}
