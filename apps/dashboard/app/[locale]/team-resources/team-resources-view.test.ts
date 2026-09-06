import type { StaffResourceWorkspaceV1 } from "@wlbp/api-contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TeamResourcesView } from "./team-resources-view";

const action = async (_formData: FormData) => undefined;

const workspace: StaffResourceWorkspaceV1 = {
  tenantId: "tenant-a",
  locations: [{ id: "location-a", name: "Downtown" }],
  resourceTypes: [
    { exclusive: true, id: "type-a", key: "room", name: "Room", revision: 1 },
  ],
  services: [{ id: "service-a", name: "Consultation" }],
  items: [
    {
      futureAllocationCount: 2,
      id: "a8000000-0000-0000-0000-000000000001",
      internalNotes: "Morning shifts",
      key: null,
      kind: "staff",
      locationIds: ["location-a"],
      membershipId: null,
      name: "Layla Hassan",
      offeredHoursPerWeek: 40,
      publicBio: "Booking specialist",
      resourceTypeId: null,
      resourceTypeName: null,
      revision: 2,
      serviceIds: ["service-a"],
      status: "active",
    },
    {
      futureAllocationCount: 0,
      id: "a8200000-0000-0000-0000-000000000001",
      internalNotes: "",
      key: "room-one",
      kind: "resource",
      locationIds: ["location-a"],
      membershipId: null,
      name: "Room 1",
      offeredHoursPerWeek: null,
      publicBio: null,
      resourceTypeId: "type-a",
      resourceTypeName: "Room",
      revision: 3,
      serviceIds: ["service-a"],
      status: "maintenance",
    },
  ],
};

describe("Team and resources workspace view", () => {
  it("renders labelled creation, revision-safe edit, and eligibility forms", () => {
    const html = renderToStaticMarkup(
      createElement(TeamResourcesView, {
        locale: "en",
        state: {
          context: {
            aal2: true,
            grants: [
              { capability: "staff.manage", requiresApproval: false, scope: "tenant" },
              { capability: "catalog.edit", requiresApproval: false, scope: "tenant" },
            ],
            locationIds: [],
            tenantId: "tenant-a",
          } as never,
          kind: "ready",
          workspace,
        },
        actions: {
          saveResource: action,
          saveResourceType: action,
          saveStaffProfile: action,
          setResourceLocationEligibility: action,
          setResourceRequirement: action,
          setStaffEligibility: action,
        },
      }),
    );

    expect(html).toContain("Team and resources");
    expect(html).toContain("Layla Hassan");
    expect(html).toContain("Room 1");
    expect(html).toContain("<form");
    expect(html).toContain('name="publicName"');
    expect(html).toContain('name="resourceTypeId"');
    expect(html).toContain('name="serviceId"');
    expect(html).toContain("Create team member");
    expect(html).toContain("Update exact eligibility");
    expect(html).toContain('name="expectedRevision" value="2"');
  });

  it("renders the same protected state in Arabic", () => {
    const html = renderToStaticMarkup(
      createElement(TeamResourcesView, {
        locale: "ar",
        actions: {
          saveResource: action,
          saveResourceType: action,
          saveStaffProfile: action,
          setResourceLocationEligibility: action,
          setResourceRequirement: action,
          setStaffEligibility: action,
        },
        state: {
          kind: "access-unavailable",
          reason: "location-scope-unavailable",
        },
      }),
    );

    expect(html).toContain("الإدارة محددة الموقع غير متصلة بعد");
    expect(html).toContain("لا يوسّع");
  });

  it("renders Arabic form labels from the same semantic component tree", () => {
    const html = renderToStaticMarkup(
      createElement(TeamResourcesView, {
        locale: "ar",
        actions: {
          saveResource: action,
          saveResourceType: action,
          saveStaffProfile: action,
          setResourceLocationEligibility: action,
          setResourceRequirement: action,
          setStaffEligibility: action,
        },
        state: {
          context: {
            aal2: true,
            grants: [
              { capability: "staff.manage", requiresApproval: false, scope: "tenant" },
              { capability: "catalog.edit", requiresApproval: false, scope: "tenant" },
            ],
            locationIds: [],
            tenantId: "tenant-a",
          } as never,
          kind: "ready",
          workspace,
        },
      }),
    );

    expect(html).toContain("إنشاء عضو فريق");
    expect(html).toContain("تحديث الأهلية الدقيقة");
    expect(html).toContain('aria-live="polite"');
  });
});
