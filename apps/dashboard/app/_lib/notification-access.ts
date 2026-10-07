import type { CapabilityName, DashboardContextV1 } from "@wlbp/api-contracts";
import { DashboardRpcError } from "./dashboard-data-source";

/**
 * Whether the membership holds a capability directly, tenant-wide. This only
 * decides what the page offers; the database re-checks every read and write.
 */
export function hasDirectCapability(
  context: Pick<DashboardContextV1, "grants">,
  capability: CapabilityName,
): boolean {
  return context.grants.some(
    (grant) =>
      grant.capability === capability &&
      grant.scope === "tenant" &&
      !grant.requiresApproval,
  );
}

/** The platform's stable error string from a failed RPC, or "". */
export function stableRpcMessage(error: unknown): string {
  return error instanceof DashboardRpcError ? (error.stableMessage ?? "") : "";
}

/**
 * The secret name a tenant's WhatsApp token must be stored under:
 * `WHATSAPP_TOKEN_` + the tenant id without hyphens, upper case. The worker
 * refuses any `env:` reference that does not carry the tenant's own id.
 */
export function whatsAppTokenReferenceFor(tenantId: string): string {
  return `env:WHATSAPP_TOKEN_${tenantId.replaceAll("-", "").toUpperCase()}`;
}

/** True for `env:WHATSAPP_TOKEN_<this tenant>[_SUFFIX]` and any `vault:<uuid>`. */
export function isOwnWhatsAppTokenReference(
  reference: string,
  tenantId: string,
): boolean {
  if (
    /^vault:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(
      reference,
    )
  )
    return true;
  const own = whatsAppTokenReferenceFor(tenantId);
  return (
    reference === own || new RegExp(`^${own}_[A-Z0-9]{1,16}$`, "u").test(reference)
  );
}
