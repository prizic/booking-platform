// ADR-0018. Public endpoint for Meta's WhatsApp Cloud API webhooks.
//
// Meta cannot present a Supabase JWT, so `verify_jwt` is off for this function
// (supabase/config.toml) and authentication is the `X-Hub-Signature-256` HMAC
// over the raw body, keyed with the platform Meta app's secret. Reads
// `WHATSAPP_APP_SECRET` and `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
import { callRpc, platformConfigured } from "../_shared/rpc.ts";
import { createWhatsAppWebhookHandler } from "./handler.ts";

const handler = createWhatsAppWebhookHandler({
  appSecret: Deno.env.get("WHATSAPP_APP_SECRET") ?? "",
  configured: platformConfigured(),
  record: async (event) => {
    const rows = await callRpc<unknown>("record_whatsapp_provider_event_v1", {
      p_error_code: event.errorCode,
      p_occurred_at: event.occurredAt,
      p_phone_number_id: event.phoneNumberId,
      // `<wamid>:<status>`: the database deduplicates on it, so Meta's
      // redeliveries and out-of-order duplicates are free.
      p_provider_event_reference: event.eventReference,
      p_provider_message_reference: event.providerMessageReference,
      p_status: event.status,
    });
    return rows !== null;
  },
  verifyToken: Deno.env.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN") ?? "",
});

Deno.serve(handler);
