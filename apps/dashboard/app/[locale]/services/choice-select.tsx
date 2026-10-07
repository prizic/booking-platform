"use client";
import { useState, type ReactNode } from "react";
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
 * an optional "none" choice uses an explicit sentinel the parser understands.
 *
 * The chosen label is rendered by the trigger itself, so server-rendered
 * markup already shows the current choice before hydration.
 */
export function ChoiceSelect({
  id,
  name,
  options,
  placeholder,
  defaultValue,
  value,
  onValueChange,
  required,
  disabled,
  invalid,
  describedBy,
  className,
  size,
}: {
  readonly id: string;
  readonly name: string;
  readonly options: readonly ChoiceOption[];
  readonly placeholder?: ReactNode;
  readonly defaultValue?: string | undefined;
  readonly value?: string | undefined;
  readonly onValueChange?: (value: string) => void;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly describedBy?: string | undefined;
  readonly className?: string;
  readonly size?: "default" | "sm";
}) {
  const [own, setOwn] = useState(defaultValue ?? "");
  const current = value ?? own;
  const chosen = options.find((option) => option.value === current);
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
        id={id}
        className={className}
        {...(size ? { size } : {})}
        {...(invalid ? { "aria-invalid": true } : {})}
        {...(describedBy ? { "aria-describedby": describedBy } : {})}
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
