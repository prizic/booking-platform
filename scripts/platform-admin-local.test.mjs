import assert from "node:assert/strict";
import { test } from "node:test";
import {
  apiPort,
  assertCampaignName,
  assertCampaignPortProfile,
  assertIsolatedConfig,
  dbPort,
  inspectorPort,
  isolateConfig,
  parseIsolatedStatus,
  portPrefix,
  projectId,
} from "./platform-admin-local.mjs";

const sample = `project_id = "white-label-booking-platform"
[api]
port = 54321
[db]
port = 54322
shadow_port = 54320
[inbucket]
port = 54324
[edge_runtime]
inspector_port = 8083
`;

test("isolates project id and every 543xx port", () => {
  const out = isolateConfig(sample);
  assert.match(out, new RegExp(`project_id = "${projectId}"`));
  assert.doesNotMatch(out, /543\d\d/u);
  assert.match(out, new RegExp(`port = ${apiPort}`, "u"));
  assert.match(out, new RegExp(`shadow_port = ${portPrefix}20`, "u"));
  assert.match(out, new RegExp(`inspector_port = ${inspectorPort}`, "u"));
});

test("disables analytics so it cannot collide with other stacks", () => {
  assert.match(isolateConfig(sample), /\[analytics\]\nenabled = false/u);
  const withSection = sample + "[analytics]\nenabled = true\nport = 54327\n";
  const out = isolateConfig(withSection);
  assert.match(out, /\[analytics\]\nenabled = false/u);
  assert.equal(out.match(/\[analytics\]/gu).length, 1);
});

test("refuses a config that is not this repository's", () => {
  assert.throws(() => isolateConfig('project_id = "maslak_dashboard"'), /unexpected/u);
});

test("reads the isolated stack's status and refuses any other port", () => {
  const ok = `API_URL="http://127.0.0.1:${apiPort}"\nDB_URL="postgresql://postgres:postgres@127.0.0.1:${dbPort}/postgres"\nANON_KEY="a"\nPUBLISHABLE_KEY="p"\nSERVICE_ROLE_KEY="s"\n`;
  assert.deepEqual(parseIsolatedStatus(ok), {
    apiUrl: `http://127.0.0.1:${apiPort}`,
    dbUrl: `postgresql://postgres:postgres@127.0.0.1:${dbPort}/postgres`,
    anonKey: "a",
    publishableKey: "p",
    serviceRoleKey: "s",
  });
  assert.throws(
    () => parseIsolatedStatus(ok.replace(apiPort, "54321")),
    /not the isolated/u,
  );
});

// A wrong workdir is the one thing that can reset a stack somebody is using, so
// the guard checks the project id AND this profile's ports.
test("refuses a workdir that is another project or another port block", () => {
  const own = isolateConfig(sample);
  assert.doesNotThrow(() => assertIsolatedConfig(own));
  assert.throws(
    () => assertIsolatedConfig(own.replace(projectId, "dashboard-completion-20261005")),
    (error) =>
      /refusing/u.test(error.message) && error.message.includes(`is not ${projectId}`),
  );
  assert.throws(
    () => assertIsolatedConfig(own.replace(apiPort, "55321")),
    (error) => /refusing/u.test(error.message) && error.message.includes(apiPort),
  );
  assert.throws(
    () => assertIsolatedConfig(own.replace(dbPort, "55322")),
    (error) => /refusing/u.test(error.message) && error.message.includes(dbPort),
  );
});

test("a campaign name must be a lowercase slug before it becomes a project id", () => {
  assert.doesNotThrow(() => assertCampaignName(""));
  assert.doesNotThrow(() => assertCampaignName("monorepo-hardening"));
  for (const bad of [
    "../evil",
    "Foo Bar",
    "has space",
    "has/slash",
    "UPPER",
    "a".repeat(40),
    "-leading",
    "trailing-",
  ])
    assert.throws(() => assertCampaignName(bad), /lowercase slug/u);
});

test("a campaign profile refuses retained port blocks and out-of-range inspectors", () => {
  assert.doesNotThrow(() => assertCampaignPortProfile("577", "8095", true));
  assert.doesNotThrow(() => assertCampaignPortProfile("565", "8093", false));
  for (const prefix of ["543", "553", "565"])
    assert.throws(
      () => assertCampaignPortProfile(prefix, "8095", true),
      /retained stack/u,
    );
  assert.throws(
    () => assertCampaignPortProfile("577", "8093", true),
    /retained stack/u,
  );
  assert.throws(
    () => assertCampaignPortProfile("57", "8095", true),
    /exactly three digits/u,
  );
  assert.throws(() => assertCampaignPortProfile("577", "80", true), /valid port/u);
  assert.throws(() => assertCampaignPortProfile("577", "999999", true), /valid port/u);
});
// A fresh verification campaign runs this same helper with a different project
// and a different port block. Both guards have to follow it: one that still
// validated 56521/56522 could read another stack's credentials, and one that
// reset on the project id alone could still reset a workdir pointed elsewhere.
test("a campaign profile moves the project id and the whole port block", () => {
  const out = isolateConfig(sample, "577", "8095");
  assert.match(out, /port = 57721/u);
  assert.match(out, /port = 57722/u);
  assert.match(out, /shadow_port = 57720/u);
  assert.match(out, /inspector_port = 8095/u);
  assert.doesNotMatch(out, /5(?:53|65)\d\d/u);
  assert.throws(
    () =>
      parseIsolatedStatus(
        `API_URL="http://127.0.0.1:56521"\nDB_URL="postgresql://postgres:postgres@127.0.0.1:56522/postgres"\nANON_KEY="a"\nPUBLISHABLE_KEY="p"\nSERVICE_ROLE_KEY="s"\n`,
        "577",
      ),
    /not the isolated/u,
  );
  const campaignStatus = `API_URL="http://127.0.0.1:57721"\nDB_URL="postgresql://postgres:postgres@127.0.0.1:57722/postgres"\nANON_KEY="a"\nPUBLISHABLE_KEY="p"\nSERVICE_ROLE_KEY="s"\n`;
  assert.equal(
    parseIsolatedStatus(campaignStatus, "577").apiUrl,
    "http://127.0.0.1:57721",
  );
});

import {
  isPlatformAdminCwd,
  platformAdminEnvironment,
} from "./platform-admin-local.mjs";
import path from "node:path";
import { root } from "./platform-admin-local.mjs";

test("injects the isolated stack as process environment", () => {
  const env = platformAdminEnvironment(
    {
      apiUrl: "http://127.0.0.1:56521",
      publishableKey: "p",
      anonKey: "a",
      dbUrl: "x",
      serviceRoleKey: "s",
    },
    "3002",
  );
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, "http://127.0.0.1:56521");
  assert.equal(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "p");
  assert.equal(env.PLATFORM_ADMIN_PORT, "3002");
  assert.ok(!Object.values(env).includes("s"), "the service key never reaches the app");
});

test("only this repository's Platform Admin may be replaced", () => {
  assert.equal(isPlatformAdminCwd(path.join(root, "apps/platform-admin")), true);
  assert.equal(isPlatformAdminCwd(path.join(root, "apps/dashboard")), false);
  assert.equal(isPlatformAdminCwd("/somewhere/else/apps/platform-admin"), false);
});

test("rejects remote hosts, malformed endpoints and missing credentials", () => {
  const valid =
    'API_URL="http://127.0.0.1:56521"\nDB_URL="postgresql://postgres:postgres@127.0.0.1:56522/postgres"\nANON_KEY="a"\nPUBLISHABLE_KEY="p"\nSERVICE_ROLE_KEY="s"\n';
  for (const altered of [
    valid.replace("127.0.0.1:56521", "example.com:56521"),
    valid.replace("postgres@127.0.0.1", "postgres@example.com"),
    valid.replace("http://", "https://"),
    valid.replace('PUBLISHABLE_KEY="p"', ""),
    valid.replace('API_URL="http://127.0.0.1:56521"', 'API_URL="malformed"'),
  ])
    assert.throws(() => parseIsolatedStatus(altered), /not the isolated/u);
});

test("concurrent local and browser servers have distinct build directories", () => {
  const backend = { apiUrl: "http://127.0.0.1:56521", publishableKey: "p" };
  assert.equal(
    platformAdminEnvironment(backend, "3002").PLATFORM_ADMIN_DIST_DIR,
    ".next-platform-admin-local",
  );
  assert.equal(
    platformAdminEnvironment(backend, "41742").PLATFORM_ADMIN_DIST_DIR,
    ".next-platform-admin-41742",
  );
});

test("does not pass inherited worker credentials to the app process", async () => {
  const { platformAdminChildEnvironment } = await import("./platform-admin-local.mjs");
  const backend = { apiUrl: "http://127.0.0.1:56521", publishableKey: "p" };
  const child = platformAdminChildEnvironment(backend, "3002", {
    PATH: "/local/bin",
    SUPABASE_SERVICE_ROLE_KEY: "privileged",
    VERCEL_API_TOKEN: "provider",
    DB_URL: "database",
  });
  assert.equal(child.PATH, "/local/bin");
  assert.equal(child.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "p");
  assert.equal(child.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(child.VERCEL_API_TOKEN, undefined);
  assert.equal(child.DB_URL, undefined);
});

test("enables isolated Realtime for the full authorization gate", () => {
  const without = isolateConfig(sample);
  assert.match(without, /\[realtime\]\nenabled = true/u);
  const existing = isolateConfig(sample + "[realtime]\nenabled = false\n");
  assert.match(existing, /\[realtime\]\nenabled = true/u);
  assert.equal(existing.match(/\[realtime\]/gu).length, 1);
});

test("handles comments before the isolated Realtime enabled setting", () => {
  const text = isolateConfig(
    sample +
      "[realtime]\n# Base project keeps this off.\nenabled = false\n[storage]\nenabled = true\n",
  );
  const section = text.split("[realtime]\n")[1].split("[storage]")[0];
  assert.equal(section.match(/^enabled =/gmu).length, 1);
  assert.match(section, /^enabled = true$/mu);
});

test("demo code selects only a known operator in this project", async () => {
  const { demoCodeForOperator } = await import("./platform-admin-local.mjs");
  const credentials = {
    project: projectId,
    operators: { admin: { totpSecret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" } },
  };
  assert.equal(demoCodeForOperator(credentials, "admin", 59), "287082");
  assert.throws(
    () => demoCodeForOperator(credentials, "unknown", 59),
    /unknown demo operator/u,
  );
  assert.throws(
    () => demoCodeForOperator(credentials, undefined, 59),
    /unknown demo operator/u,
  );
  assert.throws(
    () => demoCodeForOperator({ ...credentials, project: "other" }, "admin", 59),
    /wrong demo project/u,
  );
  assert.throws(
    () => demoCodeForOperator(credentials, "viewer", 59),
    /credential unavailable/u,
  );
});
