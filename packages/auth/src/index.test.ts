import { describe, expect, it } from "vitest";

import { authorize, getVerifiedIdentity, type Membership } from "./index.js";

describe("verified identity", () => {
  it("derives identity from getClaims and not a stored session", async () => {
    const client = {
      auth: {
        getClaims: async () => ({
          data: { claims: { sub: "account-1" } },
          error: null,
        }),
      },
    };

    await expect(getVerifiedIdentity(client)).resolves.toEqual({
      accountId: "account-1",
    });
  });
});

describe("capability checks", () => {
  const membership: Membership = {
    accountId: "account-1",
    tenantId: "tenant-1",
    status: "active",
    capabilities: ["booking.view.own", "booking.cancel"],
    locationIds: ["location-1"],
  };

  it("requires both a live capability and matching location scope", () => {
    expect(
      authorize({ accountId: "account-1" }, membership, "booking.cancel", "location-1"),
    ).toEqual({
      allowed: true,
    });
    expect(
      authorize({ accountId: "account-1" }, membership, "booking.cancel", "location-2"),
    ).toEqual({
      allowed: false,
      reason: "location_scope_denied",
    });
  });
});
