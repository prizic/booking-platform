"use client";
import type { ReactNode } from "react";
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
 * A dangerous action guarded by an AlertDialog. The trigger only opens the
 * dialog; `onConfirm` runs from the dialog's confirm button alone. Callers add
 * the explicit confirmation literal (`confirm: "yes"`) to the mutation input
 * there and nowhere else, and the server schema still requires it, so no
 * other path can carry it.
 */
export function ConfirmAction({
  label,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  destructive = false,
  variant,
  pending = false,
  pendingLabel,
  disabled = false,
  size,
}: {
  readonly label: ReactNode;
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly confirmLabel: ReactNode;
  readonly cancelLabel: ReactNode;
  readonly onConfirm: () => void;
  readonly destructive?: boolean;
  readonly variant?: ButtonVariant;
  readonly pending?: boolean;
  readonly pendingLabel?: ReactNode;
  readonly disabled?: boolean;
  readonly size?: "default" | "sm";
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
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
          <AlertDialogAction destructive={destructive} onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
