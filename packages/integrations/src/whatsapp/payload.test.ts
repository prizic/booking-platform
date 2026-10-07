import { describe, expect, it } from "vitest";

import {
  buildWhatsAppTemplateMessage,
  maxWhatsAppParameterLength,
  normalizeWhatsAppParameter,
  toWhatsAppRecipient,
  whatsAppMessagesUrl,
  WhatsAppPayloadError,
  whatsAppTemplateKeys,
  whatsAppTemplateParameters,
} from "./payload.js";

const arabicVariables = {
  brandName: "عيادة النخبة",
  locationName: "فرع الرياض — حي الملقا",
  publicReference: "BK-7Q2M",
  serviceName: "استشارة جلدية",
  startAt: "الأحد ١٢ أكتوبر ٢٠٢٦، ٤:٣٠ م",
  timeZone: "Asia/Riyadh",
};

describe("toWhatsAppRecipient", () => {
  it("strips the plus from a valid E.164 number", () => {
    expect(toWhatsAppRecipient("+966501234567")).toBe("966501234567");
  });

  it.each([
    "966501234567",
    "+0966501234567",
    "+9665",
    "+96650123456789012",
    "+9665012345a7",
    "",
  ])("refuses %j rather than guessing", (value) => {
    expect(() => toWhatsAppRecipient(value)).toThrow(WhatsAppPayloadError);
  });
});

describe("buildWhatsAppTemplateMessage", () => {
  it("builds the documented template payload with Arabic parameters in order", () => {
    const message = buildWhatsAppTemplateMessage({
      languageCode: "ar",
      recipientE164: "+966501234567",
      templateKey: "booking.confirmed",
      templateName: "booking_confirmed_v1",
      variables: arabicVariables,
    });
    expect(message).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      template: {
        components: [
          {
            parameters: [
              { text: "عيادة النخبة", type: "text" },
              { text: "استشارة جلدية", type: "text" },
              { text: "الأحد ١٢ أكتوبر ٢٠٢٦، ٤:٣٠ م (Asia/Riyadh)", type: "text" },
              { text: "فرع الرياض — حي الملقا", type: "text" },
              { text: "BK-7Q2M", type: "text" },
            ],
            type: "body",
          },
        ],
        language: { code: "ar" },
        name: "booking_confirmed_v1",
      },
      to: "966501234567",
      type: "template",
    });
    // Arabic survives serialization byte for byte.
    const roundTripped = JSON.parse(JSON.stringify(message)) as typeof message;
    expect(roundTripped.template.components[0].parameters[1]?.text).toBe(
      "استشارة جلدية",
    );
  });

  it("never carries a bearer management link", () => {
    for (const key of whatsAppTemplateKeys) {
      expect(whatsAppTemplateParameters[key]).not.toContain("manageUrl");
      expect(whatsAppTemplateParameters[key]).not.toContain("proposalUrl");
    }
  });

  it("keeps quotes, backslashes and template-looking text as literal values", () => {
    const message = buildWhatsAppTemplateMessage({
      languageCode: "en_US",
      recipientE164: "+447700900123",
      templateKey: "booking.cancelled",
      templateName: "booking_cancelled",
      variables: {
        brandName: 'O\'Brien "Studio" \\ {{1}}',
        publicReference: "BK-1",
        serviceName: "<b>Cut</b> 💇",
      },
    });
    const json = JSON.stringify(message);
    const parsed = JSON.parse(json) as typeof message;
    expect(parsed.template.components[0].parameters.map((p) => p.text)).toEqual([
      'O\'Brien "Studio" \\ {{1}}',
      "<b>Cut</b> 💇",
      "BK-1",
    ]);
  });

  it("omits the time zone suffix when there is none", () => {
    const message = buildWhatsAppTemplateMessage({
      languageCode: "en",
      recipientE164: "+966501234567",
      templateKey: "booking.requested",
      templateName: "booking_requested",
      variables: { ...arabicVariables, timeZone: "" },
    });
    expect(message.template.components[0].parameters[2]?.text).toBe(
      arabicVariables.startAt,
    );
  });

  it.each([
    [{ templateKey: "staff.request_pending" }, "unsupported_template"],
    [{ templateKey: "management.otp_requested" }, "unsupported_template"],
    [{ templateName: "Booking Confirmed" }, "invalid_template_name"],
    [{ languageCode: "arabic" }, "invalid_language"],
    [{ recipientE164: "0501234567" }, "invalid_recipient"],
    [{ variables: { ...arabicVariables, locationName: "" } }, "missing_parameter"],
    [{ variables: { ...arabicVariables, serviceName: " \n\t " } }, "missing_parameter"],
    [
      { variables: { brandName: "x", publicReference: "y", serviceName: "z" } },
      "missing_parameter",
    ],
  ] as const)("refuses %j with %s", (override, code) => {
    let caught: unknown;
    try {
      buildWhatsAppTemplateMessage({
        languageCode: "ar",
        recipientE164: "+966501234567",
        templateKey: "booking.reminder",
        templateName: "booking_reminder",
        variables: arabicVariables,
        ...override,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WhatsAppPayloadError);
    expect((caught as WhatsAppPayloadError).code).toBe(code);
  });
});

describe("normalizeWhatsAppParameter", () => {
  it("flattens newlines and tabs and caps runs of spaces at four", () => {
    const lineSeparator = String.fromCodePoint(0x2028);
    expect(normalizeWhatsAppParameter(`  a\r\nb\tc      d${lineSeparator}e `)).toBe(
      "a b c    d e",
    );
  });

  it("cuts an over-long value on a code-point boundary", () => {
    const long = "ك😀".repeat(maxWhatsAppParameterLength);
    const result = normalizeWhatsAppParameter(long);
    const codePoints = [...result];
    expect(codePoints).toHaveLength(maxWhatsAppParameterLength);
    expect(codePoints.at(-1)).toBe("…");
    // No lone surrogate was produced by the cut.
    // No lone surrogate was produced by the cut; encodeURIComponent throws on one.
    expect(() => encodeURIComponent(result)).not.toThrow();
  });

  it("leaves a value at the limit untouched", () => {
    const exact = "ب".repeat(maxWhatsAppParameterLength);
    expect(normalizeWhatsAppParameter(exact)).toBe(exact);
  });
});

describe("whatsAppMessagesUrl", () => {
  it("pins the Graph API version and the phone number id", () => {
    expect(whatsAppMessagesUrl("106540352242922")).toBe(
      "https://graph.facebook.com/v25.0/106540352242922/messages",
    );
  });

  it.each(["", "abc", "123/../../me", "12345?x=1"])("refuses %j as a path", (value) => {
    expect(() => whatsAppMessagesUrl(value)).toThrow(WhatsAppPayloadError);
  });
});

describe("proposal templates", () => {
  it("composes the proposed time and never includes the proposal link", () => {
    const message = buildWhatsAppTemplateMessage({
      languageCode: "ar",
      recipientE164: "+966501234567",
      templateKey: "booking.proposal_created",
      templateName: "booking_proposal_created",
      variables: {
        ...arabicVariables,
        proposalUrl: "https://book.example.invalid/ar/manage/secret",
        proposedStartAt: "الاثنين ١٣ أكتوبر، ٥:٠٠ م",
      },
    });
    const texts = message.template.components[0].parameters.map((p) => p.text);
    expect(texts).toEqual([
      "عيادة النخبة",
      "استشارة جلدية",
      "الاثنين ١٣ أكتوبر، ٥:٠٠ م (Asia/Riyadh)",
      "BK-7Q2M",
    ]);
    expect(JSON.stringify(message)).not.toContain("example.invalid");
  });
});
