export type ReadFailure =
  "access_denied" | "tenant_setup" | "transport_unavailable" | "invalid_response";
function isRpcFailure(
  error: unknown,
): error is Error & { code: string; stableMessage?: unknown } {
  return (
    error instanceof Error &&
    error.name === "DashboardRpcError" &&
    "code" in error &&
    typeof error.code === "string"
  );
}
export function classifyReadFailure(error: unknown): ReadFailure {
  if (isRpcFailure(error)) {
    if (
      ["42501", "28000", "PGRST301", "PGRST302"].includes(error.code) ||
      error.stableMessage === "not_authorized"
    )
      return "access_denied";
    return "transport_unavailable";
  }
  return error instanceof TypeError ? "transport_unavailable" : "invalid_response";
}
/** Fixed metadata only. Never emit backend text, request headers, host, IDs or payloads. */
export function recordReadFailure(
  operation: "today_choices" | "today_items" | "dashboard_access" | "catalog",
  outcome: ReadFailure,
  error?: unknown,
) {
  const code =
    isRpcFailure(error) && /^[A-Z0-9]{5,12}$/u.test(error.code)
      ? error.code
      : undefined;
  const correlation = crypto.randomUUID();
  console.warn(
    JSON.stringify({
      event: "dashboard_read_failure",
      operation,
      outcome,
      correlation,
      ...(code ? { code } : {}),
    }),
  );
  return correlation;
}
