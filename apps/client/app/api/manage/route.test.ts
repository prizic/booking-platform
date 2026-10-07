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

const token = "d".repeat(64);

function post(body: unknown) {
  return POST(
    new Request("https://book.tenant.example/api/manage", {
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

describe("Client manage route boundary", () => {
  it("answers a malformed token like every other refusal, without a database call", async () => {
    const response = await post({ intent: "view", token: "not-a-token" });
    expect(await response.json()).toEqual({ outcome: "unavailable" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("treats a malformed code as a code that did not verify", async () => {
    const response = await post({ action: "verify-step-up", code: "12ab", token });
    expect(await response.json()).toEqual({ verified: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a cancellation that carries a time, and a move without one", async () => {
    for (const body of [
      {
        action: "cancel",
        expectedRevision: 1,
        newStartAt: "2035-09-24T13:00:00.000Z",
        token,
      },
      { action: "reschedule", expectedRevision: 1, newStartAt: null, token },
      { action: "cancel", expectedRevision: 0, newStartAt: null, token },
    ]) {
      expect(await (await post(body)).json()).toEqual({ outcome: "unavailable" });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("forwards a valid cancellation at the revision the customer saw", async () => {
    rpc.mockResolvedValue({ data: [{ outcome: "unavailable" }], error: null });
    await post({ action: "cancel", expectedRevision: 3, newStartAt: null, token });
    expect(rpc).toHaveBeenCalledWith(
      "act_on_management_link_v1",
      expect.objectContaining({
        p_action: "cancel",
        p_expected_revision: 3,
        p_new_start: null,
        p_token: token,
      }),
    );
  });
});
