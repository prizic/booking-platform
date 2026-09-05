import type {
  DashboardContextV1,
  StaffResourceDeactivationV1,
} from "@wlbp/api-contracts";
import { describe, expect, it, vi } from "vitest";

import {
  executeResourceDeactivation,
  executeStaffDeactivation,
} from "./team-resources-commands";
import type { TeamResourcesDataSource } from "./dashboard-data-source";

const tenantId = "a0000000-0000-0000-0000-000000000001";
const staffId = "a8000000-0000-0000-0000-000000000001";
const replacementStaffId = "a8000000-0000-0000-0000-000000000002";
const resourceId = "a8200000-0000-0000-0000-000000000001";
const requestId = "a9000000-0000-0000-0000-000000000001";

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
  tenantId,
  tenantName: "Tenant A",
};

function source(): TeamResourcesDataSource {
  return {
    deactivateResource: vi.fn(async (input): Promise<StaffResourceDeactivationV1> => ({
      outcome: input.resolution === "defer" ? "deferred" : "cancelled",
      remainingAllocationCount: input.resolution === "defer" ? 2 : 0,
      targetId: input.resourceId,
    })),
    deactivateStaff: vi.fn(async (input): Promise<StaffResourceDeactivationV1> => ({
      outcome: input.resolution === "reassign" ? "reassigned" : "deferred",
      remainingAllocationCount: input.resolution === "defer" ? 2 : 0,
      targetId: input.staffId,
    })),
    getStaffResourceWorkspace: vi.fn(async () => ({ items: [], tenantId })),
  };
}

describe("Team and resource deactivation commands", () => {
  it("derives the tenant from verified context for staff reassignment", async () => {
    const result = await executeStaffDeactivation(
      {
        reason: "  Coverage changed  ",
        replacementStaffId,
        resolution: "reassign",
        staffId,
      },
      context,
      source(),
      requestId,
    );

    expect(result).toEqual({
      ok: true,
      outcome: "reassigned",
      remainingAllocationCount: 0,
    });
  });

  it("fails closed for a location-scoped grant", async () => {
    const result = await executeResourceDeactivation(
      {
        reason: "Maintenance",
        resolution: "defer",
        resourceId,
      },
      {
        ...context,
        grants: [
          {
            capability: "staff.manage",
            requiresApproval: false,
            scope: "location",
          },
        ],
        locationIds: ["a5000000-0000-0000-0000-000000000001"],
        locationScope: {
          kind: "restricted",
          locationIds: ["a5000000-0000-0000-0000-000000000001"],
        },
      },
      source(),
      requestId,
    );

    expect(result).toEqual({ ok: false, code: "not_authorized" });
  });

  it("rejects malformed IDs and blank reasons before mutation", async () => {
    await expect(
      executeStaffDeactivation(
        {
          reason: " ",
          replacementStaffId: null,
          resolution: "cancel",
          staffId: "not-a-uuid",
        },
        context,
        source(),
        requestId,
      ),
    ).resolves.toEqual({ ok: false, code: "invalid_request" });
  });

  it("does not accept staff-only reassignment for a resource", async () => {
    await expect(
      executeResourceDeactivation(
        {
          reason: "Maintenance",
          resolution: "reassign",
          resourceId,
        },
        context,
        source(),
        requestId,
      ),
    ).resolves.toEqual({ ok: false, code: "invalid_request" });
  });
});
