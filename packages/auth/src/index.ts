import {
  capabilityNames,
  type CapabilityGrantDto,
  type CapabilityName,
  type LocationScopeDto,
} from "@wlbp/api-contracts";

export const capabilities = capabilityNames;
export type Capability = CapabilityName;
export type CapabilityGrant = CapabilityGrantDto;
export type LocationScope = LocationScopeDto;

export interface VerifiedClaims {
  readonly aal?: unknown;
  readonly amr?: unknown;
  readonly iat?: unknown;
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
  readonly aal2VerifiedAtEpochSeconds?: number;
  readonly assuranceLevel: "aal1" | "aal2";
}

function aal2VerificationTime(claims: VerifiedClaims): number | undefined {
  if (claims.aal !== "aal2" || !Array.isArray(claims.amr)) return undefined;
  const factorMethods = new Set(["phone", "totp", "webauthn"]);
  const timestamps = claims.amr.flatMap((entry) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("method" in entry) ||
      !("timestamp" in entry) ||
      typeof entry.method !== "string" ||
      !factorMethods.has(entry.method) ||
      typeof entry.timestamp !== "number" ||
      !Number.isSafeInteger(entry.timestamp) ||
      entry.timestamp < 0
    ) {
      return [];
    }
    return [entry.timestamp];
  });
  return timestamps.length === 0 ? undefined : Math.max(...timestamps);
}

export async function getVerifiedIdentity(
  client: VerifiedClaimsClient,
): Promise<VerifiedIdentity | null> {
  const { data, error } = await client.auth.getClaims();
  if (error !== null || data === null || typeof data.claims.sub !== "string") {
    return null;
  }

  const accountId = data.claims.sub.trim();
  const aal = data.claims.aal ?? "aal1";
  if (accountId === "" || (aal !== "aal1" && aal !== "aal2")) {
    return null;
  }

  const aal2VerifiedAtEpochSeconds = aal2VerificationTime(data.claims);
  return Object.freeze({
    accountId,
    assuranceLevel: aal,
    ...(aal2VerifiedAtEpochSeconds === undefined ? {} : { aal2VerifiedAtEpochSeconds }),
  });
}

export function hasRecentAal2(
  identity: VerifiedIdentity,
  nowEpochSeconds: number,
  maximumAgeSeconds: number,
): boolean {
  return (
    identity.assuranceLevel === "aal2" &&
    identity.aal2VerifiedAtEpochSeconds !== undefined &&
    Number.isSafeInteger(nowEpochSeconds) &&
    Number.isSafeInteger(maximumAgeSeconds) &&
    maximumAgeSeconds > 0 &&
    identity.aal2VerifiedAtEpochSeconds <= nowEpochSeconds &&
    nowEpochSeconds - identity.aal2VerifiedAtEpochSeconds <= maximumAgeSeconds
  );
}

export interface Membership {
  readonly accountId: string;
  readonly grants: readonly CapabilityGrant[];
  readonly locationScope: LocationScope;
  readonly status: "active" | "invited" | "suspended" | "revoked";
  readonly tenantId: string;
}

export interface AuthorizationContext {
  readonly approvalSatisfied?: boolean;
  readonly locationId?: string;
  readonly locationRequired?: boolean;
  readonly ownsResource?: boolean;
  readonly recentAal2Required?: boolean;
  readonly maximumStepUpAgeSeconds?: number;
  readonly nowEpochSeconds?: number;
}

export type AuthorizationDecision =
  | { readonly allowed: true; readonly grant: CapabilityGrant }
  | {
      readonly allowed: false;
      readonly reason:
        | "identity_mismatch"
        | "membership_inactive"
        | "capability_denied"
        | "approval_required"
        | "ownership_scope_denied"
        | "location_context_required"
        | "location_scope_denied"
        | "step_up_required";
    };

export function authorize(
  identity: VerifiedIdentity,
  membership: Membership,
  capability: Capability,
  context: AuthorizationContext = {},
): AuthorizationDecision {
  if (identity.accountId !== membership.accountId) {
    return { allowed: false, reason: "identity_mismatch" };
  }
  if (membership.status !== "active") {
    return { allowed: false, reason: "membership_inactive" };
  }

  const grant = membership.grants.find((item) => item.capability === capability);
  if (grant === undefined) return { allowed: false, reason: "capability_denied" };
  if (grant.requiresApproval && context.approvalSatisfied !== true) {
    return { allowed: false, reason: "approval_required" };
  }
  if (grant.scope === "own" && context.ownsResource !== true) {
    return { allowed: false, reason: "ownership_scope_denied" };
  }
  if (
    context.locationId === undefined &&
    (context.locationRequired === true ||
      grant.scope === "location" ||
      membership.locationScope.kind === "restricted")
  ) {
    return { allowed: false, reason: "location_context_required" };
  }
  if (
    context.locationId !== undefined &&
    membership.locationScope.kind === "restricted" &&
    !membership.locationScope.locationIds.includes(context.locationId)
  ) {
    return { allowed: false, reason: "location_scope_denied" };
  }
  if (
    context.recentAal2Required === true &&
    !hasRecentAal2(
      identity,
      context.nowEpochSeconds ?? -1,
      context.maximumStepUpAgeSeconds ?? 0,
    )
  ) {
    return { allowed: false, reason: "step_up_required" };
  }

  return { allowed: true, grant };
}
