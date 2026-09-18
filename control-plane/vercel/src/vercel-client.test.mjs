import assert from "node:assert/strict";
import test from "node:test";

import { createVercelClient } from "./vercel-client.mjs";

function response(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("redacts the bearer token from a provider error", async () => {
  const client = createVercelClient({
    accessToken: "vercel_test_token",
    organization: "prizic",
    teamId: "team_katana",
    fetchImpl: async () => response(500, { error: "Bearer vercel_test_token" }),
  });

  await assert.rejects(client.resolveProject({ name: "northside-client" }), (error) => {
    assert.doesNotMatch(error.message, /vercel_test_token/u);
    return true;
  });
});

test("resolves an existing project instead of creating a second one", async () => {
  const calls = [];
  let createCalls = 0;
  const client = createVercelClient({
    accessToken: "token",
    organization: "prizic",
    teamId: "team_katana",
    fetchImpl: async (url, init) => {
      calls.push(String(url));
      const target = String(url);
      if (target.includes("/v9/projects/northside-client")) {
        return response(200, { id: "prj_client", name: "northside-client" });
      }
      if (target.includes("/v11/projects") && init.method === "POST") {
        createCalls += 1;
        return response(200, {
          id: "prj_should_not_be_created",
          name: "northside-client",
        });
      }
      throw new Error(`unexpected request ${target}`);
    },
  });

  const project = await client.createOrResolveProject({
    name: "northside-client",
    rootDirectory: "apps/client",
    repositoryName: "northside",
  });
  assert.deepEqual(project, { id: "prj_client", name: "northside-client" });
  assert.equal(createCalls, 0);
});

test("creates a project when none exists yet", async () => {
  let createCalls = 0;
  const client = createVercelClient({
    accessToken: "token",
    organization: "prizic",
    teamId: "team_katana",
    fetchImpl: async (url, init) => {
      const target = String(url);
      if (target.includes("/v9/projects/northside-client")) return response(404, {});
      if (target.includes("/v11/projects") && init.method === "POST") {
        createCalls += 1;
        const body = JSON.parse(init.body);
        assert.equal(body.gitRepository.repo, "prizic/northside");
        return response(200, { id: "prj_new", name: "northside-client" });
      }
      throw new Error(`unexpected request ${target}`);
    },
  });

  const project = await client.createOrResolveProject({
    name: "northside-client",
    rootDirectory: "apps/client",
    repositoryName: "northside",
  });
  assert.deepEqual(project, { id: "prj_new", name: "northside-client" });
  assert.equal(createCalls, 1);
});

test("reports a DNS-pending domain as a durable wait, not a failure", async () => {
  const client = createVercelClient({
    accessToken: "token",
    organization: "prizic",
    teamId: "team_katana",
    fetchImpl: async (url) => {
      const target = String(url);
      if (target.includes("/domains") && !target.includes("/config")) {
        return response(200, { name: "book.example.com" });
      }
      if (target.includes("/v6/domains/book.example.com/config")) {
        return response(200, { misconfigured: true });
      }
      throw new Error(`unexpected request ${target}`);
    },
  });

  const result = await client.verifyDomains({
    domains: { client: ["book.example.com"], dashboard: [] },
    projects: { clientProjectId: "prj_client", dashboardProjectId: "prj_dashboard" },
  });
  assert.deepEqual(result, {
    kind: "waiting",
    reason: "customer_dns",
    retryAfterSeconds: 60,
  });
});

test("succeeds once every domain is attached and correctly configured", async () => {
  const client = createVercelClient({
    accessToken: "token",
    organization: "prizic",
    teamId: "team_katana",
    fetchImpl: async (url) => {
      const target = String(url);
      if (target.includes("/domains") && !target.includes("/config")) {
        return response(200, { name: "book.example.com" });
      }
      if (target.includes("/config")) return response(200, { misconfigured: false });
      throw new Error(`unexpected request ${target}`);
    },
  });

  const result = await client.verifyDomains({
    domains: { client: ["book.example.com"], dashboard: ["admin.example.com"] },
    projects: { clientProjectId: "prj_client", dashboardProjectId: "prj_dashboard" },
  });
  assert.deepEqual(result, {
    kind: "succeeded",
    externalId: "prj_client",
    clientDomains: ["book.example.com"],
    dashboardDomains: ["admin.example.com"],
  });
});
