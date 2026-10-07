import { cn, ServiceDyeDot } from "@wlbp/ui-foundation";
import type { ReactNode } from "react";

/** A service name led by its dye dot. The dot is decoration; the name carries meaning. */
export function ServiceDye({
  name,
  children,
  className,
}: {
  readonly name: string;
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-baseline gap-2", className)}>
      <ServiceDyeDot serviceKey={name} className="translate-y-px" />
      <span className="min-w-0 break-words">{children ?? <bdi>{name}</bdi>}</span>
    </span>
  );
}
