import { describe, expect, it } from "vitest";
import { operatorRpcEvidence } from "./operator-correlation";

const requestId = "a9000000-0000-4000-8000-000000000001";

describe("operator RPC evidence", () => {
  it("joins the mutation and failure-recording RPC by one request ID", () => {
    const correlation = { requestId, tenantId: "a9000000-0000-4000-8000-000000000002" };
    const mutation = operatorRpcEvidence(
      correlation,
      "set_tenant_status_v1",
      "failed",
      "policy_denied",
    );
    const recording = operatorRpcEvidence(
      correlation,
      "record_operator_failure_v1",
      "succeeded",
    );
    expect(mutation.requestId).toBe(recording.requestId);
    expect(mutation.tenantId).toBe(correlation.tenantId);
    expect(mutation.code).toBe("policy_denied");
  });

  it("refuses non-ID context, unrecognized fields and raw transport errors", () => {
    const unsafe = {
      requestId,
      actorId: "ops@example.invalid",
      tenantId: "tenant name",
      idempotencyKey: "a credential must not appear in logs",
      secret: "sensitive value",
    };
    const evidence = JSON.stringify(
      operatorRpcEvidence(
        unsafe,
        "malformed function",
        "failed",
        "host and credentials",
      ),
    );
    expect(evidence).toContain(requestId);
    for (const value of [
      "ops@example.invalid",
      "tenant name",
      "credential",
      "sensitive value",
      "malformed function",
      "host and credentials",
    ]) {
      expect(evidence).not.toContain(value);
    }
  });
});
