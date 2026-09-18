import assert from "node:assert/strict";
import test from "node:test";

import { createGitHubProvisioningWorker } from "./provisioning-worker.mjs";

test("does not call GitHub when no step is claimable", async () => {
  const github = {
    createOrResolveRepository: async () => assert.fail("must not call GitHub"),
  };
  const worker = createGitHubProvisioningWorker({
    github,
    store: {
      claim: async () => null,
      complete: async () => assert.fail("must not complete"),
    },
  });
  assert.deepEqual(await worker.runOnce(), { kind: "idle" });
});

test("reports one successful seed with only safe repository observations", async () => {
  const completions = [];
  const release = {
    files: [{ content: Buffer.from("{}\n"), path: "distribution-manifest.json" }],
    treeSha256: "a".repeat(64),
  };
  let seeded;
  const worker = createGitHubProvisioningWorker({
    github: {
      seedRepository: async (input) => {
        seeded = input;
        return {
          commitSha: "b".repeat(40),
          defaultBranch: "main",
          externalId: "42",
          kind: "succeeded",
          name: "northside",
          private: true,
          releaseTreeSha256: "a".repeat(64),
          treeSha: "c".repeat(40),
        };
      },
    },
    loadRelease: async () => release,
    store: {
      claim: async () => ({
        id: "step-1",
        provider: "github",
        stepKey: "seed_repository",
        slug: "northside",
        idempotencyKey: "run:seed",
      }),
      complete: async (command) => completions.push(command),
    },
  });
  assert.deepEqual(await worker.runOnce(), {
    kind: "completed",
    stepKey: "seed_repository",
  });
  assert.deepEqual(seeded, {
    defaultBranch: "main",
    idempotencyKey: "run:seed",
    name: "northside",
    release,
  });
  assert.deepEqual(completions, [
    {
      stepId: "step-1",
      outcome: "succeeded",
      externalId: "42",
      observedState: {
        repository_name: "northside",
        private: true,
        default_branch: "main",
        commit_sha: "b".repeat(40),
        tree_sha: "c".repeat(40),
        release_tree_sha256: "a".repeat(64),
      },
    },
  ]);
});

test("maps a rate-limited configuration commit into one durable wait", async () => {
  const completions = [];
  const configuration = {
    defaultBranch: "main",
    files: [
      {
        content: Buffer.from('{"defaultLocale":"en"}\n'),
        path: "instance/manifest.json",
      },
    ],
    repository: { name: "northside", restId: 42 },
  };
  let committed;
  const worker = createGitHubProvisioningWorker({
    github: {
      commitConfiguration: async (input) => {
        committed = input;
        return {
          kind: "waiting",
          reason: "provider_rate_limit",
          retryAfterSeconds: 45,
        };
      },
    },
    loadConfiguration: async () => configuration,
    store: {
      claim: async () => ({
        id: "step-configuration",
        provider: "github",
        stepKey: "commit_configuration",
        slug: "northside",
        idempotencyKey: "run:configuration",
      }),
      complete: async (command) => completions.push(command),
    },
  });

  assert.deepEqual(await worker.runOnce(), {
    kind: "waiting",
    stepKey: "commit_configuration",
  });
  assert.deepEqual(committed, configuration);
  assert.deepEqual(completions, [
    {
      stepId: "step-configuration",
      outcome: "waiting",
      waitingReason: "provider_rate_limit",
      retryAfterSeconds: 45,
    },
  ]);
});
