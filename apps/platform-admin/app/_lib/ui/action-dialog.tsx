"use client";

import {
  Button,
  ActionDialog as SharedActionDialog,
  DialogClose,
  type ButtonVariant,
} from "@wlbp/ui-foundation";
import { useCallback, useId, useState, type ReactNode } from "react";
import { fill, formCopy, say } from "../copy";
import { operations, type OperationKey, type OperationSpec } from "../schemas";
import { TextFormField, TextareaFormField } from "./form-fields";
import { OperatorForm, type OperatorFormProps } from "./operator-form";

function triggerStyle(
  variant: "primary" | "secondary" | "quiet",
  danger: boolean,
): ButtonVariant {
  if (variant === "primary") return danger ? "destructive" : "default";
  if (danger) return "destructive-outline";
  return variant === "quiet" ? "ghost" : "outline";
}

/**
 * A modal dialog: focus moves to the first field, Escape closes, focus returns
 * to the trigger. Destructive and high-impact actions always go through one.
 * The form mounts fresh on every open, so an earlier error, step-up or
 * idempotency key never lingers. The operation decides whether an audit
 * reason is required and its minimum length.
 */
export function ActionDialog<K extends OperationKey>({
  locale,
  operation,
  trigger,
  title,
  description,
  submit,
  successMessage,
  danger,
  triggerVariant = "secondary",
  hidden,
  values,
  confirmText,
  children,
}: Pick<
  OperatorFormProps<K>,
  "locale" | "operation" | "submit" | "successMessage" | "hidden" | "values"
> & {
  trigger: string;
  title: string;
  description?: string | undefined;
  danger?: boolean;
  triggerVariant?: "primary" | "secondary" | "quiet";
  /** The operator must type this exact text before submitting. */
  confirmText?: string;
  children?: ReactNode;
}) {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const onSuccess = useCallback(() => {
    setPending(false);
    setOpen(false);
  }, []);
  const spec: OperationSpec = operations[operation];
  const reasonMin = spec.reason;
  const startingValues = {
    ...(reasonMin !== undefined ? { reason: "" } : {}),
    ...(confirmText !== undefined ? { confirmation: "" } : {}),
    ...values,
  } as OperatorFormProps<K>["values"];

  return (
    <SharedActionDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) setOpen(next);
      }}
      title={title}
      description={description ?? ""}
      closeLabel={say(locale, formCopy.close)}
      contentProps={{
        onEscapeKeyDown: (event) => {
          if (pending) event.preventDefault();
        },
        onInteractOutside: (event) => {
          if (pending) event.preventDefault();
        },
      }}
      trigger={
        <Button variant={triggerStyle(triggerVariant, danger ?? false)}>
          {trigger}
        </Button>
      }
    >
      <OperatorForm
        key={`${operation}:${JSON.stringify(hidden ?? {})}`}
        locale={locale}
        operation={operation}
        submit={submit}
        successMessage={successMessage}
        danger={danger ?? false}
        onSuccess={onSuccess}
        onPendingChange={setPending}
        {...(hidden ? { hidden } : {})}
        {...(startingValues ? { values: startingValues } : {})}
        {...(confirmText !== undefined ? { confirmText } : {})}
        secondaryAction={
          <DialogClose asChild>
            <Button variant="ghost" disabled={pending}>
              {say(locale, formCopy.cancel)}
            </Button>
          </DialogClose>
        }
      >
        {children}
        {reasonMin !== undefined ? (
          <TextareaFormField
            id={`${fieldId}-reason`}
            name="reason"
            label={say(locale, formCopy.reason)}
            description={fill(locale, formCopy.reasonHint, { n: String(reasonMin) })}
            required
            minLength={reasonMin}
            maxLength={500}
          />
        ) : null}
        {confirmText !== undefined ? (
          <TextFormField
            id={`${fieldId}-confirm`}
            name="confirmation"
            label={fill(locale, formCopy.typeToConfirm, { value: confirmText })}
            autoComplete="off"
            required
          />
        ) : null}
      </OperatorForm>
    </SharedActionDialog>
  );
}
