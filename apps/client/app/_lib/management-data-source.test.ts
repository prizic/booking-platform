import { describe, expect, it } from "vitest";

import { createManagementDataSource } from "./management-data-source";

const grantedRow = {
  approval_status: "not_required",
  booking_id: "0a3f2b64-0000-4000-8000-000000000002",
  booking_revision: 1,
  can_cancel: true,
  can_reschedule: false,
  consent_version: "1",
  contract_version: 1,
  currency: "SAR",
  customer_time_zone: "Asia/Riyadh",
  ends_at: "2026-11-01T06:15:00+00:00",
  intent: "view",
  locale: "en",
  location_name: "Downtown",
  location_time_zone: "America/New_York",
  outcome: "granted",
  payment_status: "not_required",
  policy_snapshot: {},
  price_minor: 18_000,
  public_reference: "K3M9P2T7XY",
  service_name: "Initial consultation",
  starts_at: "2026-11-01T05:30:00+00:00",
  status: "confirmed",
  step_up_required: false,
  step_up_verified: false,
  tax_rate_bps: 1500,
  token_expires_at: "2026-11-08T05:30:00+00:00",
};

const token = "a".repeat(64);

describe("guest management data source", () => {
  it("returns the booking behind a granted link", async () => {
    const source = createManagementDataSource(
      { rpc: async () => ({ data: [grantedRow], error: null }) },
      "book.tenant.example",
    );

    const view = await source.redeem(token, "view");
    expect(view).toMatchObject({
      canCancel: true,
      canReschedule: false,
      outcome: "granted",
      stepUpRequired: false,
    });
  });

  it("answers every refusal identically", async () => {
    for (const result of [
      { data: [{ outcome: "unavailable" }], error: null },
      { data: [], error: null },
      { data: null, error: { code: "42501", message: "management_link_unavailable" } },
      { data: null, error: { code: "57014", message: "canceling statement" } },
    ]) {
      const source = createManagementDataSource(
        { rpc: async () => result },
        "book.tenant.example",
      );
      await expect(source.redeem(token, "view")).resolves.toEqual({
        outcome: "unavailable",
      });
    }
  });

  it("reports a step-up request the same way whether or not it was sent", async () => {
    const sent = createManagementDataSource(
      {
        rpc: async () => ({
          data: [
            {
              contract_version: 1,
              expires_at: "2026-11-01T05:40:00+00:00",
              outcome: "sent",
            },
          ],
          error: null,
        }),
      },
      "book.tenant.example",
    );
    await expect(sent.requestStepUp(token)).resolves.toMatchObject({ outcome: "sent" });

    const refused = createManagementDataSource(
      { rpc: async () => ({ data: [{ outcome: "unavailable" }], error: null }) },
      "book.tenant.example",
    );
    await expect(refused.requestStepUp(token)).resolves.toEqual({
      expiresAt: null,
      outcome: "unavailable",
    });
  });

  it("treats anything but an explicit verification as unverified", async () => {
    for (const [result, expected] of [
      [{ data: [{ contract_version: 1, verified: true }], error: null }, true],
      [{ data: [{ contract_version: 1, verified: false }], error: null }, false],
      [{ data: null, error: { code: "42501" } }, false],
      [{ data: [], error: null }, false],
    ] as const) {
      const source = createManagementDataSource(
        { rpc: async () => result },
        "book.tenant.example",
      );
      await expect(source.verifyStepUp(token, "123456")).resolves.toBe(expected);
    }
  });

  it("sends the intent it was asked for, so a view link cannot act", async () => {
    const calls: Record<string, unknown>[] = [];
    const source = createManagementDataSource(
      {
        rpc: async (_name, args) => {
          calls.push(args as Record<string, unknown>);
          return { data: [{ outcome: "unavailable" }], error: null };
        },
      },
      "book.tenant.example",
    );
    await source.redeem(token, "cancel");
    expect(calls[0]).toMatchObject({ p_intent: "cancel", p_token: token });
  });
});
