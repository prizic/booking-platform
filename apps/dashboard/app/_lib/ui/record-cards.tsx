import { cn } from "@wlbp/ui-foundation";
import type { ReactNode } from "react";

/**
 * Below `md` a wide table reads as stacked cards instead of scrolling the
 * page sideways. The table renders from `md` up (wrap it in TableFrame); the
 * cards render below it. Each card states every column as label and value.
 */
export function RecordCards({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <ul aria-label={label} className="grid gap-3 md:hidden">
      {children}
    </ul>
  );
}

export function RecordCard({
  title,
  aside,
  facts,
  actions,
}: {
  readonly title: ReactNode;
  readonly aside?: ReactNode;
  readonly facts: ReadonlyArray<{
    readonly key: string;
    readonly label: ReactNode;
    readonly value: ReactNode;
  }>;
  readonly actions?: ReactNode;
}) {
  return (
    <li className="grid min-w-0 gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 gap-1">{title}</div>
        {aside}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {facts.map((fact) => (
          <div key={fact.key} className="grid min-w-0 gap-0.5">
            <dt className="text-xs font-semibold text-muted-foreground">
              {fact.label}
            </dt>
            <dd className="min-w-0 break-words text-foreground">{fact.value}</dd>
          </div>
        ))}
      </dl>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </li>
  );
}

/** Shows its table from `md` up; RecordCards cover narrower screens. */
export function TableFrame({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <div className={cn("hidden min-w-0 md:block", className)}>{children}</div>;
}
