const redactedValue = "[REDACTED]" as const;
const sensitiveKeyPattern =
  /authorization|cookie|credential|email|phone|address|password|secret|token|intake.*answer/i;

export function redact(value: unknown): unknown {
  return redactValue(value, new WeakSet<object>());
}

function redactValue(value: unknown, visited: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (visited.has(value)) {
    return "[CIRCULAR]";
  }
  visited.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, visited));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      sensitiveKeyPattern.test(key) ? redactedValue : redactValue(item, visited),
    ]),
  );
}

export interface CorrelationInput {
  readonly actorId?: string;
  readonly bookingId?: string;
  readonly idempotencyKey?: string;
  readonly requestId?: string;
  readonly tenantId?: string;
}

export interface CorrelationContext extends CorrelationInput {
  readonly requestId: string;
}

export function createCorrelationContext(
  input: CorrelationInput = {},
  createRequestId: () => string = () => globalThis.crypto.randomUUID(),
): CorrelationContext {
  const requestId = input.requestId ?? createRequestId();

  if (requestId.trim() === "") {
    throw new Error("A correlation request ID cannot be empty");
  }

  return Object.freeze({
    requestId,
    ...(input.tenantId === undefined ? {} : { tenantId: input.tenantId }),
    ...(input.actorId === undefined ? {} : { actorId: input.actorId }),
    ...(input.bookingId === undefined ? {} : { bookingId: input.bookingId }),
    ...(input.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: input.idempotencyKey }),
  });
}
