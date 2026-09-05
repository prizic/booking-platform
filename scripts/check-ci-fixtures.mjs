import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

import { failCheck, repositoryRoot } from "./workspace.mjs";

const errors = [];
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wlbp-distribution-fixture-"));

try {
  const ignoredNames = new Set([".next", ".turbo", "coverage", "dist", "node_modules"]);
  const filter = (source) => !ignoredNames.has(path.basename(source));

  await Promise.all([
    cp(path.join(repositoryRoot, "apps"), path.join(fixtureRoot, "apps"), {
      recursive: true,
      filter,
    }),
    cp(path.join(repositoryRoot, "packages"), path.join(fixtureRoot, "packages"), {
      recursive: true,
      filter,
    }),
    cp(
      path.join(repositoryRoot, "scripts", "check-distribution.mjs"),
      path.join(fixtureRoot, "scripts", "check-distribution.mjs"),
      { recursive: false },
    ),
    cp(
      path.join(repositoryRoot, "scripts", "workspace.mjs"),
      path.join(fixtureRoot, "scripts", "workspace.mjs"),
      { recursive: false },
    ),
  ]);

  const injectedPath = path.join(
    fixtureRoot,
    "apps",
    "client",
    "app",
    "__forbidden_distribution_fixture.ts",
  );
  await writeFile(injectedPath, 'import "@wlbp/supabase-admin";\n', "utf8");

  const result = spawnSync("node", ["scripts/check-distribution.mjs"], {
    cwd: fixtureRoot,
    encoding: "utf8",
  });
  if (result.status === 0) {
    errors.push("forbidden distribution fixture was incorrectly accepted");
  }
  if (
    !result.stderr.includes("private symbol") ||
    !result.stderr.includes("__forbidden_distribution_fixture.ts")
  ) {
    errors.push(
      "forbidden distribution fixture did not fail with a safe actionable path",
    );
  }
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}

failCheck("forbidden distribution fixture fails closed", errors);
