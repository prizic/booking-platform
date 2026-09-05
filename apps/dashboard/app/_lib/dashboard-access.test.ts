import { describe, expect, it, vi } from "vitest";

import { loadDashboardAccess, type DashboardDataSource } from "./dashboard-access";

const hostname = "dashboard.tenant.example";
const resolved = {
  brandId: "brand-a",
  configRevision: 3,
  deploymentState: "active" as const,
  featureRevision: 4,
  hostname,
  instanceId: "instance-a",
  publishedBrandRevision: 2,
  tenantId: "tenant-a",
};
const choice = {
  dashboardHostname: hostname,
  membershipId: "membership-a",
  roleKey: "scheduler",
  tenantId: "tenant-a",
  tenantName: "Tenant A",
};
const context = {
  aal2: false,
  brandId: "brand-a",
  configRevision: 3,
  dashboardHostname: hostname,
  defaultLocale: "en",
  featureRevision: 4,
  grants: [
    {
      capability: "booking.view.any",
      requiresApproval: false,
      scope: "location",
    },
  ],
  instanceId: "instance-a",
  locationIds: ["location-a"],
  locationScope: { kind: "restricted", locationIds: ["location-a"] },
  membershipId: "membership-a",
  publishedBrandRevision: 2,
  roleKey: "scheduler",
  tenantId: "tenant-a",
  tenantName: "Tenant A",
};

function dataSource(overrides: Partial<DashboardDataSource> = {}): DashboardDataSource {
  return {
    getDashboardContext: vi.fn(async () => context),
    getVerifiedIdentity: vi.fn(async () => ({
      accountId: "account-a",
      assuranceLevel: "aal1" as const,
    })),
    listTenantChoices: vi.fn(async () => [choice]),
    resolveTenant: vi.fn(async () => resolved),
    ...overrides,
  };
}

describe("Dashboard access", () => {
  it("returns only a verified current tenant context", async () => {
    const state = await loadDashboardAccess({ hostname, locale: "en" }, dataSource());

    expect(state).toMatchObject({
      kind: "ready",
      context: { tenantId: "tenant-a" },
    });
    expect(state.kind === "ready" && state.cacheScopeKey).toContain("tenant-a");
  });

  it("does not use a guessed tenant preference as authorization", async () => {
    const source = dataSource();
    const state = await loadDashboardAccess(
      { hostname, locale: "en", selectedTenantId: "tenant-b" },
      source,
    );

    expect(state).toEqual({ kind: "denied", reason: "tenant_context_mismatch" });
    expect(source.getDashboardContext).not.toHaveBeenCalled();
  });

  it("uses the verified hostname to narrow a multi-tenant account", async () => {
    const otherChoice = {
      ...choice,
      tenantId: "tenant-b",
      membershipId: "membership-b",
      dashboardHostname: "dashboard.other.example",
    };
    const state = await loadDashboardAccess(
      { hostname, locale: "ar" },
      dataSource({ listTenantChoices: async () => [choice, otherChoice] }),
    );

    expect(state).toMatchObject({
      kind: "ready",
      choices: [choice, otherChoice],
      context: { tenantId: "tenant-a" },
    });
  });

  it("fails closed when current membership disappears", async () => {
    const source = dataSource({ listTenantChoices: async () => [] });
    await expect(
      loadDashboardAccess({ hostname, locale: "en" }, source),
    ).resolves.toEqual({ kind: "denied", reason: "membership_inactive" });
    expect(source.getDashboardContext).not.toHaveBeenCalled();
  });

  it("fails closed when the host and database context disagree", async () => {
    const source = dataSource({
      getDashboardContext: async () => ({ ...context, instanceId: "instance-b" }),
    });
    await expect(
      loadDashboardAccess({ hostname, locale: "en" }, source),
    ).resolves.toEqual({ kind: "denied", reason: "tenant_context_mismatch" });
  });
});
