"use client";

import type { Locale } from "@wlbp/i18n";
import {
  Checkbox,
  DatePicker,
  FieldLegend,
  FieldSet,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  TimeSelect,
  cn,
  useFormField,
} from "@wlbp/ui-foundation";
import { useEffect, useId, useState, type ComponentProps, type ReactNode } from "react";
import { useFormContext } from "react-hook-form";
import { fill, formCopy, say } from "../copy";

/**
 * React Hook Form fields for the operator form kit. Each one reads the form
 * from context, so server-rendered pages can pass them as children of
 * <ActionDialog>/<OperatorForm>. Every control keeps its `name` attribute.
 */

/** FormControl that only references a description when one is rendered. */
function Control({
  hasDescription,
  id,
  ...props
}: ComponentProps<typeof FormControl> & {
  hasDescription: boolean;
  id?: string | undefined;
}) {
  const { descriptionId, messageId, error } = useFormField();
  const describedBy =
    [hasDescription ? descriptionId : null, error ? messageId : null]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <FormControl {...(id ? { id } : {})} aria-describedby={describedBy} {...props} />
  );
}

type Common = {
  name: string;
  label: ReactNode;
  description?: ReactNode;
  required?: boolean;
  /** Fixed control id (some e2e selectors and anchors rely on it). */
  id?: string;
  className?: string;
};

export function TextFormField({
  name,
  label,
  description,
  required = false,
  id,
  className,
  ...input
}: Common &
  Pick<
    ComponentProps<"input">,
    | "type"
    | "maxLength"
    | "minLength"
    | "min"
    | "max"
    | "autoComplete"
    | "inputMode"
    | "dir"
    | "lang"
  >) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel required={required} {...(id ? { htmlFor: id } : {})}>
            {label}
          </FormLabel>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <Control hasDescription={Boolean(description)} id={id}>
            <Input
              {...input}
              {...field}
              value={(field.value as string | number | undefined) ?? ""}
              required={required}
            />
          </Control>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function TextareaFormField({
  name,
  label,
  description,
  required = false,
  id,
  className,
  ...textarea
}: Common &
  Pick<
    ComponentProps<"textarea">,
    "rows" | "maxLength" | "minLength" | "dir" | "lang"
  >) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel required={required} {...(id ? { htmlFor: id } : {})}>
            {label}
          </FormLabel>
          <Control hasDescription={Boolean(description)} id={id}>
            <Textarea
              {...textarea}
              {...field}
              value={(field.value as string | undefined) ?? ""}
              required={required}
            />
          </Control>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/**
 * A labelled select. Like the native select it replaced, it starts on the
 * first option when the form has no (or an unknown) value, so a required
 * field is never submitted empty. Option values must not be "".
 */
export function SelectFormField({
  name,
  label,
  description,
  required = true,
  id,
  className,
  options,
}: Common & { options: readonly (readonly [value: string, label: string])[] }) {
  const { control, getValues, setValue } = useFormContext();
  const first = options[0]?.[0];
  useEffect(() => {
    const current = getValues(name) as unknown;
    if (first !== undefined && !options.some(([value]) => value === current)) {
      setValue(name, first);
    }
  }, [first, getValues, name, options, setValue]);
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel required={required} {...(id ? { htmlFor: id } : {})}>
            {label}
          </FormLabel>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <Select
            name={name}
            required={required}
            value={(field.value as string | undefined) ?? ""}
            onValueChange={field.onChange}
            disabled={field.disabled ?? false}
          >
            <Control hasDescription={Boolean(description)} id={id}>
              <SelectTrigger ref={field.ref} onBlur={field.onBlur}>
                <SelectValue />
              </SelectTrigger>
            </Control>
            <SelectContent>
              {options.map(([value, optionLabel]) => (
                <SelectItem key={value} value={value}>
                  {optionLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function CheckboxFormField({
  name,
  label,
  id,
  className,
}: Omit<Common, "description" | "required">) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn("flex flex-wrap items-center gap-3", className)}>
          <Control hasDescription={false} id={id}>
            <Checkbox
              ref={field.ref}
              name={name}
              checked={field.value === true}
              onCheckedChange={(checked) => field.onChange(checked === true)}
              onBlur={field.onBlur}
            />
          </Control>
          <FormLabel className="font-medium" {...(id ? { htmlFor: id } : {})}>
            {label}
          </FormLabel>
          <FormMessage className="basis-full" />
        </FormItem>
      )}
    />
  );
}

/** Several checkboxes submitting an array of their values under one name. */
export function CheckboxGroupFormField({
  name,
  legend,
  options,
  idPrefix,
  empty,
}: {
  name: string;
  legend: ReactNode;
  options: readonly (readonly [value: string, label: ReactNode])[];
  idPrefix: string;
  /** Shown instead of the options when there are none to choose. */
  empty?: ReactNode;
}) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const selected = Array.isArray(field.value) ? (field.value as string[]) : [];
        return (
          <FormItem>
            <FieldSet className="gap-3">
              <FieldLegend>{legend}</FieldLegend>
              {options.length === 0 && empty
                ? empty
                : options.map(([value, optionLabel]) => (
                    <div key={value} className="flex items-center gap-3">
                      <Checkbox
                        id={`${idPrefix}-${value}`}
                        name={name}
                        value={value}
                        checked={selected.includes(value)}
                        onCheckedChange={(checked) =>
                          field.onChange(
                            checked === true
                              ? [...selected, value]
                              : selected.filter((entry) => entry !== value),
                          )
                        }
                      />
                      <Label htmlFor={`${idPrefix}-${value}`} className="font-medium">
                        {optionLabel}
                      </Label>
                    </div>
                  ))}
            </FieldSet>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

/** Date + time in UTC; the form value is `YYYY-MM-DDTHH:MM` (or "" for none). */
export function DateTimeFormField({
  name,
  label,
  description,
  id,
  className,
  locale,
}: Omit<Common, "required"> & { locale: Locale }) {
  const { control } = useFormContext();
  const timeId = useId();
  const labelText = typeof label === "string" ? label : "";
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel {...(id ? { htmlFor: id } : {})}>{label}</FormLabel>
          <DateTimeControl
            name={name}
            value={(field.value as string | undefined) ?? ""}
            onChange={field.onChange}
            locale={locale}
            timeId={timeId}
            timeLabel={fill(locale, formCopy.timeOf, { field: labelText })}
            id={id}
            hasDescription={Boolean(description)}
          />
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function DateTimeControl({
  name,
  value,
  onChange,
  locale,
  timeId,
  timeLabel,
  id,
  hasDescription,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  locale: Locale;
  timeId: string;
  timeLabel: string;
  id: string | undefined;
  hasDescription: boolean;
}) {
  const { controlId, descriptionId, messageId, error } = useFormField();
  const [initialDate, initialTime] = value.split("T");
  const [date, setDate] = useState(initialDate ?? "");
  const [time, setTime] = useState((initialTime ?? "").slice(0, 5));
  const describedBy =
    [hasDescription ? descriptionId : null, error ? messageId : null]
      .filter(Boolean)
      .join(" ") || undefined;
  const update = (nextDate: string, nextTime: string) => {
    setDate(nextDate);
    setTime(nextTime);
    onChange(nextDate && nextTime ? `${nextDate}T${nextTime}` : "");
  };
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
      <input type="hidden" name={name} value={value} />
      <DatePicker
        id={id ?? controlId}
        locale={locale}
        value={date}
        onValueChange={(next) => update(next, time)}
        placeholder={say(locale, formCopy.pickDate)}
        {...(describedBy ? { "aria-describedby": describedBy } : {})}
        {...(error ? { "aria-invalid": true } : {})}
      />
      <TimeSelect
        id={timeId}
        locale={locale}
        value={time}
        onValueChange={(next) => update(date, next)}
        placeholder={say(locale, formCopy.pickTime)}
        aria-label={timeLabel}
        {...(error ? { "aria-invalid": true } : {})}
      />
    </div>
  );
}
