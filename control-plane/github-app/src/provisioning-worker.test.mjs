import assert from "node:assert/strict";
import test from "node:test";

import { createGitHubProvisioningWorker } from "./provisioning-worker.mjs";

test("does not call GitHub when no step is claimable", async () => {
  const github = { createOrResolveRepository: async () => assert.fail("must not call GitHub") };
  const worker = createGitHubProvisioningWorker({ github, store: { claim: async () => null, complete: async () => assert.fail("must not complete") } });
  assert.deepEqual(await worker.runOnce(), { kind: "idle" });
});

test("reports one successful seed with only safe repository observations", async () => {
  const completions = [];
  const worker = createGitHubProvisioningWorker({
    github: { createOrResolveRepository: async () => ({ externalId: "R_kgDOrepo", name: "northside", private: true, defaultBranch: "main" }) },
    store: {
      claim: async () => ({ id: "step-1", provider: "github", stepKey: "seed_repository", slug: "northside", idempotencyKey: "run:seed" }),
      complete: async (command) => completions.push(command),
    },
  });
  assert.deepEqual(await worker.runOnce(), { kind: "completed", stepKey: "seed_repository" });
  assert.deepEqual(completions, [{ stepId: "step-1", outcome: "succeeded", externalId: "R_kgDOrepo", observedState: { repository_name: "northside", private: true, default_branch: "main" } }]);
});
