// Issue #22. Creates the provider checkout session for an attempt the database
// has already priced, and records the reference it gets back.
//
// This function is a shell on purpose. Every decision it makes —  what to send,
// what a response means, what an error may disclose — lives in
// `packages/integrations/src/stripe.ts` and is unit tested there with an
// injected transport, so none of it needs a network or a provider account to be
// verified. What is left here is transport and secret handling.
//
// The amount is never read from the request. It comes from the attempt row,
// which the database calculated from the published price. A caller who wants to
// pay less can change nothing that matters.
import {
  createCheckoutSession,
  type StripeTransport,
} from "../../../packages/integrations/src/stripe.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

const transport: StripeTransport = (url, init) => fetch(url, init);

function refusal(code: string, status: number): Response {
  // One shape for every refusal, so a probe cannot tell a missing attempt from
  // an attempt that belongs to somebody else.
  return new Response(JSON.stringify({ error: code }), {
    headers: { "cache-control": "no-store", "content-type": "application/json" },
    status,
  });
}

async function rpc(name: string, body: unknown): Promise<Response> {
  return fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    body: JSON.stringify(body),
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") return refusal("method_not_allowed", 405);
  if (supabaseUrl === "" || serviceRoleKey === "" || stripeSecretKey === "") {
    return refusal("checkout_not_ready", 503);
  }

  let payload: {
    cancelUrl?: unknown;
    paymentAttemptId?: unknown;
    successUrl?: unknown;
    tenantId?: unknown;
  };
  try {
    payload = await request.json();
  } catch {
    return refusal("invalid_request", 400);
  }
  const tenantId = payload.tenantId;
  const paymentAttemptId = payload.paymentAttemptId;
  const successUrl = payload.successUrl;
  const cancelUrl = payload.cancelUrl;
  if (
    typeof tenantId !== "string" ||
    typeof paymentAttemptId !== "string" ||
    typeof successUrl !== "string" ||
    typeof cancelUrl !== "string"
  ) {
    return refusal("invalid_request", 400);
  }
  // Return destinations are ours, never the caller's. An open redirect here
  // would be a phishing page wearing the tenant's brand.
  for (const candidate of [successUrl, cancelUrl]) {
    if (!candidate.startsWith("https://")) return refusal("invalid_request", 400);
  }

  // The attempt carries the amount, the currency, the connected account, and
  // the contact to address. All of it is the server's own record.
  const loaded = await rpc("get_checkout_intent_v1", {
    p_payment_attempt_id: paymentAttemptId,
    p_tenant_id: tenantId,
  });
  if (!loaded.ok) return refusal("checkout_not_ready", 409);
  const rows = (await loaded.json()) as ReadonlyArray<{
    amount_minor_units: number;
    connected_account_reference: string;
    currency: string;
    customer_email: string;
    product_name: string;
  }>;
  const intent = rows[0];
  if (intent === undefined) return refusal("checkout_not_ready", 409);

  const session = await createCheckoutSession(
    {
      amountMinorUnits: intent.amount_minor_units,
      cancelUrl,
      connectedAccountId: intent.connected_account_reference,
      currency: intent.currency,
      customerEmail: intent.customer_email,
      // The attempt id is the idempotency key, so a retried call from a
      // reloading customer creates one session at the provider too.
      idempotencyKey: `attempt-${paymentAttemptId}`,
      paymentAttemptId,
      productName: intent.product_name,
      successUrl,
    },
    stripeSecretKey,
    transport,
  );
  if (!session.ok) return refusal("checkout_not_ready", 502);

  const attached = await rpc("attach_checkout_reference_v1", {
    p_checkout_reference: session.sessionId,
    p_payment_attempt_id: paymentAttemptId,
    p_tenant_id: tenantId,
  });
  // If the link cannot be recorded, the customer must not be sent to a session
  // no inbound event could ever be matched to.
  if (!attached.ok) return refusal("checkout_not_ready", 409);

  return new Response(JSON.stringify({ redirectUrl: session.redirectUrl }), {
    headers: { "cache-control": "no-store", "content-type": "application/json" },
    status: 200,
  });
});
