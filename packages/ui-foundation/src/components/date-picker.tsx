"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useId, useState, type Ref } from "react";
import { DayPicker, type DayPickerProps } from "react-day-picker";
// DayPicker locales extend date-fns with translated navigation and grid labels.
import { ar as arLocale, enUS } from "react-day-picker/locale";

import { cn } from "../lib/cn.js";
import { buttonVariants } from "./button.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./form-controls.js";
import { Popover, PopoverContent, PopoverTrigger } from "./overlays.js";

type PickerLocale = "ar" | "en";

/** A month grid in the design system; RTL, Arabic numerals and Saturday/Sunday starts follow the locale. */
export function Calendar({
  className,
  language = "en",
  ...props
}: DayPickerProps & { language?: PickerLocale }) {
  const arabic = language === "ar";
  return (
    <DayPicker
      {...props}
      dir={arabic ? "rtl" : "ltr"}
      locale={arabic ? arLocale : enUS}
      numerals={arabic ? "arab" : "latn"}
      weekStartsOn={arabic ? 6 : 0}
      showOutsideDays
      className={cn("p-1 [--cell:2.5rem]", className)}
      classNames={{
        months: "relative flex flex-col gap-4",
        month: "grid gap-3",
        month_caption: "flex h-10 items-center justify-center px-10",
        caption_label: "text-sm font-semibold",
        nav: "absolute inset-x-0 top-0 flex h-10 items-center justify-between",
        button_previous: cn(buttonVariants({ variant: "ghost", size: "icon-sm" })),
        button_next: cn(buttonVariants({ variant: "ghost", size: "icon-sm" })),
        month_grid: "border-collapse",
        weekdays: "flex",
        weekday:
          "w-(--cell) text-center text-[0.75rem] font-medium text-muted-foreground",
        week: "mt-1 flex",
        day: "size-(--cell) p-0 text-center text-sm",
        day_button:
          "size-(--cell) rounded-md font-medium [font-variant-numeric:tabular-nums] transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:hover:bg-primary",
        today: "[&>button]:ring-1 [&>button]:ring-primary/50 [&>button]:text-primary",
        outside: "text-muted-foreground/60",
        disabled: "opacity-35 [&>button]:pointer-events-none",
        hidden: "invisible",
      }}
      components={{
        Chevron: ({ orientation, className: chevronClass }) =>
          orientation === "left" ? (
            <ChevronLeft aria-hidden="true" className={cn("size-4", chevronClass)} />
          ) : (
            <ChevronRight aria-hidden="true" className={cn("size-4", chevronClass)} />
          ),
      }}
    />
  );
}

function toIsoDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromIsoDate(value: string | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  return new Date(year, month - 1, day);
}

function formatDisplay(date: Date, locale: PickerLocale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-u-nu-arab" : "en", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export interface DatePickerProps {
  /** Lets React Hook Form focus the trigger on a validation error. */
  readonly ref?: Ref<HTMLButtonElement>;
  /** Form field name; the value is submitted as YYYY-MM-DD like a native date input. */
  readonly name?: string;
  readonly id?: string;
  readonly locale: PickerLocale;
  readonly defaultValue?: string;
  readonly value?: string;
  readonly onValueChange?: (value: string) => void;
  /** Earliest/latest selectable day, YYYY-MM-DD. */
  readonly min?: string;
  readonly max?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly placeholder: string;
  readonly className?: string;
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: boolean;
  readonly form?: string;
}

/** Date field: a button that opens the month grid; submits YYYY-MM-DD under `name`. */
export function DatePicker({
  ref,
  name,
  id,
  locale,
  defaultValue,
  value,
  onValueChange,
  min,
  max,
  required,
  disabled,
  placeholder,
  className,
  form,
  ...aria
}: DatePickerProps) {
  const [internal, setInternal] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const current = value ?? internal;
  const selected = fromIsoDate(current);
  const minDate = fromIsoDate(min);
  const maxDate = fromIsoDate(max);
  const disabledDays = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ];

  return (
    <>
      {name ? (
        <input
          type="hidden"
          name={name}
          value={current}
          required={required}
          {...(form ? { form } : {})}
        />
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            ref={ref}
            type="button"
            id={id}
            disabled={disabled}
            aria-describedby={aria["aria-describedby"]}
            data-invalid={aria["aria-invalid"] ? "true" : undefined}
            data-empty={selected ? undefined : "true"}
            className={cn(
              "flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-start text-base text-foreground shadow-xs transition-[border-color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60 data-[invalid=true]:border-destructive data-[empty=true]:text-muted-foreground md:text-sm",
              className,
            )}
          >
            <span className="truncate">
              {selected ? formatDisplay(selected, locale) : placeholder}
            </span>
            <CalendarDays aria-hidden="true" className="size-4 shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <Calendar
            language={locale}
            mode="single"
            {...(selected ? { selected } : {})}
            {...((selected ?? minDate)
              ? { defaultMonth: (selected ?? minDate) as Date }
              : {})}
            disabled={disabledDays}
            onSelect={(date: Date | undefined) => {
              const next = date ? toIsoDate(date) : "";
              setInternal(next);
              onValueChange?.(next);
              setOpen(false);
            }}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    </>
  );
}

function timeOptions(stepMinutes: number): string[] {
  const options: string[] = [];
  for (let minute = 0; minute < 24 * 60; minute += stepMinutes) {
    options.push(
      `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`,
    );
  }
  return options;
}

function formatTime(value: string, locale: PickerLocale): string {
  const [hour, minute] = value.split(":").map(Number) as [number, number];
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-u-nu-arab" : "en", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, 0, 1, hour, minute)));
}

export interface TimeSelectProps {
  /** Lets React Hook Form focus the trigger on a validation error. */
  readonly ref?: Ref<HTMLButtonElement>;
  readonly name?: string;
  readonly id?: string;
  readonly locale: PickerLocale;
  readonly defaultValue?: string;
  readonly value?: string;
  readonly onValueChange?: (value: string) => void;
  readonly stepMinutes?: number;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly placeholder: string;
  readonly className?: string;
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: boolean;
  readonly "aria-label"?: string;
}

/** Time field as a select of HH:MM steps; submits HH:MM like a native time input. */
export function TimeSelect({
  ref,
  name,
  id,
  locale,
  defaultValue,
  value,
  onValueChange,
  stepMinutes = 15,
  required,
  disabled,
  placeholder,
  className,
  ...aria
}: TimeSelectProps) {
  const options = timeOptions(stepMinutes);
  // Keep an off-grid saved time (e.g. 12:07) selectable instead of showing blank.
  const extra = [...new Set([value, defaultValue])].filter(
    (candidate): candidate is string =>
      Boolean(candidate) && !options.includes(candidate as string),
  );
  return (
    <Select
      {...(name ? { name } : {})}
      {...(value !== undefined ? { value } : {})}
      {...(defaultValue ? { defaultValue } : {})}
      {...(onValueChange ? { onValueChange } : {})}
      {...(required ? { required } : {})}
      {...(disabled ? { disabled } : {})}
    >
      <SelectTrigger
        ref={ref}
        id={id}
        className={className}
        aria-describedby={aria["aria-describedby"]}
        aria-invalid={aria["aria-invalid"]}
        aria-label={aria["aria-label"]}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {[...extra, ...options].sort().map((option) => (
          <SelectItem key={option} value={option}>
            {formatTime(option, locale)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Date + time pair that submits `YYYY-MM-DDTHH:MM` under `name`, exactly like
 * a native datetime-local input, so server parsing stays unchanged.
 */
export function DateTimePicker({
  name,
  id,
  locale,
  defaultValue,
  required,
  disabled,
  datePlaceholder,
  timePlaceholder,
  timeLabel,
  stepMinutes = 15,
  min,
  max,
  className,
  ...aria
}: {
  readonly name: string;
  readonly id?: string;
  readonly locale: PickerLocale;
  readonly defaultValue?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly datePlaceholder: string;
  readonly timePlaceholder: string;
  /** Accessible name for the time half, e.g. "Start time". */
  readonly timeLabel: string;
  readonly stepMinutes?: number;
  readonly min?: string;
  readonly max?: string;
  readonly className?: string;
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: boolean;
}) {
  const [initialDate, initialTime] = (defaultValue ?? "").split("T");
  const [date, setDate] = useState(initialDate ?? "");
  const [time, setTime] = useState((initialTime ?? "").slice(0, 5));
  const timeId = useId();
  const combined = date && time ? `${date}T${time}` : "";
  return (
    <div className={cn("grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]", className)}>
      <input type="hidden" name={name} value={combined} required={required} />
      <DatePicker
        {...(id ? { id } : {})}
        locale={locale}
        value={date}
        onValueChange={setDate}
        {...(min ? { min: min.slice(0, 10) } : {})}
        {...(max ? { max: max.slice(0, 10) } : {})}
        {...(required ? { required } : {})}
        {...(disabled ? { disabled } : {})}
        placeholder={datePlaceholder}
        {...aria}
      />
      <TimeSelect
        id={timeId}
        locale={locale}
        value={time}
        onValueChange={setTime}
        stepMinutes={stepMinutes}
        {...(required ? { required } : {})}
        {...(disabled ? { disabled } : {})}
        placeholder={timePlaceholder}
        aria-label={timeLabel}
      />
    </div>
  );
}
