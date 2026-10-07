// ADR-0018. The entry point that sends a tenant's WhatsApp notifications.
//
// A shell, like `notification-worker`: payload building, error classification
// and token-reference validation live in `packages/integrations/src/whatsapp`
// (vendored to `_shared/whatsapp` by `pnpm bundle:edge`), and the batch loop in
// `./worker.ts`. What is left here is HTTP, secrets and RPC wiring.
//
// Access tokens: each tenant's configuration stores only a *reference* — the
// name of an Edge Function secret, `WHATSAPP_TOKEN_<TENANT HEX>[_<SUFFIX>]` —
// set by a platform operator with `supabase secrets set`. The worker reads it
// with `Deno.env.get` for one request and never logs it, returns it, or writes
// it to the database. See docs/whatsapp.md.
import {
  callRpc,
  isInternalInvocation,
  json,
  platformConfigured,
  unauthorized,
} from "../_shared/rpc.ts";
import { type ClaimedWhatsAppRow, runWhatsAppBatch } from "./worker.ts";

const batchSize = Number(Deno.env.get("WHATSAPP_BATCH_SIZE") ?? "20");
const visibilitySeconds = Number(Deno.env.get("WHATSAPP_VISIBILITY_SECONDS") ?? "120");

interface BrandRow {
  readonly name_ar?: unknown;
  readonly name_en?: unknown;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (!isInternalInvocation(request)) return unauthorized();
  if (!platformConfigured()) return json({ error: "unconfigured" }, 500);

  const summary = await runWhatsAppBatch({
    claim: async () =>
      (await callRpc<ClaimedWhatsAppRow>("claim_whatsapp_batch_v1", {
        p_limit: batchSize,
        p_visibility_seconds: visibilitySeconds,
      })) ?? [],
    readSecret: (name) => Deno.env.get(name),
    record: async (input) => {
      // If this call fails the message stays claimed until its visibility
      // timeout expires and is tried again, which is the safe direction.
      await callRpc("record_whatsapp_attempt_v1", {
        p_attempt: input.attempt,
        p_error_code: input.report.errorCode ?? null,
        p_message_id: input.messageId,
        p_outcome: input.report.outcome,
        p_provider_reference: input.report.providerReference ?? null,
        p_started_at: input.startedAt,
      });
    },
    resolveBrandName: async (tenantId, locale) => {
      const rows = await callRpc<BrandRow>("get_notification_brand_v2", {
        p_tenant_id: tenantId,
      });
      const brand = rows?.[0];
      const name = locale === "ar" ? brand?.name_ar : brand?.name_en;
      return typeof name === "string" && name !== "" ? name : null;
    },
    transport: (url, init) =>
      fetch(url, { ...init, signal: AbortSignal.timeout(15_000) }),
  });

  // Counts only. No recipient, token, template text or provider message.
  return json(summary);
});
