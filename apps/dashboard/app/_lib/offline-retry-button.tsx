"use client";

import { Button } from "@wlbp/ui-foundation";
import { RefreshCw } from "lucide-react";

/** Reloads the address the person asked for; the worker retries the network first. */
export function OfflineRetryButton({ label }: { readonly label: string }) {
  return (
    <Button onClick={() => window.location.reload()}>
      <RefreshCw aria-hidden="true" />
      {label}
    </Button>
  );
}
