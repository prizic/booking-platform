import type { DashboardContextV1 } from "@wlbp/api-contracts";
import { describe, expect, it } from "vitest";

import { getTeamResourcesAccess } from "./team-resources-access";

const baseContext: DashboardContextV1 = {
  aal2: false,
  brandId: "brand-a",
  configRevision: 3,
  dashboardHostname: "dashboard.tenant.example",
  defaultLocale: "en",
  featureRevision: 4,
  grants: [],
  instanceId: "instance-a",
  locationIds: [],
  locationScope: { kind: "all" },
  membershipId: "membership-a",
  publishedBrandRevision: 2,
  roleKey: "tenant_admin",
  tenantId: "tenant-a",
  tenantName: "Tenant A",
};

describe("Team and resources workspace access", () => {
  it("allows a current tenant-scoped staff.manage grant", () => {
    expect(
      getTeamResourcesAccess({
        ...baseContext,
        grants: [
          {
            capability: "staff.manage",
            requiresApproval: false,
            scope: "tenant",
          },
        ],
      }),
    ).toBe("ready");
  });

  it("requires AAL2 when the live grant requires approval", () => {
    const context = {
      ...baseContext,
      grants: [
        {
          capability: "staff.manage" as const,
          requiresApproval: true,
          scope: "tenant" as const,
        },
      ],
    };

    expect(getTeamResourcesAccess(context)).toBe("step-up-required");
    expect(getTeamResourcesAccess({ ...context, aal2: true })).toBe("ready");
  });

  it("allows a location-scoped grant only with explicit assigned locations", () => {
    expect(
      getTeamResourcesAccess({
        ...baseContext,
        locationIds: ["location-a"],
        locationScope: { kind: "restricted", locationIds: ["location-a"] },
        grants: [
          {
            capability: "staff.manage",
            requiresApproval: false,
            scope: "location",
          },
        ],
      }),
    ).toBe("ready");
  });

  it("denies a context without staff.manage", () => {
    expect(getTeamResourcesAccess(baseContext)).toBe("denied");
  });
});
