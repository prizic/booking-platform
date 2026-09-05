import type { RequestScopedSupabaseClient } from "@wlbp/supabase-client";
import { describe, expect, it } from "vitest";

import { createDashboardDataSource } from "./dashboard-data-source";

function clientWithRows(rows: Record<string, unknown>) {
  return {
    auth: {
      getClaims: async () => ({
        data: { claims: { sub: "account-a", aal: "aal2", iat: 100 } },
        error: null,
      }),
    },
    schema: () => ({
      rpc: async (name: string) => ({ data: rows[name], error: null }),
    }),
  } as unknown as RequestScopedSupabaseClient;
}

describe("Dashboard Supabase adapter", () => {
  it("resolves only the Dashboard application surface", async () => {
    const calls: Array<{ args?: Readonly<Record<string, unknown>>; name: string }> = [];
    const client = {
      auth: { getClaims: async () => ({ data: null, error: null }) },
      schema: () => ({
        rpc: async (name: string, args?: Readonly<Record<string, unknown>>) => {
          calls.push({ name, ...(args === undefined ? {} : { args }) });
          return {
            data: [
              {
                brand_id: "brand-a",
                config_version: 3,
                deployment_state: "active",
                feature_version: 4,
                hostname: "dashboard.tenant.example",
                instance_id: "instance-a",
                published_brand_revision: 2,
                tenant_id: "tenant-a",
              },
            ],
            error: null,
          };
        },
      }),
    } as unknown as RequestScopedSupabaseClient;

    const source = createDashboardDataSource(client);
    await expect(
      source.resolveTenant("dashboard.tenant.example"),
    ).resolves.toMatchObject({
      tenantId: "tenant-a",
      hostname: "dashboard.tenant.example",
    });
    expect(calls).toEqual([
      {
        name: "resolve_public_tenant_v1",
        args: {
          p_application: "dashboard",
          p_hostname: "dashboard.tenant.example",
        },
      },
    ]);
  });

  it("maps only the explicit v1 RPC columns", async () => {
    const source = createDashboardDataSource(
      clientWithRows({
        get_dashboard_context_v1: [
          {
            aal2: true,
            brand_id: "brand-a",
            config_version: 3,
            dashboard_hostname: "dashboard.tenant.example",
            default_locale: "en",
            capabilities: [
              {
                capability: "booking.view.any",
                grantKind: "direct",
                scopeKind: "location",
              },
              {
                capability: "booking.approve",
                grantKind: "approval",
                scopeKind: "own",
              },
            ],
            feature_version: 4,
            instance_id: "instance-a",
            location_ids: ["location-a"],
            location_scope_mode: "assigned",
            membership_id: "membership-a",
            published_brand_revision: 2,
            role_key: "scheduler",
            tenant_id: "tenant-a",
            tenant_name: "Tenant A",
            secret_column: "must not escape",
          },
        ],
      }),
    );

    await expect(source.getVerifiedIdentity()).resolves.toMatchObject({
      accountId: "account-a",
      assuranceLevel: "aal2",
    });

    await expect(source.getDashboardContext("tenant-a")).resolves.toEqual({
      aal2: true,
      brandId: "brand-a",
      configRevision: 3,
      dashboardHostname: "dashboard.tenant.example",
      defaultLocale: "en",
      featureRevision: 4,
      grants: [
        {
          capability: "booking.view.any",
          requiresApproval: false,
          scope: "location",
        },
        {
          capability: "booking.approve",
          requiresApproval: true,
          scope: "own",
        },
      ],
      instanceId: "instance-a",
      locationIds: ["location-a"],
      locationScope: { kind: "restricted", locationIds: ["location-a"] },
      membershipId: "membership-a",
      publishedBrandRevision: 2,
      roleKey: "scheduler",
      tenantId: "tenant-a",
      tenantName: "Tenant A",
    });
  });

  it("loads the staff/resource workspace through one versioned RPC", async () => {
    const calls: Array<{ args?: Readonly<Record<string, unknown>>; name: string }> = [];
    const client = {
      auth: { getClaims: async () => ({ data: null, error: null }) },
      schema: () => ({
        rpc: async (name: string, args?: Readonly<Record<string, unknown>>) => {
          calls.push({ name, ...(args === undefined ? {} : { args }) });
          return {
            data: [
              {
                future_allocation_count: 2,
                item_id: "staff-a",
                item_kind: "staff",
                location_ids: ["location-a"],
                name: "Layla Hassan",
                resource_type_name: null,
                service_ids: ["service-a"],
                status: "active",
                tenant_id: "tenant-a",
              },
              {
                future_allocation_count: 0,
                item_id: "resource-a",
                item_kind: "resource",
                location_ids: ["location-a"],
                name: "Room 1",
                resource_type_name: "Room",
                service_ids: ["service-a"],
                status: "maintenance",
                tenant_id: "tenant-a",
              },
            ],
            error: null,
          };
        },
      }),
    } as unknown as RequestScopedSupabaseClient;

    const source = createDashboardDataSource(client);
    await expect(source.getStaffResourceWorkspace("tenant-a")).resolves.toEqual({
      tenantId: "tenant-a",
      items: [
        {
          futureAllocationCount: 2,
          id: "staff-a",
          kind: "staff",
          locationIds: ["location-a"],
          name: "Layla Hassan",
          resourceTypeName: null,
          serviceIds: ["service-a"],
          status: "active",
        },
        {
          futureAllocationCount: 0,
          id: "resource-a",
          kind: "resource",
          locationIds: ["location-a"],
          name: "Room 1",
          resourceTypeName: "Room",
          serviceIds: ["service-a"],
          status: "maintenance",
        },
      ],
    });
    expect(calls).toEqual([
      {
        args: { p_tenant_id: "tenant-a" },
        name: "get_staff_resource_workspace_v1",
      },
    ]);
  });

  it("maps deactivation inputs and returns only the stable outcome", async () => {
    const calls: Array<{ args?: Readonly<Record<string, unknown>>; name: string }> = [];
    const client = {
      auth: { getClaims: async () => ({ data: null, error: null }) },
      schema: () => ({
        rpc: async (name: string, args?: Readonly<Record<string, unknown>>) => {
          calls.push({ name, ...(args === undefined ? {} : { args }) });
          return {
            data:
              name === "deactivate_staff_v1"
                ? [
                    {
                      outcome: "reassigned",
                      remaining_allocations: 0,
                      staff_id: "staff-a",
                    },
                  ]
                : [
                    {
                      outcome: "deferred",
                      remaining_allocations: 2,
                      resource_id: "resource-a",
                    },
                  ],
            error: null,
          };
        },
      }),
    } as unknown as RequestScopedSupabaseClient;

    const source = createDashboardDataSource(client);
    await expect(
      source.deactivateStaff({
        reason: "Coverage changed",
        replacementStaffId: "staff-b",
        requestId: "request-a",
        resolution: "reassign",
        staffId: "staff-a",
        tenantId: "tenant-a",
      }),
    ).resolves.toEqual({
      outcome: "reassigned",
      remainingAllocationCount: 0,
      targetId: "staff-a",
    });
    await expect(
      source.deactivateResource({
        reason: "Maintenance window",
        requestId: "request-b",
        resolution: "defer",
        resourceId: "resource-a",
        tenantId: "tenant-a",
      }),
    ).resolves.toEqual({
      outcome: "deferred",
      remainingAllocationCount: 2,
      targetId: "resource-a",
    });
    expect(calls).toEqual([
      {
        args: {
          p_reason: "Coverage changed",
          p_replacement_staff_id: "staff-b",
          p_request_id: "request-a",
          p_resolution: "reassign",
          p_staff_id: "staff-a",
          p_tenant_id: "tenant-a",
        },
        name: "deactivate_staff_v1",
      },
      {
        args: {
          p_reason: "Maintenance window",
          p_request_id: "request-b",
          p_resolution: "defer",
          p_resource_id: "resource-a",
          p_tenant_id: "tenant-a",
        },
        name: "deactivate_resource_v1",
      },
    ]);
  });
});
