import { describe, expect, it } from "vitest";

import {
  expectedWhatsAppTokenReference,
  resolveWhatsAppAccessToken,
  sendWhatsAppTemplate,
  type WhatsAppTransport,
} from "./send.js";

const tenantId = "0a3f2b64-0000-4000-8000-000000000001";
const ownReference = "WHATSAPP_TOKEN_0A3F2B64000040008000000000000001";

const command = {
  languageCode: "en_US",
  phoneNumberId: "106540352242922",
  recipientE164: "+966501234567",
  templateKey: "booking.cancelled",
  templateName: "booking_cancelled",
  variables: { brandName: "Studio", publicReference: "BK-1", serviceName: "Cut" },
} as const;

function transportReturning(status: number, body: string) {
  const calls: Parameters<WhatsAppTransport>[] = [];
  const transport: WhatsAppTransport = async (url, init) => {
    calls.push([url, init]);
    return { status, text: async () => body };
  };
  return { calls, transport };
}

describe("sendWhatsAppTemplate", () => {
  it("posts the template to the pinned endpoint with the caller's bearer token", async () => {
    const { calls, transport } = transportReturning(
      200,
      JSON.stringify({ messages: [{ id: "wamid.synthetic" }] }),
    );
    const report = await sendWhatsAppTemplate(command, "synthetic-token", transport);
    expect(report).toEqual({
      outcome: "accepted",
      providerReference: "wamid.synthetic",
    });
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0]!;
    expect(url).toBe("https://graph.facebook.com/v25.0/106540352242922/messages");
    expect(init.method).toBe("POST");
    expect(init.headers["authorization"]).toBe("Bearer synthetic-token");
    expect(JSON.parse(init.body)).toMatchObject({
      template: { name: "booking_cancelled" },
      to: "966501234567",
      type: "template",
    });
  });

  it("never calls Meta for a message that cannot be built", async () => {
    const { calls, transport } = transportReturning(200, "{}");
    const report = await sendWhatsAppTemplate(
      { ...command, recipientE164: "not-a-number" },
      "synthetic-token",
      transport,
    );
    expect(report).toMatchObject({
      errorCode: "invalid_recipient",
      outcome: "permanent_error",
    });
    expect(calls).toHaveLength(0);
  });

  it("does not call Meta without a token, and leaves the message retryable", async () => {
    const { calls, transport } = transportReturning(200, "{}");
    const report = await sendWhatsAppTemplate(command, "", transport);
    expect(report).toMatchObject({
      errorCode: "token_unresolved",
      outcome: "retryable_error",
    });
    expect(calls).toHaveLength(0);
  });

  it("treats a thrown transport as a retryable network failure", async () => {
    const transport: WhatsAppTransport = async () => {
      throw new Error("connection reset");
    };
    expect(
      await sendWhatsAppTemplate(command, "synthetic-token", transport),
    ).toMatchObject({
      errorCode: "network_error",
      outcome: "retryable_error",
    });
  });

  it("classifies a template-paused refusal as permanent", async () => {
    const { transport } = transportReturning(
      403,
      JSON.stringify({ error: { code: 132015, message: "paused" } }),
    );
    expect(
      await sendWhatsAppTemplate(command, "synthetic-token", transport),
    ).toMatchObject({
      category: "template",
      errorCode: "meta_132015",
      outcome: "permanent_error",
    });
  });
});

describe("resolveWhatsAppAccessToken", () => {
  const secrets: Record<string, string> = {
    [ownReference]: " synthetic-token ",
    [`${ownReference}_R2`]: "rotated-token",
    SUPABASE_SERVICE_ROLE_KEY: "must-never-be-read",
    WHATSAPP_TOKEN_FFFFFFFF000040008000000000000002: "other-tenant",
  };
  const read = (name: string): string | undefined => secrets[name];

  it("derives the tenant-bound secret name", () => {
    expect(expectedWhatsAppTokenReference(tenantId)).toBe(ownReference);
    expect(expectedWhatsAppTokenReference("not-a-uuid")).toBeNull();
  });

  it("resolves the tenant's own env reference and a rotation suffix", () => {
    expect(resolveWhatsAppAccessToken(tenantId, `env:${ownReference}`, read)).toEqual({
      ok: true,
      token: "synthetic-token",
    });
    expect(
      resolveWhatsAppAccessToken(tenantId, `env:${ownReference}_R2`, read),
    ).toEqual({ ok: true, token: "rotated-token" });
  });

  it.each([
    "env:SUPABASE_SERVICE_ROLE_KEY",
    "env:WHATSAPP_TOKEN_FFFFFFFF000040008000000000000002",
    `env:${ownReference}_`,
    `env:${ownReference}_lower`,
    `env:${ownReference}X`,
    // The bare name without its scheme is not a reference.
    ownReference,
    "env:",
    "",
  ])("refuses a reference that is not this tenant's own: %j", (reference) => {
    expect(resolveWhatsAppAccessToken(tenantId, reference, read)).toEqual({
      ok: false,
      reason: "reference_invalid",
    });
  });

  it("does not resolve Vault references", () => {
    expect(
      resolveWhatsAppAccessToken(
        tenantId,
        "vault:0a3f2b64-0000-4000-8000-0000000000ff",
        read,
      ),
    ).toEqual({ ok: false, reason: "reference_unsupported" });
  });

  it("refuses a missing reference", () => {
    expect(resolveWhatsAppAccessToken(tenantId, null, read)).toEqual({
      ok: false,
      reason: "reference_invalid",
    });
  });

  it("reports an unset secret as unresolved, not invalid", () => {
    expect(
      resolveWhatsAppAccessToken(tenantId, `env:${ownReference}_R3`, read),
    ).toEqual({ ok: false, reason: "token_unresolved" });
  });
});
