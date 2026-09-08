// Platform-owned Edge Function: drains due notification messages.
//
// It runs outside every business transaction, claims a bounded batch under a
// visibility timeout, calls the provider, and records the attempt durably. A
// crash between the call and the record leaves the message claimed until its
// timeout elapses, and the next run retries it — never a lost or doubled send,
// because the provider gets a per-attempt idempotency key and the message's own
// durable key already made it unique.
//
// Secrets live only in this function's environment. No key, no recipient, and
// no rendered body is logged.

// @ts-expect-error Deno resolves this URL at deploy time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  createResendAdapter,
  runNotificationBatch,
  type ClaimedNotification,
} from "../../../packages/email/src/worker.ts";

declare const Deno: { env: { get(name: string): string | undefined } };

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
const sender = Deno.env.get("NOTIFICATION_SENDER") ?? "";

Deno.serve(async () => {
  if (
    supabaseUrl === "" ||
    serviceRoleKey === "" ||
    resendApiKey === "" ||
    sender === ""
  ) {
    return new Response(JSON.stringify({ error: "not_configured" }), { status: 503 });
  }
  const client = createClient(supabaseUrl, serviceRoleKey);
  const deliver = createResendAdapter({ apiKey: resendApiKey, from: sender });

  await client.schema("private").rpc("dispatch_notifications_v1", { p_limit: 100 });
  await client
    .schema("private")
    .rpc("recover_stuck_notifications_v1", { p_limit: 500 });

  const summary = await runNotificationBatch({
    claim: async () => {
      const { data } = await client
        .schema("private")
        .rpc("claim_notification_batch_v1", { p_limit: 20, p_visibility_seconds: 120 });
      return ((data ?? []) as Record<string, unknown>[])
        .filter((row) => typeof row.recipient_email === "string")
        .map((row): ClaimedNotification => ({
          attempt: Number(row.attempt),
          bookingRevision: Number(row.booking_revision),
          correlationId: String(row.correlation_id),
          locale: row.template_locale === "ar" ? "ar" : "en",
          messageId: String(row.message_id),
          payload: (row.payload ?? {}) as Record<string, string>,
          recipient: String(row.recipient_email),
          templateKey: row.template_key as ClaimedNotification["templateKey"],
          tenantId: String(row.tenant_id),
        }));
    },
    deliver,
    record: async ({ attempt, messageId, report, startedAt }) => {
      await client.schema("private").rpc("record_notification_attempt_v1", {
        p_attempt: attempt,
        p_error_code: report.errorCode ?? null,
        p_message_id: messageId,
        p_outcome: report.outcome,
        p_provider_reference: report.providerReference ?? null,
        p_started_at: startedAt,
      });
    },
    resolveBrandName: async () => Deno.env.get("NOTIFICATION_BRAND_NAME") ?? "Booking",
  });

  // Counts only: never a recipient, a subject, or a provider reference.
  return Response.json(summary);
});
