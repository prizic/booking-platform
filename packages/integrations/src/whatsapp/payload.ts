/**
 * WhatsApp notification channel (ADR-0018). Building the Cloud API request for
 * an approved template message.
 *
 * Only templates are ever sent. A free-form message is impossible to build with
 * this module: there is no function that accepts a body, only a template name,
 * a language and positional body parameters.
 *
 * Request shape: Meta, "Send message templates"
 * https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates
 * and the Messages API reference
 * https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 */

/**
 * Pinned Graph API version. v25.0 was released on 2026-02-18 and is available
 * until 2028-07-29 (https://developers.facebook.com/docs/graph-api/changelog).
 * Moving it is a reviewed change, never a runtime setting.
 */
export const whatsAppGraphApiVersion = "v25.0";
export const whatsAppGraphApiBase = `https://graph.facebook.com/${whatsAppGraphApiVersion}`;

/**
 * Customer-facing message types that may be sent over WhatsApp, and the body
 * parameters each approved template must declare, in `{{1}}`, `{{2}}`... order.
 *
 * The key set matches the `whatsapp_capable` rows of
 * `private.notification_type_catalog_v1()`. Deliberately absent:
 * - every staff message (staff alerts stay on email);
 * - `management.otp_requested`, `payment.*` and every `auth.*` message;
 * - every bearer link (`manageUrl`, `proposalUrl`): a management link is a
 *   credential (ADR-0004), and the email that is always sent for the same
 *   event already carries it. The templates point the customer to that email.
 *
 * `when` is composed from `startAt` and `timeZone`, `proposedWhen` from
 * `proposedStartAt` and `timeZone`; every other name is read verbatim from the
 * outbox payload, which the database has already localized.
 */
export const whatsAppTemplateParameters = {
  "booking.cancelled": ["brandName", "serviceName", "publicReference"],
  "booking.proposal_created": [
    "brandName",
    "serviceName",
    "proposedWhen",
    "publicReference",
  ],
  "booking.proposal_declined": ["brandName", "serviceName", "publicReference"],
  "booking.request_expired": ["brandName", "serviceName", "publicReference"],
  "booking.confirmed": [
    "brandName",
    "serviceName",
    "when",
    "locationName",
    "publicReference",
  ],
  "booking.rejected": ["brandName", "serviceName", "publicReference"],
  "booking.reminder": [
    "brandName",
    "serviceName",
    "when",
    "locationName",
    "publicReference",
  ],
  "booking.requested": ["brandName", "serviceName", "when", "publicReference"],
  "booking.rescheduled": ["brandName", "serviceName", "when", "publicReference"],
} as const satisfies Record<string, readonly string[]>;

export type WhatsAppTemplateKey = keyof typeof whatsAppTemplateParameters;

export const whatsAppTemplateKeys = Object.keys(
  whatsAppTemplateParameters,
).sort() as readonly WhatsAppTemplateKey[];

export function isWhatsAppTemplateKey(value: string): value is WhatsAppTemplateKey {
  return Object.hasOwn(whatsAppTemplateParameters, value);
}

/**
 * Upper bound for one body parameter, in Unicode code points. A template body
 * is limited to 1024 characters in total (Meta, template components:
 * https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/components),
 * so no single substituted value may be longer than that. Values are cut on a
 * code-point boundary so an Arabic letter or an emoji is never split.
 */
export const maxWhatsAppParameterLength = 1024;

export class WhatsAppPayloadError extends Error {
  constructor(
    readonly code:
      | "invalid_language"
      | "invalid_parameter"
      | "invalid_phone_number_id"
      | "invalid_recipient"
      | "invalid_template_name"
      | "missing_parameter"
      | "unsupported_template",
  ) {
    super(code);
    this.name = "WhatsAppPayloadError";
  }
}

/**
 * E.164 (`+` and 8–15 digits, no leading zero) to the digits-only form the
 * Cloud API `to` field takes. Anything else is refused rather than repaired:
 * guessing a country code would message a stranger.
 */
export function toWhatsAppRecipient(e164: string): string {
  if (!/^\+[1-9][0-9]{7,14}$/u.test(e164)) {
    throw new WhatsAppPayloadError("invalid_recipient");
  }
  return e164.slice(1);
}

/**
 * Meta refuses a text parameter that contains a newline, a tab, or more than
 * four consecutive spaces (error 132018 / 100). Normalizing here turns a
 * permanent provider refusal into a delivered message. JSON escaping of quotes,
 * backslashes and non-Latin text is left to `JSON.stringify`; WhatsApp performs
 * no markup interpretation of the parameter beyond its own `*bold*` style
 * formatting, which a booking value cannot meaningfully trigger.
 */
export function normalizeWhatsAppParameter(value: string): string {
  const flattened = value
    .replace(/[\r\n\t\v\f\p{Zl}\p{Zp}]+/gu, " ")
    .replace(/ {5,}/gu, "    ")
    .trim();
  const codePoints = [...flattened];
  if (codePoints.length <= maxWhatsAppParameterLength) return flattened;
  return `${codePoints.slice(0, maxWhatsAppParameterLength - 1).join("")}…`;
}

export interface WhatsAppTemplateMessage {
  readonly messaging_product: "whatsapp";
  readonly recipient_type: "individual";
  readonly template: {
    readonly components: readonly [
      {
        readonly parameters: readonly {
          readonly text: string;
          readonly type: "text";
        }[];
        readonly type: "body";
      },
    ];
    readonly language: { readonly code: string };
    readonly name: string;
  };
  readonly to: string;
  readonly type: "template";
}

export interface BuildTemplateMessageInput {
  /** Meta language code of the approved template, e.g. `ar` or `en_US`. */
  readonly languageCode: string;
  /** Already-localized values, keyed by the outbox payload's variable names. */
  readonly variables: Readonly<Record<string, string>>;
  readonly recipientE164: string;
  readonly templateKey: string;
  /** The tenant's approved template name for this message type. */
  readonly templateName: string;
}

function resolveVariable(
  name: string,
  variables: Readonly<Record<string, string>>,
): string | undefined {
  const composedFrom: Readonly<Record<string, string>> = {
    proposedWhen: "proposedStartAt",
    when: "startAt",
  };
  const source = composedFrom[name];
  if (source === undefined) return variables[name];
  const startAt = variables[source];
  if (startAt === undefined || startAt.trim() === "") return undefined;
  const timeZone = variables["timeZone"];
  return timeZone === undefined || timeZone.trim() === ""
    ? startAt
    : `${startAt} (${timeZone})`;
}

/**
 * The exact JSON body for `POST /<phone-number-id>/messages`. Throws a
 * `WhatsAppPayloadError` for anything that can never succeed, which the caller
 * records as a permanent failure.
 */
export function buildWhatsAppTemplateMessage(
  input: BuildTemplateMessageInput,
): WhatsAppTemplateMessage {
  if (!isWhatsAppTemplateKey(input.templateKey)) {
    throw new WhatsAppPayloadError("unsupported_template");
  }
  // Template names are lowercase letters, digits and underscores (Meta,
  // template creation), at most 512 characters.
  if (!/^[a-z0-9_]{1,512}$/u.test(input.templateName)) {
    throw new WhatsAppPayloadError("invalid_template_name");
  }
  // `ar`, `en`, `en_US`, `pt_BR`, `zh_CN`...
  if (!/^[a-z]{2,3}(?:_[A-Z]{2})?$/u.test(input.languageCode)) {
    throw new WhatsAppPayloadError("invalid_language");
  }
  const to = toWhatsAppRecipient(input.recipientE164);

  const parameters = whatsAppTemplateParameters[input.templateKey].map((name) => {
    const raw = resolveVariable(name, input.variables);
    if (raw === undefined) throw new WhatsAppPayloadError("missing_parameter");
    const text = normalizeWhatsAppParameter(raw);
    // An empty parameter is refused by Meta; an approved template never has an
    // optional slot, so a blank value is a defect upstream, not something to
    // paper over with a placeholder in a customer's chat.
    if (text === "") throw new WhatsAppPayloadError("missing_parameter");
    return { text, type: "text" as const };
  });

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    template: {
      components: [{ parameters, type: "body" }],
      language: { code: input.languageCode },
      name: input.templateName,
    },
    to,
    type: "template",
  };
}

/** The endpoint for one business phone number. */
export function whatsAppMessagesUrl(phoneNumberId: string): string {
  // Phone number ids are numeric Graph object ids. Refusing anything else keeps
  // a configured value from rewriting the request path.
  if (!/^[0-9]{5,32}$/u.test(phoneNumberId)) {
    throw new WhatsAppPayloadError("invalid_phone_number_id");
  }
  return `${whatsAppGraphApiBase}/${phoneNumberId}/messages`;
}
