import { createHash, createSign } from "node:crypto";

import { providerFailure } from "./contracts.mjs";
import { safeProviderError } from "./redaction.mjs";

function isSafeRelativePath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.startsWith("/") &&
    value
      .split("/")
      .every(
        (segment) =>
          segment !== "" &&
          segment !== "." &&
          segment !== ".." &&
          /^[A-Za-z0-9._[\]-]+$/u.test(segment),
      )
  );
}

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
    restId: typeof repository.id === "number" ? repository.id : null,
    defaultBranch: repository.default_branch ?? null,
  };
}

function gitBlobSha(contents) {
  return createHash("sha1")
    .update(`blob ${contents.length}\0`)
    .update(contents)
    .digest("hex");
}

function retryAfterSeconds(response) {
  const value = response.headers.get("retry-after");
  if (!value || !/^\d+$/u.test(value)) return undefined;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : undefined;
}

function providerResult(response) {
  const seconds = retryAfterSeconds(response);
  return providerFailure({
    rateLimited:
      response.status === 429 ||
      (response.status === 403 &&
        (seconds !== undefined ||
          response.headers.get("x-ratelimit-remaining") === "0")),
    retryAfterSeconds: seconds,
    status: response.status,
  });
}

function normalizeConfigurationFiles(files) {
  if (!Array.isArray(files) || files.length === 0) return null;
  const normalized = [];
  const paths = new Set();
  for (const file of files) {
    if (
      !file ||
      typeof file.path !== "string" ||
      !/^instance\/(?:assets\/[A-Za-z0-9][A-Za-z0-9._/-]*|(?:brand|features|navigation)\.json|content\/(?:en|ar)\.json|manifest\.json|theme\.css)$/u.test(
        file.path,
      ) ||
      file.path.includes("..") ||
      paths.has(file.path)
    ) {
      return null;
    }
    const content = Buffer.isBuffer(file.content)
      ? file.content
      : typeof file.content === "string"
        ? Buffer.from(file.content, "utf8")
        : null;
    if (!content || content.length > 8_000_000) return null;
    paths.add(file.path);
    normalized.push({ content, path: file.path });
  }
  return normalized.sort((left, right) => left.path.localeCompare(right.path));
}

function normalizeRelease(release) {
  if (!release || !/^[a-f0-9]{64}$/u.test(release.treeSha256 ?? "")) return null;
  if (!Array.isArray(release.files) || release.files.length === 0) return null;
  const files = [];
  const paths = new Set();
  let manifest;
  for (const file of release.files) {
    if (
      !file ||
      typeof file.path !== "string" ||
      !isSafeRelativePath(file.path) ||
      file.path.includes("..") ||
      paths.has(file.path)
    ) {
      return null;
    }
    const content = Buffer.isBuffer(file.content)
      ? file.content
      : typeof file.content === "string"
        ? Buffer.from(file.content, "utf8")
        : null;
    if (!content || content.length > 100_000_000) return null;
    paths.add(file.path);
    if (file.path === "distribution-manifest.json") manifest = content;
    files.push({ content, path: file.path });
  }
  try {
    if (
      JSON.parse(manifest?.toString("utf8") ?? "").treeSha256 !== release.treeSha256
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export function createGitHubAppClient({
  appId,
  installationId,
  organization,
  privateKey,
  fetchImpl = fetch,
  now = () => new Date(),
}) {
  const tokens = new Map();

  async function requestInstallationToken({ repositoryIds } = {}) {
    const scope = repositoryIds?.join(",") ?? "installation";
    const cached = tokens.get(scope);
    if (cached && now().getTime() < cached.expiresAt - 60_000) return cached.token;
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
        ...(repositoryIds
          ? { body: JSON.stringify({ repository_ids: repositoryIds }) }
          : {}),
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
    const expiresAt = Date.parse(payload.expires_at);
    if (!Number.isFinite(expiresAt)) {
      throw new Error(
        "github_provider_error status=201 detail=[REDACTED_INVALID_TOKEN_EXPIRY]",
      );
    }
    const shortLivedExpiresAt = Math.min(expiresAt, now().getTime() + 9 * 60_000);
    tokens.set(scope, { expiresAt: shortLivedExpiresAt, token: payload.token });
    return payload.token;
  }

  async function githubRequest(path, init = {}, tokenScope) {
    const installationToken = await requestInstallationToken(tokenScope);
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
    } catch {
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

  async function verifyRepositoryScope(repository) {
    if (
      !repository ||
      !Number.isInteger(repository.restId) ||
      repository.restId <= 0 ||
      typeof repository.name !== "string"
    ) {
      return providerFailure({ status: 404 });
    }
    let page = 1;
    let total = Infinity;
    while ((page - 1) * 100 < total) {
      const { response, payload } = await githubRequest(
        `/installation/repositories?per_page=100&page=${page}`,
      );
      if (!response.ok) return providerResult(response);
      const repositories = Array.isArray(payload.repositories)
        ? payload.repositories
        : [];
      if (
        repositories.some(
          (candidate) =>
            candidate?.id === repository.restId && candidate?.name === repository.name,
        )
      ) {
        return { kind: "succeeded" };
      }
      total = Number.isInteger(payload.total_count) ? payload.total_count : 0;
      if (repositories.length === 0) break;
      page += 1;
    }
    return providerFailure({ status: 404 });
  }

  async function commitConfiguration({ defaultBranch, files, repository }) {
    const scope = await verifyRepositoryScope(repository);
    if (scope.kind !== "succeeded") return scope;
    const configuration = normalizeConfigurationFiles(files);
    if (!configuration || typeof defaultBranch !== "string" || defaultBranch === "") {
      return { kind: "failed", code: "github_configuration_invalid" };
    }
    const tokenScope = { repositoryIds: [repository.restId] };
    const repositoryPath = `/repos/${organization}/${encodeURIComponent(repository.name)}`;
    const reference = await githubRequest(
      `${repositoryPath}/git/ref/heads/${encodeURIComponent(defaultBranch)}`,
      {},
      tokenScope,
    );
    if (!reference.response.ok) return providerResult(reference.response);
    const commitSha = reference.payload?.object?.sha;
    if (typeof commitSha !== "string") {
      return { kind: "failed", code: "github_repository_state_invalid" };
    }
    const commit = await githubRequest(
      `${repositoryPath}/git/commits/${commitSha}`,
      {},
      tokenScope,
    );
    if (!commit.response.ok) return providerResult(commit.response);
    const baseTreeSha = commit.payload?.tree?.sha;
    if (typeof baseTreeSha !== "string") {
      return { kind: "failed", code: "github_repository_state_invalid" };
    }
    const tree = await githubRequest(
      `${repositoryPath}/git/trees/${baseTreeSha}?recursive=1`,
      {},
      tokenScope,
    );
    if (
      !tree.response.ok ||
      tree.payload?.truncated === true ||
      !Array.isArray(tree.payload?.tree)
    ) {
      return tree.response.ok
        ? { kind: "failed", code: "github_repository_tree_unavailable" }
        : providerResult(tree.response);
    }
    const currentBlobs = new Map(
      tree.payload.tree
        .filter((entry) => entry?.type === "blob" && typeof entry.path === "string")
        .map((entry) => [entry.path, entry.sha]),
    );
    const changed = configuration.filter(
      (file) => currentBlobs.get(file.path) !== gitBlobSha(file.content),
    );
    if (changed.length === 0) {
      return { kind: "succeeded", commitSha, treeSha: baseTreeSha };
    }
    const entries = [];
    for (const file of changed) {
      const blob = await githubRequest(
        `${repositoryPath}/git/blobs`,
        {
          body: JSON.stringify({
            content: file.content.toString("base64"),
            encoding: "base64",
          }),
          method: "POST",
        },
        tokenScope,
      );
      if (!blob.response.ok) return providerResult(blob.response);
      if (typeof blob.payload?.sha !== "string") {
        return { kind: "failed", code: "github_repository_state_invalid" };
      }
      entries.push({
        mode: "100644",
        path: file.path,
        sha: blob.payload.sha,
        type: "blob",
      });
    }
    const nextTree = await githubRequest(
      `${repositoryPath}/git/trees`,
      {
        body: JSON.stringify({ base_tree: baseTreeSha, tree: entries }),
        method: "POST",
      },
      tokenScope,
    );
    if (!nextTree.response.ok) return providerResult(nextTree.response);
    if (typeof nextTree.payload?.sha !== "string") {
      return { kind: "failed", code: "github_repository_state_invalid" };
    }
    const nextCommit = await githubRequest(
      `${repositoryPath}/git/commits`,
      {
        body: JSON.stringify({
          message: `Configure instance ${repository.name}`,
          parents: [commitSha],
          tree: nextTree.payload.sha,
        }),
        method: "POST",
      },
      tokenScope,
    );
    if (!nextCommit.response.ok) return providerResult(nextCommit.response);
    if (typeof nextCommit.payload?.sha !== "string") {
      return { kind: "failed", code: "github_repository_state_invalid" };
    }
    const updated = await githubRequest(
      `${repositoryPath}/git/refs/heads/${encodeURIComponent(defaultBranch)}`,
      {
        body: JSON.stringify({ force: false, sha: nextCommit.payload.sha }),
        method: "PATCH",
      },
      tokenScope,
    );
    if (!updated.response.ok) return providerResult(updated.response);
    return {
      kind: "succeeded",
      commitSha: nextCommit.payload.sha,
      treeSha: nextTree.payload.sha,
    };
  }

  async function seedRelease({ defaultBranch, release, repository }) {
    const files = normalizeRelease(release);
    if (!files || typeof defaultBranch !== "string" || defaultBranch === "") {
      return { kind: "failed", code: "github_release_artifact_invalid" };
    }
    const scope = await verifyRepositoryScope(repository);
    if (scope.kind !== "succeeded") return scope;
    const tokenScope = { repositoryIds: [repository.restId] };
    const repositoryPath = `/repos/${organization}/${encodeURIComponent(repository.name)}`;
    const reference = await githubRequest(
      `${repositoryPath}/git/ref/heads/${encodeURIComponent(defaultBranch)}`,
      {},
      tokenScope,
    );
    if (reference.response.ok) {
      const commitSha = reference.payload?.object?.sha;
      if (typeof commitSha !== "string") {
        return { kind: "failed", code: "github_repository_state_invalid" };
      }
      const commit = await githubRequest(
        `${repositoryPath}/git/commits/${commitSha}`,
        {},
        tokenScope,
      );
      if (!commit.response.ok) return providerResult(commit.response);
      const treeSha = commit.payload?.tree?.sha;
      if (typeof treeSha !== "string") {
        return { kind: "failed", code: "github_repository_state_invalid" };
      }
      const tree = await githubRequest(
        `${repositoryPath}/git/trees/${treeSha}?recursive=1`,
        {},
        tokenScope,
      );
      if (
        !tree.response.ok ||
        tree.payload?.truncated === true ||
        !Array.isArray(tree.payload?.tree)
      ) {
        return tree.response.ok
          ? { kind: "failed", code: "github_repository_tree_unavailable" }
          : providerResult(tree.response);
      }
      const manifest = files.find((file) => file.path === "distribution-manifest.json");
      const alreadySeeded = tree.payload.tree.some(
        (entry) =>
          entry?.type === "blob" &&
          entry.path === "distribution-manifest.json" &&
          entry.sha === gitBlobSha(manifest.content),
      );
      if (!alreadySeeded)
        return { kind: "failed", code: "github_repository_seed_conflict" };
      return {
        kind: "succeeded",
        commitSha,
        externalId: String(repository.restId),
        nodeId: repository.externalId,
        releaseTreeSha256: release.treeSha256,
        treeSha,
      };
    }
    if (reference.response.status !== 404) return providerResult(reference.response);

    const entries = [];
    for (const file of files) {
      const blob = await githubRequest(
        `${repositoryPath}/git/blobs`,
        {
          body: JSON.stringify({
            content: file.content.toString("base64"),
            encoding: "base64",
          }),
          method: "POST",
        },
        tokenScope,
      );
      if (!blob.response.ok) return providerResult(blob.response);
      if (typeof blob.payload?.sha !== "string") {
        return { kind: "failed", code: "github_repository_state_invalid" };
      }
      entries.push({
        mode: "100644",
        path: file.path,
        sha: blob.payload.sha,
        type: "blob",
      });
    }
    const tree = await githubRequest(
      `${repositoryPath}/git/trees`,
      { body: JSON.stringify({ tree: entries }), method: "POST" },
      tokenScope,
    );
    if (!tree.response.ok) return providerResult(tree.response);
    if (typeof tree.payload?.sha !== "string") {
      return { kind: "failed", code: "github_repository_state_invalid" };
    }
    const commit = await githubRequest(
      `${repositoryPath}/git/commits`,
      {
        body: JSON.stringify({
          message: `Seed white-label release ${release.treeSha256.slice(0, 12)}`,
          parents: [],
          tree: tree.payload.sha,
        }),
        method: "POST",
      },
      tokenScope,
    );
    if (!commit.response.ok) return providerResult(commit.response);
    if (typeof commit.payload?.sha !== "string") {
      return { kind: "failed", code: "github_repository_state_invalid" };
    }
    const created = await githubRequest(
      `${repositoryPath}/git/refs`,
      {
        body: JSON.stringify({
          ref: `refs/heads/${defaultBranch}`,
          sha: commit.payload.sha,
        }),
        method: "POST",
      },
      tokenScope,
    );
    if (!created.response.ok) return providerResult(created.response);
    const updatedRepository = await githubRequest(
      repositoryPath,
      {
        body: JSON.stringify({ default_branch: defaultBranch, private: true }),
        method: "PATCH",
      },
      tokenScope,
    );
    if (!updatedRepository.response.ok)
      return providerResult(updatedRepository.response);
    return {
      kind: "succeeded",
      commitSha: commit.payload.sha,
      externalId: String(repository.restId),
      nodeId: repository.externalId,
      releaseTreeSha256: release.treeSha256,
      treeSha: tree.payload.sha,
    };
  }

  async function seedRepository({
    defaultBranch = "main",
    idempotencyKey: _idempotencyKey,
    name,
    release,
  }) {
    let repository;
    try {
      repository = await createOrResolveRepository({
        name,
        idempotencyKey: _idempotencyKey,
      });
    } catch {
      return { kind: "failed", code: "github_repository_unconfirmed" };
    }
    if (!repository.restId || !repository.externalId) {
      return { kind: "failed", code: "github_repository_state_invalid" };
    }
    return seedRelease({ defaultBranch, release, repository });
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

  return {
    commitConfiguration,
    createOrResolveRepository,
    resolveRepository,
    seedRepository,
  };
}
