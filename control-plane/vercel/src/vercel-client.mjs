import { providerFailure } from "./contracts.mjs";
import { safeProviderError } from "./redaction.mjs";

function projectObservation(project) {
  if (!project || typeof project.id !== "string" || typeof project.name !== "string") {
    throw new Error(
      "vercel_provider_error status=200 detail=[REDACTED_INVALID_PROJECT_RESPONSE]",
    );
  }
  return { id: project.id, name: project.name };
}

export function createVercelClient({
  accessToken,
  fetchImpl = fetch,
  organization,
  teamId,
}) {
  async function vercelRequest(path, init = {}) {
    const separator = path.includes("?") ? "&" : "?";
    let response;
    try {
      response = await fetchImpl(
        `https://api.vercel.com${path}${separator}teamId=${teamId}`,
        {
          ...init,
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
            ...init.headers,
          },
        },
      );
    } catch {
      throw new Error("vercel_provider_network_error");
    }
    const rawPayload = await response.text();
    let payload = {};
    if (rawPayload) {
      try {
        payload = JSON.parse(rawPayload);
      } catch {
        payload = {};
      }
    }
    return { payload, response };
  }

  function retryAfterSeconds(response) {
    const value = response.headers.get("retry-after");
    if (!value || !/^\d+$/u.test(value)) return undefined;
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : undefined;
  }

  function providerResult(response) {
    return providerFailure({
      rateLimited: response.status === 429,
      retryAfterSeconds: retryAfterSeconds(response),
      status: response.status,
    });
  }

  async function resolveProject({ name }) {
    const { payload, response } = await vercelRequest(
      `/v9/projects/${encodeURIComponent(name)}`,
    );
    if (response.status === 404) return null;
    if (!response.ok) throw safeProviderError(response.status, JSON.stringify(payload));
    return projectObservation(payload);
  }

  async function createOrResolveProject({ name, rootDirectory, repositoryName }) {
    const existing = await resolveProject({ name });
    if (existing) return existing;
    try {
      const { payload, response } = await vercelRequest("/v11/projects", {
        method: "POST",
        body: JSON.stringify({
          name,
          rootDirectory,
          framework: "nextjs",
          gitRepository: { type: "github", repo: `${organization}/${repositoryName}` },
        }),
      });
      if (!response.ok)
        throw safeProviderError(response.status, JSON.stringify(payload));
      return projectObservation(payload);
    } catch {
      const reconciled = await resolveProject({ name });
      if (reconciled) return reconciled;
      throw new Error("vercel_create_unconfirmed");
    }
  }

  async function createProjects({ repository }) {
    let client;
    let dashboard;
    try {
      client = await createOrResolveProject({
        name: `${repository.name}-client`,
        rootDirectory: "apps/client",
        repositoryName: repository.name,
      });
      dashboard = await createOrResolveProject({
        name: `${repository.name}-dashboard`,
        rootDirectory: "apps/dashboard",
        repositoryName: repository.name,
      });
    } catch {
      return { kind: "failed", code: "vercel_project_unconfirmed" };
    }
    return {
      kind: "succeeded",
      externalId: client.id,
      clientProjectId: client.id,
      clientProjectName: client.name,
      dashboardProjectId: dashboard.id,
      dashboardProjectName: dashboard.name,
    };
  }

  // One project's variables at a time: create what's missing, update what
  // changed, by (key, target). ponytail: no delete-of-stale-keys pass yet —
  // add one if a variable is ever removed from a spec rather than rotated.
  async function applyEnvironment(projectId, variables) {
    const listing = await vercelRequest(`/v10/projects/${projectId}/env`);
    if (!listing.response.ok) return providerResult(listing.response);
    const existing = Array.isArray(listing.payload.envs) ? listing.payload.envs : [];
    const byKey = new Map(existing.map((entry) => [entry.key, entry]));
    for (const variable of variables) {
      const current = byKey.get(variable.key);
      const path = current
        ? `/v10/projects/${projectId}/env/${current.id}`
        : `/v10/projects/${projectId}/env`;
      const { response } = await vercelRequest(path, {
        method: current ? "PATCH" : "POST",
        body: JSON.stringify({
          key: variable.key,
          value: variable.value,
          type: variable.type ?? "encrypted",
          target: variable.target,
        }),
      });
      if (!response.ok) return providerResult(response);
    }
    return { kind: "succeeded" };
  }

  async function configureEnvironment({
    dashboardVariables,
    projects,
    clientVariables,
  }) {
    const client = await applyEnvironment(projects.clientProjectId, clientVariables);
    if (client.kind !== "succeeded") return client;
    const dashboard = await applyEnvironment(
      projects.dashboardProjectId,
      dashboardVariables,
    );
    if (dashboard.kind !== "succeeded") return dashboard;
    return {
      kind: "succeeded",
      externalId: projects.clientProjectId,
      clientVariableCount: clientVariables.length,
      dashboardVariableCount: dashboardVariables.length,
    };
  }

  async function deployProject({ commitSha, projectId, ref, repositoryName }) {
    const { payload, response } = await vercelRequest("/v13/deployments", {
      method: "POST",
      body: JSON.stringify({
        name: projectId,
        project: projectId,
        target: "production",
        gitSource: {
          type: "github",
          org: organization,
          repo: repositoryName,
          ref,
          sha: commitSha,
        },
      }),
    });
    if (!response.ok) return { failure: providerResult(response) };
    if (typeof payload.id !== "string") {
      return { failure: { kind: "failed", code: "vercel_deployment_state_invalid" } };
    }
    return { deploymentId: payload.id, readyState: payload.readyState ?? "QUEUED" };
  }

  async function deployApplications({ commitSha, projects, ref, repositoryName }) {
    const client = await deployProject({
      commitSha,
      projectId: projects.clientProjectId,
      ref,
      repositoryName,
    });
    if (client.failure) return client.failure;
    const dashboard = await deployProject({
      commitSha,
      projectId: projects.dashboardProjectId,
      ref,
      repositoryName,
    });
    if (dashboard.failure) return dashboard.failure;
    return {
      kind: "succeeded",
      externalId: client.deploymentId,
      clientDeploymentId: client.deploymentId,
      dashboardDeploymentId: dashboard.deploymentId,
      commitSha,
    };
  }

  async function attachAndVerifyDomain(projectId, domain) {
    const attach = await vercelRequest(`/v10/projects/${projectId}/domains`, {
      method: "POST",
      body: JSON.stringify({ name: domain }),
    });
    if (!attach.response.ok && attach.response.status !== 409) {
      return providerResult(attach.response);
    }
    const config = await vercelRequest(
      `/v6/domains/${encodeURIComponent(domain)}/config`,
    );
    if (!config.response.ok) return providerResult(config.response);
    if (config.payload.misconfigured === true) {
      return {
        kind: "waiting",
        reason: "customer_dns",
        retryAfterSeconds: 60,
      };
    }
    return { kind: "succeeded" };
  }

  async function verifyDomains({ domains, projects }) {
    for (const domain of domains.client) {
      const result = await attachAndVerifyDomain(projects.clientProjectId, domain);
      if (result.kind !== "succeeded") return result;
    }
    for (const domain of domains.dashboard) {
      const result = await attachAndVerifyDomain(projects.dashboardProjectId, domain);
      if (result.kind !== "succeeded") return result;
    }
    return {
      kind: "succeeded",
      externalId: projects.clientProjectId,
      clientDomains: domains.client,
      dashboardDomains: domains.dashboard,
    };
  }

  return {
    configureEnvironment,
    createOrResolveProject,
    createProjects,
    deployApplications,
    resolveProject,
    verifyDomains,
  };
}
