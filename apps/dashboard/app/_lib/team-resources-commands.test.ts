import type { DashboardContextV1 } from "@wlbp/api-contracts";
import { describe, expect, it, vi } from "vitest";

import {
  DashboardRpcError,
  type TeamResourcesDataSource,
} from "./dashboard-data-source";
import {
  executeResourceDeactivation,
  executeSaveResource,
  executeSaveStaffProfile,
  executeStaffDeactivation,
  executeStaffEligibility,
} from "./team-resources-commands";

const tenantId = "a0000000-0000-0000-0000-000000000001";
const staffId = "a8000000-0000-0000-0000-000000000001";
const replacementStaffId = "a8000000-0000-0000-0000-000000000002";
const serviceId = "a7200000-0000-0000-0000-000000000001";
const locationId = "a5000000-0000-0000-0000-000000000001";
const resourceTypeId = "a8100000-0000-0000-0000-000000000001";
const resourceId = "a8200000-0000-0000-0000-000000000001";
const replacementResourceId = "a8200000-0000-0000-0000-000000000002";
const requestId = "a9000000-0000-0000-0000-000000000001";

const context: DashboardContextV1 = {
  aal2: true,
  brandId: "brand-a",
  configRevision: 3,
  dashboardHostname: "dashboard.tenant.example",
  defaultLocale: "en",
  featureRevision: 4,
  grants: [
    { capability: "staff.manage", requiresApproval: false, scope: "tenant" },
    { capability: "catalog.edit", requiresApproval: false, scope: "tenant" },
  ],
  instanceId: "instance-a",
  locationIds: [],
  locationScope: { kind: "all" },
  membershipId: "a1000000-0000-0000-0000-000000000001",
  publishedBrandRevision: 2,
  roleKey: "tenant_admin",
  tenantId,
  tenantName: "Tenant A",
};

function source() {
  return {
    deactivateResource: vi.fn(async (input) => ({
      outcome:
        input.resolution === "reassign"
          ? ("reassigned" as const)
          : ("deferred" as const),
      remainingAllocationCount: input.resolution === "defer" ? 2 : 0,
      targetId: input.resourceId,
    })),
    deactivateStaff: vi.fn(async (input) => ({
      outcome:
        input.resolution === "reassign"
          ? ("reassigned" as const)
          : ("cancelled" as const),
      remainingAllocationCount: 0,
      targetId: input.staffId,
    })),
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
  } satisfies TeamResourcesDataSource;
}

describe("Team and resource management commands", () => {
  it("uses tenant staff authority for safe staff reassignment", async () => {
    const dataSource = source();

    await expect(
      executeStaffDeactivation(
        {
          reason: "  Coverage changed  ",
          replacementStaffId,
          resolution: "reassign",
          staffId,
        },
        context,
        dataSource,
        requestId,
      ),
    ).resolves.toEqual({
      ok: true,
      outcome: "reassigned",
      remainingAllocationCount: 0,
    });
    expect(dataSource.deactivateStaff).toHaveBeenCalledWith({
      reason: "Coverage changed",
      replacementStaffId,
      requestId,
      resolution: "reassign",
      staffId,
      tenantId,
    });
  });

  it("passes a same-type replacement resource to the versioned workflow", async () => {
    const dataSource = source();

    await expect(
      executeResourceDeactivation(
        {
          reason: "Replace room",
          replacementResourceId,
          resolution: "reassign",
          resourceId,
        },
        context,
        dataSource,
        requestId,
      ),
    ).resolves.toMatchObject({ ok: true, outcome: "reassigned" });
    expect(dataSource.deactivateResource).toHaveBeenCalledWith({
      reason: "Replace room",
      replacementResourceId,
      requestId,
      resolution: "reassign",
      resourceId,
      tenantId,
    });
  });

  it("denies deactivation to location-scoped operators before the RPC", async () => {
    const dataSource = source();
    const locationContext: DashboardContextV1 = {
      ...context,
      grants: [
        { capability: "staff.manage", requiresApproval: true, scope: "location" },
      ],
      locationIds: [locationId],
      locationScope: { kind: "restricted", locationIds: [locationId] },
    };

    await expect(
      executeResourceDeactivation(
        {
          reason: "Out of scope",
          replacementResourceId: "",
          resolution: "defer",
          resourceId,
        },
        locationContext,
        dataSource,
        requestId,
      ),
    ).resolves.toEqual({ ok: false, code: "not_authorized" });
    expect(dataSource.deactivateResource).not.toHaveBeenCalled();
  });

  it("requires a distinct replacement for reassign", async () => {
    const dataSource = source();
    await expect(
      executeStaffDeactivation(
        {
          reason: "Coverage changed",
          replacementStaffId: staffId,
          resolution: "reassign",
          staffId,
        },
        context,
        dataSource,
        requestId,
      ),
    ).resolves.toEqual({ ok: false, code: "invalid_request" });
    expect(dataSource.deactivateStaff).not.toHaveBeenCalled();
  });

  it("derives tenant authority and normalizes a new staff profile", async () => {
    const dataSource = source();

    await expect(
      executeSaveStaffProfile(
        {
          bio: "  Booking specialist  ",
          internalNotes: "  Prefers morning shifts  ",
          membershipId: "",
          offeredHoursPerWeek: "32.5",
          publicName: "  Layla Hassan  ",
          reason: "  New starter  ",
          staffId: "",
        },
        context,
        dataSource,
        requestId,
      ),
    ).resolves.toEqual({ ok: true });

    expect(dataSource.saveStaffProfile).toHaveBeenCalledWith({
      bio: "Booking specialist",
      expectedRevision: null,
      internalNotes: "Prefers morning shifts",
      membershipId: null,
      offeredHoursPerWeek: 32.5,
      publicName: "Layla Hassan",
      reason: "New starter",
      requestId,
      staffId: null,
      tenantId,
    });
  });

  it("rejects catalog mutations without catalog.edit before the RPC", async () => {
    const dataSource = source();

    await expect(
      executeSaveResource(
        {
          internalNotes: "",
          key: "room-one",
          publicName: "Room one",
          reason: "Add treatment room",
          resourceId: "",
          resourceTypeId,
          status: "active",
        },
        {
          ...context,
          grants: context.grants.filter((grant) => grant.capability !== "catalog.edit"),
        },
        dataSource,
        requestId,
      ),
    ).resolves.toEqual({ ok: false, code: "not_authorized" });

    expect(dataSource.saveResource).not.toHaveBeenCalled();
  });

  it("allows an AAL2 location manager to change exact assigned eligibility", async () => {
    const dataSource = source();
    const locationContext: DashboardContextV1 = {
      ...context,
      grants: [
        { capability: "staff.manage", requiresApproval: true, scope: "location" },
      ],
      locationIds: [locationId],
      locationScope: { kind: "restricted", locationIds: [locationId] },
    };

    await expect(
      executeStaffEligibility(
        {
          eligible: "true",
          locationId,
          reason: "Cover this location",
          serviceId,
          staffId,
        },
        locationContext,
        dataSource,
        requestId,
      ),
    ).resolves.toEqual({ ok: true });

    expect(dataSource.setStaffServiceLocationEligibility).toHaveBeenCalledWith({
      eligible: true,
      locationId,
      reason: "Cover this location",
      requestId,
      serviceId,
      staffId,
      tenantId,
    });
  });

  it("denies location-scoped eligibility outside the assigned location", async () => {
    const dataSource = source();

    await expect(
      executeStaffEligibility(
        {
          eligible: "false",
          locationId,
          reason: "Remove coverage",
          serviceId,
          staffId,
        },
        {
          ...context,
          grants: [
            { capability: "staff.manage", requiresApproval: true, scope: "location" },
          ],
          locationIds: ["a5000000-0000-0000-0000-000000000002"],
          locationScope: {
            kind: "restricted",
            locationIds: ["a5000000-0000-0000-0000-000000000002"],
          },
        },
        dataSource,
        requestId,
      ),
    ).resolves.toEqual({ ok: false, code: "not_authorized" });

    expect(dataSource.setStaffServiceLocationEligibility).not.toHaveBeenCalled();
  });

  it("maps an RPC failure to a stable unavailable result", async () => {
    const dataSource = source();
    dataSource.saveStaffProfile.mockRejectedValueOnce(new Error("database detail"));

    await expect(
      executeSaveStaffProfile(
        {
          bio: "",
          internalNotes: "",
          membershipId: "",
          offeredHoursPerWeek: "40",
          publicName: "Layla Hassan",
          reason: "New starter",
          staffId: "",
        },
        context,
        dataSource,
        requestId,
      ),
    ).resolves.toEqual({ ok: false, code: "backend_unavailable" });
  });

  it("normalizes blank optional text to backend-safe empty strings", async () => {
    const dataSource = source();
    await executeSaveStaffProfile(
      {
        bio: " ",
        internalNotes: "",
        membershipId: "",
        offeredHoursPerWeek: "40",
        publicName: "Layla Hassan",
        reason: "New starter",
        staffId: "",
      },
      context,
      dataSource,
      requestId,
    );

    expect(dataSource.saveStaffProfile).toHaveBeenCalledWith(
      expect.objectContaining({ bio: "", internalNotes: "" }),
    );
  });

  it("rejects inactive resource edits outside the deactivation workflow", async () => {
    const dataSource = source();
    await expect(
      executeSaveResource(
        {
          expectedRevision: "2",
          internalNotes: "",
          key: "room-one",
          publicName: "Room one",
          reason: "Unsafe shortcut",
          resourceId: "a8200000-0000-0000-0000-000000000001",
          resourceTypeId,
          status: "inactive",
        },
        context,
        dataSource,
        requestId,
      ),
    ).resolves.toEqual({ ok: false, code: "invalid_request" });
    expect(dataSource.saveResource).not.toHaveBeenCalled();
  });

  it("returns a distinct stale-revision result", async () => {
    const dataSource = source();
    dataSource.saveStaffProfile.mockRejectedValueOnce(new DashboardRpcError("40001"));

    await expect(
      executeSaveStaffProfile(
        {
          bio: "Booking specialist",
          expectedRevision: "2",
          internalNotes: "",
          membershipId: "",
          offeredHoursPerWeek: "40",
          publicName: "Layla Hassan",
          reason: "Update profile",
          staffId,
        },
        context,
        dataSource,
        requestId,
      ),
    ).resolves.toEqual({ ok: false, code: "revision_conflict" });
  });
});
