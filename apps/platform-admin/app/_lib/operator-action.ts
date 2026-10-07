import "server-only";

import { actionError, actionOk } from "@wlbp/ui-foundation/actions";
import {
  callOperator,
  type OperatorFunction,
  type RpcArgs,
  type RpcReturn,
} from "./operator-api";
import type { OperatorErrorCode } from "./operator-errors";
import type { OperatorActionResult, OperatorOutcome } from "./operator-result";

export type { OperatorActionResult } from "./operator-result";

const notRecorded = new Set<OperatorErrorCode>([
  "configuration_missing",
  "unavailable",
]);

/** A failed result for an operator error code, with optional reason codes. */
export function operatorError(
  code: OperatorErrorCode,
  reasons?: readonly string[],
): OperatorActionResult {
  return actionError(code, reasons?.length ? { _form: reasons } : undefined);
}

export function operatorOk(outcome?: OperatorOutcome): OperatorActionResult {
  return actionOk(outcome);
}

/**
 * Runs one operator RPC. A refused or failed call rolls back its own audit
 * row, so the attempt is recorded afterwards (best effort: recording must never
 * turn a clear error into a confusing one).
 *
 * The tenant attributed to a failure row is never a browser-chosen field: it
 * is either the tenant the RPC itself targeted (`tenantId`, the same value
 * sent as `p_tenant_id`) or one the server looks up from the target record
 * (`tenantOf`, only called when a failure is recorded).
 */
export async function runOperatorAction<F extends OperatorFunction>(input: {
  action: string;
  fn: F;
  args: RpcArgs<F>;
  tenantId?: string | undefined;
  tenantOf?: () => Promise<string | undefined>;
  targetKind?: string | undefined;
  targetId?: string | undefined;
}): Promise<{ result: OperatorActionResult; data?: RpcReturn<F> }> {
  const correlation = {
    requestId: crypto.randomUUID(),
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
  };
  const outcome = await callOperator(input.fn, input.args, correlation);
  if (outcome.ok) return { result: operatorOk(), data: outcome.data };
  if (!notRecorded.has(outcome.code)) {
    const tenantId =
      input.tenantId ?? (await input.tenantOf?.().catch(() => undefined));
    await callOperator(
      "record_operator_failure_v1",
      {
        p_action: input.action,
        p_error_code: outcome.code,
        p_tenant_id: tenantId,
        p_target_kind: input.targetKind,
        p_target_id: input.targetId,
      },
      { ...correlation, ...(tenantId ? { tenantId } : {}) },
    );
  }
  return { result: operatorError(outcome.code) };
}
