import { Alert, AlertDescription, SuccessState } from "@wlbp/ui-foundation";
import type { ReactNode } from "react";

/** The outcome of the last action, read from the redirect's `result`. */
export function ResultAlert({
  positive,
  children,
}: {
  readonly positive: boolean;
  readonly children: ReactNode;
}) {
  if (positive) return <SuccessState title={children} />;
  return (
    <Alert tone="warning">
      <AlertDescription className="text-foreground">{children}</AlertDescription>
    </Alert>
  );
}
