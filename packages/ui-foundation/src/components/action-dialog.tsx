"use client";

import type { ComponentProps, ReactElement, ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./overlays.js";

export interface ActionDialogProps extends Omit<
  ComponentProps<typeof Dialog>,
  "children"
> {
  readonly trigger?: ReactElement;
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly closeLabel: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  /** Apps can prevent dismissal while an explicit mutation is pending. */
  readonly contentProps?: Omit<
    ComponentProps<typeof DialogContent>,
    "children" | "closeLabel"
  >;
}

/** Presentation only: RHF/Zod forms, reasons, step-up, mutation and close-on-success stay app-owned. */
export function ActionDialog({
  trigger,
  title,
  description,
  closeLabel,
  children,
  footer,
  contentProps,
  ...props
}: ActionDialogProps) {
  return (
    <Dialog {...props}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent closeLabel={closeLabel} {...contentProps}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}
