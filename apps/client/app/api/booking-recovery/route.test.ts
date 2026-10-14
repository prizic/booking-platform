import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { rpc, context } = vi.hoisted(() => ({ rpc: vi.fn(), context: vi.fn() }));
vi.mock("../../_lib/public-read-context", () => ({ createPublicReadContext: context }));
import { POST } from "./route";
const requestId = "10000000-0000-4000-8000-000000000001";
const hostname = "client.tenant.example.invalid";
function post(
  email: unknown,
  extra: Record<string, unknown> = {},
  origin: string | null = "https://client.tenant.example.invalid",
) {
  return POST(
    new Request("https://client.tenant.example.invalid/api/booking-recovery", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(origin ? { Origin: origin } : {}),
      },
      body: JSON.stringify({ email, requestId, ...extra }),
    }),
  );
}
beforeEach(() => {
  rpc.mockResolvedValue({
    data: { contractVersion: 1, outcome: "accepted" },
    error: null,
  });
  context.mockResolvedValue({ outcome: "ready", hostname, api: { rpc } });
});
afterEach(() => {
  vi.clearAllMocks();
});
describe("R5 email-only recovery ingress", () => {
  it("normalizes email and sends only the trusted routing context plus request UUID", async () => {
    const response = await post("  Guest@Example.Invalid  ");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ contractVersion: 1, outcome: "accepted" });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("request_booking_recovery_v1", {
      p_hostname: hostname,
      p_application: "client",
      p_email: "guest@example.invalid",
      p_request_id: requestId,
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("has the same status and exact envelope for known unknown ineligible and unavailable outcomes", async () => {
    const envelopes: string[] = [];
    for (const email of [
      "known@example.invalid",
      "unknown@example.invalid",
      "ineligible@example.invalid",
    ]) {
      const response = await post(email);
      expect(response.status).toBe(200);
      envelopes.push(await response.text());
    }
    rpc.mockResolvedValue({
      data: null,
      error: { code: "57014", message: "private delivery detail" },
    });
    envelopes.push(await (await post("known@example.invalid")).text());
    rpc.mockRejectedValue(new Error("private network detail"));
    envelopes.push(await (await post("unknown@example.invalid")).text());
    context.mockResolvedValue({ outcome: "error", reason: "configuration" });
    envelopes.push(await (await post("known@example.invalid")).text());
    expect(new Set(envelopes).size).toBe(1);
  });
  it("never leaks a malformed backend envelope, booking count or token", async () => {
    rpc.mockResolvedValue({
      data: { contractVersion: 1, outcome: "accepted", count: 2, token: "private" },
      error: null,
    });
    expect(await (await post("guest@example.invalid")).json()).toEqual({
      contractVersion: 1,
      outcome: "accepted",
    });
  });
  it.each([null, "", "not-email", "bad\r\n@example.invalid"])(
    "refuses malformed input without accessing bookings",
    async (email) => {
      expect((await post(email)).status).toBe(400);
      expect(rpc).not.toHaveBeenCalled();
    },
  );
  it("rejects reference credentials, caller routing selectors and invalid UUIDs", async () => {
    for (const extra of [
      { reference: "ABC123" },
      { hostname: "other.example.invalid" },
      { tenantId: "other" },
      { requestId: "not-uuid" },
    ]) {
      expect((await post("guest@example.invalid", extra)).status).toBe(400);
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it("blocks cross-origin and missing-origin state changes before any RPC", async () => {
    for (const origin of ["https://other.example.invalid", null])
      expect((await post("guest@example.invalid", {}, origin)).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
    expect(context).not.toHaveBeenCalled();
  });
});
