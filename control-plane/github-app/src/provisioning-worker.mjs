function safeRepositoryState(repository) {
  return {
    repository_name: repository.name,
    private: repository.private === true,
    default_branch: repository.defaultBranch ?? null,
  };
}

export function createGitHubProvisioningWorker({ github, store }) {
  async function runOnce() {
    const step = await store.claim();
    if (!step) return { kind: "idle" };
    if (step.provider !== "github") return { kind: "skipped", reason: "not_github" };
    if (step.stepKey !== "seed_repository") {
      await store.complete({ stepId: step.id, outcome: "failed", errorCode: "github_step_not_implemented" });
      return { kind: "failed", stepKey: step.stepKey };
    }
    try {
      const repository = await github.createOrResolveRepository({ name: step.slug, idempotencyKey: step.idempotencyKey });
      await store.complete({ stepId: step.id, outcome: "succeeded", externalId: repository.externalId, observedState: safeRepositoryState(repository) });
      return { kind: "completed", stepKey: step.stepKey };
    } catch {
      await store.complete({ stepId: step.id, outcome: "failed", errorCode: "github_repository_unconfirmed" });
      return { kind: "failed", stepKey: step.stepKey };
    }
  }
  return { runOnce };
}
