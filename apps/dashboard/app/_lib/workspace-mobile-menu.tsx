"use client";
import { Menu } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  Button,
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@wlbp/ui-foundation";

/**
 * A stand-alone navigation sheet for narrow screens. The workspace frame uses
 * AppShell's own sheet; this remains for any surface that needs the menu
 * outside the frame. Radix returns focus to the trigger on Escape.
 */
export function WorkspaceMobileMenu({
  children,
  label,
  currentLabel,
}: {
  readonly children: ReactNode;
  readonly label: string;
  readonly currentLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="lg:hidden">
          <Menu aria-hidden="true" />
          {label}: {currentLabel}
        </Button>
      </SheetTrigger>
      <SheetContent
        closeLabel={label}
        aria-describedby={undefined}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a")) setOpen(false);
        }}
      >
        <SheetTitle className="sr-only">{label}</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  );
}
