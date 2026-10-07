/**
 * WhatsApp notification channel (ADR-0018). Classifying a Cloud API answer.
 *
 * The difference between "try again" and "never" is what the outbox retry
 * schedule is made of, so every failure is classified, never thrown. Codes and
 * their meaning come from Meta's error-code reference:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 * (Graph-level codes 0–368: https://developers.facebook.com/docs/graph-api/guides/error-handling)
 *
 * The provider's error `message`/`details` text can quote a phone number, so it
 * is never returned, stored or logged. Only the numeric code travels on.
 */

export type WhatsAppDeliveryOutcome =
  "accepted" | "permanent_error" | "retryable_error";

export type WhatsAppFailureCategory =
  /** Throughput or pair-rate limits: back off and send again. */
  | "rate_limit"
  /** Meta is down, overloaded or in maintenance. */
  | "transient"
  /** The number cannot receive this message: not on WhatsApp, blocked, same as sender. */
  | "recipient"
  /** The template is missing, unapproved, paused, disabled, or its parameters do not fit. */
  | "template"
  /** Account or content restricted for a policy reason. */
  | "policy"
  /** Outside the 24-hour customer service window. */
  | "window"
  /** The recipient opted out. */
  | "opt_out"
  /** Token, permission, phone-number or payment configuration on the tenant's account. */
  | "configuration"
  /** A malformed request — a defect on our side. */
  | "request"
  | "unknown";

export interface WhatsAppDeliveryReport {
  readonly category?: WhatsAppFailureCategory;
  /** `meta_<code>`, `http_<status>`, `network_error`, or a local reason. */
  readonly errorCode?: string;
  readonly outcome: WhatsAppDeliveryOutcome;
  /** The `wamid.` id Meta returns; the webhook reports status against it. */
  readonly providerReference?: string;
}

interface CodeRule {
  readonly category: WhatsAppFailureCategory;
  readonly retryable: boolean;
}

const retry = (category: WhatsAppFailureCategory): CodeRule => ({
  category,
  retryable: true,
});
const never = (category: WhatsAppFailureCategory): CodeRule => ({
  category,
  retryable: false,
});

/**
 * The classification table. Every row cites the meaning in Meta's reference
 * (URL above). A code absent from this table falls back to its HTTP status.
 */
export const whatsAppErrorCodeTable: Readonly<Record<number, CodeRule>> = {
  // Transient (HTTP 503/500): "Temporary error", "Service unavailable",
  // "Unknown send error", "Account in maintenance mode", "Server unavailable".
  2: retry("transient"),
  131000: retry("transient"),
  131016: retry("transient"),
  131057: retry("transient"),
  133004: retry("transient"),
  // Rate limits (HTTP 429): app call rate, WABA rate, Cloud API throughput,
  // and the per-recipient pair rate limit.
  4: retry("rate_limit"),
  80007: retry("rate_limit"),
  130429: retry("rate_limit"),
  131056: retry("rate_limit"),
  // Quality and engagement limits are also 429s, but retrying a message Meta
  // withheld to protect the account's quality rating makes the rating worse.
  // 131048 "spam rate limit hit", 131049 "ecosystem engagement" (Meta: do not
  // retry immediately), 131064 "template classification violation".
  131048: never("policy"),
  131049: never("policy"),
  131064: never("policy"),
  // Authentication and permission: expired/invalid token, missing permission,
  // deleted or unregistered business number, unpaid account, missing display
  // name. Retrying cannot fix any of these; the operator must.
  0: never("configuration"),
  3: never("configuration"),
  10: never("configuration"),
  33: never("configuration"),
  190: never("configuration"),
  131005: never("configuration"),
  131037: never("configuration"),
  131042: never("configuration"),
  131045: never("configuration"),
  // Policy: account restricted (368, 131031), country restriction (130497),
  // template content violates policy (132007).
  368: never("policy"),
  130497: never("policy"),
  131031: never("policy"),
  132007: never("policy"),
  // Recipient: undeliverable / not on WhatsApp / outdated client (131026),
  // sender equals recipient (131021), recipient not in the test allow-list
  // (131030), the business blocked this user (130403).
  130403: never("recipient"),
  131021: never("recipient"),
  131026: never("recipient"),
  131030: never("recipient"),
  // 24-hour window: "More than 24 hours have passed since the recipient last
  // replied". Only a template can be sent outside it; seeing this means a
  // non-template message was attempted, which this adapter never builds.
  131047: never("window"),
  // Opt-out: the recipient opted out of marketing messages.
  131050: never("opt_out"),
  // Template: parameter count mismatch (132000), does not exist or not
  // approved in this language (132001), translated text too long (132005),
  // parameter format invalid (132012), paused for low quality (132015),
  // permanently disabled (132016), parameter validation (132018).
  132000: never("template"),
  132001: never("template"),
  132005: never("template"),
  132012: never("template"),
  132015: never("template"),
  132016: never("template"),
  132018: never("template"),
  // Malformed request: invalid parameter (100), missing parameter (131008),
  // invalid parameter value (131009), unsupported message type (131051),
  // generic parameter error (135000).
  1: never("request"),
  100: never("request"),
  131008: never("request"),
  131009: never("request"),
  131051: never("request"),
  135000: never("request"),
};

/** Graph permission errors occupy the whole 200–299 range. */
function ruleForCode(code: number): CodeRule | undefined {
  const exact = whatsAppErrorCodeTable[code];
  if (exact !== undefined) return exact;
  if (code >= 200 && code <= 299) return never("configuration");
  return undefined;
}

function ruleForStatus(status: number): CodeRule {
  if (status === 429) return retry("rate_limit");
  if (status >= 500) return retry("transient");
  return never("unknown");
}

/** Reads `error.code` from a Graph error body without trusting its shape. */
export function readGraphErrorCode(body: unknown): number | null {
  if (typeof body !== "object" || body === null) return null;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "number" && Number.isInteger(code)) return code;
  if (typeof code === "string" && /^[0-9]{1,9}$/u.test(code)) return Number(code);
  return null;
}

/** Classifies a Meta error code, as seen in a send response or a `failed` status webhook. */
export function classifyWhatsAppErrorCode(
  code: number,
  httpStatus?: number,
): Required<Pick<WhatsAppDeliveryReport, "category" | "errorCode" | "outcome">> {
  const rule =
    ruleForCode(code) ??
    (httpStatus === undefined ? never("unknown") : ruleForStatus(httpStatus));
  return {
    category: rule.category,
    errorCode: `meta_${code}`,
    outcome: rule.retryable ? "retryable_error" : "permanent_error",
  };
}

/**
 * Classifies a completed HTTP exchange. A 2xx with a message id is accepted. A
 * 2xx without one may still have been sent, and the Cloud API has no
 * idempotency key, so retrying could message the customer twice; it is
 * recorded as a permanent failure instead (email for the same event is always
 * sent).
 */
export function classifyWhatsAppResponse(
  status: number,
  body: unknown,
): WhatsAppDeliveryReport {
  if (status >= 200 && status < 300) {
    const messages = (body as { messages?: unknown } | null)?.messages;
    const first = Array.isArray(messages) ? (messages[0] as unknown) : undefined;
    const id =
      typeof first === "object" && first !== null
        ? (first as { id?: unknown }).id
        : undefined;
    if (typeof id === "string" && id !== "") {
      return { outcome: "accepted", providerReference: id };
    }
    return {
      category: "unknown",
      errorCode: "invalid_response",
      outcome: "permanent_error",
    };
  }
  const code = readGraphErrorCode(body);
  if (code !== null) return classifyWhatsAppErrorCode(code, status);
  const rule = ruleForStatus(status);
  return {
    category: rule.category,
    errorCode: `http_${status}`,
    outcome: rule.retryable ? "retryable_error" : "permanent_error",
  };
}

/** A request that never got an answer — DNS, TLS, reset, timeout. */
export const whatsAppNetworkFailure: WhatsAppDeliveryReport = {
  category: "transient",
  errorCode: "network_error",
  outcome: "retryable_error",
};
