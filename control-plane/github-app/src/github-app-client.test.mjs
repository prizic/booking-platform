import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
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
