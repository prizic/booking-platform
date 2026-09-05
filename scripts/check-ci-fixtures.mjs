import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  expectedDistribution,
  failCheck,
  pathExists,
  readJson,
  repositoryRoot,
} from "./workspace.mjs";

const errors = [];
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "wlbp-distribution-fixture-"));

try {
  const ignoredNames = new Set([
    ".next",
    ".next-warm",
    ".turbo",
    "coverage",
    "dist",
    "node_modules",
  ]);
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
  await mkdir(instanceRoot, { recursive: true });
  for (const [memberPath, distribution] of expectedDistribution) {
    if (distribution !== "distributed") continue;
    const destination = path.join(instanceRoot, memberPath);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(repositoryRoot, memberPath), destination, {
      recursive: true,
      filter,
    });
  }
  for (const relativeFile of [
    ".dependency-cruiser.cjs",
    "eslint.config.mjs",
    "package.json",
    "platform-contract.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.base.json",
    "turbo.json",
  ]) {
    await cp(
      path.join(repositoryRoot, relativeFile),
      path.join(instanceRoot, relativeFile),
    );
  }
  await mkdir(path.join(instanceRoot, "scripts"), { recursive: true });
  for (const script of [
    "check-boundaries.mjs",
    "check-config.mjs",
    "check-lockfile.mjs",
    "workspace.mjs",
  ]) {
    await cp(
      path.join(repositoryRoot, "scripts", script),
      path.join(instanceRoot, "scripts", script),
    );
  }
  await cp(
    path.join(repositoryRoot, "instance-template", "instance"),
    path.join(instanceRoot, "instance"),
    { recursive: true },
  );
  const contract = await readJson(path.join(instanceRoot, "platform-contract.json"));
  const manifestTemplatePath = path.join(
    instanceRoot,
    "instance",
    "manifest.template.json",
  );
  const manifestTemplate = await readJson(manifestTemplatePath);
  await writeFile(
    path.join(instanceRoot, "instance", "manifest.json"),
    `${JSON.stringify({ ...manifestTemplate, ...contract }, null, 2)}\n`,
    "utf8",
  );
  await rm(manifestTemplatePath);
  const instanceTestingPath = path.join(instanceRoot, "packages", "testing");
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
  const prunedLockfile = spawnSync(
    "pnpm",
    [
      "install",
      "--lockfile-only",
      "--offline",
      "--no-frozen-lockfile",
      "--ignore-scripts",
    ],
    { cwd: instanceRoot, encoding: "utf8" },
  );
  if (prunedLockfile.status !== 0) {
    errors.push(
      `sanitized instance lockfile could not be derived from the distributed workspace: ${[
        prunedLockfile.stdout,
        prunedLockfile.stderr,
      ]
        .filter((value) => value.trim() !== "")
        .join("\n")
        .trim()}`,
    );
  }

  const fixtureInstall = spawnSync(
    "pnpm",
    ["install", "--offline", "--frozen-lockfile", "--ignore-scripts"],
    { cwd: instanceRoot, encoding: "utf8" },
  );
  if (fixtureInstall.status !== 0) {
    errors.push(
      `valid sanitized instance could not install from the frozen local store: ${[
        fixtureInstall.stdout,
        fixtureInstall.stderr,
      ]
        .filter((value) => value.trim() !== "")
        .join("\n")
        .trim()}`,
    );
  }

  for (const command of [
    ["check:lockfile"],
    ["check:config"],
    ["lint"],
    ["test:unit"],
  ]) {
    const result = spawnSync("pnpm", command, {
      cwd: instanceRoot,
      encoding: "utf8",
    });
    if (result.status !== 0) {
      const output = [result.stdout, result.stderr]
        .filter((value) => value.trim() !== "")
        .join("\n")
        .trim();
      errors.push(
        `valid sanitized instance failed pnpm ${command.join(" ")}: ${output}`,
      );
    }
  }

  const clientManifestPath = path.join(instanceRoot, "apps", "client", "package.json");
  const validClientManifest = await readFile(clientManifestPath, "utf8");
  const invalidClientManifest = JSON.parse(validClientManifest);
  invalidClientManifest.dependencies = {
    ...invalidClientManifest.dependencies,
    "@wlbp/email": "1.0.0",
  };
  await writeFile(
    clientManifestPath,
    `${JSON.stringify(invalidClientManifest, null, 2)}\n`,
    "utf8",
  );
  const absentPlatformImportPath = path.join(
    instanceRoot,
    "apps",
    "client",
    "app",
    "__absent_platform_fixture.ts",
  );
  await writeFile(absentPlatformImportPath, 'import "@wlbp/email";\n', "utf8");
  const absentPlatformBoundary = spawnSync("node", ["scripts/check-boundaries.mjs"], {
    cwd: instanceRoot,
    encoding: "utf8",
  });
  if (
    absentPlatformBoundary.status === 0 ||
    !absentPlatformBoundary.stderr.includes("absent platform-only package") ||
    !absentPlatformBoundary.stderr.includes("@wlbp/email")
  ) {
    errors.push(
      "generated instance boundary fixture accepted a dependency or import on an absent platform-only package",
    );
  }
  await Promise.all([
    writeFile(clientManifestPath, validClientManifest, "utf8"),
    rm(absentPlatformImportPath),
  ]);

  const forbiddenMemberPath = path.join(instanceRoot, "packages", "email");
  await cp(path.join(repositoryRoot, "packages", "email"), forbiddenMemberPath, {
    recursive: true,
    filter,
  });
  const forbiddenBoundary = spawnSync("node", ["scripts/check-boundaries.mjs"], {
    cwd: instanceRoot,
    encoding: "utf8",
  });
  if (
    forbiddenBoundary.status === 0 ||
    !forbiddenBoundary.stderr.includes("packages/email")
  ) {
    errors.push(
      "generated instance boundary fixture did not reject a platform-only workspace member",
    );
  }
  await rm(forbiddenMemberPath, { recursive: true, force: true });

  const unclassifiedMemberPath = path.join(
    instanceRoot,
    "packages",
    "unclassified-fixture",
  );
  await mkdir(unclassifiedMemberPath, { recursive: true });
  await writeFile(
    path.join(unclassifiedMemberPath, "package.json"),
    `${JSON.stringify(
      {
        name: "@wlbp/unclassified-fixture",
        version: "0.0.0",
        private: true,
        wlbp: { distribution: "distributed" },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  const unclassifiedBoundary = spawnSync("node", ["scripts/check-boundaries.mjs"], {
    cwd: instanceRoot,
    encoding: "utf8",
  });
  if (
    unclassifiedBoundary.status === 0 ||
    !unclassifiedBoundary.stderr.includes("is not classified by ADR-0011")
  ) {
    errors.push(
      "generated instance boundary fixture accepted an ADR-unclassified member",
    );
  }
  await rm(unclassifiedMemberPath, { recursive: true, force: true });

  const manifestPath = path.join(instanceRoot, "instance", "manifest.json");
  const validManifest = await readFile(manifestPath, "utf8");
  const reorderedManifest = JSON.parse(validManifest);
  reorderedManifest.backendContract = {
    max: reorderedManifest.backendContract.max,
    min: reorderedManifest.backendContract.min,
  };
  await writeFile(
    manifestPath,
    `${JSON.stringify(reorderedManifest, null, 2)}\n`,
    "utf8",
  );
  const reorderedManifestResult = spawnSync("pnpm", ["check:config"], {
    cwd: instanceRoot,
    encoding: "utf8",
  });
  if (reorderedManifestResult.status !== 0) {
    errors.push(
      `generated instance config fixture rejected order-independent backendContract JSON: ${(reorderedManifestResult.stderr || reorderedManifestResult.stdout).trim()}`,
    );
  }
  await writeFile(manifestPath, validManifest, "utf8");

  const invalidManifest = JSON.parse(validManifest);
  invalidManifest.unexpected = true;
  await writeFile(
    manifestPath,
    `${JSON.stringify(invalidManifest, null, 2)}\n`,
    "utf8",
  );
  const invalidManifestResult = spawnSync("pnpm", ["check:config"], {
    cwd: instanceRoot,
    encoding: "utf8",
  });
  if (
    invalidManifestResult.status === 0 ||
    !invalidManifestResult.stderr.includes(
      "generated instance manifest keys must be exactly",
    )
  ) {
    errors.push("generated instance config fixture accepted manifest shape drift");
  }
  await writeFile(manifestPath, validManifest, "utf8");

  const wrongManifestPath = path.join(
    instanceRoot,
    "instance",
    "manifest.template.json",
  );
  await rename(manifestPath, wrongManifestPath);
  const wrongManifestResult = spawnSync("pnpm", ["check:config"], {
    cwd: instanceRoot,
    encoding: "utf8",
  });
  if (
    wrongManifestResult.status === 0 ||
    !wrongManifestResult.stderr.includes("must use manifest.json")
  ) {
    errors.push(
      "generated instance config fixture accepted the template manifest name",
    );
  }
  await rename(wrongManifestPath, manifestPath);

  const brandPath = path.join(instanceRoot, "instance", "brand.json");
  const validBrand = await readFile(brandPath, "utf8");
  const invalidBrand = JSON.parse(validBrand);
  invalidBrand.name = "";
  await writeFile(brandPath, `${JSON.stringify(invalidBrand, null, 2)}\n`, "utf8");
  const invalidBrandResult = spawnSync("pnpm", ["check:config"], {
    cwd: instanceRoot,
    encoding: "utf8",
  });
  if (
    invalidBrandResult.status === 0 ||
    !invalidBrandResult.stderr.includes("brand.json must contain a non-empty name")
  ) {
    errors.push("generated instance config fixture accepted an invalid brand");
  }
  await writeFile(brandPath, validBrand, "utf8");

  const themePath = path.join(instanceRoot, "instance", "theme.css");
  const validTheme = await readFile(themePath, "utf8");
  await writeFile(themePath, `${validTheme}\nbutton { display: none; }\n`, "utf8");
  const invalidThemeResult = spawnSync("pnpm", ["check:config"], {
    cwd: instanceRoot,
    encoding: "utf8",
  });
  if (
    invalidThemeResult.status === 0 ||
    !invalidThemeResult.stderr.includes("unsupported selector button")
  ) {
    errors.push("generated instance config fixture accepted an invalid theme");
  }
  await writeFile(themePath, validTheme, "utf8");

  const instanceConfigurationPath = path.join(instanceRoot, "instance");
  const hiddenConfigurationPath = path.join(instanceRoot, "instance.missing");
  await rename(instanceConfigurationPath, hiddenConfigurationPath);
  const missingConfigResult = spawnSync("pnpm", ["check:config"], {
    cwd: instanceRoot,
    encoding: "utf8",
  });
  if (missingConfigResult.status === 0) {
    errors.push("generated instance config fixture silently skipped missing config");
  }
  await rename(hiddenConfigurationPath, instanceConfigurationPath);

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
      path.join(instanceRoot, "node_modules", ".bin", "playwright"),
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
