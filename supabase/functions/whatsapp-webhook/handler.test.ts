import type { WhatsAppProviderEvent } from "../_shared/whatsapp/mod.ts";
import { createWhatsAppWebhookHandler, maxWebhookBytes } from "./handler.ts";

const appSecret = "synthetic-app-secret";
const verifyToken = "synthetic-verify-token";
const endpoint = "https://edge.example.invalid/functions/v1/whatsapp-webhook";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function sign(body: string, secret = appSecret): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `sha256=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

const statusPayload = JSON.stringify({
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
            statuses: [
              {
                id: "wamid.A",
                recipient_id: "966501234567",
                status: "delivered",
                timestamp: "1750030080",
              },
              {
                errors: [{ code: 132015, title: "Template paused" }],
                id: "wamid.B",
                recipient_id: "966501234567",
                status: "failed",
                timestamp: "1750030090",
              },
            ],
          },
        },
      ],
      id: "102290129340398",
    },
  ],
  object: "whatsapp_business_account",
});

function harness(options: { configured?: boolean; failRecord?: boolean } = {}) {
  const recorded: WhatsAppProviderEvent[] = [];
  const handler = createWhatsAppWebhookHandler({
    appSecret,
    configured: options.configured ?? true,
    record: (event) => {
      if (options.failRecord) return Promise.resolve(false);
      recorded.push(event);
      return Promise.resolve(true);
    },
    verifyToken,
  });
  return { handler, recorded };
}

Deno.test(
  "GET handshake echoes the challenge only for the configured verify token",
  async () => {
    const { handler } = harness();
    const ok = await handler(
      new Request(
        `${endpoint}?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=987654`,
      ),
    );
    assert(ok.status === 200, `expected 200, got ${ok.status}`);
    assert((await ok.text()) === "987654", "challenge not echoed");

    for (const query of [
      `hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1`,
      `hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=%3Cb%3E`,
      `hub.verify_token=${verifyToken}&hub.challenge=1`,
    ]) {
      const refused = await handler(new Request(`${endpoint}?${query}`));
      assert(refused.status === 403, `expected 403 for ${query}`);
    }
  },
);

Deno.test(
  "a signed status notification is recorded once per wamid and status",
  async () => {
    const { handler, recorded } = harness();
    const response = await handler(
      new Request(endpoint, {
        body: statusPayload,
        headers: { "x-hub-signature-256": await sign(statusPayload) },
        method: "POST",
      }),
    );
    assert(response.status === 200, `expected 200, got ${response.status}`);
    assert(recorded.length === 2, "expected two events");
    assert(
      recorded[0]?.eventReference === "wamid.A:delivered",
      "wrong idempotency key",
    );
    assert(recorded[1]?.errorCode === "meta_132015", "failure code not carried");
    assert(
      recorded[1]?.phoneNumberId === "106540352242922",
      "phone number id not carried",
    );
    assert(
      !JSON.stringify(recorded).includes("966501234567"),
      "recipient number leaked",
    );
  },
);

Deno.test(
  "forged, missing, replayed-onto-another-body and oversized deliveries are refused identically",
  async () => {
    const { handler, recorded } = harness();
    const tampered = statusPayload.replace("delivered", "read");
    const cases: Request[] = [
      new Request(endpoint, { body: statusPayload, method: "POST" }),
      new Request(endpoint, {
        body: statusPayload,
        headers: { "x-hub-signature-256": await sign(statusPayload, "another-secret") },
        method: "POST",
      }),
      new Request(endpoint, {
        body: tampered,
        headers: { "x-hub-signature-256": await sign(statusPayload) },
        method: "POST",
      }),
      new Request(endpoint, {
        body: "x".repeat(maxWebhookBytes + 1),
        headers: { "x-hub-signature-256": await sign("x") },
        method: "POST",
      }),
      new Request(endpoint, { method: "PUT" }),
    ];
    for (const request of cases) {
      const response = await handler(request);
      assert(response.status === 400, `expected 400, got ${response.status}`);
      assert(
        (await response.text()) === '{"error":"invalid_request"}',
        "refusal differs",
      );
    }
    assert(recorded.length === 0, "a refused delivery was recorded");
  },
);

Deno.test("a signed but non-JSON body is refused", async () => {
  const { handler } = harness();
  const body = "not json";
  const response = await handler(
    new Request(endpoint, {
      body,
      headers: { "x-hub-signature-256": await sign(body) },
      method: "POST",
    }),
  );
  assert(response.status === 400, `expected 400, got ${response.status}`);
});

Deno.test(
  "a byte-identical redelivery produces the same idempotency keys",
  async () => {
    const { handler, recorded } = harness();
    const first = await handler(
      new Request(endpoint, {
        body: statusPayload,
        headers: { "x-hub-signature-256": await sign(statusPayload) },
        method: "POST",
      }),
    );
    const second = await handler(
      new Request(endpoint, {
        body: statusPayload,
        headers: { "x-hub-signature-256": await sign(statusPayload) },
        method: "POST",
      }),
    );
    assert(first.status === 200 && second.status === 200, "both acknowledged");
    // Meta carries no timestamp in the signature, so a redelivery verifies. The
    // recorded rows are keyed on `<wamid>:<status>`, which is what makes the
    // duplicate free — the same references, so `record_whatsapp_provider_event_v1`
    // dedupes on them.
    assert(recorded.length === 4, `expected four rows, got ${recorded.length}`);
    assert(
      recorded
        .slice(0, 2)
        .map((event) => event.eventReference)
        .join(",") ===
        recorded
          .slice(2)
          .map((event) => event.eventReference)
          .join(","),
      "redelivery produced different idempotency keys",
    );
  },
);

Deno.test("a reordered delivery keeps its own identity per status", async () => {
  const { handler, recorded } = harness();
  const reversed = JSON.stringify({
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "106540352242922" },
              statuses: [
                {
                  id: "wamid.B",
                  status: "failed",
                  timestamp: "1750030090",
                  errors: [{ code: 132015, title: "Template paused" }],
                },
                { id: "wamid.A", status: "delivered", timestamp: "1750030080" },
              ],
            },
          },
        ],
        id: "102290129340398",
      },
    ],
    object: "whatsapp_business_account",
  });
  const response = await handler(
    new Request(endpoint, {
      body: reversed,
      headers: { "x-hub-signature-256": await sign(reversed) },
      method: "POST",
    }),
  );
  assert(response.status === 200, `expected 200, got ${response.status}`);
  // Order of arrival is not order of fact: each event keeps its own reference,
  // so the database decides what is still valid to apply.
  assert(
    recorded.map((event) => event.eventReference).join(",") ===
      "wamid.B:failed,wamid.A:delivered",
    recorded.map((event) => event.eventReference).join(","),
  );
});

Deno.test("a recording failure answers 500 so Meta redelivers", async () => {
  const { handler } = harness({ failRecord: true });
  const response = await handler(
    new Request(endpoint, {
      body: statusPayload,
      headers: { "x-hub-signature-256": await sign(statusPayload) },
      method: "POST",
    }),
  );
  assert(response.status === 500, `expected 500, got ${response.status}`);
});

Deno.test("an unconfigured function refuses to accept anything", async () => {
  const { handler } = harness({ configured: false });
  const response = await handler(
    new Request(endpoint, {
      body: statusPayload,
      headers: { "x-hub-signature-256": await sign(statusPayload) },
      method: "POST",
    }),
  );
  assert(response.status === 500, `expected 500, got ${response.status}`);
});
