export function redactGitHubDiagnostic(value) {
  return String(value)
    .replace(/Bearer\s+[^\s"']+/gu, "[REDACTED_AUTHORIZATION]")
    .replace(/\b(?:ghs|ghp|github_pat)_[A-Za-z0-9_]+/gu, "[REDACTED_TOKEN]")
    .replace(
      /-----BEGIN[^-]+-----[\s\S]*?-----END[^-]+-----/gu,
      "[REDACTED_PRIVATE_KEY]",
    );
}

export function safeProviderError(status, body = "") {
  return new Error(
    `github_provider_error status=${status} detail=${redactGitHubDiagnostic(body)}`,
  );
}
