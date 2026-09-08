import { describe, expect, it } from "vitest";

import {
  ClientBookingError,
  createClientBookingDataSource,
  mapBookingRpcError,
} from "./booking-data-source";

const confirmation = {
  consentVersion: "2",
  contact: {
    email: "guest@example.invalid",
    fullName: "Test Guest",
    phone: null,
  },
  customerTimeZone: "Asia/Riyadh",
  holdId: "0a3f2b64-0000-4000-8000-000000000001",
  idempotencyKey: "confirm-0a3f2b64-0000-4000-8000-000000000001",
  intake: {},
  locale: "en" as const,
  sessionToken: "session-token-0123456789",
};

const committedRow = {
  approval_status: "not_required",
  booking_id: "0a3f2b64-0000-4000-8000-000000000002",
  booking_revision: 1,
  calendar_status: "pending",
  consent_version: "2",
  contract_version: 1,
  currency: "SAR",
  customer_time_zone: "Asia/Riyadh",
  ends_at: "2026-11-01T06:15:00+00:00",
  locale: "en",
  location_name: "Downtown",
  location_time_zone: "America/New_York",
  notification_status: "queued",
  payment_status: "not_required",
  price_minor: 18_000,
  public_reference: "K3M9P2T7XY",
  replayed: false,
  service_name: "Initial consultation",
  starts_at: "2026-11-01T05:30:00+00:00",
  status: "confirmed",
  tax_rate_bps: 1500,
};

describe("Client booking data source", () => {
  it("returns authoritative committed booking state", async () => {
    const source = createClientBookingDataSource(
      { rpc: async () => ({ data: [committedRow], error: null }) },
      "book.tenant.example",
    );

    await expect(source.confirmBooking(confirmation)).resolves.toMatchObject({
      bookingId: "0a3f2b64-0000-4000-8000-000000000002",
      notificationStatus: "queued",
      paymentStatus: "not_required",
      publicReference: "K3M9P2T7XY",
      replayed: false,
      startAt: "2026-11-01T05:30:00.000Z",
      status: "confirmed",
    });
  });

  it("reports a replayed duplicate submission as the same booking", async () => {
    const source = createClientBookingDataSource(
      {
        rpc: async () => ({ data: [{ ...committedRow, replayed: true }], error: null }),
      },
      "book.tenant.example",
    );

    await expect(source.confirmBooking(confirmation)).resolves.toMatchObject({
      bookingId: "0a3f2b64-0000-4000-8000-000000000002",
      replayed: true,
    });
  });

  it("sends the guest only the declared contact fields", async () => {
    const calls: Record<string, unknown>[] = [];
    const source = createClientBookingDataSource(
      {
        rpc: async (_name, args) => {
          calls.push(args as Record<string, unknown>);
          return { data: [committedRow], error: null };
        },
      },
      "book.tenant.example",
    );

    await source.confirmBooking(confirmation);
    expect(calls[0]?.p_contact).toEqual({
      email: "guest@example.invalid",
      fullName: "Test Guest",
    });
  });

  it("maps every stable database error without disclosing the conflict", async () => {
    for (const [message, code, expected] of [
      ["slot_unavailable", "23P01", "slot_unavailable"],
      ["policy_denied", "42501", "policy_denied"],
      ["revision_conflict", "23505", "revision_conflict"],
      ["payment_pending", "23505", "payment_pending"],
      ["idempotency_conflict", "23505", "idempotency_conflict"],
      ["booking_context_required", "42501", "not_authorized"],
      ["booking_invalid_contact", "22023", "invalid_request"],
      [undefined, "57014", "availability_unavailable"],
    ] as const) {
      expect(mapBookingRpcError(code, message)).toBe(expected);
    }
  });

  it("surfaces a stable error rather than a database detail", async () => {
    const source = createClientBookingDataSource(
      {
        rpc: async () => ({
          data: null,
          error: { code: "23P01", message: "slot_unavailable" },
        }),
      },
      "book.tenant.example",
    );

    await expect(source.confirmBooking(confirmation)).rejects.toMatchObject({
      code: "slot_unavailable",
    });
    await expect(source.confirmBooking(confirmation)).rejects.toBeInstanceOf(
      ClientBookingError,
    );
  });

  it("refuses a confirmation the database did not commit", async () => {
    const source = createClientBookingDataSource(
      { rpc: async () => ({ data: [], error: null }) },
      "book.tenant.example",
    );

    await expect(source.confirmBooking(confirmation)).rejects.toMatchObject({
      code: "availability_unavailable",
    });
  });

  it("reads the intake schema of the publication the hold captured", async () => {
    const source = createClientBookingDataSource(
      {
        rpc: async () => ({
          data: [
            {
              consent_text: "Cancellations are free up to 24 hours before.",
              consent_version: "2",
              currency: "SAR",
              intake_schema: {
                fields: [
                  { key: "reason", label: "Reason", maxLength: 500, required: true },
                ],
              },
              location_name: "Downtown",
              price_minor: 18_000,
              service_name: "Initial consultation",
              tax_rate_bps: 1500,
            },
          ],
          error: null,
        }),
      },
      "book.tenant.example",
    );

    await expect(
      source.getHoldForm(
        "0a3f2b64-0000-4000-8000-000000000001",
        "session-token-0123456789",
        "en",
      ),
    ).resolves.toMatchObject({
      consentVersion: "2",
      fields: [{ key: "reason", maxLength: 500, required: true }],
    });
  });
});
