import { describe, it, expect } from "vitest";
import type { TenantConfigurationV1 } from "../../_lib/dashboard-access";
import { SettingsFieldError, mergeSettings } from "./settings-document";
import { settingsSchema, type SettingsInput } from "./settings-schema";

const base: TenantConfigurationV1 = {
  cacheTag: "test",
  configVersion: 1,
  featureVersion: 1,
  revision: 1,
  defaultLocale: "en",
  entitlements: { payments: false },
  featureConfiguration: { payments: { enabled: false } },
  settings: { advanced: { keep: true }, taxRateBps: 100 },
  navigation: { extra: { keep: true }, items: [] },
};

function input(overrides: Partial<SettingsInput> = {}): SettingsInput {
  return {
    locale: "en",
    expectedRevision: "1",
    defaultLocale: "en",
    replyToEmail: "",
    currency: "USD",
    taxRateBps: "100",
    bookingHorizonDays: "",
    navigation: [],
    features: [],
    ...overrides,
  };
}

function issues(values: SettingsInput) {
  const parsed = settingsSchema.safeParse(values);
  return parsed.success
    ? []
    : parsed.error.issues.map((issue) => `${issue.path.join(".")}:${issue.message}`);
}

describe("lossless settings", () => {
  it("preserves unrepresented content and refuses entitlement escalation", () => {
    const values = settingsSchema.parse(
      input({ taxRateBps: "200", features: [{ key: "payments", enabled: true }] }),
    );
    const result = mergeSettings(base, values);
    expect(result.settings.advanced).toEqual({ keep: true });
    expect(result.settings.taxRateBps).toBe(200);
    expect(result.navigation.extra).toEqual({ keep: true });
    expect(result.featureConfiguration.payments).toEqual({ enabled: false });
  });
  it("refuses invalid bounds and missing translations", () => {
    expect(issues(input({ taxRateBps: "3001" }))).toContain("taxRateBps:too_large");
    expect(issues(input({ bookingHorizonDays: "0" }))).toContain(
      "bookingHorizonDays:too_small",
    );
    expect(
      issues(
        input({
          navigation: [{ rowKey: "new", en: "Book", ar: "", destination: "/book" }],
        }),
      ),
    ).toContain("navigation.0.ar:required");
  });
  it("clears empty preferences and refuses unsafe navigation targets", () => {
    const result = mergeSettings(base, settingsSchema.parse(input({ taxRateBps: "" })));
    expect(result.settings).not.toHaveProperty("taxRateBps");
    for (const destination of [
      "javascript:alert(1)",
      "http://example.com",
      "https://example.com/<x>",
      "/admin",
    ])
      expect(
        issues(input({ navigation: [{ rowKey: "r", en: "A", ar: "ب", destination }] })),
      ).toContain("navigation.0.destination:settings_destination_invalid");
    expect(issues(input({ replyToEmail: "not-an-email" }))).toContain(
      "replyToEmail:invalid_email",
    );
  });
  it("keeps a stored non-USD currency but refuses switching to another", () => {
    expect(() =>
      mergeSettings(base, settingsSchema.parse(input({ currency: "EUR" }))),
    ).toThrow(SettingsFieldError);
    const euro = { ...base, settings: { ...base.settings, currency: "EUR" } };
    expect(
      mergeSettings(euro, settingsSchema.parse(input({ currency: "EUR" }))).settings
        .currency,
    ).toBe("EUR");
  });
});
