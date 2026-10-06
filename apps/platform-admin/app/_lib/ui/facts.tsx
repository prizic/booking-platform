import type { ReactNode } from "react";

export function Facts({
  items,
}: {
  items: readonly (readonly [label: string, value: ReactNode])[];
}) {
  return (
    <dl className="facts">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
