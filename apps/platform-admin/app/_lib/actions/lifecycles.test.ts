import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ run: vi.fn(), read: vi.fn() }));
vi.mock("../operator-api", () => ({ callOperator: mocks.read }));
vi.mock("../operator-action", () => ({
  runOperatorAction: mocks.run,
  operatorOk: () => ({ ok: true }),
}));
import {
  updateInstanceConfigurationAction,
  requestInstanceClosureAction,
  requestDomainRetirementAction,
  decideReviewAction,
  deactivateInstanceAction,
} from "./lifecycles";
const id = "d3000000-0000-4000-8000-000000000136";
const reason = "Synthetic lifecycle request reason";
const idempotencyKey = "synthetic-stable-request-20261013";
type SubmissionOverrides = { reason?: string; idempotencyKey?: string };
const submission = { reason, idempotencyKey };
const lifecycleCases = [
  {
    name: "updateInstanceConfiguration",
    rpc: "update_instance_configuration_v1",
    targetKind: "instance",
    guards: { p_expected_revision: 0 },
    submit: (overrides: SubmissionOverrides = {}) =>
      updateInstanceConfigurationAction({
        instanceId: id,
        displayName: "Synthetic",
        expectedRevision: 0,
        ...submission,
        ...overrides,
      }),
  },
  {
    name: "deactivateInstance",
    rpc: "deactivate_instance_by_id_v1",
    targetKind: "instance",
    guards: { p_expected_state: "active" },
    submit: (overrides: SubmissionOverrides = {}) =>
      deactivateInstanceAction({
        instanceId: id,
        expectedState: "active",
        ...submission,
        ...overrides,
      }),
  },
  {
    name: "requestInstanceClosure",
    rpc: "request_instance_closure_v1",
    targetKind: "instance",
    guards: { p_confirmation: id },
    submit: (overrides: SubmissionOverrides = {}) =>
      requestInstanceClosureAction({
        instanceId: id,
        confirmation: id,
        ...submission,
        ...overrides,
      }),
  },
  {
    name: "requestDomainRetirement",
    rpc: "request_domain_retirement_v1",
    targetKind: "domain",
    guards: { p_replacement_domain_id: null },
    submit: (overrides: SubmissionOverrides = {}) =>
      requestDomainRetirementAction({
        domainId: id,
        replacementDomainId: "none",
        ...submission,
        ...overrides,
      }),
  },
  {
    name: "decideReview",
    rpc: "decide_operator_review_v1",
    targetKind: "operator_review",
    guards: { p_kind: "job", p_id: id, p_decision: "approve" },
    submit: (overrides: SubmissionOverrides = {}) =>
      decideReviewAction({
        kind: "job",
        id,
        decision: "approve",
        ...submission,
        ...overrides,
      }),
  },
] as const;
beforeEach(() => {
  mocks.run.mockReset();
  mocks.run.mockResolvedValue({ result: { ok: true } });
  mocks.read.mockReset();
});
describe("lifecycle server action boundaries", () => {
  it.each(lifecycleCases)(
    "$name re-enters the live RPC action boundary on every explicit submission",
    async ({ submit, rpc, targetKind, guards }) => {
      expect((await submit()).ok).toBe(true);
      for (const code of [
        "policy_denied",
        "recent_authentication_required",
        "second_operator_required",
        "stale_revision",
        "idempotency_conflict",
      ] as const) {
        mocks.run.mockResolvedValueOnce({ result: { ok: false, formError: code } });
        expect(await submit()).toEqual({ ok: false, formError: code });
      }
      // A previous successful result must not cache authority or trigger mutation retries.
      expect(mocks.run).toHaveBeenCalledTimes(6);
      for (const [input] of mocks.run.mock.calls) {
        expect(input).toMatchObject({
          fn: rpc,
          targetKind,
          targetId: id,
          args: {
            ...guards,
            p_reason: reason,
            p_idempotency_key: idempotencyKey,
          },
        });
      }
    },
  );

  it.each(lifecycleCases)(
    "$name refuses missing/oversized reasons and invalid keys before the write",
    async ({ submit }) => {
      for (const invalidReason of ["", "x".repeat(9), "x".repeat(501)])
        expect((await submit({ reason: invalidReason })).ok).toBe(false);
      expect((await submit({ idempotencyKey: "" })).ok).toBe(false);
      expect(mocks.run).not.toHaveBeenCalled();
    },
  );

  it("uses the allowed display-name RPC and carries optimistic revision and stable request identity", async () => {
    await updateInstanceConfigurationAction({
      instanceId: id,
      displayName: "  ",
      expectedRevision: 0,
      reason,
      idempotencyKey,
    });
    expect(mocks.run).toHaveBeenCalledWith(
      expect.objectContaining({
        fn: "update_instance_configuration_v1",
        args: {
          p_instance_id: id,
          p_display_name: null,
          p_expected_revision: 0,
          p_reason: reason,
          p_idempotency_key: idempotencyKey,
        },
      }),
    );
  });
  it("validates forged confirmations before invoking any write", async () => {
    const result = await requestInstanceClosureAction({
      instanceId: id,
      confirmation: "d3000000-0000-4000-8000-000000000137",
      reason,
      idempotencyKey,
    });
    expect(result.ok).toBe(false);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("uses the guarded instance-id deactivation RPC with expected state", async () => {
    await deactivateInstanceAction({
      instanceId: id,
      expectedState: "active",
      reason,
      idempotencyKey,
    });
    expect(mocks.run).toHaveBeenCalledWith(
      expect.objectContaining({
        fn: "deactivate_instance_by_id_v1",
        args: expect.objectContaining({
          p_expected_state: "active",
          p_idempotency_key: idempotencyKey,
        }),
      }),
    );
  });
  it("requests retirement with explicit nullable replacement, never retires a route directly", async () => {
    await requestDomainRetirementAction({
      domainId: id,
      replacementDomainId: "none",
      reason,
      idempotencyKey,
    });
    expect(mocks.run).toHaveBeenCalledWith(
      expect.objectContaining({
        fn: "request_domain_retirement_v1",
        args: expect.objectContaining({
          p_replacement_domain_id: null,
          p_reason: reason,
        }),
      }),
    );
  });
  it("routes independent decisions exclusively through Review and preserves the submission key", async () => {
    await decideReviewAction({
      kind: "job",
      id,
      decision: "reject",
      reason,
      idempotencyKey,
    });
    expect(mocks.run).toHaveBeenCalledWith(
      expect.objectContaining({
        fn: "decide_operator_review_v1",
        args: {
          p_kind: "job",
          p_id: id,
          p_decision: "reject",
          p_reason: reason,
          p_idempotency_key: idempotencyKey,
        },
      }),
    );
  });
  it("keeps live backend refusals visible as failed actions", async () => {
    mocks.run.mockResolvedValue({
      result: { ok: false, formError: "second_operator_required" },
    });
    const result = await decideReviewAction({
      kind: "support",
      id,
      decision: "approve",
      reason,
      idempotencyKey,
    });
    expect(result).toEqual({ ok: false, formError: "second_operator_required" });
  });
});
