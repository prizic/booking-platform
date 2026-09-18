import { createSign } from "node:crypto";

import { safeProviderError } from "./redaction.mjs";

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function appJwt({ appId, privateKey, now }) {
  const issuedAt = Math.floor(now().getTime() / 1000) - 30;
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({ iat: issuedAt, exp: issuedAt + 540, iss: appId }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  return `${header}.${payload}.${signer.sign(privateKey).toString("base64url")}`;
}

function repositoryObservation(repository) {
  if (
    !repository ||
    typeof repository.node_id !== "string" ||
    typeof repository.name !== "string"
  ) {
    throw new Error(
      "github_provider_error status=200 detail=[REDACTED_INVALID_REPOSITORY_RESPONSE]",
    );
  }
  return {
    externalId: repository.node_id,
    name: repository.name,
    private: repository.private === true,
    defaultBranch: repository.default_branch ?? null,
  };
}

export function createGitHubAppClient({
  appId,
  installationId,
  organization,
  privateKey,
  fetchImpl = fetch,
  now = () => new Date(),
}) {
  let token = null;
  let tokenExpiresAt = 0;

  async function requestInstallationToken() {
    if (token && now().getTime() < tokenExpiresAt - 60_000) return token;
    const response = await fetchImpl(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${appJwt({ appId, privateKey, now })}`,
          "user-agent": "wlbp-github-app-provisioner",
          "x-github-api-version": "2022-11-28",
        },
      },
    );
    const payload = await response.json();
    if (
      !response.ok ||
      typeof payload.token !== "string" ||
      typeof payload.expires_at !== "string"
    ) {
      throw safeProviderError(response.status, JSON.stringify(payload));
    }
    token = payload.token;
    tokenExpiresAt = Date.parse(payload.expires_at);
    return token;
  }

  async function githubRequest(path, init = {}) {
    const installationToken = await requestInstallationToken();
    let response;
    try {
      response = await fetchImpl(`https://api.github.com${path}`, {
        ...init,
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${installationToken}`,
          "user-agent": "wlbp-github-app-provisioner",
          "x-github-api-version": "2022-11-28",
          ...init.headers,
        },
      });
    } catch (error) {
      throw new Error("github_provider_network_error");
    }
    const payload = await response.json();
    return { payload, response };
  }

  async function resolveRepository({ name }) {
    const { response, payload } = await githubRequest(
      `/repos/${organization}/${encodeURIComponent(name)}`,
    );
    if (response.status === 404) return null;
    if (!response.ok) throw safeProviderError(response.status, JSON.stringify(payload));
    return repositoryObservation(payload);
  }

  async function createOrResolveRepository({ name, idempotencyKey }) {
    const existing = await resolveRepository({ name });
    if (existing) return existing;
    try {
      const { response, payload } = await githubRequest(`/orgs/${organization}/repos`, {
        method: "POST",
        headers: { "x-github-idempotency-key": idempotencyKey },
        body: JSON.stringify({
          name,
          private: true,
          has_issues: true,
          has_projects: false,
          has_wiki: false,
        }),
      });
      if (!response.ok)
        throw safeProviderError(response.status, JSON.stringify(payload));
      return repositoryObservation(payload);
    } catch {
      const reconciled = await resolveRepository({ name });
      if (reconciled) return reconciled;
      throw new Error("github_create_unconfirmed");
    }
  }

  return { createOrResolveRepository, resolveRepository };
}
