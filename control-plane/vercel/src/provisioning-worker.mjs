function safeProjectsState(projects) {
  const state = {
    client_project_id: projects.clientProjectId,
    dashboard_project_id: projects.dashboardProjectId,
  };
  if (typeof projects.clientProjectName === "string") {
    state.client_project_name = projects.clientProjectName;
  }
  if (typeof projects.dashboardProjectName === "string") {
    state.dashboard_project_name = projects.dashboardProjectName;
  }
  return state;
}

function safeEnvironmentState(result) {
  return {
    client_variable_count: result.clientVariableCount,
    dashboard_variable_count: result.dashboardVariableCount,
  };
}

function safeDeploymentState(result) {
  return {
    client_deployment_id: result.clientDeploymentId,
    dashboard_deployment_id: result.dashboardDeploymentId,
    commit_sha: result.commitSha,
  };
}

function safeDomainState(result) {
  return {
    client_domains: result.clientDomains,
    dashboard_domains: result.dashboardDomains,
  };
}

export function createVercelProvisioningWorker({
  loadDomains,
  loadEnvironment,
  loadRepository,
  store,
  vercel,
}) {
  async function projectsForStep(step) {
    if (typeof store.vercelProjectsFor !== "function") {
      return { kind: "failed", code: "vercel_project_identity_unavailable" };
    }
    try {
      const projects = await store.vercelProjectsFor(step);
      if (
        !projects ||
        typeof projects.clientProjectId !== "string" ||
        typeof projects.dashboardProjectId !== "string"
      ) {
        return { kind: "failed", code: "vercel_project_identity_unavailable" };
      }
      return { kind: "succeeded", projects };
    } catch {
      return { kind: "failed", code: "vercel_project_identity_unavailable" };
    }
  }

  const handlers = {
    create_projects: async (step) => {
      if (typeof loadRepository !== "function") {
        return { kind: "failed", code: "vercel_repository_unavailable" };
      }
      let repository;
      try {
        repository = await loadRepository(step);
      } catch {
        return { kind: "failed", code: "vercel_repository_unavailable" };
      }
      if (!repository || typeof repository.name !== "string") {
        return { kind: "failed", code: "vercel_repository_unavailable" };
      }
      const result = await vercel.createProjects({ repository });
      if (result.kind !== "succeeded") return result;
      return {
        ...result,
        observedState: safeProjectsState(result),
      };
    },
    configure_environment: async (step) => {
      const identity = await projectsForStep(step);
      if (identity.kind !== "succeeded") return identity;
      if (typeof loadEnvironment !== "function") {
        return { kind: "failed", code: "vercel_environment_unavailable" };
      }
      let environment;
      try {
        environment = await loadEnvironment({ ...step, projects: identity.projects });
      } catch {
        return { kind: "failed", code: "vercel_environment_unavailable" };
      }
      const result = await vercel.configureEnvironment({
        ...environment,
        projects: identity.projects,
      });
      if (result.kind !== "succeeded") return result;
      return { ...result, observedState: safeEnvironmentState(result) };
    },
    deploy_applications: async (step) => {
      const identity = await projectsForStep(step);
      if (identity.kind !== "succeeded") return identity;
      if (typeof loadRepository !== "function") {
        return { kind: "failed", code: "vercel_repository_unavailable" };
      }
      let repository;
      try {
        repository = await loadRepository(step);
      } catch {
        return { kind: "failed", code: "vercel_repository_unavailable" };
      }
      if (!repository || typeof repository.commitSha !== "string") {
        return { kind: "failed", code: "vercel_repository_unavailable" };
      }
      const result = await vercel.deployApplications({
        commitSha: repository.commitSha,
        projects: identity.projects,
        ref: repository.defaultBranch ?? "main",
        repositoryName: repository.name,
      });
      if (result.kind !== "succeeded") return result;
      return { ...result, observedState: safeDeploymentState(result) };
    },
    verify_domains: async (step) => {
      const identity = await projectsForStep(step);
      if (identity.kind !== "succeeded") return identity;
      if (typeof loadDomains !== "function") {
        return { kind: "failed", code: "vercel_domains_unavailable" };
      }
      let domains;
      try {
        domains = await loadDomains({ ...step, projects: identity.projects });
      } catch {
        return { kind: "failed", code: "vercel_domains_unavailable" };
      }
      const result = await vercel.verifyDomains({
        domains,
        projects: identity.projects,
      });
      if (result.kind !== "succeeded") return result;
      return { ...result, observedState: safeDomainState(result) };
    },
  };

  async function runOnce() {
    const step = await store.claim();
    if (!step) return { kind: "idle" };
    if (step.provider !== "vercel") return { kind: "skipped", reason: "not_vercel" };
    const handler = handlers[step.stepKey];
    if (!handler) {
      await store.complete({
        stepId: step.id,
        outcome: "failed",
        errorCode: "vercel_step_not_implemented",
      });
      return { kind: "failed", stepKey: step.stepKey };
    }
    try {
      const result = await handler(step);
      if (result?.kind === "waiting") {
        await store.complete({
          stepId: step.id,
          outcome: "waiting",
          waitingReason: result.reason,
          retryAfterSeconds: result.retryAfterSeconds,
        });
        return { kind: "waiting", stepKey: step.stepKey };
      }
      if (result?.kind === "failed") {
        await store.complete({
          stepId: step.id,
          outcome: "failed",
          errorCode: result.code,
        });
        return { kind: "failed", stepKey: step.stepKey };
      }
      await store.complete({
        stepId: step.id,
        outcome: "succeeded",
        externalId: result.externalId,
        observedState: result.observedState,
      });
      return { kind: "completed", stepKey: step.stepKey };
    } catch {
      await store.complete({
        stepId: step.id,
        outcome: "failed",
        errorCode: "vercel_step_unconfirmed",
      });
      return { kind: "failed", stepKey: step.stepKey };
    }
  }
  return { runOnce };
}
