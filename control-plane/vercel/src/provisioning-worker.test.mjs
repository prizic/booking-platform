import assert from "node:assert/strict";
import test from "node:test";

import { createVercelProvisioningWorker } from "./provisioning-worker.mjs";

test("does not call Vercel when no step is claimable", async () => {
  const worker = createVercelProvisioningWorker({
    vercel: { createProjects: async () => assert.fail("must not call Vercel") },
    store: {
      claim: async () => null,
      complete: async () => assert.fail("must not complete"),
    },
  });
  assert.deepEqual(await worker.runOnce(), { kind: "idle" });
});

test("reports one successful project pair with only safe project observations", async () => {
  const completions = [];
  const worker = createVercelProvisioningWorker({
    vercel: {
      createProjects: async ({ repository }) => {
        assert.equal(repository.name, "northside");
        return {
          kind: "succeeded",
          externalId: "prj_client",
          clientProjectId: "prj_client",
          clientProjectName: "northside-client",
          dashboardProjectId: "prj_dashboard",
          dashboardProjectName: "northside-dashboard",
        };
      },
    },
    loadRepository: async () => ({ name: "northside" }),
    store: {
      claim: async () => ({
        id: "step-1",
        provider: "vercel",
        stepKey: "create_projects",
        idempotencyKey: "run:create_projects",
      }),
      complete: async (command) => completions.push(command),
    },
  });
  assert.deepEqual(await worker.runOnce(), {
    kind: "completed",
    stepKey: "create_projects",
  });
  assert.deepEqual(completions, [
    {
      stepId: "step-1",
      outcome: "succeeded",
      externalId: "prj_client",
      observedState: {
        client_project_id: "prj_client",
        client_project_name: "northside-client",
        dashboard_project_id: "prj_dashboard",
        dashboard_project_name: "northside-dashboard",
      },
    },
  ]);
});

test("maps a DNS-pending domain verification into one durable wait", async () => {
  const completions = [];
  const worker = createVercelProvisioningWorker({
    vercel: {
      verifyDomains: async () => ({
        kind: "waiting",
        reason: "customer_dns",
        retryAfterSeconds: 60,
      }),
    },
    loadDomains: async () => ({ client: ["book.example.com"], dashboard: [] }),
    store: {
      claim: async () => ({
        id: "step-domains",
        provider: "vercel",
        runId: "run-1",
        stepKey: "verify_domains",
      }),
      complete: async (command) => completions.push(command),
      vercelProjectsFor: async () => ({
        clientProjectId: "prj_client",
        dashboardProjectId: "prj_dashboard",
      }),
    },
  });

  assert.deepEqual(await worker.runOnce(), {
    kind: "waiting",
    stepKey: "verify_domains",
  });
  assert.deepEqual(completions, [
    {
      stepId: "step-domains",
      outcome: "waiting",
      waitingReason: "customer_dns",
      retryAfterSeconds: 60,
    },
  ]);
});

test("loads the canonical project identity before configuring environment", async () => {
  const completions = [];
  let environmentInput;
  const worker = createVercelProvisioningWorker({
    vercel: {
      configureEnvironment: async (input) => {
        environmentInput = input;
        return { kind: "succeeded", clientVariableCount: 2, dashboardVariableCount: 1 };
      },
    },
    loadEnvironment: async (step) => {
      assert.deepEqual(step.projects, {
        clientProjectId: "prj_client",
        dashboardProjectId: "prj_dashboard",
      });
      return {
        clientVariables: [
          { key: "A", value: "1" },
          { key: "B", value: "2" },
        ],
        dashboardVariables: [{ key: "C", value: "3" }],
      };
    },
    store: {
      claim: async () => ({
        id: "step-env",
        provider: "vercel",
        runId: "run-1",
        stepKey: "configure_environment",
      }),
      complete: async (command) => completions.push(command),
      vercelProjectsFor: async () => ({
        clientProjectId: "prj_client",
        dashboardProjectId: "prj_dashboard",
      }),
    },
  });

  assert.deepEqual(await worker.runOnce(), {
    kind: "completed",
    stepKey: "configure_environment",
  });
  assert.deepEqual(environmentInput.projects, {
    clientProjectId: "prj_client",
    dashboardProjectId: "prj_dashboard",
  });
  assert.deepEqual(completions[0], {
    stepId: "step-env",
    outcome: "succeeded",
    externalId: undefined,
    observedState: { client_variable_count: 2, dashboard_variable_count: 1 },
  });
});

test("fails before Vercel when the persisted project identity is unavailable", async () => {
  const completions = [];
  const worker = createVercelProvisioningWorker({
    vercel: { configureEnvironment: async () => assert.fail("must not call Vercel") },
    loadEnvironment: async () => assert.fail("must not load environment"),
    store: {
      claim: async () => ({
        id: "step-env",
        provider: "vercel",
        runId: "run-1",
        stepKey: "configure_environment",
      }),
      complete: async (command) => completions.push(command),
      vercelProjectsFor: async () => null,
    },
  });

  assert.deepEqual(await worker.runOnce(), {
    kind: "failed",
    stepKey: "configure_environment",
  });
  assert.deepEqual(completions, [
    {
      errorCode: "vercel_project_identity_unavailable",
      outcome: "failed",
      stepId: "step-env",
    },
  ]);
});

test("a restarted worker does not replay a create_projects step already completed durably", async () => {
  const completions = [];
  let claimed = true;
  let createCalls = 0;
  const store = {
    claim: async () => {
      if (!claimed) return null;
      claimed = false;
      return {
        id: "step-create",
        idempotencyKey: "run-1:create_projects",
        provider: "vercel",
        stepKey: "create_projects",
      };
    },
    complete: async (command) => completions.push(command),
  };
  const vercel = {
    createProjects: async () => {
      createCalls += 1;
      return {
        kind: "succeeded",
        externalId: "prj_client",
        clientProjectId: "prj_client",
        dashboardProjectId: "prj_dashboard",
      };
    },
  };
  const loadRepository = async () => ({ name: "northside" });

  await createVercelProvisioningWorker({ loadRepository, store, vercel }).runOnce();
  assert.deepEqual(
    await createVercelProvisioningWorker({ loadRepository, store, vercel }).runOnce(),
    { kind: "idle" },
  );
  assert.equal(createCalls, 1);
  assert.equal(completions.length, 1);
});
