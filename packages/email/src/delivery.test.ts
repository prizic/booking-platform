import { describe, expect, it, vi } from "vitest";

import { createNotificationPreparation } from "./delivery.js";
import {
  runNotificationBatch,
  type ClaimedNotification,
  type NotificationDelivery,
} from "./worker.js";

const message: ClaimedNotification = {
  attempt: 1,
  bookingRevision: 1,
  correlationId: "synthetic-correlation",
  locale: "en",
  messageId: "synthetic-message",
  payload: { expiresAt: "2030-01-01T10:00:00Z" },
  recipient: "guest@example.invalid",
  templateKey: "management.otp_requested",
  tenantId: "synthetic-tenant",
};
const key = "01".repeat(32);

function storage() {
  let stored: string | null = null;
  return vi.fn(async (_message: ClaimedNotification, value: string | null) => {
    if (value !== null && stored === null) stored = value;
    return stored;
  });
}

describe("encrypted notification preparation", () => {
  it.each(["en", "ar"] as const)(
    "mints and renders a production OTP in %s without storing plaintext",
    async (locale) => {
      const envelope = storage();
      const mintOtp = vi.fn(async () => "483921");
      const delivered: NotificationDelivery[] = [];
      const result = await runNotificationBatch({
        claim: async () => [{ ...message, locale }],
        deliver: async (input) => {
          delivered.push(input);
          return { outcome: "accepted" };
        },
        prepare: createNotificationPreparation({
          encryptionKey: key,
          from: "mail@example.invalid",
          envelope,
          mintOtp,
        }),
        record: async () => undefined,
        resolveBrand: async () => ({ nameEn: "Example", nameAr: "مثال" }),
      });
      expect(result.accepted).toBe(1);
      expect(mintOtp).toHaveBeenCalledOnce();
      expect(delivered[0]?.text).toContain("483921");
      const ciphertext = envelope.mock.calls[1]?.[1];
      expect(ciphertext).toEqual(expect.any(String));
      expect(ciphertext).not.toContain("483921");
      expect(ciphertext).not.toContain(message.recipient);
    },
  );

  it("replays identical provider input after an accepted send loses its acknowledgement", async () => {
    const envelope = storage();
    const mintOtp = vi.fn(async () => "483921");
    const inputs: NotificationDelivery[] = [];
    const batch = (attempt: number, from: string) =>
      runNotificationBatch({
        claim: async () => [
          { ...message, attempt, payload: { expiresAt: "2031-01-01T10:00:00Z" } },
        ],
        deliver: async (input) => {
          inputs.push(input);
          return { outcome: "accepted" as const };
        },
        prepare: createNotificationPreparation({
          encryptionKey: key,
          from,
          envelope,
          mintOtp,
        }),
        record: async () => {
          if (attempt === 1) throw new Error("lost database acknowledgement");
        },
        resolveBrand: async () => ({ nameEn: `Brand ${attempt}`, nameAr: "مثال" }),
      });
    await expect(batch(1, "original@example.invalid")).rejects.toThrow(
      "lost database acknowledgement",
    );
    await batch(2, "changed@example.invalid");
    expect(inputs).toHaveLength(2);
    expect(inputs[1]).toEqual(inputs[0]);
    expect(mintOtp).toHaveBeenCalledOnce();
  });

  it("keeps a changed management link and sender out of a reclaimed message", async () => {
    const envelope = storage();
    const prepare = createNotificationPreparation({
      encryptionKey: key,
      from: "original@example.invalid",
      envelope,
      mintOtp: async () => "483921",
    });
    const first: NotificationDelivery = {
      correlationId: "synthetic",
      html: "original bearer link",
      idempotencyKey: "same-key",
      subject: "Original",
      text: "Original",
      to: message.recipient,
    };
    const rendered = vi.fn(async () => first);
    const nonOtp = { ...message, templateKey: "booking.confirmed" as const };
    const original = await prepare(nonOtp, rendered);
    const retryRender = vi.fn(async () => ({ ...first, html: "new bearer link" }));
    const retry = await prepare({ ...nonOtp, attempt: 2 }, retryRender);
    expect(retry).toEqual(original);
    expect(retryRender).not.toHaveBeenCalled();
  });

  it("does not mint a production OTP for a synthetic test send", async () => {
    const mintOtp = vi.fn(async () => "483921");
    const prepare = createNotificationPreparation({
      encryptionKey: key,
      from: "mail@example.invalid",
      envelope: storage(),
      mintOtp,
    });
    await prepare({ ...message, isTest: true }, async () => ({
      correlationId: "synthetic",
      html: "test",
      idempotencyKey: "test-key",
      subject: "test",
      text: "test",
      to: message.recipient,
    }));
    expect(mintOtp).not.toHaveBeenCalled();
  });

  it("rejects a cached envelope copied across tenants or messages", async () => {
    const envelope = storage();
    const prepare = createNotificationPreparation({
      encryptionKey: key,
      from: "mail@example.invalid",
      envelope,
      mintOtp: async () => "483921",
    });
    const render = vi.fn(async () => ({
      correlationId: "synthetic",
      html: "test",
      idempotencyKey: "test-key",
      subject: "test",
      text: "test",
      to: message.recipient,
    }));
    await prepare(message, render);
    await expect(
      prepare({ ...message, tenantId: "other-tenant" }, render),
    ).rejects.toThrow("delivery_preparation_failed");
    await expect(
      prepare({ ...message, messageId: "other-message" }, render),
    ).rejects.toThrow("delivery_preparation_failed");
    expect(render).toHaveBeenCalledOnce();
  });

  it("fails closed before delivery when durable preparation is unavailable", async () => {
    const deliver = vi.fn(async () => ({ outcome: "accepted" as const }));
    const record = vi.fn(async () => undefined);
    const result = await runNotificationBatch({
      claim: async () => [message],
      deliver,
      record,
      prepare: createNotificationPreparation({
        encryptionKey: key,
        from: "mail@example.invalid",
        envelope: async () => {
          throw new Error("storage unavailable");
        },
        mintOtp: async () => "483921",
      }),
      resolveBrand: async () => ({ nameEn: "Example", nameAr: "مثال" }),
    });
    expect(result.retried).toBe(1);
    expect(deliver).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        report: {
          errorCode: "delivery_preparation_failed",
          outcome: "retryable_error",
        },
      }),
    );
  });

  it("rejects missing or invalid key material", () => {
    expect(() =>
      createNotificationPreparation({
        encryptionKey: "",
        from: "mail@example.invalid",
        envelope: storage(),
        mintOtp: async () => "483921",
      }),
    ).toThrow("notification_encryption_key_invalid");
  });
});
