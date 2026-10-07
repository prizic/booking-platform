// ADR-0018. Delivery status from Meta's WhatsApp Cloud API, as a pure request
// handler so Deno tests drive it without a network, a database or a secret.
//
// GET is Meta's subscription handshake. POST is a status notification signed
// with the platform app secret over the exact bytes received. Recording is
// idempotent on `<wamid>:<status>`, so Meta's redeliveries are free and a
// non-2xx (which makes Meta retry) is always safe.
import {
  parseWhatsAppStatusWebhook,
  readWhatsAppVerificationQuery,
  verifyWhatsAppSignature,
  verifyWhatsAppSubscription,
  type WhatsAppProviderEvent,
} from "../_shared/whatsapp/mod.ts";

/** Status payloads are small; anything this large is not one. */
export const maxWebhookBytes = 1_000_000;

export interface WhatsAppWebhookPorts {
  readonly appSecret: string;
  readonly configured: boolean;
  /** Resolves false when the event could not be recorded. */
  readonly record: (event: WhatsAppProviderEvent) => Promise<boolean>;
  readonly verifyToken: string;
}

const respond = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    headers: { "cache-control": "no-store", "content-type": "application/json" },
    status,
  });

// A forged, oversized or malformed delivery is answered identically, so
// probing the endpoint reveals nothing about why it was refused.
const refused = (): Response => respond({ error: "invalid_request" }, 400);

export function createWhatsAppWebhookHandler(
  ports: WhatsAppWebhookPorts,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method === "GET") {
      const result = verifyWhatsAppSubscription(
        readWhatsAppVerificationQuery(new URL(request.url)),
        ports.verifyToken,
      );
      if (!result.ok) return respond({ error: "forbidden" }, 403);
      return new Response(result.challenge, {
        headers: { "cache-control": "no-store", "content-type": "text/plain" },
        status: 200,
      });
    }

    if (request.method !== "POST") return refused();
    if (!ports.configured || ports.appSecret === "") {
      return respond({ error: "unconfigured" }, 500);
    }

    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > maxWebhookBytes) return refused();
    // The exact bytes. Decoding and re-encoding, or re-serializing the JSON,
    // could change them and the signature would no longer describe what came.
    const rawBody = new Uint8Array(await request.arrayBuffer());
    if (rawBody.byteLength > maxWebhookBytes) return refused();

    const verified = await verifyWhatsAppSignature({
      appSecret: ports.appSecret,
      rawBody,
      signatureHeader: request.headers.get("x-hub-signature-256"),
    });
    if (!verified) return refused();

    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
    } catch {
      return refused();
    }

    const events = parseWhatsAppStatusWebhook(body);
    let recorded = 0;
    for (const event of events) {
      if (!(await ports.record(event))) {
        // Meta retries a non-2xx; the events already recorded dedupe.
        return respond({ error: "not_recorded" }, 500);
      }
      recorded += 1;
    }
    return respond({ received: recorded }, 200);
  };
}
