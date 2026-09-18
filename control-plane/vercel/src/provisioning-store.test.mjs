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
              external_id: "prj_client",
              idempotency_key: "run:create_projects",
              provider: "vercel",
              slug: "northside",
              step_id: "step-1",
              step_key: "create_projects",
            },
          ],
          error: null,
        };
      },
    },
  });

  assert.deepEqual(await store.claim(), {
    externalId: "prj_client",
    id: "step-1",
    idempotencyKey: "run:create_projects",
    provider: "vercel",
    slug: "northside",
    stepKey: "create_projects",
  });
  assert.deepEqual(calls, [
    {
      args: { p_lock_seconds: 300, p_providers: ["vercel"], p_run_id: null },
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
    retryAfterSeconds: 60,
    stepId: "step-1",
    waitingReason: "customer_dns",
  });

  assert.deepEqual(calls, [
    {
      args: {
        p_error_code: null,
        p_external_id: null,
        p_observed_state: {},
        p_outcome: "waiting",
        p_retry_after: "2026-09-18T00:01:00.000Z",
        p_step_id: "step-1",
        p_waiting_reason: "customer_dns",
      },
      name: "complete_provisioning_step_v1",
    },
  ]);
});

test("reads the canonical project identity from the durable run state", async () => {
  const calls = [];
  const store = createSupabaseProvisioningStore({
    supabase: {
      rpc: async (name, args) => {
        calls.push({ args, name });
        return {
          data: [
            {
              client_project_id: "prj_client",
              client_project_name: "northside-client",
              dashboard_project_id: "prj_dashboard",
              dashboard_project_name: "northside-dashboard",
            },
          ],
          error: null,
        };
      },
    },
  });

  assert.deepEqual(await store.vercelProjectsFor({ runId: "run-1" }), {
    clientProjectId: "prj_client",
    clientProjectName: "northside-client",
    dashboardProjectId: "prj_dashboard",
    dashboardProjectName: "northside-dashboard",
  });
  assert.deepEqual(calls, [
    {
      args: { p_run_id: "run-1" },
      name: "vercel_projects_for_run_v1",
    },
  ]);
});
