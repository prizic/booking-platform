#!/usr/bin/env node
// Actual local mailbox delivery using the production claim/render/record owner.
// Mailpit is the test transport, NOT evidence of a Resend sandbox delivery.
import { execFileSync } from "node:child_process";
import { readLocalSupabaseEnvironment } from "./live-booking-e2e.mjs";
import { assertNode22 } from "./demo-dev.mjs";
assertNode22();
if (
  !process.env.WLBP_SUPABASE_WORKDIR?.includes("/.artifacts/") ||
  !process.env.WLBP_SUPABASE_WORKDIR.endsWith("/isolated")
)
  throw new Error("Isolated campaign workdir required");
const local = readLocalSupabaseEnvironment();
const db = new URL(local.databaseUrl);
const api = new URL(local.apiUrl);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(db.hostname) ||
  !["55322", "57722", "57822", "57922"].includes(db.port) ||
  db.search ||
  db.hash ||
  api.port !== db.port.slice(0, -2) + "21"
)
  throw new Error("Isolated local campaign identity required");
const mailbox = `http://127.0.0.1:${db.port.slice(0, -2)}24`;
const { runNotificationBatch } = await import("../packages/email/dist/worker.js");
const { parseNotificationBrandRow } = await import("../packages/email/dist/brand.js");
function sql(query) {
  try {
    return execFileSync(
      "psql",
      [
        local.databaseUrl,
        "--no-psqlrc",
        "-qtAX",
        "--set=ON_ERROR_STOP=1",
        "--file",
        "-",
      ],
      {
        input: query,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 30000,
      },
    ).trim();
  } catch {
    throw new Error(
      "Local notification owner call failed; credential-bearing diagnostics suppressed",
    );
  }
}
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
sql("select * from private.dispatch_notifications_v1(null,100);");
let total = 0;
for (let round = 0; round < 4; round++) {
  const summary = await runNotificationBatch({
    claim: async () =>
      JSON.parse(
        sql(
          "select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from private.claim_notification_batch_v1(100,120) r;",
        ),
      ).map((row) => ({
        attempt: row.attempt,
        bookingRevision: row.booking_revision,
        correlationId: row.correlation_id,
        isTest: row.is_test === true,
        locale: row.template_locale,
        messageId: row.message_id,
        payload: row.payload ?? {},
        recipient: row.recipient_email,
        templateKey: row.template_key,
        tenantId: row.tenant_id,
      })),
    resolveBrand: async (tenant) =>
      parseNotificationBrandRow(
        JSON.parse(
          sql(
            `select to_jsonb(r) from private.get_notification_brand_v2(${quote(tenant)}::uuid) r;`,
          ),
        ),
      ),
    deliver: async (input) => {
      if (!input.to.endsWith("@example.invalid"))
        return {
          outcome: "permanent_error",
          errorCode: "synthetic_recipient_required",
        };
      const response = await fetch(`${mailbox}/api/v1/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          From: {
            Email: "journey-sender@example.invalid",
            Name: "Synthetic local journey",
          },
          To: [{ Email: input.to }],
          Subject: input.subject,
          Text: input.text,
          HTML: input.html,
          Headers: { "X-Journey-Idempotency": input.idempotencyKey },
          Tags: ["booking-journey"],
        }),
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        return { outcome: "retryable_error", errorCode: "local_mailbox_unavailable" };
      const ack = await response.json();
      return {
        outcome: "accepted",
        providerReference: `mailpit:${ack.ID ?? ack.id ?? "accepted"}`,
      };
    },
    record: async (input) => {
      sql(
        `select private.record_notification_attempt_v1(${quote(input.messageId)}::uuid,${input.attempt},${quote(input.report.outcome)},${quote(input.startedAt)}::timestamptz,${input.report.providerReference ? quote(input.report.providerReference) : "null"},${input.report.errorCode ? quote(input.report.errorCode) : "null"});`,
      );
    },
  });
  total += summary.accepted;
  if (summary.failed || summary.retried)
    throw new Error(
      "Local notification batch could not deliver all claimed mail. Inspect sanitized outcome counts and fixture brand/template setup.",
    );
  if (summary.accepted === 0) break;
}
console.log(
  `Local synthetic mailbox accepted ${total} messages. Production provider delivery remains unverified.`,
);
