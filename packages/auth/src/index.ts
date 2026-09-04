export const capabilities = [
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
] as const;

export type Capability = (typeof capabilities)[number];

export interface VerifiedClaims {
  readonly sub?: unknown;
  readonly [claim: string]: unknown;
}

export interface VerifiedClaimsClient {
  readonly auth: {
    readonly getClaims: () => Promise<{
      readonly data: { readonly claims: VerifiedClaims } | null;
      readonly error: { readonly message?: string } | null;
    }>;
  };
}

export interface VerifiedIdentity {
  readonly accountId: string;
}

export async function getVerifiedIdentity(
  client: VerifiedClaimsClient,
): Promise<VerifiedIdentity | null> {
  const { data, error } = await client.auth.getClaims();

  if (error !== null || data === null || typeof data.claims.sub !== "string") {
    return null;
  }

  const accountId = data.claims.sub.trim();
  return accountId === "" ? null : Object.freeze({ accountId });
}

export interface Membership {
  readonly accountId: string;
  readonly capabilities: readonly Capability[];
  readonly locationIds: readonly string[] | null;
  readonly status: "active" | "invited" | "suspended" | "revoked";
  readonly tenantId: string;
}

export type AuthorizationDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason:
        | "identity_mismatch"
        | "membership_inactive"
        | "capability_denied"
        | "location_scope_denied";
    };

export function authorize(
  identity: VerifiedIdentity,
  membership: Membership,
  capability: Capability,
  locationId?: string,
): AuthorizationDecision {
  if (identity.accountId !== membership.accountId) {
    return { allowed: false, reason: "identity_mismatch" };
  }

  if (membership.status !== "active") {
    return { allowed: false, reason: "membership_inactive" };
  }

  if (!membership.capabilities.includes(capability)) {
    return { allowed: false, reason: "capability_denied" };
  }

  if (
    locationId !== undefined &&
    membership.locationIds !== null &&
    !membership.locationIds.includes(locationId)
  ) {
    return { allowed: false, reason: "location_scope_denied" };
  }

  return { allowed: true };
}
