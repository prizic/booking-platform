import type { DashboardContextV1 } from "@wlbp/api-contracts";
import { describe, expect, it, vi } from "vitest";

import type { TeamResourcesDataSource } from "./dashboard-data-source";
import { loadTeamResourcesWorkspace } from "./team-resources-workspace";

const context: DashboardContextV1 = {
  aal2: true,
  brandId: "brand-a",
  configRevision: 3,
  dashboardHostname: "dashboard.tenant.example",
  defaultLocale: "en",
  featureRevision: 4,
  grants: [
    {
      capability: "staff.manage",
      requiresApproval: false,
      scope: "tenant",
    },
  ],
  instanceId: "instance-a",
  locationIds: [],
  locationScope: { kind: "all" },
  membershipId: "membership-a",
  publishedBrandRevision: 2,
  roleKey: "tenant_admin",
  tenantId: "tenant-a",
  tenantName: "Tenant A",
};

function source(tenantId = "tenant-a"): TeamResourcesDataSource {
  return {
    deactivateResource: vi.fn(),
    deactivateStaff: vi.fn(),
    getStaffResourceWorkspace: vi.fn(async () => ({
      items: [],
      locations: [],
      resourceTypes: [],
      services: [],
      tenantId,
    })),
    saveResource: vi.fn(async () => undefined),
    saveResourceType: vi.fn(async () => undefined),
    saveStaffProfile: vi.fn(async () => undefined),
    setResourceLocationEligibility: vi.fn(async () => undefined),
    setResourceRequirement: vi.fn(async () => undefined),
    setStaffServiceLocationEligibility: vi.fn(async () => undefined),
  };
}

describe("Team and resources workspace loader", () => {
  it("returns a tenant-verified workspace", async () => {
    await expect(
      loadTeamResourcesWorkspace({ kind: "ready", context } as never, source()),
    ).resolves.toEqual({
      kind: "ready",
      context,
      workspace: {
        items: [],
        locations: [],
        resourceTypes: [],
        services: [],
        tenantId: "tenant-a",
      },
    });
  });

  it("does not fetch data without staff.manage", async () => {
    const dataSource = source();
    await expect(
      loadTeamResourcesWorkspace(
        { kind: "ready", context: { ...context, grants: [] } } as never,
        dataSource,
      ),
    ).resolves.toEqual({ kind: "access-unavailable", reason: "denied" });
    expect(dataSource.getStaffResourceWorkspace).not.toHaveBeenCalled();
  });

  it("loads the server-scoped projection for a location grant", async () => {
    const dataSource = source();
    await expect(
      loadTeamResourcesWorkspace(
        {
          kind: "ready",
          context: {
            ...context,
            locationIds: ["location-a"],
            locationScope: { kind: "restricted", locationIds: ["location-a"] },
            grants: [
              {
                capability: "staff.manage",
                requiresApproval: false,
                scope: "location",
              },
            ],
          },
        } as never,
        dataSource,
      ),
    ).resolves.toMatchObject({ kind: "ready" });
    expect(dataSource.getStaffResourceWorkspace).toHaveBeenCalledWith("tenant-a", "en");
  });

  it("fails closed when the data source returns another tenant", async () => {
    await expect(
      loadTeamResourcesWorkspace(
        { kind: "ready", context } as never,
        source("tenant-b"),
      ),
    ).resolves.toEqual({ kind: "backend-unavailable" });
  });
});
