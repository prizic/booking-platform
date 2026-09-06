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
      membershipId: "a3000000-0000-0000-0000-000000000010",
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
    {
      futureAllocationCount: 0,
      id: "a8000000-0000-0000-0000-000000000002",
      internalNotes: "",
      key: null,
      kind: "staff",
      locationIds: ["location-a"],
      membershipId: null,
      name: "Omar Saleh",
      offeredHoursPerWeek: 40,
      publicBio: "",
      resourceTypeId: null,
      resourceTypeName: null,
      revision: 1,
      serviceIds: ["service-a"],
      status: "active",
    },
    {
      futureAllocationCount: 0,
      id: "a8200000-0000-0000-0000-000000000002",
      internalNotes: "",
      key: "room-two",
      kind: "resource",
      locationIds: ["location-a"],
      membershipId: null,
      name: "Room 2",
      offeredHoursPerWeek: null,
      publicBio: null,
      resourceTypeId: "type-a",
      resourceTypeName: "Room",
      revision: 1,
      serviceIds: ["service-a"],
      status: "active",
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
          deactivateResource: action,
          deactivateStaff: action,
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
    expect(html).toContain('value="a3000000-0000-0000-0000-000000000010"');
    expect(html).toContain("Booking specialist</textarea>");
    expect(html).toContain("Morning shifts</textarea>");
    expect(html).toContain('name="offeredHoursPerWeek"');
    expect(html).toContain('name="offeredHoursPerWeek" value="40"');
    expect(html).toContain('name="expectedRevision" value="1"');
    expect(html).toContain('id="type-type-a-key"');
    expect(html).toContain('value="room"');
    expect(html).toContain('name="expectedRevision" value="3"');
    expect(html).toContain('value="room-one"');
    expect(html).not.toContain('option value="inactive"');
    expect(html).toContain("Save team member");
    expect(html).toContain("Save resource type");
    expect(html).toContain("Save resource");
    expect(html).toContain('name="resolution"');
    expect(html).toContain('name="replacementStaffId"');
    expect(html).toContain('name="replacementResourceId"');
    expect(html).toContain("Apply safe resolution");
    expect(html).toContain("Enter a valid value for this field, then submit again.");
    const requestIds = [
      ...html.matchAll(/type="hidden" name="requestId" value="([^"]+)"/gu),
    ]
      .map(([, requestId]) => requestId)
      .filter((requestId): requestId is string => requestId !== undefined);
    expect(requestIds).toHaveLength(html.match(/<form/gu)?.length ?? 0);
    expect(new Set(requestIds).size).toBe(requestIds.length);
    expect(requestIds.every((requestId) => /^[0-9a-f-]{36}$/u.test(requestId))).toBe(
      true,
    );
  });

  it("keeps tenant-wide editors hidden for a location-scoped operator", () => {
    const html = renderToStaticMarkup(
      createElement(TeamResourcesView, {
        locale: "en",
        state: {
          context: {
            aal2: true,
            grants: [
              {
                capability: "staff.manage",
                requiresApproval: true,
                scope: "location",
              },
              {
                capability: "catalog.edit",
                requiresApproval: true,
                scope: "location",
              },
            ],
            locationIds: ["location-a"],
            tenantId: "tenant-a",
          } as never,
          kind: "ready",
          workspace,
        },
        actions: {
          deactivateResource: action,
          deactivateStaff: action,
          saveResource: action,
          saveResourceType: action,
          saveStaffProfile: action,
          setResourceLocationEligibility: action,
          setResourceRequirement: action,
          setStaffEligibility: action,
        },
      }),
    );

    expect(html).not.toContain('name="publicName"');
    expect(html).not.toContain('name="expectedRevision"');
    expect(html).not.toContain('name="resourceTypeId" type="hidden"');
    expect(html).not.toContain('name="resolution"');
    expect(html).toContain('name="serviceId"');
    expect(html).toContain('name="locationId"');
    expect(html).toContain("Update exact eligibility");
  });

  it("renders the same protected state in Arabic", () => {
    const html = renderToStaticMarkup(
      createElement(TeamResourcesView, {
        locale: "ar",
        actions: {
          deactivateResource: action,
          deactivateStaff: action,
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
        result: "reassigned",
        actions: {
          deactivateResource: action,
          deactivateStaff: action,
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
    expect(html).toContain("أُعيد تعيين");
    expect(html).toContain("أدخل قيمة صالحة لهذا الحقل ثم أرسل النموذج مرة أخرى.");
    expect(html).toContain('aria-live="polite"');
  });
});
