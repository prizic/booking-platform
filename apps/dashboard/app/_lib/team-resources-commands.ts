import type { CapabilityName, DashboardContextV1 } from "@wlbp/api-contracts";

import {
  DashboardRpcError,
  type TeamResourcesDataSource,
} from "./dashboard-data-source";

export type TeamResourcesCommandResult =
  | { readonly ok: true }
  | {
      readonly code:
        | "backend_unavailable"
        | "invalid_request"
        | "not_authorized"
        | "revision_conflict";
      readonly ok: false;
    };

export type DeactivationCommandResult =
  | {
      readonly ok: true;
      readonly outcome: "cancelled" | "deactivated" | "deferred" | "reassigned";
      readonly remainingAllocationCount: number;
    }
  | {
      readonly code: "backend_unavailable" | "invalid_request" | "not_authorized";
      readonly ok: false;
    };

interface StaffDeactivationRequest {
  readonly reason: unknown;
  readonly replacementStaffId: unknown;
  readonly resolution: unknown;
  readonly staffId: unknown;
}

interface ResourceDeactivationRequest {
  readonly reason: unknown;
  readonly replacementResourceId: unknown;
  readonly resolution: unknown;
  readonly resourceId: unknown;
}

interface SaveStaffProfileRequest {
  readonly bio: unknown;
  readonly expectedRevision?: unknown;
  readonly internalNotes: unknown;
  readonly membershipId: unknown;
  readonly offeredHoursPerWeek: unknown;
  readonly publicName: unknown;
  readonly reason: unknown;
  readonly staffId: unknown;
}

interface SaveResourceTypeRequest {
  readonly expectedRevision?: unknown;
  readonly exclusive: unknown;
  readonly key: unknown;
  readonly name: unknown;
  readonly reason: unknown;
  readonly resourceTypeId: unknown;
}

interface SaveResourceRequest {
  readonly expectedRevision?: unknown;
  readonly internalNotes: unknown;
  readonly key: unknown;
  readonly publicName: unknown;
  readonly reason: unknown;
  readonly resourceId: unknown;
  readonly resourceTypeId: unknown;
  readonly status: unknown;
}

interface StaffEligibilityRequest {
  readonly eligible: unknown;
  readonly locationId: unknown;
  readonly reason: unknown;
  readonly serviceId: unknown;
  readonly staffId: unknown;
}

interface ResourceLocationRequest {
  readonly eligible: unknown;
  readonly locationId: unknown;
  readonly reason: unknown;
  readonly resourceId: unknown;
}

interface ResourceRequirementRequest {
  readonly reason: unknown;
  readonly required: unknown;
  readonly resourceTypeId: unknown;
  readonly serviceId: unknown;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const keyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function requiredText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maximum ? normalized : null;
}

function optionalText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (normalized.length > maximum) return undefined;
  return normalized;
}

function requiredUuid(value: unknown): string | null {
  return typeof value === "string" && uuidPattern.test(value) ? value : null;
}

function optionalUuid(value: unknown): string | null | undefined {
  if (value === "" || value === null || value === undefined) return null;
  return requiredUuid(value) ?? undefined;
}

function optionalRevision(value: unknown): number | null | undefined {
  if (value === "" || value === null || value === undefined) return null;
  const revision = typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isSafeInteger(revision) && revision > 0 ? revision : undefined;
}

function formBoolean(value: unknown): boolean | null {
  if (value === true || value === "true" || value === "on") return true;
  if (value === false || value === "false" || value === "" || value === null) {
    return false;
  }
  return null;
}

function hasTenantCapability(
  context: DashboardContextV1,
  capability: CapabilityName,
): boolean {
  return context.grants.some(
    (grant) =>
      grant.capability === capability &&
      grant.scope === "tenant" &&
      (!grant.requiresApproval || context.aal2),
  );
}

function hasLocationCapability(
  context: DashboardContextV1,
  capability: CapabilityName,
  locationId: string,
): boolean {
  return context.grants.some(
    (grant) =>
      grant.capability === capability &&
      (!grant.requiresApproval || context.aal2) &&
      (grant.scope === "tenant" ||
        (grant.scope === "location" && context.locationIds.includes(locationId))),
  );
}

async function runMutation(
  mutation: () => Promise<void>,
): Promise<TeamResourcesCommandResult> {
  try {
    await mutation();
    return { ok: true };
  } catch (error) {
    if (error instanceof DashboardRpcError && error.code === "40001") {
      return { ok: false, code: "revision_conflict" };
    }
    return { ok: false, code: "backend_unavailable" };
  }
}

export async function executeSaveStaffProfile(
  request: SaveStaffProfileRequest,
  context: DashboardContextV1,
  source: TeamResourcesDataSource,
  requestId: string,
): Promise<TeamResourcesCommandResult> {
  if (!hasTenantCapability(context, "staff.manage")) {
    return { ok: false, code: "not_authorized" };
  }
  const bio = optionalText(request.bio, 2_000);
  const expectedRevision = optionalRevision(request.expectedRevision);
  const internalNotes = optionalText(request.internalNotes, 2_000);
  const membershipId = optionalUuid(request.membershipId);
  const publicName = requiredText(request.publicName, 160);
  const reason = requiredText(request.reason, 500);
  const staffId = optionalUuid(request.staffId);
  const offeredHoursPerWeek =
    typeof request.offeredHoursPerWeek === "string"
      ? Number(request.offeredHoursPerWeek)
      : Number.NaN;
  if (
    bio === undefined ||
    expectedRevision === undefined ||
    internalNotes === undefined ||
    membershipId === undefined ||
    publicName === null ||
    reason === null ||
    staffId === undefined ||
    !Number.isFinite(offeredHoursPerWeek) ||
    offeredHoursPerWeek <= 0 ||
    offeredHoursPerWeek > 168 ||
    (staffId === null) !== (expectedRevision === null)
  ) {
    return { ok: false, code: "invalid_request" };
  }

  return runMutation(() =>
    source.saveStaffProfile({
      bio,
      expectedRevision,
      internalNotes,
      membershipId,
      offeredHoursPerWeek,
      publicName,
      reason,
      requestId,
      staffId,
      tenantId: context.tenantId,
    }),
  );
}

export async function executeSaveResourceType(
  request: SaveResourceTypeRequest,
  context: DashboardContextV1,
  source: TeamResourcesDataSource,
  requestId: string,
): Promise<TeamResourcesCommandResult> {
  if (!hasTenantCapability(context, "catalog.edit")) {
    return { ok: false, code: "not_authorized" };
  }
  const exclusive = formBoolean(request.exclusive);
  const expectedRevision = optionalRevision(request.expectedRevision);
  const key = requiredText(request.key, 80);
  const name = requiredText(request.name, 160);
  const reason = requiredText(request.reason, 500);
  const resourceTypeId = optionalUuid(request.resourceTypeId);
  if (
    exclusive === null ||
    expectedRevision === undefined ||
    key === null ||
    !keyPattern.test(key) ||
    name === null ||
    reason === null ||
    resourceTypeId === undefined ||
    (resourceTypeId === null) !== (expectedRevision === null)
  ) {
    return { ok: false, code: "invalid_request" };
  }
  return runMutation(() =>
    source.saveResourceType({
      exclusive,
      expectedRevision,
      key,
      name,
      reason,
      requestId,
      resourceTypeId,
      tenantId: context.tenantId,
    }),
  );
}

export async function executeSaveResource(
  request: SaveResourceRequest,
  context: DashboardContextV1,
  source: TeamResourcesDataSource,
  requestId: string,
): Promise<TeamResourcesCommandResult> {
  if (!hasTenantCapability(context, "catalog.edit")) {
    return { ok: false, code: "not_authorized" };
  }
  const internalNotes = optionalText(request.internalNotes, 2_000);
  const expectedRevision = optionalRevision(request.expectedRevision);
  const key = requiredText(request.key, 80);
  const publicName = requiredText(request.publicName, 160);
  const reason = requiredText(request.reason, 500);
  const resourceId = optionalUuid(request.resourceId);
  const resourceTypeId = requiredUuid(request.resourceTypeId);
  const status = request.status;
  if (
    internalNotes === undefined ||
    expectedRevision === undefined ||
    key === null ||
    !keyPattern.test(key) ||
    publicName === null ||
    reason === null ||
    resourceId === undefined ||
    resourceTypeId === null ||
    (status !== "active" && status !== "maintenance") ||
    (resourceId === null) !== (expectedRevision === null)
  ) {
    return { ok: false, code: "invalid_request" };
  }
  return runMutation(() =>
    source.saveResource({
      expectedRevision,
      internalNotes,
      key,
      publicName,
      reason,
      requestId,
      resourceId,
      resourceTypeId,
      status,
      tenantId: context.tenantId,
    }),
  );
}

export async function executeStaffEligibility(
  request: StaffEligibilityRequest,
  context: DashboardContextV1,
  source: TeamResourcesDataSource,
  requestId: string,
): Promise<TeamResourcesCommandResult> {
  const eligible = formBoolean(request.eligible);
  const locationId = requiredUuid(request.locationId);
  const reason = requiredText(request.reason, 500);
  const serviceId = requiredUuid(request.serviceId);
  const staffId = requiredUuid(request.staffId);
  if (
    eligible === null ||
    locationId === null ||
    reason === null ||
    serviceId === null ||
    staffId === null
  ) {
    return { ok: false, code: "invalid_request" };
  }
  if (!hasLocationCapability(context, "staff.manage", locationId)) {
    return { ok: false, code: "not_authorized" };
  }
  return runMutation(() =>
    source.setStaffServiceLocationEligibility({
      eligible,
      locationId,
      reason,
      requestId,
      serviceId,
      staffId,
      tenantId: context.tenantId,
    }),
  );
}

export async function executeResourceLocationEligibility(
  request: ResourceLocationRequest,
  context: DashboardContextV1,
  source: TeamResourcesDataSource,
  requestId: string,
): Promise<TeamResourcesCommandResult> {
  const eligible = formBoolean(request.eligible);
  const locationId = requiredUuid(request.locationId);
  const reason = requiredText(request.reason, 500);
  const resourceId = requiredUuid(request.resourceId);
  if (
    eligible === null ||
    locationId === null ||
    reason === null ||
    resourceId === null
  ) {
    return { ok: false, code: "invalid_request" };
  }
  if (!hasLocationCapability(context, "catalog.edit", locationId)) {
    return { ok: false, code: "not_authorized" };
  }
  return runMutation(() =>
    source.setResourceLocationEligibility({
      eligible,
      locationId,
      reason,
      requestId,
      resourceId,
      tenantId: context.tenantId,
    }),
  );
}

export async function executeResourceRequirement(
  request: ResourceRequirementRequest,
  context: DashboardContextV1,
  source: TeamResourcesDataSource,
  requestId: string,
): Promise<TeamResourcesCommandResult> {
  if (!hasTenantCapability(context, "catalog.edit")) {
    return { ok: false, code: "not_authorized" };
  }
  const reason = requiredText(request.reason, 500);
  const required = formBoolean(request.required);
  const resourceTypeId = optionalUuid(request.resourceTypeId);
  const serviceId = requiredUuid(request.serviceId);
  if (
    reason === null ||
    required === null ||
    resourceTypeId === undefined ||
    (required && resourceTypeId === null) ||
    serviceId === null
  ) {
    return { ok: false, code: "invalid_request" };
  }
  return runMutation(() =>
    source.setResourceRequirement({
      reason,
      requestId,
      required,
      resourceTypeId,
      serviceId,
      tenantId: context.tenantId,
    }),
  );
}

export async function executeStaffDeactivation(
  request: StaffDeactivationRequest,
  context: DashboardContextV1,
  source: TeamResourcesDataSource,
  requestId: string,
): Promise<DeactivationCommandResult> {
  if (!hasTenantCapability(context, "staff.manage")) {
    return { ok: false, code: "not_authorized" };
  }
  const reason = requiredText(request.reason, 500);
  const staffId = requiredUuid(request.staffId);
  const replacementStaffId = optionalUuid(request.replacementStaffId);
  const resolution = request.resolution;
  if (
    reason === null ||
    staffId === null ||
    !uuidPattern.test(requestId) ||
    replacementStaffId === undefined ||
    (resolution !== "cancel" && resolution !== "defer" && resolution !== "reassign") ||
    (resolution === "reassign" &&
      (replacementStaffId === null || replacementStaffId === staffId))
  ) {
    return { ok: false, code: "invalid_request" };
  }

  try {
    const outcome = await source.deactivateStaff({
      reason,
      replacementStaffId: resolution === "reassign" ? replacementStaffId : null,
      requestId,
      resolution,
      staffId,
      tenantId: context.tenantId,
    });
    if (outcome.targetId !== staffId) {
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
  if (!hasTenantCapability(context, "staff.manage")) {
    return { ok: false, code: "not_authorized" };
  }
  const reason = requiredText(request.reason, 500);
  const resourceId = requiredUuid(request.resourceId);
  const replacementResourceId = optionalUuid(request.replacementResourceId);
  const resolution = request.resolution;
  if (
    reason === null ||
    resourceId === null ||
    !uuidPattern.test(requestId) ||
    replacementResourceId === undefined ||
    (resolution !== "cancel" && resolution !== "defer" && resolution !== "reassign") ||
    (resolution === "reassign" &&
      (replacementResourceId === null || replacementResourceId === resourceId))
  ) {
    return { ok: false, code: "invalid_request" };
  }

  try {
    const outcome = await source.deactivateResource({
      reason,
      replacementResourceId: resolution === "reassign" ? replacementResourceId : null,
      requestId,
      resolution,
      resourceId,
      tenantId: context.tenantId,
    });
    if (outcome.targetId !== resourceId) {
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
