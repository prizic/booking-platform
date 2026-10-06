import { callRpc, json, platformConfigured } from "../_shared/rpc.ts";
import { createOnboardingLink } from "./provider.ts";
Deno.serve(async (request: Request) => {
  try {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const url = Deno.env.get("SUPABASE_URL") ?? "",
      key = Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      secret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    if (!platformConfigured() || !key || !secret)
      return json({ error: "integration_unavailable" }, 503);
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer "))
      return json({ error: "not_authorized" }, 401);
    let body: Record<string, unknown>;
    try {
      const value: unknown = await request.json();
      if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error();
      body = value as Record<string, unknown>;
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
    if (
      typeof body.tenantId !== "string" ||
      typeof body.hostname !== "string" ||
      typeof body.requestId !== "string" ||
      !/^[a-f0-9-]{36}$/iu.test(body.requestId) ||
      !["en", "ar"].includes(String(body.locale))
    )
      return json({ error: "invalid_request" }, 400);
    const authorized = await fetch(
      `${url}/rest/v1/rpc/authorize_payment_onboarding_v1`,
      {
        method: "POST",
        headers: {
          apikey: key,
          authorization,
          "content-type": "application/json",
          "content-profile": "api_v1",
          "accept-profile": "api_v1",
        },
        body: JSON.stringify({
          p_tenant_id: body.tenantId,
          p_hostname: body.hostname,
          p_locale: body.locale,
          p_request_id: body.requestId,
        }),
      },
    );
    if (!authorized.ok)
      return json({ error: "integration_step_up_or_permission_required" }, 403);
    const intentId: unknown = await authorized.json();
    if (typeof intentId !== "string" || !/^[a-f0-9-]{36}$/iu.test(intentId))
      return json({ error: "integration_unavailable" }, 503);
    const intents = await callRpc<{
      account_reference: string;
      return_url: string;
      refresh_url: string;
      idempotency_key: string;
    }>("get_payment_onboarding_intent_v1", { p_intent_id: intentId });
    const intent = intents?.[0];
    if (!intent) return json({ error: "integration_unavailable" }, 409);
    const link = await createOnboardingLink(intent, secret);
    const recorded = await callRpc("complete_payment_onboarding_intent_v1", {
      p_intent_id: intentId,
      p_succeeded: link !== null,
    });
    if (!link || recorded === null)
      return json({ error: "integration_unavailable" }, 502);
    return json({ redirectUrl: link });
  } catch {
    return json({ error: "integration_unavailable" }, 503);
  }
});
