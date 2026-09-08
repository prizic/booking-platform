// Platform-owned Edge Function: the verified Resend callback inbox.
//
// Verification runs over the unmodified raw body before anything is parsed.
// A forged or stale delivery is refused with the same answer as a malformed
// one, and nothing about why it failed is returned. Accepted callbacks are
// acknowledged quickly and applied idempotently by the database.

// @ts-expect-error Deno resolves this URL at deploy time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { verifyResendWebhook } from "../../../packages/email/src/webhook.ts";

declare const Deno: { env: { get(name: string): string | undefined } };

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "";

const eventTypes: Record<string, string> = {
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.failed": "failed",
};

Deno.serve(async (request: Request) => {
  if (supabaseUrl === "" || serviceRoleKey === "" || webhookSecret === "") {
    return new Response(null, { status: 503 });
  }
  // Read the bytes exactly once, before parsing: re-serializing would change
  // what was signed.
  const rawBody = await request.text();
  const headers: Record<string, string | null> = {
    "svix-id": request.headers.get("svix-id"),
    "svix-signature": request.headers.get("svix-signature"),
    "svix-timestamp": request.headers.get("svix-timestamp"),
  };
  const verification = await verifyResendWebhook({
    headers,
    rawBody,
    secret: webhookSecret,
  });
  if (!verification.ok) return new Response(null, { status: 401 });

  let event: { created_at?: string; data?: { email_id?: string }; type?: string };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return new Response(null, { status: 400 });
  }
  const mapped = eventTypes[event.type ?? ""];
  const providerReference = event.data?.email_id;
  const providerEventId = headers["svix-id"];
  if (
    mapped === undefined ||
    providerReference === undefined ||
    providerEventId === null
  ) {
    // An event this platform does not model is acknowledged, not retried.
    return new Response(null, { status: 202 });
  }

  const client = createClient(supabaseUrl, serviceRoleKey);
  await client.schema("private").rpc("record_notification_event_v1", {
    p_event_type: mapped,
    p_occurred_at: event.created_at ?? new Date().toISOString(),
    p_provider: "resend",
    p_provider_event_id: providerEventId,
    p_provider_message_reference: providerReference,
  });
  return new Response(null, { status: 202 });
});
