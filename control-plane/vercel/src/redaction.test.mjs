import assert from "node:assert/strict";
import test from "node:test";

import { redactVercelDiagnostic, safeProviderError } from "./redaction.mjs";

test("redacts a bearer token out of a diagnostic body", () => {
  assert.equal(
    redactVercelDiagnostic('{"authorization":"Bearer abc123secret"}'),
    '{"authorization":"[REDACTED_AUTHORIZATION]"}',
  );
});

test("builds a stable error message with the redacted body", () => {
  const error = safeProviderError(401, "Bearer abc123secret");
  assert.equal(
    error.message,
    "vercel_provider_error status=401 detail=[REDACTED_AUTHORIZATION]",
  );
});
