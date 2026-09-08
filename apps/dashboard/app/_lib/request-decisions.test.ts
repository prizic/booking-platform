import { describe, expect, it } from "vitest";

import { DashboardRpcError } from "./dashboard-data-source";
import {
  decisionOutcomeFor,
  decisionResultUrl,
  resolveProposedInstant,
} from "./request-decisions";

describe("booking request decisions", () => {
  it("maps every stable database error to one outcome", () => {
    for (const [message, expected] of [
      ["revision_conflict", "revision-conflict"],
      ["slot_unavailable", "slot-unavailable"],
      ["payment_pending", "slot-unavailable"],
      ["policy_denied", "not-authorized"],
      ["booking_context_required", "not-authorized"],
      ["booking_invalid_action", "invalid-request"],
    ] as const) {
      expect(decisionOutcomeFor(new DashboardRpcError("23505", message))).toBe(
        expected,
      );
    }
  });

  it("treats anything else as unavailable rather than guessing", () => {
    expect(decisionOutcomeFor(new Error("boom"))).toBe("backend-unavailable");
    expect(decisionOutcomeFor(new DashboardRpcError("57014"))).toBe(
      "backend-unavailable",
    );
  });

  it("carries the one-time customer link back to the deciding member", () => {
    expect(decisionResultUrl("ar", "proposed", "a".repeat(64))).toBe(
      `/ar/requests?result=proposed&link=${"a".repeat(64)}`,
    );
    expect(decisionResultUrl("en", "accepted")).toBe("/en/requests?result=accepted");
  });

  it("resolves a proposed civil time in the location timezone, not the reader's", () => {
    // 09:00 in New York is 13:00 UTC in summer and 14:00 UTC in winter.
    expect(resolveProposedInstant("2026-07-15T09:00", "America/New_York")).toBe(
      "2026-07-15T13:00:00.000Z",
    );
    expect(resolveProposedInstant("2026-12-15T09:00", "America/New_York")).toBe(
      "2026-12-15T14:00:00.000Z",
    );
    expect(resolveProposedInstant("2026-07-15T09:00", "Asia/Riyadh")).toBe(
      "2026-07-15T06:00:00.000Z",
    );
  });

  it("refuses anything that is not a whole-minute local time", () => {
    expect(resolveProposedInstant(null, "America/New_York")).toBeNull();
    expect(resolveProposedInstant("2026-07-15", "America/New_York")).toBeNull();
    expect(
      resolveProposedInstant("2026-07-15T09:00:30", "America/New_York"),
    ).toBeNull();
  });
});

describe("proposed civil time near a timezone change", () => {
  it("refuses a nonexistent spring-forward time", () => {
    // 2026-03-08 02:30 does not exist in New York.
    expect(resolveProposedInstant("2026-03-08T02:30", "America/New_York")).toBeNull();
  });

  it("resolves a duplicated fall-back time to the earlier instant", () => {
    // 2026-11-01 01:30 happens twice in New York.
    expect(resolveProposedInstant("2026-11-01T01:30", "America/New_York")).toBe(
      "2026-11-01T05:30:00.000Z",
    );
  });
});
