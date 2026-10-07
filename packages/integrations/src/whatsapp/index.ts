// WhatsApp notification channel (ADR-0018). Platform-only: this package is not
// in the distribution allowlist, and the Edge Functions receive a generated copy
// under `supabase/functions/_shared/whatsapp/`.
export * from "./classify.js";
export * from "./payload.js";
export * from "./send.js";
export * from "./webhook.js";
