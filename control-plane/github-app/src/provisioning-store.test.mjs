import assert from "node:assert/strict";
import test from "node:test";

import { createSupabaseProvisioningStore } from "./provisioning-store.mjs";

test("claims one durable provisioning step through the database RPC", async () => {
  const calls = [];
  const store = createSupabaseProvisioningStore({
    supabase: {
      rpc: async (name, args) => {
        calls.push({ args, name });
        return {
          data: [
            {
              external_id: "42",
              idempotency_key: "run:seed",
              provider: "github",
              slug: "northside",
              step_id: "step-1",
              step_key: "seed_repository",
            },
          ],
          error: null,
        };
      },
    },
  });

  assert.deepEqual(await store.claim(), {
    externalId: "42",
    id: "step-1",
    idempotencyKey: "run:seed",
    provider: "github",
    slug: "northside",
    stepKey: "seed_repository",
  });
  assert.deepEqual(calls, [
    {
      args: { p_lock_seconds: 300, p_run_id: null },
      name: "claim_provisioning_step_v1",
    },
  ]);
});

test("reports a provider wait with a database-owned retry timestamp", async () => {
  const calls = [];
  const store = createSupabaseProvisioningStore({
    now: () => new Date("2026-09-18T00:00:00.000Z"),
    supabase: {
      rpc: async (name, args) => {
        calls.push({ args, name });
        return { data: [], error: null };
      },
    },
  });

  await store.complete({
    outcome: "waiting",
    retryAfterSeconds: 45,
    stepId: "step-1",
    waitingReason: "provider_rate_limit",
  });

  assert.deepEqual(calls, [
    {
      args: {
        p_error_code: null,
        p_external_id: null,
        p_observed_state: {},
        p_outcome: "waiting",
        p_retry_after: "2026-09-18T00:00:45.000Z",
        p_step_id: "step-1",
        p_waiting_reason: "provider_rate_limit",
      },
      name: "complete_provisioning_step_v1",
    },
  ]);
});

test("reads the canonical repository identity from the durable run state", async () => {
  const calls = [];
  const store = createSupabaseProvisioningStore({
    supabase: {
      rpc: async (name, args) => {
        calls.push({ args, name });
        return {
          data: [
            {
              default_branch: "main",
              repository_external_id: "R_kgDOinstance",
              repository_name: "northside",
              repository_rest_id: 42,
            },
          ],
          error: null,
        };
      },
    },
  });

  assert.deepEqual(await store.githubRepositoryFor({ runId: "run-1" }), {
    defaultBranch: "main",
    externalId: "R_kgDOinstance",
    name: "northside",
    restId: 42,
  });
  assert.deepEqual(calls, [
    {
      args: { p_run_id: "run-1" },
      name: "github_repository_for_run_v1",
    },
  ]);
});
