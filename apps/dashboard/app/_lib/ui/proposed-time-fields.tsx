"use client";

import type { Locale } from "@wlbp/i18n";
import {
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
} from "@wlbp/ui-foundation";

import { workspaceMessage } from "../workspace-copy";
import { DateTimeField } from "./date-time-field";

/**
 * A local time in the location's zone plus which occurrence of a repeated
 * local time is meant (the hour a clock falls back). Used inside a `<Form>`
 * whose schema has `<timeName>: string` and `fold: "none" | "0" | "1"`.
 */
export function ProposedTimeFields({
  locale,
  label,
  timeName,
}: {
  readonly locale: Locale;
  readonly label: string;
  readonly timeName: string;
}) {
  return (
    <>
      <FormField
        name={timeName}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <FormControl>
              <DateTimeField
                name={field.name}
                value={String(field.value ?? "")}
                onChange={field.onChange}
                onBlur={field.onBlur}
                locale={locale}
                datePlaceholder={workspaceMessage(locale, "datePlaceholder")}
                timePlaceholder={workspaceMessage(locale, "timePlaceholder")}
                timeLabel={workspaceMessage(locale, "timeOf", { label })}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        name="fold"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{workspaceMessage(locale, "foldLabel")}</FormLabel>
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
                <SelectItem value="none">
                  {workspaceMessage(locale, "foldNone")}
                </SelectItem>
                <SelectItem value="0">
                  {workspaceMessage(locale, "foldFirst")}
                </SelectItem>
                <SelectItem value="1">
                  {workspaceMessage(locale, "foldSecond")}
                </SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}
