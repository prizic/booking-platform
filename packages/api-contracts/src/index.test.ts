import { describe, expect, it } from "vitest";

import {
  parseAssignmentCandidatesV1,
  parseDashboardContextV1,
  parsePublicCatalogV1,
  parseStaffResourceWorkspaceV1,
  parseTenantChoicesV1,
} from "./index.js";

describe("assignment candidate DTO", () => {
  it.each(["fixed_staff", "customer_choice", "any_available", "round_robin"])(
    "parses the customer-safe %s assignment mode",
    (assignmentMode) => {
      expect(
        parseAssignmentCandidatesV1([
          {
            assignmentMode,
            candidateRank: 1,
            resourceId: null,
            resourceName: null,
            staffId: "staff-a",
            staffName: "Alex",
          },
        ]),
      ).toEqual([
        {
          assignmentMode,
          candidateRank: 1,
          resourceId: null,
          resourceName: null,
          staffId: "staff-a",
          staffName: "Alex",
        },
      ]);
    },
  );

  it("rejects internal fairness inputs and notes from the public projection", () => {
    expect(() =>
      parseAssignmentCandidatesV1([
        {
          assignmentMode: "round_robin",
          candidateRank: 1,
          internalNotes: "must-not-pass",
          offeredHoursPerWeek: 40,
          resourceId: null,
          resourceName: null,
          staffId: "staff-a",
          staffName: "Alex",
        },
      ]),
    ).toThrow("Assignment candidate");
  });

  it("requires exactly one staff or resource identity", () => {
    expect(() =>
      parseAssignmentCandidatesV1([
        {
          assignmentMode: "customer_choice",
          candidateRank: 1,
          resourceId: "resource-a",
          resourceName: "Room A",
          staffId: "staff-a",
          staffName: "Alex",
        },
      ]),
    ).toThrow("Assignment candidate");
  });
});

describe("tenant isolation DTOs", () => {
  it("parses a customer-safe bilingual catalog item", () => {
    const [item] = parsePublicCatalogV1([
      {
        tenantId: "tenant-a",
        publicationId: "publication-a",
        publicationRevision: 1,
        locale: "ar",
        serviceId: "service-a",
        serviceKey: "consultation",
        categoryKey: null,
        serviceName: "استشارة",
        serviceDescription: "وصف",
        canonicalPath: "/services/consultation",
        durationMinutes: 45,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 10,
        price: { currency: "SAR", minorUnits: 18000 },
        taxRateBps: 1500,
        capacityMode: "exclusive",
        bookingMode: "appointment",
        approvalRequired: false,
        paymentMode: "none",
        locationId: "location-a",
        locationKey: "riyadh",
        locationName: "الرياض",
        locationDescription: "موقع",
        locationAddress: "العنوان",
        locationTimeZone: "Asia/Riyadh",
        locationCanonicalPath: "/locations/riyadh",
        cacheTag: "catalog:tenant-a:1:ar",
      },
    ]);
    expect(item?.locale).toBe("ar");
    expect(item?.cacheTag).toBe("catalog:tenant-a:1:ar");
  });

  it("parses a minimal tenant-safe Dashboard context", () => {
    expect(
      parseDashboardContextV1({
        aal2: false,
        brandId: "brand-a",
        tenantId: "tenant-a",
        instanceId: "instance-a",
        dashboardHostname: "dashboard.tenant.example",
        defaultLocale: "en",
        tenantName: "Tenant A",
        membershipId: "membership-a",
        roleKey: "scheduler",
        grants: [
          {
            capability: "booking.view.any",
            requiresApproval: false,
            scope: "location",
          },
        ],
        locationIds: ["location-a"],
        locationScope: { kind: "all" },
        publishedBrandRevision: 2,
        configRevision: 3,
        featureRevision: 4,
      }),
    ).toMatchObject({ tenantId: "tenant-a", roleKey: "scheduler" });
  });

  it("rejects whole rows and malformed grants instead of forwarding them", () => {
    expect(() =>
      parseDashboardContextV1({
        aal2: false,
        brandId: "brand-a",
        tenantId: "tenant-a",
        instanceId: "instance-a",
        dashboardHostname: "dashboard.tenant.example",
        defaultLocale: "en",
        tenantName: "Tenant A",
        membershipId: "membership-a",
        roleKey: "scheduler",
        grants: [{ capability: "root", requiresApproval: false, scope: "tenant" }],
        locationIds: [],
        locationScope: { kind: "all" },
        publishedBrandRevision: 2,
        configRevision: 3,
        featureRevision: 4,
        rawCustomerEmail: "must-not-pass",
      }),
    ).toThrow("Dashboard context");
  });

  it("requires canonical tenant choices", () => {
    expect(
      parseTenantChoicesV1([
        {
          tenantId: "tenant-a",
          membershipId: "membership-a",
          roleKey: "scheduler",
          tenantName: "Tenant A",
          dashboardHostname: "dashboard.tenant.example",
        },
      ]),
    ).toHaveLength(1);
  });

  it("parses the minimal staff and resource management workspace", () => {
    expect(
      parseStaffResourceWorkspaceV1({
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
            status: "deactivation_pending",
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
      }),
    ).toEqual({
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
          status: "deactivation_pending",
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
  });

  it("rejects internal fields from the management workspace DTO", () => {
    expect(() =>
      parseStaffResourceWorkspaceV1({
        tenantId: "tenant-a",
        items: [
          {
            futureAllocationCount: 0,
            id: "staff-a",
            internalNotes: "must not escape",
            kind: "staff",
            locationIds: [],
            name: "Layla Hassan",
            resourceTypeName: null,
            serviceIds: [],
            status: "active",
          },
        ],
      }),
    ).toThrow("Staff/resource workspace");
  });
});
