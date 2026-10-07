"use client";
import { useRef, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  type ButtonVariant,
} from "@wlbp/ui-foundation";

/**
 * A dangerous submit guarded by an AlertDialog. Rendered inside the form it
 * submits. The explicit confirmation field (`confirm=yes` by default) is only
 * enabled for the instant the operator confirms in the dialog, so the server
 * still receives exactly the confirmation it already requires and no other
 * submission path can carry it.
 */
export function ConfirmSubmit({
  label,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  variant,
  pending = false,
  pendingLabel,
  disabled = false,
  confirmField = { name: "confirm", value: "yes" },
  size,
}: {
  readonly label: ReactNode;
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly confirmLabel: ReactNode;
  readonly cancelLabel: ReactNode;
  readonly destructive?: boolean;
  readonly variant?: ButtonVariant;
  readonly pending?: boolean;
  readonly pendingLabel?: ReactNode;
  readonly disabled?: boolean;
  readonly confirmField?: { readonly name: string; readonly value: string } | null;
  readonly size?: "default" | "sm";
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  function submit() {
    const form = triggerRef.current?.form;
    if (!form) return;
    const field = fieldRef.current;
    if (field) field.disabled = false;
    try {
      // FormData is collected synchronously during the submit event.
      form.requestSubmit();
    } finally {
      if (field) field.disabled = true;
    }
  }
  return (
    <>
      {confirmField ? (
        <input
          ref={fieldRef}
          type="hidden"
          name={confirmField.name}
          value={confirmField.value}
          disabled
        />
      ) : null}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            ref={triggerRef}
            type="button"
            variant={variant ?? (destructive ? "destructive" : "default")}
            loading={pending}
            disabled={disabled}
            {...(size ? { size } : {})}
            {...(pendingLabel === undefined ? {} : { loadingLabel: pendingLabel })}
          >
            {label}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
            <AlertDialogAction destructive={destructive} onClick={submit}>
              {confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
