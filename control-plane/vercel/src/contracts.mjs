export function providerFailure({ rateLimited = false, retryAfterSeconds, status }) {
  if (status === 429 || (status === 403 && rateLimited)) {
    return {
      kind: "waiting",
      reason: "provider_rate_limit",
      retryAfterSeconds:
        Number.isInteger(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds
          : undefined,
    };
  }
  if (status === 404) {
    return { kind: "failed", code: "vercel_resource_missing" };
  }
  if (status === 403) {
    return { kind: "failed", code: "vercel_permission_missing" };
  }
  return { kind: "failed", code: "vercel_provider_error" };
}
