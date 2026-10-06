import "server-only";

import {
  callOperator,
  type OperatorFunction,
  type RpcArgs,
  type RpcReturn,
} from "./operator-api";
import type { OperatorErrorCode } from "./operator-errors";

export type ActionResult =
  | { kind: "idle" }
  | {
      kind: "success";
      code: string;
      values?: Record<string, string>;
      href?: string;
      download?: { filename: string; body: string };
    }
  | { kind: "error"; code: OperatorErrorCode; reasons?: string[] }
  | { kind: "step-up" };

export const idle: ActionResult = { kind: "idle" };

const notRecorded = new Set<OperatorErrorCode>([
  "configuration_missing",
  "unavailable",
]);

/**
 * Runs one operator RPC. A refused or failed call rolls back its own audit
 * row, so the attempt is recorded afterwards (best effort: recording must never
 * turn a clear error into a confusing one).
 */
export async function runOperatorAction<F extends OperatorFunction>(input: {
  action: string;
  fn: F;
  args: RpcArgs<F>;
  tenantId?: string | null | undefined;
  targetKind?: string | undefined;
  targetId?: string | undefined;
}): Promise<{ result: ActionResult; data?: RpcReturn<F> }> {
  const correlation = {
    requestId: crypto.randomUUID(),
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
  };
  const outcome = await callOperator(input.fn, input.args, correlation);
  if (outcome.ok) {
    return { result: { kind: "success", code: input.action }, data: outcome.data };
  }
  if (!notRecorded.has(outcome.code)) {
    await callOperator(
      "record_operator_failure_v1",
      {
        p_action: input.action,
        p_error_code: outcome.code,
        p_tenant_id: input.tenantId ?? undefined,
        p_target_kind: input.targetKind,
        p_target_id: input.targetId,
      },
      correlation,
    );
  }
  if (outcome.code === "recent_authentication_required")
    return { result: { kind: "step-up" } };
  return { result: { kind: "error", code: outcome.code } };
}
