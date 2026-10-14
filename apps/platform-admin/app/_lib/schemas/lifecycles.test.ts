import { describe, expect, it } from "vitest";
import {
  decideReviewSchema,
  deactivateInstanceSchema,
  requestDomainRetirementSchema,
  requestInstanceClosureSchema,
  updateInstanceConfigurationSchema,
} from "./lifecycles";
const id = "d3000000-0000-4000-8000-000000000136";
const other = "d3000000-0000-4000-8000-000000000137";
const reason = "Synthetic reason for this workflow";
const idempotencyKey = "synthetic-stable-request-20261013";
describe("operator lifecycle untrusted inputs", () => {
  it("accepts the initial expected revision and permits clearing only the display name", () => {
    const data = updateInstanceConfigurationSchema.parse({
      instanceId: id,
      displayName: "  ",
      expectedRevision: 0,
      reason,
      idempotencyKey,
    });
    expect(data.displayName).toBeUndefined();
    expect(data.expectedRevision).toBe(0);
    expect(
      updateInstanceConfigurationSchema.safeParse({ ...data, expectedRevision: -1 })
        .success,
    ).toBe(false);
  });
  it.each(["", "short", "x".repeat(501)])(
    "requires a bounded meaningful lifecycle reason (%s)",
    (badReason) => {
      expect(
        decideReviewSchema.safeParse({
          kind: "job",
          id,
          decision: "approve",
          reason: badReason,
          idempotencyKey,
        }).success,
      ).toBe(false);
    },
  );
  it("refuses arbitrary review kinds and decisions", () => {
    expect(
      decideReviewSchema.safeParse({
        kind: "tenant",
        id,
        decision: "approve",
        reason,
        idempotencyKey,
      }).success,
    ).toBe(false);
    expect(
      decideReviewSchema.safeParse({
        kind: "job",
        id,
        decision: "delete",
        reason,
        idempotencyKey,
      }).success,
    ).toBe(false);
  });
  it("requires the exact instance UUID confirmation and a stable request key", () => {
    const input = { instanceId: id, confirmation: id, reason, idempotencyKey };
    expect(requestInstanceClosureSchema.safeParse(input).success).toBe(true);
    expect(
      requestInstanceClosureSchema.safeParse({ ...input, confirmation: other }).success,
    ).toBe(false);
    expect(
      requestInstanceClosureSchema.safeParse({ ...input, idempotencyKey: "" }).success,
    ).toBe(false);
  });
  it("refuses closed or invented expected states for deactivation", () => {
    for (const expectedState of ["closed", "erased", ""])
      expect(
        deactivateInstanceSchema.safeParse({
          instanceId: id,
          expectedState,
          reason,
          idempotencyKey,
        }).success,
      ).toBe(false);
  });
  it("allows explicit no replacement but refuses malformed replacements before the RPC", () => {
    expect(
      requestDomainRetirementSchema.parse({
        domainId: id,
        replacementDomainId: "none",
        reason,
        idempotencyKey,
      }).replacementDomainId,
    ).toBeNull();
    expect(
      requestDomainRetirementSchema.safeParse({
        domainId: id,
        replacementDomainId: "other-tenant-domain",
        reason,
        idempotencyKey,
      }).success,
    ).toBe(false);
  });
});
