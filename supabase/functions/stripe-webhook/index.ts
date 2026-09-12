// Issue #22. The only thing in this platform that can turn money into a
// booking. A customer's browser reaches nothing here.
//
// Like the checkout function, this is a shell: signature verification and event
// normalization live in `packages/integrations/src/stripe.ts`, unit tested with
// a known secret and no network. What is left here is reading the raw bytes
// before anything parses them, and handing verified fact to the database.
import {
  normalizeStripeEvent,
  verifyStripeWebhook,
} from "../../../packages/integrations/src/stripe.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const signingSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

// A forged, stale, replayed or malformed delivery is answered identically, so
// probing the endpoint reveals nothing about why it was refused.
function refused(): Response {
  return new Response(JSON.stringify({ error: "invalid_request" }), {
    headers: { "cache-control": "no-store", "content-type": "application/json" },
    status: 400,
  });
}

// 2xx tells the provider to stop retrying. Anything the platform has recorded —
// including an event it chose to ignore — is settled business.
function acknowledged(outcome: string): Response {
  return new Response(JSON.stringify({ outcome }), {
    headers: { "cache-control": "no-store", "content-type": "application/json" },
    status: 200,
  });
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") return refused();
  if (supabaseUrl === "" || serviceRoleKey === "" || signingSecret === "") {
    // Never accept an unverifiable delivery because configuration is missing.
    // A 500 keeps the provider retrying until an operator fixes it.
    return new Response(JSON.stringify({ error: "unconfigured" }), { status: 500 });
  }

  // The exact bytes, before any parsing. Re-serializing the JSON would change
  // them and the signature would no longer describe what arrived.
  const rawBody = await request.text();
  const verification = await verifyStripeWebhook({
    rawBody,
    secret: signingSecret,
    signatureHeader: request.headers.get("stripe-signature"),
  });
  if (!verification.ok) return refused();

  const event = normalizeStripeEvent(rawBody);
  if (event === null) return refused();
  if (event.outcome === null || event.sessionReference === null) {
    // A type this platform does not act on, or a completed session whose money
    // has not actually moved yet. Acknowledged so it is not retried forever,
    // and settled by the later event that does carry an outcome.
    return acknowledged("ignored");
  }

  // The tenant is resolved from our own mapping of the session reference, never
  // from anything the payload claims about who this is for.
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/record_payment_event_v1`, {
    body: JSON.stringify({
      p_amount_minor_units: event.amountMinorUnits,
      p_currency: event.currency,
      p_event_type: event.eventType,
      p_occurred_at: event.occurredAt,
      p_provider: "stripe",
      p_provider_charge_reference: event.chargeReference,
      p_provider_event_reference: event.eventReference,
      p_provider_object_reference: event.sessionReference,
      p_outcome: event.outcome,
      p_tenant_id: await resolveTenant(event.sessionReference),
    }),
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  if (!response.ok) {
    // Recording failed. A non-2xx keeps the provider retrying, and the database
    // is idempotent on the event reference, so the retry is free.
    return new Response(JSON.stringify({ error: "not_recorded" }), { status: 500 });
  }

  const settled = (await response.json()) as ReadonlyArray<{ outcome?: string }>;
  return acknowledged(settled[0]?.outcome ?? "recorded");
});

/** Which tenant owns this provider object, according to our own mapping. */
async function resolveTenant(sessionReference: string): Promise<string | null> {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/provider_object_mappings` +
      `?select=tenant_id&object_kind=eq.checkout` +
      `&provider_object_reference=eq.${encodeURIComponent(sessionReference)}`,
    {
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "accept-profile": "app",
      },
    },
  );
  if (!response.ok) return null;
  const rows = (await response.json()) as ReadonlyArray<{ tenant_id?: string }>;
  return rows[0]?.tenant_id ?? null;
}
