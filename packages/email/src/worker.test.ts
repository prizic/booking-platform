import { describe, expect, it, vi } from "vitest";

import {
  createResendAdapter,
  runNotificationBatch,
  type ClaimedNotification,
  type NotificationPorts,
} from "./worker.js";

const claimed: ClaimedNotification = {
  attempt: 1,
  bookingRevision: 1,
  correlationId: "0a3f2b64-0000-4000-8000-000000000009",
  locale: "en",
  messageId: "0a3f2b64-0000-4000-8000-000000000001",
  payload: {
    locationName: "Downtown",
    manageUrl: "https://book.example.invalid/en/manage?token=abc",
    price: "SAR 180.00",
    publicReference: "K3M9P2T7XY",
    serviceName: "Initial consultation",
    startAt: "Monday 21 September, 1:00 PM",
    timeZone: "Asia/Riyadh",
  },
  recipient: "guest@example.invalid",
  templateKey: "booking.confirmed",
  tenantId: "a0000000-0000-4000-8000-000000000001",
};

function ports(overrides: Partial<NotificationPorts> = {}): NotificationPorts {
  return {
    claim: async () => [claimed],
    deliver: async () => ({ outcome: "accepted", providerReference: "prov-1" }),
    record: async () => undefined,
    resolveBrandName: async () => "Example Booking",
    ...overrides,
  };
}

describe("notification batch", () => {
  it("records every attempt durably, whatever the provider said", async () => {
    const recorded: Parameters<NotificationPorts["record"]>[0][] = [];
    const record = vi.fn(async (input: Parameters<NotificationPorts["record"]>[0]) => {
      recorded.push(input);
    });
    const summary = await runNotificationBatch(ports({ record }));

    expect(summary).toEqual({ accepted: 1, failed: 0, retried: 0 });
    expect(record).toHaveBeenCalledTimes(1);
    expect(recorded[0]).toMatchObject({
      attempt: 1,
      messageId: claimed.messageId,
      report: { outcome: "accepted", providerReference: "prov-1" },
    });
  });

  it("treats a template that cannot render as permanent, not as a retry", async () => {
    const recorded: Parameters<NotificationPorts["record"]>[0][] = [];
    const summary = await runNotificationBatch(
      ports({
        claim: async () => [{ ...claimed, payload: {} }],
        record: async (input) => {
          recorded.push(input);
        },
      }),
    );

    expect(summary).toEqual({ accepted: 0, failed: 1, retried: 0 });
    expect(recorded[0]?.report).toMatchObject({
      errorCode: "render_failed",
      outcome: "permanent_error",
    });
  });

  it("keeps a provider failure retryable and reports it as such", async () => {
    const summary = await runNotificationBatch(
      ports({
        deliver: async () => ({ errorCode: "http_503", outcome: "retryable_error" }),
      }),
    );
    expect(summary).toEqual({ accepted: 0, failed: 0, retried: 1 });
  });

  it("gives the provider a per-attempt idempotency key", async () => {
    const keys: string[] = [];
    await runNotificationBatch(
      ports({
        deliver: async (input) => {
          keys.push(input.idempotencyKey);
          return { outcome: "accepted" };
        },
      }),
    );
    expect(keys[0]).toContain(claimed.messageId);
  });
});

describe("resend adapter", () => {
  const adapter = (fetchImplementation: typeof fetch) =>
    createResendAdapter({
      apiKey: "test-key",
      fetchImplementation,
      from: "Example <bookings@example.invalid>",
    });

  const command = {
    html: "<p>hello</p>",
    idempotencyKey: "tenant:message:1",
    subject: "Your booking is confirmed",
    text: "hello",
    to: "guest@example.invalid",
  };

  it("accepts a provider success and keeps its reference", async () => {
    const call = vi.fn(
      async () => new Response(JSON.stringify({ id: "prov-9" }), { status: 200 }),
    ) as unknown as typeof fetch;

    await expect(adapter(call)(command)).resolves.toEqual({
      outcome: "accepted",
      providerReference: "prov-9",
    });
  });

  it("separates a provider refusing from a provider being busy", async () => {
    const refused = (async () => new Response("{}", { status: 422 })) as typeof fetch;
    const busy = (async () => new Response("{}", { status: 503 })) as typeof fetch;
    const throttled = (async () => new Response("{}", { status: 429 })) as typeof fetch;

    await expect(adapter(refused)(command)).resolves.toMatchObject({
      outcome: "permanent_error",
    });
    await expect(adapter(busy)(command)).resolves.toMatchObject({
      outcome: "retryable_error",
    });
    await expect(adapter(throttled)(command)).resolves.toMatchObject({
      outcome: "retryable_error",
    });
  });

  it("treats a network failure as retryable rather than losing the message", async () => {
    const broken = (async () => {
      throw new Error("connection reset");
    }) as unknown as typeof fetch;

    await expect(adapter(broken)(command)).resolves.toEqual({
      errorCode: "network_error",
      outcome: "retryable_error",
    });
  });

  it("never puts the API key anywhere but the authorization header", async () => {
    let seen: RequestInit | undefined;
    const call = (async (_url: string, init?: RequestInit) => {
      seen = init;
      return new Response(JSON.stringify({ id: "prov-9" }), { status: 200 });
    }) as unknown as typeof fetch;

    await adapter(call)(command);
    expect(String(seen?.body)).not.toContain("test-key");
    expect((seen?.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-key",
    );
  });
});
