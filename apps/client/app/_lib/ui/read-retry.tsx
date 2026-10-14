"use client";
import { Button } from "@wlbp/ui-foundation";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
export function ReadRetry({ label }: { readonly label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      className="mt-3"
      disabled={pending}
      aria-busy={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      {label}
    </Button>
  );
}
