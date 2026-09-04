import { describe, expect, it } from "vitest";

import {
  createContentSecurityPolicy,
  parseInstanceManifest,
  parsePlatformContract,
  parsePublicRuntimeConfig,
} from "./index.js";

describe("configuration validation", () => {
  it("accepts the exact platform contract shape", () => {
    expect(
      parsePlatformContract({
        whiteLabelVersion: "0.1.0",
        configSchemaVersion: 1,
        backendContract: { min: 1, max: 1 },
      }),
    ).toEqual({
      whiteLabelVersion: "0.1.0",
      configSchemaVersion: 1,
      backendContract: { min: 1, max: 1 },
    });
  });

  it("fails closed when extra contract keys appear", () => {
    expect(() =>
      parsePlatformContract({
        whiteLabelVersion: "0.1.0",
        configSchemaVersion: 1,
        backendContract: { min: 1, max: 1 },
        extra: true,
      }),
    ).toThrow("exactly three keys");
  });

  it("accepts only public runtime configuration", () => {
    expect(
      parsePublicRuntimeConfig({
        environment: "test",
        supabaseUrl: "http://127.0.0.1:54321",
        supabasePublishableKey: "local-public-value",
      }),
    ).toEqual({
      environment: "test",
      supabaseUrl: "http://127.0.0.1:54321",
      supabasePublishableKey: "local-public-value",
    });
  });

  it("accepts the committed instance manifest contract", () => {
    expect(
      parseInstanceManifest({
        tenantId: "tenant-template",
        instanceId: "instance-template",
        whiteLabelVersion: "0.1.0",
        configSchemaVersion: 1,
        backendContract: { min: 1, max: 1 },
        defaultLocale: "en",
        supportedLocales: ["en", "ar"],
      }),
    ).toEqual({
      tenantId: "tenant-template",
      instanceId: "instance-template",
      whiteLabelVersion: "0.1.0",
      configSchemaVersion: 1,
      backendContract: { min: 1, max: 1 },
      defaultLocale: "en",
      supportedLocales: ["en", "ar"],
    });
  });

  it("builds a nonce-bound content security policy", () => {
    const policy = createContentSecurityPolicy("dGVzdC1ub25jZS0xMjM0NQ==", {
      connectSources: ["https://booking-api.example.com/path"],
      development: true,
    });

    expect(policy).toContain("script-src 'self' 'nonce-dGVzdC1ub25jZS0xMjM0NQ=='");
    expect(policy).toContain("'unsafe-eval'");
    expect(policy).toContain(
      "connect-src 'self' https://booking-api.example.com wss://booking-api.example.com",
    );
    expect(policy).toContain("frame-ancestors 'none'");
    expect(() => createContentSecurityPolicy("unsafe nonce")).toThrow("nonce");
  });
});
