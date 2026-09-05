import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { failCheck, pathExists, readJson, repositoryRoot } from "./workspace.mjs";

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

  const cleanDistribution = spawnSync("node", ["scripts/check-distribution.mjs"], {
    cwd: fixtureRoot,
    encoding: "utf8",
  });
  if (
    cleanDistribution.status !== 0 ||
    !cleanDistribution.stdout.includes("packages/testing")
  ) {
    errors.push(
      "clean distribution fixture did not include the ADR-allowlisted testing package",
    );
  }

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

  const instanceRoot = path.join(fixtureRoot, "generated-instance");
  const instanceTestingPath = path.join(instanceRoot, "packages", "testing");
  await mkdir(path.dirname(instanceTestingPath), { recursive: true });
  await cp(path.join(repositoryRoot, "packages", "testing"), instanceTestingPath, {
    recursive: true,
    filter,
  });
  const testingManifest = await readJson(
    path.join(instanceTestingPath, "package.json"),
  );
  for (const dependency of ["@axe-core/playwright", "@playwright/test"]) {
    if (typeof testingManifest.devDependencies?.[dependency] !== "string") {
      errors.push(`distributed testing package must declare ${dependency}`);
    }
  }
  for (const shippedPath of [
    "instance-tests",
    "playwright.instance.config.mjs",
    "tsconfig.instance-tests.json",
  ]) {
    if (!testingManifest.files?.includes(shippedPath)) {
      errors.push(`distributed testing package files must include ${shippedPath}`);
    }
  }
  await symlink(
    path.join(repositoryRoot, "node_modules"),
    path.join(instanceRoot, "node_modules"),
  );

  const instanceConfigPath = path.join(
    instanceTestingPath,
    "playwright.instance.config.mjs",
  );
  if (!(await pathExists(instanceConfigPath))) {
    errors.push(
      "distributed testing package is missing its instance Playwright config",
    );
  } else {
    const imported = await import(pathToFileURL(instanceConfigPath).href);
    const config = imported.default;
    const webServers = Array.isArray(config?.webServer)
      ? config.webServer
      : [config?.webServer].filter(Boolean);
    const commands = webServers.map((server) => server.command).sort();
    const expectedCommands = [
      "pnpm --filter @wlbp/client exec next dev --hostname 127.0.0.1 --port 41730",
      "pnpm --filter @wlbp/dashboard exec next dev --hostname 127.0.0.1 --port 41731",
    ];
    if (JSON.stringify(commands) !== JSON.stringify(expectedCommands)) {
      errors.push(
        `instance Playwright config must start only Client and Dashboard; found ${commands.join(", ")}`,
      );
    }

    const projectNames = (config?.projects ?? []).map((project) => project.name).sort();
    const expectedProjects = ["a11y", "component", "e2e", "i18n", "visual"];
    if (JSON.stringify(projectNames) !== JSON.stringify(expectedProjects)) {
      errors.push(
        `instance Playwright projects must be ${expectedProjects.join(", ")}; found ${projectNames.join(", ")}`,
      );
    }

    const listResult = spawnSync(
      path.join(repositoryRoot, "node_modules", ".bin", "playwright"),
      ["test", "--config", instanceConfigPath, "--list"],
      { cwd: instanceRoot, encoding: "utf8" },
    );
    if (listResult.status !== 0) {
      errors.push(
        `distributed instance browser tests could not be listed without source tests/**: ${listResult.stderr.trim()}`,
      );
    } else {
      for (const projectName of expectedProjects) {
        if (!listResult.stdout.includes(`[${projectName}]`)) {
          errors.push(
            `distributed instance browser project has no tests: ${projectName}`,
          );
        }
      }
    }
  }
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}

failCheck("CI and distribution fixtures fail closed", errors);
