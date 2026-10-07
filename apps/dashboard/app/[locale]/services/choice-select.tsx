"use client";
import { useState, type ReactNode, type Ref } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wlbp/ui-foundation";

export interface ChoiceOption {
  readonly value: string;
  readonly label: ReactNode;
  readonly disabled?: boolean;
}

/**
 * A Radix select that submits `name` like a native select. Radix forbids an
 * empty item value: an unset required choice shows `placeholder` instead, and
 * an optional "none" choice uses an explicit sentinel the schema understands.
 *
 * The chosen label is rendered by the trigger itself, so server-rendered
 * markup already shows the current choice before hydration. Inside a
 * FormControl it receives the control id and aria wiring on its trigger.
 */
export function ChoiceSelect({
  id,
  name,
  options,
  placeholder,
  defaultValue,
  value,
  onValueChange,
  onBlur,
  triggerRef,
  required,
  disabled,
  invalid,
  describedBy,
  className,
  size,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: {
  readonly id?: string;
  readonly name: string;
  readonly options: readonly ChoiceOption[];
  readonly placeholder?: ReactNode;
  readonly defaultValue?: string | undefined;
  readonly value?: string | undefined;
  readonly onValueChange?: (value: string) => void;
  readonly onBlur?: () => void;
  readonly triggerRef?: Ref<HTMLButtonElement>;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly describedBy?: string | undefined;
  readonly className?: string;
  readonly size?: "default" | "sm";
  readonly "aria-invalid"?: boolean | "true" | "false";
  readonly "aria-describedby"?: string;
}) {
  const [own, setOwn] = useState(defaultValue ?? "");
  const current = value ?? own;
  const chosen = options.find((option) => option.value === current);
  const describedById = ariaDescribedBy ?? describedBy;
  return (
    <Select
      name={name}
      value={current}
      onValueChange={(next) => {
        setOwn(next);
        onValueChange?.(next);
      }}
      {...(required ? { required: true } : {})}
      {...(disabled ? { disabled: true } : {})}
    >
      <SelectTrigger
        {...(id ? { id } : {})}
        {...(triggerRef ? { ref: triggerRef } : {})}
        className={className}
        {...(onBlur ? { onBlur } : {})}
        {...(size ? { size } : {})}
        {...(invalid || ariaInvalid === true || ariaInvalid === "true"
          ? { "aria-invalid": true }
          : {})}
        {...(describedById ? { "aria-describedby": describedById } : {})}
      >
        <SelectValue placeholder={placeholder}>{chosen?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            {...(option.disabled ? { disabled: true } : {})}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
