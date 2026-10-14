import { describe, expect, it } from "vitest";
import { normalizeOperatorJson } from "./operator-json-contracts";
const id = "d3000000-0000-4000-8000-000000000136";
const tenant = "d1000000-0000-4000-8000-000000000136";
const configuration = {
  instance_id: id,
  tenant_id: tenant,
  display_name: null,
  revision: 0,
  deployment_state: "active",
};
describe("private scalar operator JSON contracts", () => {
  it("keeps the initial zero configuration revision and nullable display name", () => {
    expect(
      normalizeOperatorJson("get_instance_configuration_v1", configuration),
    ).toEqual(configuration);
  });
  it.each([
    null,
    [],
    [configuration],
    { ...configuration, revision: "0" },
    { ...configuration, deployment_state: "deleted" },
  ])("refuses malformed configuration without table coercion (%j)", (value) => {
    expect(() =>
      normalizeOperatorJson("get_instance_configuration_v1", value),
    ).toThrow();
  });
  it("distinguishes a successful empty queue from an invalid envelope", () => {
    expect(
      normalizeOperatorJson("list_operator_reviews_v1", { items: [], total_count: 0 }),
    ).toEqual({ items: [], total_count: 0 });
    for (const value of [
      [],
      null,
      { items: [] },
      { items: [], total_count: -1 },
      { items: [{}], total_count: 1 },
    ]) {
      expect(() => normalizeOperatorJson("list_operator_reviews_v1", value)).toThrow();
    }
  });
  it("keeps independent permission and immutable history on review detail", () => {
    const detail = {
      kind: "job",
      id,
      tenant_id: tenant,
      instance_id: id,
      status: "pending",
      requested_by: id,
      requested_at: "2026-10-13T08:00:00Z",
      reason: "Synthetic request reason",
      action: "close_instance",
      detail: { status: "queued" },
      can_decide: false,
      history: [
        {
          id: tenant,
          action: "review.rejected",
          operator_id: id,
          reason: "Synthetic decision reason",
          outcome: "succeeded",
          created_at: "2026-10-13T09:00:00Z",
        },
      ],
    };
    const parsed = normalizeOperatorJson("get_operator_review_v1", detail);
    expect(parsed.can_decide).toBe(false);
    expect(parsed.history[0]?.reason).toBe("Synthetic decision reason");
    expect(() =>
      normalizeOperatorJson("get_operator_review_v1", { ...detail, history: null }),
    ).toThrow();
  });
  it("closure acceptance never normalizes into completed closure", () => {
    expect(
      normalizeOperatorJson("request_instance_closure_v1", {
        job_id: id,
        status: "awaiting_approval",
      }).status,
    ).toBe("awaiting_approval");
    expect(() =>
      normalizeOperatorJson("request_instance_closure_v1", {
        job_id: id,
        status: "closed",
      }),
    ).toThrow();
  });
});
