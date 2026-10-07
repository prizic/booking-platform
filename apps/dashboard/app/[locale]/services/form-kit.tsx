/*
 * Small compositions of @wlbp/ui-foundation primitives shared by the Operate
 * editors (catalog, team, availability, brand, settings, audit filters).
 * No styles of their own beyond Tailwind utilities.
 */
import type { FormEvent, ReactNode } from "react";
import { Checkbox, Label, cn } from "@wlbp/ui-foundation";

/**
 * React resets uncontrolled fields after a form action settles. These editors
 * keep the operator's unsaved input (for example after a revision conflict),
 * so the reset is cancelled. Radix checkboxes and selects listen for the
 * form's `reset` event themselves, so it is also stopped before it reaches
 * the form during capture.
 */
export const keepUnsavedInput = {
  onReset: (event: FormEvent<HTMLFormElement>) => event.preventDefault(),
  onResetCapture: (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
  },
} as const;

export { ChoiceSelect, type ChoiceOption } from "./choice-select";

/** A checkbox with its visible label to the inline end; submits `name=value` when checked. */
export function CheckboxRow({
  id,
  name,
  value = "yes",
  defaultChecked,
  required,
  disabled,
  children,
  description,
  className,
}: {
  readonly id: string;
  readonly name: string;
  readonly value?: string;
  readonly defaultChecked?: boolean | undefined;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly children: ReactNode;
  readonly description?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn("flex min-h-11 items-start gap-3 py-2.5", className)}>
      <Checkbox
        id={id}
        name={name}
        value={value}
        className="mt-0.5"
        {...(defaultChecked ? { defaultChecked: true } : {})}
        {...(required ? { required: true } : {})}
        {...(disabled ? { disabled: true } : {})}
      />
      <div className="grid gap-1">
        <Label htmlFor={id} className="font-medium">
          {children}
        </Label>
        {description ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The editor's action bar: stays reachable at the bottom of long Operate
 * forms, with the primary action at the inline end.
 */
export function FormActions({
  children,
  sticky = false,
  className,
}: {
  readonly children: ReactNode;
  readonly sticky?: boolean;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-3 border-t pt-4",
        sticky && "sticky bottom-0 z-10 bg-background/95 pb-4 backdrop-blur-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}
