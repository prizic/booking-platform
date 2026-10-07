"use client";

import {
  Field,
  FieldDescription,
  Label,
  RequiredMark,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wlbp/ui-foundation";
import { useId } from "react";

/**
 * A labelled select for forms and dialogs. Like the native select it replaces,
 * it starts on the first option when no value is given, so a required field is
 * never submitted empty. Option values must not be "" (Radix forbids it).
 */
export function SelectField({
  name,
  label,
  options,
  value,
  required = true,
  id,
  description,
}: {
  name: string;
  label: string;
  options: readonly (readonly [value: string, label: string])[];
  value?: string | undefined;
  required?: boolean;
  id?: string;
  description?: string;
}) {
  const generated = useId();
  const fieldId = id ?? `${generated}-select`;
  const descriptionId = description ? `${fieldId}-description` : undefined;
  const initial = options.some(([optionValue]) => optionValue === value)
    ? value
    : options[0]?.[0];
  return (
    <Field>
      <Label htmlFor={fieldId}>
        {label}
        {required ? <RequiredMark /> : null}
      </Label>
      {description ? (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      ) : null}
      <Select
        name={name}
        required={required}
        {...(initial ? { defaultValue: initial } : {})}
      >
        <SelectTrigger
          id={fieldId}
          {...(descriptionId ? { "aria-describedby": descriptionId } : {})}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
