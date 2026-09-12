// Issue #101. Delivery, bounce and complaint events from Resend.
//
// Verification runs over the unmodified raw body in `packages/email`, tested
// against a known secret with no network. What is left here is reading those
// exact bytes before anything parses them, and handing verified fact to a
// database function that is idempotent on the provider's own event id.
import { verifyResendWebhook } from "../_shared/email/webhook.ts";
import { callRpc, json, platformConfigured, unconfigured } from "../_shared/rpc.ts";

const signingSecret = Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "";

// A forged, stale, replayed or malformed delivery is answered identically, so
// probing the endpoint reveals nothing about why it was refused.
const refused = (): Response => json({ error: "invalid_request" }, 400);

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") return refused();
  if (!platformConfigured() || signingSecret === "") return unconfigured();

  // The exact bytes. Re-serializing the JSON would change them and the
  // signature would no longer describe what arrived.
  const rawBody = await request.text();
  const verification = await verifyResendWebhook({
    headers: {
      "svix-id": request.headers.get("svix-id"),
      "svix-signature": request.headers.get("svix-signature"),
      "svix-timestamp": request.headers.get("svix-timestamp"),
      "webhook-id": request.headers.get("webhook-id"),
      "webhook-signature": request.headers.get("webhook-signature"),
      "webhook-timestamp": request.headers.get("webhook-timestamp"),
    },
    rawBody,
    secret: signingSecret,
  });
  if (!verification.ok) return refused();

  let event: {
    created_at?: unknown;
    data?: { email_id?: unknown };
    type?: unknown;
  };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return refused();
  }
  if (typeof event.type !== "string") return refused();

  const applied = await callRpc<{ applied: boolean; message_id: string | null }>(
    "record_notification_event_v1",
    {
      p_event_type: event.type,
      p_occurred_at:
        typeof event.created_at === "string"
          ? event.created_at
          : new Date().toISOString(),
      p_provider: "resend",
      // Svix's own id identifies the delivery; the database deduplicates on it,
      // so a redelivered webhook is free.
      p_provider_event_reference:
        request.headers.get("svix-id") ?? request.headers.get("webhook-id") ?? "",
      p_provider_message_reference:
        typeof event.data?.email_id === "string" ? event.data.email_id : null,
    },
  );
  // A non-2xx keeps the provider retrying, and the retry is free.
  if (applied === null) return json({ error: "not_recorded" }, 500);
  return json({ applied: applied[0]?.applied ?? false });
});
