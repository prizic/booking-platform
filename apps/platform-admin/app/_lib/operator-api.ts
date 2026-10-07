import "server-only";

import type { Database } from "@wlbp/supabase-client";
import { createPlatformAdminRequestClient } from "./platform-admin-server";
import { operatorErrorCode, type OperatorErrorCode } from "./operator-errors";
import { operatorRpcEvidence, type OperatorCorrelation } from "./operator-correlation";

type Functions = Database["api_v1"]["Functions"];
export type OperatorFunction = keyof Functions;
// Supabase-generated Args omit SQL nullability. These reviewed fields accept
// null to clear a value; optional fields may be undefined and are omitted below.
type NullableArgs = {
  add_operator_v1: "p_expires_at";
  set_operator_role_v1: "p_expires_at";
  update_subscription_v1: "p_ends_at";
  set_entitlement_override_v1: "p_expires_at";
  save_platform_flag_v1: "p_message_en" | "p_message_ar" | "p_starts_at" | "p_ends_at";
};
export type RpcArgs<F extends OperatorFunction> = {
  [K in keyof Functions[F]["Args"]]:
    | Functions[F]["Args"][K]
    | (undefined extends Functions[F]["Args"][K] ? undefined : never)
    | (F extends keyof NullableArgs
        ? K extends NullableArgs[F]
          ? null
          : never
        : never);
};
export type RpcReturn<F extends OperatorFunction> = Functions[F]["Returns"];
export type RpcRow<F extends OperatorFunction> =
  RpcReturn<F> extends readonly (infer R)[] ? R : never;
export type OperatorResult<T> =
  { ok: true; data: T } | { ok: false; code: OperatorErrorCode };

type LooseRpc = (
  fn: string,
  args: object,
) => PromiseLike<{
  data: unknown;
  error: { message?: string | null; code?: string | null } | null;
}>;

/** Drops undefined so the database default applies instead of an explicit null. */
function defined(args: object): object {
  return Object.fromEntries(
    Object.entries(args).filter(([, value]) => value !== undefined),
  );
}

export async function callOperator<F extends OperatorFunction>(
  fn: F,
  args?: RpcArgs<F>,
  correlation: OperatorCorrelation = { requestId: crypto.randomUUID() },
): Promise<OperatorResult<RpcReturn<F>>> {
  const client = await createPlatformAdminRequestClient();
  const evidence = { ...correlation };
  const payload = defined(args ?? {}) as Record<string, unknown>;
  if (!evidence.tenantId && typeof payload.p_tenant_id === "string")
    evidence.tenantId = payload.p_tenant_id;
  if (!evidence.idempotencyKey && typeof payload.p_idempotency_key === "string")
    evidence.idempotencyKey = payload.p_idempotency_key;
  function record(outcome: "succeeded" | "failed", code?: OperatorErrorCode) {
    // Only stable codes and allow-listed UUIDs: no arguments, tokens or driver messages.
    try {
      console.info(JSON.stringify(operatorRpcEvidence(evidence, fn, outcome, code)));
    } catch {
      // Operational evidence must not turn a committed mutation into an error.
    }
  }
  if (client === null) {
    record("failed", "configuration_missing");
    return { ok: false, code: "configuration_missing" };
  }
  // Verified claims are telemetry only; live database operator standing authorizes the RPC.
  const claims = await client.auth.getClaims().catch(() => null);
  const subject = claims?.data?.claims.sub;
  if (typeof subject === "string") evidence.actorId = subject;
  try {
    const rpc = client.rpc.bind(client) as unknown as LooseRpc;
    const { data, error } = await rpc(fn, payload);
    if (error) {
      const code = operatorErrorCode(error);
      record("failed", code);
      return { ok: false, code };
    }
    record("succeeded");
    return { ok: true, data: data as RpcReturn<F> };
  } catch {
    record("failed", "unavailable");
    return { ok: false, code: "unavailable" };
  }
}
