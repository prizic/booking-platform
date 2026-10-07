import { cn } from "@wlbp/ui-foundation";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/** An inline record link (table cells, facts, ledgers). */
export function TextLink({ className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        "rounded-sm font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    />
  );
}

/** A quieter second line under a cell's main value. */
export function SubText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "mt-0.5 block text-xs leading-relaxed text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A machine code (error code, step key, provider id): Latin, left-to-right, isolated. */
export function MachineCode({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <bdi dir="ltr" className={cn("font-latin text-xs break-all", className)}>
      {children}
    </bdi>
  );
}

/** A dated event ledger: one ruled list, time on the start side. */
export function Ledger({ children }: { children: ReactNode }) {
  return <ol className="divide-y rounded-lg border bg-card">{children}</ol>;
}

export function LedgerItem({
  time,
  children,
}: {
  time: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="grid gap-1.5 px-4 py-3 text-sm md:grid-cols-[13rem_minmax(0,1fr)] md:gap-4">
      <span className="text-muted-foreground">{time}</span>
      <div className="grid min-w-0 gap-1">{children}</div>
    </li>
  );
}
