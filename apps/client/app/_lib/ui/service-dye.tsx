import { ServiceDyeDot } from "@wlbp/ui-foundation";

/** A small decorative dot in the service's dye (shared with the Dashboard's bands). */
export function ServiceDye({
  className,
  serviceKey,
}: {
  readonly className?: string;
  readonly serviceKey: string;
}) {
  return (
    <ServiceDyeDot serviceKey={serviceKey} {...(className ? { className } : {})} />
  );
}
