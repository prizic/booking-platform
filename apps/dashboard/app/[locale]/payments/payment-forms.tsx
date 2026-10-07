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

import { getDashboardMessage, type DashboardMessageKey } from "../../_lib/copy";
import { dashboardFormMessages } from "../../_lib/form-messages";
import { MutationErrors } from "../../_lib/ui/mutation-errors";
import { useWorkspaceMutation } from "../../_lib/ui/use-workspace-mutation";
import { workspaceStatus } from "../../_lib/workspace-status";
import { requestRefundAction, resolveExceptionAction } from "./actions";
import { refundRetrySchema, resolveExceptionSchema } from "./payment-schema";

// How an operator can close an item, in the order they are offered. The
// database re-checks every one of these; offering them is presentation, never
// authorization.
const resolutionOrder = [
  "refunded",
  "written_off",
  "contested",
  "reconciled",
  "no_action_needed",
] as const;

/** Retry the refund (when the item has a booking) and resolve the exception. */
export function PaymentExceptionForms({
  locale,
  exceptionId,
  bookingId,
}: {
  readonly locale: Locale;
  readonly exceptionId: string;
  readonly bookingId: string | null;
}) {
  const message = (key: DashboardMessageKey) => getDashboardMessage(locale, key);
  const messages = dashboardFormMessages(locale);

  const refundForm = useZodForm(refundRetrySchema, {
    defaultValues: { locale, bookingId: bookingId ?? "" },
  });
  const refund = useWorkspaceMutation(requestRefundAction, refundForm);

  const resolveForm = useZodForm(resolveExceptionSchema, {
    defaultValues: { locale, exceptionId, resolution: "reconciled", note: "" },
  });
  const resolve = useWorkspaceMutation(resolveExceptionAction, resolveForm, {
    clearOnCommit: ["note"],
  });

  return (
    <>
      {bookingId === null ? null : (
        <Form form={refundForm} locale={locale} messages={messages}>
          <form
            noValidate
            data-booking-id={bookingId}
            className="grid gap-2"
            onSubmit={refundForm.handleSubmit((values) => refund.mutate(values))}
          >
            <MutationErrors mutation={refund} />
            <Button type="submit" variant="outline" block loading={refund.isPending}>
              {message("paymentsRetryRefund")}
            </Button>
          </form>
        </Form>
      )}
      <Form form={resolveForm} locale={locale} messages={messages}>
        <form
          noValidate
          data-exception-id={exceptionId}
          className="grid gap-4"
          onSubmit={resolveForm.handleSubmit((values) => resolve.mutate(values))}
        >
          <FormField
            control={resolveForm.control}
            name="resolution"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{message("paymentsResolutionLabel")}</FormLabel>
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
                    {resolutionOrder.map((option) => (
                      <SelectItem key={option} value={option}>
                        {workspaceStatus(locale, option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={resolveForm.control}
            name="note"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{message("paymentsNoteLabel")}</FormLabel>
                <FormControl>
                  <Textarea {...field} maxLength={500} rows={2} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <MutationErrors mutation={resolve} />
          <Button type="submit" block loading={resolve.isPending}>
            {message("paymentsResolveAction")}
          </Button>
        </form>
      </Form>
    </>
  );
}
