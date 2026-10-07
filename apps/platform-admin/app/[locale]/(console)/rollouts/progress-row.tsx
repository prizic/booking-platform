import { cn } from "@wlbp/ui-foundation";
import type { ReactNode } from "react";

export type ProgressTone = "positive" | "danger" | "warning" | "neutral";

const fill: Record<ProgressTone, string> = {
  positive: "bg-success",
  danger: "bg-destructive",
  warning: "bg-warning",
  neutral: "bg-border-strong",
};

/**
 * A compact progress row: a segmented bar for the eye (decorative) and the
 * same counts in text beside it, so meaning never depends on colour.
 */
export function ProgressRow({
  segments,
  total,
  children,
  className,
}: {
  segments: readonly { key: string; value: number; tone: ProgressTone }[];
  total: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid min-w-40 gap-1.5", className)}>
      <div
        aria-hidden="true"
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-neutral-3"
      >
        {total > 0
          ? segments
              .filter((segment) => segment.value > 0)
              .map((segment) => (
                <span
                  key={segment.key}
                  className={cn("h-full", fill[segment.tone])}
                  style={{ width: `${(segment.value / total) * 100}%` }}
                />
              ))
          : null}
      </div>
      <div className="text-xs text-muted-foreground [font-variant-numeric:tabular-nums]">
        {children}
      </div>
    </div>
  );
}
