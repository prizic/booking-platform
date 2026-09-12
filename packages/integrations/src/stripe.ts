/**
 * Issue #22. Every decision the Stripe checkout and webhook Edge Functions make
 * lives here, behind an injected transport, so both are verified without a
 * network and without provider credentials — the same arrangement `packages/email`
 * uses for Resend.
 *
 * No SDK. Creating a Checkout Session is one form-encoded POST and verifying a
 * webhook is one HMAC, so a dependency would buy nothing a few lines do not and
 * would put a large third-party surface inside the money path.
 */

export interface StripeTransport {
  (
    url: string,
    init: {
      readonly body: string;
      readonly headers: Readonly<Record<string, string>>;
      readonly method: string;
    },
  ): Promise<{ readonly status: number; readonly text: () => Promise<string> }>;
}

export interface CreateCheckoutSessionCommand {
  /** The tenant's connected account. Charges settle to them, never to us. */
  readonly connectedAccountId: string;
  /** Minor units, decided by the database and never by a browser. */
  readonly amountMinorUnits: number;
  readonly currency: string;
  readonly customerEmail: string;
  /** Our own attempt id, echoed back on every event about this session. */
  readonly paymentAttemptId: string;
  readonly productName: string;
  readonly successUrl: string;
  readonly cancelUrl: string;
  /** Idempotent at the provider too, so a retried call creates one session. */
  readonly idempotencyKey: string;
}

export type CreateCheckoutSessionResult =
  | { readonly ok: true; readonly sessionId: string; readonly redirectUrl: string }
  | { readonly ok: false; readonly reason: "provider_error" | "invalid_response" };

const apiBase = "https://api.stripe.com/v1";

function formEncode(fields: ReadonlyArray<readonly [string, string]>): string {
  return fields
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

export async function createCheckoutSession(
  command: CreateCheckoutSessionCommand,
  secretKey: string,
  transport: StripeTransport,
): Promise<CreateCheckoutSessionResult> {
  const body = formEncode([
    ["mode", "payment"],
    ["success_url", command.successUrl],
    ["cancel_url", command.cancelUrl],
    ["customer_email", command.customerEmail],
    ["line_items[0][quantity]", "1"],
    ["line_items[0][price_data][currency]", command.currency.toLowerCase()],
    ["line_items[0][price_data][unit_amount]", String(command.amountMinorUnits)],
    ["line_items[0][price_data][product_data][name]", command.productName],
    // The attempt id travels on the session so an inbound event identifies our
    // record without the browser carrying anything we would have to trust.
    ["metadata[payment_attempt_id]", command.paymentAttemptId],
    ["payment_intent_data[metadata][payment_attempt_id]", command.paymentAttemptId],
  ]);

  const response = await transport(`${apiBase}/checkout/sessions`, {
    body,
    headers: {
      authorization: `Bearer ${secretKey}`,
      "content-type": "application/x-www-form-urlencoded",
      // Charging on behalf of the tenant's own account is what makes this a
      // white-label platform rather than a merchant of record.
      "stripe-account": command.connectedAccountId,
      "idempotency-key": command.idempotencyKey,
    },
    method: "POST",
  });

  if (response.status < 200 || response.status >= 300) {
    // The provider's body can quote a customer address, so it is never returned
    // or logged. The caller gets a stable reason.
    return { ok: false, reason: "provider_error" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await response.text());
  } catch {
    return { ok: false, reason: "invalid_response" };
  }
  const session = parsed as { id?: unknown; url?: unknown };
  if (typeof session.id !== "string" || typeof session.url !== "string") {
    return { ok: false, reason: "invalid_response" };
  }
  return { ok: true, redirectUrl: session.url, sessionId: session.id };
}

export interface StripeWebhookVerificationInput {
  /** The exact bytes received, before any parsing. */
  readonly rawBody: string;
  readonly signatureHeader: string | null;
  /** The endpoint signing secret, `whsec_...`. */
  readonly secret: string;
  /** Injected so the replay window is testable without waiting. */
  readonly now?: Date;
}

export type StripeWebhookVerification =
  { readonly ok: false; readonly reason: "invalid" } | { readonly ok: true };

const toleranceSeconds = 300;

/** Constant-time comparison, so a signature cannot be discovered byte by byte. */
function equalsConstantTime(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Stripe signs `${timestamp}.${rawBody}` with HMAC-SHA256. Verification runs
 * over the unmodified bytes: re-serializing the JSON would change them and
 * fail, which is the point.
 */
export async function verifyStripeWebhook(
  input: StripeWebhookVerificationInput,
): Promise<StripeWebhookVerification> {
  if (input.signatureHeader === null || input.secret === "") {
    return { ok: false, reason: "invalid" };
  }

  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of input.signatureHeader.split(",")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === "t") timestamp = value;
    // v1 is the only scheme this verifies. An unknown scheme is not a reason to
    // accept anything.
    if (key === "v1") signatures.push(value);
  }
  if (timestamp === null || signatures.length === 0) {
    return { ok: false, reason: "invalid" };
  }

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return { ok: false, reason: "invalid" };
  const now = Math.floor((input.now?.getTime() ?? Date.now()) / 1000);
  // An old or future-dated delivery is refused, which bounds replay.
  if (Math.abs(now - sentAt) > toleranceSeconds) {
    return { ok: false, reason: "invalid" };
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(input.secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const expected = toHex(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${timestamp}.${input.rawBody}`),
    ),
  );
  // Stripe sends every valid signature during a secret rotation, so any match
  // is a match.
  const matched = signatures.some((candidate) =>
    equalsConstantTime(candidate, expected),
  );
  return matched ? { ok: true } : { ok: false, reason: "invalid" };
}

/** What the database needs from an event, and nothing else. */
export interface NormalizedStripeEvent {
  readonly amountMinorUnits: number | null;
  readonly chargeReference: string | null;
  readonly currency: string | null;
  readonly eventReference: string;
  readonly eventType: string;
  readonly occurredAt: string | null;
  /** `succeeded`, `failed`, or `cancelled`. Anything else is not settleable. */
  readonly outcome: "cancelled" | "failed" | "succeeded" | null;
  readonly paymentAttemptId: string | null;
  readonly sessionReference: string | null;
}

/**
 * The event types this platform acts on. Everything else is acknowledged and
 * ignored: a provider sends far more than a booking platform needs, and
 * treating an unknown type as a failure would turn noise into refunds.
 */
const outcomeByType: Readonly<Record<string, "cancelled" | "failed" | "succeeded">> = {
  "checkout.session.async_payment_failed": "failed",
  "checkout.session.async_payment_succeeded": "succeeded",
  "checkout.session.completed": "succeeded",
  "checkout.session.expired": "cancelled",
  "payment_intent.canceled": "cancelled",
  "payment_intent.payment_failed": "failed",
};

export function normalizeStripeEvent(rawBody: string): NormalizedStripeEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const event = parsed as {
    created?: unknown;
    data?: { object?: Record<string, unknown> };
    id?: unknown;
    type?: unknown;
  };
  if (typeof event.id !== "string" || typeof event.type !== "string") return null;
  const object = event.data?.object ?? {};

  // `checkout.session.completed` fires for an unpaid session when the payment
  // is asynchronous. Treating that as success would confirm a booking nobody
  // has paid for, so the session's own payment status decides.
  const paymentStatus = object.payment_status;
  let outcome = outcomeByType[event.type] ?? null;
  if (
    event.type === "checkout.session.completed" &&
    typeof paymentStatus === "string" &&
    paymentStatus !== "paid" &&
    paymentStatus !== "no_payment_required"
  ) {
    outcome = null;
  }

  const metadata = (object.metadata ?? {}) as Record<string, unknown>;
  const attemptId = metadata.payment_attempt_id;
  const amount = object.amount_total ?? object.amount_received ?? object.amount;
  const intent = object.payment_intent;

  return {
    amountMinorUnits: typeof amount === "number" ? amount : null,
    chargeReference:
      typeof intent === "string"
        ? intent
        : typeof object.id === "string"
          ? object.id
          : null,
    currency:
      typeof object.currency === "string" ? object.currency.toUpperCase() : null,
    eventReference: event.id,
    eventType: event.type,
    occurredAt:
      typeof event.created === "number"
        ? new Date(event.created * 1000).toISOString()
        : null,
    outcome,
    paymentAttemptId: typeof attemptId === "string" ? attemptId : null,
    sessionReference: typeof object.id === "string" ? object.id : null,
  };
}
