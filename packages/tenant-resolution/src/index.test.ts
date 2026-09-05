import { describe, expect, it } from "vitest";

import {
  buildTenantCacheKey,
  extractRequestHostname,
  normalizeHostname,
  resolveTenantContext,
} from "./index.js";

describe("hostname normalization", () => {
  it("normalizes case, ports, trailing dots, and international domains", () => {
    expect(normalizeHostname("BÜCHER.example.:443")).toBe("xn--bcher-kva.example");
  });

  it("rejects hostnames that cannot be verified domains", () => {
    expect(() => normalizeHostname("127.0.0.1:3000")).toThrow("valid tenant domain");
    expect(() => normalizeHostname("bad_label.example")).toThrow("valid tenant domain");
  });

  it.each([
    "https://tenant.example",
    "user@tenant.example",
    "tenant.example/path",
    "tenant.example?query",
    "tenant.example#fragment",
    "tenant.example,attacker.example",
    "tenant.example..",
    "[::1]:3000",
    "tenant.example:65536",
    "*.tenant.example",
  ])("rejects hostile host input %s", (value) => {
    expect(() => normalizeHostname(value)).toThrow("valid tenant domain");
  });

  it("does not let an untrusted forwarded host override Host", () => {
    const headers = new Headers({
      host: "tenant.example:443",
      "x-forwarded-host": "attacker.example",
    });

    expect(extractRequestHostname(headers, { runtimeEnvironment: "production" })).toBe(
      "tenant.example",
    );
    expect(
      extractRequestHostname(headers, {
        trustedProxyHostname: "edge-verified.example",
      }),
    ).toBe("edge-verified.example");
  });

  it("allows a local fallback only outside preview and production", () => {
    expect(
      extractRequestHostname(new Headers(), {
        localFallback: "tenant.local.example",
        runtimeEnvironment: "development",
      }),
    ).toBe("tenant.local.example");
    expect(() =>
      extractRequestHostname(new Headers(), {
        localFallback: "tenant.local.example",
        runtimeEnvironment: "production",
      }),
    ).toThrow("request hostname");
  });

  it("allows an explicit local tenant host to replace localhost only in development", () => {
    const headers = new Headers({ host: "localhost:3001" });
    expect(
      extractRequestHostname(headers, {
        localFallback: "dashboard.seed.test",
        runtimeEnvironment: "development",
      }),
    ).toBe("dashboard.seed.test");
    expect(() =>
      extractRequestHostname(headers, {
        localFallback: "dashboard.seed.test",
        runtimeEnvironment: "production",
      }),
    ).toThrow("valid tenant domain");
  });
});

describe("tenant context resolution", () => {
  it("fails closed for an unverified domain", async () => {
    await expect(
      resolveTenantContext("tenant.example", {
        resolveByHostname: async () => ({
          application: "client",
          tenantId: "tenant-1",
          brandId: "brand-1",
          instanceId: "instance-1",
          hostname: "tenant.example",
          deploymentState: "active",
          domainVerified: false,
          publishedBrandRevision: 1,
          configRevision: 1,
          featureRevision: 1,
        }),
      }),
    ).rejects.toThrow("active, verified tenant domain");
  });
});

describe("tenant cache scope", () => {
  const scope = {
    tenantId: "tenant-1",
    locale: "en" as const,
    publishedBrandRevision: 4,
    configRevision: 7,
    featureRevision: 9,
  };

  it("includes every tenant-varying dimension without delimiter collisions", () => {
    expect(buildTenantCacheKey("dashboard-context", scope, ["location-1"])).toBe(
      "wlbp:v1:17:dashboard-context:8:tenant-1:2:en:1:4:1:7:1:9:10:location-1",
    );
  });

  it("rejects incomplete or invalid cache scope", () => {
    expect(() =>
      buildTenantCacheKey("dashboard-context", {
        ...scope,
        featureRevision: 0,
      }),
    ).toThrow("cache scope");
  });
});
