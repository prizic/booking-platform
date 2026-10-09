import { describe, expect, it } from "vitest";

import {
  authorize,
  getVerifiedIdentity,
  hasRecentAal2,
  type Membership,
} from "./index.js";

describe("verified identity", () => {
  it("derives identity from getClaims and not a stored session", async () => {
    const client = {
      auth: {
        getClaims: async () => ({
          data: {
            claims: {
              sub: "account-1",
              aal: "aal2",
              iat: 1_500,
              amr: [
                { method: "password", timestamp: 900 },
                { method: "totp", timestamp: 1_000 },
              ],
            },
          },
          error: null,
        }),
      },
    };

    await expect(getVerifiedIdentity(client)).resolves.toEqual({
      accountId: "account-1",
      assuranceLevel: "aal2",
      aal2VerifiedAtEpochSeconds: 1_000,
    });
  });

  it("fails closed for a blank or whitespace subject", async () => {
    for (const sub of ["", "   ", "\t\n"]) {
      await expect(
        getVerifiedIdentity({
          auth: {
            getClaims: async () => ({
              data: { claims: { aal: "aal1", sub } },
              error: null,
            }),
          },
        }),
      ).resolves.toBeNull();
    }
  });

  it("fails closed when the claim source itself errors", async () => {
    await expect(
      getVerifiedIdentity({
        auth: {
          getClaims: async () => ({
            data: null,
            error: { message: "jwt expired" },
          }),
        },
      }),
    ).resolves.toBeNull();
  });

  it("ignores a non-numeric or negative factor timestamp", async () => {
    for (const timestamp of [1_000.5, -1, "1000", Number.NaN]) {
      const identity = await getVerifiedIdentity({
        auth: {
          getClaims: async () => ({
            data: {
              claims: {
                aal: "aal2",
                amr: [{ method: "totp", timestamp }],
                sub: "account-1",
              },
            },
            error: null,
          }),
        },
      });
      expect(identity?.assuranceLevel).toBe("aal2");
      expect(identity && hasRecentAal2(identity, 1_500, 600)).toBe(false);
    }
  });

  it("fails closed for malformed verified claims", async () => {
    const client = {
      auth: {
        getClaims: async () => ({
          data: { claims: { sub: "account-1", aal: "owner", iat: "now" } },
          error: null,
        }),
      },
    };

    await expect(getVerifiedIdentity(client)).resolves.toBeNull();
  });
});

describe("capability checks", () => {
  const membership: Membership = {
    accountId: "account-1",
    tenantId: "tenant-1",
    status: "active",
    grants: [
      {
        capability: "booking.view.own",
        requiresApproval: false,
        scope: "own",
      },
      {
        capability: "booking.cancel",
        requiresApproval: false,
        scope: "location",
      },
    ],
    locationScope: { kind: "restricted", locationIds: ["location-1"] },
  };

  it("requires both a live capability and matching location scope", () => {
    expect(
      authorize(
        { accountId: "account-1", assuranceLevel: "aal1" },
        membership,
        "booking.cancel",
        { locationId: "location-1", locationRequired: true },
      ),
    ).toEqual({
      allowed: true,
      grant: {
        capability: "booking.cancel",
        requiresApproval: false,
        scope: "location",
      },
    });
    expect(
      authorize(
        { accountId: "account-1", assuranceLevel: "aal1" },
        membership,
        "booking.cancel",
        { locationId: "location-2", locationRequired: true },
      ),
    ).toEqual({
      allowed: false,
      reason: "location_scope_denied",
    });
  });

  it("denies a location-scoped operation when the caller omits its location", () => {
    expect(
      authorize(
        { accountId: "account-1", assuranceLevel: "aal1" },
        membership,
        "booking.cancel",
        { locationRequired: true },
      ),
    ).toEqual({ allowed: false, reason: "location_context_required" });
  });

  it("requires a recent AAL2 claim for step-up decisions", () => {
    expect(
      hasRecentAal2(
        {
          accountId: "account-1",
          assuranceLevel: "aal2",
          aal2VerifiedAtEpochSeconds: 1_000,
        },
        1_500,
        600,
      ),
    ).toBe(true);
    expect(
      hasRecentAal2(
        {
          accountId: "account-1",
          assuranceLevel: "aal2",
          aal2VerifiedAtEpochSeconds: 1_000,
        },
        1_601,
        600,
      ),
    ).toBe(false);
  });

  it("preserves approval and ownership as independent restrictions", () => {
    const approvalAndOwn: Membership = {
      ...membership,
      grants: [
        {
          capability: "booking.approve",
          requiresApproval: true,
          scope: "own",
        },
      ],
      locationScope: { kind: "all" },
    };

    expect(
      authorize(
        { accountId: "account-1", assuranceLevel: "aal1" },
        approvalAndOwn,
        "booking.approve",
        { approvalSatisfied: true, ownsResource: false },
      ),
    ).toEqual({ allowed: false, reason: "ownership_scope_denied" });
  });

  it("does not treat a freshly issued token as recent MFA evidence", () => {
    expect(
      hasRecentAal2({ accountId: "account-1", assuranceLevel: "aal2" }, 1_500, 600),
    ).toBe(false);
  });

  it("denies a future-dated MFA timestamp", () => {
    // A claim carrying a verification time later than "now" is not evidence of
    // anything; it must not satisfy a step-up requirement.
    expect(
      hasRecentAal2(
        {
          accountId: "account-1",
          assuranceLevel: "aal2",
          aal2VerifiedAtEpochSeconds: 2_000,
        },
        1_500,
        600,
      ),
    ).toBe(false);
  });

  it("refuses a step-up decision with no clock of its own", () => {
    expect(
      authorize(
        {
          accountId: "account-1",
          assuranceLevel: "aal2",
          aal2VerifiedAtEpochSeconds: 1_000,
        },
        membership,
        "booking.cancel",
        { locationId: "location-1", recentAal2Required: true },
      ),
    ).toEqual({ allowed: false, reason: "step_up_required" });
  });

  it("denies every capability to a revoked or invited membership", () => {
    for (const status of ["revoked", "invited", "suspended"] as const) {
      expect(
        authorize(
          { accountId: "account-1", assuranceLevel: "aal1" },
          { ...membership, status },
          "booking.cancel",
          { locationId: "location-1" },
        ),
      ).toEqual({ allowed: false, reason: "membership_inactive" });
    }
  });

  it("denies a capability the membership does not hold at all", () => {
    expect(
      authorize(
        { accountId: "account-1", assuranceLevel: "aal1" },
        membership,
        "refund.issue",
        { locationId: "location-1" },
      ),
    ).toEqual({ allowed: false, reason: "capability_denied" });
  });

  it("denies a mismatched identity before anything else", () => {
    expect(
      authorize(
        { accountId: "someone-else", assuranceLevel: "aal1" },
        { ...membership, status: "revoked" },
        "booking.cancel",
        { locationId: "location-1" },
      ),
    ).toEqual({ allowed: false, reason: "identity_mismatch" });
  });

  it("does not treat token refresh as fresh factor verification", async () => {
    const identity = await getVerifiedIdentity({
      auth: {
        getClaims: async () => ({
          data: {
            claims: {
              aal: "aal2",
              sub: "account-1",
              amr: [
                { method: "totp", timestamp: 1_000 },
                { method: "token_refresh", timestamp: 2_000 },
              ],
            },
          },
          error: null,
        }),
      },
    });

    expect(identity).not.toBeNull();
    expect(identity && hasRecentAal2(identity, 2_000, 600)).toBe(false);
  });
});
