import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { hostname, create, rpc } = vi.hoisted(() => ({
  hostname: vi.fn(),
  create: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "client.tenant.example.invalid" }),
}));
vi.mock("@wlbp/tenant-resolution", () => ({ extractRequestHostname: hostname }));
vi.mock("@wlbp/supabase-client/server", () => ({
  createRequestScopedSupabaseClient: create,
}));
import {
  createPublicReadContext,
  reportPublicReadFailure,
} from "./public-read-context";
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test-key");
  vi.stubEnv("WLBP_RUNTIME_ENV", "test");
  hostname.mockReturnValue("client.tenant.example.invalid");
  create.mockReturnValue({ schema: () => ({ rpc }) });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
describe("R1 public request context", () => {
  it("reads published public data anonymously even if a staff session exists", async () => {
    expect(await createPublicReadContext()).toMatchObject({
      outcome: "ready",
      hostname: "client.tenant.example.invalid",
    });
    expect(create.mock.calls[0]?.[1].getAll()).toEqual([]);
  });
  it("separates missing configuration from invalid request-host routing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(await createPublicReadContext()).toEqual({
      outcome: "error",
      reason: "configuration",
    });
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    hostname.mockImplementation(() => {
      throw new Error("private host details");
    });
    expect(await createPublicReadContext()).toEqual({
      outcome: "error",
      reason: "tenant",
    });
  });
  it("writes only a fixed JSON diagnostic vocabulary", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reportPublicReadFailure("catalog", { outcome: "error", reason: "read" });
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({
        event: "client_public_read_failure",
        operation: "catalog",
        outcome: "read",
      }),
    );
  });
});
