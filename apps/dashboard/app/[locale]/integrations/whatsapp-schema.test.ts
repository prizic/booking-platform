import { describe, expect, it } from "vitest";

import {
  isOwnWhatsAppTokenReference,
  whatsAppTokenReferenceFor,
} from "../../_lib/notification-access";
import { whatsAppCapableKeys, whatsAppConfigSchema } from "./whatsapp-schema";

const tenantId = "0a3f2b64-0000-4000-8000-000000000001";
const own = "env:WHATSAPP_TOKEN_0A3F2B64000040008000000000000001";
const valid = {
  locale: "en",
  requestId: "0a3f2b64-0000-4000-8000-0000000000aa",
  expectedRevision: 0,
  enabled: false,
  phoneNumberId: "",
  businessAccountId: "",
  accessTokenSecretRef: "",
  tokenConfigured: false,
  templates: whatsAppCapableKeys.map((templateKey) => ({
    templateKey,
    name: "",
    language: "",
  })),
};
const issues = (input: unknown) => {
  const parsed = whatsAppConfigSchema.safeParse(input);
  return parsed.success
    ? []
    : parsed.error.issues.map((issue) => `${issue.path.join(".")}:${issue.message}`);
};
const withTemplate = (index: number, name: string, language: string) =>
  valid.templates.map((row, at) => (at === index ? { ...row, name, language } : row));

describe("WhatsApp configuration schema", () => {
  it("accepts an empty, disabled channel", () => {
    expect(issues(valid)).toEqual([]);
  });

  it("checks Meta ids, the token reference and template names like the database", () => {
    expect(issues({ ...valid, phoneNumberId: "12a45" })).toEqual([
      "phoneNumberId:wa_id_invalid",
    ]);
    expect(issues({ ...valid, businessAccountId: "1234" })).toEqual([
      "businessAccountId:wa_id_invalid",
    ]);
    for (const reference of ["EAAG-real-token", "env:OTHER_CHANNEL_TOKEN", "vault:abc"])
      expect(issues({ ...valid, accessTokenSecretRef: reference }), reference).toEqual([
        "accessTokenSecretRef:wa_secret_ref_invalid",
      ]);
    expect(issues({ ...valid, accessTokenSecretRef: `${own}_R2` })).toEqual([]);
    expect(
      issues({
        ...valid,
        accessTokenSecretRef: "vault:0a3f2b64-0000-4000-8000-000000000009",
      }),
    ).toEqual([]);
    expect(
      issues({ ...valid, templates: withTemplate(0, "Booking Confirmed", "en_US") }),
    ).toEqual(["templates.0.name:wa_template_name_invalid"]);
    expect(
      issues({
        ...valid,
        templates: withTemplate(0, "booking_confirmed_v1", "english"),
      }),
    ).toEqual(["templates.0.language:wa_template_language_invalid"]);
    expect(
      issues({ ...valid, templates: withTemplate(0, "booking_confirmed_v1", "en_US") }),
    ).toEqual([]);
  });

  it("needs a template name and its language together", () => {
    expect(
      issues({ ...valid, templates: withTemplate(1, "booking_requested_v1", "") }),
    ).toEqual(["templates.1.language:wa_template_incomplete"]);
    expect(issues({ ...valid, templates: withTemplate(1, "", "ar") })).toEqual([
      "templates.1.name:wa_template_incomplete",
    ]);
  });

  it("refuses to turn the channel on without both ids and a token reference", () => {
    const complete = {
      ...valid,
      enabled: true,
      phoneNumberId: "106540352242922",
      businessAccountId: "102290129340398",
    };
    expect(issues(complete)).toEqual(["enabled:wa_enable_incomplete"]);
    expect(issues({ ...complete, tokenConfigured: true })).toEqual([]);
    expect(issues({ ...complete, accessTokenSecretRef: own })).toEqual([]);
    expect(issues({ ...complete, tokenConfigured: true, phoneNumberId: "" })).toEqual([
      "enabled:wa_enable_incomplete",
    ]);
  });

  it("accepts only the tenant's own env reference (any vault id)", () => {
    expect(whatsAppTokenReferenceFor(tenantId)).toBe(own);
    expect(isOwnWhatsAppTokenReference(own, tenantId)).toBe(true);
    expect(isOwnWhatsAppTokenReference(`${own}_R2`, tenantId)).toBe(true);
    expect(
      isOwnWhatsAppTokenReference(
        "env:WHATSAPP_TOKEN_FFFFFFFF000040008000000000000002",
        tenantId,
      ),
    ).toBe(false);
    expect(isOwnWhatsAppTokenReference(`${own}_SUFFIXLONGERTHAN16`, tenantId)).toBe(
      false,
    );
    expect(
      isOwnWhatsAppTokenReference(
        "vault:0a3f2b64-0000-4000-8000-000000000009",
        tenantId,
      ),
    ).toBe(true);
  });
});
