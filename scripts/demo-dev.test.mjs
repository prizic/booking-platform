import test from "node:test";
import assert from "node:assert/strict";
import { assertNode22, demoConfig, demoAppEnvironment } from "./demo-dev.mjs";
import { campaignOutputDirectory } from "./platform-admin-local.mjs";
import { demoOutputDirectory } from "./demo-local.mjs";
test("demo launcher requires the pinned Node family without changing globals", () => {
  for (const version of ["22.13.0", "22.14.0", "22.99.0"])
    assert.doesNotThrow(() => assertNode22(version));
  for (const version of ["22.12.0", "23.0.0", "26.0.0", "20.19.0"])
    assert.throws(() => assertNode22(version));
});
test("demo config isolates project and ports, never refers to retained profiles", () => {
  const text =
    'project_id = "white-label-booking-platform"\n[api]\nport = 54321\n[db]\nport = 54322\nshadow_port = 54320\n[edge_runtime]\ninspector_port = 8083\n[analytics]\nenabled = true\n';
  const result = demoConfig(text);
  assert.match(result, /booking-demo-dev-20261013/u);
  assert.match(result, /58921/u);
  assert.match(result, /58922/u);
  assert.match(result, /8293/u);
  assert.match(result, /enabled = false/u);
  assert.doesNotMatch(result, /54321|54322|platform-admin/u);
  assert.throws(() => demoConfig('project_id = "unrelated"'));
});
test("Client and Dashboard receive matching public connection and hostname only", () => {
  const local = {
    apiUrl: "http://127.0.0.1:58921",
    publishableKey: "synthetic-public-value",
  };
  const inherited = {
    LOCAL_TENANT_HOST: "wrong-host",
    NEXT_PUBLIC_SUPABASE_URL: "wrong-url",
    SUPABASE_SERVICE_ROLE_KEY: "must-not-inherit",
    DASHBOARD_COMPLETION_CREDENTIAL_FILE: "must-not-inherit",
  };
  for (const app of ["client", "dashboard"]) {
    const env = demoAppEnvironment(local, app, 3010, inherited);
    assert.equal(env.LOCAL_TENANT_HOST, `${app}.arabic-demo.example.invalid`);
    assert.equal(env.NEXT_PUBLIC_SITE_URL, "http://localhost:3010");
    assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, local.apiUrl);
    assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, undefined);
    assert.equal(env.DASHBOARD_COMPLETION_CREDENTIAL_FILE, undefined);
  }
});
test("new campaigns may select a separate artifact directory, never retained profiles", () => {
  assert.match(
    campaignOutputDirectory(".artifacts/booking-journey"),
    /booking-journey$/u,
  );
  for (const value of [
    "/tmp/unrelated",
    ".artifacts/platform-admin",
    ".artifacts/platform-admin/nested",
    ".artifacts/dashboard-completion",
    ".artifacts/../apps/client",
  ])
    assert.throws(() => campaignOutputDirectory(value));
});

test("named demo credentials preserve the legacy demo output and reject external paths", () => {
  assert.notEqual(demoOutputDirectory(".artifacts/demo-dev"), demoOutputDirectory());
  assert.match(demoOutputDirectory(), /\.artifacts\/demo$/u);
  assert.throws(() => demoOutputDirectory("/tmp/unrelated"));
});
