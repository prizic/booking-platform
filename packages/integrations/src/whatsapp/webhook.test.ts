import { describe, expect, it } from "vitest";

import {
  constantTimeEqual,
  parseWhatsAppStatusWebhook,
  readWhatsAppVerificationQuery,
  verifyWhatsAppSignature,
  verifyWhatsAppSubscription,
} from "./webhook.js";

const appSecret = "synthetic-app-secret";
async function sign(body: string, secret = appSecret): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const hex = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

const statusBody = (statuses: unknown[]): unknown => ({
  entry: [
    {
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "15550000000",
              phone_number_id: "106540352242922",
            },
            statuses,
          },
        },
      ],
      id: "102290129340398",
    },
  ],
  object: "whatsapp_business_account",
});

describe("verifyWhatsAppSubscription", () => {
  const query = (params: string) =>
    readWhatsAppVerificationQuery(
      new URL(`https://edge.example.invalid/whatsapp-webhook?${params}`),
    );

  it("echoes the challenge when the verify token matches", () => {
    expect(
      verifyWhatsAppSubscription(
        query(
          "hub.mode=subscribe&hub.verify_token=expected-token&hub.challenge=1158201444",
        ),
        "expected-token",
      ),
    ).toEqual({ challenge: "1158201444", ok: true });
  });

  it.each([
    ["wrong token", "hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1"],
    ["token prefix", "hub.mode=subscribe&hub.verify_token=expected&hub.challenge=1"],
    [
      "wrong mode",
      "hub.mode=unsubscribe&hub.verify_token=expected-token&hub.challenge=1",
    ],
    ["missing token", "hub.mode=subscribe&hub.challenge=1"],
    ["missing challenge", "hub.mode=subscribe&hub.verify_token=expected-token"],
    [
      "reflected markup",
      "hub.mode=subscribe&hub.verify_token=expected-token&hub.challenge=%3Cscript%3E",
    ],
  ])("refuses %s", (_label, params) => {
    expect(verifyWhatsAppSubscription(query(params), "expected-token")).toEqual({
      ok: false,
    });
  });

  it("refuses everything when no verify token is configured", () => {
    expect(
      verifyWhatsAppSubscription(
        { challenge: "1", mode: "subscribe", verifyToken: "" },
        "",
      ),
    ).toEqual({ ok: false });
  });
});

describe("verifyWhatsAppSignature", () => {
  const body = JSON.stringify(
    statusBody([{ id: "wamid.A", status: "sent", timestamp: "1750030073" }]),
  );

  it("accepts a valid signature over the raw string or bytes", async () => {
    expect(
      await verifyWhatsAppSignature({
        appSecret,
        rawBody: body,
        signatureHeader: await sign(body),
      }),
    ).toBe(true);
    expect(
      await verifyWhatsAppSignature({
        appSecret,
        rawBody: new TextEncoder().encode(body),
        signatureHeader: (await sign(body)).toUpperCase().replace("SHA256=", "sha256="),
      }),
    ).toBe(true);
  });

  it("verifies non-ASCII payloads over their UTF-8 bytes", async () => {
    const arabic = '{"object":"whatsapp_business_account","note":"مرحبا"}';
    expect(
      await verifyWhatsAppSignature({
        appSecret,
        rawBody: arabic,
        signatureHeader: await sign(arabic),
      }),
    ).toBe(true);
  });

  it("refuses a signature made with another secret", async () => {
    expect(
      await verifyWhatsAppSignature({
        appSecret,
        rawBody: body,
        signatureHeader: await sign(body, "other"),
      }),
    ).toBe(false);
  });

  it("refuses a missing or malformed header", async () => {
    for (const header of [
      null,
      "",
      "sha256=",
      "sha1=abc",
      (await sign(body)).replace("sha256=", ""),
      `${await sign(body)}00`,
    ]) {
      expect(
        await verifyWhatsAppSignature({
          appSecret,
          rawBody: body,
          signatureHeader: header,
        }),
      ).toBe(false);
    }
  });

  it("refuses a valid signature replayed onto a different body", async () => {
    const tampered = body.replace('"sent"', '"read"');
    expect(
      await verifyWhatsAppSignature({
        appSecret,
        rawBody: tampered,
        signatureHeader: await sign(body),
      }),
    ).toBe(false);
  });

  it("refuses a re-serialized body whose bytes changed", async () => {
    const original = '{ "object": "whatsapp_business_account" }';
    const reserialized = JSON.stringify(JSON.parse(original));
    expect(
      await verifyWhatsAppSignature({
        appSecret,
        rawBody: reserialized,
        signatureHeader: await sign(original),
      }),
    ).toBe(false);
  });

  it("refuses everything when no app secret is configured", async () => {
    expect(
      await verifyWhatsAppSignature({
        appSecret: "",
        rawBody: body,
        signatureHeader: await sign(body),
      }),
    ).toBe(false);
  });
});

describe("constantTimeEqual", () => {
  it.each([
    ["a", "a", true],
    ["a", "b", false],
    ["a", "ab", false],
    ["", "", true],
  ] as const)("%j vs %j", (left, right, expected) => {
    expect(constantTimeEqual(left, right)).toBe(expected);
  });
});

describe("parseWhatsAppStatusWebhook", () => {
  it("maps every documented status to a provider event keyed by wamid and status", () => {
    const events = parseWhatsAppStatusWebhook(
      statusBody([
        {
          id: "wamid.A",
          recipient_id: "966501234567",
          status: "sent",
          timestamp: "1750030073",
        },
        {
          id: "wamid.A",
          recipient_id: "966501234567",
          status: "delivered",
          timestamp: "1750030080",
        },
        {
          id: "wamid.A",
          recipient_id: "966501234567",
          status: "read",
          timestamp: 1750030090,
        },
        {
          errors: [
            {
              code: 131026,
              error_data: { details: "Message Undeliverable." },
              message: "Message undeliverable",
              title: "Message undeliverable",
            },
          ],
          id: "wamid.B",
          recipient_id: "966501234567",
          status: "failed",
          timestamp: "1750030100",
        },
      ]),
    );
    expect(events).toEqual([
      {
        businessAccountId: "102290129340398",
        errorCategory: null,
        errorCode: null,
        eventReference: "wamid.A:sent",
        occurredAt: "2025-06-15T23:27:53.000Z",
        phoneNumberId: "106540352242922",
        providerMessageReference: "wamid.A",
        status: "sent",
      },
      expect.objectContaining({
        eventReference: "wamid.A:delivered",
        status: "delivered",
      }),
      expect.objectContaining({ eventReference: "wamid.A:read", status: "read" }),
      expect.objectContaining({
        errorCategory: "recipient",
        errorCode: "meta_131026",
        eventReference: "wamid.B:failed",
        status: "failed",
      }),
    ]);
    // The recipient's number is never carried into a provider event.
    expect(JSON.stringify(events)).not.toContain("966501234567");
  });

  it("records a failure without a readable code as unknown", () => {
    const [event] = parseWhatsAppStatusWebhook(
      statusBody([{ id: "wamid.C", status: "failed", timestamp: "1750030100" }]),
    );
    expect(event).toMatchObject({
      errorCategory: "unknown",
      errorCode: "meta_unknown",
    });
  });

  it("skips inbound messages, unknown statuses, and malformed rows", () => {
    const body = statusBody([
      { id: "wamid.D", status: "played", timestamp: "1750030100" },
      { status: "sent", timestamp: "1750030100" },
      { id: "wamid.E", status: "sent", timestamp: "yesterday" },
      "nonsense",
    ]) as { entry: { changes: { value: Record<string, unknown> }[] }[] };
    body.entry[0]!.changes[0]!.value["messages"] = [
      { from: "966501234567", text: { body: "hi" } },
    ];
    expect(parseWhatsAppStatusWebhook(body)).toEqual([]);
  });

  it.each([
    null,
    "x",
    {},
    { object: "page", entry: [] },
    { entry: "x", object: "whatsapp_business_account" },
  ])("returns nothing for %j", (body) => {
    expect(parseWhatsAppStatusWebhook(body)).toEqual([]);
  });
});
