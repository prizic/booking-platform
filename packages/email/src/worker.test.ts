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
    resolveBrand: async () => ({ nameAr: "مثال", nameEn: "Example Booking" }),
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

  it("keeps the provider idempotency key stable when a visibility timeout reclaims a message", async () => {
    const keys: string[] = [];
    await runNotificationBatch(
      ports({
        deliver: async (input) => {
          keys.push(input.idempotencyKey);
          return { outcome: "accepted" };
        },
      }),
    );
    await runNotificationBatch(
      ports({
        claim: async () => [{ ...claimed, attempt: 2 }],
        deliver: async (input) => {
          keys.push(input.idempotencyKey);
          return { outcome: "accepted" };
        },
      }),
    );

    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toContain(claimed.messageId);
  });
});

describe("notification batch brand, test flag and payload", () => {
  it("leaves a message for the next attempt when the brand cannot be read", async () => {
    const delivered = vi.fn(async () => ({ outcome: "accepted" as const }));
    const recorded: Parameters<NotificationPorts["record"]>[0][] = [];
    const summary = await runNotificationBatch(
      ports({
        deliver: delivered,
        record: async (input) => {
          recorded.push(input);
        },
        resolveBrand: async () => {
          throw new Error("rpc down");
        },
      }),
    );

    expect(summary).toEqual({ accepted: 0, failed: 0, retried: 1 });
    expect(delivered).not.toHaveBeenCalled();
    expect(recorded[0]?.report).toEqual({
      errorCode: "brand_unresolved",
      outcome: "retryable_error",
    });
  });

  it("never signs with anything but the tenant's name", async () => {
    const summary = await runNotificationBatch(
      ports({ resolveBrand: async () => ({ primaryColor: "#123456" }) }),
    );
    expect(summary).toEqual({ accepted: 0, failed: 0, retried: 1 });
  });

  it("signs in the message's language and looks the brand up once per tenant", async () => {
    const resolveBrand = vi.fn(async () => ({
      nameAr: "مثال",
      nameEn: "Example Booking",
    }));
    const subjects: string[] = [];
    const texts: string[] = [];
    await runNotificationBatch(
      ports({
        claim: async () => [claimed, { ...claimed, locale: "ar", messageId: "m-2" }],
        deliver: async (input) => {
          subjects.push(input.subject);
          texts.push(input.text);
          return { outcome: "accepted" };
        },
        resolveBrand,
      }),
    );
    expect(resolveBrand).toHaveBeenCalledTimes(1);
    expect(texts[0]).toContain("Example Booking");
    expect(texts[1]).toContain("مثال");
  });

  it("marks a test send in the subject, the body and the provider tags", async () => {
    let seen: Parameters<NotificationPorts["deliver"]>[0] | undefined;
    await runNotificationBatch(
      ports({
        claim: async () => [{ ...claimed, isTest: true }],
        deliver: async (input) => {
          seen = input;
          return { outcome: "accepted" };
        },
      }),
    );
    expect(seen?.isTest).toBe(true);
    expect(seen?.subject.startsWith("[Test] ")).toBe(true);
    expect(seen?.text).toContain("Test message");
    expect(seen?.idempotencyKey).toBe(`${claimed.tenantId}:${claimed.messageId}`);
  });

  it("renders a test send with an empty payload from the synthetic sample", async () => {
    let seen: Parameters<NotificationPorts["deliver"]>[0] | undefined;
    const summary = await runNotificationBatch(
      ports({
        claim: async () => [
          { ...claimed, isTest: true, payload: {}, templateKey: "staff.daily_digest" },
        ],
        deliver: async (input) => {
          seen = input;
          return { outcome: "accepted" };
        },
      }),
    );
    expect(summary).toEqual({ accepted: 1, failed: 0, retried: 0 });
    expect(seen?.subject).toContain("[Test]");
    expect(seen?.text).toContain("Sample service");
  });

  it("renders a raw snake_case outbox payload", async () => {
    let seen: Parameters<NotificationPorts["deliver"]>[0] | undefined;
    await runNotificationBatch(
      ports({
        claim: async () => [
          {
            ...claimed,
            payload: {
              booking_id: "b-1",
              lead_minutes: 120,
              public_reference: "K3M9P2T7XY",
              service_name: "Initial consultation",
              starts_at: "2026-09-21T10:00:00.000Z",
              time_zone: "Asia/Riyadh",
            },
            templateKey: "booking.reminder",
          },
        ],
        deliver: async (input) => {
          seen = input;
          return { outcome: "accepted" };
        },
      }),
    );
    expect(seen?.subject).toContain("K3M9P2T7XY");
    expect(seen?.text).toContain("Initial consultation");
    expect(seen?.text).toContain("Asia/Riyadh");
    expect(seen?.text).toContain("in 2 hours");
    expect(seen?.text).toContain("1:00");
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
    correlationId: "0a3f2b64-0000-4000-8000-000000000009",
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
    expect(JSON.parse(String(seen?.body))).toMatchObject({
      tags: [{ name: "correlation_id", value: command.correlationId }],
    });
  });

  it("tags a test send so provider events can be told apart", async () => {
    let seen: RequestInit | undefined;
    const call = (async (_url: string, init?: RequestInit) => {
      seen = init;
      return new Response(JSON.stringify({ id: "prov-9" }), { status: 200 });
    }) as unknown as typeof fetch;

    await adapter(call)({ ...command, isTest: true });
    expect(JSON.parse(String(seen?.body))).toMatchObject({
      tags: [
        { name: "correlation_id", value: command.correlationId },
        { name: "is_test", value: "true" },
      ],
    });
  });
});
