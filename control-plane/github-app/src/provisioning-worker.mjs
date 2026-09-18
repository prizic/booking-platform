function safeRepositoryState(repository) {
  const state = {
    repository_name: repository.name,
    private: repository.private === true,
    default_branch: repository.defaultBranch ?? null,
  };
  if (typeof repository.commitSha === "string") state.commit_sha = repository.commitSha;
  if (typeof repository.treeSha === "string") state.tree_sha = repository.treeSha;
  if (typeof repository.releaseTreeSha256 === "string") {
    state.release_tree_sha256 = repository.releaseTreeSha256;
  }
  if (Number.isInteger(repository.restId) && repository.restId > 0)
    state.repository_rest_id = repository.restId;
  if (typeof repository.organization === "string")
    state.github_organization = repository.organization;
  if (typeof repository.installationId === "string")
    state.github_installation_id = repository.installationId;
  if (typeof repository.rulesetId === "string")
    state.github_ruleset_id = repository.rulesetId;
  return state;
}

export function createGitHubProvisioningWorker({
  github,
  loadConfiguration,
  loadGovernance,
  loadRelease,
  store,
}) {
  async function repositoryForStep(step) {
    if (typeof store.githubRepositoryFor !== "function")
      return { kind: "failed", code: "github_repository_identity_unavailable" };
    try {
      const repository = await store.githubRepositoryFor(step);
      if (
        !repository ||
        typeof repository.externalId !== "string" ||
        typeof repository.name !== "string" ||
        !Number.isInteger(repository.restId) ||
        repository.restId <= 0
      ) {
        return { kind: "failed", code: "github_repository_identity_unavailable" };
      }
      return { kind: "succeeded", repository };
    } catch {
      return { kind: "failed", code: "github_repository_identity_unavailable" };
    }
  }

  const handlers = {
    commit_configuration: async (step) => {
      const identity = await repositoryForStep(step);
      if (identity.kind !== "succeeded") return identity;
      if (typeof loadConfiguration !== "function") {
        return { kind: "failed", code: "github_configuration_unavailable" };
      }
      let configuration;
      try {
        configuration = await loadConfiguration({
          ...step,
          repository: identity.repository,
        });
      } catch {
        return { kind: "failed", code: "github_configuration_unavailable" };
      }
      return github.commitConfiguration({
        ...configuration,
        repository: identity.repository,
      });
    },
    protect_repository: async (step) => {
      const identity = await repositoryForStep(step);
      if (identity.kind !== "succeeded") return identity;
      if (typeof loadGovernance !== "function") {
        return { kind: "failed", code: "github_governance_unavailable" };
      }
      let governance;
      try {
        governance = await loadGovernance({ ...step, repository: identity.repository });
      } catch {
        return { kind: "failed", code: "github_governance_unavailable" };
      }
      return github.applyGovernance({ ...governance, repository: identity.repository });
    },
    seed_repository: async (step) => {
      if (typeof loadRelease !== "function") {
        return { kind: "failed", code: "github_release_artifact_unavailable" };
      }
      let release;
      try {
        release = await loadRelease(step);
      } catch {
        return { kind: "failed", code: "github_release_artifact_unavailable" };
      }
      return github.seedRepository({
        defaultBranch: "main",
        name: step.slug,
        idempotencyKey: step.idempotencyKey,
        release,
      });
    },
  };

  async function runOnce() {
    const step = await store.claim();
    if (!step) return { kind: "idle" };
    if (step.provider !== "github") return { kind: "skipped", reason: "not_github" };
    const handler = handlers[step.stepKey];
    if (!handler) {
      await store.complete({
        stepId: step.id,
        outcome: "failed",
        errorCode: "github_step_not_implemented",
      });
      return { kind: "failed", stepKey: step.stepKey };
    }
    try {
      const repository = await handler(step);
      if (repository?.kind === "waiting") {
        await store.complete({
          stepId: step.id,
          outcome: "waiting",
          waitingReason: repository.reason,
          retryAfterSeconds: repository.retryAfterSeconds,
        });
        return { kind: "waiting", stepKey: step.stepKey };
      }
      if (repository?.kind === "failed") {
        await store.complete({
          stepId: step.id,
          outcome: "failed",
          errorCode: repository.code,
        });
        return { kind: "failed", stepKey: step.stepKey };
      }
      await store.complete({
        stepId: step.id,
        outcome: "succeeded",
        externalId: repository.externalId,
        observedState: safeRepositoryState(repository),
      });
      return { kind: "completed", stepKey: step.stepKey };
    } catch {
      await store.complete({
        stepId: step.id,
        outcome: "failed",
        errorCode: "github_repository_unconfirmed",
      });
      return { kind: "failed", stepKey: step.stepKey };
    }
  }
  return { runOnce };
}
