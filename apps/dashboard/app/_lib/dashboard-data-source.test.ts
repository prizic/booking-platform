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
  it("uses the shared advisory availability contract without exposing private rows", async () => {
    const calls: Array<{ args?: Readonly<Record<string, unknown>>; name: string }> = [];
    const client = {
      auth: { getClaims: async () => ({ data: null, error: null }) },
      schema: () => ({
        rpc: async (name: string, args?: Readonly<Record<string, unknown>>) => {
          calls.push({ name, ...(args === undefined ? {} : { args }) });
          return {
            data: [
              {
                allocation_kind: "appointment",
                customer_time_zone: "Europe/Istanbul",
                location_time_zone: "America/New_York",
                result_kind: "slot",
                slot_end: "2026-09-10T14:30:00.000Z",
                slot_start: "2026-09-10T14:00:00.000Z",
                staff_id: "staff-public-a",
                private_reason: "must not escape",
              },
            ],
            error: null,
          };
        },
      }),
    } as unknown as RequestScopedSupabaseClient;
    const source = createDashboardDataSource(client);

    await expect(
      source.getAvailability!("dashboard.tenant.example", {
        endBefore: "2026-09-11T00:00:00.000Z",
        locale: "en",
        locationId: "location-a" as never,
        partySize: 1,
        serviceId: "service-a",
        staffPreferenceId: null,
        startAfter: "2026-09-10T00:00:00.000Z",
        timeZone: "Europe/Istanbul",
      }),
    ).resolves.toEqual({
      advisory: true,
      displayTimeZone: "Europe/Istanbul",
      locationTimeZone: "America/New_York",
      noSlotReason: null,
      providerHealth: "not_applicable",
      slots: [
        {
          allocationKind: "appointment",
          endAt: "2026-09-10T14:30:00.000Z",
          staffId: "staff-public-a",
          startAt: "2026-09-10T14:00:00.000Z",
        },
      ],
    });
    expect(calls[0]).toEqual({
      name: "get_availability_v1",
      args: expect.objectContaining({
        p_application: "dashboard",
        p_hostname: "dashboard.tenant.example",
        p_window_end: "2026-09-11T00:00:00.000Z",
        p_window_start: "2026-09-10T00:00:00.000Z",
      }),
    });
  });

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

  it("loads the staff/resource workspace through one versioned RPC", async () => {
    const calls: Array<{ args?: Readonly<Record<string, unknown>>; name: string }> = [];
    const client = {
      auth: { getClaims: async () => ({ data: null, error: null }) },
      schema: () => ({
        rpc: async (name: string, args?: Readonly<Record<string, unknown>>) => {
          calls.push({ name, ...(args === undefined ? {} : { args }) });
          if (name === "get_staff_resource_choices_v1") {
            return {
              data: [
                {
                  choice_id: "location-a",
                  choice_key: "downtown",
                  choice_kind: "location",
                  choice_name: "Downtown",
                  exclusive: null,
                  revision: null,
                },
                {
                  choice_id: "service-a",
                  choice_key: "consultation",
                  choice_kind: "service",
                  choice_name: "Consultation",
                  exclusive: null,
                  revision: null,
                },
                {
                  choice_id: "type-a",
                  choice_key: "room",
                  choice_kind: "resource_type",
                  choice_name: "Room",
                  exclusive: true,
                  revision: 1,
                },
              ],
              error: null,
            };
          }
          return {
            data: [
              {
                future_allocation_count: 2,
                item_id: "staff-a",
                internal_notes: "Morning shifts",
                item_key: null,
                item_kind: "staff",
                location_ids: ["location-a"],
                membership_id: "membership-a",
                name: "Layla Hassan",
                offered_hours_per_week: 40,
                public_bio: "Booking specialist",
                resource_type_id: null,
                resource_type_name: null,
                revision: 2,
                service_ids: ["service-a"],
                status: "active",
                tenant_id: "tenant-a",
              },
              {
                future_allocation_count: 0,
                item_id: "resource-a",
                internal_notes: "",
                item_key: "room-one",
                item_kind: "resource",
                location_ids: ["location-a"],
                membership_id: null,
                name: "Room 1",
                offered_hours_per_week: null,
                public_bio: null,
                resource_type_id: "type-a",
                resource_type_name: "Room",
                revision: 3,
                service_ids: ["service-a"],
                status: "maintenance",
                tenant_id: "tenant-a",
              },
            ],
            error: null,
          };
        },
      }),
    } as unknown as RequestScopedSupabaseClient;

    const source = createDashboardDataSource(client);
    await expect(source.getStaffResourceWorkspace("tenant-a", "en")).resolves.toEqual({
      tenantId: "tenant-a",
      locations: [{ id: "location-a", name: "Downtown" }],
      resourceTypes: [
        { exclusive: true, id: "type-a", key: "room", name: "Room", revision: 1 },
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
          id: "resource-a",
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
    });
    expect(calls).toEqual([
      {
        args: { p_tenant_id: "tenant-a" },
        name: "get_staff_resource_workspace_v1",
      },
      {
        args: { p_locale: "en", p_tenant_id: "tenant-a" },
        name: "get_staff_resource_choices_v1",
      },
    ]);
  });

  it("maps management writes only to their versioned RPC arguments", async () => {
    const calls: Array<{ args?: Readonly<Record<string, unknown>>; name: string }> = [];
    const client = {
      auth: { getClaims: async () => ({ data: null, error: null }) },
      schema: () => ({
        rpc: async (name: string, args?: Readonly<Record<string, unknown>>) => {
          calls.push({ name, ...(args === undefined ? {} : { args }) });
          return { data: null, error: null };
        },
      }),
    } as unknown as RequestScopedSupabaseClient;
    const source = createDashboardDataSource(client);

    await source.saveStaffProfile({
      bio: "Booking specialist",
      expectedRevision: null,
      internalNotes: "Morning shifts",
      membershipId: null,
      offeredHoursPerWeek: 32.5,
      publicName: "Layla Hassan",
      reason: "New starter",
      requestId: "request-a",
      staffId: null,
      tenantId: "tenant-a",
    });
    await source.setStaffServiceLocationEligibility({
      eligible: true,
      locationId: "location-a",
      reason: "Coverage",
      requestId: "request-b",
      serviceId: "service-a",
      staffId: "staff-a",
      tenantId: "tenant-a",
    });
    await source.setResourceRequirement({
      reason: "Room required",
      requestId: "request-c",
      required: true,
      resourceTypeId: "type-a",
      serviceId: "service-a",
      tenantId: "tenant-a",
    });

    expect(calls).toEqual([
      {
        name: "save_staff_profile_v1",
        args: {
          p_public_bio: "Booking specialist",
          p_expected_revision: null,
          p_internal_notes: "Morning shifts",
          p_membership_id: null,
          p_offered_hours_per_week: 32.5,
          p_public_name: "Layla Hassan",
          p_reason: "New starter",
          p_request_id: "request-a",
          p_staff_id: null,
          p_tenant_id: "tenant-a",
        },
      },
      {
        name: "set_staff_service_location_eligibility_v1",
        args: {
          p_eligible: true,
          p_location_id: "location-a",
          p_reason: "Coverage",
          p_request_id: "request-b",
          p_service_id: "service-a",
          p_staff_id: "staff-a",
          p_tenant_id: "tenant-a",
        },
      },
      {
        name: "set_resource_requirement_v1",
        args: {
          p_reason: "Room required",
          p_request_id: "request-c",
          p_required: true,
          p_resource_type_id: "type-a",
          p_service_id: "service-a",
          p_tenant_id: "tenant-a",
        },
      },
    ]);
  });

  it("maps safe deactivation workflows to the exact versioned RPC arguments", async () => {
    const calls: Array<{ args?: Readonly<Record<string, unknown>>; name: string }> = [];
    const client = {
      auth: { getClaims: async () => ({ data: null, error: null }) },
      schema: () => ({
        rpc: async (name: string, args?: Readonly<Record<string, unknown>>) => {
          calls.push({ name, ...(args === undefined ? {} : { args }) });
          return {
            data:
              name === "deactivate_staff_v1"
                ? [
                    {
                      outcome: "reassigned",
                      remaining_allocations: 0,
                      staff_id: "staff-a",
                    },
                  ]
                : [
                    {
                      outcome: "deferred",
                      remaining_allocations: 2,
                      resource_id: "resource-a",
                    },
                  ],
            error: null,
          };
        },
      }),
    } as unknown as RequestScopedSupabaseClient;
    const source = createDashboardDataSource(client);

    await expect(
      source.deactivateStaff({
        reason: "Reassign coverage",
        replacementStaffId: "staff-b",
        requestId: "request-a",
        resolution: "reassign",
        staffId: "staff-a",
        tenantId: "tenant-a",
      }),
    ).resolves.toMatchObject({ outcome: "reassigned", targetId: "staff-a" });
    await expect(
      source.deactivateResource({
        reason: "Pause room",
        replacementResourceId: null,
        requestId: "request-b",
        resolution: "defer",
        resourceId: "resource-a",
        tenantId: "tenant-a",
      }),
    ).resolves.toMatchObject({ outcome: "deferred", targetId: "resource-a" });

    expect(calls).toEqual([
      {
        name: "deactivate_staff_v1",
        args: {
          p_reason: "Reassign coverage",
          p_replacement_staff_id: "staff-b",
          p_request_id: "request-a",
          p_resolution: "reassign",
          p_staff_id: "staff-a",
          p_tenant_id: "tenant-a",
        },
      },
      {
        name: "deactivate_resource_v1",
        args: {
          p_reason: "Pause room",
          p_replacement_resource_id: null,
          p_request_id: "request-b",
          p_resolution: "defer",
          p_resource_id: "resource-a",
          p_tenant_id: "tenant-a",
        },
      },
    ]);
  });
});
