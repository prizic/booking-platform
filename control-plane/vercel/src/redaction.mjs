export function redactVercelDiagnostic(value) {
  return String(value).replace(/Bearer\s+[^\s"']+/gu, "[REDACTED_AUTHORIZATION]");
}

export function safeProviderError(status, body = "") {
  return new Error(
    `vercel_provider_error status=${status} detail=${redactVercelDiagnostic(body)}`,
  );
}
