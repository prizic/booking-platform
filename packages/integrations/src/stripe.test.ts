import { describe, expect, it } from "vitest";

import {
  createCheckoutSession,
  normalizeStripeEvent,
  verifyStripeWebhook,
  type StripeTransport,
} from "./stripe.js";

const command = {
  amountMinorUnits: 18000,
  cancelUrl: "https://book.example.invalid/en/book?checkout=cancelled",
  connectedAccountId: "acct_tenant_a",
  currency: "SAR",
  customerEmail: "guest@example.invalid",
  idempotencyKey: "attempt-0a3f2b64-0000-4000-8000-000000000001",
  paymentAttemptId: "0a3f2b64-0000-4000-8000-000000000001",
  productName: "Consultation",
  successUrl: "https://book.example.invalid/en/book?checkout=return",
} as const;

function transportReturning(
  status: number,
  body: string,
): { calls: Parameters<StripeTransport>[]; transport: StripeTransport } {
  const calls: Parameters<StripeTransport>[] = [];
  const transport: StripeTransport = async (url, init) => {
    calls.push([url, init]);
    return { status, text: async () => body };
  };
  return { calls, transport };
}

describe("createCheckoutSession", () => {
  it("charges on the tenant's connected account, never on the platform", async () => {
    const { calls, transport } = transportReturning(
      200,
      JSON.stringify({
        id: "cs_test_1",
        url: "https://checkout.stripe.com/c/cs_test_1",
      }),
    );
    const result = await createCheckoutSession(command, "sk_test_x", transport);

    expect(result).toEqual({
      ok: true,
      redirectUrl: "https://checkout.stripe.com/c/cs_test_1",
      sessionId: "cs_test_1",
    });
    expect(calls[0]?.[1].headers["stripe-account"]).toBe("acct_tenant_a");
  });

  it("sends the server's amount and currency verbatim", async () => {
    const { calls, transport } = transportReturning(
      200,
      JSON.stringify({
        id: "cs_test_2",
        url: "https://checkout.stripe.com/c/cs_test_2",
      }),
    );
    await createCheckoutSession(command, "sk_test_x", transport);

    const body = calls[0]?.[1].body ?? "";
    expect(body).toContain("line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=18000");
    expect(body).toContain("line_items%5B0%5D%5Bprice_data%5D%5Bcurrency%5D=sar");
  });

  it("carries the attempt id so an event identifies our record without the browser", async () => {
    const { calls, transport } = transportReturning(
      200,
      JSON.stringify({
        id: "cs_test_3",
        url: "https://checkout.stripe.com/c/cs_test_3",
      }),
    );
    await createCheckoutSession(command, "sk_test_x", transport);

    expect(calls[0]?.[1].body).toContain(
      `metadata%5Bpayment_attempt_id%5D=${command.paymentAttemptId}`,
    );
  });

  it("is idempotent at the provider, so a retried call creates one session", async () => {
    const { calls, transport } = transportReturning(
      200,
      JSON.stringify({
        id: "cs_test_4",
        url: "https://checkout.stripe.com/c/cs_test_4",
      }),
    );
    await createCheckoutSession(command, "sk_test_x", transport);

    expect(calls[0]?.[1].headers["idempotency-key"]).toBe(command.idempotencyKey);
  });

  it("returns a stable reason and never the provider's body", async () => {
    const { transport } = transportReturning(
      402,
      JSON.stringify({ error: { message: "Card for guest@example.invalid declined" } }),
    );
    const result = await createCheckoutSession(command, "sk_test_x", transport);

    expect(result).toEqual({ ok: false, reason: "provider_error" });
    expect(JSON.stringify(result)).not.toContain("example.invalid");
  });

  it("refuses a success-shaped response that is missing the redirect", async () => {
    const { transport } = transportReturning(200, JSON.stringify({ id: "cs_test_5" }));
    await expect(
      createCheckoutSession(command, "sk_test_x", transport),
    ).resolves.toEqual({ ok: false, reason: "invalid_response" });
  });
});

const secret = "whsec_test_secret";
const signedAt = new Date("2026-09-12T12:00:00.000Z");

async function sign(rawBody: string, timestamp: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  return [...new Uint8Array(mac)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

describe("verifyStripeWebhook", () => {
  const rawBody = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });

  it("accepts a delivery signed with the endpoint secret", async () => {
    const timestamp = Math.floor(signedAt.getTime() / 1000);
    const signatureHeader = `t=${timestamp},v1=${await sign(rawBody, timestamp)}`;

    await expect(
      verifyStripeWebhook({ now: signedAt, rawBody, secret, signatureHeader }),
    ).resolves.toEqual({ ok: true });
  });

  it("refuses a body altered after signing", async () => {
    const timestamp = Math.floor(signedAt.getTime() / 1000);
    const signatureHeader = `t=${timestamp},v1=${await sign(rawBody, timestamp)}`;

    await expect(
      verifyStripeWebhook({
        now: signedAt,
        rawBody: rawBody.replace("evt_1", "evt_2"),
        secret,
        signatureHeader,
      }),
    ).resolves.toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses a stale delivery, which bounds replay", async () => {
    const timestamp = Math.floor(signedAt.getTime() / 1000) - 3600;
    const signatureHeader = `t=${timestamp},v1=${await sign(rawBody, timestamp)}`;

    await expect(
      verifyStripeWebhook({ now: signedAt, rawBody, secret, signatureHeader }),
    ).resolves.toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses a future-dated delivery too", async () => {
    const timestamp = Math.floor(signedAt.getTime() / 1000) + 3600;
    const signatureHeader = `t=${timestamp},v1=${await sign(rawBody, timestamp)}`;

    await expect(
      verifyStripeWebhook({ now: signedAt, rawBody, secret, signatureHeader }),
    ).resolves.toEqual({ ok: false, reason: "invalid" });
  });

  it("accepts any valid signature during a secret rotation", async () => {
    const timestamp = Math.floor(signedAt.getTime() / 1000);
    const signatureHeader = `t=${timestamp},v1=${"0".repeat(64)},v1=${await sign(rawBody, timestamp)}`;

    await expect(
      verifyStripeWebhook({ now: signedAt, rawBody, secret, signatureHeader }),
    ).resolves.toEqual({ ok: true });
  });

  it("refuses a header offering only an unknown scheme", async () => {
    const timestamp = Math.floor(signedAt.getTime() / 1000);
    const signatureHeader = `t=${timestamp},v0=${await sign(rawBody, timestamp)}`;

    await expect(
      verifyStripeWebhook({ now: signedAt, rawBody, secret, signatureHeader }),
    ).resolves.toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses a missing header and a missing secret identically", async () => {
    await expect(
      verifyStripeWebhook({ now: signedAt, rawBody, secret, signatureHeader: null }),
    ).resolves.toEqual({ ok: false, reason: "invalid" });
    await expect(
      verifyStripeWebhook({
        now: signedAt,
        rawBody,
        secret: "",
        signatureHeader: "t=1,v1=x",
      }),
    ).resolves.toEqual({ ok: false, reason: "invalid" });
  });
});

describe("normalizeStripeEvent", () => {
  it("reads the attempt id, amount, and charge reference", () => {
    const event = normalizeStripeEvent(
      JSON.stringify({
        created: 1_789_000_000,
        data: {
          object: {
            amount_total: 18000,
            currency: "sar",
            id: "cs_1",
            metadata: { payment_attempt_id: "attempt-1" },
            payment_intent: "pi_1",
            payment_status: "paid",
          },
        },
        id: "evt_1",
        type: "checkout.session.completed",
      }),
    );

    expect(event).toMatchObject({
      amountMinorUnits: 18000,
      chargeReference: "pi_1",
      currency: "SAR",
      eventReference: "evt_1",
      outcome: "succeeded",
      paymentAttemptId: "attempt-1",
      sessionReference: "cs_1",
    });
  });

  it("does not call an unpaid completed session a success", () => {
    // Stripe fires `checkout.session.completed` for an asynchronous payment
    // before the money has actually moved. Confirming there would give away a
    // booking for free.
    const event = normalizeStripeEvent(
      JSON.stringify({
        data: { object: { id: "cs_2", payment_status: "unpaid" } },
        id: "evt_2",
        type: "checkout.session.completed",
      }),
    );

    expect(event?.outcome).toBeNull();
  });

  it("settles the later asynchronous success", () => {
    const event = normalizeStripeEvent(
      JSON.stringify({
        data: { object: { id: "cs_3", payment_status: "paid" } },
        id: "evt_3",
        type: "checkout.session.async_payment_succeeded",
      }),
    );

    expect(event?.outcome).toBe("succeeded");
  });

  it("maps failure and cancellation to their own outcomes", () => {
    const failed = normalizeStripeEvent(
      JSON.stringify({
        data: { object: { id: "cs_4" } },
        id: "evt_4",
        type: "checkout.session.async_payment_failed",
      }),
    );
    const expired = normalizeStripeEvent(
      JSON.stringify({
        data: { object: { id: "cs_5" } },
        id: "evt_5",
        type: "checkout.session.expired",
      }),
    );

    expect(failed?.outcome).toBe("failed");
    expect(expired?.outcome).toBe("cancelled");
  });

  it("gives an unknown event type no outcome rather than a failure", () => {
    // A provider sends far more than a booking platform needs. Treating noise
    // as failure would turn it into refunds.
    const event = normalizeStripeEvent(
      JSON.stringify({
        data: { object: { id: "po_1" } },
        id: "evt_6",
        type: "payout.paid",
      }),
    );

    expect(event?.outcome).toBeNull();
  });

  it("returns null for a body that is not an event", () => {
    expect(normalizeStripeEvent("not json")).toBeNull();
    expect(normalizeStripeEvent(JSON.stringify({ id: 5 }))).toBeNull();
  });
});
