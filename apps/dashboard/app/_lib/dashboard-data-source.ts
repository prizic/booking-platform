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

interface RpcSchema {
  rpc(name: string, args?: Readonly<Record<string, unknown>>): PromiseLike<RpcResult>;
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
  readonly requestId: string;
  readonly resolution: "cancel" | "defer";
  readonly resourceId: string;
  readonly tenantId: string;
}

export interface TeamResourcesDataSource {
  deactivateResource(
    input: DeactivateResourceInput,
  ): Promise<StaffResourceDeactivationV1>;
  deactivateStaff(input: DeactivateStaffInput): Promise<StaffResourceDeactivationV1>;
  getStaffResourceWorkspace(tenantId: string): Promise<StaffResourceWorkspaceV1>;
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
    throw new Error(`Dashboard API failed: ${result.error.code ?? "unknown"}`);
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

    getStaffResourceWorkspace: async (tenantId) => {
      const rows = assertRpc(
        await api.rpc("get_staff_resource_workspace_v1", {
          p_tenant_id: tenantId,
        }),
      );
      if (!Array.isArray(rows)) {
        throw new Error("Staff/resource workspace is invalid");
      }
      return parseStaffResourceWorkspaceV1({
        tenantId,
        items: rows.map((rawRow) => {
          const row = firstRow(rawRow);
          if (row === null || row.tenant_id !== tenantId) {
            throw new Error("Staff/resource workspace tenant mismatch");
          }
          return {
            futureAllocationCount: row.future_allocation_count,
            id: row.item_id,
            kind: row.item_kind,
            locationIds: row.location_ids,
            name: row.name,
            resourceTypeName: row.resource_type_name,
            serviceIds: row.service_ids,
            status: row.status,
          };
        }),
      });
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
