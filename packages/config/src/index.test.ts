import { describe, expect, it } from "vitest";

import {
  createContentSecurityPolicy,
  createPublicReleaseIdentity,
  parseInstanceManifest,
  parsePlatformContract,
  parsePublicRuntimeConfig,
  parsePublicSiteOrigin,
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

  it("normalizes a configured public site origin and permits local HTTP", () => {
    expect(
      parsePublicSiteOrigin("https://booking.example.com", "http://localhost:3000"),
    ).toEqual(new URL("https://booking.example.com/"));
    expect(parsePublicSiteOrigin("", "http://localhost:3000")).toEqual(
      new URL("http://localhost:3000/"),
    );
  });

  it("rejects unsafe or non-origin public site URLs", () => {
    for (const value of [
      "http://booking.example.com",
      "https://user@booking.example.com",
      "https://booking.example.com/path",
      "https://booking.example.com/?query=1",
      "https://booking.example.com/#fragment",
      "not a URL",
    ]) {
      expect(() => parsePublicSiteOrigin(value, "http://localhost:3000")).toThrow(
        /Public site URL/u,
      );
    }
    expect(() => parsePublicSiteOrigin(undefined)).toThrow(
      "Public site URL is required",
    );
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

  it("builds a safe release identity from the shared platform contract", () => {
    expect(
      createPublicReleaseIdentity(
        "client",
        {
          whiteLabelVersion: "0.1.0",
          configSchemaVersion: 1,
          backendContract: { min: 1, max: 1 },
        },
        ["unsafe", "0123456789abcdef0123456789abcdef01234567"],
      ),
    ).toEqual({
      schemaVersion: 1,
      application: "client",
      releaseId: "tenant-runtime-v0.1.0",
      buildCommit: "0123456789abcdef0123456789abcdef01234567",
      whiteLabelVersion: "0.1.0",
      configSchemaVersion: 1,
      backendContract: { min: 1, max: 1 },
    });

    expect(
      createPublicReleaseIdentity(
        "dashboard",
        {
          whiteLabelVersion: "0.1.0",
          configSchemaVersion: 1,
          backendContract: { min: 1, max: 1 },
        },
        [undefined, "not-a-commit"],
      ).buildCommit,
    ).toBe("local");
  });
});
