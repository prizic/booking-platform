import { describe, expect, it } from "vitest";
import { issueRecoveryTicket, verifyRecoveryTicket } from "./auth-recovery-ticket";

describe("recovery callback receipt", () => {
  const secret = "synthetic-test-key-for-recovery-receipts";
  it("binds a receipt to its authenticated session and expiry", () => {
    const ticket = issueRecoveryTicket(secret, "account-a", "session-a", 1000);
    expect(verifyRecoveryTicket(ticket, secret, "account-a", "session-a", 1100)).toBe(
      true,
    );
    expect(verifyRecoveryTicket(ticket, secret, "account-b", "session-a", 1100)).toBe(
      false,
    );
    expect(verifyRecoveryTicket(ticket, secret, "account-a", "session-b", 1100)).toBe(
      false,
    );
    expect(verifyRecoveryTicket(ticket, secret, "account-a", "session-a", 1900)).toBe(
      false,
    );
    expect(verifyRecoveryTicket(ticket, secret, "account-a", "session-a", 999)).toBe(
      false,
    );
    expect(
      verifyRecoveryTicket(ticket, undefined, "account-a", "session-a", 1100),
    ).toBe(false);
    expect(
      verifyRecoveryTicket(`${ticket}x`, secret, "account-a", "session-a", 1100),
    ).toBe(false);
  });
});
