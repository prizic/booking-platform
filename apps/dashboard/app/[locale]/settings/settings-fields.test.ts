import { describe, it, expect } from "vitest";
import { mergeSettingsFields } from "./settings-fields";
import type { TenantConfigurationV1 } from "../../_lib/dashboard-access";
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
describe("lossless settings", () => {
  it("preserves unrepresented content and refuses entitlement escalation", () => {
    const f = new FormData();
    f.set("navigationCount", "0");
    f.set("taxRateBps", "200");
    f.set("feature-payments", "yes");
    const result = mergeSettingsFields(base, f);
    expect(result.settings.advanced).toEqual({ keep: true });
    expect(result.settings.taxRateBps).toBe(200);
    expect(result.navigation.extra).toEqual({ keep: true });
    expect(result.featureConfiguration.payments).toEqual({ enabled: false });
  });
  it("refuses invalid bounds and missing translations", () => {
    const f = new FormData();
    f.set("navigationCount", "0");
    f.set("taxRateBps", "3001");
    expect(() => mergeSettingsFields(base, f)).toThrow("taxRateBps");
    f.delete("taxRateBps");
    f.set("navigationCount", "1");
    f.set("nav-0-en", "Book");
    f.set("nav-0-destination", "/book");
    expect(() => mergeSettingsFields(base, f)).toThrow("navigation");
  });
});
