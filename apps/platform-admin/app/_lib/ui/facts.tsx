import { Facts as FoundationFacts } from "@wlbp/ui-foundation";
import type { ReactNode } from "react";

/** A record's label/value pairs, rendered as a description list. */
export function Facts({
  items,
  columns = 2,
  className,
}: {
  items: readonly (readonly [label: string, value: ReactNode])[];
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <FoundationFacts
      columns={columns}
      {...(className ? { className } : {})}
      items={items.map(([label, value]) => ({ key: label, label, value }))}
    />
  );
}
