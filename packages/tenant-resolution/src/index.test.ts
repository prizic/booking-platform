import { describe, expect, it } from "vitest";

import { normalizeHostname, resolveTenantContext } from "./index.js";

describe("hostname normalization", () => {
  it("normalizes case, ports, trailing dots, and international domains", () => {
    expect(normalizeHostname("BÜCHER.example.:443")).toBe("xn--bcher-kva.example");
  });

  it("rejects hostnames that cannot be verified domains", () => {
    expect(() => normalizeHostname("127.0.0.1:3000")).toThrow("valid tenant domain");
    expect(() => normalizeHostname("bad_label.example")).toThrow("valid tenant domain");
  });
});

describe("tenant context resolution", () => {
  it("fails closed for an unverified domain", async () => {
    await expect(
      resolveTenantContext("tenant.example", {
        resolveByHostname: async () => ({
          tenantId: "tenant-1",
          brandId: "brand-1",
          instanceId: "instance-1",
          hostname: "tenant.example",
          deploymentState: "active",
          domainVerified: false,
          publishedBrandRevision: 1,
        }),
      }),
    ).rejects.toThrow("active, verified tenant domain");
  });
});
