import { describe, expect, it } from "vitest";

import {
  parseAvailabilityV1Request,
  parseAvailabilityV1Response,
  parseBookingDecisionV1Request,
  parseBookingDecisionV1Response,
  parseBookingRequestsV1,
  parseConfirmBookingV1Request,
  parseConfirmBookingV1Response,
  parseProposalResponseV1,
  parseCreateHoldV1Request,
  parseCreateHoldV1Response,
  parseHoldFormV1,
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

describe("create hold v1", () => {
  const request = {
    expectedCacheTag: "availability:tenant-a:1:1:1:1",
    idempotencyKey: "idempotency-key-aaaa-0001",
    locale: "en",
    locationId: "location-a",
    partySize: 1,
    serviceId: "service-a",
    sessionToken: "session-token-aaaa-0001",
    staffPreferenceId: null,
    startAt: "2026-09-21T14:00:00.000Z",
  } as const;

  const response = {
    allocationKind: "appointment",
    expiresAt: "2026-09-21T13:10:00.000Z",
    holdId: "hold-a",
    price: { currency: "SAR", minorUnits: 18000 },
    replayed: false,
    slotEnd: "2026-09-21T14:45:00.000Z",
    slotStart: "2026-09-21T14:00:00.000Z",
    staffId: "staff-a",
    state: "active",
  } as const;

  it("accepts a well formed request and response", () => {
    expect(parseCreateHoldV1Request(request)).toEqual(request);
    expect(parseCreateHoldV1Response(response)).toEqual(response);
  });

  it("rejects a short session token or idempotency key", () => {
    expect(() =>
      parseCreateHoldV1Request({ ...request, sessionToken: "short" }),
    ).toThrow();
    expect(() =>
      parseCreateHoldV1Request({ ...request, idempotencyKey: "short" }),
    ).toThrow();
  });

  it("rejects a slot that does not start on a whole minute", () => {
    expect(() =>
      parseCreateHoldV1Request({ ...request, startAt: "2026-09-21T14:00:30.000Z" }),
    ).toThrow();
  });

  it("rejects a party size beyond the exclusive capacity contract", () => {
    expect(() => parseCreateHoldV1Request({ ...request, partySize: 2 })).toThrow();
  });

  it("rejects a hold that outlives the slot it protects", () => {
    expect(() =>
      parseCreateHoldV1Response({ ...response, expiresAt: "2026-09-21T14:30:00.000Z" }),
    ).toThrow();
  });

  it("rejects an exclusive-resource hold that discloses a subject", () => {
    expect(() =>
      parseCreateHoldV1Response({ ...response, allocationKind: "exclusive_resource" }),
    ).toThrow();
  });
});

describe("confirm booking v1", () => {
  const request = {
    consentVersion: "2",
    contact: {
      email: "guest@example.invalid",
      fullName: "Test Guest",
      phone: "+966 55 000 0000",
    },
    customerTimeZone: "Asia/Riyadh",
    holdId: "0a3f2b64-0000-4000-8000-000000000001",
    idempotencyKey: "confirm-0a3f2b64-0000-4000-8000-000000000001",
    intake: { reason: "First visit" },
    locale: "en",
    sessionToken: "session-token-0123456789",
  } as const;

  const response = {
    approvalDeadline: null,
    approvalStatus: "not_required",
    bookingId: "0a3f2b64-0000-4000-8000-000000000002",
    bookingRevision: 1,
    calendarStatus: "pending",
    consentVersion: "2",
    customerTimeZone: "Asia/Riyadh",
    endAt: "2026-09-21T14:45:00.000Z",
    locale: "en",
    locationName: "Downtown",
    locationTimeZone: "America/New_York",
    notificationStatus: "queued",
    paymentStatus: "not_required",
    price: { currency: "SAR", minorUnits: 18_000 },
    publicReference: "K3M9P2T7XY",
    replayed: false,
    serviceName: "Initial consultation",
    startAt: "2026-09-21T14:00:00.000Z",
    status: "confirmed",
    taxRateBps: 1500,
  } as const;

  it("accepts a well formed request and response", () => {
    expect(parseConfirmBookingV1Request(request)).toEqual(request);
    expect(parseConfirmBookingV1Response(response)).toEqual(response);
  });

  it("normalizes and bounds guest contact details", () => {
    expect(
      parseConfirmBookingV1Request({
        ...request,
        contact: { ...request.contact, email: "  GUEST@example.invalid " },
      }).contact.email,
    ).toBe("guest@example.invalid");
    expect(() =>
      parseConfirmBookingV1Request({
        ...request,
        contact: { ...request.contact, email: "not-an-email" },
      }),
    ).toThrow();
    expect(() =>
      parseConfirmBookingV1Request({
        ...request,
        contact: { ...request.contact, fullName: "x".repeat(161) },
      }),
    ).toThrow();
  });

  it("refuses contact fields the booking purpose never declared", () => {
    expect(() =>
      parseConfirmBookingV1Request({
        ...request,
        contact: { ...request.contact, marketingOptIn: true },
      }),
    ).toThrow();
  });

  it("bounds intake answers", () => {
    expect(() =>
      parseConfirmBookingV1Request({
        ...request,
        intake: { reason: "x".repeat(2001) },
      }),
    ).toThrow();
    expect(() =>
      parseConfirmBookingV1Request({ ...request, intake: { reason: 7 } }),
    ).toThrow();
  });

  it("keeps booking state independent of provider state", () => {
    expect(
      parseConfirmBookingV1Response({ ...response, notificationStatus: "failed" })
        .status,
    ).toBe("confirmed");
    expect(() =>
      parseConfirmBookingV1Response({ ...response, status: "held" }),
    ).toThrow();
    expect(() =>
      parseConfirmBookingV1Response({ ...response, notificationStatus: "unknown" }),
    ).toThrow();
  });

  it("rejects a reference outside the confusable-free alphabet", () => {
    expect(() =>
      parseConfirmBookingV1Response({ ...response, publicReference: "K3M9P2T7XI" }),
    ).toThrow();
  });

  it("accepts only a declared hold form shape", () => {
    expect(
      parseHoldFormV1({
        consentText: "Cancellations are free up to 24 hours before.",
        consentVersion: "2",
        fields: [{ key: "reason", label: "Reason", maxLength: 500, required: true }],
        locationName: "Downtown",
        serviceName: "Initial consultation",
      }).fields[0]?.key,
    ).toBe("reason");
    expect(() =>
      parseHoldFormV1({
        consentText: "",
        consentVersion: "2",
        fields: [{ key: "reason", label: "Reason", maxLength: 5000, required: true }],
        locationName: "Downtown",
        serviceName: "Initial consultation",
      }),
    ).toThrow();
  });
});

describe("request to book v1", () => {
  const requested = {
    approvalDeadline: "2026-09-23T14:00:00.000Z",
    approvalStatus: "pending",
    bookingId: "0a3f2b64-0000-4000-8000-000000000002",
    bookingRevision: 1,
    calendarStatus: "pending",
    consentVersion: "2",
    customerTimeZone: "Asia/Riyadh",
    endAt: "2026-09-21T14:45:00.000Z",
    locale: "en",
    locationName: "Downtown",
    locationTimeZone: "America/New_York",
    notificationStatus: "queued",
    paymentStatus: "not_required",
    price: { currency: "SAR", minorUnits: 18_000 },
    publicReference: "K3M9P2T7XY",
    replayed: false,
    serviceName: "Site visit",
    startAt: "2026-09-21T14:00:00.000Z",
    status: "requested",
    taxRateBps: 1500,
  } as const;

  it("accepts a pending request with its decision deadline", () => {
    expect(parseConfirmBookingV1Response(requested)).toEqual(requested);
  });

  it("refuses a status that disagrees with the approval state", () => {
    expect(() =>
      parseConfirmBookingV1Response({ ...requested, status: "confirmed" }),
    ).toThrow();
    expect(() =>
      parseConfirmBookingV1Response({ ...requested, approvalDeadline: null }),
    ).toThrow();
  });

  it("reads the pending-action queue", () => {
    const row = {
      approvalDeadline: "2026-09-23T14:00:00.000Z",
      bookingId: "0a3f2b64-0000-4000-8000-000000000002",
      bookingRevision: 1,
      customerDisplayName: null,
      endAt: "2026-09-21T14:45:00.000Z",
      hasIntake: true,
      locale: "en",
      locationId: "a5000000-0000-4000-8000-000000000001",
      locationName: "Downtown",
      locationTimeZone: "America/New_York",
      price: { currency: "SAR", minorUnits: 18_000 },
      proposal: null,
      publicReference: "K3M9P2T7XY",
      requestedAt: "2026-09-21T13:00:00.000Z",
      serviceName: "Site visit",
      startAt: "2026-09-21T14:00:00.000Z",
    } as const;
    expect(parseBookingRequestsV1([row])[0]?.customerDisplayName).toBeNull();
    expect(() => parseBookingRequestsV1([{ ...row, hasIntake: "yes" }])).toThrow();
  });

  it("requires a proposal to carry exactly one future whole-minute time", () => {
    const decision = {
      action: "propose",
      bookingId: "0a3f2b64-0000-4000-8000-000000000002",
      expectedRevision: 1,
      internalReason: null,
      proposedStartAt: "2026-09-22T14:00:00.000Z",
      publicReason: "Would this work instead?",
      tenantId: "a0000000-0000-4000-8000-000000000001",
    } as const;
    expect(parseBookingDecisionV1Request(decision).action).toBe("propose");
    expect(() =>
      parseBookingDecisionV1Request({ ...decision, proposedStartAt: null }),
    ).toThrow();
    expect(() =>
      parseBookingDecisionV1Request({ ...decision, action: "accept" }),
    ).toThrow();
    expect(() =>
      parseBookingDecisionV1Request({
        ...decision,
        proposedStartAt: "2026-09-22T14:00:30.000Z",
      }),
    ).toThrow();
    expect(() =>
      parseBookingDecisionV1Request({ ...decision, publicReason: "x".repeat(501) }),
    ).toThrow();
  });

  it("returns a proposal link only as a whole", () => {
    const result = {
      approvalStatus: "pending",
      bookingId: "0a3f2b64-0000-4000-8000-000000000002",
      bookingRevision: 1,
      proposalActionToken: "a".repeat(64),
      proposalExpiresAt: "2026-09-22T14:00:00.000Z",
      status: "requested",
    } as const;
    expect(parseBookingDecisionV1Response(result).proposalActionToken).toHaveLength(64);
    expect(() =>
      parseBookingDecisionV1Response({ ...result, proposalExpiresAt: null }),
    ).toThrow();
    expect(() =>
      parseBookingDecisionV1Response({ ...result, proposalActionToken: "short" }),
    ).toThrow();
  });

  it("ties a proposal outcome to the booking state it produced", () => {
    const accepted = {
      bookingId: "0a3f2b64-0000-4000-8000-000000000002",
      endAt: "2026-09-22T14:45:00.000Z",
      proposalState: "accepted",
      publicReference: "K3M9P2T7XY",
      startAt: "2026-09-22T14:00:00.000Z",
      status: "confirmed",
    } as const;
    expect(parseProposalResponseV1(accepted).proposalState).toBe("accepted");
    expect(() =>
      parseProposalResponseV1({ ...accepted, status: "requested" }),
    ).toThrow();
    expect(
      parseProposalResponseV1({
        ...accepted,
        proposalState: "declined",
        status: "requested",
      }).status,
    ).toBe("requested");
  });
});
