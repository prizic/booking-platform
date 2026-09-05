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
});
