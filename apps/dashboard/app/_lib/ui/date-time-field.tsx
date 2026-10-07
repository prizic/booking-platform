"use client";

import type { Locale } from "@wlbp/i18n";
import { DatePicker, TimeSelect } from "@wlbp/ui-foundation";
import { useId } from "react";

/**
 * A controlled local date + time for React Hook Form, composed from the design
 * system's DatePicker and TimeSelect (the foundation DateTimePicker keeps its
 * own state). The value is `YYYY-MM-DDTHH:MM`; a half-chosen value keeps its
 * half (`YYYY-MM-DDT` or `T09:00`) so the schema can say what is missing. The
 * complete value is mirrored into a hidden input under `name`, exactly where a
 * native datetime-local input would put it.
 */
export function DateTimeField({
  id,
  name,
  value,
  onChange,
  onBlur,
  locale,
  datePlaceholder,
  timePlaceholder,
  timeLabel,
  disabled,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: {
  readonly id?: string;
  readonly name: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onBlur?: () => void;
  readonly locale: Locale;
  readonly datePlaceholder: string;
  readonly timePlaceholder: string;
  /** Accessible name for the time half, e.g. "New time, time". */
  readonly timeLabel: string;
  readonly disabled?: boolean;
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: boolean;
}) {
  const timeId = useId();
  const [date = "", time = ""] = value.split("T");
  const combine = (nextDate: string, nextTime: string) =>
    nextDate === "" && nextTime === "" ? "" : `${nextDate}T${nextTime}`;
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
      <input
        type="hidden"
        name={name}
        value={date !== "" && time !== "" ? `${date}T${time}` : ""}
      />
      <DatePicker
        {...(id === undefined ? {} : { id })}
        locale={locale}
        value={date}
        onValueChange={(next) => {
          onChange(combine(next, time));
          onBlur?.();
        }}
        placeholder={datePlaceholder}
        {...(disabled === undefined ? {} : { disabled })}
        {...(describedBy === undefined ? {} : { "aria-describedby": describedBy })}
        {...(invalid === undefined ? {} : { "aria-invalid": invalid })}
      />
      <TimeSelect
        id={timeId}
        locale={locale}
        value={time}
        onValueChange={(next) => {
          onChange(combine(date, next));
          onBlur?.();
        }}
        placeholder={timePlaceholder}
        aria-label={timeLabel}
        {...(disabled === undefined ? {} : { disabled })}
        {...(invalid === undefined ? {} : { "aria-invalid": invalid })}
      />
    </div>
  );
}
