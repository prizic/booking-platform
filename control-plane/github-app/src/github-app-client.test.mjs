import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import test from "node:test";

import { createGitHubAppClient } from "./github-app-client.mjs";

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
  const configurationBlob = createHash("sha1")
    .update(`blob ${configuration.length}\0`)
    .update(configuration)
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
    files: [{ content: configuration, path: "instance/manifest.json" }],
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
    externalId: "42",
    nodeId: "R_kgDOinstance",
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
    externalId: "42",
    nodeId: "R_kgDOinstance",
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
