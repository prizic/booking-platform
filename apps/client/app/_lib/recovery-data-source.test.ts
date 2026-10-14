import { describe, expect, it, vi } from "vitest";
import type { PublicRpcRequest } from "./public-read-context";
import { requestBookingRecovery } from "./recovery-data-source";
const accepted = { contractVersion: 1, outcome: "accepted" };
describe("R5 recovery data access", () => {
  it("carries trusted ingress metadata only on the recovery RPC request", async () => {
    const promise = Promise.resolve({ data: accepted, error: null });
    const setHeader = vi.fn((): PublicRpcRequest => request);
    const request: PublicRpcRequest = Object.assign(promise, { setHeader });
    const rpc = vi.fn(() => request);
    expect(
      await requestBookingRecovery(
        { rpc },
        "client.tenant.example.invalid",
        "guest@example.invalid",
        "request-id",
        "192.0.2.1",
      ),
    ).toEqual(accepted);
    expect(setHeader).toHaveBeenCalledExactlyOnceWith("x-forwarded-for", "192.0.2.1");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("request_booking_recovery_v1", {
      p_hostname: "client.tenant.example.invalid",
      p_application: "client",
      p_email: "guest@example.invalid",
      p_request_id: "request-id",
    });
  });
  it("returns no raw DB error detail or unrecognized response data", async () => {
    await expect(
      requestBookingRecovery(
        { rpc: async () => ({ data: null, error: { code: "57014" } }) },
        "client.tenant.example.invalid",
        "guest@example.invalid",
        "request-id",
      ),
    ).rejects.toThrow("recovery_unavailable");
    await expect(
      requestBookingRecovery(
        { rpc: async () => ({ data: { ...accepted, matches: 2 }, error: null }) },
        "client.tenant.example.invalid",
        "guest@example.invalid",
        "request-id",
      ),
    ).rejects.toThrow();
  });
});
