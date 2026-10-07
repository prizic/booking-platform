/**
 * The global capability vocabulary (ADR-0007). A newer backend may add names;
 * parsers skip well-formed unknown names instead of failing (N-1 tolerance).
 */
export const capabilityNames = [
  "booking.view.own",
  "booking.view.any",
  "booking.create_on_behalf",
  "booking.approve",
  "booking.reschedule",
  "booking.cancel",
  "refund.issue",
  "booking.check_in",
  "booking.check_in_override",
  "booking.mark_no_show",
  "booking.complete",
  "booking.correct_status",
  "catalog.edit",
  "schedule.edit",
  "staff.manage",
  "policy.edit",
  "customer.pii.view",
  "customer.data.export",
  "customer.data.export_on_behalf",
  "customer.data.correct",
  "customer.data.delete",
  "customer.data.restrict",
  "brand.manage",
  "integration.manage",
  "billing.view",
  "billing.change_plan",
  "support.grant_access",
  "audit.read",
  "instance.request_update",
  "tenant.owner_transfer",
  "tenant.read_other_tenant",
  "role.manage",
] as const;

export type CapabilityName = (typeof capabilityNames)[number];
export type CapabilityScope = "location" | "own" | "tenant";

/** Shape every capability name has, known to this release or not. */
export const capabilityKeyPattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/u;

export function isKnownCapability(value: string): value is CapabilityName {
  return (capabilityNames as readonly string[]).includes(value);
}
