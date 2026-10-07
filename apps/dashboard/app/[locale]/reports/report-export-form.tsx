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
  useZodForm,
} from "@wlbp/ui-foundation";
import { Download } from "lucide-react";

import { getDashboardMessage, type DashboardMessageKey } from "../../_lib/copy";
import { dashboardFormMessages } from "../../_lib/form-messages";
import { MutationErrors } from "../../_lib/ui/mutation-errors";
import {
  useSyncedValue,
  useWorkspaceMutation,
} from "../../_lib/ui/use-workspace-mutation";
import { runReportExportAction } from "./actions";
import { reportExportSchema } from "./report-export-schema";

const reportChoices = [
  { key: "bookings", label: "reportsBookingsTitle" },
  { key: "utilization", label: "reportsUtilizationTitle" },
  { key: "revenue", label: "reportsRevenueTitle" },
  { key: "customers", label: "reportsCustomersTitle" },
] as const satisfies readonly {
  key: "bookings" | "utilization" | "revenue" | "customers";
  label: DashboardMessageKey;
}[];

/** Exports the window the page is showing, under the caller's own access. */
export function ReportExportForm({
  locale,
  from,
  to,
  timeZone,
  locationId,
}: {
  readonly locale: Locale;
  readonly from: string;
  readonly to: string;
  readonly timeZone: string;
  readonly locationId: string;
}) {
  const message = (key: DashboardMessageKey) => getDashboardMessage(locale, key);
  const form = useZodForm(reportExportSchema, {
    defaultValues: { locale, reportKey: "bookings", from, to, timeZone, locationId },
  });
  // The window follows the page's filters as they change.
  useSyncedValue(form, "from", from);
  useSyncedValue(form, "to", to);
  useSyncedValue(form, "timeZone", timeZone);
  useSyncedValue(form, "locationId", locationId);
  const mutation = useWorkspaceMutation(runReportExportAction, form);

  return (
    <Form form={form} locale={locale} messages={dashboardFormMessages(locale)}>
      <form
        noValidate
        className="grid gap-3 rounded-lg border bg-card p-4"
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
      >
        <div className="flex flex-wrap items-end gap-3">
          <FormField
            control={form.control}
            name="reportKey"
            render={({ field }) => (
              <FormItem className="min-w-56">
                <FormLabel>{message("reportsExportWhich")}</FormLabel>
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
                    {reportChoices.map((choice) => (
                      <SelectItem key={choice.key} value={choice.key}>
                        {message(choice.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" loading={mutation.isPending}>
            <Download aria-hidden="true" />
            {message("reportsExportAction")}
          </Button>
        </div>
        <MutationErrors mutation={mutation} />
      </form>
    </Form>
  );
}
