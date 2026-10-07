import { describe, expect, it } from "vitest";

import {
  classifyWhatsAppErrorCode,
  classifyWhatsAppResponse,
  readGraphErrorCode,
} from "./classify.js";

const graphError = (code: number | string) => ({
  error: {
    code,
    error_data: {
      details: "Recipient +966501234567 ...",
      messaging_product: "whatsapp",
    },
    fbtrace_id: "synthetic",
    message: "(#131026) Message undeliverable",
    type: "OAuthException",
  },
});

describe("classifyWhatsAppErrorCode", () => {
  it.each([
    // [code, http status, outcome, category]
    [2, 503, "retryable_error", "transient"],
    [4, 429, "retryable_error", "rate_limit"],
    [80007, 429, "retryable_error", "rate_limit"],
    [130429, 429, "retryable_error", "rate_limit"],
    [131000, 500, "retryable_error", "transient"],
    [131016, 503, "retryable_error", "transient"],
    [131056, 429, "retryable_error", "rate_limit"],
    [131057, 503, "retryable_error", "transient"],
    [133004, 503, "retryable_error", "transient"],
    [131048, 429, "permanent_error", "policy"],
    [131049, 429, "permanent_error", "policy"],
    [0, 401, "permanent_error", "configuration"],
    [190, 401, "permanent_error", "configuration"],
    [200, 403, "permanent_error", "configuration"],
    [299, 403, "permanent_error", "configuration"],
    [131042, 402, "permanent_error", "configuration"],
    [368, 403, "permanent_error", "policy"],
    [130497, 403, "permanent_error", "policy"],
    [132007, 403, "permanent_error", "policy"],
    [131026, 400, "permanent_error", "recipient"],
    [131021, 400, "permanent_error", "recipient"],
    [130403, 403, "permanent_error", "recipient"],
    [131047, 400, "permanent_error", "window"],
    [131050, 400, "permanent_error", "opt_out"],
    [132000, 400, "permanent_error", "template"],
    [132001, 400, "permanent_error", "template"],
    [132015, 403, "permanent_error", "template"],
    [132016, 403, "permanent_error", "template"],
    [132018, 400, "permanent_error", "template"],
    [100, 400, "permanent_error", "request"],
    [131009, 400, "permanent_error", "request"],
  ] as const)("code %i (HTTP %i) is %s/%s", (code, status, outcome, category) => {
    expect(classifyWhatsAppErrorCode(code, status)).toEqual({
      category,
      errorCode: `meta_${code}`,
      outcome,
    });
  });

  it("falls back to the HTTP status for a code it has never seen", () => {
    expect(classifyWhatsAppErrorCode(999999, 503).outcome).toBe("retryable_error");
    expect(classifyWhatsAppErrorCode(999999, 429).outcome).toBe("retryable_error");
    expect(classifyWhatsAppErrorCode(999999, 400).outcome).toBe("permanent_error");
    expect(classifyWhatsAppErrorCode(999999).outcome).toBe("permanent_error");
  });
});

describe("classifyWhatsAppResponse", () => {
  it("accepts a 200 with a wamid and keeps it as the provider reference", () => {
    expect(
      classifyWhatsAppResponse(200, {
        contacts: [{ input: "966501234567", wa_id: "966501234567" }],
        messages: [{ id: "wamid.HBgMOTY2NTAxMjM0NTY3", message_status: "accepted" }],
        messaging_product: "whatsapp",
      }),
    ).toEqual({ outcome: "accepted", providerReference: "wamid.HBgMOTY2NTAxMjM0NTY3" });
  });

  it("never retries a 2xx it cannot match to a webhook, because that could double-send", () => {
    expect(classifyWhatsAppResponse(200, { messages: [] })).toMatchObject({
      errorCode: "invalid_response",
      outcome: "permanent_error",
    });
  });

  it("classifies by Meta code and never echoes provider text", () => {
    const report = classifyWhatsAppResponse(400, graphError(131026));
    expect(report).toEqual({
      category: "recipient",
      errorCode: "meta_131026",
      outcome: "permanent_error",
    });
    expect(JSON.stringify(report)).not.toContain("+966");
  });

  it("reads a string code", () => {
    expect(classifyWhatsAppResponse(429, graphError("130429")).outcome).toBe(
      "retryable_error",
    );
  });

  it.each([
    [502, null, "retryable_error", "http_502"],
    [429, "not json", "retryable_error", "http_429"],
    [404, {}, "permanent_error", "http_404"],
  ] as const)("HTTP %i with body %j is %s", (status, body, outcome, errorCode) => {
    expect(classifyWhatsAppResponse(status, body)).toMatchObject({
      errorCode,
      outcome,
    });
  });
});

describe("readGraphErrorCode", () => {
  it.each([
    [null, null],
    [{}, null],
    [{ error: "x" }, null],
    [{ error: { code: 1.5 } }, null],
    [{ error: { code: "12a" } }, null],
    [{ error: { code: 132001 } }, 132001],
  ] as const)("%j -> %j", (body, expected) => {
    expect(readGraphErrorCode(body)).toBe(expected);
  });
});
