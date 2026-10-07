"use client";

import type { Locale } from "@wlbp/i18n";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  FieldDescription,
  Input,
  Label,
  RequiredMark,
  Textarea,
  type ButtonVariant,
} from "@wlbp/ui-foundation";
import { useCallback, useId, useState, type ReactNode } from "react";
import { fill, formCopy, say } from "../copy";
import { OperatorForm, type FormAction } from "./operator-form";

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
 * The form is mounted fresh on every open, so an earlier error or step-up
 * never lingers.
 */
export function ActionDialog({
  locale,
  action,
  trigger,
  title,
  description,
  submit,
  successMessage,
  danger,
  triggerVariant = "secondary",
  hidden,
  reason,
  confirmText,
  children,
}: {
  locale: Locale;
  action: FormAction;
  trigger: string;
  title: string;
  description?: string | undefined;
  submit: string;
  successMessage: string;
  danger?: boolean;
  triggerVariant?: "primary" | "secondary" | "quiet";
  hidden?: Record<string, string>;
  reason?: { minLength: number };
  confirmText?: string;
  children?: ReactNode;
}) {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const onSuccess = useCallback(() => setOpen(false), []);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setTyped("");
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant={triggerStyle(triggerVariant, danger ?? false)}>
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent
        closeLabel={say(locale, formCopy.close)}
        {...(description ? {} : { "aria-describedby": undefined })}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <OperatorForm
          locale={locale}
          action={action}
          submit={submit}
          successMessage={successMessage}
          danger={danger ?? false}
          onSuccess={onSuccess}
          submitDisabled={confirmText !== undefined && typed !== confirmText}
          secondaryAction={
            <DialogClose asChild>
              <Button variant="ghost">{say(locale, formCopy.cancel)}</Button>
            </DialogClose>
          }
        >
          {Object.entries(hidden ?? {}).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {children}
          {reason ? (
            <Field>
              <Label htmlFor={`${fieldId}-reason`}>
                {say(locale, formCopy.reason)}
                <RequiredMark />
              </Label>
              <Textarea
                id={`${fieldId}-reason`}
                name="reason"
                required
                minLength={reason.minLength}
                maxLength={500}
                aria-describedby={`${fieldId}-reason-hint`}
              />
              <FieldDescription id={`${fieldId}-reason-hint`}>
                {fill(locale, formCopy.reasonHint, { n: String(reason.minLength) })}
              </FieldDescription>
            </Field>
          ) : null}
          {confirmText !== undefined ? (
            <Field>
              <Label htmlFor={`${fieldId}-confirm`}>
                {fill(locale, formCopy.typeToConfirm, { value: confirmText })}
                <RequiredMark />
              </Label>
              <Input
                id={`${fieldId}-confirm`}
                name="confirmation"
                value={typed}
                autoComplete="off"
                onChange={(event) => setTyped(event.target.value)}
                required
              />
            </Field>
          ) : null}
        </OperatorForm>
      </DialogContent>
    </Dialog>
  );
}
