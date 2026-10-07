"use client";
/*
 * React Hook Form field compositions shared by the Operate editors. Each one
 * is a foundation FormField/FormItem/FormLabel/FormControl/FormMessage stack
 * around a foundation control, and keeps the control's `name` attribute so
 * acceptance selectors and native backing selects keep working.
 */
import { useState, type ComponentProps, type ReactNode } from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
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
  Textarea,
  TimeSelect,
  cn,
  useFormField,
} from "@wlbp/ui-foundation";
import { ChoiceSelect, type ChoiceOption } from "./choice-select";

/** Any form control from useZodForm (input values T, parsed output TOut). */
export type FormControlOf<T extends FieldValues, TOut = T> = Control<T, unknown, TOut>;

interface BaseFieldProps<T extends FieldValues, TOut> {
  readonly control: FormControlOf<T, TOut>;
  readonly name: FieldPath<T>;
  readonly label: ReactNode;
  readonly required?: boolean;
  readonly description?: ReactNode;
  /** The submitted `name` attribute when it differs from the field path. */
  readonly htmlName?: string;
  readonly className?: string;
  readonly disabled?: boolean;
}

/** FormField with the control widened to the shape the foundation component expects. */
function Bound<T extends FieldValues, TOut>({
  control,
  name,
  render,
}: {
  readonly control: FormControlOf<T, TOut>;
  readonly name: FieldPath<T>;
  readonly render: ComponentProps<typeof FormField<T>>["render"];
}) {
  return (
    <FormField control={control as unknown as Control<T>} name={name} render={render} />
  );
}

export function TextField<T extends FieldValues, TOut>({
  control,
  name,
  label,
  required,
  description,
  htmlName,
  className,
  disabled,
  multiline = false,
  type = "text",
  dir,
  lang,
  maxLength,
  min,
  max,
  step,
  autoComplete,
  list,
  inputClassName,
  onValueChange,
}: BaseFieldProps<T, TOut> & {
  readonly multiline?: boolean;
  readonly type?: string;
  readonly dir?: "ltr" | "rtl";
  readonly lang?: string;
  readonly maxLength?: number;
  readonly min?: number | string;
  readonly max?: number | string;
  readonly step?: number | string;
  readonly autoComplete?: string;
  readonly list?: string;
  readonly inputClassName?: string;
  readonly onValueChange?: (value: string) => void;
}) {
  return (
    <Bound
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem {...(className ? { className } : {})}>
          <FormLabel required={required === true}>{label}</FormLabel>
          <FormControl>
            {multiline ? (
              <Textarea
                ref={field.ref}
                name={htmlName ?? field.name}
                value={String(field.value ?? "")}
                onChange={(event) => {
                  field.onChange(event.target.value);
                  onValueChange?.(event.target.value);
                }}
                onBlur={field.onBlur}
                disabled={disabled || field.disabled}
                rows={3}
                {...(required ? { required: true } : {})}
                {...(dir ? { dir } : {})}
                {...(lang ? { lang } : {})}
                {...(maxLength ? { maxLength } : {})}
                {...(inputClassName ? { className: inputClassName } : {})}
              />
            ) : (
              <Input
                ref={field.ref}
                name={htmlName ?? field.name}
                type={type}
                {...(required ? { required: true } : {})}
                value={String(field.value ?? "")}
                onChange={(event) => {
                  field.onChange(event.target.value);
                  onValueChange?.(event.target.value);
                }}
                onBlur={field.onBlur}
                disabled={disabled || field.disabled}
                {...(dir ? { dir } : {})}
                {...(lang ? { lang } : {})}
                {...(maxLength ? { maxLength } : {})}
                {...(min === undefined ? {} : { min })}
                {...(max === undefined ? {} : { max })}
                {...(step === undefined ? {} : { step })}
                {...(autoComplete ? { autoComplete } : {})}
                {...(list ? { list } : {})}
                {...(inputClassName ? { className: inputClassName } : {})}
              />
            )}
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function SelectField<T extends FieldValues, TOut>({
  control,
  name,
  label,
  required,
  description,
  htmlName,
  className,
  disabled,
  options,
  placeholder,
  onValueChange,
}: BaseFieldProps<T, TOut> & {
  readonly options: readonly ChoiceOption[];
  readonly placeholder?: ReactNode;
  readonly onValueChange?: (value: string) => void;
}) {
  return (
    <Bound
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem {...(className ? { className } : {})}>
          <FormLabel required={required === true}>{label}</FormLabel>
          <FormControl>
            <ChoiceSelect
              name={htmlName ?? field.name}
              value={String(field.value ?? "")}
              onValueChange={(value) => {
                field.onChange(value);
                onValueChange?.(value);
              }}
              onBlur={field.onBlur}
              triggerRef={field.ref}
              options={options}
              {...(placeholder === undefined ? {} : { placeholder })}
              {...(disabled || field.disabled ? { disabled: true } : {})}
            />
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** One checkbox bound to a boolean, its visible label at the inline end. */
export function CheckboxField<T extends FieldValues, TOut>({
  control,
  name,
  label,
  description,
  htmlName,
  className,
  disabled,
  value = "yes",
}: BaseFieldProps<T, TOut> & { readonly value?: string }) {
  return (
    <Bound
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn("flex min-h-11 items-start gap-3 py-2.5", className)}>
          <FormControl>
            <Checkbox
              ref={field.ref}
              name={htmlName ?? field.name}
              value={value}
              className="mt-0.5"
              checked={field.value === true}
              onCheckedChange={(checked) => field.onChange(checked === true)}
              onBlur={field.onBlur}
              disabled={disabled || field.disabled}
            />
          </FormControl>
          <div className="grid gap-1">
            <FormLabel className="font-medium">{label}</FormLabel>
            {description ? <FormDescription>{description}</FormDescription> : null}
            <FormMessage />
          </div>
        </FormItem>
      )}
    />
  );
}

function GroupCheckbox({
  id,
  name,
  value,
  checked,
  onCheckedChange,
  children,
}: {
  readonly id: string;
  readonly name: string;
  readonly value: string;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly children: ReactNode;
}) {
  const { error, messageId } = useFormField();
  return (
    <div className="flex min-h-11 items-start gap-3 py-2.5">
      <Checkbox
        id={id}
        name={name}
        value={value}
        className="mt-0.5"
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
        {...(error ? { "aria-invalid": true, "aria-describedby": messageId } : {})}
      />
      <Label htmlFor={id} className="font-medium">
        {children}
      </Label>
    </div>
  );
}

/** A set of checkboxes bound to an array of chosen values. */
export function CheckboxGroupField<T extends FieldValues, TOut>({
  control,
  name,
  label,
  description,
  htmlName,
  options,
  idPrefix,
}: BaseFieldProps<T, TOut> & {
  readonly options: readonly { readonly value: string; readonly label: ReactNode }[];
  readonly idPrefix: string;
}) {
  return (
    <Bound
      control={control}
      name={name}
      render={({ field }) => {
        const chosen: readonly string[] = Array.isArray(field.value) ? field.value : [];
        return (
          <FormItem>
            <FieldSet className="gap-1">
              <FieldLegend className="text-sm">{label}</FieldLegend>
              {description ? <FormDescription>{description}</FormDescription> : null}
              <div className="grid gap-x-6 md:grid-cols-2">
                {options.map((option) => (
                  <GroupCheckbox
                    key={option.value}
                    id={`${idPrefix}-${option.value}`}
                    name={htmlName ?? field.name}
                    value={option.value}
                    checked={chosen.includes(option.value)}
                    onCheckedChange={(checked) =>
                      field.onChange(
                        checked
                          ? [...chosen, option.value]
                          : chosen.filter((value) => value !== option.value),
                      )
                    }
                  >
                    {option.label}
                  </GroupCheckbox>
                ))}
              </div>
              <FormMessage />
            </FieldSet>
          </FormItem>
        );
      }}
    />
  );
}

export function DateField<T extends FieldValues, TOut>({
  control,
  name,
  label,
  required,
  htmlName,
  locale,
  placeholder,
}: BaseFieldProps<T, TOut> & {
  readonly locale: Locale;
  readonly placeholder: string;
}) {
  return (
    <Bound
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel required={required === true}>{label}</FormLabel>
          <FormControl>
            <DatePicker
              name={htmlName ?? field.name}
              locale={locale}
              value={String(field.value ?? "")}
              onValueChange={field.onChange}
              placeholder={placeholder}
              {...(required ? { required: true } : {})}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function TimeField<T extends FieldValues, TOut>({
  control,
  name,
  label,
  required,
  htmlName,
  locale,
  placeholder,
}: BaseFieldProps<T, TOut> & {
  readonly locale: Locale;
  readonly placeholder: string;
}) {
  return (
    <Bound
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel required={required === true}>{label}</FormLabel>
          <FormControl>
            <TimeSelect
              name={htmlName ?? field.name}
              locale={locale}
              value={String(field.value ?? "")}
              onValueChange={field.onChange}
              placeholder={placeholder}
              {...(required ? { required: true } : {})}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/**
 * A date and a time composed from the foundation pickers. It writes the same
 * `YYYY-MM-DDTHH:MM` hidden value the native datetime-local input submitted.
 */
function DateTimeControl({
  id,
  name,
  locale,
  value,
  onValueChange,
  datePlaceholder,
  timePlaceholder,
  timeLabel,
  required,
  ...aria
}: {
  readonly id?: string;
  readonly name: string;
  readonly locale: Locale;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly datePlaceholder: string;
  readonly timePlaceholder: string;
  readonly timeLabel: string;
  readonly required?: boolean;
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: boolean;
}) {
  const [initialDate = "", initialTime = ""] = value.split("T");
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime.slice(0, 5));
  // Follow a value set from outside (a reset to a fresh authoritative read).
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value) {
      setDate(initialDate);
      setTime(initialTime.slice(0, 5));
    }
  }
  const combine = (nextDate: string, nextTime: string) =>
    onValueChange(nextDate && nextTime ? `${nextDate}T${nextTime}` : "");
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
      <input type="hidden" name={name} value={value} />
      <DatePicker
        {...(id ? { id } : {})}
        locale={locale}
        value={date}
        onValueChange={(next) => {
          setDate(next);
          combine(next, time);
        }}
        placeholder={datePlaceholder}
        {...(required ? { required: true } : {})}
        {...aria}
      />
      <TimeSelect
        locale={locale}
        value={time}
        onValueChange={(next) => {
          setTime(next);
          combine(date, next);
        }}
        placeholder={timePlaceholder}
        aria-label={timeLabel}
        {...(required ? { required: true } : {})}
      />
    </div>
  );
}

export function DateTimeField<T extends FieldValues, TOut>({
  control,
  name,
  label,
  required,
  htmlName,
  locale,
  datePlaceholder,
  timePlaceholder,
  timeLabel,
}: BaseFieldProps<T, TOut> & {
  readonly locale: Locale;
  readonly datePlaceholder: string;
  readonly timePlaceholder: string;
  readonly timeLabel: string;
}) {
  return (
    <Bound
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel required={required === true}>{label}</FormLabel>
          <FormControl>
            <DateTimeControl
              name={htmlName ?? field.name}
              locale={locale}
              value={String(field.value ?? "")}
              onValueChange={field.onChange}
              datePlaceholder={datePlaceholder}
              timePlaceholder={timePlaceholder}
              timeLabel={timeLabel}
              {...(required ? { required: true } : {})}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
