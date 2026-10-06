import { describe, expect, it } from "vitest";
import { hasRecentRecoveryAuthentication } from "./auth-recovery";
describe("password recovery assurance", () => {
  it("requires a fresh verified email factor, never a password session or user metadata", () => {
    expect(
      hasRecentRecoveryAuthentication(
        { sub: "user", amr: [{ method: "otp", timestamp: 1000 }] },
        1100,
      ),
    ).toBe(true);
    for (const claims of [
      null,
      { sub: "user", user_metadata: { recovery: true } },
      { sub: "user", amr: [{ method: "password", timestamp: 1000 }] },
      { sub: "user", amr: [{ method: "otp", timestamp: 1 }] },
      { sub: "user", amr: [{ method: "otp", timestamp: 1200 }] },
    ])
      expect(hasRecentRecoveryAuthentication(claims, 1100)).toBe(false);
  });
});
