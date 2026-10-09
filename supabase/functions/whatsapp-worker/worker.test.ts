import type { WhatsAppTransport } from "../_shared/whatsapp/mod.ts";
import {
  type ClaimedWhatsAppRow,
  type RecordedAttempt,
  runWhatsAppBatch,
} from "./worker.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const tenantId = "0a3f2b64-0000-4000-8000-000000000001";
const tokenName = "WHATSAPP_TOKEN_0A3F2B64000040008000000000000001";
const tokenReference = `env:${tokenName}`;

const row = (overrides: Partial<ClaimedWhatsAppRow> = {}): ClaimedWhatsAppRow => ({
  access_token_secret_ref: tokenReference,
  attempt: 1,
  correlation_id: "corr-1",
  message_id: "msg-1",
  payload: {
    locationName: "فرع الرياض",
    publicReference: "BK-7Q2M",
    serviceName: "استشارة",
    startAt: "الأحد ١٢ أكتوبر، ٤:٣٠ م",
    timeZone: "Asia/Riyadh",
  },
  phone_number_id: "106540352242922",
  recipient_phone_e164: "+966501234567",
  template_key: "booking.confirmed",
  template_language: "ar",
  template_locale: "ar",
  template_name: "booking_confirmed_v1",
  tenant_id: tenantId,
  ...overrides,
});

function harness(
  rows: readonly ClaimedWhatsAppRow[],
  respond: (url: string, body: string) => { status: number; body: string } = () => ({
    body: JSON.stringify({ messages: [{ id: "wamid.synthetic" }] }),
    status: 200,
  }),
  secrets: Record<string, string> = { [tokenName]: "synthetic-token" },
) {
  const recorded: RecordedAttempt[] = [];
  const sent: { url: string; body: string; authorization: string | undefined }[] = [];
  const transport: WhatsAppTransport = (url, init) => {
    sent.push({ authorization: init.headers["authorization"], body: init.body, url });
    const answer = respond(url, init.body);
    return Promise.resolve({
      status: answer.status,
      text: () => Promise.resolve(answer.body),
    });
  };
  const ports = {
    claim: () => Promise.resolve(rows),
    readSecret: (name: string) => secrets[name],
    record: (attempt: RecordedAttempt) => {
      recorded.push(attempt);
      return Promise.resolve();
    },
    resolveBrandName: (_tenant: string, locale: "ar" | "en") =>
      Promise.resolve(locale === "ar" ? "عيادة النخبة" : "Elite Clinic"),
    transport,
  };
  return { ports, recorded, sent };
}

Deno.test(
  "sends the approved template with the tenant's token and records the wamid",
  async () => {
    const { ports, recorded, sent } = harness([row()]);
    const summary = await runWhatsAppBatch(ports);
    assert(
      summary.accepted === 1 && summary.failed === 0 && summary.retried === 0,
      "summary",
    );
    assert(sent.length === 1, "one send");
    assert(
      sent[0]?.url === "https://graph.facebook.com/v25.0/106540352242922/messages",
      "endpoint",
    );
    assert(sent[0]?.authorization === "Bearer synthetic-token", "bearer");
    const body = JSON.parse(sent[0]!.body);
    assert(body.to === "966501234567", "recipient without plus");
    assert(body.template.name === "booking_confirmed_v1", "template name");
    assert(
      body.template.components[0].parameters[0].text === "عيادة النخبة",
      "localized brand first",
    );
    assert(recorded[0]?.report.outcome === "accepted", "recorded accepted");
    assert(
      recorded[0]?.report.providerReference === "wamid.synthetic",
      "wamid recorded",
    );
    assert(
      recorded[0]?.messageId === "msg-1" && recorded[0]?.attempt === 1,
      "attempt identity",
    );
  },
);

Deno.test(
  "looks the brand up once per tenant and locale, not once per message",
  async () => {
    const { ports, sent } = harness([
      row({ message_id: "ar-1", template_locale: "ar" }),
      row({ message_id: "ar-2", template_locale: "ar" }),
      row({ message_id: "en-1", template_locale: "en" }),
    ]);
    const calls: string[] = [];
    const summary = await runWhatsAppBatch({
      ...ports,
      resolveBrandName: (tenant, locale) => {
        calls.push(`${tenant}:${locale}`);
        return Promise.resolve(locale === "ar" ? "عيادة النخبة" : "Elite Clinic");
      },
    });
    assert(summary.accepted === 3, `summary ${JSON.stringify(summary)}`);
    assert(sent.length === 3, "three sends");
    // Two Arabic messages, one English: two lookups, not three.
    assert(calls.length === 2, `brand lookups: ${calls.join(",")}`);
  },
);

Deno.test("a rate limit is retryable and a paused template is permanent", async () => {
  const { ports, recorded } = harness(
    [row({ message_id: "rate" }), row({ message_id: "paused" })],
    (_url, body) =>
      body.includes("booking_confirmed_v1") && recorded.length === 0
        ? { body: JSON.stringify({ error: { code: 130429 } }), status: 429 }
        : { body: JSON.stringify({ error: { code: 132015 } }), status: 403 },
  );
  const summary = await runWhatsAppBatch(ports);
  assert(
    summary.retried === 1 && summary.failed === 1,
    `summary ${JSON.stringify(summary)}`,
  );
  assert(recorded[0]?.report.errorCode === "meta_130429", "rate limit code");
  assert(recorded[1]?.report.errorCode === "meta_132015", "paused code");
});

Deno.test(
  "a token reference naming another tenant's secret is never read",
  async () => {
    const foreign = "WHATSAPP_TOKEN_FFFFFFFF000040008000000000000002";
    const foreignReference = `env:${foreign}`;
    let read = false;
    const { ports, recorded, sent } = harness([
      row({ access_token_secret_ref: foreignReference }),
    ]);
    const result = await runWhatsAppBatch({
      ...ports,
      readSecret: (name) => {
        if (name === foreign) read = true;
        return "other-tenant-token";
      },
    });
    assert(!read, "foreign secret was read");
    assert(sent.length === 0, "message was sent");
    assert(result.failed === 1, "not permanent");
    assert(recorded[0]?.report.errorCode === "token_reference_invalid", "wrong code");
  },
);

Deno.test("an unset token is retryable and nothing is sent", async () => {
  const { ports, recorded, sent } = harness([row()], undefined, {});
  const summary = await runWhatsAppBatch(ports);
  assert(sent.length === 0, "sent without token");
  assert(summary.retried === 1, "should retry");
  assert(recorded[0]?.report.errorCode === "token_unresolved", "code");
});

Deno.test(
  "configuration gaps and unbuildable messages are permanent without a network call",
  async () => {
    const { ports, recorded, sent } = harness([
      row({ message_id: "unmapped", template_name: null }),
      row({ message_id: "no-phone-id", phone_number_id: null }),
      row({ message_id: "staff", template_key: "staff.request_pending" }),
      row({ message_id: "bad-number", recipient_phone_e164: "0501234567" }),
    ]);
    const summary = await runWhatsAppBatch(ports);
    assert(sent.length === 0, "network was called");
    assert(summary.failed === 4, `summary ${JSON.stringify(summary)}`);
    const codes = recorded.map((attempt) => attempt.report.errorCode).join(",");
    assert(
      codes ===
        "template_unmapped,phone_number_unconfigured,unsupported_template,invalid_recipient",
      codes,
    );
  },
);

Deno.test("an unresolvable brand leaves the message for the next attempt", async () => {
  const { ports, recorded, sent } = harness([row()]);
  const summary = await runWhatsAppBatch({
    ...ports,
    resolveBrandName: () => Promise.resolve(null),
  });
  assert(sent.length === 0 && summary.retried === 1, "should retry without sending");
  assert(recorded[0]?.report.errorCode === "brand_unresolved", "code");
});

Deno.test("a network failure is retryable", async () => {
  const { ports, recorded } = harness([row()]);
  await runWhatsAppBatch({
    ...ports,
    transport: () => Promise.reject(new Error("reset")),
  });
  assert(recorded[0]?.report.outcome === "retryable_error", "outcome");
  assert(recorded[0]?.report.errorCode === "network_error", "code");
});

Deno.test("a Vault reference is refused permanently and nothing is sent", async () => {
  const { ports, recorded, sent } = harness([
    row({ access_token_secret_ref: "vault:0a3f2b64-0000-4000-8000-0000000000ff" }),
  ]);
  const summary = await runWhatsAppBatch(ports);
  assert(sent.length === 0 && summary.failed === 1, "should fail without sending");
  assert(recorded[0]?.report.errorCode === "token_reference_unsupported", "code");
});
