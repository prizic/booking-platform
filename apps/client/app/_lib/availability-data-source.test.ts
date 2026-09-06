import { describe, expect, it } from "vitest";

import { createClientAvailabilityDataSource } from "./availability-data-source";

const request = {
  endBefore: "2026-11-02T05:00:00.000Z",
  locale: "en" as const,
  locationId: "location-a",
  partySize: 1,
  serviceId: "service-a",
  staffPreferenceId: null,
  startAfter: "2026-11-01T04:00:00.000Z",
  timeZone: "America/New_York",
};

const slotRow = {
  allocation_kind: "appointment",
  advisory_as_of: "2026-10-01T10:00:00.000Z",
  advisory_until: "2026-10-01T10:00:30.000Z",
  cache_tag: "availability:tenant-a:1:1:1:1",
  candidate_rank: 1,
  contract_version: 1,
  customer_time_zone: "America/New_York",
  fold: 0,
  local_start: "2026-11-01T01:30:00",
  location_time_zone: "America/New_York",
  no_slot_code: null,
  provider_health_code: "not_applicable",
  result_kind: "slot",
  slot_end: "2026-11-01T06:30:00.000Z",
  slot_start: "2026-11-01T05:30:00.000Z",
  staff_id: "staff-a",
  utc_offset_seconds: -14400,
};

describe("Client availability data source", () => {
  it("maps database rows through the shared minimal response parser", async () => {
    const source = createClientAvailabilityDataSource(
      { rpc: async () => ({ data: [slotRow], error: null }) },
      "book.tenant.example",
    );

    await expect(source.getAvailability(request)).resolves.toEqual({
      advisory: true,
      displayTimeZone: "America/New_York",
      locationTimeZone: "America/New_York",
      noSlotReason: null,
      providerHealth: "not_applicable",
      slots: [
        {
          allocationKind: "appointment",
          endAt: "2026-11-01T06:30:00.000Z",
          staffId: "staff-a",
          startAt: "2026-11-01T05:30:00.000Z",
        },
      ],
    });
  });

  it("maps failures to a non-disclosing client error", async () => {
    const source = createClientAvailabilityDataSource(
      { rpc: async () => ({ data: null, error: { code: "XX000" } }) },
      "book.tenant.example",
    );
    await expect(source.getAvailability(request)).rejects.toEqual(
      expect.objectContaining({
        code: "availability_unavailable",
        name: "ClientAvailabilityError",
      }),
    );
  });

  it("uses the trusted hostname and passes no tenant identity", async () => {
    let args: Readonly<Record<string, unknown>> | undefined;
    const source = createClientAvailabilityDataSource(
      {
        rpc: async (_name, value) => {
          args = value;
          return { data: [slotRow], error: null };
        },
      },
      "book.tenant.example",
    );
    await source.getAvailability(request);
    expect(args).toMatchObject({
      p_application: "client",
      p_customer_time_zone: "America/New_York",
      p_hostname: "book.tenant.example",
      p_window_end: request.endBefore,
      p_window_start: request.startAfter,
    });
    expect(args).not.toHaveProperty("p_tenant_id");
  });
});
