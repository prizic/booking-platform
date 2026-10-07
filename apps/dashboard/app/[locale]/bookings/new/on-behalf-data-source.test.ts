import { describe, expect, it } from "vitest";
import { createOnBehalfDataSource } from "./on-behalf-data-source";
const input = {
  holdId: "a0000000-0000-4000-8000-000000000001",
  sessionToken: "a".repeat(64),
  idempotencyKey: "booking:" + "b".repeat(36),
  contact: {
    fullName: "Synthetic customer",
    email: "synthetic@example.invalid",
    phone: null,
  },
  consentVersion: "1",
  locale: "en" as const,
  intake: {},
  customerTimeZone: "America/New_York",
};
describe("on-behalf authoritative results", () => {
  it("uses the trusted tenant/host and keeps retry material in RPC arguments", async () => {
    const calls: Record<string, unknown>[] = [];
    const source = createOnBehalfDataSource(
      {
        rpc: async (name, args) => {
          expect(name).toBe("create_booking_on_behalf_v1");
          calls.push(args);
          return {
            data: [
              {
                contract_version: 1,
                booking_id: "a0000000-0000-4000-8000-000000000002",
                public_reference: "SYNTHETIC1",
                status: "confirmed",
                booking_revision: 1,
                replayed: calls.length > 1,
              },
            ],
            error: null,
          };
        },
      },
      "dashboard.example.invalid",
      "trusted-tenant",
    );
    const first = await source.confirm(input);
    const replay = await source.confirm(input);
    expect(first.bookingId).toBe(replay.bookingId);
    expect(replay.replayed).toBe(true);
    expect(calls[0]).toMatchObject({
      p_tenant_id: "trusted-tenant",
      p_hostname: "dashboard.example.invalid",
      p_session_token: input.sessionToken,
      p_idempotency_key: input.idempotencyKey,
    });
    expect(calls[1]?.p_idempotency_key).toBe(calls[0]?.p_idempotency_key);
  });
  it("does not report success from malformed results or raw provider errors", async () => {
    const malformed = createOnBehalfDataSource(
      { rpc: async () => ({ data: [{ status: "confirmed" }], error: null }) },
      "dashboard.example.invalid",
      "tenant",
    );
    await expect(malformed.confirm(input)).rejects.toThrow("unavailable");
    const failed = createOnBehalfDataSource(
      {
        rpc: async () => ({
          data: null,
          error: { message: "private provider payload" },
        }),
      },
      "dashboard.example.invalid",
      "tenant",
    );
    await expect(failed.confirm(input)).rejects.toThrow("unavailable");
  });
});
