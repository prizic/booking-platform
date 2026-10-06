/** Same request-ID convention as the Dashboard DAL; never log action payloads. */
export type OperatorCorrelation = {
  requestId: string;
  actorId?: string;
  tenantId?: string;
  idempotencyKey?: string;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const identifier = (value: unknown) =>
  typeof value === "string" && uuid.test(value) ? value : undefined;

/** Explicit fields and UUID-only values prevent PII/secrets entering telemetry. */
export function operatorRpcEvidence(
  correlation: OperatorCorrelation,
  fn: string,
  outcome: "succeeded" | "failed",
  code?: string,
) {
  return {
    event: "platform_admin.rpc",
    requestId: identifier(correlation.requestId),
    actorId: identifier(correlation.actorId),
    tenantId: identifier(correlation.tenantId),
    idempotencyKey: identifier(correlation.idempotencyKey),
    function: /^[a-z][a-z0-9_]*_v\d+$/u.test(fn) ? fn : undefined,
    outcome,
    code: code && /^[a-z][a-z0-9_]{2,60}$/u.test(code) ? code : undefined,
  };
}
