import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { POST } from "./route";

function post(body: unknown) {
  return POST(
    new Request("https://book.tenant.example/api/proposals", {
      body: JSON.stringify(body),
      method: "POST",
    }),
  );
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test-key");
  vi.stubEnv("WLBP_RUNTIME_ENV", "test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  rpc.mockReset();
});

describe("Client proposal route boundary", () => {
  it.each([
    { action: "accept", actionToken: "short" },
    { action: "counter", actionToken: "b".repeat(64) },
    { actionToken: "b".repeat(64) },
  ])("refuses %o as invalid_request before any database call", async (body) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "invalid_request", messageKey: "booking.error.invalid_request" },
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
