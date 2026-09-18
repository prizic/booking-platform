import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import test from "node:test";

import { createGitHubAppClient } from "./github-app-client.mjs";
import { buildGovernancePolicy } from "./governance.mjs";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" });

function response(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("uses an in-memory installation token and redacts it from errors", async () => {
  const requests = [];
  const client = createGitHubAppClient({
    appId: "123",
    installationId: "456",
    organization: "prizic",
    privateKey: privateKeyPem,
    now: () => new Date("2026-09-18T00:00:00.000Z"),
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), headers: init.headers });
      if (String(url).endsWith("/access_tokens"))
        return response(201, {
          token: "ghs_test_value",
          expires_at: "2026-09-18T00:09:00.000Z",
        });
      return response(500, { message: "Bearer ghs_test_value" });
    },
  });

  await assert.rejects(
    client.resolveRepository({ name: "northside-clinic" }),
    (error) => {
      assert.doesNotMatch(error.message, /ghs_test_value|Bearer/u);
      return true;
    },
  );
  assert.match(requests[1].headers.authorization, /^Bearer /u);
});

test("resolves after a timeout-after-create instead of creating a second repository", async () => {
  let createCalls = 0;
  let lookupCalls = 0;
  const client = createGitHubAppClient({
    appId: "123",
    installationId: "456",
    organization: "prizic",
    privateKey: privateKeyPem,
    now: () => new Date("2026-09-18T00:00:00.000Z"),
    fetchImpl: async (url, init) => {
      const target = String(url);
      if (target.endsWith("/access_tokens"))
        return response(201, {
          token: "ghs_test_value",
          expires_at: "2026-09-18T00:09:00.000Z",
        });
      if (target.endsWith("/repos/prizic/northside-clinic")) {
        lookupCalls += 1;
        return lookupCalls === 1
          ? response(404, { message: "Not Found" })
          : response(200, {
              id: 42,
              node_id: "R_kgDOexisting",
              name: "northside-clinic",
              private: true,
              default_branch: "main",
            });
      }
      if (target.endsWith("/orgs/prizic/repos") && init.method === "POST") {
        createCalls += 1;
        throw new Error("socket timeout after provider accepted request");
      }
      throw new Error(`unexpected request ${target}`);
    },
  });

  const repository = await client.createOrResolveRepository({
    name: "northside-clinic",
    idempotencyKey: "run:seed",
  });
  assert.equal(repository.externalId, "R_kgDOexisting");
  assert.equal(createCalls, 1);
  assert.equal(lookupCalls, 2);
});

test("refuses an out-of-scope repository before a configuration mutation", async () => {
  const requests = [];
  const client = createGitHubAppClient({
    appId: "123",
    installationId: "456",
    organization: "prizic",
    privateKey: privateKeyPem,
    now: () => new Date("2026-09-18T00:00:00.000Z"),
    fetchImpl: async (url, init = {}) => {
      const target = String(url);
      requests.push({ method: init.method ?? "GET", target });
      if (target.endsWith("/access_tokens")) {
        return response(201, {
          token: "ghs_test_value",
          expires_at: "2026-09-18T00:09:00.000Z",
        });
      }
      if (target.endsWith("/installation/repositories?per_page=100&page=1")) {
        return response(200, { total_count: 0, repositories: [] });
      }
      return response(500, { message: "a mutation must not be attempted" });
    },
  });

  const result = await client.commitConfiguration({
    defaultBranch: "main",
    files: [
      {
        content: Buffer.from('{"defaultLocale":"en"}\n'),
        path: "instance/manifest.json",
      },
    ],
    idempotencyKey: "run:configuration",
    repository: { name: "northside-clinic", restId: 42 },
  });

  assert.deepEqual(result, {
    kind: "failed",
    code: "github_scope_or_resource_missing",
  });
  assert.deepEqual(requests, [
    {
      method: "POST",
      target: "https://api.github.com/app/installations/456/access_tokens",
    },
    {
      method: "GET",
      target: "https://api.github.com/installation/repositories?per_page=100&page=1",
    },
  ]);
});

test("fails safely when the App installation was removed before a mutation", async () => {
  const requests = [];
  const client = createGitHubAppClient({
    appId: "123",
    installationId: "456",
    organization: "prizic",
    privateKey: privateKeyPem,
    now: () => new Date("2026-09-18T00:00:00.000Z"),
    fetchImpl: async (url, init = {}) => {
      const target = String(url);
      requests.push({ method: init.method ?? "GET", target });
      if (target.endsWith("/access_tokens")) {
        return response(201, {
          token: "ghs_fixture",
          expires_at: "2026-09-18T00:09:00.000Z",
        });
      }
      if (target.endsWith("/installation/repositories?per_page=100&page=1")) {
        return response(404, { message: "installation not found" });
      }
      throw new Error(`unexpected request ${target}`);
    },
  });

  assert.deepEqual(
    await client.commitConfiguration({
      defaultBranch: "main",
      files: [{ content: Buffer.from("{}\n"), path: "instance/manifest.json" }],
      repository: { externalId: "R_kgDOremoved", name: "removed", restId: 42 },
    }),
    { kind: "failed", code: "github_scope_or_resource_missing" },
  );
  assert.equal(requests.length, 2);
});

test("fails safely when the App lacks repository administration permission", async () => {
  const client = createGitHubAppClient({
    appId: "123",
    installationId: "456",
    organization: "prizic",
    privateKey: privateKeyPem,
    now: () => new Date("2026-09-18T00:00:00.000Z"),
    fetchImpl: async (url) => {
      const target = String(url);
      if (target.endsWith("/access_tokens")) {
        return response(201, {
          token: "ghs_fixture",
          expires_at: "2026-09-18T00:09:00.000Z",
        });
      }
      if (target.endsWith("/installation/repositories?per_page=100&page=1")) {
        return response(403, { message: "resource not accessible" });
      }
      throw new Error(`unexpected request ${target}`);
    },
  });

  assert.deepEqual(
    await client.commitConfiguration({
      defaultBranch: "main",
      files: [{ content: Buffer.from("{}\n"), path: "instance/manifest.json" }],
      repository: { externalId: "R_kgDOfixture", name: "fixture", restId: 42 },
    }),
    { kind: "failed", code: "github_permission_missing" },
  );
});

test("commits changed configuration as one scoped fast-forward update", async () => {
  const calls = [];
  const currentCommit = "1".repeat(40);
  const currentTree = "2".repeat(40);
  const configurationBlob = "3".repeat(40);
  const configuredTree = "4".repeat(40);
  const configuredCommit = "5".repeat(40);
  const configuration = Buffer.from('{"defaultLocale":"en"}\n');
  const client = createGitHubAppClient({
    appId: "123",
    installationId: "456",
    organization: "prizic",
    privateKey: privateKeyPem,
    now: () => new Date("2026-09-18T00:00:00.000Z"),
    fetchImpl: async (url, init = {}) => {
      const target = String(url);
      const body = init.body ? JSON.parse(init.body) : undefined;
      calls.push({ body, method: init.method ?? "GET", target });
      if (target.endsWith("/access_tokens")) {
        return response(201, {
          token: `ghs_${calls.length}`,
          expires_at: "2026-09-18T00:09:00.000Z",
        });
      }
      if (target.endsWith("/installation/repositories?per_page=100&page=1")) {
        return response(200, {
          total_count: 1,
          repositories: [{ id: 42, name: "northside-clinic" }],
        });
      }
      if (target.endsWith("/git/ref/heads/main")) {
        return response(200, { object: { sha: currentCommit } });
      }
      if (target.endsWith(`/git/commits/${currentCommit}`)) {
        return response(200, { tree: { sha: currentTree } });
      }
      if (target.endsWith(`/git/trees/${currentTree}?recursive=1`)) {
        return response(200, { tree: [] });
      }
      if (target.endsWith("/git/blobs")) {
        assert.deepEqual(body, {
          content: configuration.toString("base64"),
          encoding: "base64",
        });
        return response(201, { sha: configurationBlob });
      }
      if (target.endsWith("/git/trees")) {
        assert.deepEqual(body, {
          base_tree: currentTree,
          tree: [
            {
              mode: "100644",
              path: "instance/manifest.json",
              sha: configurationBlob,
              type: "blob",
            },
          ],
        });
        return response(201, { sha: configuredTree });
      }
      if (target.endsWith("/git/commits")) {
        assert.deepEqual(body, {
          message: "Configure instance northside-clinic",
          parents: [currentCommit],
          tree: configuredTree,
        });
        return response(201, { sha: configuredCommit });
      }
      if (target.endsWith("/git/refs/heads/main")) {
        assert.deepEqual(body, { force: false, sha: configuredCommit });
        return response(200, { object: { sha: configuredCommit } });
      }
      throw new Error(`unexpected request ${target}`);
    },
  });

  const result = await client.commitConfiguration({
    defaultBranch: "main",
    files: [{ content: configuration, path: "instance/manifest.json" }],
    idempotencyKey: "run:configuration",
    repository: { name: "northside-clinic", restId: 42 },
  });

  assert.deepEqual(result, {
    kind: "succeeded",
    commitSha: configuredCommit,
    treeSha: configuredTree,
  });
  assert.deepEqual(calls[2], {
    body: { repository_ids: [42] },
    method: "POST",
    target: "https://api.github.com/app/installations/456/access_tokens",
  });
});

test("does not create a duplicate configuration commit when the tree already matches", async () => {
  const calls = [];
  const currentCommit = "6".repeat(40);
  const currentTree = "7".repeat(40);
  const configuration = Buffer.from('{"defaultLocale":"en"}\n');
  const codeowners = Buffer.from("* @prizic/platform-owners\n");
  const configurationBlob = createHash("sha1")
    .update(`blob ${configuration.length}\0`)
    .update(configuration)
    .digest("hex");
  const codeownersBlob = createHash("sha1")
    .update(`blob ${codeowners.length}\0`)
    .update(codeowners)
    .digest("hex");
  const client = createGitHubAppClient({
    appId: "123",
    installationId: "456",
    organization: "prizic",
    privateKey: privateKeyPem,
    now: () => new Date("2026-09-18T00:00:00.000Z"),
    fetchImpl: async (url, init = {}) => {
      const target = String(url);
      calls.push({ method: init.method ?? "GET", target });
      if (target.endsWith("/access_tokens")) {
        return response(201, {
          token: `ghs_${calls.length}`,
          expires_at: "2026-09-18T00:09:00.000Z",
        });
      }
      if (target.endsWith("/installation/repositories?per_page=100&page=1")) {
        return response(200, {
          total_count: 1,
          repositories: [{ id: 42, name: "northside-clinic" }],
        });
      }
      if (target.endsWith("/git/ref/heads/main")) {
        return response(200, { object: { sha: currentCommit } });
      }
      if (target.endsWith(`/git/commits/${currentCommit}`)) {
        return response(200, { tree: { sha: currentTree } });
      }
      if (target.endsWith(`/git/trees/${currentTree}?recursive=1`)) {
        return response(200, {
          tree: [
            {
              path: ".github/CODEOWNERS",
              sha: codeownersBlob,
              type: "blob",
            },
            {
              mode: "100644",
              path: "instance/manifest.json",
              sha: configurationBlob,
              type: "blob",
            },
          ],
        });
      }
      throw new Error(`unexpected mutation ${target}`);
    },
  });

  const result = await client.commitConfiguration({
    defaultBranch: "main",
    files: [
      { content: codeowners, path: ".github/CODEOWNERS" },
      { content: configuration, path: "instance/manifest.json" },
    ],
    idempotencyKey: "run:configuration",
    repository: { name: "northside-clinic", restId: 42 },
  });

  assert.deepEqual(result, {
    kind: "succeeded",
    commitSha: currentCommit,
    treeSha: currentTree,
  });
  assert.equal(
    calls.filter(
      (call) => call.method !== "GET" && !call.target.endsWith("/access_tokens"),
    ).length,
    0,
  );
});

test("seeds a checked distribution release as one initial private branch commit", async () => {
  const calls = [];
  const releaseTreeSha256 = "a".repeat(64);
  const releaseManifest = Buffer.from(`{"treeSha256":"${releaseTreeSha256}"}\n`);
  const release = {
    files: [
      { content: Buffer.from('{"name":"instance"}\n'), path: "package.json" },
      { content: releaseManifest, path: "distribution-manifest.json" },
    ],
    treeSha256: releaseTreeSha256,
  };
  const repository = {
    default_branch: "main",
    id: 42,
    name: "northside-clinic",
    node_id: "R_kgDOinstance",
    private: true,
  };
  const client = createGitHubAppClient({
    appId: "123",
    installationId: "456",
    organization: "prizic",
    privateKey: privateKeyPem,
    now: () => new Date("2026-09-18T00:00:00.000Z"),
    fetchImpl: async (url, init = {}) => {
      const target = String(url);
      calls.push({ method: init.method ?? "GET", target });
      if (target.endsWith("/access_tokens")) {
        return response(201, {
          token: `ghs_${calls.length}`,
          expires_at: "2026-09-18T00:09:00.000Z",
        });
      }
      if (target.endsWith("/repos/prizic/northside-clinic"))
        return response(200, repository);
      if (target.endsWith("/installation/repositories?per_page=100&page=1")) {
        return response(200, {
          total_count: 1,
          repositories: [{ id: 42, name: "northside-clinic" }],
        });
      }
      if (target.endsWith("/git/ref/heads/main"))
        return response(404, { message: "Not Found" });
      if (target.endsWith("/git/blobs"))
        return response(201, { sha: `b${calls.length}`.padEnd(40, "0") });
      if (target.endsWith("/git/trees")) return response(201, { sha: "7".repeat(40) });
      if (target.endsWith("/git/commits")) {
        return response(201, { sha: "8".repeat(40) });
      }
      if (target.endsWith("/git/refs"))
        return response(201, { object: { sha: "8".repeat(40) } });
      throw new Error(`unexpected request ${target}`);
    },
  });

  const result = await client.seedRepository({
    defaultBranch: "main",
    idempotencyKey: "run:seed",
    name: "northside-clinic",
    release,
  });

  assert.deepEqual(result, {
    kind: "succeeded",
    externalId: "R_kgDOinstance",
    defaultBranch: "main",
    installationId: "456",
    name: "northside-clinic",
    organization: "prizic",
    private: true,
    restId: 42,
    releaseTreeSha256,
    commitSha: "8".repeat(40),
    treeSha: "7".repeat(40),
  });
  assert.equal(calls.filter((call) => call.target.endsWith("/git/blobs")).length, 2);
  assert.equal(calls.filter((call) => call.target.endsWith("/git/commits")).length, 1);
});

test("treats a release already present on the default branch as the seed retry result", async () => {
  const calls = [];
  const releaseTreeSha256 = "a".repeat(64);
  const releaseManifest = Buffer.from(`{"treeSha256":"${releaseTreeSha256}"}\n`);
  const release = {
    files: [
      { content: Buffer.from('{"name":"instance"}\n'), path: "package.json" },
      { content: releaseManifest, path: "distribution-manifest.json" },
    ],
    treeSha256: releaseTreeSha256,
  };
  const currentCommit = "9".repeat(40);
  const currentTree = "a".repeat(40);
  const client = createGitHubAppClient({
    appId: "123",
    installationId: "456",
    organization: "prizic",
    privateKey: privateKeyPem,
    now: () => new Date("2026-09-18T00:00:00.000Z"),
    fetchImpl: async (url, init = {}) => {
      const target = String(url);
      calls.push({ method: init.method ?? "GET", target });
      if (target.endsWith("/access_tokens")) {
        return response(201, {
          token: `ghs_${calls.length}`,
          expires_at: "2026-09-18T00:09:00.000Z",
        });
      }
      if (target.endsWith("/repos/prizic/northside-clinic")) {
        return response(200, {
          default_branch: "main",
          id: 42,
          name: "northside-clinic",
          node_id: "R_kgDOinstance",
          private: true,
        });
      }
      if (target.endsWith("/installation/repositories?per_page=100&page=1")) {
        return response(200, {
          total_count: 1,
          repositories: [{ id: 42, name: "northside-clinic" }],
        });
      }
      if (target.endsWith("/git/ref/heads/main")) {
        return response(200, { object: { sha: currentCommit } });
      }
      if (target.endsWith(`/git/commits/${currentCommit}`)) {
        return response(200, { tree: { sha: currentTree } });
      }
      if (target.endsWith(`/git/trees/${currentTree}?recursive=1`)) {
        return response(200, {
          tree: [
            {
              path: "distribution-manifest.json",
              sha: createHash("sha1")
                .update(`blob ${releaseManifest.length}\0`)
                .update(releaseManifest)
                .digest("hex"),
              type: "blob",
            },
          ],
        });
      }
      throw new Error(`unexpected mutation ${target}`);
    },
  });

  const result = await client.seedRepository({
    defaultBranch: "main",
    idempotencyKey: "run:seed",
    name: "northside-clinic",
    release,
  });

  assert.deepEqual(result, {
    kind: "succeeded",
    externalId: "R_kgDOinstance",
    defaultBranch: "main",
    installationId: "456",
    name: "northside-clinic",
    organization: "prizic",
    private: true,
    restId: 42,
    releaseTreeSha256,
    commitSha: currentCommit,
    treeSha: currentTree,
  });
  assert.equal(
    calls.filter(
      (call) => call.method !== "GET" && !call.target.endsWith("/access_tokens"),
    ).length,
    0,
  );
});

test("applies the named ruleset and repository security policy with a scoped token", async () => {
  const calls = [];
  const client = createGitHubAppClient({
    appId: "123",
    installationId: "456",
    organization: "prizic",
    privateKey: privateKeyPem,
    now: () => new Date("2026-09-18T00:00:00.000Z"),
    fetchImpl: async (url, init = {}) => {
      const target = String(url);
      const body = init.body ? JSON.parse(init.body) : undefined;
      calls.push({ body, method: init.method ?? "GET", target });
      if (target.endsWith("/access_tokens")) {
        return response(201, {
          token: `ghs_${calls.length}`,
          expires_at: "2026-09-18T00:09:00.000Z",
        });
      }
      if (target.endsWith("/installation/repositories?per_page=100&page=1")) {
        return response(200, {
          total_count: 1,
          repositories: [{ id: 42, name: "renamed-instance" }],
        });
      }
      if (target.endsWith("/contents/.github/CODEOWNERS?ref=main")) {
        return response(200, { type: "file" });
      }
      if (target.endsWith("/rulesets") && (init.method ?? "GET") === "GET")
        return response(200, []);
      if (target.endsWith("/rulesets") && init.method === "POST") {
        assert.equal(body.name, "wlbp-instance-governance");
        assert.deepEqual(body.conditions.ref_name.include, ["~DEFAULT_BRANCH"]);
        return response(201, { id: 99 });
      }
      if (
        target.endsWith("/repos/prizic/renamed-instance") &&
        init.method === "PATCH"
      ) {
        assert.deepEqual(body, {
          private: true,
          security_and_analysis: {
            advanced_security: { status: "enabled" },
            secret_scanning: { status: "enabled" },
            secret_scanning_push_protection: { status: "enabled" },
          },
        });
        return response(200, { id: 42 });
      }
      if (target.endsWith("/vulnerability-alerts") && init.method === "PUT") {
        return new Response(null, { status: 204 });
      }
      if (target.endsWith("/automated-security-fixes") && init.method === "PUT") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected request ${target}`);
    },
  });

  const result = await client.applyGovernance({
    defaultBranch: "main",
    repository: {
      externalId: "R_kgDOinstance",
      name: "renamed-instance",
      restId: 42,
    },
    requiredChecks: ["Instance CI"],
  });

  assert.deepEqual(result, {
    defaultBranch: "main",
    externalId: "R_kgDOinstance",
    installationId: "456",
    kind: "succeeded",
    name: "renamed-instance",
    organization: "prizic",
    private: true,
    restId: 42,
    rulesetId: "99",
  });
  assert.deepEqual(calls[2], {
    body: { repository_ids: [42] },
    method: "POST",
    target: "https://api.github.com/app/installations/456/access_tokens",
  });
});

test("waits visibly when governance is rate-limited after scope validation", async () => {
  const client = createGitHubAppClient({
    appId: "123",
    installationId: "456",
    organization: "prizic",
    privateKey: privateKeyPem,
    now: () => new Date("2026-09-18T00:00:00.000Z"),
    fetchImpl: async (url) => {
      const target = String(url);
      if (target.endsWith("/access_tokens")) {
        return response(201, {
          token: "ghs_fixture",
          expires_at: "2026-09-18T00:09:00.000Z",
        });
      }
      if (target.endsWith("/installation/repositories?per_page=100&page=1")) {
        return response(200, {
          total_count: 1,
          repositories: [{ id: 42, name: "northside" }],
        });
      }
      if (target.endsWith("/contents/.github/CODEOWNERS?ref=main")) {
        return response(429, { message: "slow down" }, { "retry-after": "30" });
      }
      throw new Error(`unexpected request ${target}`);
    },
  });

  assert.deepEqual(
    await client.applyGovernance({
      defaultBranch: "main",
      repository: { externalId: "R_kgDOnorthside", name: "northside", restId: 42 },
      requiredChecks: ["Instance CI"],
    }),
    { kind: "waiting", reason: "provider_rate_limit", retryAfterSeconds: 30 },
  );
});

test("does not create a second ruleset when a retry finds the desired one", async () => {
  const calls = [];
  const policy = buildGovernancePolicy({
    defaultBranch: "main",
    requiredChecks: ["Instance CI"],
  });
  const client = createGitHubAppClient({
    appId: "123",
    installationId: "456",
    organization: "prizic",
    privateKey: privateKeyPem,
    now: () => new Date("2026-09-18T00:00:00.000Z"),
    fetchImpl: async (url, init = {}) => {
      const target = String(url);
      calls.push({ method: init.method ?? "GET", target });
      if (target.endsWith("/access_tokens")) {
        return response(201, {
          token: `ghs_${calls.length}`,
          expires_at: "2026-09-18T00:09:00.000Z",
        });
      }
      if (target.endsWith("/installation/repositories?per_page=100&page=1")) {
        return response(200, {
          total_count: 1,
          repositories: [{ id: 42, name: "northside" }],
        });
      }
      if (target.endsWith("/contents/.github/CODEOWNERS?ref=main")) {
        return response(200, { type: "file" });
      }
      if (target.endsWith("/rulesets") && (init.method ?? "GET") === "GET") {
        return response(200, [{ id: 99, ...policy.ruleset }]);
      }
      if (target.endsWith("/repos/prizic/northside") && init.method === "PATCH") {
        return response(200, { id: 42 });
      }
      if (
        target.endsWith("/vulnerability-alerts") ||
        target.endsWith("/automated-security-fixes")
      ) {
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected request ${target}`);
    },
  });

  const result = await client.applyGovernance({
    defaultBranch: "main",
    repository: { externalId: "R_kgDOnorthside", name: "northside", restId: 42 },
    requiredChecks: ["Instance CI"],
  });

  assert.equal(result.rulesetId, "99");
  assert.equal(
    calls.filter(
      (call) =>
        call.target.includes("/rulesets") && ["POST", "PUT"].includes(call.method),
    ).length,
    0,
  );
});
