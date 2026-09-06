import { describe, expect, it } from "vitest";

import {
  parseAvailabilityV1Request,
  parseAvailabilityV1Response,
  parseAssignmentCandidatesV1,
  parseDashboardContextV1,
  normalizeAvailabilityV1TransportRow,
  parsePublicCatalogV1,
  parseSaveScheduleConfigV1,
  parseScheduleWorkspaceV1,
  parseStaffResourceDeactivationV1,
  parseStaffResourceWorkspaceV1,
  parseTenantChoicesV1,
} from "./index.js";

describe("public availability v1", () => {
  it("normalizes PostgreSQL timestamptz fields at the response transport boundary", () => {
    expect(
      normalizeAvailabilityV1TransportRow({
        advisory_as_of: "2026-11-01T05:00:00.123456+03:30",
        advisory_until: "2026-11-01T05:00:30+00:00",
        slot_end: "2026-11-01T06:30:00+00:00",
        slot_start: "2026-11-01T05:30:00+00:00",
      }),
    ).toEqual({
      advisory_as_of: "2026-11-01T01:30:00.123Z",
      advisory_until: "2026-11-01T05:00:30.000Z",
      slot_end: "2026-11-01T06:30:00.000Z",
      slot_start: "2026-11-01T05:30:00.000Z",
    });
  });

  it("rejects impossible PostgreSQL timestamptz calendar components", () => {
    expect(() =>
      normalizeAvailabilityV1TransportRow({
        slot_start: "2026-02-30T05:30:00+00:00",
      }),
    ).toThrow("PostgreSQL timestamptz");
  });

  it("accepts only a bounded, exact request shape", () => {
    expect(
      parseAvailabilityV1Request({
        endBefore: "2026-09-08T00:00:00.000Z",
        locale: "en",
        locationId: "location-a",
        partySize: 1,
        serviceId: "service-a",
        staffPreferenceId: null,
        startAfter: "2026-09-07T00:00:00.000Z",
        timeZone: "Europe/Istanbul",
      }),
    ).toMatchObject({ partySize: 1, staffPreferenceId: null });

    expect(() =>
      parseAvailabilityV1Request({
        endBefore: "2026-11-08T00:00:00.000Z",
        locale: "en",
        locationId: "location-a",
        partySize: 1,
        serviceId: "service-a",
        staffPreferenceId: null,
        startAfter: "2026-09-07T00:00:00.000Z",
        timeZone: "Europe/Istanbul",
      }),
    ).toThrow("31 days");
  });

  it("parses a privacy-safe advisory response with coarse recovery state", () => {
    expect(
      parseAvailabilityV1Response({
        advisory: true,
        displayTimeZone: "Europe/Istanbul",
        locationTimeZone: "Asia/Riyadh",
        noSlotReason: null,
        providerHealth: "not_applicable",
        slots: [
          {
            allocationKind: "appointment",
            endAt: "2026-09-07T09:30:00.000Z",
            staffId: "staff-public-a",
            startAt: "2026-09-07T09:00:00.000Z",
          },
        ],
      }),
    ).toMatchObject({ advisory: true, providerHealth: "not_applicable" });

    expect(() =>
      parseAvailabilityV1Response({
        advisory: true,
        conflictBookingId: "private-booking",
        displayTimeZone: "Europe/Istanbul",
        locationTimeZone: "Asia/Riyadh",
        noSlotReason: "no_matching_availability",
        providerHealth: "not_applicable",
        slots: [],
      }),
    ).toThrow("unexpected shape");
  });
});

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

describe("schedule Dashboard DTOs", () => {
  it("accepts only the explicit normalized workspace shape", () => {
    const [row] = parseScheduleWorkspaceV1([
      {
        kind: "weekly",
        id: "weekly-a",
        scopeId: "scope-a",
        locationId: "location-a",
        staffId: null,
        resourceId: null,
        localDate: null,
        dayOfWeek: 1,
        startMinute: 540,
        endMinute: 1020,
        startsAt: null,
        endsAt: null,
        exceptionKind: null,
        timeZone: "America/New_York",
        reason: null,
        policyKey: null,
        value: null,
        revision: 2,
      },
    ]);
    expect(row).toMatchObject({ kind: "weekly", dayOfWeek: 1, revision: 2 });
  });

  it("rejects private rows with undeclared columns", () => {
    expect(() =>
      parseScheduleWorkspaceV1([
        {
          kind: "time_off",
          id: "off-a",
          scopeId: null,
          locationId: "location-a",
          staffId: "staff-a",
          resourceId: null,
          localDate: null,
          dayOfWeek: null,
          startMinute: null,
          endMinute: null,
          startsAt: "2026-09-06T09:00:00Z",
          endsAt: "2026-09-06T10:00:00Z",
          exceptionKind: null,
          timeZone: "UTC",
          reason: "private",
          policyKey: null,
          value: null,
          revision: 1,
          internal_note: "must not escape",
        },
      ]),
    ).toThrow("unexpected shape");
  });

  it("requires a positive revision on save responses", () => {
    expect(parseSaveScheduleConfigV1({ targetId: "row-a", revision: 3 })).toEqual({
      targetId: "row-a",
      revision: 3,
    });
    expect(() => parseSaveScheduleConfigV1({ targetId: "row-a", revision: 0 })).toThrow(
      "positive revision",
    );
  });
});

describe("tenant isolation DTOs", () => {
  it("parses a minimal deactivation outcome", () => {
    expect(
      parseStaffResourceDeactivationV1({
        outcome: "reassigned",
        remainingAllocationCount: 0,
        targetId: "staff-a",
      }),
    ).toEqual({
      outcome: "reassigned",
      remainingAllocationCount: 0,
      targetId: "staff-a",
    });
  });

  it("rejects internal deactivation evidence", () => {
    expect(() =>
      parseStaffResourceDeactivationV1({
        affectedAllocationIds: ["booking-a"],
        outcome: "cancelled",
        remainingAllocationCount: 0,
        targetId: "staff-a",
      }),
    ).toThrow("deactivation result");
  });

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
        locations: [{ id: "location-a", name: "Downtown" }],
        resourceTypes: [
          { exclusive: true, id: "type-a", key: "room", name: "Room", revision: 2 },
        ],
        services: [{ id: "service-a", name: "Consultation" }],
        items: [
          {
            futureAllocationCount: 2,
            id: "staff-a",
            internalNotes: "Morning shifts",
            key: null,
            kind: "staff",
            locationIds: ["location-a"],
            membershipId: "membership-a",
            name: "Layla Hassan",
            offeredHoursPerWeek: 32.5,
            publicBio: "Booking specialist",
            resourceTypeId: null,
            resourceTypeName: null,
            revision: 3,
            serviceIds: ["service-a"],
            status: "deactivation_pending",
          },
          {
            futureAllocationCount: 0,
            id: "resource-a",
            internalNotes: "Door code stored elsewhere",
            key: "room-one",
            kind: "resource",
            locationIds: ["location-a"],
            membershipId: null,
            name: "Room 1",
            offeredHoursPerWeek: null,
            publicBio: null,
            resourceTypeId: "type-a",
            resourceTypeName: "Room",
            revision: 4,
            serviceIds: ["service-a"],
            status: "maintenance",
          },
        ],
      }),
    ).toEqual({
      tenantId: "tenant-a",
      locations: [{ id: "location-a", name: "Downtown" }],
      resourceTypes: [
        { exclusive: true, id: "type-a", key: "room", name: "Room", revision: 2 },
      ],
      services: [{ id: "service-a", name: "Consultation" }],
      items: [
        {
          futureAllocationCount: 2,
          id: "staff-a",
          internalNotes: "Morning shifts",
          key: null,
          kind: "staff",
          locationIds: ["location-a"],
          membershipId: "membership-a",
          name: "Layla Hassan",
          offeredHoursPerWeek: 32.5,
          publicBio: "Booking specialist",
          resourceTypeId: null,
          resourceTypeName: null,
          revision: 3,
          serviceIds: ["service-a"],
          status: "deactivation_pending",
        },
        {
          futureAllocationCount: 0,
          id: "resource-a",
          internalNotes: "Door code stored elsewhere",
          key: "room-one",
          kind: "resource",
          locationIds: ["location-a"],
          membershipId: null,
          name: "Room 1",
          offeredHoursPerWeek: null,
          publicBio: null,
          resourceTypeId: "type-a",
          resourceTypeName: "Room",
          revision: 4,
          serviceIds: ["service-a"],
          status: "maintenance",
        },
      ],
    });
  });

  it("rejects undeclared sensitive fields from the management workspace DTO", () => {
    expect(() =>
      parseStaffResourceWorkspaceV1({
        tenantId: "tenant-a",
        locations: [],
        resourceTypes: [],
        services: [],
        items: [
          {
            futureAllocationCount: 0,
            id: "staff-a",
            internalNotes: "manager-visible",
            kind: "staff",
            key: null,
            locationIds: [],
            membershipId: null,
            name: "Layla Hassan",
            offeredHoursPerWeek: 40,
            payrollNumber: "must not escape",
            publicBio: "",
            resourceTypeId: null,
            resourceTypeName: null,
            revision: 1,
            serviceIds: [],
            status: "active",
          },
        ],
      }),
    ).toThrow("Staff/resource workspace");
  });

  it("accepts a location-scoped workspace with tenant-only edit values redacted", () => {
    const workspace = {
      tenantId: "tenant-a",
      locations: [{ id: "location-a", name: "Downtown" }],
      resourceTypes: [],
      services: [{ id: "service-a", name: "Consultation" }],
      items: [
        {
          futureAllocationCount: 2,
          id: "staff-a",
          internalNotes: null,
          key: null,
          kind: "staff",
          locationIds: ["location-a"],
          membershipId: null,
          name: "Layla Hassan",
          offeredHoursPerWeek: null,
          publicBio: null,
          resourceTypeId: null,
          resourceTypeName: null,
          revision: null,
          serviceIds: ["service-a"],
          status: "active",
        },
        {
          futureAllocationCount: 0,
          id: "resource-a",
          internalNotes: null,
          key: null,
          kind: "resource",
          locationIds: ["location-a"],
          membershipId: null,
          name: "Room 1",
          offeredHoursPerWeek: null,
          publicBio: null,
          resourceTypeId: null,
          resourceTypeName: "Room",
          revision: null,
          serviceIds: ["service-a"],
          status: "active",
        },
      ],
    } as const;

    expect(parseStaffResourceWorkspaceV1(workspace)).toEqual(workspace);
  });
});
