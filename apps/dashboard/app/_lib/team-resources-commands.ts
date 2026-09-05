import type { DashboardContextV1 } from "@wlbp/api-contracts";

import type { TeamResourcesDataSource } from "./dashboard-data-source";
import { getTeamResourcesAccess } from "./team-resources-access";

type DeactivationCommandResult =
  | {
      readonly ok: true;
      readonly outcome: "cancelled" | "deactivated" | "deferred" | "reassigned";
      readonly remainingAllocationCount: number;
    }
  | {
      readonly ok: false;
      readonly code: "backend_unavailable" | "invalid_request" | "not_authorized";
    };

interface StaffDeactivationRequest {
  readonly reason: unknown;
  readonly replacementStaffId: unknown;
  readonly resolution: unknown;
  readonly staffId: unknown;
}

interface ResourceDeactivationRequest {
  readonly reason: unknown;
  readonly resolution: unknown;
  readonly resourceId: unknown;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function validUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function normalizedReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const reason = value.trim();
  return reason.length >= 1 && reason.length <= 500 ? reason : null;
}

function authorized(context: DashboardContextV1): boolean {
  return getTeamResourcesAccess(context) === "ready";
}

export async function executeStaffDeactivation(
  request: StaffDeactivationRequest,
  context: DashboardContextV1,
  source: TeamResourcesDataSource,
  requestId: string,
): Promise<DeactivationCommandResult> {
  if (!authorized(context)) return { ok: false, code: "not_authorized" };
  const reason = normalizedReason(request.reason);
  if (
    !validUuid(request.staffId) ||
    !validUuid(requestId) ||
    reason === null ||
    (request.resolution !== "cancel" &&
      request.resolution !== "defer" &&
      request.resolution !== "reassign")
  ) {
    return { ok: false, code: "invalid_request" };
  }

  const replacementStaffId =
    request.resolution === "reassign" ? request.replacementStaffId : null;
  if (
    request.resolution === "reassign" &&
    (!validUuid(replacementStaffId) || replacementStaffId === request.staffId)
  ) {
    return { ok: false, code: "invalid_request" };
  }

  try {
    const outcome = await source.deactivateStaff({
      reason,
      replacementStaffId:
        request.resolution === "reassign" ? (replacementStaffId as string) : null,
      requestId,
      resolution: request.resolution,
      staffId: request.staffId,
      tenantId: context.tenantId,
    });
    if (outcome.targetId !== request.staffId) {
      return { ok: false, code: "backend_unavailable" };
    }
    return {
      ok: true,
      outcome: outcome.outcome,
      remainingAllocationCount: outcome.remainingAllocationCount,
    };
  } catch {
    return { ok: false, code: "backend_unavailable" };
  }
}

export async function executeResourceDeactivation(
  request: ResourceDeactivationRequest,
  context: DashboardContextV1,
  source: TeamResourcesDataSource,
  requestId: string,
): Promise<DeactivationCommandResult> {
  if (!authorized(context)) return { ok: false, code: "not_authorized" };
  const reason = normalizedReason(request.reason);
  if (
    !validUuid(request.resourceId) ||
    !validUuid(requestId) ||
    reason === null ||
    (request.resolution !== "cancel" && request.resolution !== "defer")
  ) {
    return { ok: false, code: "invalid_request" };
  }

  try {
    const outcome = await source.deactivateResource({
      reason,
      requestId,
      resolution: request.resolution,
      resourceId: request.resourceId,
      tenantId: context.tenantId,
    });
    if (outcome.targetId !== request.resourceId) {
      return { ok: false, code: "backend_unavailable" };
    }
    return {
      ok: true,
      outcome: outcome.outcome,
      remainingAllocationCount: outcome.remainingAllocationCount,
    };
  } catch {
    return { ok: false, code: "backend_unavailable" };
  }
}
