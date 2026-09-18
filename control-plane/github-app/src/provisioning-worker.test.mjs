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
    repository: { externalId: "R_kgDOinstance", name: "northside", restId: 42 },
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
      githubRepositoryFor: async () => configuration.repository,
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

test("loads the canonical repository identity before committing configuration", async () => {
  const completions = [];
  let configurationStep;
  const worker = createGitHubProvisioningWorker({
    github: {
      commitConfiguration: async (input) => {
        assert.deepEqual(input.repository, {
          externalId: "R_kgDOinstance",
          name: "northside",
          restId: 42,
        });
        return {
          commitSha: "b".repeat(40),
          externalId: "R_kgDOinstance",
          kind: "succeeded",
          name: "northside",
          private: true,
          restId: 42,
          treeSha: "c".repeat(40),
        };
      },
    },
    loadConfiguration: async (step) => {
      configurationStep = step;
      return {
        defaultBranch: "main",
        files: [
          {
            content: Buffer.from('{"defaultLocale":"en"}\n'),
            path: "instance/manifest.json",
          },
        ],
        repository: step.repository,
      };
    },
    store: {
      claim: async () => ({
        id: "step-configuration",
        provider: "github",
        runId: "run-1",
        stepKey: "commit_configuration",
      }),
      complete: async (command) => completions.push(command),
      githubRepositoryFor: async () => ({
        externalId: "R_kgDOinstance",
        name: "northside",
        restId: 42,
      }),
    },
  });

  assert.deepEqual(await worker.runOnce(), {
    kind: "completed",
    stepKey: "commit_configuration",
  });
  assert.deepEqual(configurationStep.repository, {
    externalId: "R_kgDOinstance",
    name: "northside",
    restId: 42,
  });
  assert.deepEqual(completions[0], {
    externalId: "R_kgDOinstance",
    observedState: {
      commit_sha: "b".repeat(40),
      default_branch: null,
      private: true,
      repository_name: "northside",
      repository_rest_id: 42,
      tree_sha: "c".repeat(40),
    },
    outcome: "succeeded",
    stepId: "step-configuration",
  });
});

test("fails before GitHub when the persisted repository identity is unavailable", async () => {
  const completions = [];
  const worker = createGitHubProvisioningWorker({
    github: { commitConfiguration: async () => assert.fail("must not call GitHub") },
    loadConfiguration: async () => assert.fail("must not load configuration"),
    store: {
      claim: async () => ({
        id: "step-configuration",
        provider: "github",
        runId: "run-1",
        stepKey: "commit_configuration",
      }),
      complete: async (command) => completions.push(command),
      githubRepositoryFor: async () => null,
    },
  });

  assert.deepEqual(await worker.runOnce(), {
    kind: "failed",
    stepKey: "commit_configuration",
  });
  assert.deepEqual(completions, [
    {
      errorCode: "github_repository_identity_unavailable",
      outcome: "failed",
      stepId: "step-configuration",
    },
  ]);
});

test("applies governance from an explicit policy after loading the canonical repository", async () => {
  const completions = [];
  let governanceInput;
  const worker = createGitHubProvisioningWorker({
    github: {
      applyGovernance: async (input) => {
        governanceInput = input;
        return {
          defaultBranch: "main",
          externalId: "R_kgDOinstance",
          kind: "succeeded",
          name: "northside",
          private: true,
          restId: 42,
          rulesetId: "99",
        };
      },
    },
    loadGovernance: async (step) => ({
      defaultBranch: step.repository.defaultBranch,
      requiredChecks: ["Instance CI"],
    }),
    store: {
      claim: async () => ({
        id: "step-protect",
        provider: "github",
        runId: "run-1",
        stepKey: "protect_repository",
      }),
      complete: async (command) => completions.push(command),
      githubRepositoryFor: async () => ({
        defaultBranch: "main",
        externalId: "R_kgDOinstance",
        name: "northside",
        restId: 42,
      }),
    },
  });

  assert.deepEqual(await worker.runOnce(), {
    kind: "completed",
    stepKey: "protect_repository",
  });
  assert.deepEqual(governanceInput, {
    defaultBranch: "main",
    repository: {
      defaultBranch: "main",
      externalId: "R_kgDOinstance",
      name: "northside",
      restId: 42,
    },
    requiredChecks: ["Instance CI"],
  });
  assert.deepEqual(completions[0], {
    externalId: "R_kgDOinstance",
    observedState: {
      default_branch: "main",
      github_ruleset_id: "99",
      private: true,
      repository_name: "northside",
      repository_rest_id: 42,
    },
    outcome: "succeeded",
    stepId: "step-protect",
  });
});

test("fails governance before GitHub when its required-check policy is unavailable", async () => {
  const completions = [];
  const worker = createGitHubProvisioningWorker({
    github: { applyGovernance: async () => assert.fail("must not call GitHub") },
    store: {
      claim: async () => ({
        id: "step-protect",
        provider: "github",
        runId: "run-1",
        stepKey: "protect_repository",
      }),
      complete: async (command) => completions.push(command),
      githubRepositoryFor: async () => ({
        defaultBranch: "main",
        externalId: "R_kgDOinstance",
        name: "northside",
        restId: 42,
      }),
    },
  });

  assert.deepEqual(await worker.runOnce(), {
    kind: "failed",
    stepKey: "protect_repository",
  });
  assert.deepEqual(completions, [
    {
      errorCode: "github_governance_unavailable",
      outcome: "failed",
      stepId: "step-protect",
    },
  ]);
});

test("a restarted worker does not replay a seed step already completed durably", async () => {
  const completions = [];
  let claimed = true;
  let seedCalls = 0;
  const store = {
    claim: async () => {
      if (!claimed) return null;
      claimed = false;
      return {
        id: "step-seed",
        idempotencyKey: "run-1:seed",
        provider: "github",
        slug: "northside",
        stepKey: "seed_repository",
      };
    },
    complete: async (command) => completions.push(command),
  };
  const github = {
    seedRepository: async () => {
      seedCalls += 1;
      return { externalId: "R_kgDOinstance", kind: "succeeded", name: "northside" };
    },
  };
  const loadRelease = async () => ({
    files: [{ content: Buffer.from("{}\n"), path: "distribution-manifest.json" }],
    treeSha256: "a".repeat(64),
  });

  await createGitHubProvisioningWorker({ github, loadRelease, store }).runOnce();
  assert.deepEqual(
    await createGitHubProvisioningWorker({ github, loadRelease, store }).runOnce(),
    { kind: "idle" },
  );
  assert.equal(seedCalls, 1);
  assert.equal(completions.length, 1);
});
