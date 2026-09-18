import assert from "node:assert/strict";
import test from "node:test";

import { providerFailure } from "./contracts.mjs";

test("maps a GitHub primary rate limit into an explicit durable wait", () => {
  assert.deepEqual(providerFailure({ status: 429, retryAfterSeconds: 45 }), {
    kind: "waiting",
    reason: "provider_rate_limit",
    retryAfterSeconds: 45,
  });
});

test("maps a missing installation scope to a non-retryable provider result", () => {
  assert.deepEqual(providerFailure({ status: 404 }), {
    kind: "failed",
    code: "github_scope_or_resource_missing",
  });
});
