import assert from "node:assert/strict";
import { test } from "node:test";

import { pruneLockfile, resolveExportSet, scanSource } from "./build-distribution.mjs";

test("the export set is the allowlist, and its closure holds", async () => {
  const { exported, violations } = await resolveExportSet();

  // A dependency closure leak is a release that must not happen, so it is an
  // error rather than a warning.
  assert.deepEqual(violations, []);
  assert.ok(exported.includes("apps/client"));
  assert.ok(exported.includes("apps/dashboard"));

  // The four platform-only members are absent by classification, not by being
  // filtered out afterwards.
  for (const platformOnly of [
    "apps/platform-admin",
    "packages/supabase-admin",
    "packages/email",
    "packages/integrations",
  ]) {
    assert.ok(
      !exported.includes(platformOnly),
      `${platformOnly} must never be in the export set`,
    );
  }
});

test("the scan refuses what must never ship", () => {
  const cases = [
    ['import { x } from "@wlbp/supabase-admin";', "platform-only workspace package"],
    ['import "../../apps/platform-admin/thing";', "Platform Admin source"],
    ['readFile("control-plane/contracts/x.mjs")', "control-plane path"],
    ["select * from control_plane.operators", "control-plane schema"],
    ["const k = process.env.SUPABASE_SERVICE_ROLE_KEY;", "privileged Supabase key"],
    ["const k = process.env.STRIPE_SECRET_KEY;", "Stripe server credential"],
    ["const k = process.env.RESEND_API_KEY;", "email provider credential"],
    ["const k = process.env.GITHUB_APP_PRIVATE_KEY;", "GitHub credential"],
    ["const k = process.env.VERCEL_API_TOKEN;", "Vercel credential"],
    [`const k = "sk_${"live"}_abcdef";`, "literal secret"],
    [`const k = "ghp_${"a".repeat(12)}";`, "literal secret"],
    // Assembled at runtime so this test file does not itself contain a
    // secret-shaped literal, which the repository's own secret scan refuses.
    [["-----BEGIN", " RSA PRIVATE KEY-----"].join(""), "literal secret"],
  ];
  for (const [source, label] of cases) {
    const findings = scanSource("apps/client/x.ts", source);
    assert.ok(
      findings.some((finding) => finding.startsWith(label)),
      `${label} should be refused, got ${JSON.stringify(findings)}`,
    );
  }
});

test("the scan leaves ordinary source alone", () => {
  assert.deepEqual(
    scanSource("apps/client/page.tsx", 'import { Button } from "@wlbp/ui-foundation";'),
    [],
  );
});

test("pruning the lockfile removes exactly the private importers", () => {
  const source = [
    "lockfileVersion: '9.0'",
    "",
    "importers:",
    "",
    "  .:",
    "    devDependencies:",
    "      typescript: 5.0.0",
    "",
    "  apps/client:",
    "    dependencies:",
    "      next: 16.0.0",
    "",
    "  apps/platform-admin:",
    "    dependencies:",
    "      next: 16.0.0",
    "",
    "  packages/supabase-admin:",
    "    dependencies:",
    "      x: 1.0.0",
    "",
    "packages:",
    "",
    "  next@16.0.0:",
    "    resolution: {integrity: sha512-x}",
    "",
  ].join("\n");

  const pruned = pruneLockfile(source, ["apps/client"]);

  assert.ok(pruned.includes("  apps/client:"), "a distributed importer is kept");
  assert.ok(pruned.includes("  .:"), "the workspace root is kept");
  assert.ok(
    !pruned.includes("apps/platform-admin"),
    "a platform-only importer is removed, so the private package list does not ship",
  );
  assert.ok(!pruned.includes("packages/supabase-admin"));
  // Spare resolved packages are tolerated; removing them would mean
  // re-resolving the graph, which is a different job.
  assert.ok(pruned.includes("packages:"), "the resolved package section survives");
  assert.ok(pruned.includes("  next@16.0.0:"));
  assert.ok(pruned.includes("lockfileVersion"), "the header survives");
});

test("pruning is a no-op when every importer is distributed", () => {
  const source = ["importers:", "", "  .:", "    x: 1", "", "packages:", ""].join("\n");
  assert.equal(pruneLockfile(source, []), source);
});
