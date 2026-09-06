import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "book.tenant.example" }),
}));

vi.mock("@wlbp/tenant-resolution", () => ({
  extractRequestHostname: () => "book.tenant.example",
}));

vi.mock("@wlbp/supabase-client/server", () => ({
  createRequestScopedSupabaseClient: () => ({
    schema: () => ({ rpc }),
  }),
}));

import { GET } from "./route";

const requestUrl =
  "https://book.tenant.example/api/availability?" +
  new URLSearchParams({
    endBefore: "2026-11-02T05:00:00.000Z",
    locale: "en",
    locationId: "a5000000-0000-0000-0000-000000000001",
    partySize: "1",
    serviceId: "a7200000-0000-0000-0000-000000000001",
    startAfter: "2026-11-01T04:00:00.000Z",
    timeZone: "America/New_York",
  });

afterEach(() => {
  vi.unstubAllEnvs();
  rpc.mockReset();
});

describe("Client availability route caching", () => {
  it("does not cache a successful advisory response", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test-key");
    vi.stubEnv("WLBP_RUNTIME_ENV", "test");
    rpc.mockResolvedValue({
      data: [
        {
          allocation_kind: "appointment",
          customer_time_zone: "America/New_York",
          location_time_zone: "America/New_York",
          no_slot_code: null,
          provider_health_code: "not_applicable",
          result_kind: "slot",
          slot_end: "2026-11-01T06:30:00.000Z",
          slot_start: "2026-11-01T05:30:00.000Z",
          staff_id: null,
        },
      ],
      error: null,
    });

    const response = await GET(new Request(requestUrl));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Availability-Advisory")).toBe("true");
  });

  it("does not cache an error response", async () => {
    const response = await GET(new Request(requestUrl));

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
