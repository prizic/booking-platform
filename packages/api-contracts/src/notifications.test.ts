import { describe, expect, it } from "vitest";

import {
  buildEnqueueTestNotificationV1Request,
  buildSaveMyNotificationPreferencesV1Request,
  buildSaveNotificationSettingsV1Request,
  buildSaveWhatsAppConfigV1Request,
  buildWhatsAppOptInV1,
  isValidReminderOffsetsV1,
  parseMyNotificationPreferencesV1,
  parseNotificationBrandV2,
  parseNotificationMutationV1,
  parseNotificationSettingsV1,
  parsePublicWhatsAppAvailabilityV1,
  parseStaffNotificationPreferencesV1,
  parseTestNotificationV1,
  parseWhatsAppConfigV1,
} from "./index.js";

const tenant = "a0000000-0000-0000-0000-000000000001";
const request = "c0000000-0000-0000-0000-0000000000a1";
const membership = "a3000000-0000-0000-0000-000000000002";

const settings = {
  version: 1,
  tenant_id: tenant,
  revision: 0,
  reminder_offsets_minutes: [1440, 120],
  whatsapp_entitled: false,
  whatsapp_configured: false,
  whatsapp_enabled: false,
  whatsapp_available: false,
  items: [
    {
      template_key: "booking.confirmed",
      audience: "customer",
      email_enabled: true,
      whatsapp_enabled: true,
      whatsapp_capable: true,
      editable: false,
    },
    {
      template_key: "staff.daily_digest",
      audience: "staff",
      email_enabled: true,
      whatsapp_enabled: false,
      whatsapp_capable: false,
      editable: true,
    },
  ],
};

describe("notification settings v1", () => {
  it("parses the settings document", () => {
    const parsed = parseNotificationSettingsV1(settings);
    expect(parsed.revision).toBe(0);
    expect(parsed.reminderOffsetsMinutes).toEqual([1440, 120]);
    expect(parsed.items[0]).toEqual({
      templateKey: "booking.confirmed",
      audience: "customer",
      emailEnabled: true,
      whatsappEnabled: true,
      whatsappCapable: true,
      editable: false,
    });
  });

  it("refuses an unknown version, type or audience", () => {
    expect(() => parseNotificationSettingsV1({ ...settings, version: 2 })).toThrow();
    expect(() =>
      parseNotificationSettingsV1({
        ...settings,
        items: [{ ...settings.items[0], template_key: "no.such" }],
      }),
    ).toThrow();
    expect(() =>
      parseNotificationSettingsV1({
        ...settings,
        items: [{ ...settings.items[0], audience: "everyone" }],
      }),
    ).toThrow();
    expect(() =>
      parseNotificationSettingsV1({ ...settings, reminder_offsets_minutes: [5] }),
    ).toThrow();
  });

  it("validates reminder lead times as the database does", () => {
    expect(isValidReminderOffsetsV1([1440, 120])).toBe(true);
    expect(isValidReminderOffsetsV1([])).toBe(false);
    expect(isValidReminderOffsetsV1([14])).toBe(false);
    expect(isValidReminderOffsetsV1([10081])).toBe(false);
    expect(isValidReminderOffsetsV1([60, 60])).toBe(false);
    expect(isValidReminderOffsetsV1([15, 30, 60, 120, 240])).toBe(false);
  });

  it("builds the save request with only the fields that were set", () => {
    expect(
      buildSaveNotificationSettingsV1Request({
        tenantId: tenant,
        settings: [{ templateKey: "booking.rescheduled", emailEnabled: false }],
        reminderOffsetsMinutes: [2880, 60],
        expectedRevision: 0,
        requestId: request,
      }),
    ).toEqual({
      p_tenant_id: tenant,
      p_settings: [{ template_key: "booking.rescheduled", email_enabled: false }],
      p_reminder_offsets: [2880, 60],
      p_expected_revision: 0,
      p_request_id: request,
    });
    expect(() =>
      buildSaveNotificationSettingsV1Request({
        tenantId: tenant,
        settings: [],
        reminderOffsetsMinutes: [1],
        expectedRevision: 0,
        requestId: request,
      }),
    ).toThrow();
  });

  it("parses every save result", () => {
    expect(
      parseNotificationMutationV1({ version: 1, revision: 3, replayed: true }),
    ).toEqual({
      revision: 3,
      replayed: true,
    });
    expect(() =>
      parseNotificationMutationV1({ version: 1, revision: 0, replayed: false }),
    ).toThrow();
  });
});

describe("staff notification preferences v1", () => {
  it("parses a member's own preferences", () => {
    expect(
      parseMyNotificationPreferencesV1({
        version: 1,
        tenant_id: tenant,
        membership_id: membership,
        revision: 0,
        digest_local_time: "07:30",
        digest_time_zone: "Asia/Riyadh",
        items: [
          { template_key: "staff.daily_digest", enabled: false, tenant_enabled: true },
        ],
      }),
    ).toEqual({
      tenantId: tenant,
      membershipId: membership,
      revision: 0,
      digestLocalTime: "07:30",
      digestTimeZone: "Asia/Riyadh",
      items: [
        { templateKey: "staff.daily_digest", enabled: false, tenantEnabled: true },
      ],
    });
  });

  it("refuses a customer type as a staff preference", () => {
    expect(() =>
      parseMyNotificationPreferencesV1({
        version: 1,
        tenant_id: tenant,
        membership_id: membership,
        revision: 0,
        digest_local_time: "07:30",
        digest_time_zone: "UTC",
        items: [
          { template_key: "booking.confirmed", enabled: true, tenant_enabled: true },
        ],
      }),
    ).toThrow();
  });

  it("builds the save request and refuses an impossible time", () => {
    expect(
      buildSaveMyNotificationPreferencesV1Request({
        tenantId: tenant,
        preferences: { "staff.daily_digest": true },
        digestLocalTime: "06:15",
        requestId: request,
      }),
    ).toEqual({
      p_tenant_id: tenant,
      p_preferences: { "staff.daily_digest": true, digest_local_time: "06:15" },
      p_request_id: request,
    });
    expect(() =>
      buildSaveMyNotificationPreferencesV1Request({
        tenantId: tenant,
        preferences: {},
        digestLocalTime: "25:00",
        requestId: request,
      }),
    ).toThrow();
  });

  it("parses the team view", () => {
    const parsed = parseStaffNotificationPreferencesV1({
      version: 1,
      tenant_id: tenant,
      members: [
        {
          membership_id: membership,
          name: "Admin",
          digest_local_time: "07:30",
          items: [{ template_key: "staff.request_pending", enabled: true }],
        },
      ],
    });
    expect(parsed.members[0]?.items[0]).toEqual({
      templateKey: "staff.request_pending",
      enabled: true,
    });
  });
});

describe("test send v1", () => {
  it("builds the request and parses the result", () => {
    expect(
      buildEnqueueTestNotificationV1Request({
        tenantId: tenant,
        templateKey: "booking.reminder",
        locale: "ar",
        requestId: request,
      }),
    ).toEqual({
      p_tenant_id: tenant,
      p_template_key: "booking.reminder",
      p_locale: "ar",
      p_request_id: request,
    });
    expect(
      parseTestNotificationV1({
        version: 1,
        message_id: request,
        status: "queued",
        replayed: false,
      }),
    ).toEqual({ messageId: request, status: "queued", replayed: false });
    expect(() =>
      parseTestNotificationV1({
        version: 1,
        message_id: request,
        status: "sent",
        replayed: false,
      }),
    ).toThrow();
  });
});

describe("notification brand v2", () => {
  const row = {
    name_en: "Tenant A Salon",
    name_ar: "صالون المستأجر أ",
    logo_url: "https://client.tenant-a.example.invalid/assets/logo-light.png",
    icon_url: null,
    primary_color: "#106b5a",
    on_primary_color: "#ffffff",
    client_origin: "https://client.tenant-a.example.invalid",
    dashboard_origin: null,
    default_locale: "ar",
    support_email: "hello@tenant-a.example.invalid",
  };

  it("accepts the row or PostgREST's one-row array", () => {
    expect(parseNotificationBrandV2(row).nameAr).toBe("صالون المستأجر أ");
    expect(parseNotificationBrandV2([row]).primaryColor).toBe("#106b5a");
  });

  it("refuses a non-https asset or a malformed colour", () => {
    expect(() =>
      parseNotificationBrandV2({ ...row, logo_url: "http://x.example/a.png" }),
    ).toThrow();
    expect(() => parseNotificationBrandV2({ ...row, primary_color: "red" })).toThrow();
    expect(() => parseNotificationBrandV2([])).toThrow();
  });
});

describe("whatsapp v1", () => {
  const config = {
    version: 1,
    tenant_id: tenant,
    revision: 1,
    entitled: true,
    configured: true,
    enabled: false,
    available: false,
    phone_number_id: "1234567890",
    business_account_id: "9876543210",
    access_token_configured: true,
    template_map: {
      "booking.confirmed": { name: "booking_confirmed_v1", language: "ar" },
    },
  };

  it("parses the configuration without any secret reference", () => {
    const parsed = parseWhatsAppConfigV1(config);
    expect(parsed.accessTokenConfigured).toBe(true);
    expect(parsed.templateMap["booking.confirmed"]).toEqual({
      name: "booking_confirmed_v1",
      language: "ar",
    });
    expect(() =>
      parseWhatsAppConfigV1({
        ...config,
        access_token_secret_ref: "env:WHATSAPP_TOKEN_X",
      }),
    ).toThrow();
  });

  it("builds the save request with a reference, never a token", () => {
    const base = {
      tenantId: tenant,
      enabled: true,
      phoneNumberId: "1234567890",
      businessAccountId: "9876543210",
      templateMap: {},
      expectedRevision: 1,
      requestId: request,
    };
    expect(
      buildSaveWhatsAppConfigV1Request({
        ...base,
        accessTokenSecretRef: "env:WHATSAPP_TOKEN_A0000000000000000000000000000001",
      }).p_config.access_token_secret_ref,
    ).toBe("env:WHATSAPP_TOKEN_A0000000000000000000000000000001");
    expect(
      "access_token_secret_ref" in buildSaveWhatsAppConfigV1Request(base).p_config,
    ).toBe(false);
    expect(() =>
      buildSaveWhatsAppConfigV1Request({
        ...base,
        accessTokenSecretRef: "EAAGm0PX4ZCpsBA",
      }),
    ).toThrow();
    expect(() =>
      buildSaveWhatsAppConfigV1Request({ ...base, phoneNumberId: "+9665" }),
    ).toThrow();
  });

  it("parses public availability", () => {
    expect(
      parsePublicWhatsAppAvailabilityV1({ version: 1, whatsapp_available: true }),
    ).toEqual({
      whatsappAvailable: true,
    });
  });

  it("validates the booking opt-in as E.164", () => {
    expect(
      buildWhatsAppOptInV1({
        phoneE164: "+966501234567",
        consentText: " Send me updates. ",
        consentVersion: "1",
      }),
    ).toEqual({
      phoneE164: "+966501234567",
      consentText: "Send me updates.",
      consentVersion: "1",
    });
    expect(() =>
      buildWhatsAppOptInV1({
        phoneE164: "0501234567",
        consentText: "x",
        consentVersion: "1",
      }),
    ).toThrow();
    expect(() =>
      buildWhatsAppOptInV1({
        phoneE164: "+966501234567",
        consentText: " ",
        consentVersion: "1",
      }),
    ).toThrow();
  });
});
