import {
  capabilityNames,
  parseDashboardContextV1,
  parseResolvePublicTenantV1,
  parseStaffResourceDeactivationV1,
  parseStaffResourceWorkspaceV1,
  parseTenantChoicesV1,
  type CapabilityName,
  type StaffResourceDeactivationV1,
  type StaffResourceWorkspaceV1,
} from "@wlbp/api-contracts";
import { getVerifiedIdentity } from "@wlbp/auth";
import type { RequestScopedSupabaseClient } from "@wlbp/supabase-client";

import type { DashboardDataSource } from "./dashboard-access";

interface RpcError {
  readonly code?: string;
  readonly message?: string;
}

interface RpcResult {
  readonly data: unknown;
  readonly error: RpcError | null;
}

export class DashboardRpcError extends Error {
  constructor(readonly code: string) {
    super(`Dashboard API failed: ${code}`);
    this.name = "DashboardRpcError";
  }
}

interface RpcSchema {
  rpc(name: string, args?: Readonly<Record<string, unknown>>): PromiseLike<RpcResult>;
}

export interface TeamResourcesDataSource {
  deactivateResource(
    input: DeactivateResourceInput,
  ): Promise<StaffResourceDeactivationV1>;
  deactivateStaff(input: DeactivateStaffInput): Promise<StaffResourceDeactivationV1>;
  getStaffResourceWorkspace(
    tenantId: string,
    locale: "ar" | "en",
  ): Promise<StaffResourceWorkspaceV1>;
  saveResource(input: SaveResourceInput): Promise<void>;
  saveResourceType(input: SaveResourceTypeInput): Promise<void>;
  saveStaffProfile(input: SaveStaffProfileInput): Promise<void>;
  setResourceLocationEligibility(
    input: ResourceLocationEligibilityInput,
  ): Promise<void>;
  setResourceRequirement(input: ResourceRequirementInput): Promise<void>;
  setStaffServiceLocationEligibility(input: StaffEligibilityInput): Promise<void>;
}

export interface DeactivateStaffInput {
  readonly reason: string;
  readonly replacementStaffId: string | null;
  readonly requestId: string;
  readonly resolution: "cancel" | "defer" | "reassign";
  readonly staffId: string;
  readonly tenantId: string;
}

export interface DeactivateResourceInput {
  readonly reason: string;
  readonly replacementResourceId: string | null;
  readonly requestId: string;
  readonly resolution: "cancel" | "defer" | "reassign";
  readonly resourceId: string;
  readonly tenantId: string;
}

export interface SaveStaffProfileInput {
  readonly bio: string;
  readonly expectedRevision: number | null;
  readonly internalNotes: string;
  readonly membershipId: string | null;
  readonly offeredHoursPerWeek: number;
  readonly publicName: string;
  readonly reason: string;
  readonly requestId: string;
  readonly staffId: string | null;
  readonly tenantId: string;
}

export interface SaveResourceTypeInput {
  readonly exclusive: boolean;
  readonly expectedRevision: number | null;
  readonly key: string;
  readonly name: string;
  readonly reason: string;
  readonly requestId: string;
  readonly resourceTypeId: string | null;
  readonly tenantId: string;
}

export interface SaveResourceInput {
  readonly expectedRevision: number | null;
  readonly internalNotes: string;
  readonly key: string;
  readonly publicName: string;
  readonly reason: string;
  readonly requestId: string;
  readonly resourceId: string | null;
  readonly resourceTypeId: string;
  readonly status: "active" | "maintenance";
  readonly tenantId: string;
}

export interface StaffEligibilityInput {
  readonly eligible: boolean;
  readonly locationId: string;
  readonly reason: string;
  readonly requestId: string;
  readonly serviceId: string;
  readonly staffId: string;
  readonly tenantId: string;
}

export interface ResourceLocationEligibilityInput {
  readonly eligible: boolean;
  readonly locationId: string;
  readonly reason: string;
  readonly requestId: string;
  readonly resourceId: string;
  readonly tenantId: string;
}

export interface ResourceRequirementInput {
  readonly reason: string;
  readonly requestId: string;
  readonly required: boolean;
  readonly resourceTypeId: string | null;
  readonly serviceId: string;
  readonly tenantId: string;
}

function firstRow(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (row === undefined || row === null) return null;
  if (typeof row !== "object" || Array.isArray(row)) {
    throw new Error("API returned an invalid row");
  }
  return row as Record<string, unknown>;
}

function requireString(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("API returned an invalid string");
  }
  return value;
}

function requireNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error("API returned an invalid number");
  }
  return value;
}

function requireStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw new Error("API returned an invalid array");
  return value.map(requireString);
}

function requireCapabilityGrants(value: unknown) {
  if (!Array.isArray(value)) throw new Error("API returned invalid capabilities");
  return value.map((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      Array.isArray(item) ||
      Object.keys(item).length !== 3 ||
      !("capability" in item) ||
      !("grantKind" in item) ||
      !("scopeKind" in item) ||
      typeof item.capability !== "string" ||
      !capabilityNames.includes(item.capability as CapabilityName) ||
      (item.grantKind !== "direct" && item.grantKind !== "approval") ||
      (item.scopeKind !== "tenant" &&
        item.scopeKind !== "location" &&
        item.scopeKind !== "own")
    ) {
      throw new Error("API returned an unknown capability");
    }
    return {
      capability: item.capability as CapabilityName,
      requiresApproval: item.grantKind === "approval",
      scope: item.scopeKind,
    };
  });
}

function assertRpc(result: RpcResult): unknown {
  if (result.error !== null) {
    throw new DashboardRpcError(result.error.code ?? "unknown");
  }
  return result.data;
}

export function createDashboardDataSource(
  client: RequestScopedSupabaseClient,
): DashboardDataSource & TeamResourcesDataSource {
  const api = client.schema("api_v1") as unknown as RpcSchema;

  return {
    deactivateResource: async (input) => {
      const row = firstRow(
        assertRpc(
          await api.rpc("deactivate_resource_v1", {
            p_reason: input.reason,
            p_replacement_resource_id: input.replacementResourceId,
            p_request_id: input.requestId,
            p_resolution: input.resolution,
            p_resource_id: input.resourceId,
            p_tenant_id: input.tenantId,
          }),
        ),
      );
      if (row === null) throw new Error("Resource deactivation returned no result");
      return parseStaffResourceDeactivationV1({
        outcome: row.outcome,
        remainingAllocationCount: row.remaining_allocations,
        targetId: row.resource_id,
      });
    },

    deactivateStaff: async (input) => {
      const row = firstRow(
        assertRpc(
          await api.rpc("deactivate_staff_v1", {
            p_reason: input.reason,
            p_replacement_staff_id: input.replacementStaffId,
            p_request_id: input.requestId,
            p_resolution: input.resolution,
            p_staff_id: input.staffId,
            p_tenant_id: input.tenantId,
          }),
        ),
      );
      if (row === null) throw new Error("Staff deactivation returned no result");
      return parseStaffResourceDeactivationV1({
        outcome: row.outcome,
        remainingAllocationCount: row.remaining_allocations,
        targetId: row.staff_id,
      });
    },

    getStaffResourceWorkspace: async (tenantId, locale) => {
      const [rawRows, rawChoices] = await Promise.all([
        api.rpc("get_staff_resource_workspace_v1", { p_tenant_id: tenantId }),
        api.rpc("get_staff_resource_choices_v1", {
          p_locale: locale,
          p_tenant_id: tenantId,
        }),
      ]);
      const rows = assertRpc(rawRows);
      const choices = assertRpc(rawChoices);
      if (!Array.isArray(rows)) {
        throw new Error("Staff/resource workspace is invalid");
      }
      if (!Array.isArray(choices)) {
        throw new Error("Staff/resource choices are invalid");
      }
      const choiceRows = choices.map((rawRow) => {
        const row = firstRow(rawRow);
        if (row === null) throw new Error("Staff/resource choice is invalid");
        return row;
      });
      return parseStaffResourceWorkspaceV1({
        tenantId,
        locations: choiceRows
          .filter((row) => row.choice_kind === "location")
          .map((row) => ({ id: row.choice_id, name: row.choice_name })),
        resourceTypes: choiceRows
          .filter((row) => row.choice_kind === "resource_type")
          .map((row) => ({
            exclusive: row.exclusive,
            id: row.choice_id,
            key: row.choice_key,
            name: row.choice_name,
            revision: row.revision,
          })),
        services: choiceRows
          .filter((row) => row.choice_kind === "service")
          .map((row) => ({ id: row.choice_id, name: row.choice_name })),
        items: rows.map((rawRow) => {
          const row = firstRow(rawRow);
          if (row === null || row.tenant_id !== tenantId) {
            throw new Error("Staff/resource workspace tenant mismatch");
          }
          return {
            futureAllocationCount: row.future_allocation_count,
            id: row.item_id,
            internalNotes: row.internal_notes,
            key: row.item_key,
            kind: row.item_kind,
            locationIds: row.location_ids,
            membershipId: row.membership_id,
            name: row.name,
            offeredHoursPerWeek: row.offered_hours_per_week,
            publicBio: row.public_bio,
            resourceTypeId: row.resource_type_id,
            resourceTypeName: row.resource_type_name,
            revision: row.revision,
            serviceIds: row.service_ids,
            status: row.status,
          };
        }),
      });
    },

    saveResource: async (input) => {
      assertRpc(
        await api.rpc("save_resource_v1", {
          p_expected_revision: input.expectedRevision,
          p_internal_notes: input.internalNotes,
          p_key: input.key,
          p_public_name: input.publicName,
          p_reason: input.reason,
          p_request_id: input.requestId,
          p_resource_id: input.resourceId,
          p_resource_type_id: input.resourceTypeId,
          p_status: input.status,
          p_tenant_id: input.tenantId,
        }),
      );
    },

    saveResourceType: async (input) => {
      assertRpc(
        await api.rpc("save_resource_type_v1", {
          p_exclusive: input.exclusive,
          p_expected_revision: input.expectedRevision,
          p_key: input.key,
          p_name: input.name,
          p_reason: input.reason,
          p_request_id: input.requestId,
          p_resource_type_id: input.resourceTypeId,
          p_tenant_id: input.tenantId,
        }),
      );
    },

    saveStaffProfile: async (input) => {
      assertRpc(
        await api.rpc("save_staff_profile_v1", {
          p_public_bio: input.bio,
          p_expected_revision: input.expectedRevision,
          p_internal_notes: input.internalNotes,
          p_membership_id: input.membershipId,
          p_offered_hours_per_week: input.offeredHoursPerWeek,
          p_public_name: input.publicName,
          p_reason: input.reason,
          p_request_id: input.requestId,
          p_staff_id: input.staffId,
          p_tenant_id: input.tenantId,
        }),
      );
    },

    setResourceLocationEligibility: async (input) => {
      assertRpc(
        await api.rpc("set_resource_location_eligibility_v1", {
          p_eligible: input.eligible,
          p_location_id: input.locationId,
          p_reason: input.reason,
          p_request_id: input.requestId,
          p_resource_id: input.resourceId,
          p_tenant_id: input.tenantId,
        }),
      );
    },

    setResourceRequirement: async (input) => {
      assertRpc(
        await api.rpc("set_resource_requirement_v1", {
          p_reason: input.reason,
          p_request_id: input.requestId,
          p_required: input.required,
          p_resource_type_id: input.resourceTypeId,
          p_service_id: input.serviceId,
          p_tenant_id: input.tenantId,
        }),
      );
    },

    setStaffServiceLocationEligibility: async (input) => {
      assertRpc(
        await api.rpc("set_staff_service_location_eligibility_v1", {
          p_eligible: input.eligible,
          p_location_id: input.locationId,
          p_reason: input.reason,
          p_request_id: input.requestId,
          p_service_id: input.serviceId,
          p_staff_id: input.staffId,
          p_tenant_id: input.tenantId,
        }),
      );
    },

    getVerifiedIdentity: async () =>
      getVerifiedIdentity(client as Parameters<typeof getVerifiedIdentity>[0]),

    resolveTenant: async (hostname) => {
      const row = firstRow(
        assertRpc(
          await api.rpc("resolve_public_tenant_v1", {
            p_application: "dashboard",
            p_hostname: hostname,
          }),
        ),
      );
      if (row === null) return null;
      return parseResolvePublicTenantV1({
        brandId: row.brand_id,
        configRevision: row.config_version,
        deploymentState: row.deployment_state,
        featureRevision: row.feature_version,
        hostname: row.hostname,
        instanceId: row.instance_id,
        publishedBrandRevision: row.published_brand_revision,
        tenantId: row.tenant_id,
      });
    },

    listTenantChoices: async () => {
      const rows = assertRpc(await api.rpc("list_tenant_choices_v1"));
      if (!Array.isArray(rows)) throw new Error("Tenant choices are invalid");
      return parseTenantChoicesV1(
        rows.map((rawRow) => {
          const row = firstRow(rawRow);
          if (row === null) throw new Error("Tenant choice is invalid");
          return {
            dashboardHostname: row.dashboard_hostname,
            membershipId: row.membership_id,
            roleKey: row.role_key,
            tenantId: row.tenant_id,
            tenantName: row.tenant_name,
          };
        }),
      );
    },

    getDashboardContext: async (tenantId) => {
      const row = firstRow(
        assertRpc(await api.rpc("get_dashboard_context_v1", { p_tenant_id: tenantId })),
      );
      if (row === null) throw new Error("Dashboard membership is not active");

      const locationIds = requireStringArray(row.location_ids);
      const grants = requireCapabilityGrants(row.capabilities);
      const locationScopeMode = requireString(row.location_scope_mode);

      return parseDashboardContextV1({
        aal2: row.aal2,
        brandId: row.brand_id,
        configRevision: requireNumber(row.config_version),
        dashboardHostname: row.dashboard_hostname,
        defaultLocale: row.default_locale,
        featureRevision: requireNumber(row.feature_version),
        grants,
        instanceId: row.instance_id,
        locationIds,
        locationScope:
          locationScopeMode === "tenant"
            ? { kind: "all" }
            : locationScopeMode === "assigned"
              ? { kind: "restricted", locationIds }
              : null,
        membershipId: row.membership_id,
        publishedBrandRevision: requireNumber(row.published_brand_revision),
        roleKey: row.role_key,
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
      });
    },
  };
}
