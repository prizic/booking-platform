/**
 * WhatsApp notification channel (ADR-0018). The inbound webhook.
 *
 * Three jobs, all pure so they are tested without a network or a secret:
 *
 * 1. The subscription handshake. Meta sends `GET ?hub.mode=subscribe
 *    &hub.verify_token=…&hub.challenge=…`; the endpoint answers with the
 *    challenge only if the token matches.
 *    https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
 * 2. Payload authentication. Every POST carries `X-Hub-Signature-256:
 *    sha256=<hex>`, an HMAC-SHA256 of the exact payload bytes keyed with the
 *    app secret.
 *    https://developers.facebook.com/docs/graph-api/webhooks/getting-started#event-notifications
 * 3. Parsing `statuses` (sent / delivered / read / failed) into provider
 *    events. Inbound customer messages (`messages`) are ignored: this channel
 *    is outbound notifications only, and storing a chat would be a new data
 *    category.
 *    https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/reference/messages/status
 */
import { classifyWhatsAppErrorCode, type WhatsAppFailureCategory } from "./classify.js";

const encoder = new TextEncoder();

/**
 * Compares two strings in time that depends only on their lengths, so neither
 * a signature nor a verify token can be discovered byte by byte.
 */
export function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) | 0) ^ (right.charCodeAt(index) | 0);
  }
  return difference === 0;
}

export interface WhatsAppVerificationQuery {
  readonly challenge: string | null;
  readonly mode: string | null;
  readonly verifyToken: string | null;
}

export type WhatsAppVerificationResult =
  { readonly challenge: string; readonly ok: true } | { readonly ok: false };

/** Reads the three `hub.*` parameters from a request URL. */
export function readWhatsAppVerificationQuery(url: URL): WhatsAppVerificationQuery {
  return {
    challenge: url.searchParams.get("hub.challenge"),
    mode: url.searchParams.get("hub.mode"),
    verifyToken: url.searchParams.get("hub.verify_token"),
  };
}

/**
 * The GET handshake. The challenge is echoed only when it is a plain integer
 * (Meta documents it as an `int`), so this endpoint can never be made to
 * reflect arbitrary content back to a caller.
 */
export function verifyWhatsAppSubscription(
  query: WhatsAppVerificationQuery,
  expectedVerifyToken: string,
): WhatsAppVerificationResult {
  if (expectedVerifyToken === "") return { ok: false };
  if (query.mode !== "subscribe") return { ok: false };
  if (query.verifyToken === null) return { ok: false };
  if (!constantTimeEqual(query.verifyToken, expectedVerifyToken)) return { ok: false };
  if (query.challenge === null || !/^[0-9]{1,64}$/u.test(query.challenge)) {
    return { ok: false };
  }
  return { challenge: query.challenge, ok: true };
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export interface WhatsAppSignatureInput {
  /** The app secret of the platform's Meta app. */
  readonly appSecret: string;
  /**
   * The exact bytes received, before any parsing. Re-serialized JSON would not
   * match: Meta signs its own escaped form of the payload.
   */
  readonly rawBody: Uint8Array | string;
  /** The `X-Hub-Signature-256` header, or null when it was absent. */
  readonly signatureHeader: string | null;
}

/**
 * Verifies `X-Hub-Signature-256`. Meta's signature carries no timestamp, so a
 * byte-identical redelivery verifies; that is harmless because recording is
 * idempotent on message id + status. A signature taken from one body never
 * verifies another.
 */
export async function verifyWhatsAppSignature(
  input: WhatsAppSignatureInput,
): Promise<boolean> {
  if (input.appSecret === "" || input.signatureHeader === null) return false;
  const header = input.signatureHeader.trim();
  if (!header.startsWith("sha256=")) return false;
  const provided = header.slice("sha256=".length).toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(provided)) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(input.appSecret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  // A copy, so the view is always over a plain ArrayBuffer as WebCrypto requires.
  const bytes =
    typeof input.rawBody === "string"
      ? encoder.encode(input.rawBody)
      : new Uint8Array(input.rawBody);
  const expected = toHex(await crypto.subtle.sign("HMAC", key, bytes));
  return constantTimeEqual(provided, expected);
}

export type WhatsAppStatus = "delivered" | "failed" | "read" | "sent";

/** One status transition, ready for `record_whatsapp_provider_event_v1`. */
export interface WhatsAppProviderEvent {
  readonly businessAccountId: string | null;
  readonly errorCategory: WhatsAppFailureCategory | null;
  /** `meta_<code>` for a failure, otherwise null. */
  readonly errorCode: string | null;
  /** `<wamid>:<status>` — the idempotency identity of this event. */
  readonly eventReference: string;
  readonly occurredAt: string;
  readonly phoneNumberId: string | null;
  /** The `wamid.` returned when the message was sent. */
  readonly providerMessageReference: string;
  readonly status: WhatsAppStatus;
}

const knownStatuses: ReadonlySet<string> = new Set([
  "delivered",
  "failed",
  "read",
  "sent",
]);

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asArray = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];

const asString = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;

function toIsoTimestamp(value: unknown): string | null {
  const text = typeof value === "number" ? String(value) : value;
  if (typeof text !== "string" || !/^[0-9]{1,12}$/u.test(text)) return null;
  return new Date(Number(text) * 1000).toISOString();
}

/**
 * Extracts every status transition from a parsed webhook body. Anything
 * unrecognised — another object type, an inbound message, `played`, a status
 * without an id — is skipped rather than refused, so Meta is acknowledged and
 * stops retrying a payload that will never mean more than it does now.
 *
 * The recipient's number (`recipient_id`) and Meta's free-text error message
 * are deliberately not carried: neither is needed to update the outbox, and
 * both are personal or may quote personal data.
 */
export function parseWhatsAppStatusWebhook(
  body: unknown,
): readonly WhatsAppProviderEvent[] {
  const root = asRecord(body);
  if (root === null || root["object"] !== "whatsapp_business_account") return [];

  const events: WhatsAppProviderEvent[] = [];
  for (const entryValue of asArray(root["entry"])) {
    const entry = asRecord(entryValue);
    if (entry === null) continue;
    const businessAccountId = asString(entry["id"]);
    for (const changeValue of asArray(entry["changes"])) {
      const change = asRecord(changeValue);
      if (change === null || change["field"] !== "messages") continue;
      const value = asRecord(change["value"]);
      if (value === null) continue;
      const phoneNumberId = asString(asRecord(value["metadata"])?.["phone_number_id"]);

      for (const statusValue of asArray(value["statuses"])) {
        const status = asRecord(statusValue);
        if (status === null) continue;
        const id = asString(status["id"]);
        const state = status["status"];
        const occurredAt = toIsoTimestamp(status["timestamp"]);
        if (id === null || typeof state !== "string" || !knownStatuses.has(state)) {
          continue;
        }
        if (occurredAt === null) continue;

        let errorCode: string | null = null;
        let errorCategory: WhatsAppFailureCategory | null = null;
        if (state === "failed") {
          const firstError = asRecord(asArray(status["errors"])[0]);
          const rawCode = firstError?.["code"];
          const code =
            typeof rawCode === "number"
              ? rawCode
              : typeof rawCode === "string" && /^[0-9]{1,9}$/u.test(rawCode)
                ? Number(rawCode)
                : null;
          if (code === null) {
            errorCode = "meta_unknown";
            errorCategory = "unknown";
          } else {
            const classified = classifyWhatsAppErrorCode(code);
            errorCode = classified.errorCode;
            errorCategory = classified.category;
          }
        }

        events.push({
          businessAccountId,
          errorCategory,
          errorCode,
          eventReference: `${id}:${state}`,
          occurredAt,
          phoneNumberId,
          providerMessageReference: id,
          status: state as WhatsAppStatus,
        });
      }
    }
  }
  return events;
}
