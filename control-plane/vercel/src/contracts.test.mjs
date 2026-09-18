import assert from "node:assert/strict";
import test from "node:test";

import { providerFailure } from "./contracts.mjs";

test("classifies a 429 as a rate-limit wait with retry-after", () => {
  assert.deepEqual(providerFailure({ status: 429, retryAfterSeconds: 30 }), {
    kind: "waiting",
    reason: "provider_rate_limit",
    retryAfterSeconds: 30,
  });
});

test("classifies a rate-limited 403 as a wait without a retry-after", () => {
  assert.deepEqual(providerFailure({ status: 403, rateLimited: true }), {
    kind: "waiting",
    reason: "provider_rate_limit",
    retryAfterSeconds: undefined,
  });
});

test("classifies a plain 403 as a permission failure", () => {
  assert.deepEqual(providerFailure({ status: 403 }), {
    kind: "failed",
    code: "vercel_permission_missing",
  });
});

test("classifies a 404 as a missing resource", () => {
  assert.deepEqual(providerFailure({ status: 404 }), {
    kind: "failed",
    code: "vercel_resource_missing",
  });
});

test("classifies anything else as an opaque provider error", () => {
  assert.deepEqual(providerFailure({ status: 500 }), {
    kind: "failed",
    code: "vercel_provider_error",
  });
});
