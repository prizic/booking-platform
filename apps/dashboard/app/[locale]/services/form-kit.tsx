/*
 * Small compositions of @wlbp/ui-foundation primitives shared by the Operate
 * editors (catalog, team, availability, brand, settings, audit filters).
 * No styles of their own beyond Tailwind utilities.
 */
import type { ReactNode } from "react";
import { cn } from "@wlbp/ui-foundation";

export { ChoiceSelect, type ChoiceOption } from "./choice-select";

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
